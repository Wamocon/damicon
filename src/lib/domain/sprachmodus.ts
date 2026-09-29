// Sprachmodus: ein Live-Gespraech mit dem Assistenten, ohne sichtbaren Chat.
//
// In der Mitte des Fensters steht Himbi (components/ki/sprach-himbi.tsx; bis zum
// 25.09.2026 eine Kugel), hoert zu und spricht mit Lippen im Takt der Stimme.
// Denkt oder spricht er oder hebt er einen Bereich der Anwendung hervor, rueckt
// er klein nach links ueber die Navigationsleiste, damit die Mitte frei bleibt.
//
// Hier steht nur die reine Logik, ohne React und ohne Browser, damit
// supabase/tests/ki-assistent.mjs sie Fall fuer Fall pruefen kann:
//
//   1. der Ablauf des Gespraechs (wer ist dran?),
//   2. das Rechteck eines hervorgehobenen Bereichs,
//   3. was nach dem Abbruch einer Live-Sitzung geschieht,
//   4. wann Dazwischenreden Himbi unterbricht.

// --- 1. Ablauf ---------------------------------------------------------------------
//
// Entweder hoert Himbi zu, oder der Assistent ist dran (denkt, spricht). Das Ohr bleibt
// seit dem 28.09.2026 dabei durchgehend offen (ohrOffen): was von Himbis eigener Stimme
// kommt, sortiert sprachmodus.tsx aus (Grenze im Audio, Echo-Pruefung). Unterbrochen wird
// per Befehlswort (Abschnitt 1b), durch Sprechen (Abschnitt 4: nur, was deutlich lauter ist
// als Echo und Grundrauschen) oder per Tipp auf Himbi bzw. die Leertaste - der sichere Weg
// in lauter Umgebung (Hof, Halle).
//
// Nur die Zustaende und Ereignisse, die der Sprachmodus wirklich benutzt: bis zum 29.09.2026
// gab es noch "aus", "versteht" und die Ereignisse "starten", "aeusserung-ende",
// "nichts-gehoert" und "beenden". "versteht" wurde im selben Durchlauf wieder verlassen und nie
// gezeigt, der Rest kam nur in Tests vor (Befund der Gegenpruefung). Der Sprachmodus beginnt
// mit "startet" und endet, indem er ausgehaengt wird.

export type Phase =
  /** Mikrofon wird geoeffnet, Schluessel geholt. */
  | "startet"
  /** Der Assistent wartet auf eine Frage und zeigt, was er hoert. */
  | "hoert"
  /** Die Frage ist gestellt, der Assistent arbeitet (Daten, Navigation). */
  | "denkt"
  /** Der Assistent spricht. */
  | "spricht"
  /** Vom Nutzer angehalten (Stumm): nichts wird aufgenommen. */
  | "pausiert"
  /** Etwas ging schief (kein Mikrofon, Dienst weg). */
  | "fehler";

export type Ereignis =
  | { art: "mikrofon-bereit" }
  /** Die Aeusserung ist zu Ende und als Frage abgeschickt. */
  | { art: "frage-gestellt" }
  | { art: "antwort-spricht" }
  /** Antwort komplett vorgelesen (oder ohne Ton fertig): wieder zuhoeren. */
  | { art: "antwort-fertig" }
  /** Tipp, Befehlswort oder Stimme, waehrend der Assistent dran ist: sofort still, zuhoeren. */
  | { art: "unterbrechen" }
  | { art: "pausieren" }
  | { art: "fortsetzen" }
  | { art: "fehler" };

/** Der naechste Zustand. Unbekannte Uebergaenge lassen die Phase unveraendert -
 *  lieber ein verpasstes Ereignis als ein Sprung in einen Zustand, der nicht passt. */
export function naechstePhase(phase: Phase, e: Ereignis): Phase {
  if (e.art === "fehler") return "fehler";
  switch (phase) {
    case "startet":
      return e.art === "mikrofon-bereit" ? "hoert" : phase;
    case "hoert":
      if (e.art === "frage-gestellt") return "denkt";
      if (e.art === "pausieren") return "pausiert";
      if (e.art === "antwort-spricht") return "spricht";
      return phase;
    case "denkt":
      if (e.art === "antwort-spricht") return "spricht";
      if (e.art === "antwort-fertig" || e.art === "unterbrechen") return "hoert";
      if (e.art === "pausieren") return "pausiert";
      return phase;
    case "spricht":
      if (e.art === "antwort-fertig" || e.art === "unterbrechen") return "hoert";
      if (e.art === "pausieren") return "pausiert";
      return phase;
    case "pausiert":
      return e.art === "fortsetzen" ? "hoert" : phase;
    case "fehler":
      return e.art === "fortsetzen" ? "startet" : phase;
  }
}

/** Hoert die Erkennung in dieser Phase mit? Seit dem 28.09.2026 durchgehend, auch waehrend
 *  Himbi denkt und spricht (EINE Verbindung fuers ganze Gespraech, sprachmodus.tsx): nur so
 *  gehen weder ein Nachsatz ("Ja." ... "und zeig mir die Lieferungen") noch ein "Stopp"
 *  mitten in seiner Antwort verloren. Was dabei von Himbis eigener Stimme kommt, sortiert
 *  sprachmodus.tsx aus (Grenze im Audio, Echo-Pruefung). Nie im Stumm- oder Fehlerzustand. */
export function ohrOffen(phase: Phase): boolean {
  return phase === "hoert" || phase === "denkt" || phase === "spricht";
}

/** Eine Meldung unter Himbi. `fehlerzustand`: sie gehoert zum Fehlerzustand (kein Mikrofon,
 *  keine Verbindung, Einwilligung fehlt) und bleibt bis zum neuen Versuch. Sonst (ein
 *  gescheiterter Chat, das Gespraech bleibt offen) gilt sie nur bis zur naechsten Frage oder
 *  Antwort: bis zum 29.09.2026 stand "Ein unbekannter Fehler" ueber allen weiteren Antworten
 *  (Befund der Gegenpruefung). */
export interface SprachMeldung {
  text: string;
  fehlerzustand: boolean;
}

/** Die Meldung nach einem Ereignis des Ablaufs (siehe SprachMeldung). */
export function meldungNachEreignis<M extends SprachMeldung>(m: M | null, e: Ereignis): M | null {
  if (!m) return null;
  if (e.art === "mikrofon-bereit" || e.art === "fortsetzen") return null;
  if (!m.fehlerzustand && (e.art === "frage-gestellt" || e.art === "antwort-spricht")) return null;
  return m;
}

/** Himbi beginnt den Tag (lib/himbi-tagesbeginn.ts): was beim Uebergang nach "hoert" zu tun ist.
 *  "nichts": nicht jetzt (noch nicht zugehoert, oder in dieser Sitzung schon entschieden).
 *  "entfaellt": entschieden, heute in dieser Sitzung keine Begruessung (aus, schon gewesen, der
 *  Chat nicht bereit oder beschaeftigt, Einwilligung fehlt, eine Freigabe wartet), ohne den Tag
 *  zu verbrauchen. "fragen": die Frage nach der Tageslage stellen und den Tag merken. */
export type TagesbeginnAktion = "nichts" | "entfaellt" | "fragen";

export function tagesbeginnAktion(l: {
  phase: Phase;
  schonEntschieden: boolean;
  einstellungAn: boolean;
  faellig: boolean;
  chat: { bereit: boolean; beschaeftigt: boolean; einwilligungFehlt: boolean };
  freigabeOffen: boolean;
}): TagesbeginnAktion {
  if (l.phase !== "hoert" || l.schonEntschieden) return "nichts";
  if (!l.einstellungAn || !l.faellig) return "entfaellt";
  if (!l.chat.bereit || l.chat.beschaeftigt || l.chat.einwilligungFehlt || l.freigabeOffen) return "entfaellt";
  return "fragen";
}

/** Ist der Assistent dran? Dann unterbricht ein Tipp auf Himbi. */
export function assistentIstDran(phase: Phase): boolean {
  return phase === "denkt" || phase === "spricht";
}

/** Die Antwort ist fertig, wenn die Anfrage durch ist UND nichts mehr gesprochen
 *  wird oder noch zu sprechen ansteht. Waehrend die Antwort entsteht, meldet die
 *  Sprachausgabe kurz "still", bevor der erste Abschnitt geladen ist - deshalb
 *  zaehlt "laedt" wie "spricht". */
export function antwortFertig(stand: { beschaeftigt: boolean; spricht: boolean; laedt: boolean }): boolean {
  return !stand.beschaeftigt && !stand.spricht && !stand.laedt;
}

/** So lange muss alles still sein, bevor die Phase wieder "hoert" ist. Zwischen dem
 *  Ende des Streams und dem Anstoss des Vorlesens liegt ein Renderdurchlauf; ohne diese
 *  Gnadenfrist sprang die Anzeige mitten in diese Luecke auf "Ich hoere zu". Seit dem
 *  28.09.2026 hoert die Erkennung ohnehin durchgehend mit (ohrOffen), die Frist verzoegert
 *  also keine Antwort mehr; 300 statt 700 ms, damit ein schnelles "Ja" auf Himbis Frage
 *  nicht in die alte Phase faellt. */
export const RUHE_VOR_ZUHOEREN_MS = 300;

/** So lange darf beim Zuhoeren niemand sprechen, dann schaltet sich das Mikrofon stumm
 *  (vorher nach der 2-Minuten-Grenze einer Sitzung, die es im Gespraech nicht mehr gibt). */
export const STILLE_BIS_STUMM_MS = 120_000;

// --- 1b. Wortbefehle: unterbrechen und beenden ----------------------------------
//
// Bis zum 28.09.2026 beendete "Stopp" den ganzen Sprachmodus (Rueckmeldung vom 25.09.2026:
// "ich muss ihn stoppen koennen mit Stopp"). Seit der Rueckmeldung vom 28.09.2026 ("Key-
// Woerter, wo ich die AI unterbrechen und etwas anderes fragen kann, ohne dass sie den
// Kontext verliert, wie wenn sie das Falsche vorliest") sind es zwei Arten:
//
//   - UNTERBRECHEN ("Stopp", "Halt", "Moment", "Warte", "Nein", "Himbi"): Himbi verstummt,
//     das Gespraech bleibt offen und der Verlauf erhalten. Was in derselben Aeusserung
//     danach kommt, ist die naechste Frage ("Stopp, zeig mir lieber die Reklamationen").
//     Gilt nur, waehrend Himbi dran ist (denkt oder spricht) - beim Zuhoeren gibt es
//     nichts zu unterbrechen.
//   - BEENDEN ("Sprachmodus beenden", "Gespraech beenden", "Tschuess Himbi"): schliesst den
//     Sprachmodus, in jeder Phase.
//
// Beides nur am Anfang bzw. als ganze Aeusserung, nie als Wort mittendrin ("Was bedeutet
// Stopp bei einer Kuehlkette?" bleibt eine Frage).

const UNTERBRECHEN_KERN = new Set([
  // Deutsch
  "stopp", "stop", "halt", "moment", "warte", "wart", "warten", "pause", "ruhe", "still", "abbrechen", "aufhören", "aufhoeren", "nein", "falsch",
  // Englisch
  "wait", "hold", "no", "cancel",
  // Russisch
  "стоп", "стой", "подожди", "погоди", "хватит", "минутку", "секунду", "нет", "отмена", "прекрати", "остановись",
  // Kasachisch
  "тоқта", "тоқтат", "тоқтаңыз", "күте", "күт", "жоқ",
  // Der Name: wer Himbi anspricht, waehrend er redet, will ihn unterbrechen.
  "himbi", "химби",
]);
const BEENDEN_KERN = new Set([
  // Deutsch
  // Nicht "aus": "Das sieht gut aus", mitten in Himbis Antwort gesagt, beendete sonst alles.
  "beenden", "beende", "schließen", "schliessen", "schließe", "verlassen", "tschüss", "tschüs", "tschuess", "wiedersehen",
  // Englisch
  "end", "exit", "quit", "close", "bye", "goodbye",
  // Russisch
  "выключи", "выключить", "заверши", "завершить", "закончи", "закончить", "выйди", "выйти", "пока", "свидания",
  // Kasachisch
  "аяқта", "аяқтау", "өшір", "өшіру", "жап", "жабу", "сау",
]);
/** Die Beiwoerter, die nie zum Inhalt danach gehoeren. Artikel und "Sprachmodus" zaehlen im
 *  Befehl ("Stopp die Fuehrung"), aber vor einer Frage gehoeren sie zu ihr: aus "Nein, das ist
 *  falsch" wird sonst "ist falsch". Nicht dieselbe Liste wie FREIGABE_FUELL (unten): dort
 *  fehlen "ok" und "okay" absichtlich, sie sind dort eine Zusage. */
const FUELLWOERTER = new Set([
  "bitte", "please", "пожалуйста", "өтінемін", "himbi", "химби", "jetzt", "sofort", "mal", "doch", "kurz", "eben", "ok", "okay", "hey", "danke",
]);
/** Woerter, die einen Befehl begleiten, ohne ihm einen eigenen Inhalt zu geben: die
 *  Fuellwoerter und dazu, was nur im Befehl nichts bedeutet (eine Liste statt zwei Kopien,
 *  seit dem 29.09.2026). */
const BEIWOERTER = new Set([
  ...FUELLWOERTER,
  "einfach", "alles", "auf", "on", "a", "second", "sec", "einen",
  "den", "das", "die", "sprachmodus", "gespräch", "gespraech", "modus", "führung", "fuehrung",
  "the", "voice", "mode", "conversation",
  "голосовой", "режим", "режима", "разговор", "разговора", "из", "до", "ещё", "еще",
  "дауыс", "режимі", "режимін", "әңгіме", "әңгімені", "тұр", "бол",
]);
const HOEREN = new Set(["hör", "hoer", "hören", "hoeren"]);

function woerterVon(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

/** Ist diese Aeusserung nur der Befehl, den Sprachmodus zu beenden: ein Beendenwort, dazu
 *  hoechstens Beiwoerter ("Sprachmodus beenden", "Tschuess Himbi", "Auf Wiedersehen")? */
export function istBeendenBefehl(text: string): boolean {
  const woerter = woerterVon(text);
  if (woerter.length === 0 || woerter.length > 6) return false;
  let kern = false;
  for (const w of woerter) {
    if (BEENDEN_KERN.has(w)) kern = true;
    else if (!BEIWOERTER.has(w)) return false;
  }
  return kern;
}

/**
 * Beginnt diese Aeusserung mit einem Unterbrechen-Befehl? Dann liefert sie, was danach
 * kommt (`rest`, leer bei "Stopp" allein), sonst null. Ein Befehl ist eine Folge aus
 * Unterbrechen- und Beiwoertern am Anfang, mit mindestens einem Unterbrechenwort:
 * "Stopp", "Halt, halt", "Himbi, warte mal", "Nein, ich meinte die Lieferungen" (rest:
 * "ich meinte die Lieferungen"). "Hoer auf" zaehlt als ein Wort.
 */
export function unterbrechungsBefehl(text: string): { rest: string } | null {
  const woerter = [...text.matchAll(/[\p{L}]+/gu)];
  let kern = false;
  // Bis wohin der Befehl sicher reicht (Befehls- und Fuellwoerter); ein Artikel davor gehoert
  // zur Frage, falls noch eine kommt.
  let ende = 0;
  let i = 0;
  for (; i < woerter.length; i++) {
    const w = woerter[i]![0].toLowerCase();
    const naechstes = woerter[i + 1]?.[0].toLowerCase();
    let fest = true;
    if (UNTERBRECHEN_KERN.has(w)) kern = true;
    else if (HOEREN.has(w) && naechstes === "auf") {
      kern = true;
      i += 1;
    } else if (BEIWOERTER.has(w)) fest = FUELLWOERTER.has(w);
    else break;
    const m = woerter[i]!;
    if (fest) ende = m.index! + m[0].length;
  }
  if (!kern) return null;
  // "Nein" und "Himbi" zaehlen hier mit. Der Aufrufer fragt nur, waehrend Himbi dran ist: beim
  // Zuhoeren sind "Nein danke" und "Himbi, was ist ein Reihenblock?" gewoehnliche Aeusserungen.
  // Kein Inhalt nach dem Befehl ("Stopp die Fuehrung"): nichts bleibt uebrig.
  const rest = i >= woerter.length ? "" : text.slice(ende).replace(/^[\s,.;:!?…-]+/, "").trim();
  return { rest };
}

/** Nur anhalten, ohne Inhalt ("Stopp", "Moment", "Hoer auf"): beim Zuhoeren gibt es nichts
 *  anzuhalten, und als Frage an Himbi waere es sinnlos. "Nein" oder "Himbi" allein zaehlen hier
 *  NICHT - "Nein" ist beim Zuhoeren oft die Antwort auf Himbis Frage. */
const KEIN_REINES_ANHALTEN = new Set(["nein", "no", "нет", "жоқ", "himbi", "химби", "falsch"]);
const NUR_ANHALTEN = new Set([...UNTERBRECHEN_KERN].filter((w) => !KEIN_REINES_ANHALTEN.has(w)));
export function istNurAnhalten(text: string): boolean {
  const woerter = woerterVon(text);
  if (woerter.length === 0 || woerter.length > 5) return false;
  let kern = false;
  for (let i = 0; i < woerter.length; i++) {
    const w = woerter[i]!;
    if (NUR_ANHALTEN.has(w) || (HOEREN.has(w) && woerter[i + 1] === "auf")) kern = true;
    else if (!BEIWOERTER.has(w)) return false;
  }
  return kern;
}

/** Ein erkanntes Wort, wie istEcho und die Wortlisten es vergleichen: klein, ohne Satzzeichen. */
function kernwort(wort: string): string {
  return wort.toLowerCase().replace(/[^\p{L}]/gu, "");
}

/** Der Befehl ab dem Wort `ab`: dieses Wort und was danach kommt, ohne Himbis Echo dahinter.
 *  Sagt der Nutzer "Tschuess Himbi" mitten in eine Antwort, haengt die Erkennung oft Himbis
 *  naechste Worte an; ohne sie waere es kein ganzer Beenden-Befehl mehr. */
export function befehlOhneEcho(woerter: readonly string[], ab: number, istEcho: (wort: string) => boolean): string {
  if (ab < 0 || ab >= woerter.length) return "";
  return [woerter[ab]!, ...woerter.slice(ab + 1).filter((w) => !istEcho(kernwort(w)))].join(" ");
}

/** Wo im Text ein Befehl beginnt (Index des Wortes), fuer Text, dem Himbis eigene Stimme
 *  vorausgehen kann: waehrend er spricht, hoert die Erkennung sein Echo mit. `istEcho` sagt,
 *  ob ein Wort gerade von Himbi selbst kam. Liefert den ersten Treffer, der kein Echo ist.
 *  Ein Beendenwort zaehlt nur, wenn ab dort ein ganzer Beenden-Befehl steht (Himbis Echo
 *  dahinter nicht mitgezaehlt, befehlOhneEcho): "пока" heisst auch "noch", und "Пока поставок
 *  нет." am Anfang einer Antwort unterbrach Himbi sonst (Befund der Gegenpruefung vom
 *  28.09.2026). */
export function befehlsBeginn(woerter: readonly string[], istEcho: (wort: string) => boolean): number | null {
  for (let i = 0; i < woerter.length; i++) {
    const w = kernwort(woerter[i]!);
    const kern =
      UNTERBRECHEN_KERN.has(w) ||
      (BEENDEN_KERN.has(w) && istBeendenBefehl(befehlOhneEcho(woerter, i, istEcho))) ||
      (HOEREN.has(w) && kernwort(woerter[i + 1] ?? "") === "auf");
    if (kern && !istEcho(w)) return i;
  }
  return null;
}

/** Waehrend Himbi spricht: bei welchem Wort die Aeusserung des Nutzers beginnt, in der bei
 *  `befehl` ein Befehlswort steht. Die eigenen Woerter direkt davor gehoeren dazu, Himbis Echo
 *  (`gesagt`) nicht. Bis zur Gegenpruefung vom 29.09.2026 begann die Frage immer beim Befehlswort:
 *  aus "Wie sagt man Stopp auf Russisch?" wurde "auf Russisch?", und "Kannst du die Schicht
 *  beenden?" beendete den Sprachmodus. */
export function aeusserungsBeginn(woerter: readonly string[], befehl: number, gesagt: string): number {
  const himbi = new Set(woerterVon(gesagt));
  let i = Math.min(Math.max(0, befehl), woerter.length);
  while (i > 0 && !woerterVon(woerter[i - 1]!).every((x) => himbi.has(x))) i--;
  return i;
}

/** Ein Beendenwort beendet den Sprachmodus nur, wenn die Aeusserung damit BEGINNT ("Tschuess
 *  Himbi" in Himbis Satz hinein). Steht es am Ende eigener Worte ("Wie kann ich die Aufgabe
 *  schliessen?"), ist es ein Verb in einer Frage. */
export function beendetWirklich(woerter: readonly string[], befehl: number, gesagt: string): boolean {
  return aeusserungsBeginn(woerter, befehl, gesagt) === befehl;
}

/** Ein Befehlswort, waehrend eine Freigabekarte offen ist: "Stopp", "Nein", "Warte" lehnen sie ab.
 *  "Himbi" allein oder eine Zusage mit Anrede ("Himbi, ja, bitte") nicht - die entscheidet
 *  beiEndpunkt. Bis zur Gegenpruefung vom 29.09.2026 lehnte "Himbi, ja, bitte." die Karte ab. */
export function befehlBeiOffenerKarte(woerter: readonly string[], ab: number, istEcho: (wort: string) => boolean): "ablehnen" | "ignorieren" {
  const wort = kernwort(woerter[ab] ?? "");
  if (wort === "himbi" || wort === "химби") return "ignorieren";
  return freigabeAntwort(befehlOhneEcho(woerter, ab, istEcho)) === "zusage" ? "ignorieren" : "ablehnen";
}

/** Das (erste) Befehlswort in einem Text, oder - mit `wort` - ob genau dieses Wort darin
 *  vorkommt. Fuer die Echo-Pruefung: sagt Himbi "nein" oder "Moment" gerade selbst, ist ein
 *  erkanntes "nein" ihr eigenes Echo aus dem Lautsprecher. */
export function befehlsWortIn(text: string, wort?: string): string | null {
  for (const w of woerterVon(text)) {
    if (wort ? w === wort : UNTERBRECHEN_KERN.has(w) || BEENDEN_KERN.has(w)) return w;
  }
  return null;
}

/** Hat jemand nach einer Frage wirklich weitergesprochen (Nachsatz), oder war es nur ein
 *  Geraeusch? Ein Wort aus mindestens zwei Buchstaben genuegt. */
export function istGesprochen(text: string): boolean {
  return woerterVon(text).some((w) => w.length >= 2);
}

/** Laute ohne Inhalt: Zoegern, Brummen, ein "Ok" nebenher. */
const FUELLLAUTE = new Set([
  "äh", "ähm", "öh", "öhm", "hm", "hmm", "mhm", "mh", "ok", "okay",
  "uh", "uhm", "um", "erm",
  "э", "ээ", "эм", "эмм", "хм", "хмм", "мм", "ммм",
]);

/** Bricht dieser Text beim Nachdenken die laufende Anfrage ab (Nachsatz)? Nur mit einem Wort,
 *  das mehr ist als ein Fuellaut: bis zum 29.09.2026 genuegte istGesprochen, und schon ein
 *  "Hm." oder "Äh" brach den Modellaufruf ab und stellte die Frage mit angehaengtem "Äh." neu
 *  (Befund der Gegenpruefung). */
export function istNachsatz(text: string): boolean {
  return woerterVon(text).some((w) => w.length >= 2 && !FUELLLAUTE.has(w));
}

/** Wie Himbi unterbrochen wurde: per Befehlswort, per Stimme (Lautstaerke-Waechter) oder per
 *  Tipp bzw. Leertaste. */
export type UnterbrechungsArt = "wort" | "stimme" | "tipp";

/** Kann die naechste Aeusserung mit dem Befehl beginnen, der schon gewirkt hat? Nach einem Tipp
 *  nicht: der Nutzer hat nichts gesagt (bis zum 29.09.2026 galt es auch dort, und die erste Frage
 *  danach wurde am ersten Befehlswort darin abgeschnitten). */
export function beginntMitBefehl(art: UnterbrechungsArt): boolean {
  return art !== "tipp";
}

/** Die ersten Woerter einer Aeusserung, in denen nach einer Unterbrechung der Befehl stehen kann. */
const BEFEHL_NACH_UNTERBRECHUNG_WOERTER = 4;

/** Die erste Aeusserung nach einer Unterbrechung: beginnt sie mit dem Befehl, der schon
 *  gewirkt hat ("Stopp, zeig mir lieber ..."), liefert dies den Rest, sonst null (der Text
 *  bleibt, wie er ist). Vor dem Befehl darf nur ein Rest von Himbis Echo stehen ("Hof. Stopp,
 *  zeig mir ..."): `echo` ist, was er beim Unterbrechen sagte. Bis zum 29.09.2026 zaehlte jedes
 *  Befehlswort in den ersten vier Woertern, und aus "Wie sagt man Stopp auf Russisch?" wurde
 *  "auf Russisch?" (Befund der Gegenpruefung). */
export function frageNachUnterbrechung(woerter: readonly string[], echo: string): string | null {
  const b = befehlsBeginn(woerter.slice(0, BEFEHL_NACH_UNTERBRECHUNG_WOERTER), () => false);
  if (b === null) return null;
  const himbi = new Set(woerterVon(echo));
  const davorEcho = woerter.slice(0, b).every((w) => woerterVon(w).every((x) => himbi.has(x)));
  if (!davorEcho) return null;
  return unterbrechungsBefehl(woerter.slice(b).join(" "))?.rest ?? null;
}

/** Waehrend Himbi spricht: bis wohin (Audio-ms) die Befehlssuche schon abgeschlossen ist. Jedes
 *  endgueltige Wort wurde gegen den Satz geprueft, der klang, als es kam (Echo-Pruefung gegen
 *  den klingenden und den vorigen Satz); spaeter, wenn zwei Saetze weiter gespielt sind, fehlte
 *  dieser Satz in der Pruefung, und Himbis eigenes "Nein," galt als Befehl des Nutzers (Befund
 *  der Gegenpruefung vom 28.09.2026). Deshalb rueckt der Anfang des Suchfensters hinter die
 *  schon geprueften Woerter. Ein "Hoer" am Ende bleibt drin: mit "auf" wird es noch ein Befehl.
 *  Nur aufrufen, wenn in `woerter` kein Befehl gefunden wurde. */
export function befehlGeprueftBis(
  woerter: readonly { text: string; startMs: number | null }[],
  endgueltige: number,
  bisher: number,
): number {
  let bis = bisher;
  const n = Math.min(endgueltige, woerter.length);
  for (let i = 0; i < n; i++) {
    const w = woerter[i]!;
    if (i === n - 1 && HOEREN.has(kernwort(w.text))) break;
    if (w.startMs !== null) bis = Math.max(bis, w.startMs + 1);
  }
  return bis;
}

/** Bindewoerter, mit denen ein Nachsatz typischerweise weitergeht. Die Erkennung schreibt sie
 *  nach ihrem eigenen Punkt gross ("Ja. Und zeig mir ..."). */
const BINDEWOERTER = new Set([
  "und", "aber", "oder", "dann", "also", "sondern", "and", "but", "or", "then", "so",
  "и", "а", "но", "или", "потом", "тогда", "және", "бірақ", "немесе", "сосын",
]);

/** "Ja." + "und zeig mir die Lieferungen." -> "Ja, und zeig mir die Lieferungen." Der Punkt des
 *  ersten Teils kam nur, weil die Erkennung dort ein Ende vermutete. Beginnt der Nachsatz
 *  klein oder mit einem Bindewort, wird es ein Satz; sonst bleiben es zwei. */
export function fuegeZusammen(vorher: string, nachsatz: string): string {
  const a = vorher.trim();
  const b = nachsatz.trim();
  if (!a) return b;
  if (!b) return a;
  const erstes = /^[\p{L}]+/u.exec(b)?.[0] ?? "";
  if (BINDEWOERTER.has(erstes.toLowerCase())) return `${a.replace(/[.!?…]+$/, ",")} ${erstes.toLowerCase()}${b.slice(erstes.length)}`;
  const kleinAnfang = /^[\p{Ll}]/u.test(b);
  return kleinAnfang ? `${a.replace(/[.!?…]+$/, ",")} ${b}` : `${a} ${b}`;
}

// --- 1c. Zusage/Absage bei einer offenen Freigabe -------------------------------
//
// Seit dem 25.09.2026 hat der Sprachmodus dieselben Rechte wie der sichtbare
// Chat: eine Aktion, die Daten aendert, zeigt die Anwendung als Karte und
// wartet auf eine Entscheidung. Ohne Knopf im Sprachmodus zaehlt dafuer die
// naechste ganze Aeusserung - wie beim Wortbefehl "Stopp" nur als exaktes
// Wort, nicht als Wort mittendrin ("Ja, aber was kostet das?" ist keine reine
// Zusage und wird als Frage weitergereicht, nicht als Freigabe gewertet).

// Bis zum 28.09.2026 musste die ganze Aeusserung nach dem Entfernen einer Bitte am Rand genau
// einem Eintrag gleichen. Soniox liefert aber Satzzeichen: "Ja, bitte." war damit keine Zusage
// (die Bitte stand vor dem Punkt), und "Ja, mach das." ebenso wenig. Jetzt zaehlen Woerter:
// Kernwoerter und feste Wendungen einer Seite, dazu Fuellwoerter, sonst nichts.
const ZUSAGE_KERN = new Set([
  // Deutsch
  "ja", "jawohl", "genau", "bestätigen", "bestätige", "bestätigt", "freigeben", "ok", "okay", "klar", "gerne", "gern", "natürlich",
  // Englisch
  "yes", "yeah", "yep", "yup", "confirm", "approve", "sure",
  // Russisch ("Да, конечно", "Ладно" und "Угу" fehlten bis zur Gegenpruefung vom 29.09.2026)
  "да", "давай", "подтверждаю", "подтвердить", "хорошо", "ага", "конечно", "ладно", "ок", "окей", "угу",
  // Kasachisch
  "иә", "жарайды", "растаймын", "әрине",
]);
const ZUSAGE_WENDUNGEN = ["mach das", "mach es", "mach weiter", "gib frei", "do it", "go ahead"];
const ABSAGE_KERN = new Set([
  // Deutsch
  "nein", "nicht", "abbrechen", "stopp", "stop",
  // Englisch
  "no", "nope", "cancel",
  // Russisch
  "нет", "отмена",
  // Kasachisch
  "жоқ", "тоқтат",
]);
// "don't" zerfaellt in woerterVon() in "don t".
const ABSAGE_WENDUNGEN = ["lass es", "lass das", "don t", "не надо"];
/** Begleiten eine Zusage oder Absage, ohne etwas daran zu aendern ("Ja, bitte, jetzt", "Äh, ja").
 *  Die Fuellaute ohne "ok"/"okay" (die sind hier eine Zusage): bis zur Gegenpruefung vom
 *  29.09.2026 war "Äh, ja." keine Zusage. */
const FREIGABE_FUELL = new Set([
  "bitte", "please", "пожалуйста", "өтінемін", "danke", "thanks", "спасибо", "рахмет", "himbi", "химби", "jetzt", "sofort", "doch",
  ...[...FUELLLAUTE].filter((w) => w !== "ok" && w !== "okay"),
]);

function nurDieseSeite(text: string, kern: ReadonlySet<string>, wendungen: readonly string[]): boolean {
  const woerter = woerterVon(text).filter((w) => !FREIGABE_FUELL.has(w));
  if (woerter.length === 0 || woerter.length > 6) return false;
  let rest = ` ${woerter.join(" ")} `;
  for (const w of wendungen) rest = rest.split(` ${w} `).join(" ");
  const uebrig = rest.split(" ").filter(Boolean);
  return uebrig.every((w) => kern.has(w));
}

/** Ein einzelnes Wort mit Fragezeichen ("Ja?", "Да?") ist eine Rueckfrage, keine Zusage. */
function istRueckfrage(text: string): boolean {
  return /\?\s*$/.test(text) && woerterVon(text).length === 1;
}

/** Ist diese fertig erkannte Aeusserung eine reine Zusage zu einer offenen
 *  Freigabe (Klick- oder Aktionskarte)? "Ja, bitte.", "Ja, mach das." ja,
 *  "Ja, aber was kostet das?" nein, die Rueckfrage "Ja?" auch nicht. */
export function istZusageBefehl(text: string): boolean {
  return !istRueckfrage(text) && nurDieseSeite(text, ZUSAGE_KERN, ZUSAGE_WENDUNGEN);
}

/** Ist diese fertig erkannte Aeusserung eine reine Absage zu einer offenen
 *  Freigabe? "Stopp"/"Stop" zaehlen bewusst auch hier: waehrend eine Karte
 *  offen ist, soll damit die Aktion abgelehnt werden, nicht Himbi angehalten. */
export function istAbsageBefehl(text: string): boolean {
  return nurDieseSeite(text, ABSAGE_KERN, ABSAGE_WENDUNGEN);
}

/** Was eine ganze Aeusserung fuer eine offene Freigabekarte bedeutet: zusagen, ablehnen,
 *  ablehnen und den Sprachmodus beenden ("Sprachmodus beenden"), oder nichts davon. */
export function freigabeAntwort(text: string): "zusage" | "absage" | "beenden" | null {
  if (istZusageBefehl(text)) return "zusage";
  if (istAbsageBefehl(text)) return "absage";
  if (istBeendenBefehl(text)) return "beenden";
  return null;
}

/** Die Antwort auf eine Freigabekarte, auch wenn Himbi dabei noch spricht: ohne die Woerter aus
 *  dem, was er gerade gesagt hat (`gesagt`), denn die Erkennung hoert ihn mit ("Ja, bitte. Jetzt
 *  klicke ich auf Anlegen"). Gemessen am 28.09.2026: man antwortet oft mitten in seinen Satz.
 *
 *  Erst das Echo heraus, dann pruefen. Bis zur Gegenpruefung vom 29.09.2026 zaehlte zuerst der
 *  ganze Text, und ein reines Echo ("Gerne." oder "Хорошо." am Anfang von Himbis Satz) gab die
 *  Karte frei, ohne dass der Nutzer etwas gesagt hatte. Sagt der Nutzer genau ein Wort, das auch
 *  Himbi gerade sagt, zaehlt es nicht - er wiederholt es, sobald Himbi still ist (dann ist
 *  `gesagt` leer). Eine faelschliche Freigabe waere schlimmer als ein zweites "Ja". */
export function freigabeAntwortMitEcho(woerter: readonly string[], gesagt: string): "zusage" | "absage" | "beenden" | null {
  const echo = new Set(woerterVon(gesagt));
  if (echo.size === 0) return freigabeAntwort(woerter.join(" "));
  const eigene = woerter.filter((w) => !woerterVon(w).every((x) => echo.has(x)));
  return eigene.length > 0 ? freigabeAntwort(eigene.join(" ")) : null;
}

// --- 2. Rechteck eines hervorgehobenen Bereichs -------------------------------------
//
// Bis zum 25.09.2026 stand hier, wohin die Kugel rueckt, wenn ein Bereich
// hervorgehoben ist (besterPlatz). Seit Himbi das Gespraech fuehrt, dockt er links
// ueber der Navigationsleiste an (sprachmodus.tsx); die Platzsuche war ungenutzt
// und ist entfernt. Das Rechteck braucht weiter der Rahmen um das Ziel
// (sprach-spotlight.tsx) und der Blick von Himbi.

export interface Rechteck {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

/** Das neu gemessene Rechteck, oder das bisherige, wenn sich nichts geaendert hat. Der Rahmen
 *  misst bei jeder Aenderung im DOM neu (sprach-spotlight.tsx); ein neues Objekt mit gleichen
 *  Werten liess React bis zum 29.09.2026 jedes Mal den ganzen Sprachmodus neu aufbauen, samt
 *  Layout-Messung auf dem Handy (Befund der Gegenpruefung). */
export function behalteGleichesRechteck(alt: Rechteck | null, neu: Rechteck | null): Rechteck | null {
  if (!alt || !neu) return neu;
  return alt.x === neu.x && alt.y === neu.y && alt.breite === neu.breite && alt.hoehe === neu.hoehe ? alt : neu;
}

/** Mitlaufender Text im Sprachmodus: standardmaessig aus (Rueckmeldung vom 26.09.2026:
 *  "das Schriftbild ausschaltbar machen und per Default ausgeschaltet lassen, dafuer kann
 *  die Figur groesser werden"). Nur ein ausdruecklich gespeichertes "an" schaltet ihn ein;
 *  auf dem Handy bleibt er ohnehin aus (sprachmodus.css). */
export const UNTERTITEL_SCHLUESSEL = "damicon-sprachmodus-untertitel";

export function untertitelAusSpeicher(wert: string | null | undefined): boolean {
  return wert === "an";
}

/** Wo Himbi auf dem Handy steht, wenn ein Bereich gerahmt ist. */
export interface Ausweichplatz {
  /** Oberkante der Einheit aus Himbi und Zustandszeile, in Pixeln vom Fensterrand. */
  y: number;
  /** oben/unten: frei neben dem Rahmen; kopfzeile: ueber dem Rahmen, dafuer auf der
   *  Kopfzeile; rand: der Rahmen reicht ueber den ganzen freien Streifen, Himbi steht
   *  unten an der Bedienleiste (dort liegt nur ein Stueck aus der Mitte des Bereichs,
   *  nicht seine Ueberschrift). */
  lage: "oben" | "unten" | "kopfzeile" | "rand";
  /** So hoch darf die Einheit ab y werden, ohne unter die Bedienleiste zu reichen. Ist
   *  sie hoeher (Freigabekarte im Querformat), scrollt die Karte in sich. */
  hoeheFrei: number;
}

/**
 * Auf dem Handy steht Himbi mittig und deckte damit gerade den Bereich zu, ueber den
 * er spricht (Rueckmeldung vom 26.09.2026: "die Figur verdeckt teilweise die Anzeige,
 * sie muss ausserhalb verschoben werden, zum Beispiel nach oben"). Er weicht aus, und
 * zwar immer in den Streifen zwischen Fensterrand und Bedienleiste (nie darunter oder
 * aus dem Bild):
 *   1. direkt ueber den Rahmen, wenn dort zwischen Kopfzeile und Rahmen Platz ist,
 *   2. sonst direkt darunter, wenn er dort ueber der Bedienleiste Platz hat,
 *   3. sonst ueber den Rahmen, dafuer auf die Kopfzeile (die zeigt im Gespraech nichts,
 *      was man braucht, der Rahmen schon),
 *   4. liegt der Rahmen ganz unter der Leiste oder ganz ueber dem Fenster (er wird
 *      gerade ins Bild gescrollt), an den Rand, der ihm abgewandt ist,
 *   5. sonst (der Rahmen reicht ueber den ganzen freien Streifen) unten an die Leiste.
 * rahmen: das Rechteck des Rahmens samt seinem Abstand um das Ziel. frei.oben: Unterkante
 * der Kopfzeile, frei.unten: Oberkante der Bedienleiste, frei.rand: oberster erlaubter
 * Punkt. Der Desktop braucht das nicht: dort steht Himbi links ueber der
 * Navigationsleiste, der Rahmen in der Mitte.
 */
export function ausweichPlatz(
  rahmen: Rechteck,
  einheitHoehe: number,
  frei: { oben: number; unten: number; rand: number },
  abstand = 8,
): Ausweichplatz {
  // Tiefste erlaubte Oberkante: darunter reichte die Einheit unter die Leiste. Passt sie
  // gar nicht in den Streifen, steht sie am Rand und scrollt (hoeheFrei).
  const tiefste = Math.max(frei.rand, frei.unten - einheitHoehe);
  const platz = (y: number, lage: Ausweichplatz["lage"]): Ausweichplatz => ({ y, lage, hoeheFrei: frei.unten - y });
  const ueber = rahmen.y - abstand - einheitHoehe;
  if (ueber >= frei.oben && ueber <= tiefste) return platz(ueber, "oben");
  const unter = rahmen.y + rahmen.hoehe + abstand;
  if (unter >= frei.oben && unter <= tiefste) return platz(unter, "unten");
  if (ueber >= frei.rand && ueber <= tiefste) return platz(ueber, "kopfzeile");
  if (rahmen.y >= frei.unten) return platz(tiefste, "oben");
  if (rahmen.y + rahmen.hoehe <= frei.rand) return platz(Math.min(Math.max(frei.oben, frei.rand), tiefste), "unten");
  return platz(tiefste, "rand");
}

// --- 3. Wenn die Live-Sitzung abbricht ---------------------------------------------
//
// Bis zum 24.09.2026 gab es darauf keine Antwort: kam kein Endpunkt, hoerte der
// Sprachmodus endlos zu. Jetzt entscheidet diese Regel, was nach einem Abbruch geschieht.

/** So oft wird nach schnellen Abbruechen neu verbunden, bevor der Sprachmodus aufgibt. */
export const MAX_NEUVERSUCHE = 2;
/** Pause vor dem Neuverbinden. */
export const NEUVERSUCH_MS = 500;
/** Eine Sitzung, die so lange lief, ist nicht beim Verbinden gescheitert: sie wurde spaeter
 *  beendet (Netzwechsel, Dienst, oder ihre Zeitgrenze - im Gespraech GESPRAECH_SITZUNG_S,
 *  derzeit 30 Minuten, beim Diktat SITZUNG_HOECHSTENS_S, derzeit 120 s; domain/diktat-live.ts)
 *  und zaehlt nicht als Fehlversuch. */
export const LANGE_SITZUNG_MS = 15_000;

export type NachAbbruch = "nicht-eingerichtet" | "stumm" | "neu-versuchen" | "aufgeben";

/** Was nach dem Abbruch einer Live-Sitzung geschieht.
 *
 *    - Die Schluessel-Route sagt ab (401, 403, 404: nicht angemeldet, keine Berechtigung,
 *      Live-Diktat aus): Neuverbinden hilft nicht, der Nutzer bekommt eine Meldung.
 *    - Die Sitzung lief lange und hat nichts gehoert: niemand spricht. Stumm schalten
 *      statt minutenlang Stille an die Erkennung zu schicken.
 *    - Sonst neu verbinden. Nur schnelle Abbrueche zaehlen als Fehlversuch; nach
 *      MAX_NEUVERSUCHE davon gibt der Sprachmodus mit einer Meldung auf. */
export function nachSitzungsAbbruch(a: {
  grund: string;
  dauerMs: number;
  gehoert: boolean;
  fehlversucheBisher: number;
}): { weiter: NachAbbruch; fehlversuche: number } {
  if (/^schluessel-http-(401|403|404)$/.test(a.grund)) return { weiter: "nicht-eingerichtet", fehlversuche: a.fehlversucheBisher };
  const lang = a.dauerMs >= LANGE_SITZUNG_MS;
  if (lang && !a.gehoert) return { weiter: "stumm", fehlversuche: 0 };
  const fehlversuche = (lang ? 0 : a.fehlversucheBisher) + 1;
  return { weiter: fehlversuche > MAX_NEUVERSUCHE ? "aufgeben" : "neu-versuchen", fehlversuche };
}

// --- 4. Dazwischenreden -------------------------------------------------------------
//
// In einem Gespraech unterbricht man, indem man spricht. Die Schwierigkeit: waehrend
// Himbi spricht, hoert das Mikrofon auch Himbi - aus dem Lautsprecher, gedaempft durch
// die Echounterdrueckung des Browsers, aber nicht immer ganz. Drei Schranken halten
// dieses Echo davon ab, Himbi selbst zu unterbrechen:
//
//   1. Mindestpegel: leises Murmeln und Raumgeraeusche zaehlen nie.
//   2. Grundrauschen: gemessen in den Pausen der Ausgabe; Sprache muss deutlich darueber
//      liegen (dasselbe Prinzip wie beim Diktat, domain/diktat.ts).
//   3. Echo: das Mikrofon muss lauter sein als ein Bruchteil dessen, was gerade
//      ausgegeben wird - samt Nachhall, denn das Echo kommt verzoegert an und klingt nach.
//
// Und erst durchgehende Sprache von dauerMs loest aus, kein einzelner Knall. Luecken
// zwischen Silben zaehlen dabei DOPPELT dagegen (leckender Zaehler, LUECKE_ZAEHLT_FACH):
// Sprechen mit drei Vierteln Anteil unterbricht, mit der Haelfte oder zwei Dritteln nicht.
// Bis zum 29.09.2026 stand hier "nur halb", der Code zaehlte aber schon immer doppelt; so
// bleibt es, im Zweifel unterbricht Himbi lieber nicht (supabase/tests/ki-assistent.mjs haelt
// die Silbenmuster fest).
//
// Die Werte sind Ausgangswerte auf derselben Skala wie das Diktat (RMS 0..1) und am
// echten Geraet nachzuziehen. Im Zweifel unterbricht Himbi lieber nicht: ein Tipp
// auf Himbi bleibt immer der sichere Weg.

export interface UnterbrechenEinstellungen {
  mindestPegel: number;
  rauschFaktor: number;
  /** Was als Grundrauschen durchgeht, wie DiktatEinstellungen.rauschDeckel. */
  rauschDeckel: number;
  /** Das Mikrofon muss lauter sein als dieses Vielfache der (nachhallenden) Ausgabe. */
  echoFaktor: number;
  /** Zeitkonstante des Nachhalls der Ausgabe. */
  nachhallMs: number;
  /** So lange muss durchgehend gesprochen werden. */
  dauerMs: number;
}

export const UNTERBRECHEN_STANDARD: UnterbrechenEinstellungen = {
  mindestPegel: 0.04,
  rauschFaktor: 3,
  rauschDeckel: 0.1,
  echoFaktor: 0.5,
  nachhallMs: 300,
  dauerMs: 400,
};

/** "vielleicht": es klingt nach Sprache, aber noch nicht lange genug. Daraus merkt sich
 *  sprachmodus.tsx den Einsatz der Stimme (erzeugeEinsatzMerker), damit der Anfang des Satzes
 *  zur naechsten Frage gehoert. Eine eigene Aufnahme laeuft dafuer seit dem 28.09.2026 nicht
 *  mehr mit (EIN Ohr fuers ganze Gespraech). */
export type UnterbrechenUrteil = "still" | "vielleicht" | "unterbrechen";

/** Wie viel eine Luecke im Zaehler gegen das Gesprochene zaehlt (siehe Abschnitt 4). */
const LUECKE_ZAEHLT_FACH = 2;

export interface UnterbrechungsWaechter {
  /** mikrofon und ausgabe: RMS 0..1. jetztMs: monoton steigend (performance.now()). */
  melde(mikrofon: number, ausgabe: number, jetztMs: number): UnterbrechenUrteil;
}

export function erzeugeUnterbrechungsWaechter(e: UnterbrechenEinstellungen = UNTERBRECHEN_STANDARD): UnterbrechungsWaechter {
  let zuletztMs: number | null = null;
  let nachhall = 0;
  let grundrauschen = Number.POSITIVE_INFINITY;
  let gesprochenMs = 0;
  return {
    melde(mikrofon, ausgabe, jetztMs) {
      // Hoechstens 100 ms je Schritt: nach einem Tab-Wechsel steht die Bildschleife, und
      // die ganze Pause auf einmal gezaehlt waere ein Sprung.
      const dt = zuletztMs === null ? 0 : Math.min(100, Math.max(0, jetztMs - zuletztMs));
      zuletztMs = jetztMs;
      nachhall = Math.max(ausgabe, nachhall * Math.exp(-dt / e.nachhallMs));
      // Grundrauschen nur, wenn die Ausgabe schweigt - sonst waere das Echo das Rauschen.
      if (nachhall < 0.01 && mikrofon <= e.rauschDeckel) grundrauschen = Math.min(grundrauschen, mikrofon);
      const schwelle = Math.max(
        e.mindestPegel,
        Number.isFinite(grundrauschen) ? grundrauschen * e.rauschFaktor : 0,
        nachhall * e.echoFaktor,
      );
      gesprochenMs = mikrofon > schwelle ? gesprochenMs + dt : Math.max(0, gesprochenMs - LUECKE_ZAEHLT_FACH * dt);
      if (gesprochenMs >= e.dauerMs) return "unterbrechen";
      return gesprochenMs > 0 ? "vielleicht" : "still";
    },
  };
}

/** So lange darf beim Dazwischenreden Stille sein, ohne dass der Einsatz der Stimme verfaellt. */
export const EINSATZ_HALTEN_MS = 1_000;
/** So lange muss es am Stueck nach Sprache klingen ("vielleicht"), bevor daraus ein Einsatz wird.
 *  Eine einzelne Geraeuschspitze (ein Bild) ist keiner. */
export const EINSATZ_MINDEST_MS = 100;
/** So weit vor dem gemerkten Einsatz beginnt die naechste Frage: der Waechter merkt die Stimme
 *  erst, wenn sie ueber der Schwelle ist, der Anfang des ersten Wortes liegt davor. */
export const EINSATZ_VORLAUF_MS = 300;

export interface EinsatzMerker {
  /** Das Urteil des Waechters in diesem Bild; liefert den Einsatz (Audio-ms) oder null. */
  melde(urteil: UnterbrechenUrteil, jetztMs: number): number | null;
}

/** Wo die Stimme des Nutzers eingesetzt hat. Der Einsatz ueberdauert kurze Pausen: in
 *  "Stopp, zeig mir ..." zaehlt der Waechter die Kommapause als Stille und hielte sonst erst
 *  "zeig" fuer den Anfang (Messung vom 28.09.2026). Gemerkt wird er erst, wenn es
 *  EINSATZ_MINDEST_MS am Stueck nach Sprache klang, und zwar mit dem Beginn dieses Stuecks: bis
 *  zum 29.09.2026 genuegte ein einzelnes Bild, und in lauter Umgebung hielten Spitzen im
 *  Abstand unter einer Sekunde den Einsatz auf der ersten fest; Himbis Echo seither kam dann in
 *  die naechste Frage (Befund der Gegenpruefung). */
export function erzeugeEinsatzMerker(): EinsatzMerker {
  let einsatz: number | null = null;
  let stillSeit: number | null = null;
  let stueckSeit: number | null = null;
  return {
    melde(urteil, jetztMs) {
      if (urteil === "still") {
        stueckSeit = null;
        stillSeit = stillSeit ?? jetztMs;
        if (jetztMs - stillSeit > EINSATZ_HALTEN_MS) einsatz = null;
        return einsatz;
      }
      stueckSeit = stueckSeit ?? jetztMs;
      if (jetztMs - stueckSeit >= EINSATZ_MINDEST_MS || urteil === "unterbrechen") {
        einsatz = einsatz ?? stueckSeit;
        stillSeit = null;
      }
      return einsatz;
    },
  };
}
