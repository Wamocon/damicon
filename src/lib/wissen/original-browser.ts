import { wissenOriginalBestaetigen, wissenOriginalVorbereiten } from "@/lib/actions/wissen-original";
import { createClient } from "@/lib/supabase/client";
import { ladeInStuecken } from "@/lib/wissen/tus-upload";

// Browser-Seite der Original-PDF (original.ts): wiederaufnehmbarer Upload (TUS, tus-upload.ts) direkt in den privaten Speicher, nicht durch eine Server
// Action. Ablauf: vorbereiten (Rechte, Größe und Obergrenze prüft der Server), in Stücken hochladen, Verweis ablegen. Der Upload läuft mit der Sitzung der
// angemeldeten Person; der Bucket erlaubt das Schreiben nur der Administration (Migration 20261204000000). Jeder Fehler wird als Code zurückgegeben und
// hält nie den Upload des Textes auf (der Aufrufer meldet ihn nur).

export type OriginalCode = "zugriff" | "ungueltig" | "keinUpload" | "keinDokument" | "nichtDa" | "zuVoll" | "speicher" | "unbekannt";
export type OriginalAblage = { ok: true } | { ok: false; code: OriginalCode };

export async function legeOriginalAb(datei: File, quelleId: string, beiFortschritt?: (prozent: number) => void): Promise<OriginalAblage> {
  try {
    const vor = await wissenOriginalVorbereiten(quelleId, datei.name, datei.size);
    if (!vor.ok) return { ok: false, code: vor.code };
    const { data } = await createClient().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, code: "zugriff" };
    try {
      await ladeInStuecken(datei, { url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", token, bucket: vor.bucket, pfad: vor.pfad }, beiFortschritt);
    } catch (fehler) {
      console.error("[damicon] Original hochladen fehlgeschlagen:", fehler);
      return { ok: false, code: "speicher" };
    }
    const fertig = await wissenOriginalBestaetigen(quelleId, datei.name);
    return fertig.ok ? { ok: true } : { ok: false, code: fertig.code };
  } catch (fehler) {
    console.error("[damicon] Original ablegen fehlgeschlagen:", fehler);
    return { ok: false, code: "unbekannt" };
  }
}
