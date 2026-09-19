import type { Role } from "@/lib/rbac";
import { ollamaEinbettung, type Einbettung } from "@/lib/wissen/embed";
import { hybridSuche, qdrantAusUmgebung, type Treffer } from "@/lib/wissen/qdrant";
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

/** Wissenssuche ist nur sinnvoll, wenn es einen Index gibt: lokal immer, in Produktion nur mit QDRANT_URL. */
export function wissenVerfuegbar(): boolean {
  return Boolean(process.env.QDRANT_URL) || process.env.NODE_ENV !== "production";
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
  opts: { limit?: number; nurAktuell?: boolean; einbettung?: Einbettung } = {},
): Promise<SuchErgebnis> {
  const t0 = performance.now();
  const formulierungen = [fragen.frage, fragen.frageRussisch ?? ""].map((t) => t.trim()).filter(Boolean);
  const einbettung = opts.einbettung ?? ollamaEinbettung();
  const dense = await einbettenMitCache(einbettung, formulierungen);
  const t1 = performance.now();
  const treffer = await hybridSuche(
    qdrantAusUmgebung(),
    { dense, sparse: formulierungen.map(sparseFrage) },
    { rolle, nurAktuell: opts.nurAktuell ?? true },
    { limit: opts.limit ?? 6 },
  );
  const t2 = performance.now();
  return {
    belege: treffer.map((t, i) => alsBeleg(t, i + 1)),
    dauerMs: { einbettung: Math.round(t1 - t0), suche: Math.round(t2 - t1), gesamt: Math.round(t2 - t0) },
  };
}
