import type { SupabaseClient } from "@supabase/supabase-js";
import type { BestandsSpeicher } from "@/lib/wissen/bestandspflege-entfernen";
import type { DokumentNaehe, NaeheProbe } from "@/lib/wissen/bestandspflege";
import { entferneNebenzeilen } from "@/lib/wissen/dokument-nebenzeilen";
import { dokumentQualitaet, type DokumentQualitaet } from "@/lib/wissen/qualitaet";
import { supabaseSpeicher } from "@/lib/wissen/speicher-supabase";

// Datenbankzugriff der Bestandspflege auf dem service_role-Client (nach der Rechteprüfung der Action). Die Logik steht in bestandspflege.ts
// und bestandspflege-entfernen.ts; hier steht nur, wie sie mit PostgREST spricht.

const FEHLER = (was: string, e: { message: string } | null) => {
  if (e) throw new Error(`${was}: ${e.message}`);
};
const LOESCH_STAPEL = 100; // 100 Kennungen in der Adresse (rund 4 KB): mehr lehnt der Server mit "URI too long" ab

export function bestandsSpeicher(db: SupabaseClient): BestandsSpeicher {
  return {
    ...supabaseSpeicher(db),
    async loescheDokument(quelleId) {
      // In Stapeln wie beim Löschen eines Uploads (ein Buch hat tausende Zeilen, jede bringt ihren Vektor mit); die Antwort nennt nur,
      // was dieser Aufruf wirklich gelöscht hat. Jede Anweisung trägt die quelle_id: gelöscht wird nie etwas anderes.
      const sparse: string[] = [];
      for (;;) {
        const { data: ids, error: leseFehler } = await db.from("wissen_chunks").select("id").eq("quelle_id", quelleId).limit(LOESCH_STAPEL);
        FEHLER("Entfernen (Stapel lesen)", leseFehler);
        const liste = ((ids ?? []) as unknown as { id: string }[]).map((z) => z.id);
        if (liste.length === 0) break;
        const { data, error } = await db.from("wissen_chunks").delete().in("id", liste).eq("quelle_id", quelleId).select("sparse");
        FEHLER("Entfernen", error);
        const geloescht = (data ?? []) as unknown as { sparse: unknown }[];
        sparse.push(...geloescht.map((z) => String(z.sparse)));
        if (geloescht.length === 0) break;
      }
      // Qualitätswert, Seiten-Vermerk und Original-PDF gehören zum Dokument und gehen mit ihm (dokument-nebenzeilen.ts)
      await entferneNebenzeilen(db, quelleId);
      return sparse;
    },
    async merkeEntfernt(e) {
      const { error } = await db
        .from("wissen_entfernt")
        .upsert({ quelle_id: e.quelleId, titel: e.titel, grund: e.grund, abschnitte: e.abschnitte, entfernt_von: e.von }, { onConflict: "quelle_id" });
      FEHLER("wissen_entfernt", error);
    },
  };
}

interface NaeheZeile {
  probe: string;
  naechster_abschnitt: string;
  naechste_quelle_id: string | null;
  naechster_titel: string | null;
  naechster_ist_upload: boolean | null;
  aehnlichkeit: number;
}

/** Die inhaltliche Nähe eines Dokuments zu allen anderen (wissen_naehe, Migration 20261202000000): bis zu `proben` Abschnitte, je der ähnlichste fremde Abschnitt. */
export async function ladeNaehe(db: SupabaseClient, quelleId: string, proben = 6): Promise<{ naehe: DokumentNaehe; zeilen: NaeheZeile[] }> {
  const { data, error } = await db.rpc("wissen_naehe", { p_quelle_id: quelleId, p_proben: proben });
  FEHLER("wissen_naehe", error);
  const zeilen = (data ?? []) as unknown as NaeheZeile[];
  const probenListe: NaeheProbe[] = zeilen
    .filter((z) => z.naechste_quelle_id)
    .map((z) => ({ aehnlichkeit: Number(z.aehnlichkeit), quelleId: z.naechste_quelle_id as string, titel: z.naechster_titel, istUpload: z.naechster_ist_upload === true }));
  return { naehe: { schluessel: quelleId, proben: probenListe }, zeilen };
}

const TEXT_SEITE = 1000;
const MAX_ZEILEN = 6000; // das größte Buch hat rund 2.500 Abschnitte

/**
 * Berechnet die Qualität eines Dokuments aus dem gespeicherten Text (in Buchreihenfolge: Pfad mit der Paketnummer, dann Teil) und legt sie in
 * wissen_qualitaet ab. Bei einem Buch mit Seitenverlauf-Prüfung (extra.seiten_pruefung) mindern fehlende Seiten den Wert. Liefert null, wenn es
 * keinen Text gibt (dann wird nichts geschrieben).
 */
export async function berechneQualitaetFuer(db: SupabaseClient, quelleId: string): Promise<DokumentQualitaet | null> {
  const texte: string[] = [];
  let seiten: { seiten: number; fehlend: number } | null = null;
  for (let von = 0; von < MAX_ZEILEN; von += TEXT_SEITE) {
    const { data, error } = await db
      .from("wissen_chunks")
      .select("text, sp_seiten:extra->seiten_pruefung->>seiten, sp_fehlend:extra->seiten_pruefung->>fehlend")
      .eq("quelle_id", quelleId)
      .order("pfad")
      .order("teil")
      .order("id")
      .range(von, von + TEXT_SEITE - 1);
    FEHLER("Qualität (Text lesen)", error);
    const zeilen = (data ?? []) as unknown as { text: string; sp_seiten: string | null; sp_fehlend: string | null }[];
    for (const z of zeilen) {
      texte.push(z.text);
      if (!seiten && z.sp_seiten !== null && z.sp_fehlend !== null) seiten = { seiten: Number(z.sp_seiten), fehlend: Number(z.sp_fehlend) };
    }
    if (zeilen.length < TEXT_SEITE) break;
  }
  const q = dokumentQualitaet(texte, seiten);
  if (!q) return null;
  const { error } = await db.from("wissen_qualitaet").upsert({ quelle_id: quelleId, prozent: q.prozent, berechnet_am: new Date().toISOString() }, { onConflict: "quelle_id" });
  FEHLER("wissen_qualitaet", error);
  return q;
}

const VERGLEICH_ZEICHEN = 1200;

export interface VergleichPaar {
  aehnlichkeit: number;
  bestand: string;
  gegenueber: string;
}

/** Die Vergleichsansicht: bis zu zwei Abschnitte des Dokuments mit dem ähnlichsten Abschnitt des anderen Dokuments, im Wortlaut. Prüft keine Rechte (das tut der Aufrufer). */
export async function ladeVergleich(db: SupabaseClient, quelleId: string, andere: string, proben = 6): Promise<{ paare: VergleichPaar[]; titel: string | null }> {
  const { zeilen } = await ladeNaehe(db, quelleId, proben);
  const beste = zeilen
    .filter((z) => z.naechste_quelle_id === andere)
    .sort((a, b) => Number(b.aehnlichkeit) - Number(a.aehnlichkeit))
    .slice(0, 2);
  if (beste.length === 0) return { paare: [], titel: null };
  const ids = beste.flatMap((z) => [z.probe, z.naechster_abschnitt]);
  const { data, error } = await db.from("wissen_chunks").select("id, text").in("id", ids);
  FEHLER("Vergleich (Text lesen)", error);
  const text = new Map(((data ?? []) as unknown as { id: string; text: string }[]).map((r) => [r.id, r.text]));
  const kurz = (t: string | undefined) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, VERGLEICH_ZEICHEN);
  return {
    paare: beste.map((z) => ({ aehnlichkeit: Number(z.aehnlichkeit), bestand: kurz(text.get(z.probe)), gegenueber: kurz(text.get(z.naechster_abschnitt)) })),
    titel: beste[0]?.naechster_titel ?? null,
  };
}
