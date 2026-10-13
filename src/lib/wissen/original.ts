import type { SupabaseClient } from "@supabase/supabase-js";
import { istUploadQuelleId, UPLOAD_PRAEFIX } from "@/lib/wissen/upload-quelle";

// Original-PDF eines hochgeladenen Buchs, nur bis zur Freigabe (Migration 20261204000000).
//
// Der Browser liest die PDF selbst und schickt nur den Text. Damit die prüfende Person das Original öffnen kann, legt er die Datei zusätzlich in einen
// privaten Bucket. Die Datei gehört zum Dokument und lebt nur, solange es auf die Freigabe wartet: Bei Freigabe, Ablehnung, Löschen und Entfernen
// verschwinden Datei und Verweis (entferneOriginal). Ein Fehler dabei hält die Freigabe nie auf. Gelesen wird nur über eine kurzlebige signierte Adresse,
// die der Server nach der Rechteprüfung erzeugt (ki_assistent:manage).

export const ORIGINAL_BUCKET = "wissen-originale";
/** Wie das Bucket-Limit der Migration; das Gesamtlimit des Supabase-Projekts kann kleiner sein. */
export const ORIGINAL_MAX_BYTES = 524_288_000;
export const ORIGINAL_URL_SEKUNDEN = 600;

/** Pfad im Bucket: die 32 Hexzeichen der Quell-Kennung. Nur für Uploads (alles andere ergibt null). */
export function originalPfad(quelleId: string): string | null {
  return istUploadQuelleId(quelleId) ? `${quelleId.slice(UPLOAD_PRAEFIX.length)}.pdf` : null;
}

/** Eine PDF, nicht leer, nicht über dem Limit. Der Name entscheidet nicht über den Inhalt, der Bucket prüft den Typ zusätzlich. */
export function originalPlausibel(dateiname: string, groesse: number): boolean {
  return /\.pdf$/i.test(dateiname) && Number.isFinite(groesse) && groesse > 0 && groesse <= ORIGINAL_MAX_BYTES;
}

const sauber = (name: string) => name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);

export type OriginalFehlerCode = "keinUpload" | "ungueltig" | "keinDokument" | "nichtDa" | "speicher";

export class OriginalFehler extends Error {
  constructor(
    readonly code: OriginalFehlerCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/** Gibt es zu dieser Kennung ein wartendes Dokument (noch nicht entschieden)? Nur dazu wird ein Original angenommen. */
async function wartendesDokument(db: SupabaseClient, quelleId: string): Promise<boolean> {
  const { data, error } = await db.from("wissen_chunks").select("pruefstatus").eq("quelle_id", quelleId).limit(1);
  if (error) throw new OriginalFehler("speicher", error.message);
  const zeile = ((data ?? []) as unknown as { pruefstatus: string | null }[])[0];
  return zeile?.pruefstatus === "ungeprueft";
}

/** Schritt 1: eine signierte Adresse zum Hochladen. Das Dokument muss existieren und auf die Freigabe warten. */
export async function bereiteOriginalVor(db: SupabaseClient, quelleId: string, dateiname: string, groesse: number): Promise<{ pfad: string; token: string }> {
  const pfad = originalPfad(quelleId);
  if (!pfad) throw new OriginalFehler("keinUpload");
  if (!originalPlausibel(dateiname, groesse)) throw new OriginalFehler("ungueltig");
  if (!(await wartendesDokument(db, quelleId))) throw new OriginalFehler("keinDokument");
  const { data, error } = await db.storage.from(ORIGINAL_BUCKET).createSignedUploadUrl(pfad, { upsert: true });
  if (error || !data) throw new OriginalFehler("speicher", error?.message);
  return { pfad, token: data.token };
}

/** Schritt 2: nach dem Hochladen prüfen, dass die Datei da ist, und den Verweis ablegen. */
export async function bestaetigeOriginal(db: SupabaseClient, quelleId: string, dateiname: string, von: string | null): Promise<{ groesse: number }> {
  const pfad = originalPfad(quelleId);
  if (!pfad) throw new OriginalFehler("keinUpload");
  if (!(await wartendesDokument(db, quelleId))) throw new OriginalFehler("keinDokument");
  const { data, error } = await db.storage.from(ORIGINAL_BUCKET).list("", { search: pfad, limit: 5 });
  if (error) throw new OriginalFehler("speicher", error.message);
  const datei = (data ?? []).find((d) => d.name === pfad);
  const groesse = Number((datei?.metadata as { size?: number } | null | undefined)?.size ?? 0);
  if (!datei || groesse <= 0) throw new OriginalFehler("nichtDa");
  const { error: schreibFehler } = await db
    .from("wissen_original")
    .upsert({ quelle_id: quelleId, pfad, dateiname: sauber(dateiname) || pfad, groesse, abgelegt_von: von, abgelegt_am: new Date().toISOString() }, { onConflict: "quelle_id" });
  if (schreibFehler) {
    await db.storage.from(ORIGINAL_BUCKET).remove([pfad]).catch(() => undefined);
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
  const { data: adresse, error: urlFehler } = await db.storage.from(ORIGINAL_BUCKET).createSignedUrl(zeile.pfad, ORIGINAL_URL_SEKUNDEN);
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
    const { error } = await db.storage.from(ORIGINAL_BUCKET).remove([pfad]);
    if (error && !/not found|does not exist|Bucket/i.test(error.message)) console.error("[damicon] Original nicht entfernt:", error.message);
    const { error: zeileFehler } = await db.from("wissen_original").delete().eq("quelle_id", quelleId);
    if (zeileFehler && !/wissen_original|schema cache|does not exist/i.test(zeileFehler.message)) console.error("[damicon] Original-Verweis nicht entfernt:", zeileFehler.message);
  } catch (fehler) {
    console.error("[damicon] Original nicht entfernt:", fehler);
  }
}
