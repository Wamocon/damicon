"use server";

import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { roles, type Role } from "@/lib/rbac";
import { text, zahl, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// Admin-Verwaltung des KI-Ratenlimits (Vibecode-Cleanup Phase 2, kritische
// Stabilisierung, Fund 1). Dasselbe Muster wie actions/ki-anbieter.ts: nur
// "manage" auf die Ressource "ki_assistent" - laut rbac.ts hat ausschliesslich
// admin diese Aktion (ueber all(resource)), NICHT einmal ceo (dort bewusst
// ausgenommen, siehe Kommentar bei rolePermissions.ceo: ein IT-Betriebsthema,
// kein Fuehrungsthema). RLS auf ki_ratenlimit_einstellungen (nur admin, siehe
// Migration 20261110010000) ist die zweite Verteidigungslinie.

function protokolliere(profil: SessionProfile, aktion: string, ressourceId: string | null, grenze: number | null) {
  return protokolliereBasis(profil, aktion, "ki_ratenlimit_einstellungen", ressourceId, {
    grenze_pro_minute: grenze,
  });
}

const ALLE_MARKER = "alle";

/** "alle" (globale Standardzeile) oder eine der acht Rollen aus rbac.ts - alles andere ungueltig. */
function parseRolle(wert: string): Role | typeof ALLE_MARKER | null {
  if (wert === ALLE_MARKER) return ALLE_MARKER;
  return (roles as readonly string[]).includes(wert) ? (wert as Role) : null;
}

/** Menschenlesbares Label fuer die Bestaetigungsmeldung (Formular selbst
 *  zeigt dieselben Label bereits client-seitig ueber useTranslations). */
async function rolleLabel(rolle: Role | typeof ALLE_MARKER): Promise<string> {
  if (rolle === ALLE_MARKER) {
    const t = await getTranslations("kiAssistentAnsicht.ratenlimitVerwaltung");
    return t("alleRollen");
  }
  const t = await getTranslations("roles");
  return t(rolle);
}

export async function kiRatenlimitSetzen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const rolle = parseRolle(text(formData, "rolle"));
  if (rolle === null) return fehler("fehler.eingabe");

  // Leeres Feld = ausdruecklich "kein Limit" fuer diese Zeile (grenze bleibt
  // null) - keine stillschweigende Deutung einer leeren Eingabe als 0 oder
  // als irgendein Code-Standardwert (siehe lib/ai/ratenbegrenzung.ts).
  const grenzeRoh = text(formData, "grenze_pro_minute");
  let grenze: number | null = null;
  if (grenzeRoh) {
    const wert = zahl(formData, "grenze_pro_minute");
    if (wert === null || !Number.isInteger(wert) || wert <= 0) return fehler("fehler.eingabe");
    grenze = wert;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("ki_ratenlimit_setzen", {
    p_rolle: rolle === ALLE_MARKER ? null : rolle,
    p_grenze: grenze,
  });
  if (error) return dbFehler(error);

  await protokolliere(profil, "ki_ratenlimit.gesetzt", rolle, grenze);
  aktualisiere(formData);
  return ok("ok.kiRatenlimitGesetzt", await rolleLabel(rolle));
}

export async function kiRatenlimitEntfernen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const rolle = parseRolle(text(formData, "rolle"));
  if (rolle === null) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase.rpc("ki_ratenlimit_entfernen", {
    p_rolle: rolle === ALLE_MARKER ? null : rolle,
  });
  if (error) return dbFehler(error);

  await protokolliere(profil, "ki_ratenlimit.entfernt", rolle, null);
  aktualisiere(formData);
  return ok("ok.kiRatenlimitEntfernt", await rolleLabel(rolle));
}
