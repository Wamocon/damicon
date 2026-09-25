// Legt die Texte einer Sprache ueber die deutsche Fassung: fehlende oder leere
// Schluessel fallen auf Deutsch zurueck. Eigene Datei, damit die Tests genau
// dieselbe Regel nutzen wie die Laufzeit (request.ts) statt einer Kopie.

export type MessageTree = { [key: string]: string | MessageTree };

export function deepMerge(base: MessageTree, override: MessageTree): MessageTree {
  const result: MessageTree = { ...base };
  for (const key of Object.keys(override)) {
    const overrideValue = override[key];
    const baseValue = result[key];
    if (
      typeof overrideValue === "object" &&
      overrideValue !== null &&
      typeof baseValue === "object" &&
      baseValue !== null
    ) {
      result[key] = deepMerge(baseValue, overrideValue);
    } else if (overrideValue !== undefined && overrideValue !== "") {
      result[key] = overrideValue;
    }
  }
  return result;
}
