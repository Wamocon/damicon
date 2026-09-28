import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { istUuid } from "@/lib/utils";

// Die Zahlen fuer die rechte Haelfte der Begruessungskarte, je Rolle eine.
//
// Bewusst eigene, schlanke Abfragen statt eines Auszugs aus den Modul-Ladefunktionen -
// dasselbe Vorgehen wie bei ladeOffeneEsutdFristen() in lib/data/esutd.ts und aus demselben
// Grund: ladeAufgabenSeite(), ladeLohnUebersicht() und ladeVorbestellungen() sind fuer
// ihre Modulseiten gebaut und holen Listen, Optionen und Referenzdaten mit. Die Startseite
// braucht je genau eine Zahl; die ganze Lohnuebersicht fuer einen Pfluecker zu laden, der
// nur seinen letzten Lohnlauf sehen soll, waere Verschwendung.
//
// Alle drei geben bei fehlender Datenbank, fehlender Zuordnung oder Lesefehler null zurueck.
// Die Karte laesst die rechte Haelfte dann weg - lieber nichts als eine erfundene Null.

/**
 * Offene Pflueckaufgaben der Brigade: dieselbe Zahl wie die Pille "Zu
 * erledigen" auf der Seite, mit deren Vorbelegung - die eigene Brigade und die
 * Aufgaben ohne Zuordnung, alles ausser abgeschlossen. Vorher zaehlte die Karte
 * "offen" und "angenommen" ueber alle Brigaden, und Karte und Liste gaben zwei
 * Antworten auf dieselbe Frage (entschieden am 25.09.2026, WMCNL-2488).
 */
export const ladeOffenePflueckaufgaben = cache(
  async (brigadeId: string | null): Promise<number | null> => {
    if (!isSupabaseConfigured()) return null;
    const supabase = await createClient();
    let abfrage = supabase
      .from("pflueckaufgaben")
      .select("id", { count: "exact", head: true })
      .neq("status", "abgeschlossen");
    // Ohne zugeordnete Brigade bleiben nur die Aufgaben ohne Zuordnung, wie bei
    // brigadeBedingung("meine") in lib/domain/pflueckaufgaben-liste.ts.
    abfrage =
      brigadeId && istUuid(brigadeId)
        ? abfrage.or(`brigade_id.eq.${brigadeId},brigade_id.is.null`)
        : abfrage.is("brigade_id", null);
    const { count, error } = await abfrage;
    return error ? null : (count ?? 0);
  },
);

export interface LetzterLohn {
  gesamtTenge: number;
  periodeEnde: string;
  status: string;
}

/** Die juengste Lohnabrechnung des angemeldeten Pflueckers. RLS grenzt auf die eigene ein. */
export const ladeLetztenLohn = cache(async (pflueckerId: string | null): Promise<LetzterLohn | null> => {
  if (!isSupabaseConfigured() || !pflueckerId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lohn_abrechnungen")
    .select("gesamt_tenge, periode_ende, status")
    .eq("pfluecker_id", pflueckerId)
    .order("periode_ende", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    gesamtTenge: Number(data.gesamt_tenge),
    periodeEnde: data.periode_ende,
    status: data.status,
  };
});

export interface NaechsteLieferung {
  liefertermin: string;
  mengeKg: number;
  /** Wie viele Vorbestellungen an diesem Termin zusammenkommen. */
  posten: number;
}

/**
 * Der frueheste Termin ab `abTag` aus den Vorbestellungen, samt Menge. Mehrere
 * Sorten koennen auf denselben Termin fallen - das ist eine Lieferung, nicht drei.
 * Seit 28.09.2026 eine eigene Funktion, damit die Regel ohne Datenbank pruefbar ist.
 */
export function naechsteLieferungAus(
  zeilen: readonly { liefertermin: string | null; menge_kg: number | string }[],
  abTag: string,
): NaechsteLieferung | null {
  const kuenftig = zeilen.filter((z): z is { liefertermin: string; menge_kg: number | string } => z.liefertermin !== null && z.liefertermin >= abTag);
  if (kuenftig.length === 0) return null;
  const termin = kuenftig.reduce((frueh, z) => (z.liefertermin < frueh ? z.liefertermin : frueh), kuenftig[0]!.liefertermin);
  const amTermin = kuenftig.filter((z) => z.liefertermin === termin);
  return {
    liefertermin: termin,
    mengeKg: amTermin.reduce((summe, z) => summe + Number(z.menge_kg), 0),
    posten: amTermin.length,
  };
}

/**
 * Der naechste zugesagte Liefertermin des angemeldeten B2B-Kunden, ab `abTag`.
 * Ohne Angabe gilt wie bisher der UTC-Tag (Startkarte). Die Tageslage gibt seit
 * dem 28.09.2026 den Almaty-Tag mit: zwischen 0 und 5 Uhr Ortszeit ist der
 * UTC-Tag noch gestern, und ein gestriger, noch bestaetigter Termin verdraengte
 * dort den naechsten echten.
 */
export const ladeNaechsteLieferung = cache(
  async (b2bKundeId: string | null, abTag: string = new Date().toISOString().slice(0, 10)): Promise<NaechsteLieferung | null> => {
    if (!isSupabaseConfigured() || !b2bKundeId) return null;
    const supabase = await createClient();
    // Nur bestaetigte: eine angefragte Bestellung ist noch keine Zusage, und auf der
    // Startseite soll kein Termin stehen, auf den sich niemand festgelegt hat.
    const { data, error } = await supabase
      .from("vorbestellungen")
      .select("liefertermin, menge_kg")
      .eq("b2b_kunde_id", b2bKundeId)
      .eq("status", "bestaetigt")
      .gte("liefertermin", abTag)
      .not("liefertermin", "is", null)
      .order("liefertermin", { ascending: true });
    if (error || !data) return null;
    return naechsteLieferungAus(data, abTag);
  },
);
