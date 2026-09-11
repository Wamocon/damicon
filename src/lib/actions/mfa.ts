"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { fehler, ok, type AktionsStatus } from "@/lib/actions/status";
import type { MfaEnrollStatus } from "@/lib/domain/mfa";

// Mehrfaktor-Authentifizierung (Anforderung 4.9, P0). Anders als die uebrigen
// Server Actions in diesem Modul nicht ueber requirePermission()/rbac.ts
// gesteuert - MFA ist keine Ressource mit Rollen-Berechtigung, sondern eine
// Kontoeinstellung, die jede angemeldete Person nur fuer sich selbst aendert.
// Die Absicherung liegt in der Session selbst: supabase.auth.mfa.* wirkt immer
// nur auf den Nutzer, dessen Cookie am Server-Client haengt - ein Aufruf ohne
// gueltige Session schlaegt bei Supabase fehl, nicht erst hier.

// Ein einziger Action-Aufruf fuer beide Schritte, unterschieden am Formular-
// inhalt (kein faktor_id/code-Feld -> Schritt 1, beides vorhanden -> Schritt
// 2). Zwingend eine Funktion, nicht zwei getrennte useActionState-Ketten: bei
// zwei Hooks haette der zweite keinen Zugriff auf den QR-Code/Secret-Zustand
// des ersten, sobald Schritt 1 abgeschlossen ist (useActionState uebernimmt
// den Initialwert nur beim ersten Rendern, nicht bei jeder Aenderung).
export async function mfaEnrollmentSchritt(
  status: MfaEnrollStatus,
  formData: FormData,
): Promise<MfaEnrollStatus> {
  const profil = await getSessionProfile();
  if (!profil) return { schritt: "start", fehler: "fehler.angemeldet" };

  const faktorId = String(formData.get("faktor_id") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const supabase = await createClient();

  // Schritt 2: den in der Authenticator-App erzeugten Code bestaetigen. Ein
  // Faktor zaehlt bei Supabase erst nach erfolgreicher Verifikation als aktiv
  // - ein abgebrochenes Enrollment hinterlaesst keinen wirksamen zweiten Faktor.
  if (faktorId) {
    if (!/^\d{6}$/.test(code)) {
      return { ...status, fehler: "fehler.code" };
    }

    const { data: challenge, error: challengeFehler } = await supabase.auth.mfa.challenge({
      factorId: faktorId,
    });
    if (challengeFehler || !challenge) {
      return { ...status, fehler: "fehler.unbekannt" };
    }

    const { error: verifyFehler } = await supabase.auth.mfa.verify({
      factorId: faktorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyFehler) {
      // Falscher Code bleibt im QR-Schritt, damit erneut versucht werden kann
      // - QR-Code/Secret aus Schritt 1 bleiben dabei unveraendert erhalten.
      return { ...status, fehler: "fehler.code" };
    }

    // Vibecode-Cleanup-Fund: die Aktivierung eines zweiten Faktors blieb
    // bisher ungeloggt, obwohl das ein sicherheitsrelevanter Vorgang ist wie
    // jeder andere protokollierte Schreibvorgang im Projekt.
    await supabase.from("audit_events").insert({
      actor: `${profil.fullName} (${profil.role})`,
      aktion: "mfa.aktiviert",
      ressource: "mfa_faktoren",
      ressource_id: profil.id,
      metadata: {},
    });

    revalidatePath("/dashboard/sicherheit");
    return { schritt: "fertig", faktorId };
  }

  // Schritt 1: TOTP-Faktor anlegen. Supabase liefert QR-Code (SVG) und Secret
  // im selben Aufruf zurueck - beides nur dieses eine Mal, danach nicht mehr
  // abrufbar (Supabase speichert das TOTP-Secret verschluesselt).
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Damicon - ${new Date().toISOString().slice(0, 10)}`,
  });

  if (error || !data) {
    console.error("[damicon] MFA-Enrollment fehlgeschlagen:", error?.message);
    return { schritt: "start", fehler: "fehler.unbekannt" };
  }

  return {
    schritt: "qr",
    faktorId: data.id,
    qrCodeSvg: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

// Bestehenden Faktor entfernen. Eigener, einfacher Rueckgabetyp
// (AktionsStatus) wie bei den uebrigen Loesch-/Statusaktionen im Buero-Modul -
// hier gibt es nach dem Entfernen nichts Strukturiertes mehr anzuzeigen.
export async function mfaFaktorEntfernen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  const profil = await getSessionProfile();
  if (!profil) return fehler("fehler.angemeldet");

  const faktorId = String(formData.get("faktor_id") ?? "");
  if (!faktorId) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId: faktorId });
  if (error) {
    console.error("[damicon] MFA-Entfernen fehlgeschlagen:", error.message);
    return fehler("fehler.unbekannt");
  }

  await supabase.from("audit_events").insert({
    actor: `${profil.fullName} (${profil.role})`,
    aktion: "mfa.entfernt",
    ressource: "mfa_faktoren",
    ressource_id: profil.id,
    metadata: {},
  });

  revalidatePath("/dashboard/sicherheit");
  return ok("ok.mfaEntfernt");
}
