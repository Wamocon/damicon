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
//   2. wohin die Kugel rueckt, wenn ein Bereich hervorgehoben ist.

// --- 1. Ablauf ---------------------------------------------------------------------
//
// Halbduplex: entweder hoert die Kugel zu, oder der Assistent ist dran. Waehrend
// der Assistent spricht, ist das Mikrofon nicht in der Erkennung - sonst hoerte
// die Erkennung die eigene Stimme des Assistenten aus dem Lautsprecher und
// antwortete sich selbst. Unterbrochen wird per Tipp auf die Kugel (oder die
// Leertaste): das ist in lauter Umgebung (Hof, Halle) verlaesslicher als eine
// Erkennung "der Nutzer spricht dazwischen", die auf jedes Geraeusch anspringt.

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
