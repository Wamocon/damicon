// Der Kern der globalen Suche: Text vergleichbar machen, eine Anfrage gegen
// die Felder eines Ziels bewerten und das Tastenkuerzel erkennen. Rein, ohne
// React und ohne Browser, damit die Rangfolge im Test fuer alle Rollen und
// Sprachen durchgerechnet werden kann (supabase/tests/suche.ts).

/**
 * Wie gut ein Treffer ist, besser zuerst. Der Wert eines Treffers ist
 * Stufe x STUFEN_ABSTAND + Feldgewicht:
 *
 *   gleich    ein Feld ist genau die Anfrage
 *   anfang    ein Feld beginnt mit der Anfrage
 *   woerter   jedes Wort der Anfrage beginnt ein Wort desselben Feldes
 *   verteilt  jedes Wort beginnt ein Wort, aber verteilt auf mehrere Felder
 *   teilwort  jedes Wort steckt irgendwo, nur ab TEILWORT_AB Zeichen
 */
export const STUFE = { gleich: 5, anfang: 4, woerter: 3, verteilt: 2, teilwort: 1 } as const;
export const STUFEN_ABSTAND = 10;

/**
 * In welchem Feld ein Treffer lag: der Name vor dem Beiwerk (etwa dem
 * Bereichsnamen eines Moduls oder einem Seitentext). Beide bleiben unter
 * STUFEN_ABSTAND, deshalb schlaegt eine bessere Stufe jedes Gewicht.
 */
export const GEWICHT = { name: 3, beiwerk: 1 } as const;
export type Gewicht = (typeof GEWICHT)[keyof typeof GEWICHT];

/** Ein durchsuchbares Feld eines Ziels, einmal vorab normalisiert. */
export interface IndexFeld {
  normal: string;
  woerter: readonly string[];
  gewicht: Gewicht;
}

export interface Anfrage {
  normal: string;
  woerter: readonly string[];
}

const TRENNER = /[^\p{L}\p{N}]+/u;

/**
 * Macht zwei Schreibweisen desselben Wortes gleich. Bei lateinischen
 * Buchstaben fallen die diakritischen Zeichen weg (ü wird u, é wird e), danach
 * werden ae, oe und ue gefaltet. So finden "Kuehlkette" und "Kuhlkette" beide
 * "Kühlkette": wer keine Umlaute tippen kann, schreibt mal das eine, mal das
 * andere. Die Faltung laeuft auf beiden Seiten, deshalb schadet sie auch
 * Woertern wie "Steuer" nicht.
 *
 * Kyrillisch bleibt bis auf zwei Ausnahmen stehen: ё wird е, weil es im
 * Russischen meist ohne Punkte geschrieben wird, und Betonungszeichen wie in
 * "ку́хня" fallen weg, sonst zerfiele das Wort daran. й dagegen ist ein
 * eigener Buchstabe mit eigener Taste - "мой" darf nicht "мои" treffen. Aus
 * demselben Grund bleiben die kasachischen Buchstaben (ә, қ, ң, ү, ...)
 * stehen: sie liegen auf der kasachischen Belegung auf eigenen Tasten und
 * sind eigene Laute, keine Schreibvarianten.
 */
export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/([a-z])\p{M}+/gu, "$1")
    .replace(/\u0435\u0308/g, "\u0435") // ё, von NFD zerlegt, wird е
    .normalize("NFC")
    // Was NFC nicht wieder zusammensetzt, ist ein Zeichen ohne eigenen
    // Buchstaben, etwa die Betonung auf einem kyrillischen Vokal. й und die
    // kasachischen Buchstaben stehen hier schon wieder als ein Zeichen.
    .replace(/\p{M}+/gu, "")
    .replace(/ß/g, "ss")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .split(TRENNER)
    .filter(Boolean)
    .join(" ");
}

export function indexFeld(text: string, gewicht: Gewicht): IndexFeld {
  const normal = normalisiere(text);
  return { normal, woerter: normal ? normal.split(" ") : [], gewicht };
}

/** Null, wenn nach dem Normalisieren nichts Suchbares uebrig bleibt. */
export function zerlegeAnfrage(roh: string): Anfrage | null {
  const normal = normalisiere(roh);
  return normal ? { normal, woerter: normal.split(" ") } : null;
}

// Teilwoerter erst ab drei Zeichen: "ko" steckt in zu vielen Namen, als dass
// ein Treffer mitten im Wort noch etwas ueber das Gesuchte sagte. Dieselbe
// Grenze gilt fuer die Suche in Seitentexten insgesamt.
export const TEILWORT_AB = 3;

/**
 * Wert eines Ziels fuer eine Anfrage (siehe STUFE), oder null ohne Treffer.
 * Die Stufe sagt, wie gut der Treffer ist, das Gewicht nur, in welchem Feld
 * er lag.
 */
export function bewerte(
  felder: readonly IndexFeld[],
  anfrage: Anfrage,
): number | null {
  let beste = 0;
  for (const feld of felder) {
    const stufe = stufeImFeld(feld, anfrage);
    if (stufe > 0) beste = Math.max(beste, stufe * STUFEN_ABSTAND + feld.gewicht);
  }
  if (anfrage.woerter.length > 1) {
    beste = Math.max(beste, verteiltAufFelder(felder, anfrage) * STUFEN_ABSTAND);
  }
  return beste > 0 ? beste : null;
}

// Ohne Gewicht, denn kein einzelnes Feld traegt den Treffer: "feld reihen"
// trifft den Bereichsnamen und den Modultitel zugleich, aber keines allein.
// Ein Wort darf dabei auch mitten in einem Feld stecken - "Feld Blöcke" soll
// die Reihenblöcke finden, wenn "Blöcke" allein sie findet.
function verteiltAufFelder(felder: readonly IndexFeld[], anfrage: Anfrage): number {
  const jedesWort = (passt: (feld: IndexFeld, wort: string) => boolean) =>
    anfrage.woerter.every((wort) => felder.some((feld) => passt(feld, wort)));
  if (jedesWort(beginntWort)) return STUFE.verteilt;
  if (jedesWort((feld, wort) => beginntWort(feld, wort) || stecktIn(feld, wort))) {
    return STUFE.teilwort;
  }
  return 0;
}

function beginntWort(feld: IndexFeld, wort: string): boolean {
  return feld.woerter.some((w) => w.startsWith(wort));
}

function stecktIn(feld: IndexFeld, wort: string): boolean {
  return wort.length >= TEILWORT_AB && feld.normal.includes(wort);
}

// So viele Woerter stehen vor dem gefundenen im Auszug, und so viele
// insgesamt. Die Zeile im Suchfenster kuerzt ohnehin am Ende - der Begriff
// soll vorn stehen, wo er sichtbar bleibt.
const AUSZUG_DAVOR = 3;
const AUSZUG_WOERTER = 12;

/**
 * Das Stueck eines Seitentextes, in dem die Anfrage vorkommt, mit ein paar
 * Woertern davor, oder null ohne Fundstelle. Verglichen wird Wort fuer Wort
 * mit derselben Normalisierung wie bei der Suche - so zeigt der Auszug auch
 * dann die richtige Stelle, wenn "Kuhlkette" gesucht und "Kühlkette"
 * geschrieben ist.
 */
export function auszug(text: string, anfrage: Anfrage): string | null {
  const woerter = text.split(/\s+/).filter(Boolean);
  // Angesetzt wird am laengsten Wort der Anfrage: bei "Wartezeit d" erklaert
  // "Wartezeit" den Treffer, das "d" passte auf fast jedes Wort davor.
  const anker = laengstesWort(anfrage);
  const passt = (roh: string) =>
    normalisiere(roh)
      .split(" ")
      .some(
        (teil) =>
          teil.startsWith(anker) || (anker.length >= TEILWORT_AB && teil.includes(anker)),
      );
  const fund = woerter.findIndex(passt);
  if (fund < 0) return null;
  const start = Math.max(0, fund - AUSZUG_DAVOR);
  const ende = Math.min(woerter.length, start + AUSZUG_WOERTER);
  return `${start > 0 ? "… " : ""}${woerter.slice(start, ende).join(" ")}${ende < woerter.length ? " …" : ""}`;
}

/** Das laengste Wort der Anfrage, bei gleicher Laenge das erste. */
export function laengstesWort(anfrage: Anfrage): string {
  return anfrage.woerter.reduce((bisher, wort) => (wort.length > bisher.length ? wort : bisher));
}

function stufeImFeld(feld: IndexFeld, anfrage: Anfrage): number {
  // Beiwerk zaehlt hoechstens als Wortanfang: sonst schluege "Hof" als
  // Bereichsname jedes Moduls im Hof ein Modul, dessen eigener Name mit "Hof"
  // beginnt.
  const hoechstens = feld.gewicht === GEWICHT.beiwerk ? STUFE.woerter : STUFE.gleich;
  return Math.min(hoechstens, rohStufe(feld, anfrage));
}

function rohStufe(feld: IndexFeld, anfrage: Anfrage): number {
  if (!feld.normal) return 0;
  if (feld.normal === anfrage.normal) return STUFE.gleich;
  if (feld.normal.startsWith(anfrage.normal)) return STUFE.anfang;
  if (anfrage.woerter.every((wort) => beginntWort(feld, wort))) return STUFE.woerter;
  if (anfrage.woerter.every((wort) => stecktIn(feld, wort))) return STUFE.teilwort;
  return 0;
}

/** Was vom KeyboardEvent gebraucht wird - so laesst es sich im Test nachbauen. */
export interface Taste {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
}

/**
 * Oeffnet diese Taste die Suche? Die Kuerzel, die auch das Handbuch nennt:
 * "/" ausserhalb von Eingabefeldern, Strg+K ueberall, auf dem Mac Cmd+K.
 *
 * Auf dem Mac zaehlt Strg+K nicht: dort loescht es in jedem Textfeld bis zum
 * Zeilenende, und das darf die Suche niemandem wegnehmen.
 *
 * Bei Strg+K zaehlt der Buchstabe, solange die Belegung lateinisch ist - auf
 * Dvorak liegt das K woanders, gemeint ist trotzdem das K. Auf russischer und
 * kasachischer Belegung liefert dieselbe Taste "л"; dort zaehlt die Position
 * (code "KeyK"), sonst ginge das Kuerzel dort gar nicht.
 *
 * "/" braucht auf deutscher Tastatur Umschalt+7, Umschalt ist dort also
 * erlaubt. Strg+/ dagegen nicht: das ist in vielen Programmen ein eigenes
 * Kuerzel. AltGr meldet Windows als Strg+Alt und bleibt erlaubt.
 */
export function istSuchKuerzel(taste: Taste, imEingabefeld: boolean, mac: boolean): boolean {
  if (taste.repeat || taste.isComposing) return false;

  if (taste.key === "/") {
    const strgAllein = taste.ctrlKey && !taste.altKey;
    return !imEingabefeld && !taste.metaKey && !strgAllein;
  }

  const befehl = mac ? taste.metaKey && !taste.ctrlKey : taste.ctrlKey && !taste.metaKey;
  if (!befehl || taste.altKey || taste.shiftKey) return false;
  return /^[a-z]$/i.test(taste.key)
    ? taste.key.toLowerCase() === "k"
    : taste.code === "KeyK";
}
