"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { darfEinstellungAendern, einstellungDef, pruefeEinstellungEingabe } from "@/lib/einstellungen";

// Eine fachliche Einstellung aendern (Migration 20261208030000). requirePermission() oeffnet die Seite fuer die Rollen, die Einstellungen
// pflegen duerfen; ob die Rolle diese eine Einstellung aendern darf, entscheidet zuerst die Liste in src/lib/einstellungen.ts und verbindlich
// die Funktion einstellung_setzen() in der Datenbank (Rolle gegen bearbeiter, Typ, Grenzen, Verlauf).

const GRUND_MAX = 300;

export async function einstellungSetzen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("einstellungen", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const schluessel = text(formData, "schluessel");
  const def = einstellungDef(schluessel);
  if (!def) return fehler("fehler.eingabe");
  if (!darfEinstellungAendern(profil.role, def)) return fehler("fehler.berechtigung");

  const geprueft = pruefeEinstellungEingabe(def, text(formData, "wert"));
  if ("fehler" in geprueft) return fehler(`fehler.${geprueft.fehler}`);

  const grund = text(formData, "grund");
  if (grund !== "" && ([...grund].length < 3 || [...grund].length > GRUND_MAX)) return fehler("fehler.anonymisierungGrund");

  const supabase = await createClient();
  const { error } = await supabase.rpc("einstellung_setzen", {
    p_schluessel: schluessel,
    p_wert: geprueft.wert,
    p_text: null,
    p_grund: grund === "" ? null : grund,
  });
  if (error) return dbFehler(error);

  await protokolliere(profil, "einstellung.gesetzt", "einstellungen", null, { schluessel, wert: geprueft.wert });
  aktualisiere(formData);
  return ok("ok.einstellungGespeichert");
}
