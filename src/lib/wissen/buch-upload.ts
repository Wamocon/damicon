import type { Role } from "@/lib/rbac";
import { chunkiere } from "@/lib/wissen/chunker";
import {
  baueDokument,
  dateityp,
  einbettenUndSchreiben,
  erlaubteRollen,
  istBereich,
  MAX_CHUNKS,
  normalisiereUrl,
  pruefeUploadUmgebung,
  UploadFehler,
  ZEITBUDGET_MS,
  type UploadAbhaengigkeiten,
  type UploadMetadaten,
} from "@/lib/wissen/hochladen";
import { bewerteText, type Guete } from "@/lib/wissen/textguete";
import {
  clusterPasst,
  istCluster,
  istQuellenart,
  istTextgrundlage,
  nutzungFuer,
  QUELLENART_INFO,
  typischerClusterVon,
  type Cluster,
  type Quellenart,
  type Textgrundlage,
} from "@/lib/wissen/quellenart";
import { MAX_TITEL } from "@/lib/wissen/upload-konstanten";
import { uploadQuelleId } from "@/lib/wissen/upload-quelle";

// Buch-Upload: lange Dokumente (Buecher, OCR-PDF) in Paketen. Der Browser holt den Text aus der Datei (buch-pdf.ts), teilt ihn
// (buch-text.ts) und schickt ihn Paket fuer Paket; der Server nimmt jedes Paket wie einen kleinen Upload (zerlegen, einbetten,
// schreiben, Wortgewichte nachfuehren). So gibt es weder eine Dateigroessen- noch eine Abschnittsgrenze je Dokument, und jede Anfrage
// bleibt weit unter dem Zeitbudget von 60 Sekunden und unter den Plattformgrenzen.
//
// Zustand: Es gibt keine Statusspalte. Jede Zeile merkt sich ihre Paketnummer und die Zahl aller Pakete (extra.paket, pakete_gesamt).
// Fehlt ein Paket, weil die Verbindung abbrach, gilt das Dokument als UNVOLLSTAENDIG: Die Liste zeigt es so, und freigeben laesst es sich
// nicht (freigabe.ts). Wer ein unvollstaendiges Dokument loescht, entfernt es samt Wortgewichten (loeschen.ts) und laedt neu.
// Jedes Paket ist eine eigene Anfrage; ein Fehler bei einem Paket raeumt NICHT die Pakete davor ab (aufraeumen: false), das tut
// wissenBuchAbbrechen, weil nur das Loeschen die Wortgewichte sauber zurueckrechnet.
//
// Wie der normale Upload bleibt jedes Dokument UNGEPRUEFT, bis eine zweite Person es freigibt (Vier-Augen-Prinzip).

export const MAX_PAKET_ZEICHEN = 120_000;
export const MAX_PAKETE = 500;

export interface BuchKopf {
  titel: string;
  bereich: string;
  rollen: readonly string[];
  /** Name der Originaldatei (nur Endung und Anzeige; die Datei selbst kommt nie an). */
  dateiname: string;
  /** SHA-256 (Hex) des vereinheitlichten GANZEN Textes, vom Browser gebildet: Daraus entsteht die Kennung des Dokuments. */
  hash: string;
  quellenart: string;
  cluster?: string;
  textgrundlage?: string;
  url?: string;
  /** Wie viele Pakete der Browser schicken wird und wie viele Zeichen der Text hat (Plausibilitaet und Unvollstaendigkeit). */
  pakete: number;
  zeichen: number;
}

export interface PaketEingabe extends BuchKopf {
  /** Nummer dieses Pakets, 1 bis pakete. */
  nr: number;
  text: string;
}

export interface BuchBasis {
  meta: UploadMetadaten;
  quelleId: string;
}

/** Prueft den Kopf wie der normale Upload seine Eingabe. Wirft ausschliesslich UploadFehler. */
export function pruefeBuchKopf(k: BuchKopf, hochgeladenVon: { id: string; name: string | null }, jetzt: Date): BuchBasis {
  const titel = (k.titel ?? "").trim();
  if (!titel || titel.length > MAX_TITEL || !istBereich(k.bereich)) throw new UploadFehler("eingabe");
  if (typeof k.dateiname !== "string" || !dateityp(k.dateiname)) throw new UploadFehler("dateityp");
  if (typeof k.hash !== "string" || !/^[0-9a-f]{64}$/.test(k.hash)) throw new UploadFehler("eingabe");
  if (!Number.isInteger(k.pakete) || k.pakete < 1 || k.pakete > MAX_PAKETE) throw new UploadFehler("eingabe");
  if (!Number.isInteger(k.zeichen) || k.zeichen < 1 || k.zeichen > MAX_PAKETE * MAX_PAKET_ZEICHEN) throw new UploadFehler("eingabe");
  if (!istQuellenart(k.quellenart)) throw new UploadFehler("eingabe");
  const quellenart: Quellenart = k.quellenart;
  const clusterRoh = k.cluster?.trim() ?? "";
  if (clusterRoh && !istCluster(clusterRoh)) throw new UploadFehler("eingabe");
  const cluster: Cluster = istCluster(clusterRoh) ? clusterRoh : typischerClusterVon(quellenart)!;
  if (!clusterPasst(quellenart, cluster)) throw new UploadFehler("clusterPasstNicht");
  const textgrundlage = k.textgrundlage?.trim() ? k.textgrundlage.trim() : "original";
  if (!istTextgrundlage(textgrundlage)) throw new UploadFehler("eingabe");
  if (nutzungFuer(k.bereich, quellenart) === "nein") throw new UploadFehler("quellenartGesperrt");
  const url = normalisiereUrl(k.url);
  if (QUELLENART_INFO[quellenart].urlPflicht && !url) throw new UploadFehler("urlFehlt");

  const quelleId = uploadQuelleId(k.hash);
  const meta: UploadMetadaten = {
    titel,
    bereich: k.bereich,
    dateiname: k.dateiname,
    typ: "txt", // der Text ist schon gelesen; ein Markdown-Frontmatter gibt es hier nicht
    hash: k.hash,
    rollen: erlaubteRollen(k.rollen ?? []) as Role[],
    hochgeladenVon,
    quellenart,
    cluster,
    textgrundlage: textgrundlage as Textgrundlage,
    url,
    zeitpunkt: jetzt.toISOString(),
  };
  return { meta, quelleId };
}

/** Beginn eines Buchs: Umgebung und Kopf pruefen, Dublette erkennen. Schreibt nichts. */
export async function starteBuch(
  k: BuchKopf,
  hochgeladenVon: { id: string; name: string | null },
  d: UploadAbhaengigkeiten,
): Promise<{ quelleId: string }> {
  pruefeUploadUmgebung(d.umgebung ?? process.env, d.schema);
  const { quelleId } = pruefeBuchKopf(k, hochgeladenVon, d.jetzt?.() ?? new Date());
  const vorhanden = await d.speicher.findeQuelle(quelleId).catch((u) => {
    throw new UploadFehler("speichern", undefined, u);
  });
  // Auch ein unvollstaendiges Dokument gilt als vorhanden: Es wird in der Liste geloescht, danach geht der neue Versuch.
  if (vorhanden) throw new UploadFehler("doppelt", vorhanden.titel ?? k.titel);
  return { quelleId };
}

export interface PaketErgebnis {
  chunks: number;
  quelleId: string;
  guete: Guete;
}

/** Ein Paket eines Buchs: zerlegen, einbetten, schreiben, Wortgewichte nachfuehren. Wirft ausschliesslich UploadFehler. */
export async function ladePaket(
  p: PaketEingabe,
  hochgeladenVon: { id: string; name: string | null },
  d: UploadAbhaengigkeiten,
): Promise<PaketErgebnis> {
  pruefeUploadUmgebung(d.umgebung ?? process.env, d.schema);
  const uhr = d.jetztMs ?? Date.now;
  const beginn = uhr();
  const budget = d.zeitbudgetMs ?? ZEITBUDGET_MS;

  const { meta, quelleId } = pruefeBuchKopf(p, hochgeladenVon, d.jetzt?.() ?? new Date());
  if (!Number.isInteger(p.nr) || p.nr < 1 || p.nr > p.pakete) throw new UploadFehler("eingabe");
  if (typeof p.text !== "string" || p.text.trim().length === 0) throw new UploadFehler("leer");
  if (p.text.length > MAX_PAKET_ZEICHEN) throw new UploadFehler("zuGross");

  // Die Qualitaet rechnet der Server selbst aus dem Text dieses Pakets; was der Browser dazu sagt, zaehlt nicht.
  const guete = bewerteText(p.text, false);
  const paketMeta: UploadMetadaten = {
    ...meta,
    dateiname: `${p.dateiname}#${String(p.nr).padStart(4, "0")}`,
    paket: { nr: p.nr, gesamt: p.pakete },
    guete: { note: guete.note, hinweise: guete.hinweise },
  };
  const dok = baueDokument(p.text, paketMeta);
  // Eigene Kennung je Paket: aus chunk_id entstehen die stabilen Abschnitts-IDs, und zwei Pakete duerfen nicht dieselben bekommen.
  dok.meta.chunk_id = `${quelleId}#${p.nr}`;
  const chunks = chunkiere(dok);
  if (chunks.length === 0) throw new UploadFehler("leer");
  if (chunks.length > MAX_CHUNKS) throw new UploadFehler("zuLang", String(MAX_CHUNKS));

  await einbettenUndSchreiben(chunks, paketMeta, d, { beginn, budget, quelleId, aufraeumen: false });
  return { chunks: chunks.length, quelleId, guete };
}
