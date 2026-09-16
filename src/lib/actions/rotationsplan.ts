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
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// Rotationsplan-Engine (Anforderung 2.2, P1). Die Rechenarbeit steht in der
// Datenbank (public.rotationsplan_generieren(), SECURITY INVOKER - die
// RLS-Policies des Aufrufers gelten weiter, wie bei reihenblock_freigeben()).
// requirePermission() ist die erste Verteidigungslinie, die RLS-Policies
// rotationsplan_eintraege_insert_planung/-update_planung (Migration
// 20260910000000) die zweite.

function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  return protokolliereBasis(profil, aktion, "rotationsplan", ressourceId, metadata);
}

// Erzeugt/erweitert den Plan fuer alle aktiven Reihenbloecke. Setzt den
// Zyklus je Block am zuletzt geplanten bzw. tatsaechlichen Erntetermin fort -
// mehrfaches Ausloesen dupliziert nichts (unique-Constraint in der Datenbank).
export async function rotationsplanGenerieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("rotationsplan", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const wochenRoh = text(formData, "wochen");
  const wochen = wochenRoh ? Number(wochenRoh) : 4;
  if (!Number.isInteger(wochen) || wochen < 1 || wochen > 12) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rotationsplan_generieren", {
    p_wochen: wochen,
  });

  if (error) return dbFehler(error);

  const summe = (data ?? []).reduce((s, r) => s + (r.neue_termine ?? 0), 0);

  await protokolliere(profil, "rotationsplan.generiert", null, {
    wochen,
    neue_termine: summe,
    betroffene_bloecke: (data ?? []).length,
  });
  aktualisiere(formData);
  return ok("ok.rotationsplanGeneriert", String(summe));
}

export async function rotationsplanUeberspringen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("rotationsplan", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rotationsplan_eintraege")
    .update({ status: "uebersprungen" })
    .eq("id", id)
    .eq("status", "geplant")
    .select("id, geplant_fuer, reihenbloecke ( code )")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.zustand");

  const block = Array.isArray(data.reihenbloecke) ? data.reihenbloecke[0] : data.reihenbloecke;
  await protokolliere(profil, "rotationsplan.uebersprungen", data.id, {
    geplant_fuer: data.geplant_fuer,
  });
  aktualisiere(formData);
  return ok("ok.rotationsplanStatus", block?.code ?? data.geplant_fuer);
}

export async function rotationsplanReaktivieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("rotationsplan", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rotationsplan_eintraege")
    .update({ status: "geplant" })
    .eq("id", id)
    .eq("status", "uebersprungen")
    .select("id, geplant_fuer, reihenbloecke ( code )")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.zustand");

  const block = Array.isArray(data.reihenbloecke) ? data.reihenbloecke[0] : data.reihenbloecke;
  await protokolliere(profil, "rotationsplan.reaktiviert", data.id, {
    geplant_fuer: data.geplant_fuer,
  });
  aktualisiere(formData);
  return ok("ok.rotationsplanStatus", block?.code ?? data.geplant_fuer);
}

// Anforderung 2.11: Bedarfsrechnung schliessen - eine Brigade fuer einen
// noch offenen (bislang keiner Brigade zugewiesenen) Termin eintragen. Die
// eigentliche Schreibpruefung liegt in rotationsplan_eintraege_update_planung
// (admin/betriebsleitung), dieselbe Policy wie bei den beiden Aktionen oben.
export async function rotationsplanBrigadeZuweisen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("rotationsplan", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const brigadeId = text(formData, "brigade_id");
  if (!id || !brigadeId) return fehler("fehler.eingabe");

  // Nur ein tatsaechlich noch offener Termin (geplant, ohne Brigade) laesst
  // sich zuweisen - wie bei den beiden Aktionen oben grenzt die WHERE-
  // Klausel selbst den Vorzustand ein, nicht nur ein nachtraeglicher Check.
  // Das verhindert zugleich zwei Luecken (adversarischer Review-Fund): ein
  // bereits erledigter/gesperrter/umgebogener Termin wuerde sonst
  // stillschweigend erneut ueberschrieben (kein Statuswechsel-Trigger
  // pruefte das), und bei zwei fast gleichzeitigen Zuweisungsversuchen
  // haette die zweite die erste kommentarlos ueberschrieben (verlorenes
  // Update) - jetzt trifft nur noch die zuerst ankommende Anfrage die
  // Zeile, die zweite laeuft kontrolliert in "fehler.nichtGefunden".
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rotationsplan_eintraege")
    .update({ brigade_id: brigadeId })
    .eq("id", id)
    .eq("status", "geplant")
    .is("brigade_id", null)
    .select("id, geplant_fuer, reihenbloecke ( code )")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.nichtGefunden");

  const block = Array.isArray(data.reihenbloecke) ? data.reihenbloecke[0] : data.reihenbloecke;
  await protokolliere(profil, "rotationsplan.brigade_zugewiesen", data.id, {
    geplant_fuer: data.geplant_fuer,
    brigade_id: brigadeId,
  });
  aktualisiere(formData);
  return ok("ok.rotationsplanStatus", block?.code ?? data.geplant_fuer);
}
