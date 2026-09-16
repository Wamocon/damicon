"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// B2B-Portal: Preisliste und Vorbestellung (Anforderung 5.1, Teil 2 von 2).
// requirePermission() ist die erste Verteidigungslinie, RLS
// (vorbestellungen_insert_kunde_buero/-update_buero/-update_kunde_storno,
// Migration 20260929000000) die zweite. Kontingent-Verbrauch wird bewusst
// nicht geprueft/fortgeschrieben - siehe Migrationskommentar.

function protokolliere(profil: SessionProfile, aktion: string, ressourceId: string) {
  return protokolliereBasis(profil, aktion, "vorbestellungen", ressourceId);
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

  // Vibecode-Cleanup-Fund: "kunde" hat ueber crud("b2b_portal") ebenfalls
  // b2b_portal:update (fuer den eigenen Storno in vorbestellungStornieren()
  // unten), requirePermission() allein filtert diese Rolle hier also nicht
  // aus. RLS (vorbestellungen_update_buero) blockt einen kunde-Aufruf zwar
  // zuverlaessig, dasselbe Muster wie an anderer Stelle im Projekt (siehe
  // b2b-portal-ansicht.tsx) verlangt aber denselben Ausschluss zusaetzlich
  // hier in der Aktion, statt sich allein auf RLS zu verlassen.
  if (profil.role === "kunde") {
    return zugriffsFehler(new Error("keine-berechtigung"));
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
    // Vibecode-Cleanup-Fund: derselbe Vorzustands-Schutz wie in der RLS-
    // Policy vorbestellungen_update_buero (Migration 20260929010000), hier
    // zusaetzlich in der Aktion statt sich allein auf die Datenbank zu
    // verlassen - verhindert, dass eine bereits automatisch auf "geliefert"
    // oder ein bereits "storniert" fortgeschriebene Vorbestellung erneut
    // umgesetzt wird. Bewusst NICHT nur "angefragt": eine bereits
    // "bestaetigt" bestellte Menge nachtraeglich zu stornieren, bleibt ein
    // legitimer Geschaeftsvorgang (Ruecksprache mit dem Kunden).
    .in("status", ["angefragt", "bestaetigt"])
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
