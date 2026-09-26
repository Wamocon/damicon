"use server";

import { createClient } from "@/lib/supabase/server";
import { bucket } from "@/lib/supabase/buckets";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// Lieferungen: Uebergabequittung und Lieferstatus (Anforderung 3.5 Teil 2,
// 5.2 Teil 2a). requirePermission() ist die erste Verteidigungslinie, RLS
// (lieferungen_insert_buero/-update_feld, Migration 20260926000000) die
// zweite. Der Uebergang auf Status "zugestellt" (Pflichtangabe Empfaenger,
// Geraete-Zeitstempel, Unveraenderlichkeit danach) wird vom Trigger
// lieferung_uebergabe_pruefen erzwungen, nicht nur hier gepruft.

const maxDateigroesse = 8 * 1024 * 1024;

function protokolliere(profil: SessionProfile, aktion: string, ressourceId: string) {
  return protokolliereBasis(profil, aktion, "logistik", ressourceId);
}

export async function lieferungAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("logistik", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const b2bKundeId = text(formData, "b2b_kunde_id");
  const chargeId = text(formData, "charge_id") || null;
  const mengeRoh = text(formData, "menge_kg").replace(",", ".");
  const mengeKg = Number(mengeRoh);

  if (!b2bKundeId || !mengeRoh || !Number.isFinite(mengeKg) || mengeKg <= 0) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lieferungen")
    .insert({ b2b_kunde_id: b2bKundeId, charge_id: chargeId, menge_kg: mengeKg })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "lieferung.angelegt", data.id);
  aktualisiere(formData);
  return ok("ok.lieferung");
}

export async function uebergabeErfassen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("logistik", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const empfaengerName = text(formData, "empfaenger_name");
  const geraetZeitpunkt = text(formData, "geraet_zeitpunkt") || null;

  if (!id || !empfaengerName) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const datei = formData.get("beleg");
  let storagePfad: string | null = null;

  if (datei instanceof File && datei.size > 0) {
    if (datei.size > maxDateigroesse) return fehler("fehler.zuGross");
    const endung = datei.name.split(".").pop()?.toLowerCase() ?? "jpg";
    storagePfad = `lieferungen/${id}-${crypto.randomUUID().slice(0, 8)}.${endung}`;

    const { error: uploadFehler } = await supabase.storage
      .from(bucket("belege"))
      .upload(storagePfad, datei, { contentType: datei.type || "image/jpeg" });

    if (uploadFehler) {
      console.error("[damicon] Upload fehlgeschlagen:", uploadFehler.message);
      return fehler("fehler.upload");
    }
  }

  // .select().maybeSingle() statt nur .eq(): ein RLS-gefilterter oder
  // laengst bereits zugestellter/stornierter Datensatz (z. B. eine
  // veraltete versteckte id im Formular, oder ein fast gleichzeitiger
  // zweiter Erfassungsversuch) trifft sonst still null Zeilen - kein
  // Postgres-Fehler, aber auch keine tatsaechliche Aenderung. Ohne diese
  // Pruefung haette die Aktion trotzdem "erfolgreich" gemeldet, einen
  // irrefuehrenden Audit-Eintrag geschrieben und ein hochgeladenes Foto
  // dauerhaft verwaist im Storage zurueckgelassen.
  const { data, error } = await supabase
    .from("lieferungen")
    .update({
      status: "zugestellt",
      empfaenger_name: empfaengerName,
      beleg_storage_path: storagePfad,
      abgezeichnet_von_profil_id: profil.id,
      geraet_zeitpunkt: geraetZeitpunkt,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (storagePfad) await supabase.storage.from(bucket("belege")).remove([storagePfad]);
    return dbFehler(error);
  }
  if (!data) {
    if (storagePfad) await supabase.storage.from(bucket("belege")).remove([storagePfad]);
    return fehler("fehler.nichtGefunden");
  }

  await protokolliere(profil, "lieferung.uebergabe_erfasst", id);
  aktualisiere(formData);
  return ok("ok.uebergabe");
}

// Anforderung 3.2: Temperaturmessung waehrend des Transports erfassen.
// Dieselbe Berechtigung wie uebergabeErfassen/lieferungStornieren
// (logistik:update, rbac.ts), RLS-Policy transport_messungen_insert_feld
// (Migration 20260928000000) prueft dieselbe Rollenmenge ein zweites Mal.
// Bewertung/Zeitstempel-Pruefung/Storno-Sperre liegen im Trigger
// transport_kuehlkette_bewerten(), nicht hier verdoppelt.
export async function transportMessungErfassen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("logistik", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const lieferungId = text(formData, "lieferung_id");
  const temperaturRoh = text(formData, "temperatur_c").replace(",", ".");
  const temperaturC = Number(temperaturRoh);
  const geraetZeitpunkt = text(formData, "geraet_zeitpunkt") || null;

  if (!lieferungId || !temperaturRoh || !Number.isFinite(temperaturC)) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transport_temperatur_messungen")
    .insert({
      lieferung_id: lieferungId,
      temperatur_c: temperaturC,
      geraet_zeitpunkt: geraetZeitpunkt,
      // Wie bei kuehlmessungKern (nachweiskette.ts): gemessen_am hat keinen
      // Spalten-Default, der Trigger berechnet ihn aus geraet_zeitpunkt. Der
      // generierte Insert-Typ kennt trigger-gesetzte Pflichtspalten nicht.
      gemessen_am: null as unknown as string,
    })
    .select("id, ergebnis")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "lieferung.transportmessung_erfasst", data.id);
  aktualisiere(formData);
  // WMCNL-2370: der Insert ist an dieser Stelle bereits committet - der
  // Trigger transport_kuehlkette_bewerten() lehnt keine Temperatur ab,
  // "verstoss" ist nur ein Ergebniswert wie "ok"/"warnung" (lueckenloser
  // Kuehlkettennachweis, siehe Migrationskopf 20260928000000). Eine
  // "fehler"-Meldung an dieser Stelle behauptete bislang faelschlich, der
  // Wert sei nicht gespeichert worden - er stand aber sofort und dauerhaft
  // in der Liste. Beide Faelle sind deshalb ein Erfolg (die Messung wurde
  // erfasst), nur der Text unterscheidet sich.
  return data.ergebnis === "verstoss"
    ? ok("ok.transportMessungVerstoss")
    : ok("ok.transportMessung");
}

export async function lieferungStornieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("logistik", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lieferungen")
    .update({ status: "storniert" })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.nichtGefunden");

  await protokolliere(profil, "lieferung.storniert", id);
  aktualisiere(formData);
  return ok("ok.lieferungStorniert");
}
