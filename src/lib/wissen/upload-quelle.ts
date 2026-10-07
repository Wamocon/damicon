// Woran eine hochgeladene Textstelle zu erkennen ist. Eine einzige Stelle fuer die Kennzeichen, ohne jede
// Abhaengigkeit: Server (hochladen.ts, loeschen.ts), Oberflaeche (dokumente-liste.ts) und das ETL-Skript
// (scripts/wissen-nach-supabase.ts) lesen dieselben Werte. Vorher stand "upload" an mehr als fuenf Stellen
// als Zeichenkette.
//
// Eine Zeile gilt nur dann als Upload, wenn BEIDES zutrifft: extra.quelle = "upload" und eine quelle_id mit dem
// Vorsatz "upload:". Das Einlese-Skript vergibt Pfade wie "recht/nk-rk.md" und setzt nie extra.quelle = "upload".

/** Wert in `extra.quelle`: der ETL-Spiegelmodus (--bereinigen) laesst solche Zeilen stehen. */
export const UPLOAD_QUELLE = "upload";

/** Vorsatz der quelle_id eines hochgeladenen Dokuments ("upload:<32 Hex>"). */
export const UPLOAD_PRAEFIX = "upload:";

/** Filter fuer SQL (LIKE) und PostgREST (.like): alle quelle_id eines Uploads. */
export const UPLOAD_QUELLE_MUSTER = `${UPLOAD_PRAEFIX}%`;

/** Quell-Kennung aus dem Inhalts-Hash: die ersten 32 Hexzeichen. */
export function uploadQuelleId(hash: string): string {
  return `${UPLOAD_PRAEFIX}${hash.slice(0, 32)}`;
}

/** Hat eine quelle_id die Form, die nur der Upload vergibt? */
export function istUploadQuelleId(quelleId: string): boolean {
  return /^upload:[0-9a-f]{32}$/.test(quelleId);
}

/** Ist diese Zeile (so wie die Datenbank sie liefert) eine hochgeladene? Beide Kennzeichen muessen stimmen. */
export function istUploadZeile(z: { quelle_id: string | null; upload_quelle: string | null }): boolean {
  return z.upload_quelle === UPLOAD_QUELLE && (z.quelle_id ?? "").startsWith(UPLOAD_PRAEFIX);
}
