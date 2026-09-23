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

/** Die Stimme fuer eine Oberflaechensprache - oder null, wenn es fuer sie
 *  keine gibt. Die EINE Stelle, an der das entschieden wird: die Route
 *  (api/ki-sprachausgabe) und der Knopf im Chat fragen beide hier.
 *
 *  Bis zum 21.09.2026 wurde die Sprache stattdessen aus dem Antworttext
 *  erraten. Das fiel um, sobald die Frage diktiert war: ein falscher
 *  Sprachhinweis an die Spracherkennung liess die Antwort selbst in der
 *  falschen Sprache entstehen, und die Erkennung bestaetigte den Fehler
 *  anschliessend. Die Systemsprache ist eine Einstellung, die die Person
 *  selbst setzt - verlaesslicher als jede Erkennung. */
export function stimmeFuerOberflaeche(oberflaeche: string): Stimme | null {
  return istSprachausgabeSprache(oberflaeche) ? STIMMEN[oberflaeche] : null;
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

// --- Live-Sprachausgabe: Abschnitte schon waehrend des Schreibens ----------
//
// Bisher wurde erst vorgelesen, wenn die ganze Antwort dastand. Bei einer
// langen Antwort sind das viele Sekunden Stille, in denen nichts passiert.
//
// Der Zerleger bekommt den Stream stueckweise und gibt zurueck, was fertig
// gesprochen werden kann. Drei Dinge entscheiden, wann ein Abschnitt faellt:
//
//   1. Der ERSTE Abschnitt faellt frueh - beim ersten Komma oder nach rund
//      60 Zeichen. Er ist der teuerste: bis er klingt, ist es still.
//   2. Danach 1-2 Saetze bis rund 250 Zeichen. Laengere Abschnitte klingen
//      besser (die Stimme kennt die Satzmelodie), kuerzere kaemen frueher.
//   3. Was man nicht vorliest - Codebloecke, Tabellen, Links - faellt vorher
//      weg, auch wenn es ueber mehrere Stream-Stuecke verteilt ankommt.

/** Erster Abschnitt: so frueh wie moeglich, damit die Stille kurz bleibt. */
export const ERSTER_ABSCHNITT_ZEICHEN = 60;
/** Danach: so lang, dass die Satzmelodie stimmt. */
export const ABSCHNITT_ZEICHEN = 250;

// Kein Satzende, obwohl da ein Punkt steht. Die Liste ist kurz gehalten und
// enthaelt nur, was in diesen Antworten wirklich vorkommt.
const ABKUERZUNGEN = [
  "z. b.", "z.b.", "d. h.", "d.h.", "u. a.", "u.a.", "o. ä.", "o.ä.",
  "bzw.", "ca.", "evtl.", "usw.", "inkl.", "exkl.", "max.", "min.",
  "nr.", "abs.", "art.", "bspw.", "ggf.", "vgl.", "bzgl.",
  "dr.", "prof.", "hr.", "fr.", "mr.", "mrs.", "ms.", "etc.", "approx.",
];

/** Steht an dieser Stelle wirklich ein Satzende? */
function istSatzende(text: string, i: number): boolean {
  const zeichen = text[i];
  if (!".!?…".includes(zeichen)) return false;

  // "3,5" und "3.5": eine Zahl, kein Satz.
  if (zeichen === "." && /\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "")) return false;

  // Danach muss Platz sein - mitten im Wort endet kein Satz.
  const danach = text.slice(i + 1);
  if (danach && !/^[\s"'»«)\]]/.test(danach)) return false;

  // Abkuerzung davor? "z. B." endet nicht, obwohl zweimal ein Punkt steht.
  //
  // Die Abkuerzung muss ein eigenes Wort sein. Ohne diese Pruefung verschluckt
  // ein kurzer Eintrag die halbe Sprache: "s." (fuer "siehe") passt sonst auf
  // JEDES Wort, das auf s endet - "lückenlos." waere dann kein Satzende mehr.
  const davor = text.slice(0, i + 1).toLowerCase();
  const istAbkuerzung = ABKUERZUNGEN.some((a) => {
    if (!davor.endsWith(a)) return false;
    const vorZeichen = davor[davor.length - a.length - 1];
    return vorZeichen === undefined || !/[a-zäöüß]/.test(vorZeichen);
  });
  if (istAbkuerzung) return false;

  // Ein einzelner Buchstabe mit Punkt ist eine Initiale ("A. Serikbaj").
  if (zeichen === "." && /(^|\s)[a-zäöüßA-ZÄÖÜ]$/.test(text.slice(0, i))) return false;

  return true;
}

export interface Abschnitt {
  /** Fortlaufend ab 1, je Zug. Die Reihenfolge haengt daran. */
  nr: number;
  text: string;
}

export interface SatzZerleger {
  /** Naechstes Stueck aus dem Stream. Gibt zurueck, was jetzt sprechbar ist. */
  fuettere(stueck: string): Abschnitt[];
  /** Ende der Antwort: gibt den Rest heraus. */
  abschliessen(): Abschnitt[];
}

/**
 * Zerlegt eine Antwort waehrend des Schreibens in sprechbare Abschnitte.
 *
 * Der Zustand ist absichtlich in einer Closure und nicht in einem Modul:
 * zwei Antworten duerfen sich nicht ins Gehege kommen.
 */
export function erzeugeSatzZerleger(): SatzZerleger {
  let puffer = "";
  let inCodeblock = false;
  let nr = 0;
  let gesamtZeichen = 0;
  let ersterRaus = false;
  let fertig = false;

  /** Vom Puffer abschneiden und als Abschnitt herausgeben. */
  function schneide(bis: number): Abschnitt | null {
    const roh = puffer.slice(0, bis);
    puffer = puffer.slice(bis);
    const text = textFuerSprachausgabe(roh).trim();
    if (!text) return null;
    if (gesamtZeichen + text.length > MAX_SPRACHAUSGABE_ZEICHEN) {
      fertig = true;
      const rest = MAX_SPRACHAUSGABE_ZEICHEN - gesamtZeichen;
      if (rest < 20) return null;
      gesamtZeichen = MAX_SPRACHAUSGABE_ZEICHEN;
      return { nr: ++nr, text: text.slice(0, rest).trim() };
    }
    gesamtZeichen += text.length;
    ersterRaus = true;
    return { nr: ++nr, text };
  }

  /** Wo endet der naechste Abschnitt im Puffer - oder -1, wenn noch keiner. */
  function naechsteGrenze(): number {
    // Der ERSTE Abschnitt hat eine andere Aufgabe als alle weiteren: er soll
    // so frueh wie moeglich klingen. Deshalb gewinnt hier die FRUEHESTE
    // brauchbare Grenze - das erste Komma oder das erste Satzende, je
    // nachdem, was zuerst kommt.
    if (!ersterRaus) {
      const kandidaten: number[] = [];
      // Das erste Komma, das eine Sprechpause ist - nicht das Komma in
      // "3,5". Dort mittendrin zu trennen ergaebe "drei" ... "fünf Grad".
      let komma = -1;
      for (let i = 0; i < puffer.length; i++) {
        if (puffer[i] !== ",") continue;
        if (/[0-9]/.test(puffer[i - 1] ?? "") && /[0-9]/.test(puffer[i + 1] ?? "")) continue;
        komma = i;
        break;
      }
      if (komma >= 0 && komma + 1 >= 12) kandidaten.push(komma + 1);
      for (let i = 0; i < puffer.length; i++) {
        if (istSatzende(puffer, i)) { kandidaten.push(i + 1); break; }
      }
      if (kandidaten.length) return Math.min(...kandidaten);
      // Weder Komma noch Punkt in Sicht: nach der Zielmarke am letzten
      // Wortende trennen, statt weiter stumm zu warten.
      if (puffer.length > ERSTER_ABSCHNITT_ZEICHEN * 1.5) {
        const platz = puffer.lastIndexOf(" ", Math.floor(ERSTER_ABSCHNITT_ZEICHEN * 1.5));
        if (platz >= 12) return platz + 1;
      }
      return -1;
    }

    // Danach zaehlt der Klang: ganze Saetze, bis die Zielmarke erreicht ist.
    let letztesSatzende = -1;
    for (let i = 0; i < puffer.length; i++) {
      if (istSatzende(puffer, i)) {
        letztesSatzende = i + 1;
        if (letztesSatzende >= ABSCHNITT_ZEICHEN) return letztesSatzende;
      }
    }

    // Kein Satzende, aber viel zu lang: am letzten Leerzeichen trennen,
    // damit kein Wort zerrissen wird.
    if (puffer.length > ABSCHNITT_ZEICHEN * 2) {
      const platz = puffer.lastIndexOf(" ", ABSCHNITT_ZEICHEN * 2);
      if (platz > ABSCHNITT_ZEICHEN) return platz + 1;
    }
    return letztesSatzende > 0 ? letztesSatzende : -1;
  }

  function ernte(): Abschnitt[] {
    const raus: Abschnitt[] = [];
    for (;;) {
      if (fertig) return raus;
      const grenze = naechsteGrenze();
      if (grenze <= 0) return raus;
      const a = schneide(grenze);
      if (a) raus.push(a);
    }
  }

  return {
    fuettere(stueck: string): Abschnitt[] {
      if (fertig || !stueck) return [];
      // Codebloecke ueber Stueckgrenzen hinweg: die Zaehlung der ``` muss
      // den ganzen Strom sehen, nicht nur das aktuelle Stueck.
      for (const teil of stueck.split(/(```)/)) {
        if (teil === "```") { inCodeblock = !inCodeblock; continue; }
        if (!inCodeblock) puffer += teil;
      }
      return ernte();
    },
    abschliessen(): Abschnitt[] {
      if (fertig) return [];
      const raus = ernte();
      const rest = schneide(puffer.length);
      if (rest) raus.push(rest);
      return raus;
    },
  };
}
