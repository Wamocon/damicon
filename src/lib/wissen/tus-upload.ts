import * as tus from "tus-js-client";

// Wiederaufnehmbarer Upload (TUS) in einen Supabase-Bucket. Reine Funktion ohne Anwendungswissen: Sie läuft im Browser (original-browser.ts) und in
// Node (Tests). Die Stückgröße ist festgelegt (6 MB), die Schnittstelle von Supabase erlaubt keine andere. Bricht die Verbindung ab, wird nach
// Wartezeiten wiederholt und beim letzten Stück weitergemacht.

export const TUS_STUECK = 6 * 1024 * 1024;
const WIEDERHOLUNGEN = [0, 3000, 5000, 10_000, 20_000, 30_000];

export interface TusZiel {
  /** Basisadresse des Projekts (NEXT_PUBLIC_SUPABASE_URL). */
  url: string;
  anonKey: string;
  /** Zugriffstoken der Sitzung der angemeldeten Person. */
  token: string;
  bucket: string;
  pfad: string;
  contentType?: string;
}

/** Lädt Daten in Stücken in den Bucket. Löst bei Erfolg auf, wirft bei einem Fehler nach den Wiederholungen. In Node (Tests) gehen auch Buffer. */
export function ladeInStuecken(daten: Blob | Uint8Array, ziel: TusZiel, beiFortschritt?: (prozent: number) => void): Promise<void> {
  return new Promise<void>((fertig, fehler) => {
    const upload = new tus.Upload(daten as never, {
      endpoint: `${ziel.url.replace(/\/+$/, "")}/storage/v1/upload/resumable`,
      retryDelays: WIEDERHOLUNGEN,
      headers: { authorization: `Bearer ${ziel.token}`, apikey: ziel.anonKey },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_STUECK,
      metadata: { bucketName: ziel.bucket, objectName: ziel.pfad, contentType: ziel.contentType ?? "application/pdf", cacheControl: "3600" },
      onError: (e) => fehler(e),
      onProgress: (gesendet, gesamt) => beiFortschritt?.(gesamt > 0 ? Math.min(100, Math.floor((gesendet / gesamt) * 100)) : 0),
      onSuccess: () => {
        beiFortschritt?.(100);
        fertig();
      },
    });
    // Eine frühere, abgebrochene Übertragung derselben Datei wird fortgesetzt (im Browser über den Fingerprint; in Node gibt es keinen Speicher).
    void upload
      .findPreviousUploads()
      .then((frueher) => {
        if (frueher.length > 0) upload.resumeFromPreviousUpload(frueher[0]!);
        upload.start();
      })
      .catch(() => upload.start());
  });
}
