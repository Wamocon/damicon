// Sprachmodus: ein Live-Gespraech mit dem Assistenten, ohne sichtbaren Chat.
//
// In der Mitte des Fensters sitzt eine Kugel, die auf die eigene Stimme und
// auf die Stimme des Assistenten reagiert, der Hintergrund tritt unscharf
// zurueck. Springt der Assistent zu einem Bereich der Anwendung, hebt er ihn
// hervor, und die Kugel rueckt klein an den Rand, damit der Bereich zu sehen
// ist. Ein Tipp auf die Kugel holt sie zurueck in die Mitte.
//
// Hier steht nur die reine Logik, ohne React und ohne Browser, damit
// supabase/tests/ki-assistent.mjs sie Fall fuer Fall pruefen kann:
//
//   1. der Ablauf des Gespraechs (wer ist dran?),
//   2. wohin die Kugel rueckt, wenn ein Bereich hervorgehoben ist,
//   3. was nach dem Abbruch einer Live-Sitzung geschieht,
//   4. wann Dazwischenreden Himbi unterbricht.

// --- 1. Ablauf ---------------------------------------------------------------------
//
// Halbduplex: entweder hoert die Kugel zu, oder der Assistent ist dran. Waehrend
// der Assistent spricht, ist das Mikrofon nicht in der Erkennung - sonst hoerte
// die Erkennung die eigene Stimme des Assistenten aus dem Lautsprecher und
// antwortete sich selbst. Unterbrochen wird wie im Gespraech durch Sprechen
// (Abschnitt 4: nur, was deutlich lauter ist als Echo und Grundrauschen) oder
// per Tipp auf die Kugel bzw. die Leertaste - der sichere Weg in lauter Umgebung
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
  /** Tipp auf die Kugel waehrend der Assistent dran ist: sofort still, zuhoeren. */
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

/** Nimmt das Mikrofon in dieser Phase auf? Nur beim Zuhoeren - nie, waehrend
 *  der Assistent dran ist (Echo) oder der Nutzer ihn angehalten hat. */
export function nimmtAuf(phase: Phase): boolean {
  return phase === "hoert";
}

/** Ist der Assistent dran? Dann unterbricht ein Tipp auf die Kugel. */
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

/** So lange muss alles still sein, bevor wieder zugehoert wird. Zwischen dem
 *  Ende des Streams und dem Anstoss des Vorlesens liegt ein Renderdurchlauf;
 *  ohne diese Gnadenfrist hoerte die Kugel mitten in diese Luecke hinein zu. */
export const RUHE_VOR_ZUHOEREN_MS = 700;

// --- 1b. Wortbefehl "Stopp" ----------------------------------------------------
//
// Sicherer Weg, das Gespraech zu beenden, als reine Aeusserung erkannt - kein
// Knopf, keine Taste noetig (Rueckmeldung vom 25.09.2026: "ich muss ihn
// stoppen koennen mit Stopp"). Nur die ganze Aeusserung zaehlt, nicht ein Wort
// mittendrin ("Was bedeutet Stopp bei einer Kuehlkette?" bleibt eine Frage).

// Seit dem 25.09.2026 (zweite Fassung) etwas toleranter: "Stopp, stopp",
// "Himbi, stopp", "Stopp die Fuehrung", "Nein, hoer auf" zaehlen auch - eine kurze
// Aeusserung aus Stoppwort und Beiwoertern. Alles mit einem anderen Inhalt
// ("Stopp den Bericht bitte") bleibt eine Frage.
const STOPP_KERN = new Set([
  // Deutsch
  "stopp", "stop", "halt", "abbrechen", "aufhören", "aufhoeren",
  // Russisch
  "стоп", "стой", "хватит", "остановись", "прекрати",
  // Kasachisch
  "тоқта", "тоқтат", "тоқтаңыз",
]);
const STOPP_BEIWOERTER = new Set([
  "bitte", "please", "пожалуйста", "өтінемін", "himbi", "химби", "jetzt", "sofort", "mal", "doch",
  "ok", "okay", "hey", "nein", "die", "führung", "fuehrung", "danke", "einfach", "alles",
]);
const HOEREN = new Set(["hör", "hoer", "hören", "hoeren"]);
const HOEFLICHKEIT = /^(bitte|please|пожалуйста|өтінемін)[\s,]+|[\s,]+(bitte|please|пожалуйста|өтінемін)$/gi;

function woerterVon(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

/** Ist diese erkannte Aeusserung nur der Befehl anzuhalten: ein Stoppwort, dazu
 *  hoechstens Beiwoerter wie "bitte", "Himbi" oder "die Fuehrung"? */
export function istStoppBefehl(text: string): boolean {
  const woerter = woerterVon(text);
  if (woerter.length === 0 || woerter.length > 6) return false;
  let kern = false;
  for (let i = 0; i < woerter.length; i++) {
    const w = woerter[i]!;
    if (STOPP_KERN.has(w)) {
      kern = true;
      continue;
    }
    if (HOEREN.has(w) && woerter.includes("auf")) {
      kern = true;
      continue;
    }
    if (w === "auf" && woerter.some((x) => HOEREN.has(x))) continue;
    if (!STOPP_BEIWOERTER.has(w)) return false;
  }
  return kern;
}

/** Das (erste) Stoppwort in einem Text, oder - mit `wort` - ob genau dieses Wort
 *  darin vorkommt. Fuer den Stoppwort-Waechter: sagt Himbi "Stopp" gerade selbst,
 *  ist ein erkanntes "Stopp" ihr eigenes Echo. */
export function stoppWortIn(text: string, wort?: string): string | null {
  for (const w of woerterVon(text)) {
    if (wort ? w === wort : STOPP_KERN.has(w)) return w;
  }
  return null;
}

// --- 1c. Zusage/Absage bei einer offenen Freigabe -------------------------------
//
// Seit dem 25.09.2026 hat der Sprachmodus dieselben Rechte wie der sichtbare
// Chat: eine Aktion, die Daten aendert, zeigt die Anwendung als Karte und
// wartet auf eine Entscheidung. Ohne Knopf im Sprachmodus zaehlt dafuer die
// naechste ganze Aeusserung - wie beim Wortbefehl "Stopp" nur als exaktes
// Wort, nicht als Wort mittendrin ("Ja, aber was kostet das?" ist keine reine
// Zusage und wird als Frage weitergereicht, nicht als Freigabe gewertet).

const ZUSAGE_WOERTER = new Set([
  // Deutsch
  "ja", "jawohl", "genau", "mach das", "bestätigen", "bestätige", "freigeben", "gib frei", "ok", "okay",
  // Englisch
  "yes", "yeah", "confirm", "approve", "do it",
  // Russisch
  "да", "давай", "подтверждаю", "подтвердить", "хорошо",
  // Kasachisch
  "иә", "жарайды", "растаймын",
]);
const ABSAGE_WOERTER = new Set([
  // Deutsch
  "nein", "nicht", "abbrechen", "lass es", "stopp", "stop",
  // Englisch
  "no", "cancel", "don't",
  // Russisch
  "нет", "отмена", "не надо",
  // Kasachisch
  "жоқ", "тоқтат",
]);

function bereinigteAeusserung(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(HOEFLICHKEIT, "")
    .replace(/[.!?…]+$/, "")
    .trim();
}

/** Ist diese fertig erkannte Aeusserung eine reine Zusage zu einer offenen
 *  Freigabe (Klick- oder Aktionskarte)? */
export function istZusageBefehl(text: string): boolean {
  return ZUSAGE_WOERTER.has(bereinigteAeusserung(text));
}

/** Ist diese fertig erkannte Aeusserung eine reine Absage zu einer offenen
 *  Freigabe? "Stopp"/"Stop" zaehlen bewusst auch hier: waehrend eine Karte
 *  offen ist, soll damit die Aktion abgelehnt werden - nicht der ganze
 *  Sprachmodus enden (istStoppBefehl wird dafuer bei offener Freigabe nicht
 *  geprueft, siehe sprachmodus.tsx). */
export function istAbsageBefehl(text: string): boolean {
  return ABSAGE_WOERTER.has(bereinigteAeusserung(text));
}

// --- 2. Wohin die Kugel rueckt -------------------------------------------------
//
// Ist ein Bereich hervorgehoben, darf ihn die Kugel nicht verdecken. Sie rueckt
// in die Ecke oder an die Kante, die am weitesten vom Ziel entfernt ist und das
// Ziel nicht ueberlappt - so wie die eigene Kachel in einer Videokonferenz.
// Kopfzeile, Seitenleiste, untere Leiste und Safe-Areas werden als Raender
// abgezogen: dort sitzt die Kugel nie.

export interface Rechteck {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

export interface Raender {
  oben: number;
  rechts: number;
  unten: number;
  links: number;
}

export type Platz = "oben-links" | "oben-rechts" | "unten-links" | "unten-rechts" | "mitte-links" | "mitte-rechts";

export const PLAETZE: readonly Platz[] = ["unten-rechts", "unten-links", "oben-rechts", "oben-links", "mitte-rechts", "mitte-links"];

/** Das Rechteck, das die Kugel an einem Platz einnimmt. */
export function rechteckAn(platz: Platz, fenster: { breite: number; hoehe: number }, blase: { breite: number; hoehe: number }, r: Raender, abstand: number): Rechteck {
  const links = r.links + abstand;
  const rechts = fenster.breite - r.rechts - abstand - blase.breite;
  const oben = r.oben + abstand;
  const unten = fenster.hoehe - r.unten - abstand - blase.hoehe;
  const mitteY = r.oben + (fenster.hoehe - r.oben - r.unten - blase.hoehe) / 2;
  const x = platz.endsWith("links") ? links : rechts;
  const y = platz.startsWith("oben") ? oben : platz.startsWith("unten") ? unten : mitteY;
  return { x, y, breite: blase.breite, hoehe: blase.hoehe };
}

function ueberlappung(a: Rechteck, b: Rechteck): number {
  const breite = Math.max(0, Math.min(a.x + a.breite, b.x + b.breite) - Math.max(a.x, b.x));
  const hoehe = Math.max(0, Math.min(a.y + a.hoehe, b.y + b.hoehe) - Math.max(a.y, b.y));
  return breite * hoehe;
}

function mittelpunkt(a: Rechteck): { x: number; y: number } {
  return { x: a.x + a.breite / 2, y: a.y + a.hoehe / 2 };
}

/**
 * Der beste Platz fuer die kleine Kugel neben einem hervorgehobenen Ziel.
 *
 * Reihenfolge der Kriterien:
 *   1. keine Ueberlappung mit dem Ziel (samt Sicherheitsabstand),
 *   2. am weitesten vom Ziel entfernt,
 *   3. bei Gleichstand der gewohnte Platz (Reihenfolge in PLAETZE: unten rechts
 *      zuerst - dort erwartet man eine schwebende Blase).
 * Ueberlappt jeder Platz (das Ziel fuellt den Bildschirm), gewinnt der mit der
 * kleinsten Ueberlappung.
 */
export function besterPlatz(
  ziel: Rechteck,
  fenster: { breite: number; hoehe: number },
  blase: { breite: number; hoehe: number },
  raender: Raender,
  abstand = 16,
  bisher?: Platz | null,
): { platz: Platz; rechteck: Rechteck } {
  const puffer = abstand;
  const zielMitPuffer = { x: ziel.x - puffer, y: ziel.y - puffer, breite: ziel.breite + 2 * puffer, hoehe: ziel.hoehe + 2 * puffer };
  const zm = mittelpunkt(ziel);
  const kandidaten = PLAETZE.map((platz, rang) => {
    const rechteck = rechteckAn(platz, fenster, blase, raender, abstand);
    const m = mittelpunkt(rechteck);
    return {
      platz,
      rechteck,
      rang,
      deckt: ueberlappung(rechteck, zielMitPuffer),
      entfernung: Math.hypot(m.x - zm.x, m.y - zm.y),
    };
  });
  // Ist der bisherige Platz noch frei, bleibt die Kugel dort: jedes Umsetzen
  // zieht den Blick auf sich, und das soll dem Ziel gehoeren.
  const alter = bisher ? kandidaten.find((k) => k.platz === bisher && k.deckt === 0) : undefined;
  if (alter) return { platz: alter.platz, rechteck: alter.rechteck };
  const frei = kandidaten.filter((k) => k.deckt === 0);
  const auswahl = frei.length > 0
    ? frei.sort((a, b) => b.entfernung - a.entfernung || a.rang - b.rang)[0]!
    : kandidaten.sort((a, b) => a.deckt - b.deckt || b.entfernung - a.entfernung || a.rang - b.rang)[0]!;
  return { platz: auswahl.platz, rechteck: auswahl.rechteck };
}

// --- 3. Wenn die Live-Sitzung abbricht ---------------------------------------------
//
// Bis zum 24.09.2026 gab es darauf keine Antwort: kam kein Endpunkt, hoerte die Kugel
// endlos zu. Jetzt entscheidet diese Regel, was nach einem Abbruch geschieht.

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
// echten Geraet nachzuziehen. Im Zweifel unterbricht die Kugel lieber nicht: ein Tipp
// auf die Kugel bleibt immer der sichere Weg.

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
