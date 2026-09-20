import type { SuchFilter, Treffer } from "@/lib/wissen/qdrant";
import { sparseIndex, type SparseVektor } from "@/lib/wissen/sparse";

// Suchbackend Postgres/pgvector (Supabase): ruft die SQL-Funktion wissen_suche() auf
// (supabase/migrations/20261102000000_wissen_pgvector.sql). Dieselbe Schnittstelle und dieselben
// Treffer wie hybridSuche() gegen Qdrant, damit suche.ts nicht wissen muss, wo der Index liegt.
//
// Die Rolle wird ZUSAETZLICH zur Zeilensicherheit als Filter mitgegeben: RLS (Rolle aus der
// Sitzung) begrenzt, was diese Person ueberhaupt sehen darf, p_rolle kann nur weiter einschraenken
// (zum Beispiel "Ansicht als Rolle" eines Admins).

/** Das, was von einem Supabase-Client gebraucht wird (klein gehalten: leicht zu ersetzen, leicht zu testen). */
export interface RpcKlient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

interface Zeile {
  id: string;
  punktzahl: number;
  payload: Record<string, unknown>;
}

function istZeile(z: unknown): z is Zeile {
  const r = z as Partial<Zeile> | null;
  return !!r && typeof r.id === "string" && typeof r.punktzahl === "number" && typeof r.payload === "object" && r.payload !== null;
}

export async function hybridSucheSupabase(
  db: RpcKlient,
  frage: { dense: number[][]; sparse: SparseVektor[] },
  filter: SuchFilter,
  opts: { limit?: number; kandidaten?: number } = {},
): Promise<Treffer[]> {
  // Formulierung i: dichter Vektor i und Woerter i gehoeren zusammen.
  const fragen = frage.dense.map((dense, i) => ({
    dense,
    begriffe: (frage.sparse[i]?.indices ?? []).map(sparseIndex),
  }));
  const { data, error } = await db.rpc("wissen_suche", {
    p_fragen: fragen,
    p_limit: opts.limit ?? 8,
    p_kandidaten: opts.kandidaten ?? 40,
    p_rolle: filter.rolle ?? null,
    p_nur_aktuell: filter.nurAktuell !== false,
    p_max_stufe: filter.maxStufe ?? null,
  });
  if (error) throw new Error(`Wissenssuche (Supabase): ${error.message}`);
  if (!Array.isArray(data)) return [];
  return data.filter(istZeile).map((z) => ({ id: z.id, score: z.punktzahl, payload: z.payload }));
}
