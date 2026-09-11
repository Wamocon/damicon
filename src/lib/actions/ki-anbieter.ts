"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { istGueltigerAnbieterTyp } from "@/lib/domain/ki-assistent";
import { verschluessleApiKey } from "@/lib/ai/schluessel";
import type { Json } from "@/lib/database.types";

// Admin-Verwaltung der KI-Anbieter (Anforderung 5.4/5.5). Nur "manage" auf
// die Ressource "ki_assistent" - laut rbac.ts hat ausschliesslich admin diese
// Aktion (ueber all(resource)), betriebsleitung/kunde haben lediglich
// "view"/"create" (Chat lesen/nutzen). RLS auf ki_anbieter (nur admin, siehe
// Migration) ist die zweite Verteidigungslinie.

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

function aktualisiere(formData: FormData) {
  const pfad = text(formData, "pfad");
  if (pfad.startsWith("/")) revalidatePath(pfad);
}

async function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  const supabase = await createClient();
  await supabase.from("audit_events").insert({
    actor: `${profil.fullName} (${profil.role})`,
    aktion,
    ressource: "ki_anbieter",
    ressource_id: ressourceId,
    metadata,
  });
}

export async function kiAnbieterAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const name = text(formData, "name");
  const anzeigeName = text(formData, "anzeige_name");
  const typ = text(formData, "typ");
  const basisUrl = text(formData, "basis_url");
  const modell = text(formData, "modell");
  const apiKey = text(formData, "api_key");

  if (!name || !anzeigeName || !basisUrl || !modell || !apiKey || !istGueltigerAnbieterTyp(typ)) {
    return fehler("fehler.eingabe");
  }

  let chiffrat: string;
  try {
    chiffrat = verschluessleApiKey(apiKey);
  } catch (error) {
    console.error("[damicon] Verschluesselung fehlgeschlagen:", error);
    return fehler("fehler.unbekannt");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ki_anbieter")
    .insert({
      name,
      anzeige_name: anzeigeName,
      typ,
      basis_url: basisUrl,
      modell,
      api_key_chiffrat: chiffrat,
      erstellt_von: profil.id,
    })
    .select("id, anzeige_name")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "ki_anbieter.angelegt", data.id, { name, typ });
  aktualisiere(formData);
  return ok("ok.kiAnbieterAngelegt", data.anzeige_name);
}

export async function kiAnbieterAktivSetzen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const aktiv = text(formData, "aktiv") === "true";
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ki_anbieter")
    .update({ aktiv, aktualisiert_am: new Date().toISOString() })
    .eq("id", id)
    .select("id, anzeige_name")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.berechtigung");

  await protokolliere(profil, aktiv ? "ki_anbieter.aktiviert" : "ki_anbieter.deaktiviert", data.id);
  aktualisiere(formData);
  return ok(aktiv ? "ok.kiAnbieterAktiviert" : "ok.kiAnbieterDeaktiviert", data.anzeige_name);
}

export async function kiAnbieterStandardSetzen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  // Atomar in der Datenbank (ki_anbieter_standard_setzen, Migration
  // 20260930000000): loest den vorherigen Standard in derselben Transaktion
  // ab, statt zweier getrennter UPDATEs vom Client aus.
  const { error } = await supabase.rpc("ki_anbieter_standard_setzen", { p_id: id });
  if (error) return dbFehler(error);

  await protokolliere(profil, "ki_anbieter.standard_gesetzt", id);
  aktualisiere(formData);
  return ok("ok.kiAnbieterStandardGesetzt");
}

export async function kiAnbieterLoeschen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ki_anbieter")
    .delete()
    .eq("id", id)
    .select("id, anzeige_name")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.berechtigung");

  await protokolliere(profil, "ki_anbieter.geloescht", id, { anzeige_name: data.anzeige_name });
  aktualisiere(formData);
  return ok("ok.kiAnbieterGeloescht", data.anzeige_name);
}
