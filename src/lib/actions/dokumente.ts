"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import {
  dbFehler,
  fehler,
  ok,
  zugriffsFehler,
  type AktionsStatus,
} from "@/lib/actions/status";

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

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

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
    })
    .select("id, name")
    .single();

  if (error) {
    if (storagePfad) await supabase.storage.from("dokumente").remove([storagePfad]);
    return dbFehler(error);
  }

  await supabase.from("audit_events").insert({
    actor: `${profil.fullName} (${profil.role})`,
    aktion: "dokument.angelegt",
    ressource: "dokumente",
    ressource_id: data.id,
    metadata: { name: data.name, kategorie, datei: Boolean(storagePfad) },
  });

  const pfad = text(formData, "pfad");
  if (pfad.startsWith("/")) revalidatePath(pfad);

  return ok("ok.dokument", data.name);
}
