import type { Formatierer } from "@/lib/format/datum";

// Mengen mit der Einheit der Sprache. Vorher stand " kg" fest hinter der Zahl, in der russischen und der kasachischen Oberfläche also lateinisch,
// während die Beschriftungen dort "кг" sagen.

/**
 * "1.234,5 kg", auf Russisch und Kasachisch "1 234,5 кг". Ohne Angabe bleiben die Nachkommastellen, wie Intl sie wählt (höchstens drei):
 * Ein Wert, den die Datenbank mit zwei Stellen führt, erscheint ungerundet.
 */
export function kilogramm(format: Formatierer, wert: number, hoechstensStellen = 3): string {
  return format.number(wert, { style: "unit", unit: "kilogram", maximumFractionDigits: hoechstensStellen });
}
