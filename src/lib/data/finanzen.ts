import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
  demoB2bKundeOptionen,
  demoChargeOptionen,
  demoDeckungsbeitrag,
  demoDeckungsbeitragJeCharge,
  demoKostentraegerOptionen,
  demoLedgerEintraege,
  demoReihenblockOptionen,
  demoSorteOptionen,
  monatsListe,
  zeitraumGrenzen,
  type B2bKundeOption,
  type ChargeOption,
  type DeckungsbeitragChargeZeile,
  type DeckungsbeitragZeile,
  type KostentraegerOption,
  type LedgerEintrag,
  type LedgerTyp,
  type ReihenblockOption,
  type SorteOption,
  type Zeitraum,
  type ZeitraumGrenzen,
} from "@/lib/domain/finanzen";
import { einsAus } from "@/lib/data/util";

// Finanzen/Kostentraeger (Anforderung 4.2, P0). Wie bei ladeLohnUebersicht():
// die Deckungsbeitrag-Rechnung steht in der Datenbank (View
// public.deckungsbeitrag_je_kostentraeger, Migration 20260909000000), diese
// Datei liest nur das Ergebnis. RLS entscheidet, was sichtbar ist - siehe
// dieselbe Migration fuer die Schreibrechte.
//
// Gefiltert wird immer. Vor dem Umbau der Finanzseite holte diese Funktion
// alle Kostentraeger ohne Begrenzung und die letzten 100 Buchungen - bei
// ueber 250 Kostentraegern eine Tabelle, durch die niemand mehr scrollte, und
// bei den Buchungen ein Abschnitt ohne Weg zu den aelteren. Beides entscheidet
// jetzt der Aufrufer ueber Zeitraum und Zeilenzahl.

/** Eine Zeile aus public.finanz_summe() - die Funktion gibt genau eine. */
type FinanzSummeZeile = {
  erloes_tenge: number;
  kosten_tenge: number;
  buchungen: number;
};

export interface FinanzenFilter {
  zeitraum: Zeitraum;
  /** Nur fuer die Buchungsliste. Kostentraeger und Chargen kennen keinen Typ. */
  typ?: LedgerTyp;
  /** Wie viele Zeilen je Tabelle sichtbar sein sollen. */
  zeilen: number;
}

export interface FinanzenUebersicht {
  quelle: Datenquelle;
  deckungsbeitrag: DeckungsbeitragZeile[];
  // Anforderung 3.3: nur die Chargen, denen mindestens eine Buchung direkt
  // (statt nur ueber den Kostentraeger) zugeordnet wurde.
  deckungsbeitragJeCharge: DeckungsbeitragChargeZeile[];
  ledger: LedgerEintrag[];
  /**
   * Liegt hinter den gezeigten Zeilen noch etwas? Beantwortet wird das ohne
   * eigene count-Abfrage: geholt wird eine Zeile mehr als angezeigt wird.
   */
  mehr: { deckungsbeitrag: boolean; charge: boolean; ledger: boolean };
  /**
   * Die Zahlen der Kennzahlenkacheln. Sie duerfen NICHT aus deckungsbeitrag
   * gerechnet werden: das ist die auf zeilen gekuerzte Liste, eine Summe
   * darueber zaehlte nur die sichtbaren zehn Kostentraeger.
   *
   * zeitraum traegt die grosse Zahl, gesamt die Hilfszeile darunter. Beide
   * kommen aus derselben Abfrage ueber zwei Zahlenspalten.
   */
  summe: {
    zeitraum: { erloesTenge: number; kostenTenge: number };
    gesamt: { erloesTenge: number; kostenTenge: number };
  };
  /** Monate mit Buchungen, absteigend, "JJJJ-MM". Traegt die Monatsliste. */
  monate: string[];
}

// Erloese und Kosten aus Journalzeilen. Bewusst NICHT aus
// deckungsbeitrag_je_kostentraeger: die View summiert alle Buchungen eines
// Kostentraegers ueber dessen ganze Laufzeit und laesst sich nur nach
// Erntetag eingrenzen - als Monatszahl waere das eine andere Groesse als auf
// der Uebersichtsseite. Beide Seiten rechnen jetzt dasselbe. In der Datenbank
// macht das public.finanz_summe(), hier steht nur der Demo-Weg.
function ledgerSummen(zeilen: { typ: LedgerTyp; betragTenge: number }[]) {
  let erloesTenge = 0;
  let kostenTenge = 0;
  for (const z of zeilen) {
    if (z.typ === "erloes") erloesTenge += z.betragTenge;
    else kostenTenge += z.betragTenge;
  }
  return { erloesTenge, kostenTenge };
}

// Ein Datum ohne Wert faellt nicht durch den Filter: Zukauf-Kostentraeger
// haben keinen Erntetag, und wer nach einem Monat filtert, soll sie trotzdem
// sehen statt sie stillschweigend zu verlieren.
function imZeitraum(datum: string | null, grenzen: ZeitraumGrenzen): boolean {
  if (datum === null) return true;
  if (grenzen.von !== null && datum < grenzen.von) return false;
  if (grenzen.bis !== null && datum > grenzen.bis) return false;
  return true;
}

function demoUebersicht(quelle: Datenquelle, filter: FinanzenFilter): FinanzenUebersicht {
  // Im Demo-Betrieb wird derselbe Filter angewandt wie an der Datenbank, nur
  // im Speicher. Sonst verhielte sich die Oberflaeche ohne Supabase anders als
  // mit, und genau das laesst sich beim Pruefen nicht auseinanderhalten.
  const grenzen = zeitraumGrenzen(filter.zeitraum);
  const db = demoDeckungsbeitrag.filter((z) => imZeitraum(z.erntetag, grenzen));
  const charge = demoDeckungsbeitragJeCharge.filter((z) => imZeitraum(z.ernteDatum, grenzen));
  const ledger = demoLedgerEintraege
    .filter((l) => imZeitraum(l.buchungsdatum, grenzen))
    .filter((l) => (filter.typ ? l.typ === filter.typ : true));
  const aeltesteBuchung = demoLedgerEintraege.reduce<string | null>(
    (aeltest, l) => (aeltest === null || l.buchungsdatum < aeltest ? l.buchungsdatum : aeltest),
    null,
  );

  return {
    quelle,
    deckungsbeitrag: db.slice(0, filter.zeilen),
    deckungsbeitragJeCharge: charge.slice(0, filter.zeilen),
    ledger: ledger.slice(0, filter.zeilen),
    mehr: {
      deckungsbeitrag: db.length > filter.zeilen,
      charge: charge.length > filter.zeilen,
      ledger: ledger.length > filter.zeilen,
    },
    // Die Kacheln haengen am Zeitraum, nicht am Typ: die Typ-Pille filtert die
    // Tabelle darunter. Waere sie hier mit drin, stuende bei "nur Kosten" eine
    // Null als Erloes des Monats.
    summe: {
      zeitraum: ledgerSummen(
        demoLedgerEintraege.filter((l) => imZeitraum(l.buchungsdatum, grenzen)),
      ),
      gesamt: ledgerSummen(demoLedgerEintraege),
    },
    monate: monatsListe(aeltesteBuchung),
  };
}

export async function ladeFinanzenUebersicht(
  filter: FinanzenFilter,
): Promise<FinanzenUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht("demo", filter);

  const supabase = await createClient();
  const grenzen: ZeitraumGrenzen = zeitraumGrenzen(filter.zeitraum);

  // Eine Zeile mehr holen als angezeigt wird. Damit steht fest, ob es Nachschub
  // gibt, ohne eine zweite Abfrage mit count.
  const holen = filter.zeilen + 1;

  let dbAbfrage = supabase
    .from("deckungsbeitrag_je_kostentraeger")
    .select("*")
    .order("erntetag", { ascending: false, nullsFirst: false });

  let chargeAbfrage = supabase
    .from("deckungsbeitrag_je_charge")
    .select("*")
    .order("ernte_datum", { ascending: false, nullsFirst: false });

  let ledgerAbfrage = supabase
    .from("finance_ledger_entries")
    .select(
      "id, typ, kategorie, betrag_tenge, buchungsdatum, beschreibung, kostentraeger ( bezeichnung )",
    )
    .order("buchungsdatum", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(holen);

  // Die Zeilen ohne Datum muessen mit durch, deshalb or() statt gte/lte -
  // siehe imZeitraum() oben, die Begruendung gilt hier genauso. Bei "alles"
  // stehen beide Grenzen auf null, dann wird gar nicht eingeschraenkt.
  if (grenzen.von !== null && grenzen.bis !== null) {
    const von = grenzen.von;
    const bis = grenzen.bis;
    const spanne = (spalte: string) =>
      [spalte, ".is.null,and(", spalte, ".gte.", von, ",", spalte, ".lte.", bis, ")"].join("");
    dbAbfrage = dbAbfrage.or(spanne("erntetag"));
    chargeAbfrage = chargeAbfrage.or(spanne("ernte_datum"));
    ledgerAbfrage = ledgerAbfrage.gte("buchungsdatum", von).lte("buchungsdatum", bis);
  }
  if (filter.typ) ledgerAbfrage = ledgerAbfrage.eq("typ", filter.typ);
  dbAbfrage = dbAbfrage.limit(holen);
  chargeAbfrage = chargeAbfrage.limit(holen);

  const [
    { data: dbRows, error: dbFehler },
    { data: chargeRows, error: chargeFehler },
    { data: ledgerRows, error: ledgerFehler },
    summeZeitraum,
    summeGesamt,
    aelteste,
  ] = await Promise.all([
    dbAbfrage,
    chargeAbfrage,
    ledgerAbfrage,
    // Die Zahlen der Kennzahlenkacheln, beide aus derselben Funktion. Sie
    // summiert in der Datenbank und gibt eine Zeile zurueck - ein Client, der
    // alle Buchungen holt und selbst addiert, bekaeme ab der tausendsten
    // stillschweigend eine falsche Summe (max_rows in config.toml).
    //
    // Ohne Typ: die Typ-Pille filtert die Tabelle darunter. Waere sie hier mit
    // drin, stuende bei "nur Kosten" eine Null als Erloes des Monats.
    supabase.rpc("finanz_summe", {
      von: grenzen.von ?? undefined,
      bis: grenzen.bis ?? undefined,
    }),
    supabase.rpc("finanz_summe", {}),
    // Aelteste Buchung fuer die Monatsliste im Filter. Eine Zeile, ueber
    // idx_ledger_datum.
    supabase
      .from("finance_ledger_entries")
      .select("buchungsdatum")
      .order("buchungsdatum", { ascending: true })
      .limit(1),
  ]);

  // Die Summenabfrage zaehlt mit: Ohne sie stuenden auf den Kennzahlenkacheln
  // Nullen, und zwar ohne jedes Anzeichen, dass etwas fehlt. Genau das ist am
  // 22.09.2026 auf der produktiven Instanz passiert - die Seite war schon
  // ausgerollt, die Migration mit finanz_summe() noch nicht, und die Kacheln
  // meldeten "Live-Daten" ueber drei Nullen. Eine falsche Zahl ist schlimmer
  // als eine sichtbar fehlende.
  if (dbFehler || chargeFehler || ledgerFehler || summeZeitraum.error || summeGesamt.error) {
    return demoUebersicht("fehler", filter);
  }

  // Der View-Typgenerator kann kostentraeger_id/bezeichnung nicht als NOT NULL
  // erkennen, obwohl sie es in der Basistabelle sind - die GROUP-BY-
  // Konstruktion der View kann keine Zeile ohne Kostentraeger liefern. Der
  // Fallback ist reine Typsicherheit, kein erwarteter Fall.
  const deckungsbeitragAlle: DeckungsbeitragZeile[] = (dbRows ?? [])
    .filter((r) => r.kostentraeger_id !== null && r.bezeichnung !== null)
    .map((r) => ({
      kostentraegerId: r.kostentraeger_id as string,
      bezeichnung: r.bezeichnung as string,
      erntetag: r.erntetag,
      reihenblockCode: r.reihenblock_code,
      sorteName: r.sorte_name,
      b2bKundeName: r.b2b_kunde_name,
      erloesTenge: Number(r.erloes_tenge),
      kostenTenge: Number(r.kosten_tenge),
      deckungsbeitragTenge: Number(r.deckungsbeitrag_tenge),
      buchungen: Number(r.buchungen),
      mengeKg: r.menge_kg === null ? null : Number(r.menge_kg),
      deckungsbeitragJeKgTenge:
        r.deckungsbeitrag_je_kg_tenge === null ? null : Number(r.deckungsbeitrag_je_kg_tenge),
    }));

  // Wie beim Kostentraeger-View oben: der Typgenerator kann charge_id/
  // charge_code nicht als NOT NULL erkennen, obwohl der INNER JOIN der View
  // keine Zeile ohne Charge liefern kann.
  const chargeAlle: DeckungsbeitragChargeZeile[] = (chargeRows ?? [])
    .filter((r) => r.charge_id !== null && r.charge_code !== null)
    .map((r) => ({
      chargeId: r.charge_id as string,
      chargeCode: r.charge_code as string,
      ernteDatum: r.ernte_datum,
      reihenblockCode: r.reihenblock_code,
      sorteName: r.sorte_name,
      mengeKg: r.menge_kg === null ? null : Number(r.menge_kg),
      erloesTenge: Number(r.erloes_tenge),
      kostenTenge: Number(r.kosten_tenge),
      deckungsbeitragTenge: Number(r.deckungsbeitrag_tenge),
      deckungsbeitragJeKgTenge:
        r.deckungsbeitrag_je_kg_tenge === null ? null : Number(r.deckungsbeitrag_je_kg_tenge),
      buchungen: Number(r.buchungen),
    }));

  const ledgerAlle: LedgerEintrag[] = (ledgerRows ?? []).map((l) => ({
    id: l.id,
    kostentraegerBezeichnung: einsAus(l.kostentraeger)?.bezeichnung ?? "-",
    typ: l.typ,
    kategorie: l.kategorie,
    betragTenge: Number(l.betrag_tenge),
    buchungsdatum: l.buchungsdatum,
    beschreibung: l.beschreibung,
  }));

  const sichtbar = filter.zeilen;
  // Fehler sind oben schon abgefangen, die Funktion liefert genau eine Zeile.
  const summeAus = (ergebnis: { data: FinanzSummeZeile[] | null }) => ({
    erloesTenge: Number(ergebnis.data?.[0]?.erloes_tenge ?? 0),
    kostenTenge: Number(ergebnis.data?.[0]?.kosten_tenge ?? 0),
  });

  return {
    quelle: "db",
    deckungsbeitrag: deckungsbeitragAlle.slice(0, sichtbar),
    deckungsbeitragJeCharge: chargeAlle.slice(0, sichtbar),
    ledger: ledgerAlle.slice(0, sichtbar),
    mehr: {
      deckungsbeitrag: deckungsbeitragAlle.length > sichtbar,
      charge: chargeAlle.length > sichtbar,
      ledger: ledgerAlle.length > sichtbar,
    },
    summe: { zeitraum: summeAus(summeZeitraum), gesamt: summeAus(summeGesamt) },
    monate: monatsListe(aelteste.data?.[0]?.buchungsdatum ?? null),
  };
}

// ---------------------------------------------------------------------------
// Vorschau fuer die Uebersichtsseite
//
// Dieselbe Rechnung wie die Kennzahlen der Finanzseite: public.finanz_summe()
// ueber das Journal, eingegrenzt auf den laufenden Monat nach Buchungsdatum.
// Beide Seiten zeigen damit garantiert denselben Wert - vorher rechnete die
// Kachel nach Buchungsdatum und die Seite nach Erntetag, und beide nannten es
// "September".
// ---------------------------------------------------------------------------

export interface FinanzVorschau {
  quelle: Datenquelle;
  /** Erster Tag des laufenden Monats, "JJJJ-MM-TT". Traegt die Beschriftung. */
  von: string;
  erloesTenge: number;
  kostenTenge: number;
  buchungen: number;
}

export async function ladeFinanzVorschau(): Promise<FinanzVorschau> {
  const grenzen = zeitraumGrenzen("monat");
  // zeitraumGrenzen liefert fuer "monat" immer beide Grenzen, der Rueckfall
  // ist reine Typsicherheit.
  const von = grenzen.von ?? "";
  const bis = grenzen.bis ?? "";

  if (!isSupabaseConfigured()) {
    const zeilen = demoLedgerEintraege.filter((l) => imZeitraum(l.buchungsdatum, grenzen));
    return { quelle: "demo", von, ...ledgerSummen(zeilen), buchungen: zeilen.length };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finanz_summe", { von, bis });
  const zeile = (data as FinanzSummeZeile[] | null)?.[0];

  if (error || !zeile) {
    return { quelle: "fehler", von, erloesTenge: 0, kostenTenge: 0, buchungen: 0 };
  }
  return {
    quelle: "db",
    von,
    erloesTenge: Number(zeile.erloes_tenge),
    kostenTenge: Number(zeile.kosten_tenge),
    buchungen: Number(zeile.buchungen),
  };
}

// Referenzlisten fuer die Schreibformulare - wie ladeNachbarbetriebe() in
// lib/data/zukauf.ts: im Demo-Modus die Beispielwerte, weil die Formulare dort
// ohnehin nicht angezeigt werden (keine Anmeldung, kein Schreibpfad).

export async function ladeKostentraegerOptionen(): Promise<KostentraegerOption[]> {
  if (!isSupabaseConfigured()) return demoKostentraegerOptionen;
  const supabase = await createClient();
  const { data } = await supabase
    .from("kostentraeger")
    .select("id, bezeichnung, erntetag")
    .order("erntetag", { ascending: false, nullsFirst: false });
  return (data ?? []).map((k) => ({
    id: k.id,
    bezeichnung: k.bezeichnung,
    erntetag: k.erntetag,
  }));
}

export async function ladeReihenblockOptionen(): Promise<ReihenblockOption[]> {
  if (!isSupabaseConfigured()) return demoReihenblockOptionen;
  const supabase = await createClient();
  const { data } = await supabase.from("reihenbloecke").select("id, code").order("code");
  return (data ?? []).map((r) => ({ id: r.id, code: r.code }));
}

export async function ladeSorteOptionen(): Promise<SorteOption[]> {
  if (!isSupabaseConfigured()) return demoSorteOptionen;
  const supabase = await createClient();
  const { data } = await supabase.from("sorten").select("id, name").order("name");
  return (data ?? []).map((s) => ({ id: s.id, name: s.name }));
}

export async function ladeB2bKundeOptionen(): Promise<B2bKundeOption[]> {
  if (!isSupabaseConfigured()) return demoB2bKundeOptionen;
  const supabase = await createClient();
  const { data } = await supabase.from("b2b_kunden").select("id, name").order("name");
  return (data ?? []).map((k) => ({ id: k.id, name: k.name }));
}

// Anforderung 3.3: optionale Charge-Auswahl am Buchungsformular, damit eine
// Buchung direkt an einer Charge statt nur am groeberen Kostentraeger
// festgemacht werden kann. Auf die juengsten 200 begrenzt wie
// ladeChargenOptionen() in lib/data/reklamationen.ts - eine Volltextsuche
// ueber alle Chargen der Betriebsgeschichte ist fuer ein Auswahlfeld kein
// sinnvoller Anwendungsfall.
export async function ladeChargeOptionen(): Promise<ChargeOption[]> {
  if (!isSupabaseConfigured()) return demoChargeOptionen;
  const supabase = await createClient();
  const { data } = await supabase
    .from("chargen")
    .select("id, code")
    .order("code", { ascending: false })
    .limit(200);
  return (data ?? []).map((c) => ({ id: c.id, code: c.code }));
}
