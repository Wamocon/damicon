"use server";

import { createClient } from "@/lib/supabase/server";
import { bucket } from "@/lib/supabase/buckets";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { istVideoPfad, istVideoSprache, pruefeVideoDatei, videoPfad, type VideoEndung, type VideoSprache } from "@/lib/domain/schulungsvideos";
import { istUuid } from "@/lib/utils";

// Videodateien der Schulungsvideos (Migration 20261208130000). Der Upload laeuft wie bei den Originalen der Wissensbasis direkt vom Browser (TUS, mit der
// Sitzung der Person; die Policy auf storage.objects erlaubt das Schreiben nur Administration und Betriebsleitung). Hier laufen die beiden Schritte drumherum:
// vorbereiten (Rechte, Datei und Pfad pruefen) und bestaetigen (die Datei ist da, den Verweis ablegen, die alte Datei entfernen).

export type VideoCode = "zugriff" | "ungueltig" | "typ" | "groesse" | "nichtDa" | "speicher" | "unbekannt";
export type VideoVorbereitung = { ok: true; bucket: string; pfad: string; mime: string } | { ok: false; code: VideoCode };
export type VideoBestaetigung = { ok: true } | { ok: false; code: VideoCode };

const bereinigt = (name: string) => name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);

async function berechtigter(): Promise<SessionProfile | null> {
  try {
    return await requirePermission("schulungen", "update");
  } catch {
    return null;
  }
}

/** Schritt 1: Rechte, Video und Datei pruefen und den Pfad nennen, unter dem der Browser hochlaedt. */
export async function videoDateiVorbereiten(videoId: string, sprache: string, dateiname: string, groesse: number): Promise<VideoVorbereitung> {
  if (!(await berechtigter())) return { ok: false, code: "zugriff" };
  if (!istUuid(videoId) || !istVideoSprache(sprache)) return { ok: false, code: "ungueltig" };
  const pruefung = pruefeVideoDatei(dateiname, groesse);
  if (!pruefung.ok) return { ok: false, code: pruefung.grund };

  const supabase = await createClient();
  const { data, error } = await supabase.from("schulungsvideos").select("id").eq("id", videoId).maybeSingle();
  if (error) return { ok: false, code: "speicher" };
  if (!data) return { ok: false, code: "ungueltig" };
  return { ok: true, bucket: bucket("schulungsvideos"), pfad: videoPfad(videoId, sprache, pruefung.endung as VideoEndung, Date.now()), mime: pruefung.mime };
}

/** Schritt 2: nach dem Hochladen pruefen, dass die Datei da ist, den Verweis ablegen und die ersetzte Datei entfernen. */
export async function videoDateiBestaetigen(videoId: string, sprache: string, pfad: string, dateiname: string): Promise<VideoBestaetigung> {
  const profil = await berechtigter();
  if (!profil) return { ok: false, code: "zugriff" };
  if (!istUuid(videoId) || !istVideoSprache(sprache) || !istVideoPfad(pfad, videoId, sprache)) return { ok: false, code: "ungueltig" };

  const supabase = await createClient();
  const name = pfad.slice(pfad.indexOf("/") + 1);
  const { data: liste, error: listenFehler } = await supabase.storage.from(bucket("schulungsvideos")).list(videoId, { search: name, limit: 5 });
  if (listenFehler) return { ok: false, code: "speicher" };
  const datei = (liste ?? []).find((d) => d.name === name);
  const groesse = Number((datei?.metadata as { size?: number } | null | undefined)?.size ?? 0);
  if (!datei || groesse <= 0) return { ok: false, code: "nichtDa" };

  const { data: vorhanden, error: leseFehler } = await supabase.from("schulungsvideo_dateien").select("id, storage_path").eq("video_id", videoId).eq("sprache", sprache).maybeSingle();
  if (leseFehler) return { ok: false, code: "speicher" };

  // Kein upsert: die Spalten video_id und sprache sind fuer die Rolle nicht aenderbar (Spaltenrechte), ein Update nennt nur die uebrigen.
  const schreibFehler = vorhanden
    ? (await supabase.from("schulungsvideo_dateien").update({ storage_path: pfad, dateiname: bereinigt(dateiname) || name, groesse_bytes: groesse, hochgeladen_von: profil.id }).eq("id", vorhanden.id)).error
    : (await supabase.from("schulungsvideo_dateien").insert({ video_id: videoId, sprache, storage_path: pfad, dateiname: bereinigt(dateiname) || name, groesse_bytes: groesse, hochgeladen_von: profil.id })).error;
  if (schreibFehler) {
    console.error("[damicon] Verweis auf Videodatei ablegen fehlgeschlagen:", schreibFehler.message);
    await supabase.storage.from(bucket("schulungsvideos")).remove([pfad]).catch(() => undefined);
    return { ok: false, code: "speicher" };
  }
  if (vorhanden && vorhanden.storage_path !== pfad) {
    // Die ersetzte Datei: ein Fehler beim Entfernen laesst nur eine Datei ohne Verweis stehen, er haelt den Upload nicht auf.
    await supabase.storage.from(bucket("schulungsvideos")).remove([vorhanden.storage_path]).catch(() => undefined);
  }

  await protokolliere(profil, "schulungsvideo.datei_gesetzt", "schulungen", videoId, { sprache: sprache as VideoSprache, groesse_bytes: groesse, ersetzt: Boolean(vorhanden) });
  return { ok: true };
}

/** Eine Videodatei entfernen (Knopf in der Liste). Die Datei im Speicher und der Verweis verschwinden. */
export async function videoDateiEntfernen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("schulungen", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }
  const id = text(formData, "id");
  if (!istUuid(id)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase.from("schulungsvideo_dateien").select("id, video_id, sprache, storage_path").eq("id", id).maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.berechtigung");

  const { error: loeschFehler } = await supabase.from("schulungsvideo_dateien").delete().eq("id", id);
  if (loeschFehler) return dbFehler(loeschFehler);
  await supabase.storage.from(bucket("schulungsvideos")).remove([data.storage_path]).catch(() => undefined);

  await protokolliere(profil, "schulungsvideo.datei_entfernt", "schulungen", data.video_id, { sprache: data.sprache });
  aktualisiere(formData);
  return ok("ok.videoEntfernt");
}
