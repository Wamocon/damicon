// Die Zustaende der Vergleichsansicht. Bewusst ohne "use client": die Route
// prueft den Pfadparameter serverseitig, und eine Funktion aus einem
// Client-Modul laesst sich vom Server nicht aufrufen.
//
// Runde 1 (ist, v1..v5) ist entschieden: die Zonenkarte mit eigenen
// Kennzahlen hat gewonnen. Ihre Varianten stehen weiter im Git und als Bilder
// unter docs/design/uebersicht-entwuerfe-2026-09-21/, im Code sind sie weg.
//
//   ist   - die heutige Seite, als Bezugspunkt
//   basis - die gewaehlte Richtung, aufgeraeumt und mit Begruessung
//   w1..5 - Weiterentwicklungen darauf, je eine Aenderung
export const varianten = ["ist", "basis", "w1", "w2", "w3", "w4", "w5"] as const;

export type VariantenSchluessel = (typeof varianten)[number];

export function istVariante(wert: string): wert is VariantenSchluessel {
  return (varianten as readonly string[]).includes(wert);
}

/** Nur diese eine Variante braucht die Zaehlung der offenen Vorgaenge. */
export function brauchtTageslage(variante: VariantenSchluessel): boolean {
  return variante === "w3";
}
