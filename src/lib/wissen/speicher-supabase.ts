import type { SupabaseClient } from "@supabase/supabase-js";
import { SCHREIB_BATCH, type FreigabeInfo, type WissenSpeicher } from "@/lib/wissen/hochladen";
import { istUploadZeile, UPLOAD_QUELLE, UPLOAD_QUELLE_MUSTER } from "@/lib/wissen/upload-quelle";

// Der Speicher des Wissens-Uploads auf dem service_role-Client. Die Logik steht in hochladen.ts und loeschen.ts und
// kennt nur die Schnittstelle WissenSpeicher; hier steht allein, wie sie mit PostgREST gesprochen wird. Getrennt von
// hochladen.ts, damit diese Datei einzeln gegen eine echte Datenbank geprueft werden kann
// (supabase/tests/wissen-upload-db.ts) und die Logik ohne Supabase-Abhaengigkeit testbar bleibt.

const SCHREIB_FEHLER = (was: string, e: { message: string } | null) => {
  if (e) throw new Error(`${was}: ${e.message}`);
};

/** Speicher auf dem service_role-Client. Schreiben darf in wissen_chunks/wissen_begriffe nur der Dienst (RLS). */
export function supabaseSpeicher(db: SupabaseClient): WissenSpeicher {
  return {
    async findeQuelle(quelleId) {
      const { data, error } = await db.from("wissen_chunks").select("titel").eq("quelle_id", quelleId).limit(1);
      SCHREIB_FEHLER("Dublettenpruefung", error);
      const zeile = data?.[0] as { titel: string | null } | undefined;
      return zeile ? { titel: zeile.titel } : null;
    },
    async schreibeChunks(zeilen) {
      for (let i = 0; i < zeilen.length; i += SCHREIB_BATCH) {
        const { error } = await db.from("wissen_chunks").upsert(zeilen.slice(i, i + SCHREIB_BATCH), { onConflict: "id" });
        SCHREIB_FEHLER("wissen_chunks", error);
      }
    },
    async loescheQuelle(quelleId) {
      const { error } = await db.from("wissen_chunks").delete().eq("quelle_id", quelleId);
      SCHREIB_FEHLER("Aufraeumen", error);
    },
    async leseDokumenthaeufigkeit(indizes) {
      const aus = new Map<number, number>();
      for (let i = 0; i < indizes.length; i += 500) {
        const { data, error } = await db.from("wissen_begriffe").select("hash, df").in("hash", indizes.slice(i, i + 500));
        SCHREIB_FEHLER("wissen_begriffe (lesen)", error);
        for (const r of (data ?? []) as { hash: number; df: number }[]) aus.set(r.hash, r.df);
      }
      return aus;
    },
    async schreibeBegriffe(zeilen) {
      for (let i = 0; i < zeilen.length; i += 2000) {
        const { error } = await db.from("wissen_begriffe").upsert(zeilen.slice(i, i + 2000), { onConflict: "hash" });
        SCHREIB_FEHLER("wissen_begriffe", error);
      }
    },
    async zaehleChunks() {
      const { count, error } = await db.from("wissen_chunks").select("id", { count: "exact", head: true });
      SCHREIB_FEHLER("Zaehlung", error);
      return count ?? 0;
    },
    async ladeQuellenInfo(quelleId) {
      const { data, error } = await db
        .from("wissen_chunks")
        .select("titel, bereich, quelle_id, upload_quelle:extra->>quelle")
        .eq("quelle_id", quelleId)
        .limit(1000);
      SCHREIB_FEHLER("Loeschen (lesen)", error);
      const zeilen = (data ?? []) as unknown as { titel: string | null; bereich: string | null; quelle_id: string | null; upload_quelle: string | null }[];
      const fremd = zeilen.filter((z) => !istUploadZeile(z)).length;
      return { anzahl: zeilen.length, fremd, titel: zeilen[0]?.titel ?? null, bereich: zeilen[0]?.bereich ?? null };
    },
    async loescheUpload(quelleId) {
      // Eine einzige DELETE-Anweisung: entweder verschwinden alle Zeilen des Dokuments oder keine. Beide Bedingungen
      // stehen hier noch einmal im Filter. RETURNING liefert nur, was dieser Aufruf wirklich geloescht hat.
      const { data, error } = await db
        .from("wissen_chunks")
        .delete()
        .eq("quelle_id", quelleId)
        .like("quelle_id", UPLOAD_QUELLE_MUSTER)
        .eq("extra->>quelle", UPLOAD_QUELLE)
        .select("sparse");
      SCHREIB_FEHLER("Loeschen", error);
      return ((data ?? []) as unknown as { sparse: unknown }[]).map((z) => String(z.sparse));
    },
    async loescheBegriffe(indizes) {
      for (let i = 0; i < indizes.length; i += 500) {
        const { error } = await db.from("wissen_begriffe").delete().in("hash", indizes.slice(i, i + 500));
        SCHREIB_FEHLER("wissen_begriffe (loeschen)", error);
      }
    },

    // ---- Freigabe (Vier-Augen-Prinzip, siehe freigabe.ts) ----
    async ladeFreigabeInfo(quelleId) {
      const { data, error } = await db
        .from("wissen_chunks")
        .select("titel, bereich, quelle_id, upload_quelle:extra->>quelle, pruefstatus, quellenart, pruefen_bis, hochgeladen_von:extra->>hochgeladen_von")
        .eq("quelle_id", quelleId)
        .limit(1000);
      SCHREIB_FEHLER("Freigabe (lesen)", error);
      const zeilen = (data ?? []) as unknown as Array<{
        titel: string | null;
        bereich: string | null;
        quelle_id: string | null;
        upload_quelle: string | null;
        pruefstatus: string | null;
        quellenart: string | null;
        pruefen_bis: string | null;
        hochgeladen_von: string | null;
      }>;
      const stati = new Set(zeilen.map((z) => z.pruefstatus));
      const status: FreigabeInfo["pruefstatus"] = zeilen.length === 0 ? null : stati.size === 1 ? (zeilen[0]!.pruefstatus as FreigabeInfo["pruefstatus"]) : "gemischt";
      return {
        anzahl: zeilen.length,
        fremd: zeilen.filter((z) => !istUploadZeile(z)).length,
        titel: zeilen[0]?.titel ?? null,
        bereich: zeilen[0]?.bereich ?? null,
        quellenart: zeilen[0]?.quellenart ?? null,
        pruefstatus: status,
        hochgeladenVon: zeilen.map((z) => z.hochgeladen_von).find((v): v is string => !!v) ?? null,
        pruefenBis: zeilen[0]?.pruefen_bis ?? null,
      };
    },
    async entscheide(quelleId, a) {
      // Eine Anweisung: alle Zeilen des Dokuments oder keine. Marker und Status stehen noch einmal im Filter; der Waechter
      // der Datenbank lehnt die Freigabe durch die hochladende Person selbst dann ab, wenn hier ein Fehler stuende.
      const { data, error } = await db
        .from("wissen_chunks")
        .update({ pruefstatus: a.status, geprueft_von: a.pruefer, geprueft_am: a.zeitpunkt, pruefen_bis: a.pruefenBis })
        .eq("quelle_id", quelleId)
        .like("quelle_id", UPLOAD_QUELLE_MUSTER)
        .eq("extra->>quelle", UPLOAD_QUELLE)
        .eq("pruefstatus", "ungeprueft")
        .select("id");
      SCHREIB_FEHLER("Freigabe", error);
      return (data ?? []).length;
    },
    async verlaengere(quelleId, a) {
      const { data, error } = await db
        .from("wissen_chunks")
        .update({ geprueft_von: a.pruefer, geprueft_am: a.zeitpunkt, pruefen_bis: a.pruefenBis })
        .eq("quelle_id", quelleId)
        .like("quelle_id", UPLOAD_QUELLE_MUSTER)
        .eq("extra->>quelle", UPLOAD_QUELLE)
        .eq("pruefstatus", "freigegeben")
        .not("pruefen_bis", "is", null)
        .select("id");
      SCHREIB_FEHLER("Verlaengerung", error);
      return (data ?? []).length;
    },
    async ladeVorschau(quelleId, maxZeichen) {
      const { data, error } = await db.from("wissen_chunks").select("text, teil").eq("quelle_id", quelleId).order("teil").limit(4);
      SCHREIB_FEHLER("Vorschau", error);
      const text = ((data ?? []) as unknown as { text: string }[]).map((z) => String(z.text)).join("\n\n");
      return text.length > maxZeichen ? `${text.slice(0, maxZeichen).trimEnd()} ...` : text;
    },
  };
}
