import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { leseAlleZeilen } from "@/lib/data/util";
import { liesI18n, uebersetzt } from "@/lib/i18n-daten";
import { istEsutdArt, sortiereMeldungen, type EsutdArt, type EsutdMeldung } from "@/lib/domain/esutd";

// Offene ESUTD-Meldefristen ueber alle Pfluecker (Migration 20261025000000) -
// eine eigene, schlanke Abfrage statt eines Auszugs aus
// ladePersonalUebersicht() (die dafuer Brigaden/Einsatzplan/Bedarf mitlaeden
// muesste): dieser Ausschnitt wird zusaetzlich vom Risiko-Radar im
// Compliance-Cockpit gebraucht, der keine der uebrigen Personal-Daten
// interessiert.

export interface OffeneEsutdFrist {
  /** Quelle und Id der Meldung ("vertrag-..." oder "ereignis-..."). */
  id: string;
  art: EsutdArt;
  pfluecker: string;
  meldefristAm: string;
}

export async function ladeOffeneEsutdFristen(): Promise<OffeneEsutdFrist[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  // Aus der Liste aller Meldungen: Abschluss, Aenderung und Beendigung (bis 15.10.2026 nur der Abschluss). Seitenweise, weil PostgREST ab
  // 1000 Zeilen still kappt.
  let zeilen;
  try {
    ({ zeilen } = await leseAlleZeilen((von, bis) =>
      supabase
        .from("v_esutd_meldungen")
        .select("id, quelle, art, pfluecker_name, meldefrist_am")
        .eq("status", "offen")
        .not("meldefrist_am", "is", null)
        .order("meldefrist_am", { ascending: true })
        .order("id")
        .range(von, bis),
    ));
  } catch (error) {
    console.error("[damicon] Offene ЕСУТД-Fristen lesen fehlgeschlagen:", error instanceof Error ? error.message : error);
    return [];
  }

  return zeilen
    // id/meldefrist_am sind in den Basistabellen not null, die Sicht markiert Spalten grundsaetzlich als nullable im generierten Typ.
    .filter((row): row is typeof row & { id: string; meldefrist_am: string; art: EsutdArt } => row.id !== null && row.meldefrist_am !== null && row.art !== null && istEsutdArt(row.art))
    .map((row) => ({
      id: `${row.quelle}-${row.id}`,
      art: row.art,
      pfluecker: row.pfluecker_name ?? "-",
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
      i18n: liesI18n(z.i18n),
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

// --- Verlauf der Meldungen (15.10.2026) ---------------------------------------------------------------------------------
// Jedes Erfassen und jedes Wiederoeffnen steht in esutd_meldeverlauf (unveraenderlich). Beim Wiederoeffnen verschwinden Bestaetigung und Beleg aus
// der Meldung, der Verlauf behaelt sie. Nur das Buero liest ihn.

export interface EsutdVerlaufEintrag {
  id: string;
  art: "abschluss" | "aenderung" | "beendigung";
  aktion: "erfasst" | "geoeffnet";
  pfluecker: string;
  /** Bei "geoeffnet" das Meldedatum, das vorher galt. */
  erfasstAm: string | null;
  bestaetigung: string | null;
  zeitpunkt: string;
}

export async function ladeEsutdVerlauf(grenze = 30): Promise<EsutdVerlaufEintrag[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("esutd_meldeverlauf")
    .select("id, art, aktion, pfluecker_id, erfasst_am, bestaetigung, created_at")
    .order("created_at", { ascending: false })
    .limit(grenze);
  if (error || !data) {
    if (error) console.error("[damicon] ЕСУТД-Verlauf lesen fehlgeschlagen:", error.message);
    return [];
  }

  const ids = [...new Set(data.map((z) => z.pfluecker_id))];
  const { data: personen } = ids.length > 0 ? await supabase.from("pfluecker").select("id, name").in("id", ids) : { data: [] as { id: string; name: string }[] };
  const namen = new Map((personen ?? []).map((p) => [p.id, p.name]));

  return data
    .filter((z): z is typeof z & { art: EsutdVerlaufEintrag["art"]; aktion: EsutdVerlaufEintrag["aktion"] } => ["abschluss", "aenderung", "beendigung"].includes(z.art) && ["erfasst", "geoeffnet"].includes(z.aktion))
    .map((z) => ({
      id: z.id,
      art: z.art,
      aktion: z.aktion,
      pfluecker: namen.get(z.pfluecker_id) ?? "-",
      erfasstAm: z.erfasst_am,
      bestaetigung: z.bestaetigung,
      zeitpunkt: z.created_at,
    }));
}

export interface EsutdOptionen {
  pfluecker: { id: string; name: string; ausweis: string }[];
  /** Die Vertraege, zu denen sich eine Aenderung oder Beendigung melden laesst. */
  vertraege: { id: string; pfluecker: string | null; vertragsnummer: string | null; beginn: string | null }[];
  /** Belege aus dem Nachweisregister (Kategorie ЕСУТД-Nachweis). */
  belege: { id: string; name: string }[];
}

/** sprache: die Sprache der Namen der Belege; ohne Angabe die der Oberflaeche. */
export async function ladeEsutdOptionen(sprachwahl?: string): Promise<EsutdOptionen> {
  if (!isSupabaseConfigured()) return { pfluecker: [], vertraege: [], belege: [] };

  const supabase = await createClient();
  const sprache = sprachwahl ?? (await getLocale());
  const [{ data: pfluecker }, { data: vertraege }, { data: belege }] = await Promise.all([
    supabase.from("pfluecker").select("id, name, ausweis").order("name"),
    supabase.from("v_esutd_meldungen").select("id, pfluecker_name, vertragsnummer, ereignis_am").eq("quelle", "vertrag").order("pfluecker_name"),
    supabase.from("dokumente").select("id, name, i18n").eq("kategorie", "esutd_nachweis").order("created_at", { ascending: false }).limit(100),
  ]);

  return {
    pfluecker: pfluecker ?? [],
    vertraege: (vertraege ?? [])
      .filter((v): v is typeof v & { id: string } => v.id !== null)
      .map((v) => ({ id: v.id, pfluecker: v.pfluecker_name, vertragsnummer: v.vertragsnummer, beginn: v.ereignis_am })),
    // Die Auswahl ist nur zum Lesen: der Name in der Sprache der Oberflaeche.
    belege: (belege ?? []).map((b) => ({ id: b.id, name: uebersetzt(liesI18n(b.i18n), "name", sprache, b.name) })),
  };
}
