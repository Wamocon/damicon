import type { createFormatter } from "next-intl";

// Kalendertage und Monate ohne Uhrzeit, so wie die Oberfläche sie zeigt. Vorher stand derselbe Ausdruck
// (ein Date aus "JJJJ-MM-TT plus T00:00:00Z", formatiert in der Zeitzone UTC) in neun Komponenten.
//
// Warum UTC: Ein Kalendertag wie "2026-10-14" hat keine Zeitzone. Als Mitternacht UTC gelesen und in UTC formatiert, bleibt es der 14., egal wo der Server oder der Browser
// läuft. Mit der Zeitzone des Betriebs läge Mitternacht UTC schon am 14. um 5 Uhr und ein Formatieren in einer Zone westlich von UTC zeigte den 13.

/** Der Formatierer von next-intl, wie ihn getFormatter() (Server) und useFormatter() (Client) liefern. */
export type Formatierer = ReturnType<typeof createFormatter>;

/** "14. Okt. 2026": ein Kalendertag aus "JJJJ-MM-TT" (längere Zeitstempel werden auf den Tag gekürzt). */
export function kalendertag(format: Formatierer, iso: string, stil: "short" | "medium" | "long" | "full" = "medium"): string {
  return format.dateTime(new Date(`${iso.slice(0, 10)}T00:00:00Z`), { dateStyle: stil, timeZone: "UTC" });
}

/** "Oktober 2026": der Monat eines Kalendertags. */
export function kalendermonat(format: Formatierer, iso: string): string {
  return format.dateTime(new Date(`${iso.slice(0, 10)}T00:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" });
}
