"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sicheresLocale, sicheresZiel } from "@/lib/auth-nav";

// Login-Challenge fuer den zweiten Faktor (Anforderung 4.9). Setzt eine
// bestehende AAL1-Sitzung voraus - login/actions.ts leitet nur hierher um,
// wenn getAuthenticatorAssuranceLevel() bereits AAL2 verlangt.

export interface MfaChallengeStatus {
  fehler: "code" | "unbekannt" | null;
}

export async function mfaAnmeldenBestaetigen(
  _status: MfaChallengeStatus,
  formData: FormData,
): Promise<MfaChallengeStatus> {
  const code = String(formData.get("code") ?? "").trim();
  const locale = sicheresLocale(formData.get("locale"));
  const ziel = sicheresZiel(formData.get("weiter"), locale);

  if (!/^\d{6}$/.test(code)) {
    return { fehler: "code" };
  }

  const supabase = await createClient();

  // Ohne aktive AAL1-Sitzung gibt es hier nichts zu bestaetigen - ohne
  // gueltige Session liefert listFactors() ohnehin keine Faktoren.
  const { data: faktoren, error: listFehler } = await supabase.auth.mfa.listFactors();
  const faktor = faktoren?.totp.find((f) => f.status === "verified");
  if (listFehler || !faktor) {
    return { fehler: "unbekannt" };
  }

  const { data: challenge, error: challengeFehler } = await supabase.auth.mfa.challenge({
    factorId: faktor.id,
  });
  if (challengeFehler || !challenge) {
    return { fehler: "unbekannt" };
  }

  const { error: verifyFehler } = await supabase.auth.mfa.verify({
    factorId: faktor.id,
    challengeId: challenge.id,
    code,
  });
  if (verifyFehler) {
    return { fehler: "code" };
  }

  // redirect() wirft intern - deshalb ausserhalb jedes try/catch.
  redirect(ziel);
}
