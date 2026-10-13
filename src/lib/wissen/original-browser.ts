import { wissenOriginalBestaetigen, wissenOriginalVorbereiten } from "@/lib/actions/wissen-original";
import { createClient } from "@/lib/supabase/client";
import { ORIGINAL_BUCKET } from "@/lib/wissen/original";

// Browser-Seite der Original-PDF (original.ts): die Datei geht direkt in den privaten Speicher, nicht durch eine Server Action.
// Ablauf: Adresse holen (Rechte und Prüfung auf dem Server), hochladen, Verweis ablegen. Jeder Fehler wird als Code zurückgegeben; er hält nie den Upload
// des Textes auf (der Aufrufer meldet ihn nur).

export type OriginalAblage = { ok: true } | { ok: false; code: "zugriff" | "ungueltig" | "keinUpload" | "keinDokument" | "nichtDa" | "speicher" | "unbekannt" };

export async function legeOriginalAb(datei: File, quelleId: string): Promise<OriginalAblage> {
  try {
    const vor = await wissenOriginalVorbereiten(quelleId, datei.name, datei.size);
    if (!vor.ok) return { ok: false, code: vor.code };
    const { error } = await createClient().storage.from(ORIGINAL_BUCKET).uploadToSignedUrl(vor.pfad, vor.token, datei, { contentType: "application/pdf" });
    if (error) {
      console.error("[damicon] Original hochladen fehlgeschlagen:", error.message);
      return { ok: false, code: "speicher" };
    }
    const fertig = await wissenOriginalBestaetigen(quelleId, datei.name);
    return fertig.ok ? { ok: true } : { ok: false, code: fertig.code };
  } catch (fehler) {
    console.error("[damicon] Original ablegen fehlgeschlagen:", fehler);
    return { ok: false, code: "unbekannt" };
  }
}
