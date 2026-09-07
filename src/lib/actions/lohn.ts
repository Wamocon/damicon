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
import { einsAus } from "@/lib/data/util";
import { lohnStatus, type LohnStatus } from "@/lib/domain/lohn";

// Lohnabrechnung mit Qualitaetsfaktor (WMCNL-1444). Die eigentliche Rechnung
// steht in der Datenbank (public.lohn_periode_berechnen(), SECURITY DEFINER
// mit eigenem has_role()-Einstieg) - requirePermission() hier ist die erste,
// die RLS/der explizite Rollen-Check in der Funktion die zweite
// Verteidigungslinie, wie ueberall sonst in diesem Modul.

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
    ressource: "lohn",
    ressource_id: ressourceId,
    metadata,
  });
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

// Statuswechsel: entwurf -> freigegeben -> ausgezahlt. Die Datenbank
// (lohn_abrechnung_freigabe_pruefen) blockt jede Ruecknahme und jede stille
// Betragsaenderung nach der Freigabe - diese Aktion aendert deshalb
// ausschliesslich die Statusspalte.
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
