// Laufzeit-Entdeckung des Datenmodells fuer den KI-Agenten. Statt fuer jede
// Tabelle ein eigenes Werkzeug zu pflegen, liest der Agent das Schema, das
// PostgREST selbst veroeffentlicht (OpenAPI unter /rest/v1/) - eine neue
// Tabelle oder Spalte ist damit ohne jede Aenderung am Agenten abfragbar,
// sobald die Migration eingespielt ist.
//
// Sicherheitsmodell (in dieser Reihenfolge):
//   1. Jede Abfrage laeuft mit der Sitzung des ANGEMELDETEN Nutzers, nicht mit
//      einem Dienstschluessel. RLS entscheidet je Zeile, was diese Rolle
//      sieht - gemessen: ein Kunde sieht nur die eigene Reklamation, ein
//      Pfluecker nur die eigenen Zeilen, Finanz-/Lohntabellen nur das Buero.
//   2. Tabellen und Spalten, die nie in eine Modellantwort gehoeren
//      (Schluessel, Tokens, Protokolle, Chatverlauf), sind hier hart
//      ausgeschlossen - unabhaengig davon, was RLS erlaubt.
//   3. Tabellen-, Spalten- und Operatornamen werden gegen das entdeckte
//      Schema bzw. eine feste Liste geprueft; das Modell formuliert nie SQL.

import { createClient } from "@/lib/supabase/server";
import { DATENBANK_SCHEMA } from "@/lib/supabase/schema";

export interface SpaltenInfo {
  name: string;
  typ: string;
  /** "tabelle.spalte", falls die Spalte ein Fremdschluessel ist. */
  verweistAuf: string | null;
  pflicht: boolean;
}

export interface TabellenInfo {
  name: string;
  beschreibung: string;
  spalten: SpaltenInfo[];
}

/** Tabellen, die der Agent nie liest - Geheimnisse, Protokolle, Chatverlauf,
 *  Sync-/Ausgangswarteschlangen. */
const GESPERRTE_TABELLEN = new Set([
  "ki_anbieter",
  "ki_chat_nachrichten",
  "audit_events",
  "personenbezogene_zugriffe",
  "sync_protokoll",
  "integration_outbox",
  "kundeneinladungen",
]);

const GESPERRTE_SPALTEN = /(passwort|password|secret|token|chiffrat|api_key|schluessel)/i;

const CACHE_MS = 10 * 60 * 1000;
let cache: { stand: number; tabellen: Map<string, TabellenInfo> } | null = null;

interface OpenApiSpalte {
  format?: string;
  type?: string;
  description?: string;
}
interface OpenApiTabelle {
  description?: string;
  required?: string[];
  properties?: Record<string, OpenApiSpalte>;
}

function fremdschluessel(beschreibung: string | undefined): string | null {
  const treffer = beschreibung?.match(/Foreign Key to `([^`]+)`/);
  return treffer?.[1] ?? null;
}

async function ladeSchema(): Promise<Map<string, TabellenInfo>> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return new Map();

  const antwort = await fetch(`${url}/rest/v1/`, {
    // Accept-Profile waehlt das Schema; ohne ihn beschreibt PostgREST immer das erste freigegebene
    headers: {
      apikey: anon,
      authorization: `Bearer ${token}`,
      accept: "application/openapi+json",
      "accept-profile": DATENBANK_SCHEMA,
    },
    cache: "no-store",
  });
  if (!antwort.ok) return new Map();

  const spec = (await antwort.json()) as { definitions?: Record<string, OpenApiTabelle> };
  const tabellen = new Map<string, TabellenInfo>();
  for (const [name, def] of Object.entries(spec.definitions ?? {})) {
    if (GESPERRTE_TABELLEN.has(name)) continue;
    const pflicht = new Set(def.required ?? []);
    const spalten: SpaltenInfo[] = Object.entries(def.properties ?? {})
      .filter(([spalte]) => !GESPERRTE_SPALTEN.test(spalte))
      .map(([spalte, info]) => ({
        name: spalte,
        typ: info.format ?? info.type ?? "text",
        verweistAuf: fremdschluessel(info.description),
        pflicht: pflicht.has(spalte),
      }));
    tabellen.set(name, {
      name,
      beschreibung: (def.description ?? "").split("\n")[0]?.trim() ?? "",
      spalten,
    });
  }
  return tabellen;
}

/** Das (fuer alle angemeldeten Rollen gleiche) Datenmodell, zehn Minuten
 *  zwischengespeichert. Was eine Rolle daraus TATSAECHLICH sieht, bestimmt RLS
 *  erst bei der Abfrage. */
export async function ladeDatenmodell(): Promise<Map<string, TabellenInfo>> {
  if (cache && Date.now() - cache.stand < CACHE_MS) return cache.tabellen;
  const tabellen = await ladeSchema();
  if (tabellen.size > 0) cache = { stand: Date.now(), tabellen };
  return tabellen;
}

export const FILTER_OPERATOREN = ["gleich", "ungleich", "groesser", "groesserGleich", "kleiner", "kleinerGleich", "enthaelt", "istLeer", "istNichtLeer"] as const;
export type FilterOperator = (typeof FILTER_OPERATOREN)[number];

export const PostgrestOperator: Record<FilterOperator, string> = {
  gleich: "eq",
  ungleich: "neq",
  groesser: "gt",
  groesserGleich: "gte",
  kleiner: "lt",
  kleinerGleich: "lte",
  enthaelt: "ilike",
  istLeer: "is",
  istNichtLeer: "not.is",
};

/** Kuerzt lange Texte, damit ein einzelnes Freitextfeld die Antwort nicht sprengt. */
export function kuerzeWert(wert: unknown): unknown {
  if (typeof wert === "string" && wert.length > 240) return `${wert.slice(0, 240)} ...`;
  return wert;
}
