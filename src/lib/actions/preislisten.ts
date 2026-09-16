"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";
import { kundengruppen } from "@/lib/domain/vorbestellungen";

// Preislisten-Verwaltung und Kundengruppen-Zuordnung (Anforderung 5.1/5.2,
// Migration 20261011000000). requirePermission() auf "preislisten" - eine
// eigene Ressource statt einer Mitnutzung von "b2b_portal" (kunde/erzeuger
// haben dort laut rbac.ts view/create/update, wuerden also sonst auch
// Preislisten anlegen/aendern koennen).

function protokolliere(profil: SessionProfile, aktion: string, ressourceId: string | null) {
  return protokolliereBasis(profil, aktion, "preislisten", ressourceId);
}

export async function preisListeErstellen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("preislisten", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const name = text(formData, "name");
  const gueltigAb = text(formData, "gueltig_ab");
  const gueltigBis = text(formData, "gueltig_bis");
  const kundengruppe = text(formData, "kundengruppe");
  if (!name || !gueltigAb) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preislisten")
    .insert({
      name,
      gueltig_ab: gueltigAb,
      gueltig_bis: gueltigBis || null,
      kundengruppe: (kundengruppe || null) as (typeof kundengruppen)[number] | null,
    })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "preisliste.erstellt", data.id);
  aktualisiere(formData);
  return ok("ok.preislisteErstellt");
}

export async function preislistenPositionHinzufuegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("preislisten", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const preislisteId = text(formData, "preisliste_id");
  const sorteId = text(formData, "sorte_id");
  const preisTengeKg = text(formData, "preis_tenge_kg");
  const minMengeKg = text(formData, "min_menge_kg");
  if (!preislisteId || !sorteId || !preisTengeKg) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase.from("preislisten_positionen").insert({
    preisliste_id: preislisteId,
    sorte_id: sorteId,
    preis_tenge_kg: Number(preisTengeKg),
    min_menge_kg: minMengeKg ? Number(minMengeKg) : 0,
  });

  if (error) return dbFehler(error);

  await protokolliere(profil, "preisliste.position_hinzugefuegt", preislisteId);
  aktualisiere(formData);
  return ok("ok.positionHinzugefuegt");
}

export async function preislistenPositionLoeschen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("preislisten", "delete");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase.from("preislisten_positionen").delete().eq("id", id);
  if (error) return dbFehler(error);

  await protokolliere(profil, "preisliste.position_geloescht", id);
  aktualisiere(formData);
  return ok("ok.positionGeloescht");
}

export async function preisListeAktivSchalten(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("preislisten", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const naechsterWert = text(formData, "naechster_wert");
  if (!id || !naechsterWert) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase
    .from("preislisten")
    .update({ aktiv: naechsterWert === "true" })
    .eq("id", id);

  if (error) return dbFehler(error);

  await protokolliere(profil, "preisliste.aktiv_geschaltet", id);
  aktualisiere(formData);
  return ok("ok.preislisteAktualisiert");
}

export async function kundeGruppeSetzen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("preislisten", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const kundeId = text(formData, "kunde_id");
  const kundengruppe = text(formData, "kundengruppe");
  if (!kundeId) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase
    .from("b2b_kunden")
    .update({ kundengruppe: (kundengruppe || null) as (typeof kundengruppen)[number] | null })
    .eq("id", kundeId);

  if (error) return dbFehler(error);

  await protokolliere(profil, "kunde.kundengruppe_gesetzt", kundeId);
  aktualisiere(formData);
  return ok("ok.kundengruppeGesetzt");
}
