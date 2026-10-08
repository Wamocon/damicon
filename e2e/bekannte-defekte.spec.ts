import { test, expect } from "@playwright/test";
import { anmelden } from "./helpers";

/**
 * Nachweis fuer zwei waehrend der Testausfuehrung WMCNL-2411 (21.09.2026)
 * gefundene Defekte. Beide waren bis zum 08.10.2026 als erwartet fehlschlagend
 * markiert (test.fail). Sie sind behoben (Migrationen 20261121000000 und
 * 20261122000000), die Markierung ist entfernt: die Tests laufen jetzt als
 * gewoehnliche Regressionstests. Gegen eine Datenbank ohne diese Migrationen
 * schlagen sie fehl, und das zu Recht.
 *
 * Achtung, schreibend: der erste Test nimmt eine offene Pflueckaufgabe
 * tatsaechlich an. Nicht gegen eine Datenbank laufen lassen, deren Daten
 * erhalten bleiben sollen.
 */

test("WMCNL-2414: Brigade kann eine offene Pflückaufgabe annehmen", async ({ page }) => {
  await anmelden(page, "brigade");
  await page.goto("/de/dashboard/feld/pflueckaufgaben?status=zu-erledigen");

  // Die Liste zeigt 20 Aufgaben je Seite, spaeteste Faelligkeit zuerst: eine
  // offene steht nicht zwingend auf Seite 1. Findet sich keine, wird der Test
  // uebersprungen statt als Fehler gewertet.
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
  await anmelden(page, "pfluecker");
  await page.goto("/de/dashboard/buero/lohn");

  const lohnsatzAbschnitt = page.locator("section", { hasText: "Lohnsatz" }).first();
  await expect(lohnsatzAbschnitt.getByText("Stundenlohn")).toBeVisible();
  await expect(lohnsatzAbschnitt.getByText("Noch kein Lohnsatz hinterlegt")).toHaveCount(0);
});
