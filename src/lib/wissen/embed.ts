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
        // keep_alive: Ollama entlaedt das Modell nach fuenf Minuten Ruhe; der naechste Aufruf braucht dann bis zu zehn Sekunden zum Neuladen.
        body: JSON.stringify({ model: modell, input: texte, truncate: true, keep_alive: process.env.WISSEN_EMBED_KEEP_ALIVE ?? "30m" }),
        signal: AbortSignal.timeout(zeitlimit),
      });
      if (!antwort.ok) throw new Error(`Einbettung fehlgeschlagen (${antwort.status}): ${(await antwort.text()).slice(0, 200)}`);
      const daten = (await antwort.json()) as { embeddings?: number[][] };
      if (!daten.embeddings || daten.embeddings.length !== texte.length) throw new Error("Einbettung: unerwartete Antwort");
      return daten.embeddings;
    },
  };
}

/** Einbettung ueber eine OpenAI-kompatible Schnittstelle (POST {url}/embeddings). Damit laeuft dasselbe
 *  Modell (bge-m3) dort, wo Vercel es erreicht (zum Beispiel DeepInfra), und lokal ueber Ollama
 *  (http://127.0.0.1:11434/v1), sodass sich der Weg ohne Zugangsdaten testen laesst. */
export function openaiEinbettung(opts: { url: string; modell: string; schluessel?: string; dimension?: number; zeitlimitMs?: number }): Einbettung {
  const url = opts.url.replace(/\/+$/, "");
  const zeitlimit = opts.zeitlimitMs ?? 20_000;
  const dimension = opts.dimension ?? 1024;
  return {
    modell: opts.modell,
    dimension,
    async einbetten(texte) {
      if (texte.length === 0) return [];
      const antwort = await fetch(`${url}/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(opts.schluessel ? { authorization: `Bearer ${opts.schluessel}` } : {}) },
        body: JSON.stringify({ model: opts.modell, input: texte, encoding_format: "float" }),
        signal: AbortSignal.timeout(zeitlimit),
      });
      if (!antwort.ok) throw new Error(`Einbettung fehlgeschlagen (${antwort.status}): ${(await antwort.text()).slice(0, 200)}`);
      const daten = (await antwort.json()) as { data?: Array<{ index?: number; embedding?: number[] }> };
      if (!Array.isArray(daten.data) || daten.data.length !== texte.length) throw new Error("Einbettung: unerwartete Antwort");
      // Die Reihenfolge ergibt sich aus "index", nicht aus der Lieferreihenfolge.
      const sortiert = [...daten.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const vektoren = sortiert.map((d) => d.embedding ?? []);
      if (vektoren.some((v) => v.length !== dimension)) throw new Error(`Einbettung: erwartet ${dimension} Dimensionen`);
      return vektoren;
    },
  };
}

/** Basis der Sokrates-API (OpenAI-kompatibel), dieselbe wie fuer Sprachein- und -ausgabe. */
export const SOKRATES_BASIS = "https://sokrates.test-qualitaetsmanagement.com/api/v1";

export interface EinbettungsKonfig {
  url: string;
  modell: string;
  schluessel?: string;
  /** Woher die Angaben stammen: ausdruecklich gesetzt oder aus dem vorhandenen Sokrates-Zugang abgeleitet. */
  quelle: "umgebung" | "sokrates";
}

/** Welcher Anbieter bettet die FRAGE ein? (Der Index selbst liegt fest: bge-m3.)
 *    1. WISSEN_EMBED_URL (+ WISSEN_EMBED_MODELL, WISSEN_EMBED_KEY): ausdruecklich, zum Beispiel DeepInfra
 *    2. Produktion mit KI_SOKRATES_API_SCHLUESSEL: die Sokrates-API, ohne weitere Einstellung
 *    3. sonst nichts (lokal: Ollama). */
export function einbettungsKonfig(): EinbettungsKonfig | null {
  const url = process.env.WISSEN_EMBED_URL;
  if (url) {
    return { url, modell: process.env.WISSEN_EMBED_MODELL ?? "bge-m3", schluessel: process.env.WISSEN_EMBED_KEY, quelle: "umgebung" };
  }
  if (process.env.NODE_ENV === "production" && process.env.KI_SOKRATES_API_SCHLUESSEL) {
    return { url: SOKRATES_BASIS, modell: process.env.WISSEN_EMBED_MODELL ?? "bge-m3", schluessel: process.env.WISSEN_EMBED_KEY ?? process.env.KI_SOKRATES_API_SCHLUESSEL, quelle: "sokrates" };
  }
  return null;
}

/** Einbettung fuer die Fragen der Suche (siehe einbettungsKonfig), sonst Ollama (lokal). */
export function wissenEinbettung(): Einbettung {
  const k = einbettungsKonfig();
  if (k) return openaiEinbettung({ url: k.url, modell: k.modell, schluessel: k.schluessel });
  return ollamaEinbettung();
}
