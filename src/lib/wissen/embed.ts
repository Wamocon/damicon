// Einbettung von Texten. Bewusst hinter einer kleinen Schnittstelle: Lokal laeuft
// bge-m3 ueber Ollama, fuer Produktion (Vercel erreicht keinen Laptop) kommt ein
// gehosteter Anbieter mit DEMSELBEN Modell oder einem anderen, dann muss der
// Index einmal neu aufgebaut werden - ein Wechsel des Modells aendert den
// Vektorraum. Deshalb steht das Modell im Sammlungsnamen und in der
// Konfiguration, nicht verstreut im Code.

export interface Einbettung {
  modell: string;
  dimension: number;
  /** Ein Aufruf fuer mehrere Texte (Batch). Die Reihenfolge der Ergebnisse entspricht der Eingabe. */
  einbetten(texte: string[]): Promise<number[][]>;
}

export function ollamaEinbettung(opts?: { url?: string; modell?: string; zeitlimitMs?: number }): Einbettung {
  const url = (opts?.url ?? process.env.WISSEN_EMBED_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
  const modell = opts?.modell ?? process.env.WISSEN_EMBED_MODELL ?? "bge-m3";
  const zeitlimit = opts?.zeitlimitMs ?? 180_000;
  return {
    modell,
    dimension: 1024,
    async einbetten(texte) {
      if (texte.length === 0) return [];
      const antwort = await fetch(`${url}/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: modell, input: texte, truncate: true }),
        signal: AbortSignal.timeout(zeitlimit),
      });
      if (!antwort.ok) throw new Error(`Einbettung fehlgeschlagen (${antwort.status}): ${(await antwort.text()).slice(0, 200)}`);
      const daten = (await antwort.json()) as { embeddings?: number[][] };
      if (!daten.embeddings || daten.embeddings.length !== texte.length) throw new Error("Einbettung: unerwartete Antwort");
      return daten.embeddings;
    },
  };
}
