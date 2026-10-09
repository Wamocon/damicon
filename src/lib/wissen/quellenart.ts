import { bereichSchluessel, UPLOAD_BEREICHE, type UploadBereich } from "@/lib/wissen/upload-konstanten";

// Typisierung der Wissensquellen: WOHER stammt ein Text, WIE belastbar ist er, und WOFUER darf er dienen.
// Die einzige Stelle fuer diese Regeln. Upload (hochladen.ts), Freigabe (freigabe.ts), Suche (suche.ts), die
// Quellenkarte im Chat und die Tests lesen alle von hier. Ohne Abhaengigkeit von Node und Datenbank.
//
// Vier Achsen, die nicht vermischt werden:
//   cluster          Grobe Herkunft ueber den Quellenarten: Buecher, Publikationen oder Internet-Quelle. Wird NICHT
//                    gespeichert, sondern aus der Quellenart abgeleitet (eine Wahrheit, keine Migration). Der Admin
//                    waehlt ihn beim Upload zuerst und bekommt danach nur die Arten dieses Clusters angeboten.
//   quellenart       Art der Quelle (Gesetz, Fachbuch, Forum ...). Vergibt der Admin beim Upload.
//   autoritaetsstufe 1 bis 5, aus der Quellenart vorbelegt (bestehende Skala: 1 Primaerrecht ... 5 Presse).
//   pruefstatus      ungeprueft, freigegeben, abgelehnt. Ein Upload ist erst durchsuchbar, wenn eine ZWEITE Person
//                    ihn freigegeben hat (Vier-Augen-Prinzip, in der Datenbank erzwungen).
// Wofuer eine Quelle taugt, haengt vom Bereich ab (Nutzung): Blogs und Foren sind fuer Gesetze und Vorschriften
// ungeeignet, fuer Risikomanagement (Methoden aendern sich laufend) als Hinweis denkbar.

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
 * Drei Cluster ueber den dreizehn Quellenarten. Jede Art gehoert zu genau einem Cluster; die Zuordnung steht je Art in
 * QUELLENART_INFO.cluster und nur dort.
 *   buecher        Buecher und Nachschlagewerke: Fachliteratur, Kommentare, Lehrbuecher, Lexika.
 *   publikationen  Veroeffentlichte und herausgegebene Schriften: amtliche Texte, Normen, Studien, Whitepaper sowie
 *                  interne Ausarbeitungen des Betriebs.
 *   internet       Texte aus dem Netz und maschinell Erzeugtes: Webseiten, Foren, Rechercheergebnisse, KI-Zusammenfassungen.
 */
export const CLUSTER = ["buecher", "publikationen", "internet"] as const;
export type Cluster = (typeof CLUSTER)[number];

export const TEXTGRUNDLAGEN = ["original", "amtlich_uebersetzt", "fachlich_uebersetzt", "maschinell_uebersetzt"] as const;
export type Textgrundlage = (typeof TEXTGRUNDLAGEN)[number];

export const PRUEFSTATUS = ["ungeprueft", "freigegeben", "abgelehnt"] as const;
export type Pruefstatus = (typeof PRUEFSTATUS)[number];

/** ja = normale Quelle, hinweis = nur als Hinweis (nie allein tragend), nein = fuer diesen Bereich nicht zulaessig. */
export type Nutzung = "ja" | "hinweis" | "nein";

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
  /** Zu welchem der drei Cluster die Art gehoert (grobe Herkunft). */
  cluster: Cluster;
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
  rechtsnorm: { label: "Rechtsnorm", beispiele: "Gesetz, Verordnung, Kodex", cluster: "publikationen", stufe: 1, urlPflicht: false, pruefMonate: null, nutzung: alle("ja") },
  rechtsprechung: { label: "Rechtsprechung", beispiele: "Urteil, Beschluss", cluster: "publikationen", stufe: 2, urlPflicht: false, pruefMonate: null, nutzung: alle("ja") },
  verwaltungsanweisung: { label: "Verwaltungsanweisung", beispiele: "Erlass, Schreiben einer Behörde", cluster: "publikationen", stufe: 2, urlPflicht: false, pruefMonate: null, nutzung: alle("ja") },
  behoerdeninfo: { label: "Behördeninformation", beispiele: "Merkblatt, amtliche Auskunft", cluster: "publikationen", stufe: 3, urlPflicht: false, pruefMonate: null, nutzung: alle("ja") },
  standard: {
    label: "Norm oder Standard",
    beispiele: "ISO, COSO, Prüfungsstandard", cluster: "publikationen",
    stufe: 3,
    urlPflicht: false,
    pruefMonate: null,
    nutzung: reihe("hinweis", "hinweis", "ja", "ja", "ja"),
  },
  fachliteratur: { label: "Fachliteratur", beispiele: "Kommentar, Lehrbuch, Fachaufsatz", cluster: "buecher", stufe: 4, urlPflicht: false, pruefMonate: null, nutzung: alle("ja") },
  praxisbeitrag: {
    label: "Praxisbeitrag",
    beispiele: "Whitepaper, Studie, Kanzlei- oder Verbandsinformation", cluster: "publikationen",
    stufe: 4,
    urlPflicht: false,
    pruefMonate: 24,
    nutzung: reihe("hinweis", "hinweis", "hinweis", "ja", "ja"),
  },
  intern: {
    label: "Interne Ausarbeitung",
    beispiele: "Betriebsanweisung, eigene Analyse", cluster: "publikationen",
    stufe: 4,
    urlPflicht: false,
    pruefMonate: 24,
    nutzung: reihe("hinweis", "hinweis", "ja", "ja", "ja"),
  },
  nachschlagewerk: {
    label: "Nachschlagewerk",
    beispiele: "Lexikon, Enzyklopädie, Wörterbuch", cluster: "buecher",
    stufe: 5,
    urlPflicht: false,
    pruefMonate: 12,
    nutzung: alle("hinweis"),
  },
  internetquelle: {
    label: "Internetquelle",
    beispiele: "Webseite, Artikel, Blog, Wikipedia", cluster: "internet",
    stufe: 5,
    urlPflicht: true,
    pruefMonate: 12,
    nutzung: reihe("nein", "nein", "nein", "hinweis", "hinweis"),
  },
  forum: {
    label: "Forum oder Frage-Antwort-Portal",
    beispiele: "Forum, Q&A, soziale Netze", cluster: "internet",
    stufe: 5,
    urlPflicht: true,
    pruefMonate: 12,
    nutzung: reihe("nein", "nein", "nein", "hinweis", "hinweis"),
  },
  internetrecherche: {
    label: "Ergebnis einer Internetrecherche",
    beispiele: "Zusammenstellung aus einer Websuche (von Mensch oder KI)", cluster: "internet",
    stufe: 5,
    urlPflicht: false,
    pruefMonate: 12,
    nutzung: reihe("nein", "nein", "nein", "hinweis", "hinweis"),
  },
  ki_zusammenfassung: {
    label: "KI-Zusammenfassung",
    beispiele: "von einer KI erzeugte Zusammenfassung oder Ausarbeitung", cluster: "internet",
    stufe: 5,
    urlPflicht: false,
    pruefMonate: 12,
    nutzung: reihe("nein", "nein", "nein", "hinweis", "hinweis"),
  },
};

const TEXTGRUNDLAGE_LABEL: Record<Textgrundlage, string> = {
  original: "Originaltext",
  amtlich_uebersetzt: "amtliche Übersetzung",
  fachlich_uebersetzt: "fachliche Übersetzung",
  maschinell_uebersetzt: "maschinelle Übersetzung",
};

/** Beispiele je Cluster fuer den Assistenten und als Rueckfall (die Oberflaeche nutzt die Sprachdateien). */
export const CLUSTER_INFO: Record<Cluster, { label: string; beispiele: string }> = {
  buecher: { label: "Bücher", beispiele: "Fachbücher, Kommentare, Lehrbücher, Nachschlagewerke" },
  publikationen: { label: "Publikationen", beispiele: "Gesetze, Urteile, Behördenschreiben, Normen, Studien, Whitepaper, interne Ausarbeitungen" },
  internet: { label: "Internet-Quelle", beispiele: "Webseiten, Foren, Rechercheergebnisse, KI-Zusammenfassungen" },
};

export const istQuellenart = (wert: unknown): wert is Quellenart => typeof wert === "string" && (QUELLENARTEN as readonly string[]).includes(wert);
export const istCluster = (wert: unknown): wert is Cluster => typeof wert === "string" && (CLUSTER as readonly string[]).includes(wert);
export const istTextgrundlage = (wert: unknown): wert is Textgrundlage => typeof wert === "string" && (TEXTGRUNDLAGEN as readonly string[]).includes(wert);
export const istPruefstatus = (wert: unknown): wert is Pruefstatus => typeof wert === "string" && (PRUEFSTATUS as readonly string[]).includes(wert);

/** Cluster einer gespeicherten Quellenart, oder null fuer Bestand ohne Typisierung. */
export const clusterVon = (art: string | null | undefined): Cluster | null => (istQuellenart(art) ? QUELLENART_INFO[art].cluster : null);

/** Die Quellenarten eines Clusters in der Rangfolge von QUELLENARTEN (gold bis dreckig). */
export const artenImCluster = (cluster: Cluster): Quellenart[] => QUELLENARTEN.filter((a) => QUELLENART_INFO[a].cluster === cluster);

/** Autoritaetsstufe, mit der ein Upload dieser Art angelegt wird. */
export const standardStufe = (art: Quellenart): number => QUELLENART_INFO[art].stufe;

/** Wofuer taugt diese Quelle in diesem Bereich? `bereich` darf der gespeicherte Wert sein ("legal" fuer Recht).
 *  Ohne Art (Bestand vor der Typisierung) oder in einem Bereich ohne Regel (Korpuswerte wie amtlich, kernwissen) gilt "ja":
 *  fuer den Bestand entscheidet weiter die Autoritaetsstufe. */
export function nutzungFuer(bereich: string, art: string | null | undefined): Nutzung {
  if (!istQuellenart(art)) return "ja";
  const schluessel = bereichSchluessel(bereich);
  if (!(UPLOAD_BEREICHE as readonly string[]).includes(schluessel)) return "ja";
  return QUELLENART_INFO[art].nutzung[schluessel as UploadBereich];
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
  return teile.join(", ");
}

/** Was die Suche aus den Belegen fuer die Antwort ableitet. massgeblich: mindestens ein Beleg der Stufen 1 bis 3, der
 *  in seinem Bereich uneingeschraenkt gilt. belastbar: mindestens ein Beleg, der nicht nur Hinweis ist. */
export type BelegLage = "massgeblich" | "belastbar" | "nur_hinweise" | "keine";

export function belegLage(belege: ReadonlyArray<{ stufe: number | null; nutzung: Nutzung }>): BelegLage {
  if (belege.length === 0) return "keine";
  const tragend = belege.filter((b) => b.nutzung === "ja");
  if (tragend.length === 0) return "nur_hinweise";
  return tragend.some((b) => b.stufe !== null && b.stufe <= 3) ? "massgeblich" : "belastbar";
}
