// Die Zustaende der Vergleichsansicht. Bewusst ohne "use client": die Route
// prueft den Pfadparameter serverseitig, und eine Funktion aus einem
// Client-Modul laesst sich vom Server nicht aufrufen.
//
// Runde 1 (Zonenkarte mit eigenen Kennzahlen) und Runde 2 (Zielband,
// Modulknoepfe) sind entschieden und in allen drei Mischungen enthalten.
// Ihre Bilder stehen unter docs/design/uebersicht-entwuerfe-2026-09-21/ und
// docs/design/uebersicht-runde2-2026-09-21/, im Code sind sie weg.
//
//   ist - die heutige Seite, als Bezugspunkt
//   m1  - drei Boxen, die Zonen darin als eigene Karten
//   m2  - dieselben drei Boxen, die Zonen darin flach
//   m3  - Begruessung und Zonen in einer Box, mit der Lage daneben
export const varianten = ["ist", "m1", "m2", "m3"] as const;

export type VariantenSchluessel = (typeof varianten)[number];

export function istVariante(wert: string): wert is VariantenSchluessel {
  return (varianten as readonly string[]).includes(wert);
}
