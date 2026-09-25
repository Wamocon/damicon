import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Datenbank-IDs sind UUIDs. Eine andere Kennung aus Adresse oder Formular
 * faende nichts und liesse Postgres mit 22P02 (ungueltige uuid) abbrechen -
 * sie wird vorher abgewiesen.
 */
export function istUuid(wert: string): boolean {
  return UUID.test(wert);
}

// Zahlen werden ueber next-intl formatiert (useFormatter/getFormatter), damit
// sie dem aktiven Locale folgen. Eine eigene Hilfsfunktion mit fester
// Locale-Vorgabe stand hier und wurde nie aufgerufen - sie ist entfernt, statt
// darauf zu warten, dass jemand sie ohne Locale benutzt.
