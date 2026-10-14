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
  | "wiederholteZeilen" // Kopf- und Fusszeilen, die auf jeder Seite stehen
  | "seitenLuecken"; // im Scan fehlen Seiten (gedruckte Seitenzahlen springen), gemeldet von der Pruefung beim Hochladen (seitenverlauf.ts)

export interface Guete {
  note: GueteNote;
  hinweise: GueteHinweis[];
  /** Qualität des Textes in Prozent (0 bis 100): die Note, feiner aufgelöst. Siehe textProzent. */
  prozent: number;
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
    /** Anteil der Woerter, die kyrillische UND lateinische Buchstaben mischen ("Koдекс"): typischer OCR-Fehler bei russischem Text. */
    gemischteWoerter: number;
  };
}

const VOKALE = /[aeiouyäöüàáâèéêìíòóùúаеёиоуыэюяіәөүұ]/i;
// Ein-Buchstaben-Woerter, die in den Sprachen der Wissensbasis (de, en, ru, kk) vorkommen: "a", "i", "o", "в", "и", "к", "о", "с", "у", "я", "а".
const EIN_BUCHSTABEN_WORT = new Set(["a", "i", "o", "u", "в", "и", "к", "о", "с", "у", "я", "а", "ә", "ө"]);
const MIN_ZEICHEN = 300;

const PUNKTLINIE = /(?:\s*[.…·]){4,}\s*\d{0,4}/g;

/**
 * Nimmt aus dem Text, was kein Fliesstext ist und die Note zu Unrecht verschlechtert: die Punktlinien eines Inhaltsverzeichnisses
 * ("Artikel 5 .......... 12", die Titel bleiben), Initialen in Literaturlisten und Zeilen, die fast nur aus Zahlen bestehen (Sachregister, Fundstellen).
 * Beides ist bei einem Buch normal und beschaedigt keinen Suchtreffer. Am 12.10.2026 stuften sich so acht Buecher selbst herab, weil EIN Paket
 * (das Inhaltsverzeichnis am Anfang oder das Register am Ende) aus Punkten und Zahlen bestand, obwohl der ganze Text sauber war.
 */
export function ohneVerzeichnisse(text: string): string {
  return text
    .replace(PUNKTLINIE, " ")
    // Initialen in Literaturlisten ("Казакова Н.А.", "Smith J. K."): Ein Grossbuchstabe mit Punkt ist kein zerhacktes Wort.
    .replace(/(?<!\p{L})\p{Lu}\.(?=\s|\p{Lu}|$)/gu, "")
    .split("\n")
    .filter((zeile) => {
      const roh = zeile.replace(/\s+/g, "");
      if (roh.length < 20) return true;
      const ziffern = (roh.match(/\p{N}/gu) ?? []).length / roh.length;
      const buchstaben = (roh.match(/\p{L}/gu) ?? []).length / roh.length;
      return !(ziffern >= 0.4 && buchstaben < 0.5);
    })
    .join("\n");
}

/** Was die Regeln der Note sehen: die Kennzahlen, die Mengen, ab denen eine Kennzahl etwas aussagt, und ob es das ganze Dokument ist. */
interface Grundlage {
  k: Guete["kennzahlen"];
  /** Woerter ab vier Buchstaben, der Nenner von ohneVokale. */
  langeWoerter: number;
  /** Zeilen ab vier Zeichen, der Nenner von wiederholteZeilen. */
  zeilen: number;
  ganzesDokument: boolean;
}

/** Eine Regel der Note: wann ihr Hinweis gilt und ab wann er die Note auf "schlecht" setzt (fehlt: nie). */
interface Regel {
  hinweis: GueteHinweis;
  gilt: (g: Grundlage) => boolean;
  schlecht?: (g: Grundlage) => boolean;
}

/** Die Regeln in der Reihenfolge, in der ihre Hinweise erscheinen. */
const REGELN: readonly Regel[] = [
  // Ohne Text oder fast ohne Text: bei einem ganzen Dokument ein Scan ohne Textebene.
  { hinweis: "kaumText", gilt: (g) => g.ganzesDokument && g.k.zeichen < MIN_ZEICHEN, schlecht: () => true },
  // Zeichensalat: ein Fliesstext besteht zu gut 75 Prozent aus Buchstaben (Satzzeichen, Ziffern und Leerraum machen den Rest). Unter 60 Prozent ist es Muell.
  { hinweis: "vieleSonderzeichen", gilt: ({ k }) => k.zeichen >= 100 && k.buchstaben < 0.75, schlecht: ({ k }) => k.buchstaben < 0.6 },
  // Zerhackte Woerter: bei einer guten OCR ist fast kein Wort ein einzelner Buchstabe, ausser den ueblichen Ein-Buchstaben-Woertern.
  { hinweis: "zerhackteWoerter", gilt: ({ k }) => k.woerter >= 50 && k.einzelbuchstaben > 0.08, schlecht: ({ k }) => k.einzelbuchstaben > 0.2 },
  // Mittlere Wortlaenge: deutsche und russische Texte liegen bei fuenf bis acht Buchstaben. Darueber klebt etwas zusammen.
  { hinweis: "ohneLeerzeichen", gilt: ({ k }) => k.woerter >= 50 && k.mittlereWortlaenge > 13, schlecht: () => true },
  // Viele lange Woerter ohne Vokal gibt es in echtem Text kaum (Abkuerzungen ausgenommen).
  { hinweis: "ohneVokale", gilt: (g) => g.langeWoerter >= 30 && g.k.ohneVokale > 0.08, schlecht: ({ k }) => k.ohneVokale > 0.25 },
  { hinweis: "vieleZiffern", gilt: ({ k }) => k.zeichen >= 100 && k.ziffern > 0.25 },
  { hinweis: "wiederholteZeilen", gilt: (g) => g.zeilen >= 20 && g.k.wiederholteZeilen > 0.15 },
];

/** Anteil von `teil` an `ganz`; 0, wenn es nichts zu teilen gibt. */
const anteil = (teil: number, ganz: number): number => (ganz ? teil / ganz : 0);

/** Die Kennzahlen eines bereinigten Textes (siehe Guete["kennzahlen"]) und die Mengen, an denen die Regeln sie messen. */
function miss(sauber: string, ganzesDokument: boolean): Grundlage {
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

  const gemischt = nurBuchstabenWoerter.filter((w) => /\p{Script=Cyrillic}/u.test(w) && /\p{Script=Latin}/u.test(w)).length;
  const k = {
    zeichen: sauber.length,
    woerter: woerter.length,
    buchstaben: buchstaben / nenner,
    ziffern: ziffern / nenner,
    einzelbuchstaben: anteil(einzeln, nurBuchstabenWoerter.length),
    mittlereWortlaenge: anteil(nurBuchstabenWoerter.reduce((s, w) => s + w.length, 0), nurBuchstabenWoerter.length),
    ohneVokale: anteil(ohneVokal, lang.length),
    wiederholteZeilen: anteil(wiederholt, zeilen.length),
    gemischteWoerter: anteil(gemischt, nurBuchstabenWoerter.length),
  };
  return { k, langeWoerter: lang.length, zeilen: zeilen.length, ganzesDokument };
}

/**
 * @param ganzesDokument false bei einem Paket eines langen Dokuments: Ein kurzes Paket ist dort normal, "kaumText" gilt nur fuer das Ganze.
 */
export function bewerteText(text: string, ganzesDokument = true): Guete {
  const sauber = ohneVerzeichnisse(text.replace(/\r\n?/g, "\n"));
  const grundlage = miss(sauber, ganzesDokument);
  const hinweise: GueteHinweis[] = [];
  let schlecht = false;
  for (const regel of REGELN) {
    if (!regel.gilt(grundlage)) continue;
    hinweise.push(regel.hinweis);
    if (regel.schlecht?.(grundlage)) schlecht = true;
  }

  // "pruefen", sobald ein Hinweis da ist, der die Suche beeintraechtigen kann. Kopf- und Fusszeilen allein sind nur ein Rauschen.
  const beeintraechtigend = hinweise.filter((h) => h !== "wiederholteZeilen" && h !== "vieleZiffern");
  const note: GueteNote = schlecht ? "schlecht" : beeintraechtigend.length > 0 ? "pruefen" : "gut";
  return { note, hinweise, prozent: textProzent(grundlage.k, note), kennzahlen: grundlage.k };
}

const zwischen = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Textqualitaet in Prozent, aus denselben Kennzahlen wie die Note, aber fein aufgeloest (95 Prozent statt "gut"). Fuenf Teile mit Gewicht:
 *   40  Buchstabenanteil (0,5 = 0 Punkte, 0,9 und mehr = alle): Zeichensalat
 *   20  einzelne Buchstaben als Woerter (0,2 und mehr = 0 Punkte): zerhackte Woerter
 *   15  lange Woerter ohne Vokal (0,25 und mehr = 0 Punkte): Erkennungsfehler
 *   10  mittlere Wortlaenge (3,5 bis 12 ist normal): zusammengeklebte oder zerhackte Woerter
 *   15  gemischte Woerter aus kyrillischen und lateinischen Buchstaben (0,02 und mehr = 0 Punkte): typischer OCR-Fehler bei russischem Text
 * Eine saubere OCR liegt damit bei 95 bis 99, ein Text mit Zeichensalat unter 60. Die Note setzt eine Obergrenze: "schlecht" hoechstens 59,
 * "pruefen" hoechstens 85, damit Prozent und Note nie gegeneinander stehen. Ein Text unter 100 Zeichen (nach Abzug von Verzeichnissen) laesst sich
 * nicht beurteilen und zaehlt als 100.
 */
export function textProzent(k: Guete["kennzahlen"], note: GueteNote): number {
  if (k.zeichen < 100) return note === "schlecht" ? 59 : 100;
  const wortlaenge = k.mittlereWortlaenge === 0 ? 1 : k.mittlereWortlaenge < 3.5 ? zwischen((k.mittlereWortlaenge - 1.5) / 2) : k.mittlereWortlaenge > 12 ? zwischen((20 - k.mittlereWortlaenge) / 8) : 1;
  const punkte =
    40 * zwischen((k.buchstaben - 0.5) / 0.4) +
    20 * zwischen(1 - k.einzelbuchstaben / 0.2) +
    15 * zwischen(1 - k.ohneVokale / 0.25) +
    10 * wortlaenge +
    15 * zwischen(1 - k.gemischteWoerter / 0.02);
  const roh = Math.round(punkte);
  return note === "schlecht" ? Math.min(roh, 59) : note === "pruefen" ? Math.min(roh, 85) : roh;
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
  ["kaumText", "vieleSonderzeichen", "zerhackteWoerter", "ohneLeerzeichen", "vieleZiffern", "ohneVokale", "wiederholteZeilen", "seitenLuecken"].includes(w);
