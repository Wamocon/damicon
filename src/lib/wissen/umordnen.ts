import type { SupabaseClient } from "@supabase/supabase-js";
import { UploadFehler } from "@/lib/wissen/hochladen";
import {
  clusterPasst,
  istCluster,
  istQuellenart,
  istTextgrundlage,
  nutzungFuer,
  pruefenBis,
  QUELLENART_INFO,
  standardStufe,
  type Quellenart,
} from "@/lib/wissen/quellenart";
import { BEREICH_WERT, bereichSchluessel, UPLOAD_BEREICHE, type UploadBereich } from "@/lib/wissen/upload-konstanten";
import { UPLOAD_QUELLE, UPLOAD_QUELLE_MUSTER } from "@/lib/wissen/upload-quelle";

// Einordnung eines Dokuments nachtraeglich aendern: Cluster, Bereich, Quellenart und Textgrundlage. Dieselben Regeln wie beim Hochladen (zulaessige
// Kombination, Cluster passt zur Art, Link bei Internetquelle und Forum), dazu das Vier-Augen-Prinzip: Bei einem FREIGEGEBENEN Upload darf die
// Einordnung nicht die Person aendern, die ihn hochgeladen hat, wenn sich dadurch Quellenart, Stufe, Bereich oder Textgrundlage aendern (der Waechter
// der Datenbank, Migration 20261129000000, prueft dasselbe noch einmal). Die Stufe folgt der Quellenart, die Wiedervorlage einer freigegebenen
// Quelle der neuen Art (nach pruefenBis).
//
// Gilt fuer hochgeladene Dokumente und fuer den Bestand. Der Bestand hat keine Pruefung, bekommt auch keine Wiedervorlage und kann von jeder
// Administration geaendert werden.

export interface Umordnung {
  /** Schluessel des Bereichs (recht, steuer ...) oder, bei Bestand mit Korpusbereich (amtlich, fachquellen ...), der unveraenderte gespeicherte Wert. */
  bereich?: string;
  quellenart?: string;
  cluster?: string;
  textgrundlage?: string;
}

export type SchluesselSpalte = "quelle_id" | "pfad" | "id";
export interface UmordnungsZiel {
  schluessel: string;
  schluesselSpalte: SchluesselSpalte;
}

export interface Einordnung {
  bereich: string;
  quellenart: string | null;
  cluster: string | null;
  textgrundlage: string | null;
  stufe: number | null;
  pruefenBis: string | null;
}

export interface UmordnungsErgebnis {
  titel: string | null;
  upload: boolean;
  pruefstatus: string | null;
  vorher: Einordnung;
  nachher: Einordnung;
  abschnitte: number;
}

const SEITE = 1000;
const STAPEL = 100; // Kennungen je Anweisung: mehr passt nicht in die Adresse ("URI too long")

interface ZeileKopf {
  titel: string | null;
  bereich: string;
  quellenart: string | null;
  cluster: string | null;
  textgrundlage: string | null;
  autoritaetsstufe: number | null;
  pruefstatus: string;
  pruefen_bis: string | null;
  url: string | null;
  extra: { hochgeladen_von?: string } | null;
}

/**
 * Aendert die Einordnung eines Dokuments. Wirft UploadFehler: nichtGefunden, nichtLoeschbar-aehnlich gibt es hier nicht; zulaessig sind
 * eingabe, quellenartGesperrt, clusterPasstNicht, urlFehlt, selbstUmordnen (Vier-Augen) und keineAenderung.
 */
export async function ordneUm(db: SupabaseClient, ziel: UmordnungsZiel, aenderung: Umordnung, wer: { id: string }, jetzt: Date = new Date()): Promise<UmordnungsErgebnis> {
  if (!ziel.schluessel || !["quelle_id", "pfad", "id"].includes(ziel.schluesselSpalte)) throw new UploadFehler("eingabe");
  const spalte = ziel.schluesselSpalte;

  // Das Dokument lesen: eine Zeile fuer die Angaben, dazu Zahl aller Zeilen und Zahl der Upload-Zeilen
  const { data: kopfZeilen, error: kopfFehler } = await db
    .from("wissen_chunks")
    .select("titel, bereich, quellenart, cluster, textgrundlage, autoritaetsstufe, pruefstatus, pruefen_bis, url, extra")
    .eq(spalte, ziel.schluessel)
    .limit(1);
  if (kopfFehler) throw new UploadFehler("speichern", undefined, new Error(kopfFehler.message));
  const kopf = (kopfZeilen ?? [])[0] as ZeileKopf | undefined;
  if (!kopf) throw new UploadFehler("nichtGefunden");
  const { count: alle, error: zaehlFehler } = await db.from("wissen_chunks").select("id", { count: "exact", head: true }).eq(spalte, ziel.schluessel);
  if (zaehlFehler) throw new UploadFehler("speichern", undefined, new Error(zaehlFehler.message));
  const { count: uploads, error: uploadFehler } = await db
    .from("wissen_chunks")
    .select("id", { count: "exact", head: true })
    .eq(spalte, ziel.schluessel)
    .like("quelle_id", UPLOAD_QUELLE_MUSTER)
    .eq("extra->>quelle", UPLOAD_QUELLE);
  if (uploadFehler) throw new UploadFehler("speichern", undefined, new Error(uploadFehler.message));
  const istUpload = (alle ?? 0) > 0 && uploads === alle;
  // Gemischte Zeilen (ein Teil Upload, ein Teil nicht) gibt es nicht; kommt es vor, fasst dieser Weg das Dokument nicht an.
  if ((uploads ?? 0) > 0 && !istUpload) throw new UploadFehler("eingabe");

  const vorher: Einordnung = {
    bereich: kopf.bereich,
    quellenart: kopf.quellenart,
    cluster: kopf.cluster,
    textgrundlage: kopf.textgrundlage,
    stufe: kopf.autoritaetsstufe,
    pruefenBis: kopf.pruefen_bis,
  };

  // --- neue Werte: nur, was angegeben ist, aendert sich ---
  let bereichNeu = kopf.bereich;
  if (aenderung.bereich !== undefined && aenderung.bereich !== "") {
    if ((UPLOAD_BEREICHE as readonly string[]).includes(aenderung.bereich)) bereichNeu = BEREICH_WERT[aenderung.bereich as UploadBereich];
    else if (aenderung.bereich !== kopf.bereich) throw new UploadFehler("eingabe"); // ein Korpusbereich bleibt nur, wie er ist
  }
  const artRoh = aenderung.quellenart ?? kopf.quellenart ?? "";
  if (artRoh !== "" && !istQuellenart(artRoh)) throw new UploadFehler("eingabe");
  const art: Quellenart | null = artRoh === "" ? null : (artRoh as Quellenart);
  const clusterNeu = aenderung.cluster !== undefined && aenderung.cluster !== "" ? aenderung.cluster : kopf.cluster;
  if (clusterNeu !== null && !istCluster(clusterNeu)) throw new UploadFehler("eingabe");
  const textNeu = aenderung.textgrundlage !== undefined && aenderung.textgrundlage !== "" ? aenderung.textgrundlage : (kopf.textgrundlage ?? "original");
  if (!istTextgrundlage(textNeu)) throw new UploadFehler("eingabe");

  // --- Regeln wie beim Hochladen ---
  if (art) {
    if (nutzungFuer(bereichSchluessel(bereichNeu), art) === "nein") throw new UploadFehler("quellenartGesperrt");
    if (clusterNeu && !clusterPasst(art, clusterNeu)) throw new UploadFehler("clusterPasstNicht");
    if (QUELLENART_INFO[art].urlPflicht && !/^https?:\/\//i.test((kopf.url ?? "").trim())) throw new UploadFehler("urlFehlt");
  }

  const artGeaendert = art !== null && art !== kopf.quellenart;
  const stufeNeu = artGeaendert ? standardStufe(art) : kopf.autoritaetsstufe;
  const wirkt = artGeaendert || bereichNeu !== kopf.bereich || textNeu !== (kopf.textgrundlage ?? "original");
  const aendertAlles = artGeaendert || bereichNeu !== kopf.bereich || textNeu !== (kopf.textgrundlage ?? "original") || clusterNeu !== kopf.cluster;
  if (!aendertAlles) throw new UploadFehler("keineAenderung");

  // --- Vier-Augen-Prinzip bei einem freigegebenen Upload ---
  const freigegebenerUpload = istUpload && kopf.pruefstatus === "freigegeben";
  if (freigegebenerUpload && wirkt && kopf.extra?.hochgeladen_von === wer.id) throw new UploadFehler("selbstUmordnen");

  const nachher: Einordnung = {
    bereich: bereichNeu,
    quellenart: art,
    cluster: clusterNeu,
    textgrundlage: textNeu,
    stufe: stufeNeu,
    // Die Wiedervorlage haengt an der Quellenart: nur bei einer freigegebenen Quelle und nur, wenn sich die Art aendert
    pruefenBis: freigegebenerUpload && artGeaendert && art ? pruefenBis(art, jetzt) : kopf.pruefen_bis,
  };

  const set: Record<string, unknown> = {
    bereich: bereichNeu,
    quellenart: art,
    cluster: clusterNeu,
    textgrundlage: textNeu,
    autoritaetsstufe: stufeNeu,
  };
  if (freigegebenerUpload && artGeaendert) set.pruefen_bis = nachher.pruefenBis;
  // Der Waechter verlangt bei wirksamer Aenderung eines freigegebenen Uploads die aendernde Person
  if (freigegebenerUpload && wirkt) {
    set.geprueft_von = wer.id;
    set.geprueft_am = jetzt.toISOString();
  }

  // --- Schreiben: in Stapeln nach Kennung (Adresslaenge) ---
  const ids: string[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await db.from("wissen_chunks").select("id").eq(spalte, ziel.schluessel).order("id").range(von, von + SEITE - 1);
    if (error) throw new UploadFehler("speichern", undefined, new Error(error.message));
    const seite = (data ?? []) as { id: string }[];
    ids.push(...seite.map((z) => z.id));
    if (seite.length < SEITE) break;
  }
  let geschrieben = 0;
  for (let i = 0; i < ids.length; i += STAPEL) {
    const { count, error } = await db.from("wissen_chunks").update(set, { count: "exact" }).in("id", ids.slice(i, i + STAPEL));
    if (error) throw new UploadFehler("speichern", undefined, new Error(error.message));
    geschrieben += count ?? 0;
  }
  return { titel: kopf.titel, upload: istUpload, pruefstatus: kopf.pruefstatus, vorher, nachher, abschnitte: geschrieben };
}
