import type { Role } from "@/lib/rbac";
import { einbettungsKonfig, wissenEinbettung, type Einbettung } from "@/lib/wissen/embed";
import { hybridSuche, qdrantAusUmgebung, type SuchFilter, type Treffer } from "@/lib/wissen/qdrant";
import { hybridSucheSupabase, type RpcKlient } from "@/lib/wissen/supabase-suche";
import type { SparseVektor } from "@/lib/wissen/sparse";
import { BUERO_ROLLEN } from "@/lib/wissen/rollen";
import { sparseFrage } from "@/lib/wissen/sparse";

// Die Suche, die der Agent aufruft. Sie macht drei Dinge, die nicht dem Modell
// ueberlassen werden duerfen:
// 1. Die Rolle kommt aus der Sitzung und wird als Filter in die Abfrage
//    geschrieben. Chunks, die die Rolle nicht sehen darf, kommen gar nicht erst
//    zurueck.
// 2. Ueberholte Quellen sind standardmaessig ausgeblendet.
// 3. Jeder Treffer bringt seinen Beleg mit (Fundstelle, Quelle, Link, Stand,
//    Autoritaetsstufe), damit die Antwort darauf zeigen kann.

// Wie viele Plaetze der Trefferliste mindestens fuer Recht und amtliche Texte (Stufe 1 bis 3)
// reserviert sind, sofern es solche Treffer gibt.
const PRIMAER_PLAETZE = 3;
const PRIMAER_MAX_STUFE = 3;

export interface Beleg {
  /** Zitierkennung fuer diese Antwort: S1, S2 ... */
  id: string;
  fundstelle: string;
  titel: string | null;
  sprache: string | null;
  /** 1 Primaerrecht, 2 untergesetzlich, 3 amtliche Erlaeuterung, 4 Fachquelle, 5 Presse. */
  stufe: number | null;
  gueltigAb: string | null;
  gueltigBis: string | null;
  ueberholt: boolean;
  konfidenz: string | null;
  abgerufenAm: string | null;
  url: string | null;
  bereich: string;
  text: string;
  punktzahl: number;
}

export interface SuchErgebnis {
  belege: Beleg[];
  dauerMs: { einbettung: number; suche: number; gesamt: number };
}

export type WissenBackend = "supabase" | "qdrant";

/** Wo liegt der Index? WISSEN_BACKEND=supabase|qdrant ausdruecklich; sonst Qdrant, wenn QDRANT_URL gesetzt
 *  ist oder lokal entwickelt wird; in Produktion Supabase, sobald eine Einbettung fuer die Frage konfiguriert
 *  ist (WISSEN_EMBED_URL oder der vorhandene Sokrates-Zugang). Sonst gibt es (noch) keinen Index. */
export function wissenBackend(): WissenBackend | null {
  const b = process.env.WISSEN_BACKEND;
  if (b === "supabase" || b === "qdrant") return b;
  if (process.env.QDRANT_URL || process.env.NODE_ENV !== "production") return "qdrant";
  if (einbettungsKonfig()) return "supabase";
  return null;
}

// Gesundheit der Einbettung (nur Supabase in Produktion): "konfiguriert" heisst nicht "erreichbar". Ein Anbieter, der
// 403 liefert oder nicht antwortet, wuerde JEDE Rechtsfrage scheitern lassen, weil die Suche erzwungen wird. Deshalb wird
// das Werkzeug erst angeboten, wenn eine Probe gelang. Ergebnis kurz gemerkt (gut: 5 min, schlecht: 1 min), damit sich
// der Anbieter erholen kann und eine Frage nie auf die Probe warten muss.
const PROBE_ZEITLIMIT_MS = 5_000;
const GUT_MS = 5 * 60_000;
const SCHLECHT_MS = 60_000;
let gesundheit: { ok: boolean; bis: number; grund: string | null } | null = null;

/** Nur fuer Tests. */
export function setzeGesundheitZurueck(): void {
  gesundheit = null;
}

export function wissenGesundheit(): { ok: boolean; grund: string | null } | null {
  return gesundheit && gesundheit.bis > Date.now() ? { ok: gesundheit.ok, grund: gesundheit.grund } : null;
}

/** Probe der Einbettung, die die Routen VOR dem Bauen der Werkzeuge abwarten. Ausserhalb von Supabase/Produktion trivial. */
export async function pruefeWissenGesundheit(): Promise<boolean> {
  if (wissenBackend() !== "supabase" || process.env.NODE_ENV !== "production") return wissenVerfuegbar();
  const bekannt = wissenGesundheit();
  if (bekannt) return bekannt.ok;
  let ok = false;
  let grund: string | null = null;
  try {
    const e = wissenEinbettung();
    const v = await Promise.race([
      e.einbetten(["Gesundheitspruefung"]),
      new Promise<never>((_, nein) => setTimeout(() => nein(new Error("Zeitueberschreitung")), PROBE_ZEITLIMIT_MS)),
    ]);
    ok = v.length === 1 && v[0]!.length === e.dimension;
    if (!ok) grund = "unerwartete Antwort";
  } catch (err) {
    grund = String(err instanceof Error ? err.message : err).slice(0, 160);
  }
  gesundheit = { ok, bis: Date.now() + (ok ? GUT_MS : SCHLECHT_MS), grund };
  if (!ok) console.warn(`[damicon] Wissensbasis nicht verfuegbar: Einbettung nicht erreichbar (${grund})`);
  return ok;
}

/** Wissenssuche ist nur sinnvoll, wenn es einen Index UND eine erreichbare Einbettung fuer die Frage gibt. */
export function wissenVerfuegbar(): boolean {
  const backend = wissenBackend();
  if (backend === "qdrant") return true;
  if (backend === "supabase") {
    if (process.env.NODE_ENV !== "production") return true;
    return einbettungsKonfig() !== null && wissenGesundheit()?.ok === true;
  }
  return false;
}

type Frage = { dense: number[][]; sparse: SparseVektor[] };
type Kandidatensuche = (filter: SuchFilter, opts: { limit: number }) => Promise<Treffer[]>;

/** Baut die Kandidatensuche fuer das gewaehlte Backend. Bei Supabase gilt die Sitzung der aufrufenden Person (RLS). */
async function kandidatensuche(frage: Frage, supabase?: RpcKlient): Promise<Kandidatensuche> {
  if (wissenBackend() === "supabase") {
    const db = supabase ?? ((await (await import("@/lib/supabase/server")).createClient()) as unknown as RpcKlient);
    return (filter, opts) => hybridSucheSupabase(db, frage, filter, opts);
  }
  const verbindung = qdrantAusUmgebung();
  return (filter, opts) => hybridSuche(verbindung, frage, filter, opts);
}

export function darfWissenNutzen(rolle: Role | null | undefined): boolean {
  return !!rolle && (BUERO_ROLLEN as string[]).includes(rolle);
}

// Kleiner Zwischenspeicher fuer Einbettungen von Fragen: dieselbe Frage (oder ein
// wiederholter Nachfrage-Schritt) kostet dann keine Rechenzeit.
const CACHE_MAX = 200;
const cache = new Map<string, number[]>();
async function einbettenMitCache(e: Einbettung, texte: string[]): Promise<number[][]> {
  const fehlend = texte.filter((t) => !cache.has(`${e.modell}|${t}`));
  if (fehlend.length > 0) {
    const neu = await e.einbetten(fehlend);
    fehlend.forEach((t, i) => {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(`${e.modell}|${t}`, neu[i]!);
    });
  }
  return texte.map((t) => cache.get(`${e.modell}|${t}`)!);
}

function alsBeleg(t: Treffer, nr: number): Beleg {
  const p = t.payload as Record<string, unknown>;
  const s = (k: string): string | null => (typeof p[k] === "string" && p[k] ? (p[k] as string) : null);
  return {
    id: `S${nr}`,
    fundstelle: s("kontext") ?? s("titel") ?? "Quelle",
    titel: s("titel"),
    sprache: s("sprache"),
    stufe: typeof p.autoritaetsstufe === "number" ? p.autoritaetsstufe : null,
    gueltigAb: s("gueltig_ab"),
    gueltigBis: s("gueltig_bis"),
    ueberholt: p.ist_ueberholt === true,
    konfidenz: s("konfidenz"),
    abgerufenAm: s("abgerufen_am"),
    url: s("url"),
    bereich: s("bereich") ?? "",
    text: s("text") ?? "",
    punktzahl: Number(t.score.toFixed(4)),
  };
}

export async function sucheWissen(
  fragen: { frage: string; frageRussisch?: string | null },
  rolle: Role,
  opts: { limit?: number; nurAktuell?: boolean; einbettung?: Einbettung; supabase?: RpcKlient } = {},
): Promise<SuchErgebnis> {
  const t0 = performance.now();
  const formulierungen = [fragen.frage, fragen.frageRussisch ?? ""].map((t) => t.trim()).filter(Boolean);
  const einbettung = opts.einbettung ?? wissenEinbettung();
  const dense = await einbettenMitCache(einbettung, formulierungen);
  const t1 = performance.now();
  const nurAktuell = opts.nurAktuell ?? true;
  const limit = opts.limit ?? 6;
  const frage = { dense, sparse: formulierungen.map(sparseFrage) };
  const suchen = await kandidatensuche(frage, opts.supabase);
  // Zwei Listen parallel: alle Quellen und nur Recht/amtliche Texte (Stufe 1 bis 3). Fachseiten
  // und Blogs sind in Alltagssprache geschrieben und ranken bei Sachfragen sonst vor dem
  // Gesetz - fuer Rechtsfragen muss der Gesetzestext aber immer dabei sein.
  const [primaer, alle] = await Promise.all([
    suchen({ rolle, nurAktuell, maxStufe: PRIMAER_MAX_STUFE }, { limit: PRIMAER_PLAETZE + 2 }),
    suchen({ rolle, nurAktuell }, { limit }),
  ]);
  const gesehen = new Set<string>();
  const treffer: Treffer[] = [];
  for (const t of [...primaer.slice(0, PRIMAER_PLAETZE), ...alle, ...primaer.slice(PRIMAER_PLAETZE)]) {
    if (gesehen.has(t.id)) continue;
    gesehen.add(t.id);
    treffer.push(t);
  }
  treffer.length = Math.min(treffer.length, limit);
  const t2 = performance.now();
  return {
    belege: treffer.map((t, i) => alsBeleg(t, i + 1)),
    dauerMs: { einbettung: Math.round(t1 - t0), suche: Math.round(t2 - t1), gesamt: Math.round(t2 - t0) },
  };
}
