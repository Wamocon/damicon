import type { SparseVektor } from "@/lib/wissen/sparse";

// Minimaler Qdrant-Client ueber REST (kein zusaetzliches Paket). Nur was die
// Wissenssuche braucht: Sammlung anlegen, Punkte schreiben, hybrid suchen.
//
// Aufbau der Sammlung:
// - "dense": bge-m3, 1024 Dimensionen, Kosinus, int8-Quantisierung im RAM
//   (viermal weniger Speicher, kaum Genauigkeitsverlust, schneller).
// - "text": sparse Vektor mit IDF-Gewichtung durch Qdrant.
// - Payload-Indizes auf allem, wonach gefiltert wird (Sprache, Stufe, ueberholt,
//   Bereich, Rollen), damit die Filter nicht die Suche verlangsamen.

export interface QdrantVerbindung {
  url: string;
  apiKey?: string;
  sammlung: string;
}

export function qdrantAusUmgebung(): QdrantVerbindung {
  return {
    url: (process.env.QDRANT_URL ?? "http://127.0.0.1:6333").replace(/\/+$/, ""),
    apiKey: process.env.QDRANT_API_KEY || undefined,
    sammlung: process.env.QDRANT_SAMMLUNG ?? "damicon_wissen_bge_m3",
  };
}

async function aufruf<T = unknown>(v: QdrantVerbindung, methode: string, pfad: string, body?: unknown): Promise<T> {
  const antwort = await fetch(`${v.url}${pfad}`, {
    method: methode,
    headers: { "content-type": "application/json", ...(v.apiKey ? { "api-key": v.apiKey } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!antwort.ok) throw new Error(`Qdrant ${methode} ${pfad}: ${antwort.status} ${(await antwort.text()).slice(0, 300)}`);
  return (await antwort.json()) as T;
}

const INDIZES: Array<[string, "keyword" | "integer" | "bool"]> = [
  ["sprache", "keyword"],
  ["bereich", "keyword"],
  ["autoritaetsstufe", "integer"],
  ["ist_ueberholt", "bool"],
  ["rollen", "keyword"],
  ["norm_id", "keyword"],
  ["quelle_id", "keyword"],
];

export async function stelleSammlungSicher(v: QdrantVerbindung, dimension: number): Promise<"angelegt" | "vorhanden"> {
  const existiert = await fetch(`${v.url}/collections/${v.sammlung}`, { headers: v.apiKey ? { "api-key": v.apiKey } : {} });
  if (existiert.ok) return "vorhanden";
  await aufruf(v, "PUT", `/collections/${v.sammlung}`, {
    vectors: { dense: { size: dimension, distance: "Cosine" } },
    sparse_vectors: { text: { modifier: "idf" } },
    quantization_config: { scalar: { type: "int8", quantile: 0.99, always_ram: true } },
    hnsw_config: { m: 16, ef_construct: 128 },
  });
  for (const [feld, schema] of INDIZES) {
    await aufruf(v, "PUT", `/collections/${v.sammlung}/index?wait=true`, { field_name: feld, field_schema: schema });
  }
  return "angelegt";
}

export interface Punkt {
  id: string;
  dense: number[];
  sparse: SparseVektor;
  payload: Record<string, unknown>;
}

export async function schreibePunkte(v: QdrantVerbindung, punkte: Punkt[]): Promise<void> {
  if (punkte.length === 0) return;
  await aufruf(v, "PUT", `/collections/${v.sammlung}/points?wait=true`, {
    points: punkte.map((p) => ({ id: p.id, vector: { dense: p.dense, text: p.sparse }, payload: p.payload })),
  });
}

/** Welche der IDs gibt es schon? Grundlage zum Fortsetzen eines unterbrochenen Einlesens. */
export async function vorhandeneIds(v: QdrantVerbindung, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const r = await aufruf<{ result: Array<{ id: string }> }>(v, "POST", `/collections/${v.sammlung}/points`, {
    ids,
    with_payload: false,
    with_vector: false,
  });
  return new Set(r.result.map((p) => String(p.id)));
}

/** Loescht alle Punkte eines Bereichs (vor dem erneuten Einlesen mit geaendertem Chunking oder Payload). */
export async function loescheBereich(v: QdrantVerbindung, bereich: string): Promise<void> {
  await aufruf(v, "POST", `/collections/${v.sammlung}/points/delete?wait=true`, {
    filter: { must: [{ key: "bereich", match: { value: bereich } }] },
  });
}

export async function anzahl(v: QdrantVerbindung): Promise<number> {
  const r = await aufruf<{ result: { count: number } }>(v, "POST", `/collections/${v.sammlung}/points/count`, { exact: true });
  return r.result.count;
}

export interface Treffer {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface SuchFilter {
  /** Nur Chunks, die diese Rolle sehen darf (payload.rollen). Wird IMMER vom Server gesetzt, nie vom Modell. */
  rolle?: string;
  sprachen?: string[];
  /** true (Standard): ueberholte Quellen ausblenden. */
  nurAktuell?: boolean;
  bereiche?: string[];
  maxStufe?: number;
}

function filterVon(f: SuchFilter) {
  const must: unknown[] = [];
  if (f.rolle) must.push({ key: "rollen", match: { any: [f.rolle] } });
  if (f.sprachen?.length) must.push({ key: "sprache", match: { any: f.sprachen } });
  if (f.nurAktuell !== false) must.push({ key: "ist_ueberholt", match: { value: false } });
  if (f.bereiche?.length) must.push({ key: "bereich", match: { any: f.bereiche } });
  if (f.maxStufe !== undefined) must.push({ key: "autoritaetsstufe", range: { lte: f.maxStufe } });
  return { must };
}

/** Hybridsuche: dichte und lexikalische Kandidaten parallel, per RRF vereint.
 *  Es duerfen mehrere Formulierungen der Frage mitgegeben werden (z. B. die Frage des
 *  Nutzers und dieselbe Frage auf Russisch): jede erzeugt eine eigene Kandidatenliste,
 *  alle werden in einem Durchgang zusammengefuehrt. */
export async function hybridSuche(
  v: QdrantVerbindung,
  frage: { dense: number[][]; sparse: SparseVektor[] },
  filter: SuchFilter,
  opts: { limit?: number; kandidaten?: number } = {},
): Promise<Treffer[]> {
  const kandidaten = opts.kandidaten ?? 40;
  const f = filterVon(filter);
  const prefetch = [
    ...frage.dense.map((query) => ({ query, using: "dense", limit: kandidaten, filter: f })),
    ...frage.sparse.filter((q) => q.indices.length > 0).map((query) => ({ query, using: "text", limit: kandidaten, filter: f })),
  ];
  const r = await aufruf<{ result: { points: Treffer[] } }>(v, "POST", `/collections/${v.sammlung}/points/query`, {
    prefetch,
    query: { fusion: "rrf" },
    limit: opts.limit ?? 8,
    with_payload: true,
  });
  return r.result.points.map((pt) => ({ id: String(pt.id), score: pt.score, payload: pt.payload }));
}
