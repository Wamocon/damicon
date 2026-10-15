"use server";

import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fehler, ok, type AktionsStatus } from "@/lib/actions/status";
import { protokolliere } from "@/lib/actions/formular-helfer";
import { passwortFehler } from "@/lib/domain/rollen-zuweisung";

// Das eigene Passwort aendern (15.10.2026). Konten, die die Administration anlegt, starten mit einem vorlaeufigen Passwort, das nur die Administration kennt
// (user_metadata.passwort_vorlaeufig); mit dieser Aktion setzt die Person ein eigenes und das Kennzeichen faellt weg. Jede angemeldete Person darf das fuer sich,
// deshalb keine Rechtematrix, sondern die Sitzung. Passwoerter werden nicht getrimmt und stehen in keinem Protokoll.

export async function passwortAendern(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const profil = await getSessionProfile();
  if (!profil) return fehler("fehler.angemeldet");

  const neu = String(formData.get("neu") ?? "");
  const wiederholung = String(formData.get("wiederholung") ?? "");
  const abgelehnt = passwortFehler(neu, wiederholung, profil.email);
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: neu, data: { passwort_vorlaeufig: false } });
  if (error) {
    console.error("[damicon] Passwort aendern fehlgeschlagen:", error.code ?? error.message);
    if (error.code === "same_password") return fehler("fehler.passwortGleich");
    if (error.code === "weak_password") return fehler("fehler.passwortEinfach");
    return fehler("fehler.passwortAendern");
  }

  await protokolliere(profil, "passwort.geaendert", "rollen", profil.id, {});
  return ok("ok.passwortGeaendert");
}
