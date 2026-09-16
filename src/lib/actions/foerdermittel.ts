"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { foerderdossierStatus, type FoerderdossierStatus } from "@/lib/domain/foerdermittel";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// Foerdermitteldossier (Anforderung 4.12). requirePermission() ist die erste
// Verteidigungslinie, RLS (foerderdossiers_insert_buero/-update_buero,
// Migration 20260925000000) die zweite.

function protokolliere(profil: SessionProfile, aktion: string, ressourceId: string, titel: string) {
  return protokolliereBasis(profil, aktion, "foerdermittel", ressourceId, { titel });
}

export async function dossierAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("foerdermittel", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const portal = text(formData, "portal");
  const titel = text(formData, "titel");
  const antragsnummer = text(formData, "antragsnummer") || null;
  const fristAm = text(formData, "frist_am") || null;

  if (!portal || !titel) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("foerderdossiers")
    .insert({ portal, titel, antragsnummer, frist_am: fristAm })
    .select("id, titel")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "foerdermittel.dossier_angelegt", data.id, data.titel);
  aktualisiere(formData);
  return ok("ok.foerderdossier", data.titel);
}

export async function dossierAktualisieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("foerdermittel", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const status = text(formData, "status");
  const fristAm = text(formData, "frist_am") || null;
  const eingereichtAm = text(formData, "eingereicht_am") || null;
  const notizen = text(formData, "notizen") || null;

  if (!id || !(foerderdossierStatus as readonly string[]).includes(status)) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("foerderdossiers")
    .update({
      status: status as FoerderdossierStatus,
      frist_am: fristAm,
      eingereicht_am: eingereichtAm,
      notizen,
    })
    .eq("id", id)
    .select("id, titel")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "foerdermittel.dossier_aktualisiert", data.id, data.titel);
  aktualisiere(formData);
  return ok("ok.foerderdossierStatus", data.titel);
}
