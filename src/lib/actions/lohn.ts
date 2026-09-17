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
import { einsAus } from "@/lib/data/util";
import { lohnStatus, type LohnStatus } from "@/lib/domain/lohn";
import { text, zahl, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// Lohnabrechnung mit Qualitaetsfaktor (WMCNL-1444). Die eigentliche Rechnung
// steht in der Datenbank (public.lohn_periode_berechnen(), SECURITY DEFINER
// mit eigenem has_role()-Einstieg) - requirePermission() hier ist die erste,
// die RLS/der explizite Rollen-Check in der Funktion die zweite
// Verteidigungslinie, wie ueberall sonst in diesem Modul.

function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  return protokolliereBasis(profil, aktion, "lohn", ressourceId, metadata);
}

// Neuen Lohnsatz anlegen. Ein vorheriger, noch offener Satz wird von der
// Datenbank automatisch zum neuen gueltig_ab-Datum geschlossen
// (trg_lohn_satz_vorherigen_schliessen) - diese Aktion muss sich darum nicht
// selbst kuemmern.
export async function lohnSatzAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("lohn", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const gueltigAb = text(formData, "gueltig_ab");
  const stundenlohn = zahl(formData, "stundenlohn_tenge");
  const kgSatz = zahl(formData, "kg_satz_tenge");
  const ziel = zahl(formData, "qualitaets_ziel_ausschussquote");
  const min = zahl(formData, "qualitaetsfaktor_min");
  const max = zahl(formData, "qualitaetsfaktor_max");
  const notiz = text(formData, "notiz") || null;

  if (
    !gueltigAb ||
    stundenlohn === null || stundenlohn < 0 ||
    kgSatz === null || kgSatz < 0 ||
    (ziel !== null && (ziel <= 0 || ziel >= 100)) ||
    (min !== null && min > 1) ||
    (max !== null && max < 1)
  ) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lohn_saetze")
    .insert({
      gueltig_ab: gueltigAb,
      stundenlohn_tenge: stundenlohn,
      kg_satz_tenge: kgSatz,
      ...(ziel !== null ? { qualitaets_ziel_ausschussquote: ziel } : {}),
      ...(min !== null ? { qualitaetsfaktor_min: min } : {}),
      ...(max !== null ? { qualitaetsfaktor_max: max } : {}),
      notiz,
    })
    .select("id, gueltig_ab")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "lohn.satz_angelegt", data.id, { gueltig_ab: data.gueltig_ab });
  aktualisiere(formData);
  return ok("ok.lohnSatz", data.gueltig_ab);
}

// Periode berechnen: ruft die RPC auf, die Grundlohn, Mengenkomponente und
// Qualitaetsfaktor je Pfluecker rechnet und lohn_abrechnungen/lohn_positionen
// schreibt. Bereits freigegebene/ausgezahlte Abrechnungen laesst die Funktion
// unangetastet - das steht in der Erfolgsmeldung, nicht nur im Server-Log.
export async function lohnPeriodeBerechnen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("lohn", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const periodeStart = text(formData, "periode_start");
  const periodeEnde = text(formData, "periode_ende");
  if (!periodeStart || !periodeEnde) return fehler("fehler.eingabe");
  if (periodeEnde < periodeStart) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lohn_periode_berechnen", {
    p_periode_start: periodeStart,
    p_periode_ende: periodeEnde,
  });

  if (error) return dbFehler(error);

  const ergebnis = Array.isArray(data) ? data[0] : data;
  const verarbeitet = ergebnis?.verarbeitet ?? 0;

  await protokolliere(profil, "lohn.periode_berechnet", null, {
    periode_start: periodeStart,
    periode_ende: periodeEnde,
    verarbeitet,
    uebersprungen: ergebnis?.uebersprungen ?? 0,
  });
  aktualisiere(formData);
  return ok("ok.lohnBerechnet", String(verarbeitet));
}

// Statuswechsel: entwurf -> freigegeben -> ausgezahlt. Diese Aktion aendert
// ausschliesslich die Statusspalte; welcher Wechsel erlaubt ist, entscheidet
// die Datenbank (lohn_abrechnung_freigabe_pruefen):
//   * aus 'ausgezahlt' heraus fuehrt kein Weg zurueck,
//   * 'entwurf' -> 'ausgezahlt' direkt ist nicht moeglich (erst freigeben),
//   * Betraege einer freigegebenen Abrechnung aendern sich nicht still,
//   * die Ruecknahme 'freigegeben' -> 'entwurf' bleibt als Korrekturweg
//     moeglich, aber nur durch eine andere Person als die, die freigegeben
//     hat (Vier-Augen-Prinzip, Migration 20261017000000). Der Versuch der
//     eigenen Ruecknahme kommt als 42501 zurueck, also als
//     "fehler.berechtigung".
// Die Freigabe selbst verlangt weiterhin keine zweite Person - dass
// Buchhaltung rechnet und freigibt, ist eine offene betriebliche Festlegung.
export async function lohnStatusSetzen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("lohn", "approve");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const neuerStatus = text(formData, "status");
  if (!id || !(lohnStatus as readonly string[]).includes(neuerStatus)) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lohn_abrechnungen")
    .update({ status: neuerStatus as LohnStatus })
    .eq("id", id)
    .select("id, pfluecker ( ausweis )")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.berechtigung");

  const ausweis = einsAus(data.pfluecker)?.ausweis ?? "";
  await protokolliere(profil, "lohn.status", data.id, { status: neuerStatus });
  aktualisiere(formData);
  return ok("ok.lohnStatus", ausweis);
}
