"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { aktualisiereCeoBericht, type AktualisiereCeoBerichtErgebnis } from "@/lib/pruefung/ceo-auto";

// Manueller "Jetzt neu pruefen"-Knopf auf der CEO-Uebersicht
// (ceo-compliance-uebersicht.tsx). Anders als der Login-Ausloeser
// (app/api/ki-pruefung/auto/route.ts) laeuft dieser Lauf NICHT ueber after():
// wer den Knopf drueckt, wartet bewusst auf ein Ergebnis, erzwungen: true
// ueberspringt deshalb auch die Aenderungserkennung.
export async function ceoBerichtAktualisieren(): Promise<AktualisiereCeoBerichtErgebnis> {
  const profil = await getSessionProfile();
  if (!profil || profil.role !== "ceo") {
    return { status: "fehler", grund: "keine-berechtigung" };
  }
  const ergebnis = await aktualisiereCeoBericht({ profil, erzwungen: true });
  if (ergebnis.status === "erzeugt") {
    // Wie login/actions.ts und mfa/actions.ts: entwertet den ganzen Baum ab
    // dem Layout, damit die Startseite unabhaengig vom aktiven Locale-Praefix
    // den neuen Bericht zeigt.
    revalidatePath("/", "layout");
  }
  return ergebnis;
}
