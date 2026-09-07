"use server";

import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

// Reiner Weiterleiter: Formatpruefung und Nachschlagen passieren auf der
// Zielseite (ladeOeffentlicheHerkunft in src/lib/data/herkunft.ts). Ein
// falsch eingegebener Code fuehrt dort zum "kein Treffer"-Zustand statt zu
// einer zweiten, eigenen Fehlerdarstellung hier - Muster wie
// src/app/[locale]/login/actions.ts.

function sicheresLocale(wert: FormDataEntryValue | null): string {
  const kandidat = String(wert ?? "");
  return (routing.locales as readonly string[]).includes(kandidat)
    ? kandidat
    : routing.defaultLocale;
}

export async function herkunftSuchen(formData: FormData): Promise<void> {
  const locale = sicheresLocale(formData.get("locale"));
  // Codes sind immer Kleinbuchstaben-Hex - ein per Hand abgetippter Code mit
  // Grossbuchstaben oder Leerzeichen am Rand soll trotzdem funktionieren.
  const code = String(formData.get("code") ?? "").trim().toLowerCase();

  redirect(`/${locale}/herkunft/${encodeURIComponent(code)}`);
}
