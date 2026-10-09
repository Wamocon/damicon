// Liste der Wissensdokumente fuer die Verwaltung (Administration, Seite Wissensbasis): Textstellen (wissen_chunks) werden zu
// Dokumenten zusammengefasst. Hochgeladene und per Skript eingelesene Dokumente erscheinen gemeinsam;
// die Skript-Dokumente gruppieren nach quelle_id (wie sie das Einlese-Skript vergibt), notfalls nach Pfad.
// Reine Funktion, ohne Datenbank, damit sie testbar bleibt.

import { istCluster, istPruefstatus, nutzungFuer, type Cluster, type Nutzung, type Pruefstatus } from "@/lib/wissen/quellenart";
import { istGueteHinweis, schlechtesteNote, type GueteHinweis, type GueteNote } from "@/lib/wissen/textguete";
import { istUploadZeile, UPLOAD_QUELLE } from "@/lib/wissen/upload-quelle";

/** Die Spalten, die die Liste liest (PostgREST-Schreibweise, Aliase fuer extra->>...). Eine Stelle fuer Action und Test. */
export const LISTE_SPALTEN =
  "id, quelle_id, pfad, titel, bereich, rollen, eingelesen_am, autoritaetsstufe, quellenart, cluster, textgrundlage, pruefstatus, pruefen_bis, url, rechtsstelle, " +
  "upload_quelle:extra->>quelle, hochgeladen_von:extra->>hochgeladen_von_name, hochgeladen_von_id:extra->>hochgeladen_von, " +
  "paket:extra->>paket, pakete_gesamt:extra->>pakete_gesamt, guete:extra->>guete, guete_hinweise:extra->>guete_hinweise";

/** Nur die leichten Spalten: Text und Vektoren werden fuer die Liste nie gelesen. */
export interface WissenListeZeile {
  id: string;
  quelle_id: string | null;
  pfad: string | null;
  titel: string | null;
  bereich: string | null;
  rollen: string[] | null;
  eingelesen_am: string | null;
  /** extra->>quelle: "upload" bei hochgeladenen Zeilen. */
  upload_quelle: string | null;
  /** extra->>hochgeladen_von_name */
  hochgeladen_von: string | null;
  // Typisierung und Pruefung (Migrationen 20261124000000 und 20261125000000); fehlen bei Zeilen aus aelteren Quellen.
  autoritaetsstufe?: number | null;
  quellenart?: string | null;
  cluster?: string | null;
  textgrundlage?: string | null;
  /** Fundstelle im Gesetz oder Erlass (Frontmatter des Einlese-Skripts): ein Hinweis auf eine Rechtsquelle. */
  rechtsstelle?: string | null;
  pruefstatus?: string | null;
  pruefen_bis?: string | null;
  url?: string | null;
  /** extra->>hochgeladen_von: profiles.id der hochladenden Person. */
  hochgeladen_von_id?: string | null;
  /** Buch-Upload: Nummer des Pakets dieser Zeile und Zahl aller Pakete (als Text, wie extra->> sie liefert). */
  paket?: string | null;
  pakete_gesamt?: string | null;
  /** Einschaetzung der Textqualitaet (gut, pruefen, schlecht) und ihre Hinweise, durch Komma getrennt. */
  guete?: string | null;
  guete_hinweise?: string | null;
  /** Aus wissen_liste(): so viele Textstellen mit gleichen Listenspalten stehen fuer diese Zeile (fehlt = 1). */
  anzahl?: number | null;
}

/** Spalte von wissen_chunks, ueber die ein Dokument adressiert wird: so, wie die Liste gruppiert (quelle_id, sonst pfad, sonst id). */
export type SchluesselSpalte = "quelle_id" | "pfad" | "id";

export interface WissenDokumentZeile {
  schluessel: string;
  schluesselSpalte: SchluesselSpalte;
  titel: string;
  bereich: string;
  rollen: string[];
  /** ISO-Datum oder -Zeitpunkt aus eingelesen_am; null, wenn die Quelle keines nennt. */
  datum: string | null;
  hochgeladenVon: string | null;
  hochgeladenVonId: string | null;
  chunks: number;
  herkunft: "upload" | "skript";
  /** Nur ein Dokument, dessen Zeilen ALLE aus dem Upload stammen (extra.quelle = "upload" und quelle_id "upload:..."),
   *  zeigt einen Loeschen-Knopf. Skript-Dokumente nie. Der Server prueft dasselbe noch einmal selbst. */
  loeschbar: boolean;
  quellenart: string | null;
  /** Der Weg (buecher, publikationen, internet) oder null, wenn noch nicht eingeordnet. */
  cluster: Cluster | null;
  /** original, amtlich_uebersetzt, fachlich_uebersetzt oder maschinell_uebersetzt; null beim Bestand ohne Angabe. */
  textgrundlage: string | null;
  stufe: number | null;
  /** Fundstelle im Gesetz (nur Bestand), ein Hinweis auf eine Rechtsquelle. */
  rechtsstelle: string | null;
  /** Wofuer die Quelle in ihrem Bereich taugt (quellenart.ts). */
  nutzung: Nutzung;
  pruefstatus: Pruefstatus;
  /** Wiedervorlage (JJJJ-MM-TT) oder null. */
  pruefenBis: string | null;
  /** Buch-Upload: Zahl aller Pakete (null bei einem normalen Upload und beim Bestand) und wie viele davon da sind. */
  paketeGesamt: number | null;
  paketeDa: number;
  /** Es fehlen Pakete: ein abgebrochenes Buch. Laesst sich nicht freigeben, nur loeschen oder ablehnen. */
  unvollstaendig: boolean;
  /** Schlechteste Note der Textqualitaet ueber alle Zeilen (nur Uploads), und die Hinweise dazu. */
  guete: GueteNote | null;
  gueteHinweise: GueteHinweis[];
  /** Freigegeben, aber die Wiedervorlage ist erreicht: wird nicht mehr gefunden, bis eine zweite Person verlaengert. */
  abgelaufen: boolean;
  url: string | null;
}

/** Noch nicht (vollstaendig) eingeordnet: es fehlt die Quellenart oder der Cluster. */
export const ohneEinordnung = (d: Pick<WissenDokumentZeile, "quellenart" | "cluster">): boolean => !d.quellenart || !d.cluster;

const RANG: Record<Pruefstatus, number> = { ungeprueft: 0, abgelehnt: 1, freigegeben: 2 };

/** `heute` (JJJJ-MM-TT) ist ein Parameter, damit Tests ohne Uhr auskommen. */
export function gruppiereWissenDokumente(zeilen: readonly WissenListeZeile[], heute = new Date().toISOString().slice(0, 10)): WissenDokumentZeile[] {
  const gruppen = new Map<string, WissenDokumentZeile>();
  const pakete = new Map<string, Set<number>>();
  const gueteNoten = new Map<string, (string | null | undefined)[]>();
  const gueteHinweise = new Map<string, Set<GueteHinweis>>();
  for (const z of zeilen) {
    const schluessel = z.quelle_id ?? z.pfad ?? z.id;
    const schluesselSpalte: SchluesselSpalte = z.quelle_id ? "quelle_id" : z.pfad ? "pfad" : "id";
    const status: Pruefstatus = istPruefstatus(z.pruefstatus) ? z.pruefstatus : "freigegeben";
    const anzahl = typeof z.anzahl === "number" && z.anzahl > 0 ? z.anzahl : 1;
    // Pakete und Qualitaet zaehlen fuer jede Zeile, auch fuer die erste
    if (z.paket !== null && z.paket !== undefined && z.paket !== "") {
      const menge = pakete.get(schluessel) ?? new Set<number>();
      menge.add(Number(z.paket));
      pakete.set(schluessel, menge);
    }
    if (z.guete) gueteNoten.set(schluessel, [...(gueteNoten.get(schluessel) ?? []), z.guete]);
    if (z.guete_hinweise) {
      const menge = gueteHinweise.get(schluessel) ?? new Set<GueteHinweis>();
      for (const h of z.guete_hinweise.split(",")) if (istGueteHinweis(h)) menge.add(h);
      gueteHinweise.set(schluessel, menge);
    }
    const vorhanden = gruppen.get(schluessel);
    if (!vorhanden) {
      gruppen.set(schluessel, {
        schluessel,
        schluesselSpalte,
        titel: z.titel ?? z.pfad ?? schluessel,
        bereich: z.bereich ?? "",
        rollen: [...(z.rollen ?? [])],
        datum: z.eingelesen_am,
        hochgeladenVon: z.hochgeladen_von,
        hochgeladenVonId: z.hochgeladen_von_id ?? null,
        chunks: anzahl,
        herkunft: z.upload_quelle === UPLOAD_QUELLE ? "upload" : "skript",
        loeschbar: istUploadZeile(z),
        quellenart: z.quellenart ?? null,
        cluster: istCluster(z.cluster) ? z.cluster : null,
        textgrundlage: z.textgrundlage ?? null,
        stufe: z.autoritaetsstufe ?? null,
        rechtsstelle: z.rechtsstelle ?? null,
        nutzung: nutzungFuer(z.bereich ?? "", z.quellenart),
        pruefstatus: status,
        pruefenBis: z.pruefen_bis ?? null,
        paketeGesamt: z.pakete_gesamt ? Number(z.pakete_gesamt) : null,
        paketeDa: 0,
        unvollstaendig: false,
        guete: null,
        gueteHinweise: [],
        abgelaufen: false,
        url: z.url ?? null,
      });
      continue;
    }
    vorhanden.chunks += anzahl;
    vorhanden.loeschbar &&= istUploadZeile(z);
    for (const r of z.rollen ?? []) if (!vorhanden.rollen.includes(r)) vorhanden.rollen.push(r);
    if (!vorhanden.rechtsstelle && z.rechtsstelle) vorhanden.rechtsstelle = z.rechtsstelle;
    if (z.pakete_gesamt) vorhanden.paketeGesamt = Math.max(vorhanden.paketeGesamt ?? 0, Number(z.pakete_gesamt));
    if (z.eingelesen_am && (!vorhanden.datum || z.eingelesen_am > vorhanden.datum)) vorhanden.datum = z.eingelesen_am;
    if (!vorhanden.hochgeladenVon && z.hochgeladen_von) vorhanden.hochgeladenVon = z.hochgeladen_von;
    if (!vorhanden.hochgeladenVonId && z.hochgeladen_von_id) vorhanden.hochgeladenVonId = z.hochgeladen_von_id;
    // Ein Dokument gilt so streng wie seine strengste Zeile (ungeprueft vor abgelehnt vor freigegeben).
    if (RANG[status] < RANG[vorhanden.pruefstatus]) vorhanden.pruefstatus = status;
    if (z.pruefen_bis && (!vorhanden.pruefenBis || z.pruefen_bis < vorhanden.pruefenBis)) vorhanden.pruefenBis = z.pruefen_bis;
  }
  const liste = [...gruppen.values()];
  for (const d of liste) {
    d.paketeDa = pakete.get(d.schluessel)?.size ?? 0;
    d.unvollstaendig = d.paketeGesamt !== null && d.paketeDa < d.paketeGesamt;
    d.guete = schlechtesteNote(gueteNoten.get(d.schluessel) ?? []);
    d.gueteHinweise = [...(gueteHinweise.get(d.schluessel) ?? [])];
  }
  for (const d of liste) d.abgelaufen = d.pruefstatus === "freigegeben" && d.pruefenBis !== null && d.pruefenBis < heute;
  // Was auf eine Entscheidung wartet, steht oben. Danach neueste zuerst; ohne Datum ans Ende, dort nach Bereich und Titel.
  return liste.sort((a, b) => {
    const wartetA = a.pruefstatus === "ungeprueft" || a.abgelaufen;
    const wartetB = b.pruefstatus === "ungeprueft" || b.abgelaufen;
    if (wartetA !== wartetB) return wartetA ? -1 : 1;
    if (a.datum && b.datum && a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;
    if (!a.datum !== !b.datum) return a.datum ? -1 : 1;
    return a.bereich.localeCompare(b.bereich) || a.titel.localeCompare(b.titel);
  });
}
