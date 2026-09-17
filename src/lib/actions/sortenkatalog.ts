"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";
import { sorteTypen } from "@/lib/domain/sortenkatalog";

// Sorten- und Kontingentkatalog. requirePermission() auf "sortenkatalog" -
// dieselbe Ressource, unter der schon heute sorten_insert_leitung/
// sorten_update_leitung stehen (Migration 20260905120000, rbac: nur
// betriebsleitung hat crud("sortenkatalog"), admin ueber all(resource)).
// Kontingente teilen sich dieselbe Ressource, da beide Bausteine fachlich
// ein einziges Modul bilden (siehe Modultitel "Sorten- UND Kontingentkatalog").

function protokolliere(profil: SessionProfile, aktion: string, ressourceId: string | null) {
  return protokolliereBasis(profil, aktion, "sortenkatalog", ressourceId);
}

export async function sorteErstellen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("sortenkatalog", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const name = text(formData, "name");
  const typ = text(formData, "typ");
  const erntefenster = text(formData, "erntefenster");
  const schaleG = text(formData, "schale_g");
  if (!name || !typ) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sorten")
    .insert({
      name,
      typ: typ as (typeof sorteTypen)[number],
      erntefenster: erntefenster || null,
      schale_g: schaleG ? Number(schaleG) : null,
    })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "sorte.erstellt", data.id);
  aktualisiere(formData);
  return ok("ok.sorteErstellt");
}

export async function sorteAktualisieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("sortenkatalog", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const name = text(formData, "name");
  const typ = text(formData, "typ");
  const erntefenster = text(formData, "erntefenster");
  const schaleG = text(formData, "schale_g");
  if (!id || !name || !typ) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase
    .from("sorten")
    .update({
      name,
      typ: typ as (typeof sorteTypen)[number],
      erntefenster: erntefenster || null,
      schale_g: schaleG ? Number(schaleG) : null,
    })
    .eq("id", id);

  if (error) return dbFehler(error);

  await protokolliere(profil, "sorte.aktualisiert", id);
  aktualisiere(formData);
  return ok("ok.sorteAktualisiert");
}

export async function kontingentErstellen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("sortenkatalog", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const kundeId = text(formData, "b2b_kunde_id");
  const sorteId = text(formData, "sorte_id");
  const saison = text(formData, "saison");
  const mengeKg = text(formData, "menge_kg");
  if (!kundeId || !sorteId || !mengeKg) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kontingente")
    .insert({
      b2b_kunde_id: kundeId,
      sorte_id: sorteId,
      saison: saison || null,
      menge_kg: Number(mengeKg),
    })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "kontingent.erstellt", data.id);
  aktualisiere(formData);
  return ok("ok.kontingentErstellt");
}

export async function kontingentMengeAktualisieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("sortenkatalog", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const mengeKg = text(formData, "menge_kg");
  if (!id || !mengeKg) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase
    .from("kontingente")
    .update({ menge_kg: Number(mengeKg) })
    .eq("id", id);

  if (error) return dbFehler(error);

  await protokolliere(profil, "kontingent.menge_aktualisiert", id);
  aktualisiere(formData);
  return ok("ok.kontingentAktualisiert");
}
