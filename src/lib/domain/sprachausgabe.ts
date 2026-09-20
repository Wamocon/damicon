// Sprachausgabe der KI-Antworten (Text-to-Speech) - reine Logik ohne
// Netzwerk, damit supabase/tests/ki-assistent.mjs sie direkt pruefen kann.
// Der Aufruf selbst: lib/ai/sprachausgabe-client.ts, die Route:
// app/api/ki-sprachausgabe/route.ts.

export const sprachausgabeSprachen = ["de", "ru", "kk", "en"] as const;
export type SprachausgabeSprache = (typeof sprachausgabeSprachen)[number];

export interface Stimme {
  /** Name der Stimme im Dienst. Sokrates waehlt allein darueber aus, ein
   *  eigenes Modellfeld gibt es dort nicht. */
  stimme: string;
}

// Eine Stimme je Sprache, benannt nach der Auswahlregel des Dienstes:
// <sprache>-male bzw. <sprache>-female.
//
// Am 20.09.2026 gegen den Dienst geprueft, nicht angenommen: jede
// Kombination aus de/en/ru/kk und male/female liefert HTTP 200 mit echtem
// MP3 (Frame-Kopf und LAME-Kennung, 11-34 kB je Satz, 0,2-0,7 s). Damit hat
// Russisch erstmals eine Stimme - mit den Piper-Stimmen auf Caesar ging das
// nicht, weil dort nur Modelle mit unklarer oder nicht kommerzieller Lizenz
// bereitstanden.
//
// Wichtig fuer die Auswahl: ein unbekannter Stimmname wird vom Dienst NICHT
// abgelehnt, er antwortet mit 200 und irgendeiner Standardstimme (geprueft
// mit "gibt-es-nicht"). Diese Tabelle ist deshalb die einzige Kontrolle
// darueber, was tatsaechlich gesprochen wird - ein Tippfehler hier faellt
// nicht als Fehler auf, sondern als falsch klingende Antwort.
//
// Weiblich ueberall, damit die Anwendung einheitlich klingt; die Umstellung
// je Sprache ist ein Wort in dieser Tabelle.
export const STIMMEN: Record<SprachausgabeSprache, Stimme | null> = {
  de: { stimme: "de-female" },
  en: { stimme: "en-female" },
  kk: { stimme: "kk-female" },
  ru: { stimme: "ru-female" },
};

/** Ablageort des erzeugten Audios im Bucket "ki-sprachausgabe" (Migration
 *  20261101000000). Die Stimme steckt im Dateinamen: nach einem Stimmwechsel
 *  entsteht ein neuer Pfad, alte Aufnahmen werden nicht mehr gefunden. Der
 *  Text kann sich nicht aendern - eine Antwort ist unveraenderlich. */
export function sprachausgabePfad(nachrichtId: string, stimme: Stimme): string {
  const kennung = stimme.stimme.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${nachrichtId}/${kennung}.mp3`;
}

export function istSprachausgabeSprache(wert: string | null | undefined): wert is SprachausgabeSprache {
  return (sprachausgabeSprachen as readonly string[]).includes(wert ?? "");
}

// Sprache der ANTWORT, nicht der Oberflaeche: Claude antwortet in der Sprache
// der Frage (route.ts), und eine russische Antwort mit deutscher Stimme waere
// unverstaendlich. Reihenfolge der Pruefung von eindeutig nach unscharf:
//   1. kasachische Sonderbuchstaben (in Russisch nicht vorhanden) -> kk
//   2. sonst kyrillisch -> ru
//   3. deutsche Umlaute/ß oder typische deutsche Woerter -> de
//   4. typische englische Woerter -> en
//   5. sonst die Oberflaechensprache (fallback)
// Tuerkisch stand hier bis zum 20.09.2026 an dritter Stelle; die Sprache ist
// aus der Anwendung entfernt (die Erkennung lieferte dafuer ohnehin Unsinn),
// deshalb faellt tuerkischer Text jetzt auf de/en oder die Oberflaeche.
const KASACHISCH = /[әғқңөұүһі]/i;
const KYRILLISCH = /[Ѐ-ӿ]/;
const DEUTSCH = /[äöüß]|\b(und|der|die|das|ist|nicht|sie|mit|fuer|für|auf|ein|eine)\b/i;
const ENGLISCH = /\b(the|and|is|are|you|your|with|for|this|that|of)\b/i;

export function erkenneSprache(text: string, fallback: string): SprachausgabeSprache {
  const probe = text.slice(0, 2000);
  if (KASACHISCH.test(probe)) return "kk";
  if (KYRILLISCH.test(probe)) return "ru";
  const de = (probe.match(new RegExp(DEUTSCH.source, "gi")) ?? []).length;
  const en = (probe.match(new RegExp(ENGLISCH.source, "gi")) ?? []).length;
  if (de > 0 || en > 0) return de >= en ? "de" : "en";
  return istSprachausgabeSprache(fallback) ? fallback : "de";
}

/** In welcher Sprache der Assistent antworten soll - und in welcher die
 *  Oberflaeche waehrend dieses Zuges spricht.
 *
 *  Entscheidend ist die Sprache der FRAGE, nicht die der Oberflaeche. Wer
 *  auf einer deutschen Oberflaeche russisch schreibt, bekommt Russisch
 *  zurueck; das war vorher nicht so (der Systemprompt bekam schlicht die
 *  Oberflaechensprache uebergeben und wies das Modell an, in DIESER zu
 *  antworten - eine russisch gestellte Frage wurde ausdruecklich deutsch
 *  beantwortet).
 *
 *  Massgeblich ist die LETZTE Nachricht der Person: wer mitten im Gespraech
 *  die Sprache wechselt, wechselt sie fuer alles, was danach kommt.
 *  Enthaelt sie keinen Hinweis (eine Zahl, "ok", ein Dateiname), bleibt es
 *  bei der Oberflaechensprache - das ist die beste Vermutung, die es dann
 *  gibt, und aendert im Regelfall nichts. */
export function antwortSprache(
  nachrichten: readonly { rolle: string; inhalt: string }[],
  oberflaeche: string,
): SprachausgabeSprache {
  const letzteFrage = [...nachrichten].reverse().find((n) => n.rolle === "nutzer" && n.inhalt.trim());
  return erkenneSprache(letzteFrage?.inhalt ?? "", oberflaeche);
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
