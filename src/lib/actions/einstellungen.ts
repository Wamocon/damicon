"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { darfEinstellungAendern, einstellungDef, pruefeEinstellungEingabe } from "@/lib/einstellungen";
import { darfRisikoParameterAendern, istRisikoParameter, pruefeRisikoEingabe } from "@/lib/domain/block-risiko";
import { ladeRisikoParameter } from "@/lib/data/block-risiko";

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

// Ein Parameter der Block-Risiko-Bewertung aendern (Migration 20261208100000). Nur Administration und Geschaeftsfuehrung; die Funktion
// risiko_parameter_setzen() in der Datenbank prueft Rolle, Grenzen und Plausibilitaet noch einmal und der Verlauf entsteht per Trigger.
export async function risikoParameterSetzen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("einstellungen", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }
  if (!darfRisikoParameterAendern(profil.role)) return fehler("fehler.berechtigung");

  const schluessel = text(formData, "schluessel");
  if (!istRisikoParameter(schluessel)) return fehler("fehler.eingabe");

  const aktuell = await ladeRisikoParameter();
  const geprueft = pruefeRisikoEingabe(schluessel, text(formData, "wert"), aktuell);
  if ("fehler" in geprueft) return fehler(`fehler.${geprueft.fehler}`);

  const grund = text(formData, "grund");
  if (grund !== "" && ([...grund].length < 3 || [...grund].length > GRUND_MAX)) return fehler("fehler.anonymisierungGrund");

  const supabase = await createClient();
  const { error } = await supabase.rpc("risiko_parameter_setzen", {
    p_schluessel: schluessel,
    p_wert: geprueft.wert,
    p_grund: grund === "" ? null : grund,
  });
  if (error) return dbFehler(error);

  await protokolliere(profil, "risiko.parameter_gesetzt", "einstellungen", null, { schluessel, wert: geprueft.wert });
  aktualisiere(formData);
  return ok("ok.einstellungGespeichert");
}
