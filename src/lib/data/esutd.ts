import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { einsAus, leseAlleZeilen } from "@/lib/data/util";
import { istEsutdArt, sortiereMeldungen, type EsutdMeldung } from "@/lib/domain/esutd";

// Offene ESUTD-Meldefristen ueber alle Pfluecker (Migration 20261025000000) -
// eine eigene, schlanke Abfrage statt eines Auszugs aus
// ladePersonalUebersicht() (die dafuer Brigaden/Einsatzplan/Bedarf mitlaeden
// muesste): dieser Ausschnitt wird zusaetzlich vom Risiko-Radar im
// Compliance-Cockpit gebraucht, der keine der uebrigen Personal-Daten
// interessiert.

export interface OffeneEsutdFrist {
  id: string;
  pfluecker: string;
  meldefristAm: string;
}

export async function ladeOffeneEsutdFristen(): Promise<OffeneEsutdFrist[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("esutd_vertraege_mit_frist")
    .select("id, meldefrist_am, pfluecker ( name )")
    .eq("status", "offen")
    .not("meldefrist_am", "is", null)
    .order("meldefrist_am", { ascending: true });

  if (error || !data) return [];

  return data
    // id/meldefrist_am sind in der Basistabelle not null, die Sicht markiert
    // Spalten grundsaetzlich als nullable im generierten Typ.
    .filter(
      (row): row is typeof row & { id: string; meldefrist_am: string } =>
        row.id !== null && row.meldefrist_am !== null,
    )
    .map((row) => ({
      id: row.id,
      pfluecker: einsAus(row.pfluecker)?.name ?? "-",
      meldefristAm: row.meldefrist_am,
    }));
}

// --- Meldeprozess (WMCNL-1447, Stufe 1) --------------------------------------------------------------------------------
// Abschluss, Aenderung und Beendigung als eine Liste (Sicht v_esutd_meldungen). Nur das Buero liest sie
// (Zeilensicherheit der Tabellen). Ohne Datenbank gibt es keine Liste: erfundene Meldungen waeren Irrefuehrung.

/** Wie ladeEsutdMeldungen, aber ein Lesefehler wirft: Der Export darf bei einem Fehler keine leere Datei mit 200 liefern. */
export async function ladeEsutdMeldungenStreng(): Promise<EsutdMeldung[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  // Nur offene und erfasste Meldungen, in fester Reihenfolge und SEITENWEISE: Ohne beides kappt PostgREST ab 1000 Zeilen still und in beliebiger Reihenfolge.
  const { zeilen: data } = await leseAlleZeilen((von, bis) =>
    supabase.from("v_esutd_meldungen").select("*").in("status", ["offen", "erfasst"]).order("quelle").order("id").range(von, bis),
  );

  const meldungen: EsutdMeldung[] = [];
  for (const z of data) {
    if (z.id === null || z.art === null || !istEsutdArt(z.art) || (z.quelle !== "vertrag" && z.quelle !== "ereignis")) continue;
    if (z.status !== "offen" && z.status !== "erfasst") continue;
    meldungen.push({
      quelle: z.quelle,
      id: z.id,
      pfluecker: z.pfluecker_name,
      ausweis: z.pfluecker_ausweis,
      art: z.art,
      ereignisAm: z.ereignis_am,
      beschreibung: z.beschreibung,
      vertragsnummer: z.vertragsnummer,
      status: z.status,
      erfasstAm: z.erfasst_am,
      bestaetigung: z.bestaetigung,
      belegDokumentId: z.beleg_dokument_id,
      meldefristAm: z.meldefrist_am,
    });
  }
  return sortiereMeldungen(meldungen);
}

/** Die Liste fuer die Ansichten: bei einem Lesefehler leer (die Seite zeigt dann "keine Meldungen") und ein Eintrag im Protokoll. */
export async function ladeEsutdMeldungen(): Promise<EsutdMeldung[]> {
  try {
    return await ladeEsutdMeldungenStreng();
  } catch (error) {
    console.error("[damicon] ЕСУТД-Meldungen lesen fehlgeschlagen:", error instanceof Error ? error.message : error);
    return [];
  }
}

export interface EsutdOptionen {
  pfluecker: { id: string; name: string; ausweis: string }[];
  /** Die Vertraege, zu denen sich eine Aenderung oder Beendigung melden laesst. */
  vertraege: { id: string; pfluecker: string | null; vertragsnummer: string | null; beginn: string | null }[];
  /** Belege aus dem Nachweisregister (Kategorie ЕСУТД-Nachweis). */
  belege: { id: string; name: string }[];
}

export async function ladeEsutdOptionen(): Promise<EsutdOptionen> {
  if (!isSupabaseConfigured()) return { pfluecker: [], vertraege: [], belege: [] };

  const supabase = await createClient();
  const [{ data: pfluecker }, { data: vertraege }, { data: belege }] = await Promise.all([
    supabase.from("pfluecker").select("id, name, ausweis").order("name"),
    supabase.from("v_esutd_meldungen").select("id, pfluecker_name, vertragsnummer, ereignis_am").eq("quelle", "vertrag").order("pfluecker_name"),
    supabase.from("dokumente").select("id, name").eq("kategorie", "esutd_nachweis").order("created_at", { ascending: false }).limit(100),
  ]);

  return {
    pfluecker: pfluecker ?? [],
    vertraege: (vertraege ?? [])
      .filter((v): v is typeof v & { id: string } => v.id !== null)
      .map((v) => ({ id: v.id, pfluecker: v.pfluecker_name, vertragsnummer: v.vertragsnummer, beginn: v.ereignis_am })),
    belege: belege ?? [],
  };
}
