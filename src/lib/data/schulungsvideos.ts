import { createClient } from "@/lib/supabase/server";
import { bucket } from "@/lib/supabase/buckets";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { istVideoSprache, type VideoSprache } from "@/lib/domain/schulungsvideos";

// Schulungsvideos mit ihren Dateien je Sprache (Migration 20261208130000). Gelesen wird mit den Rechten der Person; die Dateien liegen in einem privaten
// Bucket und gehen nur ueber kurzlebige signierte Adressen hinaus. Ohne Datenbank gibt es keine Videos (Beispieldateien waeren erfunden).

const SIGNATUR_SEKUNDEN = 60 * 60;

export interface VideoDatei {
  id: string;
  sprache: VideoSprache;
  groesseBytes: number;
  /** Signierte Adresse; null, wenn sie nicht erzeugt werden konnte. */
  url: string | null;
}

export interface SchulungsvideoEintrag {
  id: string;
  titel: string;
  thema: string | null;
  dauerSekunden: number | null;
  pflicht: boolean;
  dateien: VideoDatei[];
}

export interface SchulungsvideoListe {
  quelle: Datenquelle;
  videos: SchulungsvideoEintrag[];
}

export async function ladeSchulungsvideos(): Promise<SchulungsvideoListe> {
  if (!isSupabaseConfigured()) return { quelle: "demo", videos: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schulungsvideos")
    .select("id, titel, thema, dauer_sekunden, pflicht, schulungsvideo_dateien ( id, sprache, storage_path, groesse_bytes )")
    .order("titel");
  if (error || !data) {
    if (error) console.error("[damicon] Schulungsvideos lesen fehlgeschlagen:", error.message);
    return { quelle: "fehler", videos: [] };
  }

  const pfade = data.flatMap((v) => v.schulungsvideo_dateien.map((d) => d.storage_path));
  const signiert = new Map<string, string>();
  if (pfade.length > 0) {
    const { data: urls, error: urlFehler } = await supabase.storage.from(bucket("schulungsvideos")).createSignedUrls(pfade, SIGNATUR_SEKUNDEN);
    if (urlFehler) console.error("[damicon] Signierte Links fuer Schulungsvideos fehlgeschlagen:", urlFehler.message);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signiert.set(u.path, u.signedUrl);
  }

  return {
    quelle: "db",
    videos: data.map((v) => ({
      id: v.id,
      titel: v.titel,
      thema: v.thema,
      dauerSekunden: v.dauer_sekunden,
      pflicht: v.pflicht,
      dateien: v.schulungsvideo_dateien
        .filter((d) => istVideoSprache(d.sprache))
        .map((d) => ({ id: d.id, sprache: d.sprache as VideoSprache, groesseBytes: Number(d.groesse_bytes), url: signiert.get(d.storage_path) ?? null })),
    })),
  };
}
