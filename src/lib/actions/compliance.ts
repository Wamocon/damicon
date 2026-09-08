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
import type { Json } from "@/lib/database.types";

// Compliance-Cockpit (WMCNL-1446). Schreibvorgaenge fuer Einwilligungen,
// Datenschutzvorfaelle und Drittweitergaben - je Ressource "compliance" mit
// den Rechten aus src/lib/rbac.ts (admin/betriebsleitung/buchhaltung).

const kanaele = ["papier", "app", "web", "sms"] as const;
const sprachen = ["de", "en", "ru", "kk", "tr"] as const;
const vorfallArten = ["unbefugter_zugriff", "verlust", "offenlegung", "sonstiges"] as const;

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

function zahl(formData: FormData, feld: string): number | null {
  const roh = text(formData, feld).replace(",", ".");
  if (!roh) return null;
  const wert = Number(roh);
  return Number.isFinite(wert) ? wert : null;
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
    ressource: "compliance",
    ressource_id: ressourceId,
    metadata,
  });
}

// ---------------------------------------------------------------------------
// Einwilligungen
// ---------------------------------------------------------------------------

export async function einwilligungErfassen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("compliance", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  // Genau ein Betroffener - dieselbe Regel wie der Check in der Datenbank
  // (num_nonnulls = 1), hier schon vor dem Insert geprueft statt den Nutzer
  // erst an der Datenbankfehlermeldung scheitern zu lassen.
  const pflueckerId = text(formData, "betroffener_pfluecker_id") || null;
  const profilId = text(formData, "betroffener_profil_id") || null;
  const b2bKundeId = text(formData, "betroffener_b2b_kunde_id") || null;
  const betroffeneAnzahl = [pflueckerId, profilId, b2bKundeId].filter(Boolean).length;

  const zweckId = text(formData, "zweck_id");
  const textfassung = text(formData, "textfassung");
  const sprache = text(formData, "sprache");
  const kanal = text(formData, "kanal");

  if (
    betroffeneAnzahl !== 1 ||
    !zweckId ||
    !textfassung ||
    !(sprachen as readonly string[]).includes(sprache) ||
    !(kanaele as readonly string[]).includes(kanal)
  ) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("einwilligungen")
    .insert({
      betroffener_pfluecker_id: pflueckerId,
      betroffener_profil_id: profilId,
      betroffener_b2b_kunde_id: b2bKundeId,
      zweck_id: zweckId,
      textfassung,
      sprache: sprache as (typeof sprachen)[number],
      kanal: kanal as (typeof kanaele)[number],
      nachweis_referenz: text(formData, "nachweis_referenz") || null,
    })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "einwilligung.erfasst", data.id, { zweckId, kanal });
  aktualisiere(formData);
  return ok("ok.einwilligungErfasst");
}

export async function einwilligungWiderrufen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("compliance", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const grund = text(formData, "grund");
  if (!id || !grund) return fehler("fehler.eingabe");

  const supabase = await createClient();
  // Der Trigger einwilligung_nur_widerruf() laesst ausschliesslich diese
  // beiden Spalten als Update zu - jedes andere Feld wuerde die Datenbank
  // ablehnen, unabhaengig davon, was hier geschickt wird.
  const { error } = await supabase
    .from("einwilligungen")
    .update({ widerrufen_am: new Date().toISOString(), widerruf_grund: grund })
    .eq("id", id);

  if (error) return dbFehler(error);

  await protokolliere(profil, "einwilligung.widerrufen", id, { grund });
  aktualisiere(formData);
  return ok("ok.einwilligungWiderrufen");
}

// ---------------------------------------------------------------------------
// Datenschutzvorfaelle
// ---------------------------------------------------------------------------

export async function vorfallErfassen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("compliance", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const festgestelltAm = text(formData, "festgestellt_am");
  const art = text(formData, "art");
  const beschreibung = text(formData, "beschreibung");
  const betroffeneAnzahl = zahl(formData, "betroffene_anzahl");
  // Anforderung 4.8: eine benannte verantwortliche Person je Vorfall ist
  // Pflicht - die Datenbankspalte bleibt nullable (Seed-Reihenfolge, siehe
  // Migration 20260912000000), aber ein neu erfasster Vorfall bekommt sie
  // immer schon beim Anlegen, nicht erst nachtraeglich.
  const verantwortlichProfilId = text(formData, "verantwortlich_profil_id");

  if (
    !festgestelltAm ||
    !beschreibung ||
    !verantwortlichProfilId ||
    !(vorfallArten as readonly string[]).includes(art)
  ) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("datenschutzvorfaelle")
    .insert({
      festgestellt_am: new Date(festgestelltAm).toISOString(),
      art: art as (typeof vorfallArten)[number],
      beschreibung,
      betroffene_anzahl: betroffeneAnzahl,
      verantwortlich_profil_id: verantwortlichProfilId,
    })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "vorfall.erfasst", data.id, { art });
  aktualisiere(formData);
  return ok("ok.vorfallErfasst");
}

// Anforderung 4.8: verantwortliche Person nachtragen bzw. neu zuweisen -
// fuer bereits vorhandene Zwecke/Vorfaelle ohne benannte Person (z. B.
// Seed-Daten, siehe Migrationskommentar 20260912000000).
export async function zweckVerantwortlichenSetzen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("compliance", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const verantwortlichProfilId = text(formData, "verantwortlich_profil_id");
  if (!id || !verantwortlichProfilId) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase
    .from("verarbeitungszwecke")
    .update({ verantwortlich_profil_id: verantwortlichProfilId })
    .eq("id", id);

  if (error) return dbFehler(error);

  await protokolliere(profil, "zweck.verantwortlicher_gesetzt", id, {});
  aktualisiere(formData);
  return ok("ok.zweckVerantwortlich");
}

export async function vorfallVerantwortlichenSetzen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("compliance", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const verantwortlichProfilId = text(formData, "verantwortlich_profil_id");
  if (!id || !verantwortlichProfilId) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase
    .from("datenschutzvorfaelle")
    .update({ verantwortlich_profil_id: verantwortlichProfilId })
    .eq("id", id);

  if (error) return dbFehler(error);

  await protokolliere(profil, "vorfall.verantwortlicher_gesetzt", id, {});
  aktualisiere(formData);
  return ok("ok.vorfallVerantwortlich");
}

export async function vorfallMelden(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("compliance", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const meldereferenz = text(formData, "meldereferenz");
  if (!id || !meldereferenz) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase
    .from("datenschutzvorfaelle")
    .update({ gemeldet_am: new Date().toISOString(), meldereferenz })
    .eq("id", id);

  if (error) return dbFehler(error);

  await protokolliere(profil, "vorfall.gemeldet", id, { meldereferenz });
  aktualisiere(formData);
  return ok("ok.vorfallGemeldet");
}

// ---------------------------------------------------------------------------
// Drittweitergaben
// ---------------------------------------------------------------------------

export async function drittweitergabeBenachrichtigen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("compliance", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase
    .from("drittweitergaben")
    .update({ benachrichtigt_am: new Date().toISOString() })
    .eq("id", id);

  if (error) return dbFehler(error);

  await protokolliere(profil, "drittweitergabe.benachrichtigt", id, {});
  aktualisiere(formData);
  return ok("ok.drittweitergabeBenachrichtigt");
}
