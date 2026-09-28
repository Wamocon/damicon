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
// Halbduplex: entweder hoert Himbi zu, oder der Assistent ist dran. Waehrend
// der Assistent spricht, ist das Mikrofon nicht in der Erkennung - sonst hoerte
// die Erkennung die eigene Stimme des Assistenten aus dem Lautsprecher und
// antwortete sich selbst. Unterbrochen wird wie im Gespraech durch Sprechen
// (Abschnitt 4: nur, was deutlich lauter ist als Echo und Grundrauschen) oder
// per Tipp auf Himbi bzw. die Leertaste - der sichere Weg in lauter Umgebung
// (Hof, Halle).

export type Phase =
  /** Kein Sprachmodus. */
  | "aus"
  /** Mikrofon wird geoeffnet, Schluessel geholt. */
  | "startet"
  /** Der Assistent wartet auf eine Frage und zeigt, was er hoert. */
  | "hoert"
  /** Die Aeusserung ist zu Ende, der letzte Text wird festgestellt. */
  | "versteht"
  /** Die Frage ist gestellt, der Assistent arbeitet (Daten, Navigation). */
  | "denkt"
  /** Der Assistent spricht. */
  | "spricht"
  /** Vom Nutzer angehalten (Stumm): nichts wird aufgenommen. */
  | "pausiert"
  /** Etwas ging schief (kein Mikrofon, Dienst weg). */
  | "fehler";

export type Ereignis =
  | { art: "starten" }
  | { art: "mikrofon-bereit" }
  | { art: "aeusserung-ende" }
  /** Text erkannt und abgeschickt. */
  | { art: "frage-gestellt" }
  /** Nichts verstanden: weiter zuhoeren. */
  | { art: "nichts-gehoert" }
  | { art: "antwort-spricht" }
  /** Antwort komplett vorgelesen (oder ohne Ton fertig): wieder zuhoeren. */
  | { art: "antwort-fertig" }
  /** Tipp auf Himbi waehrend der Assistent dran ist: sofort still, zuhoeren. */
  | { art: "unterbrechen" }
  | { art: "pausieren" }
  | { art: "fortsetzen" }
  | { art: "fehler" }
  | { art: "beenden" };

/** Der naechste Zustand. Unbekannte Uebergaenge lassen die Phase unveraendert -
 *  lieber ein verpasstes Ereignis als ein Sprung in einen Zustand, der nicht passt. */
export function naechstePhase(phase: Phase, e: Ereignis): Phase {
  if (e.art === "beenden") return "aus";
  if (e.art === "fehler") return phase === "aus" ? "aus" : "fehler";
  switch (phase) {
    case "aus":
      return e.art === "starten" ? "startet" : phase;
    case "startet":
      return e.art === "mikrofon-bereit" ? "hoert" : phase;
    case "hoert":
      if (e.art === "aeusserung-ende") return "versteht";
      if (e.art === "pausieren") return "pausiert";
      if (e.art === "antwort-spricht") return "spricht";
      return phase;
    case "versteht":
      if (e.art === "frage-gestellt") return "denkt";
      if (e.art === "nichts-gehoert") return "hoert";
      if (e.art === "pausieren") return "pausiert";
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
      return e.art === "starten" || e.art === "fortsetzen" ? "startet" : phase;
  }
}

/** Hoert die Erkennung in dieser Phase mit? Seit dem 28.09.2026 durchgehend, auch waehrend
 *  Himbi denkt und spricht (EINE Verbindung fuers ganze Gespraech, sprachmodus.tsx): nur so
 *  gehen weder ein Nachsatz ("Ja." ... "und zeig mir die Lieferungen") noch ein "Stopp"
 *  mitten in seiner Antwort verloren. Was dabei von Himbis eigener Stimme kommt, sortiert
 *  sprachmodus.tsx aus (Grenze im Audio, Echo-Pruefung). Nie im Stumm- oder Fehlerzustand. */
export function ohrOffen(phase: Phase): boolean {
  return phase === "hoert" || phase === "versteht" || phase === "denkt" || phase === "spricht";
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
/** Woerter, die einen Befehl begleiten, ohne ihm einen eigenen Inhalt zu geben. */
const BEIWOERTER = new Set([
  "bitte", "please", "пожалуйста", "өтінемін", "himbi", "химби", "jetzt", "sofort", "mal", "doch", "kurz", "eben",
  "ok", "okay", "hey", "danke", "einfach", "alles", "auf", "on", "a", "second", "sec", "einen",
  "den", "das", "die", "sprachmodus", "gespräch", "gespraech", "modus", "führung", "fuehrung",
  "the", "voice", "mode", "conversation",
  "голосовой", "режим", "режима", "разговор", "разговора", "из", "до", "ещё", "еще",
  "дауыс", "режимі", "режимін", "әңгіме", "әңгімені", "тұр", "бол",
]);
/** Die Beiwoerter, die nie zum Inhalt danach gehoeren. Artikel und "Sprachmodus" zaehlen im
 *  Befehl ("Stopp die Fuehrung"), aber vor einer Frage gehoeren sie zu ihr: aus "Nein, das ist
 *  falsch" wird sonst "ist falsch". */
const FUELLWOERTER = new Set([
  "bitte", "please", "пожалуйста", "өтінемін", "himbi", "химби", "jetzt", "sofort", "mal", "doch", "kurz", "eben", "ok", "okay", "hey", "danke",
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
const NUR_ANHALTEN = new Set([...UNTERBRECHEN_KERN].filter((w) => !["nein", "no", "нет", "жоқ", "himbi", "химби", "falsch"].includes(w)));
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

/** Wo im Text ein Befehl beginnt (Index des Wortes), fuer Text, dem Himbis eigene Stimme
 *  vorausgehen kann: waehrend er spricht, hoert die Erkennung sein Echo mit. `istEcho` sagt,
 *  ob ein Wort gerade von Himbi selbst kam. Liefert den ersten Treffer, der kein Echo ist. */
export function befehlsBeginn(woerter: readonly string[], istEcho: (wort: string) => boolean): number | null {
  for (let i = 0; i < woerter.length; i++) {
    const w = woerter[i]!.toLowerCase().replace(/[^\p{L}]/gu, "");
    const kern = UNTERBRECHEN_KERN.has(w) || BEENDEN_KERN.has(w) || (HOEREN.has(w) && woerter[i + 1]?.toLowerCase().replace(/[^\p{L}]/gu, "") === "auf");
    if (kern && !istEcho(w)) return i;
  }
  return null;
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
  "ja", "jawohl", "genau", "bestätigen", "bestätige", "freigeben", "ok", "okay", "klar", "gerne", "gern", "natürlich",
  // Englisch
  "yes", "yeah", "yep", "confirm", "approve", "sure",
  // Russisch
  "да", "давай", "подтверждаю", "подтвердить", "хорошо", "ага",
  // Kasachisch
  "иә", "жарайды", "растаймын",
]);
const ZUSAGE_WENDUNGEN = ["mach das", "mach es", "gib frei", "do it", "go ahead"];
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
/** Begleiten eine Zusage oder Absage, ohne etwas daran zu aendern ("Ja, bitte, jetzt"). */
const FREIGABE_FUELL = new Set(["bitte", "please", "пожалуйста", "өтінемін", "danke", "thanks", "спасибо", "рахмет", "himbi", "химби", "jetzt", "sofort"]);

function nurDieseSeite(text: string, kern: ReadonlySet<string>, wendungen: readonly string[]): boolean {
  const woerter = woerterVon(text).filter((w) => !FREIGABE_FUELL.has(w));
  if (woerter.length === 0 || woerter.length > 6) return false;
  let rest = ` ${woerter.join(" ")} `;
  for (const w of wendungen) rest = rest.split(` ${w} `).join(" ");
  const uebrig = rest.split(" ").filter(Boolean);
  return uebrig.every((w) => kern.has(w));
}

/** Ist diese fertig erkannte Aeusserung eine reine Zusage zu einer offenen
 *  Freigabe (Klick- oder Aktionskarte)? "Ja, bitte.", "Ja, mach das." ja,
 *  "Ja, aber was kostet das?" nein. */
export function istZusageBefehl(text: string): boolean {
  return nurDieseSeite(text, ZUSAGE_KERN, ZUSAGE_WENDUNGEN);
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

/** Die Antwort auf eine Freigabekarte, auch wenn Himbi dabei noch spricht: zuerst der ganze
 *  Text; hat die Erkennung Himbis eigene Worte mitgehoert ("Ja, bitte. Jetzt klicke ich auf
 *  Anlegen"), dann ohne die Woerter aus dem, was er gerade gesagt hat. Gemessen am 28.09.2026:
 *  die Karte erscheint oft, bevor Himbi den Satz davor gesprochen hat, und man antwortet
 *  mitten hinein. */
export function freigabeAntwortMitEcho(woerter: readonly string[], gesagt: string): "zusage" | "absage" | "beenden" | null {
  const ganz = freigabeAntwort(woerter.join(" "));
  if (ganz) return ganz;
  const echo = new Set(woerterVon(gesagt));
  if (echo.size === 0) return null;
  const eigene = woerter.filter((w) => !woerterVon(w).every((x) => echo.has(x)));
  return eigene.length > 0 && eigene.length < woerter.length ? freigabeAntwort(eigene.join(" ")) : null;
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
/** Eine Sitzung, die so lange lief, ist nicht gescheitert, sondern an ihre Zeitgrenze
 *  gestossen (SITZUNG_HOECHSTENS_S in domain/diktat-live.ts, derzeit 120 s). */
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
// Und erst durchgehende Sprache von dauerMs loest aus, kein einzelner Knall. Kurze
// Luecken zwischen Silben zaehlen dabei nur halb dagegen (leckender Zaehler).
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

/** "vielleicht": es klingt nach Sprache, aber noch nicht lange genug - Zeit, eine
 *  Aufnahme mitlaufen zu lassen, damit der Anfang des Satzes nicht verloren geht. */
export type UnterbrechenUrteil = "still" | "vielleicht" | "unterbrechen";

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
      gesprochenMs = mikrofon > schwelle ? gesprochenMs + dt : Math.max(0, gesprochenMs - 2 * dt);
      if (gesprochenMs >= e.dauerMs) return "unterbrechen";
      return gesprochenMs > 0 ? "vielleicht" : "still";
    },
  };
}
