import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { Schalter } from "@/lib/ai/ausfall";
import { ausfallModell, type AusweichEreignis, type KettenGlied } from "@/lib/ai/ausfall-modell";
import { anthropicBasisUrl } from "@/lib/ai/lade-anbieter";
import { entschluessleApiKey } from "@/lib/ai/schluessel";
import { SOKRATES_BASIS } from "@/lib/wissen/embed";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Die Kette der Sprachmodell-Anbieter: der Standardanbieter zuerst (heute Claude Haiku), danach die uebrigen aktiven
// Anbieter der Tabelle ki_anbieter (Typ anthropic oder openai_kompatibel, vom Admin im Panel verwaltet), zuletzt ein
// Sokrates-Zugang aus der Umgebung. Faellt der erste aus (Guthaben, Ratenlimit, Ueberlastung, Netz), antwortet der
// naechste, siehe ausfall-modell.ts.
//
// Sokrates einrichten, ohne Migration und ohne Code:
//   * entweder im Panel (Zahnrad, Anbieter): Typ "openai_kompatibel", Basis-URL https://sokrates.test-qualitaetsmanagement.com/api/v1,
//     Modell und Schluessel, NICHT als Standard
//   * oder per Umgebung: KI_SOKRATES_API_SCHLUESSEL (gibt es schon fuer Sprache) plus KI_SOKRATES_MODELL
// Stand 2026-09-20: der vorhandene Sokrates-Schluessel antwortet auf /chat/completions und /embeddings mit 403 (nur
// Sprache freigegeben). Sobald der Betreiber Chat freigibt und den Modellnamen nennt, greift die Kette ohne weitere Aenderung.

export interface Anbieterzeile {
  name: string;
  anzeige_name: string;
  typ: "anthropic" | "openai_kompatibel";
  basis_url: string;
  modell: string;
  api_key_chiffrat: string;
  ist_standard: boolean;
}

export interface AnbieterKette {
  modell: LanguageModel;
  /** Der Standardanbieter (bestimmt, welche Oberflaeche der Chat nutzt). */
  primaer: Anbieterzeile;
  namen: string[];
}

// Ein Schalter je Serverinstanz: eine Sperre gilt fuer alle Anfragen dieser Instanz, nicht nur fuer eine.
const schalter = new Schalter();

function glied(z: Anbieterzeile): KettenGlied | null {
  try {
    const apiKey = entschluessleApiKey(z.api_key_chiffrat);
    if (z.typ === "anthropic") return { name: z.name, modell: createAnthropic({ apiKey, baseURL: anthropicBasisUrl(z.basis_url) })(z.modell) };
    return { name: z.name, modell: createOpenAICompatible({ name: z.name, apiKey, baseURL: z.basis_url.replace(/\/+$/, "") }).chatModel(z.modell) };
  } catch (e) {
    // Ein Anbieter mit kaputtem Schluessel darf die anderen nicht mitreissen.
    console.warn(`[damicon] Anbieter ${z.name} uebersprungen:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Sokrates aus der Umgebung, falls dort ein Modell benannt ist und die Tabelle nicht ohnehin einen Sokrates-Eintrag hat. */
export function sokratesAusUmgebung(vorhandeneUrls: string[] = []): KettenGlied | null {
  const schluessel = process.env.KI_SOKRATES_API_SCHLUESSEL;
  const modell = process.env.KI_SOKRATES_MODELL;
  if (!schluessel || !modell) return null;
  const basis = (process.env.KI_SOKRATES_URL ?? SOKRATES_BASIS).replace(/\/+$/, "");
  if (vorhandeneUrls.some((u) => u.replace(/\/+$/, "") === basis)) return null;
  return { name: "sokrates-umgebung", modell: createOpenAICompatible({ name: "sokrates", apiKey: schluessel, baseURL: basis }).chatModel(modell) };
}

export function meldeAnbieterwechsel(e: AusweichEreignis): void {
  console.warn(`[damicon] Anbieterwechsel: ${e.von} -> ${e.nach ?? "kein weiterer Anbieter"} (${e.art}): ${e.meldung}`);
}

export async function ladeAnbieterKette(beiAusweichen?: (e: AusweichEreignis) => void): Promise<AnbieterKette | null> {
  const { data } = await createServiceRoleClient()
    .from("ki_anbieter")
    .select("name, anzeige_name, typ, basis_url, modell, api_key_chiffrat, ist_standard")
    .eq("aktiv", true);
  const zeilen = (data ?? []) as Anbieterzeile[];
  const primaer = zeilen.find((z) => z.ist_standard);
  if (!primaer) return null;
  const reihenfolge = [primaer, ...zeilen.filter((z) => !z.ist_standard).sort((a, b) => a.name.localeCompare(b.name))];
  const kette = reihenfolge.map(glied).filter((g): g is KettenGlied => g !== null);
  const umgebung = sokratesAusUmgebung(reihenfolge.map((z) => z.basis_url));
  if (umgebung) kette.push(umgebung);
  if (kette.length === 0) return null;
  // Der Standardanbieter muss selbst benutzbar sein; sonst wuerde ein Ersatz stillschweigend zum Hauptmodell.
  if (kette[0]!.name !== primaer.name) return null;
  return { modell: ausfallModell(kette, { schalter, beiAusweichen }), primaer, namen: kette.map((k) => k.name) };
}
