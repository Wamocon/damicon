import { videoDateiBestaetigen, videoDateiVorbereiten, type VideoCode } from "@/lib/actions/schulungsvideos";
import { createClient } from "@/lib/supabase/client";
import { ladeInStuecken } from "@/lib/wissen/tus-upload";

// Browser-Seite der Videodatei: wiederaufnehmbarer Upload (TUS) direkt in den privaten Speicher, nicht durch eine Server Action (die Dateien sind gross).
// Ablauf: vorbereiten (Rechte, Datei, Pfad), in Stuecken hochladen, Verweis ablegen. Jeder Fehler kommt als Code zurueck.

export type VideoAblage = { ok: true } | { ok: false; code: VideoCode };

export async function legeVideoAb(datei: File, videoId: string, sprache: string, beiFortschritt?: (prozent: number) => void): Promise<VideoAblage> {
  try {
    const vor = await videoDateiVorbereiten(videoId, sprache, datei.name, datei.size);
    if (!vor.ok) return { ok: false, code: vor.code };
    const { data } = await createClient().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, code: "zugriff" };
    try {
      await ladeInStuecken(
        datei,
        { url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", token, bucket: vor.bucket, pfad: vor.pfad, contentType: vor.mime },
        beiFortschritt,
      );
    } catch (fehler) {
      console.error("[damicon] Videodatei hochladen fehlgeschlagen:", fehler);
      return { ok: false, code: "speicher" };
    }
    return await videoDateiBestaetigen(videoId, sprache, vor.pfad, datei.name);
  } catch (fehler) {
    console.error("[damicon] Videodatei ablegen fehlgeschlagen:", fehler);
    return { ok: false, code: "unbekannt" };
  }
}
