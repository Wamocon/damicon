// Übersetzungen der Freitextspalten (Migration 20261211010000): dieselbe Zeile in jeder Sprache der Oberfläche lesbar.
//
// Das Original steht in der Spalte selbst (die Sprache, in der die Zeile erfasst wurde), die Übersetzungen in der jsonb-Spalte i18n derselben Zeile:
//   { "bezeichnung": { "en": "...", "ru": "...", "kk": "..." }, "notiz": { ... } }
// Die Oberfläche zeigt die Übersetzung der gewählten Sprache und fällt auf das Original zurück, wenn es keine gibt. Nie eine leere Stelle.
//
// Bearbeitungsformulare zeigen immer das Original: wer eine übersetzte Zeile ändert, ändert ihre Quelle, und der Trigger der Datenbank nimmt die
// veralteten Übersetzungen dieser Spalte zurück.

export const DATEN_SPRACHEN = ["de", "en", "ru", "kk"] as const;
export type DatenSprache = (typeof DATEN_SPRACHEN)[number];

/** Je Spalte die Übersetzungen nach Sprache. Eine Sprache ohne Eintrag hat keine Übersetzung. */
export type I18nSpalte = Record<string, Partial<Record<DatenSprache, string>>>;

const istSprache = (wert: string): wert is DatenSprache => (DATEN_SPRACHEN as readonly string[]).includes(wert);

/** Liest die jsonb-Spalte defensiv: ein Fremdwert (kein Objekt, falsche Typen, leere Texte) fällt weg, die Seite bleibt heil. */
export function liesI18n(roh: unknown): I18nSpalte {
  const aus: I18nSpalte = {};
  if (typeof roh !== "object" || roh === null || Array.isArray(roh)) return aus;
  for (const [spalte, sprachen] of Object.entries(roh)) {
    if (typeof sprachen !== "object" || sprachen === null || Array.isArray(sprachen)) continue;
    const treffer: Partial<Record<DatenSprache, string>> = {};
    for (const [sprache, text] of Object.entries(sprachen)) {
      if (istSprache(sprache) && typeof text === "string" && text.trim() !== "") treffer[sprache] = text;
    }
    if (Object.keys(treffer).length > 0) aus[spalte] = treffer;
  }
  return aus;
}

/** Der Text der Spalte in der Sprache; ohne Übersetzung das Original. `sprache` darf ein beliebiger Text sein (etwa die Sprache der Adresse). */
export function uebersetzt(i18n: I18nSpalte | null | undefined, spalte: string, sprache: string, original: string): string {
  if (!i18n || !istSprache(sprache)) return original;
  return i18n[spalte]?.[sprache] ?? original;
}

/** Wie uebersetzt(), für Spalten, die leer sein dürfen: ohne Original bleibt es leer, eine Übersetzung ohne Original gibt es nicht. */
export function uebersetztOderNull(i18n: I18nSpalte | null | undefined, spalte: string, sprache: string, original: string | null | undefined): string | null {
  if (original === null || original === undefined) return null;
  return uebersetzt(i18n, spalte, sprache, original);
}
