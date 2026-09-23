"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { getSessionProfile } from "@/lib/auth";
import { aktualisiereCeoBericht, type AktualisiereCeoBerichtErgebnis } from "@/lib/pruefung/ceo-auto";
import { darfCeoBericht } from "@/lib/pruefung/rollen";

// Manueller "Jetzt neu pruefen"-Knopf auf der Tages-Uebersicht
// (tages-uebersicht.tsx). Anders als der Login-Ausloeser
// (app/api/ki-pruefung/auto/route.ts, live gestreamt) ist das eine einfache,
// blockierende Server Action ohne Live-Fortschritt: wer den Knopf drueckt,
// wartet bewusst auf ein Ergebnis. erzwungen: true ueberspringt deshalb auch
// die Aenderungserkennung UND die Abkuehlzeit - sonst taete der Knopf sichtbar
// nichts, wenn gerade jemand anderes einen Lauf ausgeloest hat.
export async function ceoBerichtAktualisieren(): Promise<AktualisiereCeoBerichtErgebnis> {
  const profil = await getSessionProfile();
  if (!profil || !darfCeoBericht(profil.role)) {
    return { status: "fehler", grund: "keine-berechtigung" };
  }
  const sprache = await getLocale();
  const ergebnis = await aktualisiereCeoBericht({ profil, erzwungen: true, sprache });
  if (ergebnis.status === "erzeugt") {
    // Wie login/actions.ts und mfa/actions.ts: entwertet den ganzen Baum ab
    // dem Layout, damit die Startseite unabhaengig vom aktiven Locale-Praefix
    // den neuen Bericht zeigt.
    revalidatePath("/", "layout");
  }
  return ergebnis;
}
