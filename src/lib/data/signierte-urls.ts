import type { createClient } from "@/lib/supabase/server";
import { bucket } from "@/lib/supabase/buckets";

// Signierte Links auf Dateien im privaten Bucket "dokumente". Der Bucket ist
// nicht oeffentlich lesbar, ein Pfad allein nuetzt der Oberflaeche nichts.
// Gemeinsamer Helfer fuer Dokumentenverwaltung und Foerdermitteldossier, damit
// Laufzeit und Fehlerbehandlung an einer Stelle liegen.

/** Gueltigkeit der signierten Datei-Links. */
const SIGNATUR_SEKUNDEN = 60 * 60;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Liefert je Pfad die signierte URL. Schlaegt das Signieren fehl, bleibt die
 * Map leer und der Fehler steht im Log. Die Ansichten unterscheiden "Datei
 * vorhanden, aber kein Link" von "keine Datei" ueber den gespeicherten Pfad.
 */
export async function signiereDokumentPfade(
  supabase: ServerClient,
  pfade: string[],
): Promise<Map<string, string>> {
  const signiert = new Map<string, string>();
  if (pfade.length === 0) return signiert;

  const { data, error } = await supabase.storage
    .from(bucket("dokumente"))
    .createSignedUrls(pfade, SIGNATUR_SEKUNDEN);

  if (error) {
    console.error("[damicon] Signierte Links fuer Dokumente fehlgeschlagen:", error.message);
    return signiert;
  }

  for (const eintrag of data ?? []) {
    if (eintrag.path && eintrag.signedUrl) signiert.set(eintrag.path, eintrag.signedUrl);
  }
  return signiert;
}
