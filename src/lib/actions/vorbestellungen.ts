"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";

// B2B-Portal: Preisliste und Vorbestellung (Anforderung 5.1, Teil 2 von 2).
// requirePermission() ist die erste Verteidigungslinie, RLS
// (vorbestellungen_insert_kunde_buero/-update_buero/-update_kunde_storno,
// Migration 20260929000000) die zweite. Kontingent-Verbrauch wird bewusst
// nicht geprueft/fortgeschrieben - siehe Migrationskommentar.

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

function aktualisiere(formData: FormData) {
  const pfad = text(formData, "pfad");
  if (pfad.startsWith("/")) revalidatePath(pfad);
}

async function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressourceId: string,
) {
  const supabase = await createClient();
  await supabase.from("audit_events").insert({
    actor: `${profil.fullName} (${profil.role})`,
    aktion,
    ressource: "vorbestellungen",
    ressource_id: ressourceId,
    metadata: {},
  });
}

// Ein Kunde bestellt fuer die eigene Firma vor, das Buero kann fuer jede
// Firma anlegen (z. B. telefonische Bestellung). Wie bei
// reklamationAnlegen() kommt b2b_kunde_id fuer eine kunde-Anmeldung aus der
// Session, nicht aus einem (manipulierbaren) versteckten Formularfeld.
export async function vorbestellungAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("b2b_portal", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const b2bKundeId = profil.role === "kunde" ? profil.b2bKundeId : text(formData, "b2b_kunde_id");
  if (!b2bKundeId) return fehler(profil.role === "kunde" ? "fehler.keinKunde" : "fehler.eingabe");

  const sorteId = text(formData, "sorte_id");
  const mengeRoh = text(formData, "menge_kg").replace(",", ".");
  const mengeKg = Number(mengeRoh);
  const liefertermin = text(formData, "liefertermin") || null;

  if (!sorteId || !mengeRoh || !Number.isFinite(mengeKg) || mengeKg <= 0) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vorbestellungen")
    .insert({ b2b_kunde_id: b2bKundeId, sorte_id: sorteId, menge_kg: mengeKg, liefertermin })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "vorbestellung.angelegt", data.id);
  aktualisiere(formData);
  return ok("ok.vorbestellung");
}

// Buero bestaetigt oder lehnt eine Anfrage ab. "geliefert" wird bewusst
// nicht als waehlbare Option angeboten - das setzt ausschliesslich
// lieferung_uebergabe_pruefen() (Migration 20260926000000) automatisch.
export async function vorbestellungStatusSetzen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("b2b_portal", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const neuerStatus = text(formData, "status");
  if (!id || (neuerStatus !== "bestaetigt" && neuerStatus !== "storniert")) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vorbestellungen")
    .update({ status: neuerStatus })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.nichtGefunden");

  await protokolliere(profil, "vorbestellung.status_gesetzt", id);
  aktualisiere(formData);
  return ok("ok.vorbestellungStatus");
}

// Ein Kunde storniert die eigene, noch nicht bestaetigte Anfrage - die
// engere RLS-Policy vorbestellungen_update_kunde_storno erzwingt denselben
// Vorzustand (status = 'angefragt') noch einmal in der Datenbank.
export async function vorbestellungStornieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("b2b_portal", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vorbestellungen")
    .update({ status: "storniert" })
    .eq("id", id)
    .eq("status", "angefragt")
    .select("id")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.nichtGefunden");

  await protokolliere(profil, "vorbestellung.storniert", id);
  aktualisiere(formData);
  return ok("ok.vorbestellungStorniert");
}
