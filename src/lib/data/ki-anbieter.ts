import { createClient } from "@/lib/supabase/server";
import type { KiAnbieterTyp } from "@/lib/domain/ki-assistent";

// Datenzugriff fuer die Admin-Verwaltung der KI-Anbieter (Anforderung 5.4/5.5),
// wie ueberall im Projekt getrennt von der aufrufenden Aktion: Berechtigung,
// Verschluesselung, Protokoll und Formular-Feedback bleiben in
// actions/ki-anbieter.ts, hier steht nur der rohe Zugriff auf die Tabelle
// ki_anbieter. Die Funktionen geben das supabase-Ergebnis unveraendert zurueck,
// damit die Aktion wie bisher selbst ueber dbFehler()/fehler() entscheidet.

export async function anbieterAnlegen(eintrag: {
  name: string;
  anzeigeName: string;
  typ: KiAnbieterTyp;
  basisUrl: string;
  modell: string;
  apiKeyChiffrat: string;
  erstelltVon: string;
}) {
  const supabase = await createClient();
  return supabase
    .from("ki_anbieter")
    .insert({
      name: eintrag.name,
      anzeige_name: eintrag.anzeigeName,
      typ: eintrag.typ,
      basis_url: eintrag.basisUrl,
      modell: eintrag.modell,
      api_key_chiffrat: eintrag.apiKeyChiffrat,
      erstellt_von: eintrag.erstelltVon,
    })
    .select("id, anzeige_name")
    .single();
}

export async function anbieterAktivSetzen(id: string, aktiv: boolean) {
  const supabase = await createClient();
  return supabase
    .from("ki_anbieter")
    .update({ aktiv, aktualisiert_am: new Date().toISOString() })
    .eq("id", id)
    .select("id, anzeige_name")
    .maybeSingle();
}

export async function anbieterStandardSetzen(id: string) {
  const supabase = await createClient();
  // Atomar in der Datenbank (ki_anbieter_standard_setzen, Migration
  // 20260930000000): loest den vorherigen Standard in derselben Transaktion
  // ab, statt zweier getrennter UPDATEs vom Client aus.
  return supabase.rpc("ki_anbieter_standard_setzen", { p_id: id });
}

export async function anbieterLoeschen(id: string) {
  const supabase = await createClient();
  return supabase
    .from("ki_anbieter")
    .delete()
    .eq("id", id)
    .select("id, anzeige_name")
    .maybeSingle();
}
