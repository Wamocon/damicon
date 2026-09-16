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
import type { Json } from "@/lib/database.types";
import { reklamationGruende, reklamationStatus } from "@/lib/domain/reklamationen";
import { text, zahl, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// Reklamationsmanagement (WMCNL-1455). Wer eine Reklamation anlegen darf und
// wer sie bearbeiten darf, entscheidet rbac.ts ("reklamationen:create" fuer
// Kunde und Buero, "reklamationen:approve" nur fuer Buero) - RLS in der
// Migration 20260908120000_reklamationen.sql ist die zweite Verteidigungslinie
// und die, die tatsaechlich auf die eigene Firma eingrenzt.

function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  return protokolliereBasis(profil, aktion, "reklamationen", ressourceId, metadata);
}

export async function reklamationAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("reklamationen", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  // Ein Kunde legt ausschliesslich fuer die eigene Firma an - die
  // Kundenauswahl aus dem Formular (falls vorhanden) wird fuer diese Rolle
  // ignoriert. Das Buero waehlt frei.
  const b2bKundeId = profil.role === "kunde" ? profil.b2bKundeId : text(formData, "b2b_kunde_id");
  if (!b2bKundeId) return fehler(profil.role === "kunde" ? "fehler.keinKunde" : "fehler.eingabe");

  const grund = text(formData, "grund");
  const betreff = text(formData, "betreff");
  if (!betreff || !(reklamationGruende as readonly string[]).includes(grund)) {
    return fehler("fehler.eingabe");
  }

  const chargeId = text(formData, "charge_id") || null;
  const beschreibung = text(formData, "beschreibung") || null;
  const betroffeneMenge = zahl(formData, "betroffene_menge_kg");
  if (betroffeneMenge !== null && betroffeneMenge < 0) return fehler("fehler.eingabe");

  // Eine eigene Frist gibt nur das Buero vor - fehlt sie, setzt die Datenbank
  // automatisch 5 Kalendertage ab Meldung (trg_reklamation_frist).
  const fristRoh = profil.role === "kunde" ? "" : text(formData, "frist_am");

  const supabase = await createClient();

  const heute = new Date();
  const stempel = `${heute.getFullYear()}${String(heute.getMonth() + 1).padStart(2, "0")}${String(
    heute.getDate(),
  ).padStart(2, "0")}`;
  const code = `REK-${stempel}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const { data, error } = await supabase
    .from("reklamationen")
    .insert({
      code,
      b2b_kunde_id: b2bKundeId,
      charge_id: chargeId,
      grund: grund as (typeof reklamationGruende)[number],
      betreff,
      beschreibung,
      betroffene_menge_kg: betroffeneMenge,
      frist_am: fristRoh || null,
      gemeldet_von: profil.id,
    })
    .select("id, code, betreff")
    .single();

  if (error) return dbFehler(error);

  // Erster Verlaufseintrag von Hand: der Status-Protokoll-Trigger feuert nur
  // bei UPDATE (siehe Migration), eine frisch angelegte Reklamation hat noch
  // keinen alten Status, gegen den sich "geaendert" vergleichen liesse.
  const { error: ereignisFehler } = await supabase.from("reklamation_ereignisse").insert({
    reklamation_id: data.id,
    text: `Reklamation gemeldet: ${data.betreff}`,
    sichtbar_fuer_kunde: true,
    autor_id: profil.id,
  });
  if (ereignisFehler) {
    console.error("[damicon] Verlaufseintrag fehlgeschlagen:", ereignisFehler.message);
  }

  await protokolliere(profil, "reklamation.angelegt", data.id, { code: data.code, grund });
  aktualisiere(formData);
  return ok("ok.reklamation", data.code);
}

export async function reklamationStatusSetzen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  const neuerStatus = text(formData, "status");
  const abschluss = neuerStatus === "angenommen" || neuerStatus === "abgelehnt" || neuerStatus === "erledigt";

  let profil: SessionProfile;
  try {
    profil = await requirePermission("reklamationen", abschluss ? "approve" : "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id || !(reklamationStatus as readonly string[]).includes(neuerStatus)) {
    return fehler("fehler.eingabe");
  }

  // Eine Entscheidung braucht eine Begruendung - dieselbe Regel steht auch als
  // Check-Constraint in der Datenbank (reklamation_abschluss_braucht_begruendung),
  // hier schon vorab geprueft statt den Nutzer an der DB-Fehlermeldung scheitern
  // zu lassen.
  const loesung = text(formData, "loesung");
  if (abschluss && !loesung) return fehler("fehler.eingabe");

  const gutschrift = zahl(formData, "gutschrift_tenge");
  if (gutschrift !== null && gutschrift < 0) return fehler("fehler.eingabe");
  const gutschriftErlaubt = neuerStatus === "angenommen" || neuerStatus === "erledigt";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reklamationen")
    .update({
      status: neuerStatus as (typeof reklamationStatus)[number],
      ...(abschluss ? { loesung } : {}),
      ...(gutschriftErlaubt && gutschrift !== null ? { gutschrift_tenge: gutschrift } : {}),
    })
    .eq("id", id)
    .select("id, code")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.berechtigung");

  await protokolliere(profil, "reklamation.status", data.id, { code: data.code, status: neuerStatus });
  aktualisiere(formData);
  return ok("ok.reklamationStatus", data.code);
}

export async function reklamationNachrichtHinzufuegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("reklamationen", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const reklamationId = text(formData, "reklamation_id");
  const nachricht = text(formData, "text");
  if (!reklamationId || !nachricht) return fehler("fehler.eingabe");

  // Ein Kunde sieht die eigenen Nachrichten immer - "intern" gibt es nur fuer
  // das Buero, das damit interne Notizen vom Kunden fernhalten kann.
  const sichtbarFuerKunde = profil.role === "kunde" ? true : text(formData, "intern") !== "on";

  const supabase = await createClient();
  const { error } = await supabase.from("reklamation_ereignisse").insert({
    reklamation_id: reklamationId,
    text: nachricht,
    sichtbar_fuer_kunde: sichtbarFuerKunde,
    autor_id: profil.id,
  });

  if (error) return dbFehler(error);

  await protokolliere(profil, "reklamation.nachricht", reklamationId, {});
  aktualisiere(formData);
  return ok("ok.reklamationNachricht");
}
