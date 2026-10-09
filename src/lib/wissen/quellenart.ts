import { bereichSchluessel, UPLOAD_BEREICHE, type UploadBereich } from "@/lib/wissen/upload-konstanten";

// Typisierung der Wissensquellen: WOHER stammt ein Text, WIE belastbar ist er, und WOFUER darf er dienen.
// Die einzige Stelle fuer diese Regeln. Upload (hochladen.ts), Freigabe (freigabe.ts), Suche (suche.ts), die
// Quellenkarte im Chat und die Tests lesen alle von hier. Ohne Abhaengigkeit von Node und Datenbank.
//
// Vier Achsen, die nicht vermischt werden:
//   cluster          Der WEG, auf dem der Text zum Betrieb kam: Buecher, Publikationen oder Internet-Quelle. Eine eigene
//                    Achse, gespeichert in wissen_chunks.cluster, und unabhaengig von der Art: Ein Gesetz von einer
//                    Regierungsseite ist eine Rechtsnorm (Art) und kommt aus dem Internet (Cluster). Die Art bestimmt Stufe
//                    und Nutzung, der Cluster sagt nur, woher der Text stammt. Er hat keine Wirkung auf die Suche.
//   quellenart       Art der Quelle (Gesetz, Fachbuch, Forum ...). Vergibt der Admin beim Upload.
//   autoritaetsstufe 1 bis 5, aus der Quellenart vorbelegt (bestehende Skala: 1 Primaerrecht ... 5 Presse).
//   pruefstatus      ungeprueft, freigegeben, abgelehnt. Ein Upload ist erst durchsuchbar, wenn eine ZWEITE Person
//                    ihn freigegeben hat (Vier-Augen-Prinzip, in der Datenbank erzwungen).
// Wofuer eine Quelle taugt, haengt vom Bereich ab (Nutzung). Ungesicherte Internetquellen (Internetquelle, Forum, Recherche,
// KI-Text) sind NOTFALLS nutzbar: nur wenn die Suche sonst keine tragende Quelle findet, und dann immer ausdruecklich als
// Internetquelle ohne amtlichen Charakter gekennzeichnet (Entscheidung Nikos vom 09.10.2026; vorher waren sie fuer Recht,
// Steuern und Compliance gesperrt). Das ist Nutzung "notfalls".

/** Gold bis dreckig: von der Rechtsnorm bis zur ungeprueften Internetquelle. Reihenfolge = Rang. */
export const QUELLENARTEN = [
  "rechtsnorm",
  "rechtsprechung",
  "verwaltungsanweisung",
  "behoerdeninfo",
  "standard",
  "fachliteratur",
  "praxisbeitrag",
  "intern",
  "nachschlagewerk",
  "internetquelle",
  "forum",
  "internetrecherche",
  "ki_zusammenfassung",
] as const;
export type Quellenart = (typeof QUELLENARTEN)[number];

/**
 * Drei Cluster: der Weg, auf dem ein Text zum Betrieb kam. Unabhaengig von der Quellenart (siehe Kopfkommentar).
 *   buecher        Als Buch erschienen: Fachbuch, Kommentar, Lehrbuch, Lexikon (gedruckt oder als E-Book).
 *   publikationen  Sonst veroeffentlicht oder herausgegeben: Amtsblatt, Zeitschrift, Fachaufsatz, Studie, Whitepaper,
 *                  interne Ausarbeitung.
 *   internet       Aus dem Netz: Webseiten (auch amtliche von Regierung und Behoerden), Foren, Blogs, Rechercheergebnisse.
 */
export const CLUSTER = ["buecher", "publikationen", "internet"] as const;
export type Cluster = (typeof CLUSTER)[number];

export const TEXTGRUNDLAGEN = ["original", "amtlich_uebersetzt", "fachlich_uebersetzt", "maschinell_uebersetzt"] as const;
export type Textgrundlage = (typeof TEXTGRUNDLAGEN)[number];

export const PRUEFSTATUS = ["ungeprueft", "freigegeben", "abgelehnt"] as const;
export type Pruefstatus = (typeof PRUEFSTATUS)[number];

/** ja = normale Quelle, hinweis = nur als Hinweis (nie allein tragend, steht hinter den tragenden Belegen),
 *  notfalls = nur wenn die Suche sonst keinen tragenden Beleg findet (ungesicherte Internetquelle, immer ausdruecklich
 *  gekennzeichnet), nein = fuer diesen Bereich nicht zulaessig (kein Upload, nie in der Suche). */
export type Nutzung = "ja" | "hinweis" | "notfalls" | "nein";

/** Die bestehende Skala der Autoritaetsstufe (src/lib/wissen/suche.ts, Werkzeugbeschreibung, Quellenanweisung). */
export const STUFEN_NAMEN: Record<number, string> = {
  1: "Primärrecht",
  2: "untergesetzliche Norm",
  3: "amtliche Erläuterung",
  4: "Fachquelle",
  5: "Presse und ungesicherte Quellen",
};

interface QuellenartInfo {
  /** Beschriftung fuer den Assistenten und als Rueckfall (die Oberflaeche nutzt die Sprachdateien). */
  label: string;
  beispiele: string;
  /** Aus welchem Cluster eine Quelle dieser Art typischerweise kommt. Nur die Vorbelegung im Formular. */
  typischerCluster: Cluster;
  /** Eine Art, die schon ihrer Natur nach aus dem Netz stammt, kann in keinem anderen Cluster liegen. */
  clusterZwang: Cluster | null;
  stufe: 1 | 2 | 3 | 4 | 5;
  /** Ohne Link ist die Herkunft nicht nachpruefbar: fuer diese Arten Pflicht. */
  urlPflicht: boolean;
  /** Nach so vielen Monaten ist eine neue Pruefung faellig; bis dahin ist die Quelle durchsuchbar. null = nie. */
  pruefMonate: number | null;
  nutzung: Record<UploadBereich, Nutzung>;
}

const alle = (n: Nutzung): Record<UploadBereich, Nutzung> => ({ recht: n, steuer: n, compliance: n, audit: n, risiko: n });
const reihe = (recht: Nutzung, steuer: Nutzung, compliance: Nutzung, audit: Nutzung, risiko: Nutzung): Record<UploadBereich, Nutzung> => ({
  recht,
  steuer,
  compliance,
  audit,
  risiko,
});

export const QUELLENART_INFO: Record<Quellenart, QuellenartInfo> = {
  rechtsnorm: { label: "Rechtsnorm", beispiele: "Gesetz, Verordnung, Kodex", typischerCluster: "publikationen", clusterZwang: null, stufe: 1, urlPflicht: false, pruefMonate: null, nutzung: alle("ja") },
  rechtsprechung: { label: "Rechtsprechung", beispiele: "Urteil, Beschluss", typischerCluster: "publikationen", clusterZwang: null, stufe: 2, urlPflicht: false, pruefMonate: null, nutzung: alle("ja") },
  verwaltungsanweisung: { label: "Verwaltungsanweisung", beispiele: "Erlass, Schreiben einer Behörde", typischerCluster: "publikationen", clusterZwang: null, stufe: 2, urlPflicht: false, pruefMonate: null, nutzung: alle("ja") },
  behoerdeninfo: { label: "Behördeninformation", beispiele: "Merkblatt, amtliche Auskunft", typischerCluster: "publikationen", clusterZwang: null, stufe: 3, urlPflicht: false, pruefMonate: null, nutzung: alle("ja") },
  standard: {
    label: "Norm oder Standard",
    beispiele: "ISO, COSO, Prüfungsstandard", typischerCluster: "publikationen", clusterZwang: null,
    stufe: 3,
    urlPflicht: false,
    pruefMonate: null,
    nutzung: reihe("hinweis", "hinweis", "ja", "ja", "ja"),
  },
  fachliteratur: { label: "Fachliteratur", beispiele: "Kommentar, Lehrbuch, Fachaufsatz", typischerCluster: "buecher", clusterZwang: null, stufe: 4, urlPflicht: false, pruefMonate: null, nutzung: alle("ja") },
  praxisbeitrag: {
    label: "Praxisbeitrag",
    beispiele: "Whitepaper, Studie, Kanzlei- oder Verbandsinformation", typischerCluster: "publikationen", clusterZwang: null,
    stufe: 4,
    urlPflicht: false,
    pruefMonate: 24,
    nutzung: reihe("hinweis", "hinweis", "hinweis", "ja", "ja"),
  },
  intern: {
    label: "Interne Ausarbeitung",
    beispiele: "Betriebsanweisung, eigene Analyse", typischerCluster: "publikationen", clusterZwang: null,
    stufe: 4,
    urlPflicht: false,
    pruefMonate: 24,
    nutzung: reihe("hinweis", "hinweis", "ja", "ja", "ja"),
  },
  nachschlagewerk: {
    label: "Nachschlagewerk",
    beispiele: "Lexikon, Enzyklopädie, Wörterbuch", typischerCluster: "buecher", clusterZwang: null,
    stufe: 5,
    urlPflicht: false,
    pruefMonate: 12,
    nutzung: alle("hinweis"),
  },
  internetquelle: {
    label: "Internetquelle",
    beispiele: "Webseite, Artikel, Blog, Wikipedia", typischerCluster: "internet", clusterZwang: "internet",
    stufe: 5,
    urlPflicht: true,
    pruefMonate: 12,
    nutzung: alle("notfalls"),
  },
  forum: {
    label: "Forum oder Frage-Antwort-Portal",
    beispiele: "Forum, Q&A, soziale Netze", typischerCluster: "internet", clusterZwang: "internet",
    stufe: 5,
    urlPflicht: true,
    pruefMonate: 12,
    nutzung: alle("notfalls"),
  },
  internetrecherche: {
    label: "Ergebnis einer Internetrecherche",
    beispiele: "Zusammenstellung aus einer Websuche (von Mensch oder KI)", typischerCluster: "internet", clusterZwang: "internet",
    stufe: 5,
    urlPflicht: false,
    pruefMonate: 12,
    nutzung: alle("notfalls"),
  },
  ki_zusammenfassung: {
    label: "KI-Zusammenfassung",
    beispiele: "von einer KI erzeugte Zusammenfassung oder Ausarbeitung", typischerCluster: "internet", clusterZwang: null,
    stufe: 5,
    urlPflicht: false,
    pruefMonate: 12,
    nutzung: alle("notfalls"),
  },
};

const TEXTGRUNDLAGE_LABEL: Record<Textgrundlage, string> = {
  original: "Originaltext",
  amtlich_uebersetzt: "amtliche Übersetzung",
  fachlich_uebersetzt: "fachliche Übersetzung",
  maschinell_uebersetzt: "maschinelle Übersetzung",
};

/** Beschriftung und Beispiele je Cluster als Rueckfall (die Oberflaeche nutzt die Sprachdateien). */
export const CLUSTER_INFO: Record<Cluster, { label: string; beispiele: string }> = {
  buecher: { label: "Bücher", beispiele: "Fachbuch, Kommentar, Lehrbuch, Lexikon (gedruckt oder E-Book)" },
  publikationen: { label: "Publikationen", beispiele: "Amtsblatt, Zeitschrift, Fachaufsatz, Studie, Whitepaper, interne Ausarbeitung" },
  internet: { label: "Internet-Quelle", beispiele: "Webseite (auch amtliche), Forum, Blog, Rechercheergebnis" },
};

export const istQuellenart = (wert: unknown): wert is Quellenart => typeof wert === "string" && (QUELLENARTEN as readonly string[]).includes(wert);
export const istCluster = (wert: unknown): wert is Cluster => typeof wert === "string" && (CLUSTER as readonly string[]).includes(wert);
export const istTextgrundlage = (wert: unknown): wert is Textgrundlage => typeof wert === "string" && (TEXTGRUNDLAGEN as readonly string[]).includes(wert);
export const istPruefstatus = (wert: unknown): wert is Pruefstatus => typeof wert === "string" && (PRUEFSTATUS as readonly string[]).includes(wert);

/** Vorbelegung des Clusters, wenn nur die Art bekannt ist. null bei einem unbekannten Wert. */
export const typischerClusterVon = (art: string | null | undefined): Cluster | null => (istQuellenart(art) ? QUELLENART_INFO[art].typischerCluster : null);

/** Passt der Cluster zur Art? Nur eine Art, die zwingend aus dem Netz stammt (Internetquelle, Forum, Internetrecherche), schliesst
 *  Buecher und Publikationen aus. Alles andere ist frei: ein Gesetz kann aus einem Buch, einem Amtsblatt oder dem Netz kommen. */
export const clusterPasst = (art: Quellenart, cluster: Cluster): boolean => {
  const zwang = QUELLENART_INFO[art].clusterZwang;
  return zwang === null || zwang === cluster;
};

/** Die Primaerquellen, fuer die die Suche eigene Plaetze reserviert: Stufe 1 bis 3 (Recht und amtliche Texte). */
export const PRIMAER_MAX_STUFE = 3;

/** Autoritaetsstufe, mit der ein Upload dieser Art angelegt wird. */
export const standardStufe = (art: Quellenart): number => QUELLENART_INFO[art].stufe;

const STRENGE: readonly Nutzung[] = ["ja", "hinweis", "notfalls", "nein"];

/** Wofuer taugt diese Quelle in diesem Bereich? `bereich` darf der gespeicherte Wert sein ("legal" fuer Recht).
 *  Ohne Art (Bestand vor der Typisierung) gilt "ja": fuer ihn entscheidet weiter die Autoritaetsstufe. Hat die Quelle eine Art,
 *  der Bereich aber keine eigene Regel (Korpuswerte wie amtlich, fachquellen, kernwissen), gilt die STRENGSTE Regel der Art:
 *  eine als Internetquelle eingeordnete Seite bleibt auch in "fachquellen" ein Notbehelf und wird so gekennzeichnet. */
export function nutzungFuer(bereich: string, art: string | null | undefined): Nutzung {
  if (!istQuellenart(art)) return "ja";
  const schluessel = bereichSchluessel(bereich);
  const regeln = QUELLENART_INFO[art].nutzung;
  if (!(UPLOAD_BEREICHE as readonly string[]).includes(schluessel)) {
    return Object.values(regeln).reduce<Nutzung>((strengste, n) => (STRENGE.indexOf(n) > STRENGE.indexOf(strengste) ? n : strengste), "ja");
  }
  return regeln[schluessel as UploadBereich];
}

/** Das Datum (JJJJ-MM-TT), ab dem eine neue Pruefung faellig ist, oder null, wenn die Art nie ablaeuft. */
export function pruefenBis(art: Quellenart, ab: Date): string | null {
  const monate = QUELLENART_INFO[art].pruefMonate;
  if (monate === null) return null;
  const d = new Date(Date.UTC(ab.getUTCFullYear(), ab.getUTCMonth() + monate, ab.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

export interface EinordnungEingabe {
  quellenart: string | null;
  stufe: number | null;
  nutzung: Nutzung;
  textgrundlage: string | null;
  /** Abrufdatum oder Stand der Quelle. */
  stand: string | null;
}

/** Ein Satzteil fuer den Assistenten und die Karte: Art, Stufe, Stand, Einschraenkungen. Berechnet im Code, nie vom
 *  Modell: so steht bei jedem Beleg dasselbe, und das Modell muss es nur wiedergeben. */
export function einordnung(e: EinordnungEingabe): string {
  const teile: string[] = [];
  teile.push(istQuellenart(e.quellenart) ? QUELLENART_INFO[e.quellenart].label : "Quelle ohne Typisierung");
  if (e.stufe !== null && STUFEN_NAMEN[e.stufe]) teile.push(`Stufe ${e.stufe} (${STUFEN_NAMEN[e.stufe]})`);
  if (e.stand) teile.push(`Stand ${e.stand}`);
  if (istTextgrundlage(e.textgrundlage) && e.textgrundlage !== "original") teile.push(TEXTGRUNDLAGE_LABEL[e.textgrundlage]);
  if (e.nutzung === "hinweis") teile.push("nur als Hinweis, nicht geprüft");
  if (e.nutzung === "notfalls") teile.push("ungesicherte Internetquelle, keine amtliche Quelle, nur als Notbehelf");
  return teile.join(", ");
}

/** Was die Suche aus den Belegen fuer die Antwort ableitet. massgeblich: mindestens ein Beleg der Stufen 1 bis 3, der
 *  in seinem Bereich uneingeschraenkt gilt. belastbar: mindestens ein Beleg, der nicht nur Hinweis ist. nur_unsichere: es
 *  gibt NUR ungesicherte Internetquellen (Nutzung notfalls). */
export type BelegLage = "massgeblich" | "belastbar" | "nur_hinweise" | "nur_unsichere" | "keine";

export function belegLage(belege: ReadonlyArray<{ stufe: number | null; nutzung: Nutzung }>): BelegLage {
  if (belege.length === 0) return "keine";
  const tragend = belege.filter((b) => b.nutzung === "ja");
  if (tragend.length === 0) return belege.every((b) => b.nutzung === "notfalls") ? "nur_unsichere" : "nur_hinweise";
  return tragend.some((b) => b.stufe !== null && b.stufe <= 3) ? "massgeblich" : "belastbar";
}
