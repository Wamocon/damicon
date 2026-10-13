// Dateigrößen für die Anzeige. Eine Stelle für das, was die Bücher-Oberfläche (Meldung zur Obergrenze) und das Prüffenster (Größe des Originals)
// vorher je auf eigene Art schrieben. Reine Funktion ohne Abhängigkeit, damit sie im Browser und in Tests läuft.

export const KIB = 1024;
export const MIB = 1024 * KIB;
export const GIB = 1024 * MIB;

const EINHEITEN = {
  standard: { gb: "GB", mb: "MB", kb: "KB" },
  kyrillisch: { gb: "ГБ", mb: "МБ", kb: "КБ" },
} as const;

/**
 * Größe mit passender Einheit: ab 0,1 GB in GB (höchstens zwei Nachkommastellen), ab 1 MB in MB (eine Stelle), darunter in KB (mindestens 1).
 * Zahl und Einheit richten sich nach der Sprache (ru und kk schreiben ГБ, МБ, КБ).
 */
export function formatiereGroesse(bytes: number, locale: string): string {
  const e = locale === "ru" || locale === "kk" ? EINHEITEN.kyrillisch : EINHEITEN.standard;
  const wert = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const zahl = (x: number, stellen: number) => x.toLocaleString(locale, { maximumFractionDigits: stellen });
  if (wert >= GIB / 10) return `${zahl(wert / GIB, 2)} ${e.gb}`;
  if (wert >= MIB) return `${zahl(wert / MIB, 1)} ${e.mb}`;
  return `${zahl(Math.max(1, Math.round(wert / KIB)), 0)} ${e.kb}`;
}
