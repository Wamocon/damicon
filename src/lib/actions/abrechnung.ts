"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { zahl, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// Abrechnung gegenueber Lieferbetrieben (Anforderung 6.4): die Spanne ist die
// einzige hier gepflegte Einstellung, siehe domain/abrechnung.ts fuer die
// fachliche Festlegung (fixe Prozent-Spanne, keine Klassenabzuege).

function protokolliere(profil: SessionProfile, aktion: string) {
  return protokolliereBasis(profil, aktion, "aggregator_einstellungen", null);
}

export async function spanneAktualisieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("aggregator", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const spanneProzent = zahl(formData, "spanne_prozent");
  if (spanneProzent === null || spanneProzent < 0 || spanneProzent > 100) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data: bestehend } = await supabase.from("aggregator_einstellungen").select("id").limit(1).maybeSingle();

  const { error } = bestehend
    ? await supabase
        .from("aggregator_einstellungen")
        .update({ spanne_prozent: spanneProzent })
        .eq("id", bestehend.id)
    : await supabase.from("aggregator_einstellungen").insert({ spanne_prozent: spanneProzent });

  if (error) return dbFehler(error);

  await protokolliere(profil, "aggregator.spanne_gesetzt");
  aktualisiere(formData);
  return ok("ok.spanneAktualisiert");
}
