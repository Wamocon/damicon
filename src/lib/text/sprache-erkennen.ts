// Spracherkennung an der Schrift und an unterscheidenden Woertern - rein, ohne
// Node-Importe, damit sie auch im Browser laeuft.
//
// Bis zum 28.09.2026 stand sie in lib/wissen/chunker.ts, der fuer stabileId()
// node:crypto importiert. Der Vorlese-Knopf im Browser brauchte sie aber, um die
// Stimme an die Sprache des Textes zu binden: bei Oberflaeche Deutsch las die
// deutsche Stimme einen russischen Text "mit viel Akzent" vor (Rueckmeldung vom
// 28.09.2026). chunker.ts reicht die drei alten Funktionen weiter, bestehende
// Importe gelten unveraendert.

export type ErkannteSprache = "ru" | "kk" | "de" | "en";

const KYRILLISCH = /[Ѐ-ӿ]/g;
const LATEINISCH = /[A-Za-zÀ-ÿ]/g;
const KASACHISCH = /[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/g;

/** Wie viele kyrillische und lateinische Buchstaben der Text hat. Ziffern,
 *  Satzzeichen und Symbole zaehlen nicht. */
export function zaehleSchrift(text: string): { kyrillisch: number; lateinisch: number } {
  return {
    kyrillisch: (text.match(KYRILLISCH) ?? []).length,
    lateinisch: (text.match(LATEINISCH) ?? []).length,
  };
}

/** Hat der kyrillische Text kasachische Sonderbuchstaben (mehr als 1 %)? */
function kasachischOderRussisch(text: string, kyrillisch: number): "kk" | "ru" {
  const kasachisch = (text.match(KASACHISCH) ?? []).length;
  return kyrillisch > 0 && kasachisch / kyrillisch > 0.01 ? "kk" : "ru";
}

/** Grobe Spracherkennung fuer Dokumente ohne Frontmatter (Audit-Recherche, Notizen):
 *  kyrillisch oder lateinisch, bei Kyrillisch Kasachisch an den Sonderbuchstaben.
 *
 *  @param mindestBuchstaben Ab wie vielen Buchstaben ueberhaupt geraten wird.
 *    Fuer Dokumente sind 40 richtig. Eine Chatfrage ist oft kuerzer ("Wie geht
 *    es?" hat 11), und dort ist ein begruendeter Tipp besser als gar keiner:
 *    der Aufrufer entscheidet. */
export function erkenneSprache(text: string, mindestBuchstaben = 40): ErkannteSprache | null {
  const probe = text.slice(0, 4000);
  const { kyrillisch, lateinisch } = zaehleSchrift(probe);
  if (kyrillisch + lateinisch < mindestBuchstaben) return null;
  if (kyrillisch > lateinisch) return kasachischOderRussisch(probe, kyrillisch);
  // Ohne Anhaltspunkt bleibt es beim bisherigen Verhalten: lateinischer Text
  // ohne Hinweise gilt als Englisch. Wer "eindeutig oder gar nicht" braucht,
  // nimmt lateinischeSprache() direkt.
  return lateinischeSprache(probe) ?? "en";
}

/** Wie erkenneSprache, aber OHNE den Englisch-Standard: lateinischer Text, fuer den
 *  nichts spricht (kein Umlaut, keine unterscheidenden Woerter), ergibt null statt
 *  "en". Fuer alles, was aufgrund des Ergebnisses etwas VERWIRFT oder ablehnt: ein
 *  kurzer deutscher Satz wie "Lohnabrechnung fristgerecht abgeben" darf dort nie
 *  als Englisch gelten. */
export function erkenneSpracheEindeutig(text: string, mindestBuchstaben = 40): ErkannteSprache | null {
  const probe = text.slice(0, 4000);
  const { kyrillisch, lateinisch } = zaehleSchrift(probe);
  if (kyrillisch + lateinisch < mindestBuchstaben) return null;
  if (kyrillisch > lateinisch) return kasachischOderRussisch(probe, kyrillisch);
  return lateinischeSprache(probe);
}

// Deutsch gegen Englisch. Frueher galt: Umlaute oder eines von zehn Woertern
// -> Deutsch, sonst Englisch. "Wie geht es Ihnen heute?" hat weder Umlaut
// noch eines dieser Woerter und kam deshalb als Englisch heraus - fuer ein
// Dokument unschoen, fuer die Antwortsprache einer Chatfrage falsch.
//
// Jetzt zaehlen beide Seiten. Nur Woerter, die es auf der anderen Seite nicht
// gibt: "in", "man", "war", "die" stehen in beiden Sprachen und entscheiden
// nichts.
const DEUTSCHE_WOERTER = /\b(und|oder|nicht|ist|sind|ein|eine|einen|einem|der|den|dem|des|das|mit|für|auf|aus|bei|nach|über|unter|noch|schon|auch|sehr|wie|was|wo|wann|warum|wer|welche|welcher|ich|du|wir|ihr|sie|ihnen|mich|mir|dich|dir|uns|euch|kann|könnte|soll|muss|darf|habe|haben|hat|hatte|wird|werden|wurde|geht|gehen|machen|bitte|danke|heute|morgen|gestern|immer|wieder|kein|keine|mein|meine|dein|deine|unser|diese|dieser|dieses)\b/gi;
const ENGLISCHE_WOERTER = /\b(the|and|or|not|is|are|was|were|been|a|an|with|for|from|into|about|after|before|between|how|what|where|when|why|who|which|i|you|we|they|he|she|me|him|her|us|them|can|could|should|would|must|may|have|has|had|will|do|does|did|go|goes|make|please|thanks|today|tomorrow|yesterday|always|again|no|my|your|our|this|these|those)\b/gi;

/** Deutsch oder Englisch - oder null, wenn nichts dafuer spricht. Der Aufrufer
 *  entscheidet, was ein Unentschieden bedeutet: fuer Dokumente "irgendwas",
 *  fuer die Antwortsprache "lieber die Einstellung nehmen". */
export function lateinischeSprache(text: string): "de" | "en" | null {
  if (/[äöüßÄÖÜ]/.test(text)) return "de";
  const deutsch = (text.match(DEUTSCHE_WOERTER) ?? []).length;
  const englisch = (text.match(ENGLISCHE_WOERTER) ?? []).length;
  if (deutsch > englisch) return "de";
  if (englisch > deutsch) return "en";
  return null;
}

// --------------------------------------------------------- Sprache je Satz
//
// Eine Antwort ist nicht immer einsprachig: eine deutsche Antwort zitiert den
// russischen Paragrafen aus dem НК РК, eine russische nennt die Sorte "Polka".
// Bis zum 28.09.2026 las eine Stimme die ganze Antwort, und zwar die der Frage.
//
// Die Regel ist BEWUSST ZURUECKHALTEND. Jeder Wechsel ist hoerbar - anderer
// Sprecher, anderes Tempo, im Strom ein neuer Schluessel und eine Pause. Also
// schaltet nur ein Wechsel der SCHRIFT um:
//   - innerhalb der kyrillischen Schrift nie pro Satz zwischen ru und kk (ein
//     russischer Satz mit "Қостанай" bliebe sonst nicht russisch),
//   - innerhalb der lateinischen nie pro Satz zwischen de und en ("Rufen Sie
//     an." zaehlt "an" als englisches Wort),
//   - Zahlen, Eigennamen und gemischte Saetze ("Polka: 1100 kg, всего 1600 кг")
//     behalten die Sprache des Zuges.

/** Unter so vielen Buchstaben entscheidet ein Satz nichts. */
export const SATZ_MINDEST_BUCHSTABEN = 12;
/** So viel der Buchstaben muss eine Schrift haben, damit sie ueberwiegt. */
export const SATZ_SCHRIFT_ANTEIL = 0.7;

export type Schrift = "kyrillisch" | "lateinisch";

/** Die Schrift, die im Text klar ueberwiegt - oder null (zu kurz, gemischt,
 *  nur Zahlen). Auch der Zerleger (domain/sprachausgabe.ts) trennt daran. */
export function ueberwiegendeSchrift(
  text: string,
  mindestBuchstaben = SATZ_MINDEST_BUCHSTABEN,
  anteil = SATZ_SCHRIFT_ANTEIL,
): Schrift | null {
  const { kyrillisch, lateinisch } = zaehleSchrift(text);
  const summe = kyrillisch + lateinisch;
  if (summe === 0 || summe < mindestBuchstaben) return null;
  if (kyrillisch / summe >= anteil) return "kyrillisch";
  if (lateinisch / summe >= anteil) return "lateinisch";
  return null;
}

const istKyrillischeSprache = (s: string) => s === "ru" || s === "kk";
const istLateinischeSprache = (s: string) => s === "de" || s === "en";

/**
 * Die Stimme fuer EINEN Satz. `zugSprache` ist die Sprache der Antwort
 * (domain/antwortsprache.ts); abgewichen wird nur, wenn der Satz klar in der
 * anderen Schrift steht. Gibt immer eine der vier Sprachen zurueck, wenn
 * `zugSprache` eine ist.
 */
export function satzSprache<S extends string>(text: string, zugSprache: S): S | ErkannteSprache {
  const schrift = ueberwiegendeSchrift(text ?? "");
  if (schrift === "kyrillisch") {
    if (istKyrillischeSprache(zugSprache)) return zugSprache;
    const { kyrillisch } = zaehleSchrift(text);
    return kasachischOderRussisch(text, kyrillisch);
  }
  if (schrift === "lateinisch") {
    if (istLateinischeSprache(zugSprache)) return zugSprache;
    // Ein lateinischer Satz in einer russischen Antwort ist oft nur ein Name
    // ("Himbi", "Damicon") oder eine Kennung: umgeschaltet wird nur, wenn der
    // Satz eindeutig deutsch oder englisch ist.
    return erkenneSpracheEindeutig(text, SATZ_MINDEST_BUCHSTABEN) ?? zugSprache;
  }
  return zugSprache;
}
