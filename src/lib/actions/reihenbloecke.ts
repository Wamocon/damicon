"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import type { Json } from "@/lib/database.types";
import {
  dbFehler,
  fehler,
  ok,
  zugriffsFehler,
  type AktionsStatus,
} from "@/lib/actions/status";
import { reihenblockStatus } from "@/lib/domain/reihenbloecke";
import { heuteIso } from "@/lib/data/util";

// Statusverwaltung der Reihenbloecke inklusive Wartezeitsperre.
// Die eigentliche Regel liegt in der Datenbank (Trigger trg_reihenblock_sperre
// und Funktion reihenblock_freigeben) - die Anwendung fuehrt sie nur aus und
// uebersetzt die Fehlermeldung.

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

function zahl(formData: FormData, feld: string): number | null {
  const roh = text(formData, feld).replace(",", ".");
  if (!roh) return null;
  const wert = Number(roh);
  return Number.isFinite(wert) ? wert : null;
}

const aufwandmengeEinheiten = ["l_ha", "kg_ha"] as const;

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
    ressource: "reihenbloecke",
    ressource_id: ressourceId,
    metadata,
  });
}

function aktualisiere(formData: FormData) {
  const pfad = text(formData, "pfad");
  if (pfad.startsWith("/")) revalidatePath(pfad);
}

export async function statusSetzen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("reihenbloecke", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const code = text(formData, "code");
  const status = text(formData, "status");

  if (!id || !(reihenblockStatus as readonly string[]).includes(status)) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reihenbloecke")
    .update({ status: status as (typeof reihenblockStatus)[number] })
    .eq("id", id)
    .select("id, code")
    .maybeSingle();

  if (error) return dbFehler(error);
  // Kein Treffer trotz fehlerfreiem Update: die RLS-Policy hat die Zeile
  // ausgefiltert.
  if (!data) return fehler("fehler.berechtigung");

  await protokolliere(profil, "reihenblock.status", data.id, { status, code });
  aktualisiere(formData);
  return ok("ok.status", data.code);
}

// Anforderung 2.1: Reihenbloecke liessen sich bisher nur anlegen, nicht mehr
// umbenennen oder im Sortenprofil korrigieren. Dieselbe Berechtigung wie
// statusSetzen (reihenbloecke:update) - die RLS-Policy reihenbloecke_update_
// leitung (Migration 20260905120000) ist spaltenunabhaengig, kein neuer
// Datenbankschritt noetig.
export async function stammdatenBearbeiten(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("reihenbloecke", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const code = text(formData, "code").toUpperCase();
  if (!id || !code) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reihenbloecke")
    .update({ code, sorte_id: text(formData, "sorte_id") || null })
    .eq("id", id)
    .select("id, code")
    .maybeSingle();

  if (error) return dbFehler(error);
  // Kein Treffer trotz fehlerfreiem Update: die RLS-Policy hat die Zeile
  // ausgefiltert.
  if (!data) return fehler("fehler.berechtigung");

  await protokolliere(profil, "reihenblock.stammdaten", data.id, { code });
  aktualisiere(formData);
  return ok("ok.reihenblockStammdaten", data.code);
}

export async function behandlungErfassen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("pflanzenschutz", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const blockId = text(formData, "reihenblock_id");
  const mittelId = text(formData, "psm_mittel_id");
  const behandeltAm = text(formData, "behandelt_am") || heuteIso();
  // Anforderung 2.4: Aufwandmenge und durchfuehrende Person sind Pflichtfelder
  // beim Erfassen, nicht erst nachtraeglich - die Datenbankspalten bleiben
  // nullable (Seed-Reihenfolge, siehe Migration 20260918000000), aber ein neu
  // erfasster Vorgang bekommt beide immer schon beim Anlegen.
  const aufwandmenge = zahl(formData, "aufwandmenge");
  const aufwandmengeEinheit = text(formData, "aufwandmenge_einheit");
  const durchgefuehrtVonProfilId = text(formData, "durchgefuehrt_von_profil_id");
  if (
    !blockId ||
    !mittelId ||
    aufwandmenge === null ||
    aufwandmenge <= 0 ||
    !(aufwandmengeEinheiten as readonly string[]).includes(aufwandmengeEinheit) ||
    !durchgefuehrtVonProfilId
  ) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();

  // Die Wartezeit kommt aus dem Mittelkatalog, nicht aus der Eingabe - so
  // steht in der Sperre immer die zugelassene Wartezeit des Praeparats.
  const { data: mittel, error: mittelFehler } = await supabase
    .from("psm_mittel")
    .select("id, name, wartezeit_tage")
    .eq("id", mittelId)
    .maybeSingle();

  if (mittelFehler) return dbFehler(mittelFehler);
  if (!mittel) return fehler("fehler.eingabe");

  const { data, error } = await supabase
    .from("pflanzenschutz_behandlungen")
    .insert({
      reihenblock_id: blockId,
      psm_mittel_id: mittel.id,
      behandelt_am: behandeltAm,
      wartezeit_tage: mittel.wartezeit_tage,
      aufwandmenge,
      aufwandmenge_einheit: aufwandmengeEinheit as (typeof aufwandmengeEinheiten)[number],
      durchgefuehrt_von_profil_id: durchgefuehrtVonProfilId,
    })
    .select("id, freigabe_am")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "behandlung.erfasst", blockId, {
    mittel: mittel.name,
    behandelt_am: behandeltAm,
    freigabe_am: data.freigabe_am,
    aufwandmenge,
    aufwandmenge_einheit: aufwandmengeEinheit,
  });
  aktualisiere(formData);
  return ok("ok.behandlung", data.freigabe_am ?? behandeltAm);
}

export async function sperreFreigeben(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("reihenbloecke", "approve");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reihenblock_freigeben", {
    p_block: id,
    p_status: "erntereif",
  });

  if (error) return dbFehler(error);

  const block = Array.isArray(data) ? data[0] : data;
  await protokolliere(profil, "reihenblock.freigegeben", id, {
    code: block?.code ?? null,
  });
  aktualisiere(formData);
  return ok("ok.freigabe", block?.code ?? "");
}
