"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sicheresLocale, sicheresZiel } from "@/lib/auth-nav";
import { mfaHerausforderungOffen } from "@/lib/domain/mfa";

export interface AnmeldeStatus {
  fehler: "ungueltig" | "unbekannt" | "eingabe" | null;
}

export async function anmelden(
  _status: AnmeldeStatus,
  formData: FormData,
): Promise<AnmeldeStatus> {
  const email = String(formData.get("email") ?? "").trim();
  const passwort = String(formData.get("passwort") ?? "");
  const locale = sicheresLocale(formData.get("locale"));
  const ziel = sicheresZiel(formData.get("weiter"), locale);

  if (!email || !passwort) {
    return { fehler: "eingabe" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: passwort,
  });

  if (error) {
    // Kein Unterschied zwischen "Nutzer unbekannt" und "Passwort falsch".
    return { fehler: error.status === 400 ? "ungueltig" : "unbekannt" };
  }

  // Mehrfaktor-Authentifizierung (Anforderung 4.9): Passwort allein ergibt
  // nach erfolgreichem signInWithPassword nur AAL1. Ist fuer dieses Konto ein
  // verifizierter TOTP-Faktor eingerichtet, verlangt Supabase AAL2 - die
  // Sitzung ist dann angelegt, aber fuer geschuetzte Aktionen noch nicht
  // ausreichend. Ohne eingerichteten Faktor bleiben currentLevel und
  // nextLevel gleich, der Login laeuft wie bisher direkt durch.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaHerausforderungOffen(aal)) {
    redirect(`/${locale}/login/mfa?weiter=${encodeURIComponent(ziel)}`);
  }

  // WMC-Vibecode-Cleanup-Fund: der Router Cache kennt nur Pfad und Zeit, keine
  // Sitzung - ohne diese Entwertung liefert Next.js nach der Anmeldung fuer
  // /dashboard denselben clientseitig zwischengespeicherten Server-Component-
  // Baum aus, den ein zuvor in diesem Tab angemeldetes Konto (z. B. mit
  // Zugriff auf die Kennzahlen aus kpisFuerRolle()) bereits geladen hatte -
  // bis zum naechsten harten Reload sichtbar fuer die neue, ggf. schwaecher
  // berechtigte Sitzung. revalidatePath() am Layout entwertet den gesamten
  // Baum, nicht nur das Ziel der Weiterleitung.
  revalidatePath("/", "layout");
  // redirect() wirft intern - deshalb ausserhalb jedes try/catch.
  redirect(ziel);
}

export async function abmelden(formData: FormData): Promise<void> {
  const locale = sicheresLocale(formData.get("locale"));
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(`/${locale}/login`);
}
