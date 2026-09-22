import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Demo-Konten aus der Damicon-Vorfuehrumgebung (siehe
 * Testmanagement/Damicon-Demo-Anleitung-DE.docx). Kein Produktivpasswort,
 * daher unkritisch als Fallback im Klartext. Ueberschreibbar per Env fuer
 * andere Umgebungen.
 */
export const PASSWORT = process.env.DAMICON_DEMO_PASSWORT ?? "DamiconDemo2026!";

export const KONTEN = {
  kunde: process.env.DAMICON_KONTO_KUNDE ?? "kunde@damicon.demo",
  leitung: process.env.DAMICON_KONTO_LEITUNG ?? "leitung@damicon.demo",
  brigade: process.env.DAMICON_KONTO_BRIGADE ?? "brigade@damicon.demo",
  buchhaltung: process.env.DAMICON_KONTO_BUCHHALTUNG ?? "buchhaltung@damicon.demo",
  pfluecker: process.env.DAMICON_KONTO_PFLUECKER ?? "pfluecker@damicon.demo",
} as const;

export type Rolle = keyof typeof KONTEN;

/** Eindeutiger Marker fuer in diesem Testlauf erzeugte Datensaetze, damit sie im Betrieb wiedererkennbar bleiben. */
export function testMarker(prefix: string): string {
  const zeitstempel = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix} [E2E ${zeitstempel}]`;
}

/** Meldet die uebergebene Rolle an. Geht von einer frischen, nicht angemeldeten Seite aus. */
export async function anmelden(page: Page, rolle: Rolle): Promise<void> {
  await page.goto("/de/login");
  await page.getByRole("textbox", { name: "E-Mail" }).fill(KONTEN[rolle]);
  await page.getByRole("textbox", { name: "Passwort" }).fill(PASSWORT);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/de\/dashboard/);
}

/** Meldet die aktuell angemeldete Person ab. */
export async function abmelden(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/de\/login/);
}
