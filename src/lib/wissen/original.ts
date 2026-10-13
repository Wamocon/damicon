import type { SupabaseClient } from "@supabase/supabase-js";
import { bucket } from "@/lib/supabase/buckets";
import { GIB } from "@/lib/wissen/groesse";
import { istUploadQuelleId, UPLOAD_PRAEFIX } from "@/lib/wissen/upload-quelle";

// Original-PDF eines hochgeladenen Buchs, nur bis zur Freigabe (Migration 20261204000000).
//
// Der Browser liest die PDF selbst und schickt nur den Text. Damit die prüfende Person das Original öffnen kann, legt er die Datei zusätzlich in einen
// privaten Bucket (wiederaufnehmbarer Upload, TUS, mit der Sitzung der Administration). Die Datei gehört zum Dokument und lebt nur, solange es auf die
// Freigabe wartet: Bei Freigabe, Ablehnung, Löschen und Entfernen verschwinden Datei und Verweis (entferneOriginal). Ein Fehler dabei hält die Freigabe nie
// auf. Gelesen wird nur über eine kurzlebige signierte Adresse, die der Server nach der Rechteprüfung erzeugt (ki_assistent:manage).
//
// Grenzen: je Datei höchstens 1 GiB (Bucket-Limit der Migration, das globale Limit des Supabase-Projekts muss mindestens so hoch stehen) und für ALLE wartenden
// Originale zusammen höchstens 50 GiB, die Hälfte des im Pro-Plan enthaltenen Speichers; der Rest bleibt für Belege und Dokumente. Wer mehr hochladen will,
// lädt getrennt hoch: erst einen Teil, freigeben, dann den nächsten.

/** Der Bucket; in Preview-Umgebungen der eigene Zwilling mit der Endung -preview (buckets.ts, preview-umschreiben.mjs). */
export const originalBucket = (): string => bucket("wissen-originale");
export { GIB };
export const ORIGINAL_MAX_BYTES = GIB;
export const ORIGINAL_GESAMT_MAX_BYTES = 50 * GIB;
export const ORIGINAL_URL_SEKUNDEN = 600;

/** Pfad im Bucket: die 32 Hexzeichen der Quell-Kennung. Nur für Uploads (alles andere ergibt null). */
export function originalPfad(quelleId: string): string | null {
  return istUploadQuelleId(quelleId) ? `${quelleId.slice(UPLOAD_PRAEFIX.length)}.pdf` : null;
}

/** Eine PDF, nicht leer, nicht über dem Limit. Der Name entscheidet nicht über den Inhalt, der Bucket prüft den Typ zusätzlich. */
export function originalPlausibel(dateiname: string, groesse: number): boolean {
  return /\.pdf$/i.test(dateiname) && Number.isFinite(groesse) && groesse > 0 && groesse <= ORIGINAL_MAX_BYTES;
}

export interface PlatzPruefung {
  /** Passt die neue Auswahl zu dem, was schon wartet, unter die Obergrenze? */
  passt: boolean;
  wartend: number;
  neu: number;
  grenze: number;
}

/** Reine Regel: wartende Originale plus die neue Auswahl dürfen die Obergrenze nicht überschreiten. */
export function pruefePlatz(wartend: number, neu: number, grenze = ORIGINAL_GESAMT_MAX_BYTES): PlatzPruefung {
  const w = Math.max(0, Number.isFinite(wartend) ? wartend : 0);
  const n = Math.max(0, Number.isFinite(neu) ? neu : 0);
  return { passt: w + n <= grenze, wartend: w, neu: n, grenze };
}

const sauber = (name: string) => name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);

export type OriginalFehlerCode = "keinUpload" | "ungueltig" | "keinDokument" | "nichtDa" | "zuVoll" | "speicher";

export class OriginalFehler extends Error {
  constructor(
    readonly code: OriginalFehlerCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/** Summe der Größen aller wartenden Originale, optional ohne das eines Dokuments (das gerade ersetzt wird). */
export async function wartendeGroesse(db: SupabaseClient, ohneQuelle?: string): Promise<number> {
  const { data, error } = await db.from("wissen_original").select("quelle_id, groesse").limit(10_000);
  if (error) throw new OriginalFehler("speicher", error.message);
  return ((data ?? []) as unknown as { quelle_id: string; groesse: number | string }[])
    .filter((z) => z.quelle_id !== ohneQuelle)
    .reduce((summe, z) => summe + Number(z.groesse), 0);
}

/** Wie viel Platz ist noch, wenn `neuBytes` dazukommen? Für die Prüfung vor dem Start eines Uploads. */
export async function pruefeOriginalPlatz(db: SupabaseClient, neuBytes: number): Promise<PlatzPruefung> {
  return pruefePlatz(await wartendeGroesse(db), neuBytes);
}

/** Gibt es zu dieser Kennung ein wartendes Dokument (noch nicht entschieden)? Nur dazu wird ein Original angenommen. */
async function wartendesDokument(db: SupabaseClient, quelleId: string): Promise<boolean> {
  const { data, error } = await db.from("wissen_chunks").select("pruefstatus").eq("quelle_id", quelleId).limit(1);
  if (error) throw new OriginalFehler("speicher", error.message);
  const zeile = ((data ?? []) as unknown as { pruefstatus: string | null }[])[0];
  return zeile?.pruefstatus === "ungeprueft";
}

/**
 * Schritt 1: den Upload vorbereiten. Das Dokument muss existieren und auf die Freigabe warten, die Datei eine PDF in Grenzen sein, und es muss Platz
 * sein (alle wartenden Originale zusammen). Eine alte Datei zu diesem Dokument wird entfernt, damit der wiederaufnehmbare Upload sauber neu beginnt.
 * Den Upload selbst macht der Browser mit seiner Sitzung (Policy für die Administration auf storage.objects).
 */
export async function bereiteOriginalVor(db: SupabaseClient, quelleId: string, dateiname: string, groesse: number): Promise<{ pfad: string; bucket: string }> {
  const pfad = originalPfad(quelleId);
  if (!pfad) throw new OriginalFehler("keinUpload");
  if (!originalPlausibel(dateiname, groesse)) throw new OriginalFehler("ungueltig");
  if (!(await wartendesDokument(db, quelleId))) throw new OriginalFehler("keinDokument");
  if (!pruefePlatz(await wartendeGroesse(db, quelleId), groesse).passt) throw new OriginalFehler("zuVoll");
  const name = originalBucket();
  const { error } = await db.storage.from(name).remove([pfad]);
  if (error && !/not found|does not exist/i.test(error.message)) throw new OriginalFehler("speicher", error.message);
  await db.from("wissen_original").delete().eq("quelle_id", quelleId);
  return { pfad, bucket: name };
}

/** Schritt 2: nach dem Hochladen prüfen, dass die Datei da ist, und den Verweis ablegen. */
export async function bestaetigeOriginal(db: SupabaseClient, quelleId: string, dateiname: string, von: string | null): Promise<{ groesse: number }> {
  const pfad = originalPfad(quelleId);
  if (!pfad) throw new OriginalFehler("keinUpload");
  if (!(await wartendesDokument(db, quelleId))) throw new OriginalFehler("keinDokument");
  const name = originalBucket();
  const { data, error } = await db.storage.from(name).list("", { search: pfad, limit: 5 });
  if (error) throw new OriginalFehler("speicher", error.message);
  const datei = (data ?? []).find((d) => d.name === pfad);
  const groesse = Number((datei?.metadata as { size?: number } | null | undefined)?.size ?? 0);
  if (!datei || groesse <= 0) throw new OriginalFehler("nichtDa");
  const { error: schreibFehler } = await db
    .from("wissen_original")
    .upsert({ quelle_id: quelleId, pfad, dateiname: sauber(dateiname) || pfad, groesse, abgelegt_von: von, abgelegt_am: new Date().toISOString() }, { onConflict: "quelle_id" });
  if (schreibFehler) {
    await db.storage.from(name).remove([pfad]).catch(() => undefined);
    throw new OriginalFehler("speicher", schreibFehler.message);
  }
  return { groesse };
}

/** Eine kurzlebige Adresse zum Öffnen des Originals. Die Rechte prüft der Aufrufer. */
export async function originalAdresse(db: SupabaseClient, quelleId: string): Promise<{ url: string; dateiname: string; groesse: number }> {
  const { data, error } = await db.from("wissen_original").select("pfad, dateiname, groesse").eq("quelle_id", quelleId).limit(1);
  if (error) throw new OriginalFehler("speicher", error.message);
  const zeile = ((data ?? []) as unknown as { pfad: string; dateiname: string; groesse: number }[])[0];
  if (!zeile) throw new OriginalFehler("nichtDa");
  const { data: adresse, error: urlFehler } = await db.storage.from(originalBucket()).createSignedUrl(zeile.pfad, ORIGINAL_URL_SEKUNDEN);
  if (urlFehler || !adresse) throw new OriginalFehler("nichtDa", urlFehler?.message);
  return { url: adresse.signedUrl, dateiname: zeile.dateiname, groesse: Number(zeile.groesse) };
}

/**
 * Datei und Verweis entfernen (Freigabe, Ablehnung, Löschen, Entfernen). Fehler werden nur protokolliert: Sie dürfen die Entscheidung nie aufhalten.
 * Ohne Migration (Tabelle oder Bucket fehlen) ist das ein stiller Nichts-zu-tun-Fall.
 */
export async function entferneOriginal(db: SupabaseClient, quelleId: string): Promise<void> {
  const pfad = originalPfad(quelleId);
  if (!pfad) return;
  try {
    const { error } = await db.storage.from(originalBucket()).remove([pfad]);
    if (error && !/not found|does not exist|Bucket/i.test(error.message)) console.error("[damicon] Original nicht entfernt:", error.message);
    const { error: zeileFehler } = await db.from("wissen_original").delete().eq("quelle_id", quelleId);
    if (zeileFehler && !/wissen_original|schema cache|does not exist/i.test(zeileFehler.message)) console.error("[damicon] Original-Verweis nicht entfernt:", zeileFehler.message);
  } catch (fehler) {
    console.error("[damicon] Original nicht entfernt:", fehler);
  }
}
