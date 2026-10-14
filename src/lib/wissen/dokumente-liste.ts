// Liste der Wissensdokumente fuer die Verwaltung (Administration, Seite Wissensbasis): Textstellen (wissen_chunks) werden zu
// Dokumenten zusammengefasst. Hochgeladene und per Skript eingelesene Dokumente erscheinen gemeinsam;
// die Skript-Dokumente gruppieren nach quelle_id (wie sie das Einlese-Skript vergibt), notfalls nach Pfad.
// Reine Funktion, ohne Datenbank, damit sie testbar bleibt.

import { istCluster, istPruefstatus, nutzungFuer, type Cluster, type Nutzung, type Pruefstatus } from "@/lib/wissen/quellenart";
import { leseSeitenzahlen, offenerStand } from "@/lib/wissen/seiten-bestaetigung";
import { beschreibeLuecken } from "@/lib/wissen/seitenverlauf";
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
  /** Textqualität des Dokuments in Prozent (Tabelle wissen_qualitaet, qualitaet.ts); null, solange nichts berechnet wurde. Nur aus wissen_liste(). */
  guete_prozent?: number | null;
  /** Größe der Original-PDF in Bytes (Tabelle wissen_original, original.ts), solange das Dokument auf die Freigabe wartet; sonst null. Nur aus wissen_liste(). */
  original_groesse?: number | null;
  /** Seitenverlauf-Pruefung beim Hochladen (extra.seiten_pruefung): fehlende gedruckte Seiten (Text aus der Datenbank), ihre Stellen und der Vermerk der pruefenden Person (Tabelle wissen_seiten_vermerk). Nur aus wissen_liste(). */
  seiten_fehlend?: string | number | null;
  seiten_stellen?: string | null;
  seiten_vermerk?: string | null;
  /** Gedruckte Seitenzahlen, die die pruefende Person als korrekt fehlend bestaetigt hat (wissen_seiten_vermerk), ob es eine Bestaetigung gibt (auch aus der Zeit
   *  des Freitext-Vermerks) und die per Nachtrag nachgeladenen Seiten (wissen_seiten_nachtrag). Nur aus wissen_liste(). */
  seiten_bestaetigt?: string | null;
  seiten_vermerkt?: boolean | null;
  seiten_nachgeladen?: string | null;
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
  /** Qualität in Prozent (0 bis 100), null, solange nichts berechnet wurde. */
  gueteProzent: number | null;
  /** Größe der Original-PDF in Bytes, wenn eine zum Prüfen bereitliegt (nur bis zur Freigabe); sonst null. */
  originalGroesse: number | null;
  /** Fehlende gedruckte Seiten laut Seitenverlauf-Pruefung (0 = keine bekannt), ihre Stellen ("48-49 (47)") und der Vermerk der pruefenden Person. */
  seitenFehlend: number;
  seitenStellen: string | null;
  seitenVermerk: string | null;
  /** Die als korrekt fehlend bestaetigten gedruckten Seiten, ob es eine Bestaetigung gibt, und die nachgeladenen Seiten. */
  seitenBestaetigt: string | null;
  seitenVermerkt: boolean;
  seitenNachgeladen: string | null;
  /** Fehlende Seiten, die noch offen sind (nicht nachgeladen, nicht bestaetigt) und wo ("48-49 (47)"): Sie mindern die Qualitaet und verhindern die Freigabe. */
  seitenOffen: number;
  seitenOffenStellen: string | null;
  /** Freigegeben, aber die Wiedervorlage ist erreicht: wird nicht mehr gefunden, bis eine zweite Person verlaengert. */
  abgelaufen: boolean;
  url: string | null;
}

/** Noch nicht (vollstaendig) eingeordnet: es fehlt die Quellenart oder der Cluster. */
export const ohneEinordnung = (d: Pick<WissenDokumentZeile, "quellenart" | "cluster">): boolean => !d.quellenart || !d.cluster;

const RANG: Record<Pruefstatus, number> = { ungeprueft: 0, abgelehnt: 1, freigegeben: 2 };

/** Was je Dokument über alle seine Zeilen gesammelt wird, bevor es fertig ist: die Paketnummern und die Gütenoten mit Hinweisen. */
interface Sammlung {
  pakete: Set<number>;
  noten: (string | null | undefined)[];
  hinweise: Set<GueteHinweis>;
}

const zahlOderNull = (wert: number | string | null | undefined): number | null =>
  typeof wert === "number" ? wert : typeof wert === "string" ? Number(wert) || null : null;

/** Das Dokument aus seiner ersten Zeile. */
function neuesDokument(z: WissenListeZeile, schluessel: string, schluesselSpalte: SchluesselSpalte, status: Pruefstatus, anzahl: number): WissenDokumentZeile {
  return {
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
    gueteProzent: typeof z.guete_prozent === "number" ? z.guete_prozent : null,
    seitenFehlend: Number(z.seiten_fehlend ?? 0) || 0,
    seitenStellen: z.seiten_stellen ?? null,
    seitenVermerk: z.seiten_vermerk ?? null,
    seitenBestaetigt: z.seiten_bestaetigt ?? null,
    seitenVermerkt: z.seiten_vermerkt === true,
    seitenNachgeladen: z.seiten_nachgeladen ?? null,
    seitenOffen: 0,
    seitenOffenStellen: null,
    originalGroesse: zahlOderNull(z.original_groesse),
    abgelaufen: false,
    url: z.url ?? null,
  };
}

/** Jede weitere Zeile desselben Dokuments: Zahlen addieren, Lücken füllen, und das Dokument gilt so streng wie seine strengste Zeile. */
function fuehreZusammen(d: WissenDokumentZeile, z: WissenListeZeile, status: Pruefstatus, anzahl: number): void {
  d.chunks += anzahl;
  fuelleLuecken(d, z);
  fuelleSeitenLuecken(d, z);
  vereinigeZeilenwerte(d, z, status);
}

/** Qualität, Größe des Originals, Rechtsstelle und hochladende Person: aus der ersten Zeile, die sie nennt. */
function fuelleLuecken(d: WissenDokumentZeile, z: WissenListeZeile): void {
  if (d.gueteProzent === null && typeof z.guete_prozent === "number") d.gueteProzent = z.guete_prozent;
  if (d.originalGroesse === null && z.original_groesse != null && Number(z.original_groesse) > 0) d.originalGroesse = Number(z.original_groesse);
  if (!d.rechtsstelle && z.rechtsstelle) d.rechtsstelle = z.rechtsstelle;
  if (!d.hochgeladenVon && z.hochgeladen_von) d.hochgeladenVon = z.hochgeladen_von;
  if (!d.hochgeladenVonId && z.hochgeladen_von_id) d.hochgeladenVonId = z.hochgeladen_von_id;
}

/** Fehlende Seiten mit ihren Stellen, Vermerk, bestätigte und nachgeladene Seiten: aus der ersten Zeile, die sie nennt. Vermerkt, sobald eine Zeile es ist. */
function fuelleSeitenLuecken(d: WissenDokumentZeile, z: WissenListeZeile): void {
  if (d.seitenFehlend === 0 && Number(z.seiten_fehlend ?? 0) > 0) {
    d.seitenFehlend = Number(z.seiten_fehlend);
    d.seitenStellen = z.seiten_stellen ?? null;
  }
  d.seitenVermerk ??= z.seiten_vermerk || null;
  d.seitenBestaetigt ??= z.seiten_bestaetigt || null;
  if (z.seiten_vermerkt === true) d.seitenVermerkt = true;
  d.seitenNachgeladen ??= z.seiten_nachgeladen || null;
}

/** Was alle Zeilen zusammen ergeben: löschbar nur, wenn jede es ist; alle Rollen; die meisten Pakete; das neueste Datum; der strengste Status; die früheste Wiedervorlage. */
function vereinigeZeilenwerte(d: WissenDokumentZeile, z: WissenListeZeile, status: Pruefstatus): void {
  d.loeschbar &&= istUploadZeile(z);
  for (const r of z.rollen ?? []) if (!d.rollen.includes(r)) d.rollen.push(r);
  if (z.pakete_gesamt) d.paketeGesamt = Math.max(d.paketeGesamt ?? 0, Number(z.pakete_gesamt));
  if (z.eingelesen_am && (!d.datum || z.eingelesen_am > d.datum)) d.datum = z.eingelesen_am;
  // Ein Dokument gilt so streng wie seine strengste Zeile (ungeprueft vor abgelehnt vor freigegeben).
  if (RANG[status] < RANG[d.pruefstatus]) d.pruefstatus = status;
  if (z.pruefen_bis && (!d.pruefenBis || z.pruefen_bis < d.pruefenBis)) d.pruefenBis = z.pruefen_bis;
}

/** Pakete und Güte zählen für jede Zeile, auch für die erste. */
function sammle(m: Sammlung, z: WissenListeZeile): void {
  if (z.paket !== null && z.paket !== undefined && z.paket !== "") m.pakete.add(Number(z.paket));
  if (z.guete) m.noten.push(z.guete);
  if (z.guete_hinweise) for (const h of z.guete_hinweise.split(",")) if (istGueteHinweis(h)) m.hinweise.add(h);
}

/** Was erst aus allen Zeilen folgt: Vollständigkeit, schlechteste Note, offene Seiten, abgelaufene Wiedervorlage. */
function vervollstaendige(d: WissenDokumentZeile, m: Sammlung, heute: string): void {
  d.paketeDa = m.pakete.size;
  d.unvollstaendig = d.paketeGesamt !== null && d.paketeDa < d.paketeGesamt;
  d.guete = schlechtesteNote(m.noten);
  d.gueteHinweise = [...m.hinweise];
  if (d.seitenFehlend > 0) {
    const stand = offenerStand({
      fehlendBeimHochladen: d.seitenFehlend,
      stellen: d.seitenStellen,
      nachgeladen: leseSeitenzahlen(d.seitenNachgeladen).seiten,
      bestaetigt: d.seitenVermerkt,
    });
    d.seitenOffen = stand.fehlend;
    d.seitenOffenStellen = stand.fehlend > 0 ? beschreibeLuecken(stand.luecken) || d.seitenStellen : null;
  }
  d.abgelaufen = d.pruefstatus === "freigegeben" && d.pruefenBis !== null && d.pruefenBis < heute;
}

/** Was auf eine Entscheidung wartet, steht oben. Danach neueste zuerst; ohne Datum ans Ende, dort nach Bereich und Titel. */
function reihenfolge(a: WissenDokumentZeile, b: WissenDokumentZeile): number {
  const wartetA = a.pruefstatus === "ungeprueft" || a.abgelaufen;
  const wartetB = b.pruefstatus === "ungeprueft" || b.abgelaufen;
  if (wartetA !== wartetB) return wartetA ? -1 : 1;
  if (a.datum && b.datum && a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;
  if (!a.datum !== !b.datum) return a.datum ? -1 : 1;
  return a.bereich.localeCompare(b.bereich) || a.titel.localeCompare(b.titel);
}

/** `heute` (JJJJ-MM-TT) ist ein Parameter, damit Tests ohne Uhr auskommen. */
export function gruppiereWissenDokumente(zeilen: readonly WissenListeZeile[], heute = new Date().toISOString().slice(0, 10)): WissenDokumentZeile[] {
  const gruppen = new Map<string, { dokument: WissenDokumentZeile; sammlung: Sammlung }>();
  for (const z of zeilen) {
    const schluessel = z.quelle_id ?? z.pfad ?? z.id;
    const status: Pruefstatus = istPruefstatus(z.pruefstatus) ? z.pruefstatus : "freigegeben";
    const anzahl = typeof z.anzahl === "number" && z.anzahl > 0 ? z.anzahl : 1;
    const vorhanden = gruppen.get(schluessel);
    if (vorhanden) {
      fuehreZusammen(vorhanden.dokument, z, status, anzahl);
      sammle(vorhanden.sammlung, z);
      continue;
    }
    const schluesselSpalte: SchluesselSpalte = z.quelle_id ? "quelle_id" : z.pfad ? "pfad" : "id";
    const eintrag = { dokument: neuesDokument(z, schluessel, schluesselSpalte, status, anzahl), sammlung: { pakete: new Set<number>(), noten: [], hinweise: new Set<GueteHinweis>() } };
    sammle(eintrag.sammlung, z);
    gruppen.set(schluessel, eintrag);
  }
  const liste = [...gruppen.values()].map(({ dokument, sammlung }) => {
    vervollstaendige(dokument, sammlung, heute);
    return dokument;
  });
  return liste.sort(reihenfolge);
}
