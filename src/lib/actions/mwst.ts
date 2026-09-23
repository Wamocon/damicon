"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import type { Json } from "@/lib/database.types";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// MwSt-Registrierung (Migration 20261025000000). requirePermission() ist die
// erste Verteidigungslinie, die RPC/RLS die zweite - dieselbe Reihenfolge wie
// ueberall in diesem Projekt.

function protokolliere(profil: SessionProfile, aktion: string, metadata: Record<string, Json> = {}) {
  return protokolliereBasis(profil, aktion, "stammdaten", null, metadata);
}

// Loest public.mwst_schwelle_pruefen() aus: rechnet den rollierenden
// 12-Monats-Umsatz neu und setzt beim ERSTEN Ueberschreiten der Schwelle das
// Datum fest (danach unveraendert, siehe Funktionskommentar in der
// Migration). Bewusst ein Knopfdruck, kein automatischer Lauf bei jedem
// Seitenaufruf - dasselbe Prinzip wie lohnPeriodeBerechnen.
export async function mwstSchwellePruefen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("stammdaten", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mwst_schwelle_pruefen");
  if (error) return dbFehler(error);

  const ergebnis = Array.isArray(data) ? data[0] : data;
  if (!ergebnis) return fehler("fehler.unbekannt");

  await protokolliere(profil, "stammdaten.mwst_schwelle_geprueft", {
    umsatz_12_monate_tenge: ergebnis.umsatz_12_monate_tenge,
    schwelle_ueberschritten: ergebnis.schwelle_ueberschritten,
  });
  aktualisiere(formData);

  return ergebnis.schwelle_ueberschritten
    ? fehler("fehler.mwstSchwelleUeberschritten", ergebnis.meldefrist_am ?? "")
    : ok("ok.mwstSchwelleGeprueft", String(Math.round(Number(ergebnis.umsatz_12_monate_tenge))));
}

// Als registriert markieren, nachdem die tatsaechliche Registrierung beim
// Finanzamt eingereicht wurde - ein reiner Statuswechsel, keine eigene
// Fachrechnung. requirePermission("stammdaten","update") wie oben; RLS
// (betriebe_update_leitung) laesst admin/betriebsleitung/buchhaltung zu.
export async function mwstAlsRegistriertMarkieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("stammdaten", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const registriertAm = text(formData, "registriert_am");
  if (!registriertAm) return fehler("fehler.eingabe");

  const supabase = await createClient();
  // Genau ein Betrieb in diesem Prototyp (siehe stammdaten-ansicht.tsx) - die
  // id kommt serverseitig aus der Datenbank, nicht aus einem versteckten
  // Formularfeld, dessen Wert sich manipulieren liesse.
  const { data: betrieb, error: betriebFehler } = await supabase
    .from("betriebe")
    .select("id")
    .limit(1)
    .single();
  if (betriebFehler || !betrieb) return dbFehler(betriebFehler ?? new Error("kein Betrieb"));

  const { error } = await supabase
    .from("betriebe")
    .update({ mwst_registriert: true, mwst_registriert_am: registriertAm })
    .eq("id", betrieb.id);

  if (error) return dbFehler(error);

  await protokolliere(profil, "stammdaten.mwst_registriert", { registriert_am: registriertAm });
  aktualisiere(formData);
  return ok("ok.mwstRegistriert", registriertAm);
}
