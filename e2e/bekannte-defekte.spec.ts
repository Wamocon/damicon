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
 *
 * Achtung, schreibend: ist WMCNL-2414 behoben, nimmt der erste Test eine
 * offene Pflueckaufgabe tatsaechlich an. Nicht gegen eine Datenbank laufen
 * lassen, deren Daten erhalten bleiben sollen.
 */

test("WMCNL-2414: Brigade kann eine offene Pflückaufgabe annehmen", async ({ page }) => {
  test.fail(true, "Bug WMCNL-2414: 'Ihre Rolle darf diesen Vorgang nicht ausführen.'");

  await anmelden(page, "brigade");
  await page.goto("/de/dashboard/feld/pflueckaufgaben?status=zu-erledigen");

  // Die Liste zeigt 20 Aufgaben je Seite, spaeteste Faelligkeit zuerst: eine
  // offene steht nicht zwingend auf Seite 1. Findet sich keine, wird der Test
  // uebersprungen - unter test.fail zaehlte ein Scheitern an der Vorbedingung
  // sonst als erwarteter Fehler, und ein behobener Bug fiele nie auf.
  // Nur Eintraege der Liste: Pillen und Filter nennen ebenfalls Status.
  const eintraege = page.locator("[data-eintrag]");
  let offeneAufgabe = null;
  for (let seite = 1; seite <= 10 && !offeneAufgabe; seite++) {
    await expect(eintraege.first()).toBeVisible();
    const treffer = eintraege.filter({ hasText: /offen/ }).first();
    if (await treffer.count()) {
      offeneAufgabe = treffer;
      break;
    }
    const weiter = page
      .getByRole("navigation", { name: "Seiten der Liste" })
      .getByRole("link", { name: /Weiter/ });
    if (!(await weiter.count())) break;
    await weiter.click();
    await expect(page).toHaveURL(new RegExp(`seite=${seite + 1}`));
  }
  test.skip(!offeneAufgabe, "Vorbedingung fehlt: keine offene Aufgabe der eigenen Brigade.");
  await offeneAufgabe!.click();

  // Der naechste Schritt steht in der Detailansicht (WMCNL-2488).
  const panel = page.getByRole("region", { name: /^Pflückaufgabe / });
  await panel.getByRole("button", { name: "Aufgabe annehmen" }).click();
  await expect(panel.getByRole("button", { name: "Pflücken starten" })).toBeVisible();
});

test("WMCNL-2420: Pflücker sieht den eigenen Lohnsatz als Berechnungsgrundlage", async ({ page }) => {
  test.fail(true, "Bug WMCNL-2420: Lohnsatz-Abschnitt zeigt 'Noch kein Lohnsatz hinterlegt.'");

  await anmelden(page, "pfluecker");
  await page.goto("/de/dashboard/buero/lohn");

  const lohnsatzAbschnitt = page.locator("section", { hasText: "Lohnsatz" }).first();
  await expect(lohnsatzAbschnitt.getByText("Stundenlohn")).toBeVisible();
  await expect(lohnsatzAbschnitt.getByText("Noch kein Lohnsatz hinterlegt")).toHaveCount(0);
});
