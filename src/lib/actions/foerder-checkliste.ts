"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { checkpunktFehler, VORSCHLAG_PUNKTE } from "@/lib/domain/foerder-checkliste";
import { tagInZone } from "@/lib/domain/tageszeit";
import { istGueltigerTag } from "@/lib/listen/zeitraum";
import { istUuid } from "@/lib/utils";

// Checkliste je Foerderdossier (WMCNL-1448). requirePermission("foerdermittel", ...) ist die erste
// Verteidigungslinie, RLS (foerder_checkpunkte_*_buero, Migration 20261207060000) die zweite. Anlegen und
// Aendern verlangen "update" auf dem Dossier, denn eine Checkliste ist Teil seiner Pflege.

async function zugriff(): Promise<{ profil: SessionProfile } | { status: AktionsStatus }> {
  try {
    return { profil: await requirePermission("foerdermittel", "update") };
  } catch (error) {
    return { status: zugriffsFehler(error) };
  }
}

function protokoll(profil: SessionProfile, aktion: string, dossierId: string, metadata: Record<string, string | number | boolean | null>) {
  return protokolliere(profil, aktion, "foerdermittel", dossierId, metadata);
}

export async function checkpunktAnlegen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;

  const dossierId = text(formData, "dossier_id");
  const bezeichnung = text(formData, "bezeichnung");
  const fristAm = text(formData, "frist_am") || null;
  const pflicht = formData.get("pflicht") === "on";
  if (!istUuid(dossierId)) return fehler("fehler.eingabe");
  const abgelehnt = checkpunktFehler(bezeichnung);
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);
  if (fristAm && !istGueltigerTag(fristAm)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { count } = await supabase.from("foerder_checkpunkte").select("id", { count: "exact", head: true }).eq("dossier_id", dossierId);
  const { data, error } = await supabase
    .from("foerder_checkpunkte")
    .insert({ dossier_id: dossierId, bezeichnung, pflicht, frist_am: fristAm, reihenfolge: count ?? 0 })
    .select("id")
    .single();
  if (error) return dbFehler(error);

  await protokoll(z.profil, "foerdermittel.checkpunkt_angelegt", dossierId, { punkt: data.id, pflicht });
  aktualisiere(formData);
  return ok("ok.checkpunkt");
}

/** Hakt einen Punkt ab oder oeffnet ihn wieder. */
export async function checkpunktUmschalten(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;

  const id = text(formData, "id");
  const erledigen = text(formData, "erledigen") === "ja";
  if (!istUuid(id)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("foerder_checkpunkte")
    .update({ erledigt_am: erledigen ? tagInZone(new Date()) : null })
    .eq("id", id)
    .select("id, dossier_id")
    .maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.berechtigung");

  await protokoll(z.profil, erledigen ? "foerdermittel.checkpunkt_erledigt" : "foerdermittel.checkpunkt_geoeffnet", data.dossier_id, { punkt: id });
  aktualisiere(formData);
  return ok(erledigen ? "ok.checkpunktErledigt" : "ok.checkpunktGeoeffnet");
}

export async function checkpunktEntfernen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;

  const id = text(formData, "id");
  if (!istUuid(id)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase.from("foerder_checkpunkte").delete().eq("id", id).select("id, dossier_id").maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.berechtigung");

  await protokoll(z.profil, "foerdermittel.checkpunkt_entfernt", data.dossier_id, { punkt: id });
  aktualisiere(formData);
  return ok("ok.checkpunktEntfernt");
}

/** Uebernimmt die allgemeinen Vorschlaege, aber nur in ein Dossier ohne Punkte: eine vorhandene Liste bleibt unangetastet. */
export async function checklisteVorschlagUebernehmen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;

  const dossierId = text(formData, "dossier_id");
  if (!istUuid(dossierId)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { count, error: zaehlFehler } = await supabase
    .from("foerder_checkpunkte")
    .select("id", { count: "exact", head: true })
    .eq("dossier_id", dossierId);
  if (zaehlFehler) return dbFehler(zaehlFehler);
  if ((count ?? 0) > 0) return fehler("fehler.checklisteNichtLeer");

  const { error } = await supabase
    .from("foerder_checkpunkte")
    .insert(VORSCHLAG_PUNKTE.map((vorlage_key, reihenfolge) => ({ dossier_id: dossierId, vorlage_key, pflicht: true, reihenfolge })));
  if (error) return dbFehler(error);

  await protokoll(z.profil, "foerdermittel.checkliste_vorschlag", dossierId, { punkte: VORSCHLAG_PUNKTE.length });
  aktualisiere(formData);
  return ok("ok.checklisteVorschlag");
}
