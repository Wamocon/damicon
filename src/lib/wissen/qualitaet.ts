import { bewerteText, type GueteNote } from "@/lib/wissen/textguete";

// Qualität eines GANZEN Dokuments in Prozent, für die Liste der Wissensdokumente ("Qualität 95 %"). Reine Funktionen ohne Datenbank.
//
// Die Textqualität rechnet textguete.ts je Textstück (textProzent). Ein Buch hat tausende Abschnitte: Sie werden in der Reihenfolge des Buchs zu
// Paketen von etwa 80.000 Zeichen zusammengesetzt (so wie beim Hochladen), jedes Paket wird bewertet, und das Dokument bekommt den nach Zeichen
// gewichteten Mittelwert. So zählt ein Inhaltsverzeichnis (wenig Text) kaum, und ein schlecht gelesenes Kapitel (viel Text) zieht den Wert herunter.
//
// Fehlen im Scan Seiten (seitenverlauf.ts), mindert das die Qualität: Ein Buch mit sauberem Text, dem 18 von 681 Seiten fehlen, ist nicht zu 100 Prozent
// brauchbar. Der Faktor ist 1 minus das Fünffache des Anteils fehlender Seiten, höchstens um die Hälfte (siehe vollstaendigkeitsFaktor).
// Gezählt werden nur OFFENE fehlende Seiten (seiten-bestaetigung.ts, offenerStand). Seiten, die die prüfende Person als korrekt fehlend bestätigt hat
// (Leerseiten, Notizseiten), und nachgeladene Seiten zählen nicht: Eine Leerseite hat keinen Text, der gelesen werden könnte. Fehlt echter Inhalt, ist die
// Lücke offen, das Buch lässt sich nicht freigeben, und der Abzug gilt, bis die Seiten nachgeladen sind.

export const QUALITAET_PAKET_ZEICHEN = 80_000;

export interface SeitenKurz {
  seiten: number;
  fehlend: number;
}

/** 1, wenn nichts fehlt oder nichts bekannt ist; sonst 1 minus das Fünffache des Anteils fehlender Seiten, nie unter 0,5. */
export function vollstaendigkeitsFaktor(seiten: SeitenKurz | null | undefined): number {
  if (!seiten || seiten.fehlend <= 0 || seiten.seiten <= 0) return 1;
  return Math.max(0.5, 1 - (5 * seiten.fehlend) / seiten.seiten);
}

/** Setzt die Texte (in Buchreihenfolge) zu Paketen von höchstens `groesse` Zeichen zusammen; ein einzelner längerer Text bleibt ein Paket für sich. */
export function inPakete(texte: readonly string[], groesse = QUALITAET_PAKET_ZEICHEN): string[] {
  const pakete: string[] = [];
  let aktuell: string[] = [];
  let laenge = 0;
  for (const t of texte) {
    if (aktuell.length > 0 && laenge + t.length > groesse) {
      pakete.push(aktuell.join("\n\n"));
      aktuell = [];
      laenge = 0;
    }
    aktuell.push(t);
    laenge += t.length + 2;
  }
  if (aktuell.length > 0) pakete.push(aktuell.join("\n\n"));
  return pakete;
}

export interface DokumentQualitaet {
  /** Ganze Prozent, 0 bis 100. */
  prozent: number;
  /** Die schlechteste Note der Pakete (für die Anzeige neben dem Wert). */
  note: GueteNote;
  pakete: number;
}

const RANG: Record<GueteNote, number> = { gut: 0, pruefen: 1, schlecht: 2 };

/** Ohne Texte (ein leeres Dokument) gibt es keinen Wert: null. */
export function dokumentQualitaet(texte: readonly string[], seiten?: SeitenKurz | null): DokumentQualitaet | null {
  const pakete = inPakete(texte.filter((t) => t.trim().length > 0));
  if (pakete.length === 0) return null;
  let summe = 0;
  let gewicht = 0;
  let note: GueteNote = "gut";
  for (const p of pakete) {
    const g = bewerteText(p, false);
    summe += g.prozent * p.length;
    gewicht += p.length;
    if (RANG[g.note] > RANG[note]) note = g.note;
  }
  const mittel = gewicht > 0 ? summe / gewicht : 100;
  const prozent = Math.max(0, Math.min(100, Math.round(mittel * vollstaendigkeitsFaktor(seiten))));
  return { prozent, note, pakete: pakete.length };
}

/** Ton der Anzeige: ab 90 Prozent gut, ab 75 zu prüfen, darunter schlecht. */
export function qualitaetTon(prozent: number): "success" | "warning" | "danger" {
  return prozent >= 90 ? "success" : prozent >= 75 ? "warning" : "danger";
}
