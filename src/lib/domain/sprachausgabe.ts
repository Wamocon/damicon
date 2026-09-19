// Sprachausgabe der KI-Antworten (Text-to-Speech) - reine Logik ohne
// Netzwerk, damit supabase/tests/ki-assistent.mjs sie direkt pruefen kann.
// Der Aufruf selbst: lib/ai/sprachausgabe-client.ts, die Route:
// app/api/ki-sprachausgabe/route.ts.

export const sprachausgabeSprachen = ["de", "ru", "kk", "tr", "en"] as const;
export type SprachausgabeSprache = (typeof sprachausgabeSprachen)[number];

export interface Stimme {
  /** Modell-ID im TTS-Dienst (speaches auf Caesar, Piper-Stimmen). */
  modell: string;
  stimme: string;
}

// Eine Stimme je Sprache - ausgewaehlt nach Lizenz der Trainingsdaten
// (MODEL_CARD in rhasspy/piper-voices, geprueft am 19.09.2026), nicht nur
// nach Klang: die Anwendung ist kommerziell.
//   de thorsten  - CC0
//   ru denis     - CC0            (irina: Lizenz "Unknown" - bewusst nicht)
//   kk issai     - CC-BY-4.0      (Namensnennung: IS2AI/Kazakh_TTS)
//   en alba      - CC-BY-4.0      (lessac: Blizzard-Forschungslizenz - bewusst nicht)
//   tr           - KEINE: die einzige offizielle Piper-Stimme (dfki) steht unter
//                  CC BY-NC-SA (nicht kommerziell); fahrettin/fettah haben keine
//                  ausgewiesene Lizenz. Tuerkische Antworten bekommen deshalb
//                  (noch) keine Sprachausgabe - lieber keine Stimme als eine,
//                  die das Haus nicht verwenden darf.
export const STIMMEN: Record<SprachausgabeSprache, Stimme | null> = {
  de: { modell: "speaches-ai/piper-de_DE-thorsten-medium", stimme: "thorsten" },
  ru: { modell: "speaches-ai/piper-ru_RU-denis-medium", stimme: "denis" },
  kk: { modell: "speaches-ai/piper-kk_KZ-issai-high", stimme: "issai" },
  en: { modell: "speaches-ai/piper-en_GB-alba-medium", stimme: "alba" },
  tr: null,
};

export function istSprachausgabeSprache(wert: string | null | undefined): wert is SprachausgabeSprache {
  return (sprachausgabeSprachen as readonly string[]).includes(wert ?? "");
}

// Sprache der ANTWORT, nicht der Oberflaeche: Claude antwortet in der Sprache
// der Frage (route.ts), und eine russische Antwort mit deutscher Stimme waere
// unverstaendlich. Reihenfolge der Pruefung von eindeutig nach unscharf:
//   1. kasachische Sonderbuchstaben (in Russisch nicht vorhanden) -> kk
//   2. sonst kyrillisch -> ru
//   3. tuerkische Sonderbuchstaben (ğ ş ı İ) -> tr
//   4. deutsche Umlaute/ß oder typische deutsche Woerter -> de
//   5. typische englische Woerter -> en
//   6. sonst die Oberflaechensprache (fallback)
const KASACHISCH = /[әғқңөұүһі]/i;
const KYRILLISCH = /[Ѐ-ӿ]/;
const TUERKISCH = /[ğşıİ]/;
const DEUTSCH = /[äöüß]|\b(und|der|die|das|ist|nicht|sie|mit|fuer|für|auf|ein|eine)\b/i;
const ENGLISCH = /\b(the|and|is|are|you|your|with|for|this|that|of)\b/i;

export function erkenneSprache(text: string, fallback: string): SprachausgabeSprache {
  const probe = text.slice(0, 2000);
  if (KASACHISCH.test(probe)) return "kk";
  if (KYRILLISCH.test(probe)) return "ru";
  if (TUERKISCH.test(probe)) return "tr";
  const de = (probe.match(new RegExp(DEUTSCH.source, "gi")) ?? []).length;
  const en = (probe.match(new RegExp(ENGLISCH.source, "gi")) ?? []).length;
  if (de > 0 || en > 0) return de >= en ? "de" : "en";
  return istSprachausgabeSprache(fallback) ? fallback : "de";
}

// Obergrenze fuer eine vorgelesene Antwort. Piper braucht fuer ~200 Zeichen
// unter einer Sekunde (gemessen auf Caesar); die Grenze haelt die Dauer auch
// fuer lange Berichte unter Cloudflares 100-s-Grenze und begrenzt, was eine
// einzelne Anfrage an Rechenzeit ausloesen kann.
export const MAX_SPRACHAUSGABE_ZEICHEN = 3000;

/** Macht aus der Markdown-Antwort vorlesbaren Text: keine Sternchen,
 *  Rauten, Tabellenstriche oder Link-Adressen, die sonst mitgesprochen
 *  wuerden. Kuerzt an einer Satzgrenze auf MAX_SPRACHAUSGABE_ZEICHEN. */
export function textFuerSprachausgabe(markdown: string): string {
  let text = markdown
    .replace(/```[\s\S]*?```/g, " ") // Codebloecke nicht vorlesen
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // Bilder
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // Links: nur der Text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // Ueberschriften
    .replace(/^\s*>\s?/gm, "") // Zitate
    .replace(/^\s*[-*+]\s+/gm, "") // Aufzaehlungszeichen
    // Tabellen: nur Leerzeichen/Tabs ([ \t]), nie \s - das griffe ueber den
    // Zeilenumbruch und zoege zwei Zeilen zu einer zusammen.
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, "") // Trennzeilen
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, "$1") // aeussere Tabellenstriche
    .replace(/[ \t]*\|[ \t]*/g, ", ") // Zellen einer Zeile: "Polana, 1150"
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (text.length > MAX_SPRACHAUSGABE_ZEICHEN) {
    const abgeschnitten = text.slice(0, MAX_SPRACHAUSGABE_ZEICHEN);
    const satzende = Math.max(abgeschnitten.lastIndexOf(". "), abgeschnitten.lastIndexOf("! "), abgeschnitten.lastIndexOf("? "), abgeschnitten.lastIndexOf("\n"));
    text = satzende > MAX_SPRACHAUSGABE_ZEICHEN / 2 ? abgeschnitten.slice(0, satzende + 1) : abgeschnitten;
  }
  return text;
}
