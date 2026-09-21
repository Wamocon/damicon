// Die Schluessel der Vergleichsansicht. Bewusst ohne "use client": die Route
// prueft den Pfadparameter serverseitig, und eine Funktion aus einem
// Client-Modul laesst sich vom Server nicht aufrufen.
export const varianten = ["ist", "v1", "v2", "v3", "v4", "v5"] as const;

export type VariantenSchluessel = (typeof varianten)[number];

export function istVariante(wert: string): wert is VariantenSchluessel {
  return (varianten as readonly string[]).includes(wert);
}
