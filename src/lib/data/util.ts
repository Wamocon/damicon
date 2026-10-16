// PostgREST liefert eingebettete 1:n-Beziehungen als Array, 1:1-Beziehungen je
// nach Constraint als Objekt. Dieser Helfer normalisiert beides auf "ein
// Datensatz oder null", damit die Views nicht zwei Faelle behandeln muessen.
export function einsAus<T>(wert: T | T[] | null | undefined): T | null {
  if (Array.isArray(wert)) return wert[0] ?? null;
  return wert ?? null;
}

/** Zeilen je Anfrage: PostgREST kappt jede Antwort bei max_rows (Supabase: 1000) OHNE Fehler. */
export const SEITE_ZEILEN = 1000;

/**
 * Liest ALLE Zeilen einer Abfrage seitenweise. Wer ohne Seiten liest, bekommt bei mehr als 1000 Zeilen still die ersten 1000 in beliebiger Reihenfolge
 * (Prüfung PR #156, 15.10.2026: bei der ЕСУТД-Liste fehlten ab 1000 Zeilen beliebige offene Meldungen, die Meldefrist wäre versäumt worden).
 * `seite` baut die Abfrage mit einer FESTEN Reihenfolge und .range(von, bis); ohne feste Reihenfolge verschieben sich die Seiten. Wirft bei einem
 * Datenbankfehler (ein Fehler darf nie wie "nichts da" aussehen). `abgeschnitten` ist wahr, wenn maxSeiten erreicht wurde und es noch mehr gäbe.
 */
export async function leseAlleZeilen<T>(
  seite: (von: number, bis: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  opts: { seitenGroesse?: number; maxSeiten?: number } = {},
): Promise<{ zeilen: T[]; abgeschnitten: boolean }> {
  const groesse = opts.seitenGroesse ?? SEITE_ZEILEN;
  const maxSeiten = opts.maxSeiten ?? 50;
  const zeilen: T[] = [];
  for (let nr = 0; nr < maxSeiten; nr++) {
    const { data, error } = await seite(nr * groesse, nr * groesse + groesse - 1);
    if (error) throw new Error(error.message);
    const teil = data ?? [];
    zeilen.push(...teil);
    if (teil.length < groesse) return { zeilen, abgeschnitten: false };
  }
  return { zeilen, abgeschnitten: true };
}

// Datumsangaben aus der Datenbank kommen als ISO-String (YYYY-MM-DD).
// Bewusst das UTC-Datum: die Datenbank rechnet mit current_date in UTC (Supabase-
// Standard), zum Beispiel vergleicht reihenblock_freigeben() die Wartezeit gegen
// dieses Datum. Die Anwendung zieht dieselbe Tagesgrenze, sonst zeigte sie eine
// Wartezeit einige Stunden vor oder nach der Datenbank als abgelaufen.
export function heuteIso(): string {
  return new Date().toISOString().slice(0, 10);
}
