import type { SupabaseClient } from "@supabase/supabase-js";
import type { BestandsSpeicher } from "@/lib/wissen/bestandspflege-entfernen";
import type { DokumentNaehe, NaeheProbe } from "@/lib/wissen/bestandspflege";
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
