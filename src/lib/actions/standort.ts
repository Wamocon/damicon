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
import { text, zahl, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";

// Verwaltungsoberflaeche der Standort-Hierarchie (Meilenstein B):
// Betrieb > Plantage > Feldparzelle > Reihengruppe > Reihenblock.
// Jede Aktion prueft zweifach - RBAC in der Anwendung, RLS in der Datenbank.

export async function plantageAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("standort", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const name = text(formData, "name");
  const betriebId = text(formData, "betrieb_id");
  if (!name || !betriebId) return fehler("fehler.eingabe");

  const typ = text(formData, "typ") === "nachbarbetrieb" ? "nachbarbetrieb" : "eigen";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plantagen")
    .insert({ betrieb_id: betriebId, name, ort: text(formData, "ort") || null, typ })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "plantage.angelegt", "plantagen", data.id, { name });
  aktualisiere(formData);
  return ok("ok.plantage", name);
}

export async function parzelleAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("standort", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const name = text(formData, "name");
  const plantageId = text(formData, "plantage_id");
  if (!name || !plantageId) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feldparzellen")
    .insert({
      plantage_id: plantageId,
      name,
      flaeche_ha: zahl(formData, "flaeche_ha"),
      sorte_id: text(formData, "sorte_id") || null,
    })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "parzelle.angelegt", "feldparzellen", data.id, { name });
  aktualisiere(formData);
  return ok("ok.parzelle", name);
}

export async function reihengruppeAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("standort", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const name = text(formData, "name");
  const parzelleId = text(formData, "feldparzelle_id");
  if (!name || !parzelleId) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reihengruppen")
    .insert({
      feldparzelle_id: parzelleId,
      name,
      spalierrichtung: text(formData, "spalierrichtung") === "o_w" ? "o_w" : "n_s",
    })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "reihengruppe.angelegt", "reihengruppen", data.id, {
    name,
  });
  aktualisiere(formData);
  return ok("ok.reihengruppe", name);
}

export async function reihenblockAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("reihenbloecke", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const code = text(formData, "code").toUpperCase();
  const gruppeId = text(formData, "reihengruppe_id");
  if (!code || !gruppeId) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reihenbloecke")
    .insert({
      reihengruppe_id: gruppeId,
      code,
      sorte_id: text(formData, "sorte_id") || null,
      laenge_m: zahl(formData, "laenge_m"),
      status: "bepflanzt",
    })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "reihenblock.angelegt", "reihenbloecke", data.id, {
    code,
  });
  aktualisiere(formData);
  return ok("ok.reihenblock", code);
}
