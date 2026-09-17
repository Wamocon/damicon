"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";
import { istRechtsform, pruefeNummer, type Rechtsform } from "@/lib/domain/rechtsform";
import { istStammdatenGruppe, TABELLE_JE_GRUPPE } from "@/lib/domain/stammdaten";

// Rechtsform und ИИН/БИН pflegen (Anforderung E.11).
//
// Die Pruefung laeuft zweimal: hier, damit der Nutzer eine uebersetzte Meldung
// bekommt statt eines Datenbankfehlers, und im check-Constraint der Migration
// 20261013000000, damit auch ein direkter Zugriff nichts Unstimmiges ablegt.
// Die Regel selbst steht nur einmal - in domain/rechtsform.ts und der
// gleichnamigen SQL-Funktion, die der Abnahmetest E.11 gegeneinander prueft.

function protokolliere(profil: SessionProfile, aktion: string, ressourceId: string | null) {
  return protokolliereBasis(profil, aktion, "stammdaten", ressourceId);
}

export async function stammdatenAktualisieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("stammdaten", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const gruppe = text(formData, "gruppe");
  const rohRechtsform = text(formData, "rechtsform");
  const rohNummer = text(formData, "identifikationsnummer").replace(/\s/g, "");

  if (!id || !istStammdatenGruppe(gruppe)) return fehler("fehler.eingabe");

  // Leere Auswahl heisst "noch nicht erhoben" und ist erlaubt - der Altbestand
  // hat weder Rechtsform noch Nummer. Ein gesetzter Wert muss aber gueltig sein.
  const rechtsform: Rechtsform | null = rohRechtsform === "" ? null : rohRechtsform as Rechtsform;
  if (rechtsform !== null && !istRechtsform(rechtsform)) return fehler("fehler.eingabe");

  const nummer = rohNummer === "" ? null : rohNummer;
  const befund = pruefeNummer(nummer, rechtsform);
  if (befund === "keine-rechtsform") return fehler("fehler.stammdatenOhneRechtsform");
  if (befund === "format") return fehler("fehler.stammdatenFormat");
  if (befund === "pruefziffer") return fehler("fehler.stammdatenPruefziffer");

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELLE_JE_GRUPPE[gruppe] as "betriebe")
    .update({ rechtsform, identifikationsnummer: nummer })
    .eq("id", id);

  if (error) return dbFehler(error);

  await protokolliere(profil, "stammdaten.gepflegt", id);
  aktualisiere(formData);
  return ok("ok.stammdatenGespeichert");
}
