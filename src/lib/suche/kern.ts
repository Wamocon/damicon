// Der Kern der globalen Suche: Text vergleichbar machen, eine Anfrage gegen
// die Felder eines Ziels bewerten und das Tastenkuerzel erkennen. Rein, ohne
// React und ohne Browser, damit die Rangfolge im Test fuer alle Rollen und
// Sprachen durchgerechnet werden kann (supabase/tests/suche.ts).

/** Ein durchsuchbares Feld eines Ziels, einmal vorab normalisiert. */
export interface IndexFeld {
  normal: string;
  woerter: readonly string[];
  /** Hoeher heisst wichtiger. Entscheidet nur innerhalb derselben Stufe. */
  gewicht: number;
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
 * Kyrillisch bleibt bis auf eine Ausnahme stehen: ё wird е, weil es im
 * Russischen meist ohne Punkte geschrieben wird. й dagegen ist ein eigener
 * Buchstabe mit eigener Taste - "мой" darf nicht "мои" treffen. Die
 * kasachischen Buchstaben (ә, қ, ү, ...) zerfallen unter NFD ohnehin nicht.
 */
export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/([a-z])\p{M}+/gu, "$1")
    .replace(/\u0435\u0308/g, "\u0435") // ё, von NFD zerlegt, wird е
    .normalize("NFC")
    .replace(/ß/g, "ss")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .split(TRENNER)
    .filter(Boolean)
    .join(" ");
}

export function indexFeld(text: string, gewicht: number): IndexFeld {
  const normal = normalisiere(text);
  return { normal, woerter: normal ? normal.split(" ") : [], gewicht };
}

/** Null, wenn nach dem Normalisieren nichts Suchbares uebrig bleibt. */
export function zerlegeAnfrage(roh: string): Anfrage | null {
  const normal = normalisiere(roh);
  return normal ? { normal, woerter: normal.split(" ") } : null;
}

// Teilwoerter erst ab drei Zeichen: "ko" steckt in zu vielen Namen, als dass
// ein Treffer mitten im Wort noch etwas ueber das Gesuchte sagte.
const TEILWORT_AB = 3;

/**
 * Wert eines Ziels fuer eine Anfrage, oder null ohne Treffer.
 *
 * Wert = Stufe x 10 + Feldgewicht. Die Stufe sagt, wie gut der Treffer ist,
 * das Gewicht nur, in welchem Feld er lag. Weil die Gewichte unter 10 bleiben,
 * schlaegt eine bessere Stufe jedes Gewicht:
 *
 *   5  ein Feld ist genau die Anfrage
 *   4  ein Feld beginnt mit der Anfrage
 *   3  jedes Wort der Anfrage beginnt ein Wort desselben Feldes
 *   2  jedes Wort beginnt ein Wort, aber verteilt auf mehrere Felder
 *   1  jedes Wort steckt irgendwo in einem Feld, nur ab drei Zeichen
 */
export function bewerte(
  felder: readonly IndexFeld[],
  anfrage: Anfrage,
): number | null {
  let beste = 0;
  for (const feld of felder) {
    const stufe = stufeImFeld(feld, anfrage);
    if (stufe > 0) beste = Math.max(beste, stufe * 10 + feld.gewicht);
  }

  // Stufe 2 ohne Gewicht: "feld reihen" trifft den Bereichsnamen und den
  // Modultitel zugleich, aber keines der beiden Felder allein.
  if (
    beste < 20 &&
    anfrage.woerter.length > 1 &&
    anfrage.woerter.every((wort) => felder.some((feld) => beginntWort(feld, wort)))
  ) {
    beste = 20;
  }

  return beste > 0 ? beste : null;
}

function beginntWort(feld: IndexFeld, wort: string): boolean {
  return feld.woerter.some((w) => w.startsWith(wort));
}

function stufeImFeld(feld: IndexFeld, anfrage: Anfrage): number {
  if (!feld.normal) return 0;
  if (feld.normal === anfrage.normal) return 5;
  if (feld.normal.startsWith(anfrage.normal)) return 4;
  if (anfrage.woerter.every((wort) => beginntWort(feld, wort))) return 3;
  const teilwoerter = anfrage.woerter.every(
    (wort) => wort.length >= TEILWORT_AB && feld.normal.includes(wort),
  );
  return teilwoerter ? 1 : 0;
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
 * Oeffnet diese Taste die Suche? Dieselben Kuerzel wie im Handbuch:
 * "/" ausserhalb von Eingabefeldern, Strg+K bzw. Cmd+K ueberall.
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
export function istSuchKuerzel(taste: Taste, imEingabefeld: boolean): boolean {
  if (taste.repeat || taste.isComposing) return false;

  if (taste.key === "/") {
    const strgAllein = taste.ctrlKey && !taste.altKey;
    return !imEingabefeld && !taste.metaKey && !strgAllein;
  }

  if (!(taste.ctrlKey || taste.metaKey) || taste.altKey || taste.shiftKey) {
    return false;
  }
  return /^[a-z]$/i.test(taste.key)
    ? taste.key.toLowerCase() === "k"
    : taste.code === "KeyK";
}
