// Schulungsvideos im Portal (Migration 20261208130000): je Video und Sprache eine Datei im privaten Speicher. Reine Regeln, ohne Datenbank und Speicher:
// welche Datei zulaessig ist, wie der Pfad aussieht und welche Sprache abgespielt wird.

export const VIDEO_SPRACHEN = ["de", "en", "ru", "kk"] as const;
export type VideoSprache = (typeof VIDEO_SPRACHEN)[number];

export function istVideoSprache(wert: unknown): wert is VideoSprache {
  return typeof wert === "string" && (VIDEO_SPRACHEN as readonly string[]).includes(wert);
}

/** Je Datei hoechstens 500 MB (Limit des Buckets). */
export const VIDEO_MAX_BYTES = 500 * 1024 * 1024;

export const VIDEO_TYPEN = { mp4: "video/mp4", webm: "video/webm" } as const;
export type VideoEndung = keyof typeof VIDEO_TYPEN;

export type VideoPruefung = { ok: true; endung: VideoEndung; mime: string } | { ok: false; grund: "typ" | "groesse" };

/** Eine MP4- oder WebM-Datei, nicht leer, nicht ueber dem Limit. Der Name entscheidet nicht allein: der Bucket prueft den Typ zusaetzlich. */
export function pruefeVideoDatei(dateiname: string, groesse: number): VideoPruefung {
  const endung = dateiname.toLowerCase().split(".").pop() ?? "";
  if (!(endung in VIDEO_TYPEN) || dateiname.indexOf(".") < 0) return { ok: false, grund: "typ" };
  if (!Number.isFinite(groesse) || groesse <= 0 || groesse > VIDEO_MAX_BYTES) return { ok: false, grund: "groesse" };
  const e = endung as VideoEndung;
  return { ok: true, endung: e, mime: VIDEO_TYPEN[e] };
}

/**
 * Pfad im Bucket: Video, Sprache und ein Zeitstempel. Jede Datei bekommt einen neuen Pfad, auch beim Ersetzen: schlaegt der Upload fehl, bleibt die alte Datei
 * stehen, und erst nach dem Bestaetigen verschwindet sie.
 */
export const videoPfad = (videoId: string, sprache: VideoSprache, endung: VideoEndung, stempel: number): string => `${videoId}/${sprache}-${stempel}.${endung}`;

const PFAD = /^([0-9a-f-]{36})\/(de|en|ru|kk)-(\d{10,15})\.(mp4|webm)$/;

/** Gehoert der Pfad zu diesem Video und dieser Sprache und hat er die Form, die videoPfad erzeugt? Der Browser nennt den Pfad, der Server glaubt ihm nur so. */
export function istVideoPfad(pfad: string, videoId: string, sprache: VideoSprache): boolean {
  const treffer = PFAD.exec(pfad);
  return treffer !== null && treffer[1] === videoId && treffer[2] === sprache;
}

/** Rueckfall, wenn es das Video nicht in der Sprache der Person gibt: Russisch (Standardsprache in Kasachstan), Kasachisch, Deutsch, Englisch. */
const RUECKFALL = ["ru", "kk", "de", "en"] as const;

/** Die Datei, die zur Sprache passt, sonst die erste nach dem Rueckfall, sonst irgendeine. Ohne Dateien: null. */
export function waehleVideoDatei<T extends { sprache: string }>(dateien: readonly T[], sprache: string): T | null {
  const passend = dateien.find((d) => d.sprache === sprache);
  if (passend) return passend;
  for (const s of RUECKFALL) {
    const d = dateien.find((x) => x.sprache === s);
    if (d) return d;
  }
  return dateien[0] ?? null;
}

/** Minuten und Sekunden einer Dauer; null, wenn keine bekannt ist. */
export function dauerAus(sekunden: number | null): { min: number; sek: number } | null {
  if (sekunden === null || !Number.isFinite(sekunden) || sekunden <= 0) return null;
  const gerundet = Math.round(sekunden);
  return { min: Math.floor(gerundet / 60), sek: gerundet % 60 };
}
