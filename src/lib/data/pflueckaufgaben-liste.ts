import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
  demoAufgaben,
  zeileAusDb,
  ZEILEN_SPALTEN,
  type AufgabeZeile,
} from "@/lib/data/pflueckaufgaben";
import { istUuid } from "@/lib/utils";
import {
  PRO_SEITE,
  faelligkeitZaehltBei,
  passtZuStatus,
  passtZuUebrigemFilter,
  statusFilter,
  vergleicheAufgaben,
  type AufgabenFilter,
  type StatusFilter,
} from "@/lib/domain/pflueckaufgaben-liste";
import { seitenModell } from "@/lib/listen/seiten";

// Die Liste der Pflueckaufgaben: gefiltert, sortiert, geblaettert (WMCNL-2488).
// Vorher lud die Seite jede Aufgabe ohne Grenze - UX-Audit Punkt 3, mit den
// Testdaten schon rund 117 Zeilen, in einer echten Saison mehr.

export interface AufgabenSeite {
  quelle: Datenquelle;
  zeilen: AufgabeZeile[];
  /** Treffer der aktiven Status-Pille. */
  gesamt: number;
  seite: number;
  seiten: number;
  /** Treffer je Status-Pille, unter den uebrigen Filtern. */
  zaehler: Record<StatusFilter, number>;
}

function leereZaehler(): Record<StatusFilter, number> {
  return Object.fromEntries(statusFilter.map((wert) => [wert, 0])) as Record<StatusFilter, number>;
}

/** Dieselbe Logik im Speicher, fuer den Demo-Modus und den Rueckfall bei Datenbankfehlern. */
export function demoSeite(
  filter: AufgabenFilter,
  seite: number,
  jetzt: Date,
  quelle: Datenquelle,
  aufgaben: readonly AufgabeZeile[] = demoAufgaben(),
): AufgabenSeite {
  const passend = aufgaben.filter((aufgabe) => passtZuUebrigemFilter(aufgabe, filter));
  const zaehler = leereZaehler();
  for (const wert of statusFilter) {
    zaehler[wert] = passend.filter((aufgabe) => passtZuStatus(aufgabe, wert, jetzt)).length;
  }
  const gefiltert = passend
    .filter((aufgabe) => passtZuStatus(aufgabe, filter.status, jetzt))
    .sort(vergleicheAufgaben);
  const modell = seitenModell(gefiltert.length, seite, PRO_SEITE);
  return {
    quelle,
    zeilen: gefiltert.slice(modell.von, modell.bis + 1),
    gesamt: gefiltert.length,
    seite: modell.seite,
    seiten: modell.seiten,
    zaehler,
  };
}

// In Suchtext und PostgREST-Muster wird das Leerzeichen zum Platzhalter:
// "T-N 01" findet "T-N-A-01" - dieselbe Regel wie suchMuster() im
// Demo-Modus. Der Text ist schon bereinigt (suchtextBereinigen), Komma und
// Klammern kommen darin nicht mehr vor.
function sqlMuster(suche: string): string {
  return `%${suche.replace(/ /g, "%")}%`;
}
function postgrestMuster(suche: string): string {
  return `*${suche.replace(/ /g, "*")}*`;
}

export async function ladeAufgabenSeite(
  filter: AufgabenFilter,
  seite: number,
  jetzt: Date = new Date(),
): Promise<AufgabenSeite> {
  if (!isSupabaseConfigured()) return demoSeite(filter, seite, jetzt, "demo");

  const leer: AufgabenSeite = {
    quelle: "db",
    zeilen: [],
    gesamt: 0,
    seite: 1,
    seiten: 1,
    zaehler: leereZaehler(),
  };
  // Eine Brigade-Kennung, die keine UUID ist, kann nichts treffen - und
  // brachte Postgres mit 22P02 zum Abbruch.
  if (
    (filter.brigade.art === "eine" || filter.brigade.art === "eigeneUndOhne") &&
    !istUuid(filter.brigade.id)
  ) {
    return leer;
  }

  const supabase = await createClient();

  // Reihenblock und Sorte stehen in eigenen Tabellen, und PostgREST kann nicht
  // ueber eine eingebettete Tabelle hinweg ODER-verknuepfen. Deshalb werden
  // deren Treffer vorab als IDs aufgeloest und im or() der Aufgabe verwendet.
  let suchTeile: string[] | null = null;
  if (filter.suche) {
    const [bloecke, sorten] = await Promise.all([
      supabase.from("reihenbloecke").select("id").ilike("code", sqlMuster(filter.suche)).limit(100),
      supabase.from("sorten").select("id").ilike("name", sqlMuster(filter.suche)).limit(100),
    ]);
    if (bloecke.error || sorten.error) {
      console.error(
        "[damicon] Suche in Pflueckaufgaben fehlgeschlagen:",
        (bloecke.error ?? sorten.error)?.message,
      );
      return demoSeite(filter, seite, jetzt, "fehler");
    }
    suchTeile = [`code.ilike.${postgrestMuster(filter.suche)}`];
    const blockIds = (bloecke.data ?? []).map((zeile) => zeile.id);
    const sortenIds = (sorten.data ?? []).map((zeile) => zeile.id);
    if (blockIds.length) suchTeile.push(`reihenblock_id.in.(${blockIds.join(",")})`);
    if (sortenIds.length) suchTeile.push(`sorte_id.in.(${sortenIds.join(",")})`);
  }

  // Alles ausser dem Status. Mehrere or() in einer Abfrage verknuepft
  // PostgREST mit UND - Suche und Brigade schliessen sich also nicht aus.
  const abfrage = (nurZaehlen: boolean) => {
    let q = supabase
      .from("pflueckaufgaben")
      .select(ZEILEN_SPALTEN, { count: nurZaehlen ? "exact" : undefined, head: nurZaehlen });
    if (suchTeile) q = q.or(suchTeile.join(","));
    switch (filter.brigade.art) {
      case "ohne":
        q = q.is("brigade_id", null);
        break;
      case "eine":
        q = q.eq("brigade_id", filter.brigade.id);
        break;
      case "eigeneUndOhne":
        q = q.or(`brigade_id.eq.${filter.brigade.id},brigade_id.is.null`);
        break;
    }
    if (filter.grenzen.ab) q = q.gte("faelligkeit", filter.grenzen.ab);
    if (filter.grenzen.vor) q = q.lt("faelligkeit", filter.grenzen.vor);
    return q;
  };

  // Was eine Pille umfasst, steht nur hier - Zaehler und Seite benutzen
  // dieselbe Regel, so wie passtZuStatus() im Demo-Modus.
  const jetztIso = jetzt.toISOString();
  const mitStatus = (q: ReturnType<typeof abfrage>, status: StatusFilter) => {
    switch (status) {
      case "alle":
        return q;
      case "zu-erledigen":
        return q.neq("status", "abgeschlossen");
      case "ueberfaellig":
        return q.in("status", [...faelligkeitZaehltBei]).lt("faelligkeit", jetztIso);
      case "belegpruefung":
        return q.eq("status", "beleg_pruefung");
      case "abgeschlossen":
        return q.eq("status", "abgeschlossen");
    }
  };

  const zaehlungen = await Promise.all(statusFilter.map((wert) => mitStatus(abfrage(true), wert)));
  const zaehlFehler = zaehlungen.find((ergebnis) => ergebnis.error)?.error;
  if (zaehlFehler) {
    console.error("[damicon] Pflueckaufgaben nicht zaehlbar:", zaehlFehler.message);
    return demoSeite(filter, seite, jetzt, "fehler");
  }
  const zaehler = leereZaehler();
  statusFilter.forEach((wert, index) => {
    zaehler[wert] = zaehlungen[index].count ?? 0;
  });
  const gesamt = zaehler[filter.status];
  const modell = seitenModell(gesamt, seite, PRO_SEITE);

  // Dieselbe Reihenfolge wie vergleicheAufgaben() im Demo-Modus.
  const { data, error } = await mitStatus(abfrage(false), filter.status)
    .order("faelligkeit", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id")
    .range(modell.von, modell.bis);

  if (error || !data) {
    if (error) console.error("[damicon] Pflueckaufgaben nicht ladbar:", error.message);
    return demoSeite(filter, seite, jetzt, "fehler");
  }

  // Die Zahl der Belege je Aufgabe der Seite, in einer Abfrage. media_belege
  // ist nur fuer Rollen lesbar, die Fotos sehen duerfen (haerten.sql) - fuer
  // alle anderen bleibt die Zahl 0, wie vorher auch.
  const ids = data.map((zeile) => zeile.id);
  const belegAnzahl = new Map<string, number>();
  if (ids.length > 0) {
    const { data: belege, error: belegFehler } = await supabase
      .from("media_belege")
      .select("pflueckaufgabe_id")
      .in("pflueckaufgabe_id", ids);
    if (belegFehler) console.error("[damicon] Belege nicht zaehlbar:", belegFehler.message);
    for (const beleg of belege ?? []) {
      if (!beleg.pflueckaufgabe_id) continue;
      belegAnzahl.set(beleg.pflueckaufgabe_id, (belegAnzahl.get(beleg.pflueckaufgabe_id) ?? 0) + 1);
    }
  }

  return {
    quelle: "db",
    zeilen: data.map((zeile) => zeileAusDb(zeile, belegAnzahl.get(zeile.id) ?? 0)),
    gesamt,
    seite: modell.seite,
    seiten: modell.seiten,
    zaehler,
  };
}
