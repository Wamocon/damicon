// Sprachausgabe der KI-Antworten (Text-to-Speech) - reine Logik ohne
// Netzwerk, damit supabase/tests/ki-assistent.mjs sie direkt pruefen kann.
// Der Aufruf selbst: lib/ai/sprachausgabe-client.ts, die Route:
// app/api/ki-sprachausgabe/route.ts.

export const sprachausgabeSprachen = ["de", "ru", "kk", "en"] as const;
export type SprachausgabeSprache = (typeof sprachausgabeSprachen)[number];

/** Wer spricht. Seit 24.09.2026 zwei Anbieter hinter einem Schalter
 *  (KI_SPRACHAUSGABE_ANBIETER), siehe docs/infra/sprachausgabe-anbieter.md:
 *
 *    - "sokrates": unsere Stimmen auf der Sokrates-API, eine Stimme je
 *      Sprache ("de-female"), vermutlich eine kleine Engine der Piper-/VITS-
 *      Klasse. Voreinstellung und immer der Rueckfall.
 *    - "soniox": Soniox TTS v2 (tts-rt-v2). EINE Stimme fuer alle Sprachen,
 *      die Sprache geht als eigenes Feld mit - die Stimmen dort sind
 *      mehrsprachig. Kann de, en, ru und kk (Modellliste der Soniox-API,
 *      62 Sprachen). */
export type SprachausgabeAnbieter = "sokrates" | "soniox";

export interface Stimme {
  anbieter: SprachausgabeAnbieter;
  /** Name der Stimme beim Anbieter. Sokrates waehlt allein darueber aus
   *  (auch die Sprache), Soniox nimmt die Sprache zusaetzlich. */
  stimme: string;
  sprache: SprachausgabeSprache;
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
  de: { anbieter: "sokrates", stimme: "de-female", sprache: "de" },
  en: { anbieter: "sokrates", stimme: "en-female", sprache: "en" },
  kk: { anbieter: "sokrates", stimme: "kk-female", sprache: "kk" },
  ru: { anbieter: "sokrates", stimme: "ru-female", sprache: "ru" },
};

/** Stimme bei Soniox, wenn SONIOX_TTS_STIMME nichts anderes sagt. Weiblich,
 *  wie die bisherigen Stimmen; dieselbe fuer alle vier Sprachen, damit der
 *  Assistent in jeder Sprache wie derselbe klingt. Aus der Stimmenliste der
 *  Soniox-API (GET /v1/tts-models). Anders als Sokrates lehnt Soniox einen
 *  unbekannten Namen ab - ein Tippfehler faellt dann als Rueckfall auf
 *  Sokrates im Protokoll auf, nicht als fremde Stimme. */
export const SONIOX_STIMME_STANDARD = "Maya";

/** Welcher Anbieter spricht. Voreinstellung sokrates: wer den Schalter nicht
 *  setzt, bekommt den Stand von vorher. */
export function sprachausgabeAnbieter(): SprachausgabeAnbieter {
  return process.env.KI_SPRACHAUSGABE_ANBIETER?.trim().toLowerCase() === "soniox" ? "soniox" : "sokrates";
}

function sonioxStimme(): string {
  const wert = process.env.SONIOX_TTS_STIMME?.trim();
  // Nur, was wie ein Stimmname oder eine Klon-ID aussieht - kein Freitext.
  return wert && /^[A-Za-z0-9_-]{1,64}$/.test(wert) ? wert : SONIOX_STIMME_STANDARD;
}

/** Die Stimmen fuer eine Sprache, in der Reihenfolge, in der sie versucht
 *  werden: erst der eingestellte Anbieter, dann Sokrates als Rueckfall.
 *  Leer, wenn es fuer die Sprache keine Stimme gibt. */
export function stimmenFuer(sprache: string): Stimme[] {
  if (!istSprachausgabeSprache(sprache)) return [];
  const rueckfall = STIMMEN[sprache];
  const liste: Stimme[] = [];
  if (sprachausgabeAnbieter() === "soniox") liste.push({ anbieter: "soniox", stimme: sonioxStimme(), sprache });
  if (rueckfall) liste.push(rueckfall);
  return liste;
}

/** Stand der Textaufbereitung fuer die Stimme (textFuerSprachausgabe,
 *  sprechfassung). Steckt im Ablagepfad: wird die Aufbereitung besser,
 *  entsteht neues Audio, statt dass der Speicher das alte, schlechtere
 *  weiter ausliefert. Bei jeder Aenderung dort hochzaehlen. */
export const VORLESETEXT_VERSION = 2;

/** Ablageort des erzeugten Audios im Bucket "ki-sprachausgabe" (Migration
 *  20261101000000). Anbieter, Stimme, Sprache und Textstand stecken im
 *  Dateinamen: nach jedem Wechsel entsteht ein neuer Pfad, altes Audio wird
 *  nicht mehr gefunden. Der Text selbst kann sich nicht aendern - eine
 *  Antwort ist unveraenderlich. */
export function sprachausgabePfad(nachrichtId: string, stimme: Stimme): string {
  const kennung = (wert: string) => wert.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${nachrichtId}/${kennung(stimme.anbieter)}-${kennung(stimme.stimme)}-${stimme.sprache}-v${VORLESETEXT_VERSION}.mp3`;
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
  return stimmenFuer(oberflaeche)[0] ?? null;
}

// Obergrenze fuer eine vorgelesene Antwort. Piper braucht fuer ~200 Zeichen
// unter einer Sekunde (gemessen auf Caesar); die Grenze haelt die Dauer auch
// fuer lange Berichte unter Cloudflares 100-s-Grenze und begrenzt, was eine
// einzelne Anfrage an Rechenzeit ausloesen kann.
export const MAX_SPRACHAUSGABE_ZEICHEN = 3000;

// Pfeile werden zu einer Pause, Haken, Kreuze und Bildzeichen fallen weg -
// eine Stimme liest sonst "weisses schweres Haekchen" oder gar nichts und
// stockt.
const PFEILE = /[ \t]*[←-⇿⟵-⟿][ \t]*/g;
const ZEICHEN = /[☀-➿⬀-⯿\u{1F000}-\u{1FAFF}️‍]/gu;

// Deutsche Monatsnamen - "15. März" am Zeilenanfang ist ein Datum, keine
// Aufzaehlung, und "15." davor kein Satzende.
const MONATE = "Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember";

/** Eine Zeile ohne Satzzeichen am Ende (Ueberschrift, Listenpunkt,
 *  Tabellenzeile) bekommt einen Punkt - sonst liest die Stimme sie ohne
 *  Pause in die naechste Zeile hinein. */
function mitSatzzeichen(zeile: string): string {
  const t = zeile.trimEnd();
  return !t || /[.!?…:;,]$/.test(t) ? t : `${t}.`;
}

/** Macht aus der Markdown-Antwort vorlesbaren Text: keine Sternchen,
 *  Rauten, Tabellenstriche, Link-Adressen, Belegmarken oder Bildzeichen, die
 *  sonst mitgesprochen wuerden. Kuerzt an einer Satzgrenze auf
 *  MAX_SPRACHAUSGABE_ZEICHEN.
 *
 *  Seit 24.09.2026 (VORLESETEXT_VERSION 2) zusaetzlich - gemessen an echten
 *  Antworten, die so an die Stimme gingen:
 *    - Belegmarken [S1][S3] fallen weg. Der Prompt setzt sie hinter jede
 *      Rechtsaussage; gesprochen wurden sie als "S eins S drei".
 *    - nackte Adressen fallen weg (sie wurden Zeichen fuer Zeichen gelesen),
 *    - nummerierte Listen verlieren ihre Nummer wie Spiegelstriche,
 *    - Zeilen ohne Satzzeichen bekommen eines (siehe mitSatzzeichen),
 *    - einzelne Sternchen fallen weg: ein Abschnitt kann mitten in einem
 *      Fettdruck beginnen oder enden,
 *    - Unterstriche in Kennungen bleiben ("ki_assistent" wurde "kiassistent"). */
export function textFuerSprachausgabe(markdown: string): string {
  let text = markdown
    .replace(/```[\s\S]*?```/g, " ") // Codebloecke nicht vorlesen
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // Bilder
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // Links: nur der Text
    .replace(/[ \t]*\[S\d+(?:[ \t]*[,;][ \t]*S?\d+)*\]/g, "") // Belegmarken
    .replace(/https?:\/\/[^\s)\]]+/g, "") // nackte Adressen
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // Ueberschriften
    .replace(/^\s*>\s?/gm, "") // Zitate
    .replace(/^\s*[-*+]\s+/gm, "") // Aufzaehlungszeichen
    .replace(new RegExp(`^[ \\t]*\\d{1,2}[.)][ \\t]+(?!(?:${MONATE})\\b)(?=\\S)`, "gm"), "") // nummerierte Listen
    // Tabellen: nur Leerzeichen/Tabs ([ \t]), nie \s - das griffe ueber den
    // Zeilenumbruch und zoege zwei Zeilen zu einer zusammen.
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, "") // Trennzeilen
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, "$1") // aeussere Tabellenstriche
    .replace(/[ \t]*\|[ \t]*/g, ", ") // Zellen einer Zeile: "Polana, 1150"
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, "$1") // *kursiv*
    // _kursiv_ nur als ganzes Wort - nie der Unterstrich in einer Kennung.
    .replace(/(^|[\s(])_(\S(?:[^_\n]*\S)?)_(?=[\s).,!?:;]|$)/gm, "$1$2")
    .replace(/\*+/g, "") // verwaiste Sternchen
    .replace(/~~(.*?)~~/g, "$1")
    .replace(PFEILE, ", ")
    .replace(ZEICHEN, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([.,!?;:])/g, "$1") // Leerzeichen, das eine entfernte Marke hinterliess
    .replace(/^[ \t]*,[ \t]*/gm, "") // Zeile, die mit einem Pfeil begann
    .replace(/^[ \t]+/gm, "") // Einrueckung (Tabellenzeilen)
    .replace(/\n{2,}/g, "\n")
    .trim();

  // Jede Zeile ausser der letzten endet mit einem Satzzeichen. Die letzte
  // nicht: im Zerleger ist sie womoeglich nur der Anfang eines Satzes.
  const zeilen = text.split("\n");
  text = zeilen.map((zeile, i) => (i < zeilen.length - 1 ? mitSatzzeichen(zeile) : zeile.trimEnd())).filter(Boolean).join("\n");

  if (text.length > MAX_SPRACHAUSGABE_ZEICHEN) {
    const abgeschnitten = text.slice(0, MAX_SPRACHAUSGABE_ZEICHEN);
    const satzende = Math.max(abgeschnitten.lastIndexOf(". "), abgeschnitten.lastIndexOf("! "), abgeschnitten.lastIndexOf("? "), abgeschnitten.lastIndexOf("\n"));
    text = satzende > MAX_SPRACHAUSGABE_ZEICHEN / 2 ? abgeschnitten.slice(0, satzende + 1) : abgeschnitten;
  }
  return text;
}

const TENGE: Record<SprachausgabeSprache, string> = { de: "Tenge", en: "tenge", ru: "тенге", kk: "теңге" };

/** Letzter Schritt vor der Stimme, wenn die Sprache feststeht: was keine
 *  Stimme zuverlaessig liest, wird zu Worten.
 *
 *    - ₸ und KZT werden "Tenge"/"тенге"/"теңге" - das Zeichen ist selten
 *      genug, dass Stimmen es auslassen. Beide Woerter sind im Russischen
 *      und Kasachischen unveraenderlich, eine Beugung nach der Zahl braucht
 *      es nicht.
 *    - Tausendertrennung: "1.150.000" (mindestens zwei Punktgruppen, also
 *      eindeutig) und "1 150 000" bzw. mit geschuetztem Leerzeichen werden
 *      zu "1150000". Sonst liest die Stimme "eins Punkt einhundertfuenfzig"
 *      oder drei einzelne Zahlen.
 *
 *  Zahlen selbst, Prozent und Einheiten bleiben der Stimme ueberlassen: im
 *  Russischen und Kasachischen richtet sich ihre Form nach dem Satz ("два
 *  процента", "пять процентов"), und eine Regel hier machte es schlechter. */
export function sprechfassung(text: string, sprache: SprachausgabeSprache): string {
  return text
    .replace(/(\d)(?:[   ]?)(?:₸|KZT\b)/g, `$1 ${TENGE[sprache]}`)
    .replace(/(?:₸|\bKZT\b)/g, TENGE[sprache])
    .replace(/\b\d{1,3}(?:\.\d{3}){2,}(?![.,]?\d)/g, (zahl) => zahl.replace(/\./g, ""))
    .replace(/\b\d{1,3}(?:[  ]\d{3})+(?!\d)/g, (zahl) => zahl.replace(/[  ]/g, ""))
    .replace(/\b\d{1,3}(?: \d{3}){2,}(?!\d)/g, (zahl) => zahl.replace(/ /g, ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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
/** Der zweite: kurz genug, dass er fertig ist, bevor der erste verklingt. */
export const ZWEITER_ABSCHNITT_ZEICHEN = 120;
/** Danach: so lang, dass die Satzmelodie stimmt. */
export const ABSCHNITT_ZEICHEN = 250;

// Kein Satzende, obwohl da ein Punkt steht. Nur, was in diesen Antworten
// wirklich vorkommt - seit 24.09.2026 auch Russisch und Kasachisch: die
// Antworten zu Recht und Steuern zitieren "НК РК ст. 82", und bis dahin
// zerfiel "Итого 5 млн. тг., т. е. больше порога, см. п. 3 ст. 82 НК РК."
// in sieben Abschnitte, darunter "е." und "п." allein.
const ABKUERZUNGEN = [
  // Deutsch
  "z. b.", "z.b.", "d. h.", "d.h.", "u. a.", "u.a.", "o. ä.", "o.ä.", "u. u.", "u.u.",
  "bzw.", "ca.", "evtl.", "usw.", "inkl.", "exkl.", "max.", "min.",
  "nr.", "abs.", "art.", "bspw.", "ggf.", "vgl.", "bzgl.", "mio.", "mrd.", "tsd.",
  "std.", "st.", "tel.", "str.", "jh.", "gem.", "lt.", "zzgl.", "mwst.",
  // Englisch
  "dr.", "prof.", "hr.", "fr.", "mr.", "mrs.", "ms.", "etc.", "approx.", "e.g.", "i.e.", "vs.",
  // Russisch
  "т. е.", "т.е.", "т. д.", "т.д.", "т. п.", "т.п.", "т. к.", "т.к.", "и т. д.", "и др.",
  "ст.", "п.", "пп.", "ч.", "г.", "гг.", "млн.", "млрд.", "тыс.", "тг.", "руб.",
  "см.", "им.", "ул.", "д.", "др.", "пр.", "напр.", "прим.", "обл.", "р-н.",
  // Kasachisch
  "ж.", "т.б.", "т. б.", "т.с.с.", "б.з.д.", "бап.", "тарм.",
];

// Monatsnamen nach einer Ordnungszahl: "am 15. März" endet nicht nach "15.".
const MONAT_DANACH = new RegExp(`^(?:${MONATE}|Jan|Feb|Mär|Apr|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\\b`);

/** Steht an dieser Stelle wirklich ein Satzende?
 *
 *  `amEnde`: der Text ist vollstaendig. Waehrend des Streamens weiss man bei
 *  einem Punkt am Pufferende noch nicht, was folgt - "15. " kann ein
 *  Satzende sein oder "15. März". Dann wird auf das naechste Wort gewartet;
 *  das kostet ein Wort Verzoegerung und spart einen Bruch mitten im Satz. */
function istSatzende(text: string, i: number, amEnde = false): boolean {
  const zeichen = text[i];
  if (!".!?…".includes(zeichen)) return false;

  // "3,5" und "3.5": eine Zahl, kein Satz.
  if (zeichen === "." && /\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "")) return false;

  // Danach muss Platz sein - mitten im Wort endet kein Satz. Sternchen und
  // Unterstrich zaehlen als Platz: das Fazit jeder Antwort steht in
  // Fettschrift ("**... erreicht.**"), und bis zum 24.09.2026 verdeckte das
  // "**" hinter dem Punkt ausgerechnet das erste Satzende.
  const danach = text.slice(i + 1);
  if (danach && !/^[\s"'»«“”)\]*_]/.test(danach)) return false;

  // Was kommt als naechstes Wort? Nichts in Sicht: warten.
  const naechstes = /^[\s"'»«“”)\]*_]*(\S)/u.exec(danach);
  if (!naechstes) return amEnde;
  const rest = danach.slice(naechstes.index + naechstes[0].length - 1);

  if (zeichen === ".") {
    // Ein Satz beginnt nicht klein. "3. und 4." oder "15. des Monats" sind
    // Ordnungszahlen, "z. b. hier" eine Abkuerzung - in allen vier Sprachen.
    if (/\p{Ll}/u.test(naechstes[1])) return false;
    // "15. März": Ordnungszahl vor einem Monat.
    if (/\d/.test(text[i - 1] ?? "") && MONAT_DANACH.test(rest)) return false;
  }

  // Abkuerzung davor? "z. B." endet nicht, obwohl zweimal ein Punkt steht.
  //
  // Die Abkuerzung muss ein eigenes Wort sein. Ohne diese Pruefung verschluckt
  // ein kurzer Eintrag die halbe Sprache: "s." (fuer "siehe") passt sonst auf
  // JEDES Wort, das auf s endet - "lückenlos." waere dann kein Satzende mehr.
  const davor = text.slice(0, i + 1).toLowerCase();
  const istAbkuerzung = ABKUERZUNGEN.some((a) => {
    if (!davor.endsWith(a)) return false;
    const vorZeichen = davor[davor.length - a.length - 1];
    return vorZeichen === undefined || !/\p{L}/u.test(vorZeichen);
  });
  if (istAbkuerzung) return false;

  // Ein einzelner Buchstabe mit Punkt ist eine Initiale ("A. Serikbaj",
  // "А. Серикбай").
  if (zeichen === "." && /(^|[\s*_(])\p{Lu}$/u.test(text.slice(0, i))) return false;

  return true;
}

/** Ein Zeilenende nach einer nicht leeren Zeile ist eine Grenze wie ein
 *  Satzende: Ueberschriften, Listenpunkte und Tabellenzeilen haben oft kein
 *  Satzzeichen, und textFuerSprachausgabe gibt ihnen eines. */
function istZeilenende(text: string, i: number): boolean {
  if (text[i] !== "\n") return false;
  const zeilenAnfang = text.lastIndexOf("\n", i - 1) + 1;
  return /[^\s*_#>|-]/.test(text.slice(zeilenAnfang, i));
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
    const grenzeBei = (i: number) => istSatzende(puffer, i) || istZeilenende(puffer, i);

    // Der ERSTE Abschnitt hat eine andere Aufgabe als alle weiteren: er soll
    // so frueh wie moeglich klingen - aber als ganzer Satz. Bis zum
    // 24.09.2026 fiel er am ersten Komma, und genau der erste Eindruck
    // bekam einen Bruch in der Satzmelodie. Ein Komma zaehlt nur noch, wenn
    // der erste Satz lang wird.
    if (!ersterRaus) {
      for (let i = 0; i < puffer.length; i++) {
        if (grenzeBei(i)) return i + 1;
      }
      if (puffer.length > ERSTER_ABSCHNITT_ZEICHEN * 1.5) {
        // Das letzte Komma, das eine Sprechpause ist - nicht das Komma in
        // "3,5". Dort mittendrin zu trennen ergaebe "drei" ... "fünf Grad".
        for (let i = puffer.length - 1; i >= 12; i--) {
          if (puffer[i] !== ",") continue;
          if (/[0-9]/.test(puffer[i - 1] ?? "") && /[0-9]/.test(puffer[i + 1] ?? "")) continue;
          return i + 1;
        }
        // Weder Komma noch Punkt in Sicht: am letzten Wortende trennen,
        // statt weiter stumm zu warten.
        const platz = puffer.lastIndexOf(" ", Math.floor(ERSTER_ABSCHNITT_ZEICHEN * 1.5));
        if (platz >= 12) return platz + 1;
      }
      return -1;
    }

    // Danach zaehlt der Klang: ganze Saetze, bis die Zielmarke erreicht ist.
    // Der zweite Abschnitt ist kuerzer, damit er fertig ist, bevor der erste
    // verklungen ist; ab dem dritten reicht der Vorsprung fuer lange.
    //
    // Bis zum 24.09.2026 kam hier jeder Satz einzeln heraus, sobald er fertig
    // war - der Stream liefert Wort fuer Wort, und die Zielmarke wurde nie
    // erreicht. Jeder Satz war eine eigene Anfrage mit eigener Satzmelodie
    // und eigener Pause: abgehackt.
    const ziel = nr <= 1 ? ZWEITER_ABSCHNITT_ZEICHEN : ABSCHNITT_ZEICHEN;
    for (let i = 0; i < puffer.length; i++) {
      if (i + 1 >= ziel && grenzeBei(i)) return i + 1;
    }

    // Kein Satzende, aber viel zu lang: am letzten Satzende davor, sonst am
    // letzten Leerzeichen trennen, damit kein Wort zerrissen wird.
    if (puffer.length > ziel * 2) {
      let letztes = -1;
      for (let i = 0; i < ziel * 2; i++) if (grenzeBei(i)) letztes = i + 1;
      if (letztes > 0) return letztes;
      const platz = puffer.lastIndexOf(" ", ziel * 2);
      if (platz > ziel) return platz + 1;
    }
    return -1;
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
