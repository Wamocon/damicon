import { routing } from "@/i18n/routing";

// Reine Hilfsfunktionen fuer Anmeldung/MFA-Challenge, gemeinsam genutzt von
// login/actions.ts und login/mfa/actions.ts. Eigene Datei, weil eine
// "use server"-Datei ausschliesslich async Funktionen exportieren darf -
// diese beiden sind synchron.

export function sicheresLocale(wert: FormDataEntryValue | null): string {
  const kandidat = String(wert ?? "");
  return (routing.locales as readonly string[]).includes(kandidat)
    ? kandidat
    : routing.defaultLocale;
}

// Nur interne Pfade als Rueckkehrziel zulassen (kein Open Redirect).
// "//fremd.example" und "/\fremd.example" sind protokollrelative Adressen und
// fuehren aus der Anwendung heraus - beide Zeichen an zweiter Stelle sperren.
export function sicheresZiel(wert: FormDataEntryValue | null, locale: string): string {
  const kandidat = String(wert ?? "");
  const intern =
    kandidat.startsWith("/") &&
    kandidat[1] !== "/" &&
    kandidat[1] !== "\\" &&
    !kandidat.includes("\\");
  return intern ? kandidat : `/${locale}/dashboard`;
}
