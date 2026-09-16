"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";
import { kontaktkanalTypen } from "@/lib/domain/kanaele";

// Verwaltung der Kontaktkanaele/Zahlungswege (Anforderung 5.6). Reine
// Anzeige/Verwaltung - kein Schreibpfad an einen echten Messenger- oder
// Zahlungsdienst, siehe domain/kanaele.ts.

function protokolliere(profil: SessionProfile, aktion: string, ressourceId: string | null) {
  return protokolliereBasis(profil, aktion, "kanaele", ressourceId);
}

export async function kanalAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("kanaele", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const typ = text(formData, "typ");
  const bezeichnung = text(formData, "bezeichnung");
  const wert = text(formData, "wert") || null;
  if (!bezeichnung || !(kontaktkanalTypen as readonly string[]).includes(typ)) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kontaktkanaele")
    .insert({ typ: typ as (typeof kontaktkanalTypen)[number], bezeichnung, wert, aktiv: wert !== null })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "kanal.angelegt", data.id);
  aktualisiere(formData);
  return ok("ok.kanalAngelegt");
}

export async function kanalAktualisieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("kanaele", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const bezeichnung = text(formData, "bezeichnung");
  const wert = text(formData, "wert") || null;
  const aktiv = text(formData, "aktiv") === "on";
  if (!id || !bezeichnung) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase
    .from("kontaktkanaele")
    .update({ bezeichnung, wert, aktiv })
    .eq("id", id);

  if (error) return dbFehler(error);

  await protokolliere(profil, "kanal.aktualisiert", id);
  aktualisiere(formData);
  return ok("ok.kanalAktualisiert");
}

export async function kanalLoeschen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("kanaele", "delete");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase.from("kontaktkanaele").delete().eq("id", id);
  if (error) return dbFehler(error);

  await protokolliere(profil, "kanal.geloescht", id);
  aktualisiere(formData);
  return ok("ok.kanalGeloescht");
}
