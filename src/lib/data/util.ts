// PostgREST liefert eingebettete 1:n-Beziehungen als Array, 1:1-Beziehungen je
// nach Constraint als Objekt. Dieser Helfer normalisiert beides auf "ein
// Datensatz oder null", damit die Views nicht zwei Faelle behandeln muessen.
export function einsAus<T>(wert: T | T[] | null | undefined): T | null {
  if (Array.isArray(wert)) return wert[0] ?? null;
  return wert ?? null;
}

// Datumsangaben aus der Datenbank kommen als ISO-String (YYYY-MM-DD).
// Bewusst das UTC-Datum: die Datenbank rechnet mit current_date in UTC (Supabase-
// Standard), zum Beispiel vergleicht reihenblock_freigeben() die Wartezeit gegen
// dieses Datum. Die Anwendung zieht dieselbe Tagesgrenze, sonst zeigte sie eine
// Wartezeit einige Stunden vor oder nach der Datenbank als abgelaufen.
export function heuteIso(): string {
  return new Date().toISOString().slice(0, 10);
}
