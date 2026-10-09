// Analyse eines Dokuments vor der Einordnung: Aus dem Text und dem Dateinamen werden Bereich, Quellenart und Textgrundlage VORGESCHLAGEN,
// damit die Administration beim Hochladen von Buechern nur noch den Cluster bestimmen muss (der haengt vom Weg ab, nicht vom Text) und die
// uebrigen Angaben nur noch prueft. Reine Funktion ohne Abhaengigkeiten: laeuft im Browser (sofort nach dem Lesen der Datei) und im Server
// (Assistent, Bestand). Eine KI kann den Vorschlag verfeinern (analyse-ki.ts); ohne KI gilt allein diese Heuristik.
//
// Sie zaehlt Merkmale in Stichproben (Anfang, Mitte, Ende) und ist bewusst vorsichtig: Reicht die Spur nicht, sinkt die Sicherheit, und die
// Oberflaeche markiert das Dokument zum Ansehen. Was sie nicht kann: den Inhalt verstehen. Ein Buch ueber Mehrwertsteuer mit einem Kapitel
// zum Recht bleibt ein Steuerbuch, weil die Mehrheit der Merkmale dafuer spricht.
//
// Wortgrenzen: \b kennt nur ASCII-Woerter und versagt bei kyrillischen Merkmalen. Deshalb stehen vor jedem Merkmal ein Lookbehind (kein Buchstabe
// davor) und bei Bedarf ein Lookahead (kein Buchstabe danach), siehe WB und WE.

import { erkenneSpracheEindeutig } from "@/lib/text/sprache-erkennen";
import type { Quellenart, Textgrundlage } from "@/lib/wissen/quellenart";
import type { UploadBereich } from "@/lib/wissen/upload-konstanten";

export type AnalyseSicherheit = "hoch" | "mittel" | "niedrig";

export type AnalyseGrund =
  | "bereichRecht"
  | "bereichSteuer"
  | "bereichCompliance"
  | "bereichAudit"
  | "bereichRisiko"
  | "bereichUnklar"
  | "artRechtsnorm"
  | "artRechtsprechung"
  | "artStandard"
  | "artBuch"
  | "artNachschlagewerk"
  | "artBehoerde"
  | "artPraxis"
  | "artIntern"
  | "artKurz"
  | "artUnklar"
  | "uebersetzungHinweis"
  | "uebersetzungMaschinell"
  | "uebersetzungAmtlich";

export interface Analyse {
  bereich: UploadBereich;
  quellenart: Quellenart;
  textgrundlage: Textgrundlage;
  sprache: "de" | "en" | "ru" | "kk" | null;
  sicherheit: AnalyseSicherheit;
  /** Kurze Begruendungen als Schluessel (die Oberflaeche uebersetzt sie). */
  gruende: AnalyseGrund[];
  /** Woher der Vorschlag stammt: Heuristik oder KI (analyse-ki.ts). */
  quelle: "heuristik" | "ki";
  /** Nur bei KI: ein Satz Begruendung des Modells (nicht uebersetzt). */
  hinweis?: string;
}

/** Wie viel Text die Analyse liest: Anfang, Mitte und Ende. Ein Buch hat hunderttausende Zeichen, die Merkmale stehen in den Stichproben. */
const STICHPROBE_ANFANG = 9000;
const STICHPROBE_MITTE = 5000;
const STICHPROBE_ENDE = 3000;

export function stichprobeVon(text: string): string {
  if (text.length <= STICHPROBE_ANFANG + STICHPROBE_MITTE + STICHPROBE_ENDE) return text;
  const mitteStart = Math.floor(text.length / 2 - STICHPROBE_MITTE / 2);
  return `${text.slice(0, STICHPROBE_ANFANG)}\n${text.slice(mitteStart, mitteStart + STICHPROBE_MITTE)}\n${text.slice(-STICHPROBE_ENDE)}`;
}

const WB = "(?<![\\p{L}\\p{N}])";
const WE = "(?![\\p{L}\\p{N}])";
const muster = (alternativen: string, flags = "gu") => new RegExp(`${WB}(?:${alternativen.replace(/<E>/g, WE)})`, flags);

// ---- Merkmale je Bereich (Deutsch, Englisch, Russisch). Kleinschreibung, als Wortbeginn gezaehlt. <E> = Wortende. -------------------------
const BEREICH_MERKMALE: Record<UploadBereich, RegExp> = {
  recht: muster("gesetz|gesetzbuch|rechts|recht<E>|vertrag|verordnung|urteil|gericht|haftung|klage|vollmacht|eigentum|kodex|law<E>|legal|contract|statute|court|liability|закон|кодекс|договор|право|суд<E>|иск<E>|собственност"),
  steuer: muster("steuer|umsatzsteuer|mehrwertsteuer|mwst|vorsteuer|einkommensteuer|körperschaftsteuer|zoll|abgabe|tax<E>|taxation|vat<E>|налог|ндс<E>|ипн<E>|кпн<E>|акциз|таможен"),
  compliance: muster("compliance|datenschutz|dsgvo|gdpr|geldwäsche|korruption|hinweisgeber|verhaltenskodex|sanktion|personenbezogen|антикоррупц|персональн|комплаенс|отмывани"),
  audit: muster("audit|prüfung|prüfer|revision|zertifizier|ifs<E>|gfsi|issai|iso 9001|haccp|globalg|lieferantenaudit|inspektion|аудит|проверк|сертификац|internal control"),
  risiko: muster("risiko|risikomanagement|iso 31000|coso|erm<E>|gefährdungs|krisen|schadenswahrscheinlichkeit|risk<E>|risk management|риск|управление рисками"),
};
const BEREICH_GRUND: Record<UploadBereich, AnalyseGrund> = {
  recht: "bereichRecht",
  steuer: "bereichSteuer",
  compliance: "bereichCompliance",
  audit: "bereichAudit",
  risiko: "bereichRisiko",
};

function zaehle(text: string, m: RegExp): number {
  return (text.toLowerCase().match(m) ?? []).length;
}

// ---- Merkmale je Quellenart --------------------------------------------------------------------------------------------------------------
const ARTIKEL_ZEILEN = /^\s*(?:artikel|art\.|§|статья|article|пункт|абзац)\s*\d+/gimu;
const BUCH_MARKER = muster("isbn|inhaltsverzeichnis|inhalt<E>|table of contents|contents<E>|оглавление|содержание|vorwort|preface|предисловие|verlag|publisher|издательство|auflage|edition|издание|kapitel\\s*\\d|chapter\\s*\\d|глава\\s*\\d|literaturverzeichnis|bibliography|index<E>");
const URTEIL_MARKER = muster("urteil|beschluss|im namen des volkes|aktenzeichen|az\\.|решение суда|постановление суда|определение суда|judgment|court of appeal|supreme court|ruling");
const STANDARD_MARKER = muster("iso\\s*\\d{3,5}|iec\\s*\\d|issai|coso|ifs\\s*(?:food|logistics)|sqf|fssc|brcgs|gfsi|normative references|anwendungsbereich|scope<E>|zertifizierungsprogramm|scheme rules|stakeholder consultation|benchmarking requirements");
const NACHSCHLAGE_MARKER = muster("lexikon|wörterbuch|enzyklopädie|glossar|glossary|dictionary|encyclopedia|словарь|энциклопедия|справочник");
const BEHOERDE_MARKER = muster("merkblatt|ministerium|bundesamt|finanzamt|komitee|министерство|комитет|агентство|amtliche auskunft|verwaltungsvorschrift|informationsschreiben|рекомендаци");
const PRAXIS_MARKER = muster("whitepaper|white paper|studie|newsletter|kanzlei|law firm|mandanteninformation|tax newsflash|annual report|jahresbericht|position paper|positionspapier|survey|umfrage|leitlinie|guideline|handlungsempfehlung|checkliste");
const INTERN_MARKER = muster("betriebsanweisung|arbeitsanweisung|verfahrensanweisung|interne richtlinie|unternehmensrichtlinie|arbeitsvorschrift|должностная инструкция|регламент предприятия|sop<E>");

// ---- Textgrundlage -----------------------------------------------------------------------------------------------------------------------
const MASCHINELL = /(?:machine translation|maschinell übersetzt|maschinelle übersetzung|google translate|deepl|автоматический перевод|машинный перевод)/iu;
const AMTLICH_UEBERSETZT = /(?:offizielle übersetzung|amtliche übersetzung|official translation|authorized translation|autorisierte übersetzung|официальный перевод|авторизованный перевод)/iu;
const UEBERSETZT = /(?:übersetzt von|übersetzung von|translated by|translated from|translation by|перевод с|перевод:|переводчик|aus dem (?:englischen|russischen|deutschen) übersetzt|deutsche übersetzung)/iu;

function spracheVon(text: string): Analyse["sprache"] {
  const s = erkenneSpracheEindeutig(text.slice(0, 6000), 60) ?? null;
  return s === "de" || s === "en" || s === "ru" || s === "kk" ? s : null;
}

/** Vorschlag fuer Bereich, Quellenart und Textgrundlage. `dateiname` hilft bei kurzen oder unklaren Texten (zum Beispiel "ISO_31000_2018.pdf"). */
export function analysiereDokument(text: string, dateiname = ""): Analyse {
  const probe = stichprobeVon(text);
  const kopf = `${dateiname.replace(/[_.-]+/g, " ")}\n${probe.slice(0, 3000)}`;
  const laenge = text.length;
  const gruende: AnalyseGrund[] = [];

  // Bereich: die Stichprobe zaehlt einfach, der Anfang (Titel, Inhaltsverzeichnis) und der Dateiname doppelt
  const bereiche = Object.keys(BEREICH_MERKMALE) as UploadBereich[];
  const punkte = Object.fromEntries(bereiche.map((b) => [b, zaehle(probe, BEREICH_MERKMALE[b]) + 2 * zaehle(kopf, BEREICH_MERKMALE[b])])) as Record<UploadBereich, number>;
  const rangfolge = [...bereiche].sort((a, b) => punkte[b] - punkte[a]);
  const bester = rangfolge[0]!;
  const zweiter = rangfolge[1]!;
  let bereich: UploadBereich = bester;
  let bereichSicher: AnalyseSicherheit;
  if (punkte[bester] < 8) {
    bereich = "recht";
    bereichSicher = "niedrig";
    gruende.push("bereichUnklar");
  } else {
    const abstand = (punkte[bester] - punkte[zweiter]) / punkte[bester];
    bereichSicher = abstand >= 0.35 && punkte[bester] >= 25 ? "hoch" : abstand >= 0.15 ? "mittel" : "niedrig";
    gruende.push(BEREICH_GRUND[bester]);
  }

  // Quellenart
  const artikelZeilen = (probe.match(ARTIKEL_ZEILEN) ?? []).length;
  const stand = zaehle(kopf, STANDARD_MARKER) + zaehle(probe.slice(0, 6000), STANDARD_MARKER);
  const urteil = zaehle(probe.slice(0, 4000), URTEIL_MARKER);
  const buch = zaehle(probe, BUCH_MARKER);
  const nachschlage = zaehle(kopf, NACHSCHLAGE_MARKER);
  const behoerde = zaehle(probe.slice(0, 4000), BEHOERDE_MARKER);
  const praxis = zaehle(probe, PRAXIS_MARKER) + zaehle(kopf, PRAXIS_MARKER);
  const intern = zaehle(probe.slice(0, 4000), INTERN_MARKER);

  let quellenart: Quellenart;
  let artSicher: AnalyseSicherheit = "mittel";
  if (intern >= 2) {
    quellenart = "intern";
    gruende.push("artIntern");
  } else if (nachschlage >= 2) {
    quellenart = "nachschlagewerk";
    gruende.push("artNachschlagewerk");
  } else if (urteil >= 3) {
    quellenart = "rechtsprechung";
    artSicher = urteil >= 6 ? "hoch" : "mittel";
    gruende.push("artRechtsprechung");
  } else if (stand >= 4) {
    quellenart = "standard";
    artSicher = stand >= 8 ? "hoch" : "mittel";
    gruende.push("artStandard");
  } else if (artikelZeilen >= 8 && buch < 6) {
    quellenart = "rechtsnorm";
    artSicher = artikelZeilen >= 20 ? "hoch" : "mittel";
    gruende.push("artRechtsnorm");
  } else if (buch >= 6 || laenge >= 120_000) {
    quellenart = "fachliteratur";
    artSicher = (buch >= 10 && laenge >= 60_000) || (buch >= 4 && laenge >= 100_000) ? "hoch" : "mittel";
    gruende.push("artBuch");
  } else if (behoerde >= 3) {
    quellenart = "behoerdeninfo";
    gruende.push("artBehoerde");
  } else if (praxis >= 3) {
    quellenart = "praxisbeitrag";
    gruende.push("artPraxis");
  } else if (laenge < 8_000) {
    quellenart = "praxisbeitrag";
    artSicher = "niedrig";
    gruende.push("artKurz");
  } else {
    quellenart = "fachliteratur";
    artSicher = "niedrig";
    gruende.push("artUnklar");
  }

  // Textgrundlage: ohne Hinweis im Text gilt der Originaltext
  let textgrundlage: Textgrundlage = "original";
  if (MASCHINELL.test(probe)) {
    textgrundlage = "maschinell_uebersetzt";
    gruende.push("uebersetzungMaschinell");
  } else if (AMTLICH_UEBERSETZT.test(probe)) {
    textgrundlage = "amtlich_uebersetzt";
    gruende.push("uebersetzungAmtlich");
  } else if (UEBERSETZT.test(probe)) {
    textgrundlage = "fachlich_uebersetzt";
    gruende.push("uebersetzungHinweis");
  }

  const reihe: Record<AnalyseSicherheit, number> = { niedrig: 0, mittel: 1, hoch: 2 };
  const sicherheit = reihe[bereichSicher] <= reihe[artSicher] ? bereichSicher : artSicher;
  return { bereich, quellenart, textgrundlage, sprache: spracheVon(probe), sicherheit, gruende, quelle: "heuristik" };
}
