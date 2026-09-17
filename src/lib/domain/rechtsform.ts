// Rechtsform und Steueridentifikation nach kasachischem Recht (Anforderung E.11).
//
// Zwei Nummernarten, eine Laenge: ИИН und БИН sind beide zwoelfstellig und
// tragen dieselbe Pruefziffer. Welche der beiden gilt, haengt allein an der
// Rechtsform - ein Feld "Steuernummer" ohne Rechtsform ist nicht auswertbar.
//
// Der Betrieb selbst ist ein Krestjanskoje Chosjaistwo (КХ/ФХ). Ohne eigene
// juristische Person hat er keinen БИН, sondern traegt den ИИН seines Leiters.
// Genau daran scheitert ein Schema mit nur einem БИН-Feld, und genau das
// verlangt das Abnahmekriterium ausdruecklich.
//
// Dieselbe Zuordnung und dieselbe Pruefziffer stehen in der Datenbank
// (Migration 20261021000000, Funktionen nummernart_fuer_rechtsform und
// pruefziffer_stimmt). Doppelt, weil beide Seiten sie unabhaengig brauchen:
// das Formular, um vor dem Absenden zu warnen, die Datenbank, um einen
// direkten Zugriff nicht durchzulassen. Wer eine Seite aendert, aendert beide.

/** Rechtsformen im Umfeld des Betriebs. Ohne Sammelposition "sonstige": eine
 *  unbekannte Rechtsform soll auffallen, nicht stillschweigend durchlaufen. */
export const RECHTSFORMEN = [
  "kh_fh",
  "ip",
  "privatperson",
  "too",
  "ao",
  "pk",
] as const;

export type Rechtsform = (typeof RECHTSFORMEN)[number];

/** ИИН fuer natuerliche Personen und Gebilde ohne eigene juristische Person,
 *  БИН fuer juristische Personen. */
export type Nummernart = "iin" | "bin";

const NUMMERNART: Readonly<Record<Rechtsform, Nummernart>> = {
  kh_fh: "iin",
  ip: "iin",
  privatperson: "iin",
  too: "bin",
  ao: "bin",
  pk: "bin",
};

export function nummernartFuer(rechtsform: Rechtsform): Nummernart {
  return NUMMERNART[rechtsform];
}

export function istRechtsform(wert: unknown): wert is Rechtsform {
  return typeof wert === "string" && (RECHTSFORMEN as readonly string[]).includes(wert);
}

// Gewichtsreihen des kasachischen Pruefziffernverfahrens. Die zweite greift
// nur, wenn die erste den Rest 10 ergibt - 10 ist keine Ziffer.
const GEWICHT_1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const GEWICHT_2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2] as const;

/** Warum eine Nummer nicht angenommen wird. `null` heisst: sie ist in Ordnung. */
export type NummerBefund = "format" | "pruefziffer" | "keine-rechtsform" | null;

/**
 * Prueft eine Identifikationsnummer.
 *
 * Getrennte Befunde statt eines blossen `false`, weil die Oberflaeche beide
 * Faelle unterschiedlich erklaeren muss: "zwoelf Ziffern erwartet" ist ein
 * Tippfehler, "Pruefziffer stimmt nicht" ist meist ein Zahlendreher an einer
 * ganz anderen Stelle der Nummer.
 *
 * Die Nummernart geht bewusst NICHT in die Pruefung ein: Das Verfahren ist
 * fuer ИИН und БИН identisch. Die Rechtsform entscheidet, wie das Feld heisst
 * und was der Nutzer sieht, nicht ob die Ziffern stimmen.
 */
export function pruefeNummer(
  nummer: string | null | undefined,
  rechtsform: Rechtsform | null | undefined,
): NummerBefund {
  const roh = (nummer ?? "").trim();
  if (roh === "") return null;
  if (!rechtsform) return "keine-rechtsform";
  if (!/^[0-9]{12}$/.test(roh)) return "format";
  return pruefzifferStimmt(roh) ? null : "pruefziffer";
}

/** Nur die zwoelfte Stelle. Erwartet genau zwoelf Ziffern. */
export function pruefzifferStimmt(nummer: string): boolean {
  if (!/^[0-9]{12}$/.test(nummer)) return false;
  const ziffern = [...nummer].map(Number);

  const summe = (gewichte: readonly number[]) =>
    gewichte.reduce((s, g, i) => s + g * ziffern[i]!, 0);

  let rest = summe(GEWICHT_1) % 11;
  if (rest === 10) {
    rest = summe(GEWICHT_2) % 11;
    // Auch die zweite Reihe kann 10 ergeben. Fuer solche elf Anfangsziffern
    // vergibt die Stelle keine Nummer - es gibt also keine gueltige Variante.
    if (rest === 10) return false;
  }
  return rest === ziffern[11];
}

/**
 * Berechnet die Pruefziffer zu elf Ziffern, oder `null`, wenn es zu diesen
 * elf Ziffern keine gueltige gibt. Wird fuer Testdaten und Seeds gebraucht,
 * nicht im Formular.
 */
export function pruefzifferFuer(elfZiffern: string): number | null {
  if (!/^[0-9]{11}$/.test(elfZiffern)) return null;
  const ziffern = [...elfZiffern].map(Number);
  const summe = (gewichte: readonly number[]) =>
    gewichte.reduce((s, g, i) => s + g * ziffern[i]!, 0);

  let rest = summe(GEWICHT_1) % 11;
  if (rest === 10) {
    rest = summe(GEWICHT_2) % 11;
    if (rest === 10) return null;
  }
  return rest;
}
