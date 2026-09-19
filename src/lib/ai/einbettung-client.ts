// Ruft ein Einbettungsmodell auf Sokrates-2 auf: Ollamas natives
// /api/embeddings, NICHT die OpenAI-kompatible /v1/chat/completions-Route aus
// anfrage.ts/anbieter-client.ts - die ist fuer Chat, nicht fuer Einbettungen.
// Eigene, kleine Datei aus demselben Grund wie transkription-client.ts:
// moeglicherweise ein anderer Dienst, anderes Anfrage-/Antwortformat, eigenes
// Zeitlimit.
//
// Gegen den echten Dienst geprueft (19.09.2026): nomic-embed-text liegt auf
// Sokrates-2 (rund 274 MB, verdraengt die grossen Chat-Modelle nicht) und
// liefert bestaetigt 768 Dimensionen - genau die Spaltenbreite der Migration
// 20261031000000_ki_wissen_dokumente.sql. Wird das Modell dort entfernt oder
// gegen eines mit anderer Dimension getauscht, faengt die Pruefung gegen
// ERWARTETE_EINBETTUNGS_DIMENSION das ab, bevor etwas geschrieben wird.

export type EinbettungAntwort = { ok: true; vektor: number[] } | { ok: false; grund: string };

const STANDARD_ZEITLIMIT_MS = 30_000;

export function einbettungZeitlimitMs(): number {
  const wert = Number(process.env.KI_EINBETTUNG_ZEITLIMIT_MS);
  return Number.isFinite(wert) && wert >= 1_000 && wert <= 120_000 ? wert : STANDARD_ZEITLIMIT_MS;
}

export function einbettungBasisUrl(): string {
  return process.env.KI_EINBETTUNG_URL ?? "http://192.168.178.136:11434";
}

export function einbettungModell(): string {
  return process.env.KI_EINBETTUNG_MODELL ?? "nomic-embed-text";
}

// Erwartete Vektor-Laenge fuer die aktuelle Spaltendefinition
// (ki_wissen_chunks.embedding, Migration 20261031000000). Passt zu
// nomic-embed-text; ein anderes Modell mit anderer Dimension braucht eine
// eigene Migration (Spalte neu anlegen, alle Chunks neu einbetten) - kein
// stiller Mismatch, deshalb die Pruefung unten statt eines ungeprueften
// Durchreichens an Postgres.
export const ERWARTETE_EINBETTUNGS_DIMENSION = 768;

// pgvector nimmt ueber PostgREST kein JSON-Array entgegen, sondern seine
// eigene Textform "[0.1,0.2,...]" - supabase-js typisiert die Spalte bzw. den
// RPC-Parameter deshalb als string, nicht als number[]. Am 19.09.2026 beim
// ersten Lauf gegen echtes Postgres aufgefallen (tsc: "Type 'number[]' is not
// assignable to type 'string'"); ohne diese Umwandlung schreibt der Upload
// nichts und die Aehnlichkeitssuche findet nichts.
// Eine Stelle fuer beide Aufrufer (actions/ki-wissen.ts beim Einfuegen,
// data/ki-wissen.ts beim Suchen), damit die Form nicht zweimal gepflegt wird.
export function alsVektorLiteral(vektor: number[]): string {
  return `[${vektor.join(",")}]`;
}

export async function erzeugeEinbettung(text: string): Promise<EinbettungAntwort> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), einbettungZeitlimitMs());

  try {
    const antwort = await fetch(`${einbettungBasisUrl()}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: einbettungModell(), prompt: text }),
      signal: controller.signal,
    });

    if (!antwort.ok) {
      const auszug = await antwort.text().catch(() => "");
      return { ok: false, grund: `http-${antwort.status}: ${auszug.slice(0, 200)}` };
    }

    const json = (await antwort.json().catch(() => null)) as { embedding?: unknown } | null;
    const vektor = json?.embedding;
    if (!Array.isArray(vektor) || vektor.length === 0 || !vektor.every((z) => typeof z === "number")) {
      return { ok: false, grund: "antwort-unerwartete-form" };
    }
    if (vektor.length !== ERWARTETE_EINBETTUNGS_DIMENSION) {
      return {
        ok: false,
        grund: `unerwartete-dimension: ${vektor.length} statt ${ERWARTETE_EINBETTUNGS_DIMENSION}`,
      };
    }

    return { ok: true, vektor };
  } catch (error) {
    const grund = error instanceof Error ? error.message : String(error);
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : grund };
  } finally {
    clearTimeout(timeout);
  }
}
