import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Zahlen werden ueber next-intl formatiert (useFormatter/getFormatter), damit
// sie dem aktiven Locale folgen. Eine eigene Hilfsfunktion mit fester
// Locale-Vorgabe stand hier und wurde nie aufgerufen - sie ist entfernt, statt
// darauf zu warten, dass jemand sie ohne Locale benutzt.
