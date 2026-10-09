// Einschaetzung der Textqualitaet eines Dokuments, vor allem fuer Buecher, die per OCR aus Scans entstanden sind. Reine Funktion ohne
// Abhaengigkeiten: Die Oberflaeche zeigt sie vor dem Hochladen (ganzer Text im Browser), der Server rechnet sie je Paket noch einmal
// selbst aus und legt sie an jeder Zeile ab (nie dem Browser glauben), und die Pruefung der zweiten Person zeigt sie neben dem Text.
//
// Sie sagt nichts ueber die Richtigkeit, nur ueber die LESBARKEIT: Ein OCR-Fehler macht aus "Verjaehrung" ein "Verj ahrung" oder
// ein "Vcrjaehrung", und die Suche findet das Wort danach nicht mehr. Bei viel Fehlertext lohnt sich ein neuer OCR-Lauf, bevor die
// Datei in die Wissensbasis kommt: Was einmal eingebettet ist, ist so schlecht wie der Text.
//
// Die Kennzahlen sind einfache Zaehlungen, die Schwellen sind Erfahrungswerte und stehen mit Begruendung im Code.

export type GueteNote = "gut" | "pruefen" | "schlecht";

export type GueteHinweis =
  | "kaumText" // zu wenig Text, vermutlich ein Scan ohne Textebene
  | "vieleSonderzeichen" // Zeichensalat, typisch fuer eine schlechte OCR
  | "zerhackteWoerter" // einzelne Buchstaben mit Leerzeichen: "V e r j a e h r u n g"
  | "ohneLeerzeichen" // Woerter ohne Leerzeichen zusammengeklebt
  | "vieleZiffern" // Tabellen oder Zahlenfriedhoefe, nicht automatisch schlecht
  | "ohneVokale" // viele lange "Woerter" ohne Vokal: Fehlerkennung
  | "wiederholteZeilen"; // Kopf- und Fusszeilen, die auf jeder Seite stehen

export interface Guete {
  note: GueteNote;
  hinweise: GueteHinweis[];
  kennzahlen: {
    zeichen: number;
    woerter: number;
    /** Anteil der Buchstaben an allen Zeichen ohne Leerraum. */
    buchstaben: number;
    ziffern: number;
    /** Anteil einzelner Buchstaben unter den Woertern (ohne die ueblichen Ein-Buchstaben-Woerter). */
    einzelbuchstaben: number;
    mittlereWortlaenge: number;
    /** Anteil der Woerter ab vier Buchstaben ohne jeden Vokal. */
    ohneVokale: number;
    /** Anteil der Zeilen, die mindestens dreimal vorkommen. */
    wiederholteZeilen: number;
  };
}

const VOKALE = /[aeiouyäöüàáâèéêìíòóùúаеёиоуыэюяіәөүұ]/i;
// Ein-Buchstaben-Woerter, die in den Sprachen der Wissensbasis (de, en, ru, kk) vorkommen: "a", "i", "o", "в", "и", "к", "о", "с", "у", "я", "а".
const EIN_BUCHSTABEN_WORT = new Set(["a", "i", "o", "u", "в", "и", "к", "о", "с", "у", "я", "а", "ә", "ө"]);
const MIN_ZEICHEN = 300;

/**
 * @param ganzesDokument false bei einem Paket eines langen Dokuments: Ein kurzes Paket ist dort normal, "kaumText" gilt nur fuer das Ganze.
 */
export function bewerteText(text: string, ganzesDokument = true): Guete {
  const sauber = text.replace(/\r\n?/g, "\n");
  const ohneRaum = sauber.replace(/\s+/g, "");
  const woerter = sauber.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  const buchstaben = (ohneRaum.match(/\p{L}/gu) ?? []).length;
  const ziffern = (ohneRaum.match(/\p{N}/gu) ?? []).length;
  const nenner = Math.max(1, ohneRaum.length);
  const nurBuchstabenWoerter = woerter.filter((w) => /^\p{L}+$/u.test(w));
  const einzeln = nurBuchstabenWoerter.filter((w) => w.length === 1 && !EIN_BUCHSTABEN_WORT.has(w.toLowerCase())).length;
  const lang = nurBuchstabenWoerter.filter((w) => w.length >= 4);
  const ohneVokal = lang.filter((w) => !VOKALE.test(w)).length;
  const zeilen = sauber.split("\n").map((z) => z.trim()).filter((z) => z.length >= 4);
  const haeufigkeit = new Map<string, number>();
  for (const z of zeilen) haeufigkeit.set(z, (haeufigkeit.get(z) ?? 0) + 1);
  const wiederholt = zeilen.filter((z) => (haeufigkeit.get(z) ?? 0) >= 3).length;

  const k = {
    zeichen: sauber.length,
    woerter: woerter.length,
    buchstaben: buchstaben / nenner,
    ziffern: ziffern / nenner,
    einzelbuchstaben: nurBuchstabenWoerter.length ? einzeln / nurBuchstabenWoerter.length : 0,
    mittlereWortlaenge: nurBuchstabenWoerter.length ? nurBuchstabenWoerter.reduce((s, w) => s + w.length, 0) / nurBuchstabenWoerter.length : 0,
    ohneVokale: lang.length ? ohneVokal / lang.length : 0,
    wiederholteZeilen: zeilen.length ? wiederholt / zeilen.length : 0,
  };

  const hinweise: GueteHinweis[] = [];
  let schlecht = false;
  // Ohne Text oder fast ohne Text: bei einem ganzen Dokument ein Scan ohne Textebene.
  if (ganzesDokument && k.zeichen < MIN_ZEICHEN) {
    hinweise.push("kaumText");
    schlecht = true;
  }
  // Zeichensalat: ein Fliesstext besteht zu gut 75 Prozent aus Buchstaben (Satzzeichen, Ziffern und Leerraum machen den Rest). Unter 60 Prozent ist es Muell.
  if (k.zeichen >= 100 && k.buchstaben < 0.75) {
    hinweise.push("vieleSonderzeichen");
    if (k.buchstaben < 0.6) schlecht = true;
  }
  // Zerhackte Woerter: bei einer guten OCR ist fast kein Wort ein einzelner Buchstabe, ausser den ueblichen Ein-Buchstaben-Woertern.
  if (k.woerter >= 50 && k.einzelbuchstaben > 0.08) {
    hinweise.push("zerhackteWoerter");
    if (k.einzelbuchstaben > 0.2) schlecht = true;
  }
  // Mittlere Wortlaenge: deutsche und russische Texte liegen bei fuenf bis acht Buchstaben. Darueber klebt etwas zusammen.
  if (k.woerter >= 50 && k.mittlereWortlaenge > 13) {
    hinweise.push("ohneLeerzeichen");
    schlecht = true;
  }
  // Viele lange Woerter ohne Vokal gibt es in echtem Text kaum (Abkuerzungen ausgenommen).
  if (lang.length >= 30 && k.ohneVokale > 0.08) {
    hinweise.push("ohneVokale");
    if (k.ohneVokale > 0.25) schlecht = true;
  }
  if (k.zeichen >= 100 && k.ziffern > 0.25) hinweise.push("vieleZiffern");
  if (zeilen.length >= 20 && k.wiederholteZeilen > 0.15) hinweise.push("wiederholteZeilen");

  // "pruefen", sobald ein Hinweis da ist, der die Suche beeintraechtigen kann. Kopf- und Fusszeilen allein sind nur ein Rauschen.
  const beeintraechtigend = hinweise.filter((h) => h !== "wiederholteZeilen" && h !== "vieleZiffern");
  const note: GueteNote = schlecht ? "schlecht" : beeintraechtigend.length > 0 ? "pruefen" : "gut";
  return { note, hinweise, kennzahlen: k };
}

const RANG: Record<GueteNote, number> = { gut: 0, pruefen: 1, schlecht: 2 };

/** Die schlechteste Note aus mehreren (zum Beispiel aus den Paketen eines Buchs). Keine Eingabe: null. */
export function schlechtesteNote(noten: readonly (string | null | undefined)[]): GueteNote | null {
  let beste: GueteNote | null = null;
  for (const n of noten) {
    if (n !== "gut" && n !== "pruefen" && n !== "schlecht") continue;
    if (beste === null || RANG[n] > RANG[beste]) beste = n;
  }
  return beste;
}

export const istGueteHinweis = (w: string): w is GueteHinweis =>
  ["kaumText", "vieleSonderzeichen", "zerhackteWoerter", "ohneLeerzeichen", "vieleZiffern", "ohneVokale", "wiederholteZeilen"].includes(w);
