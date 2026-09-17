"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import {
  dbFehler,
  fehler,
  ok,
  zugriffsFehler,
  type AktionsStatus,
} from "@/lib/actions/status";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";

// Dokumentenverwaltung (Meilenstein B). Die Datei ist optional: ein Dokument
// darf zuerst als Eintrag entstehen und die Datei spaeter bekommen - so
// arbeitet das Buero auch, wenn der Scan noch fehlt.

const kategorien = [
  "spritzmittelprotokoll",
  "esutd_nachweis",
  "liefervertrag",
  "foerderdossier",
  "zertifikat",
  "sonstiges",
] as const;

const statusWerte = ["gueltig", "prueflauf", "abgelaufen"] as const;
const maxDateigroesse = 16 * 1024 * 1024;

export async function dokumentAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("dokumente", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const name = text(formData, "name");
  const kategorie = text(formData, "kategorie");
  const status = text(formData, "status");

  if (!name || !(kategorien as readonly string[]).includes(kategorie)) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const datei = formData.get("datei");
  let storagePfad: string | null = null;

  if (datei instanceof File && datei.size > 0) {
    if (datei.size > maxDateigroesse) return fehler("fehler.zuGross");

    const endung = datei.name.split(".").pop()?.toLowerCase() ?? "pdf";
    storagePfad = `${kategorie}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${endung}`;

    const { error: uploadFehler } = await supabase.storage
      .from("dokumente")
      .upload(storagePfad, datei, { contentType: datei.type, upsert: false });

    if (uploadFehler) {
      console.error("[damicon] Upload fehlgeschlagen:", uploadFehler.message);
      return fehler("fehler.upload");
    }
  }

  // Anforderung 4.12: ein Nachweis kann direkt an ein Foerderdossier haengen.
  // Die Spalte samt Fremdschluessel gibt es seit 20260925000000, gefuellt hat
  // sie bisher nur der einmalige Backfill - ueber die Anwendung liess sich
  // kein Nachweis anhaengen.
  const dossierId = text(formData, "foerderdossier_id") || null;

  const { data, error } = await supabase
    .from("dokumente")
    .insert({
      name,
      kategorie: kategorie as (typeof kategorien)[number],
      bezug: text(formData, "bezug") || null,
      stand: text(formData, "stand") || null,
      status: ((statusWerte as readonly string[]).includes(status)
        ? status
        : "gueltig") as (typeof statusWerte)[number],
      storage_path: storagePfad,
      foerderdossier_id: dossierId,
    })
    .select("id, name")
    .single();

  if (error) {
    if (storagePfad) await supabase.storage.from("dokumente").remove([storagePfad]);
    return dbFehler(error);
  }

  await protokolliere(profil, "dokument.angelegt", "dokumente", data.id, {
    name: data.name,
    kategorie,
    datei: Boolean(storagePfad),
    foerderdossier_id: dossierId,
  });

  aktualisiere(formData);

  return ok("ok.dokument", data.name);
}

// Metadaten und Status eines Dokuments nachfuehren. Die UPDATE-Policy
// dokumente_update_buero (20260905120000) gab es von Anfang an - nur rief sie
// niemand auf: bis hierher liess sich ein einmal aufgenommenes Dokument weder
// umbenennen noch von "prueflauf" auf "gueltig" setzen. Die Datei selbst
// bleibt unangetastet (Ersetzen ist ein eigener Vorgang, siehe Modulnotiz).
export async function dokumentAendern(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("dokumente", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const name = text(formData, "name");
  const status = text(formData, "status");
  if (!id || !name || !(statusWerte as readonly string[]).includes(status)) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dokumente")
    .update({
      name,
      bezug: text(formData, "bezug") || null,
      stand: text(formData, "stand") || null,
      status: status as (typeof statusWerte)[number],
    })
    .eq("id", id)
    .select("id, name")
    .maybeSingle();

  if (error) return dbFehler(error);
  // Keine Zeile getroffen: die Policy laesst diese Rolle nicht an das Dokument.
  if (!data) return fehler("fehler.berechtigung");

  await protokolliere(profil, "dokument.geaendert", "dokumente", data.id, {
    name: data.name,
    status,
  });

  aktualisiere(formData);
  return ok("ok.dokumentGeaendert", data.name);
}
