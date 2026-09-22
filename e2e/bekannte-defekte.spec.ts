import { test, expect } from "@playwright/test";
import { anmelden } from "./helpers";

/**
 * Isolierter Nachweis fuer zwei waehrend der Testausfuehrung WMCNL-2411
 * (21.09.2026) gefundene und in Jira erfasste Defekte. Beide Tests sind
 * bewusst als erwartet fehlschlagend markiert (test.fail): sobald der
 * jeweilige Bug behoben wird, meldet Playwright den Test als "unexpectedly
 * passed" und macht dadurch sichtbar, dass der zugehoerige Jira-Vorgang
 * geschlossen und dieser Testfall wieder in den normalen Ablauf
 * (geschaeftsprozess.spec.ts) uebernommen werden kann.
 */

test("WMCNL-2414: Brigade kann eine offene Pflückaufgabe annehmen", async ({ page }) => {
  test.fail(true, "Bug WMCNL-2414: 'Ihre Rolle darf diesen Vorgang nicht ausführen.'");

  await anmelden(page, "brigade");
  await page.goto("/de/dashboard/feld/pflueckaufgaben");

  const offeneAufgabe = page.getByRole("link", { name: /offen/ }).first();
  await expect(offeneAufgabe).toBeVisible();
  await offeneAufgabe.click();

  await page.getByRole("button", { name: "Aufgabe annehmen" }).click();
  await expect(page.getByRole("button", { name: "Pflücken starten" })).toBeVisible();
});

test("WMCNL-2420: Pflücker sieht den eigenen Lohnsatz als Berechnungsgrundlage", async ({ page }) => {
  test.fail(true, "Bug WMCNL-2420: Lohnsatz-Abschnitt zeigt 'Noch kein Lohnsatz hinterlegt.'");

  await anmelden(page, "pfluecker");
  await page.goto("/de/dashboard/buero/lohn");

  const lohnsatzAbschnitt = page.locator("section", { hasText: "Lohnsatz" }).first();
  await expect(lohnsatzAbschnitt.getByText("Stundenlohn")).toBeVisible();
  await expect(lohnsatzAbschnitt.getByText("Noch kein Lohnsatz hinterlegt")).toHaveCount(0);
});
