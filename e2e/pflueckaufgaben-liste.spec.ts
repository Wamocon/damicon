import { test, expect, type Page } from "@playwright/test";
import { anmelden } from "./helpers";

/**
 * Liste mit Detailansicht auf Feld > Pflueckaufgaben (WMCNL-2488, DESIGN.md
 * Abschnitt 14). Nur lesend: es wird nichts angelegt oder geaendert, die
 * Tests laufen deshalb auch gegen die Vorfuehrumgebung.
 *
 * Geprueft wird, was man der Seite nicht ansieht: dass Auswahl, Reiter und
 * Filter in der Adresse stehen, dass Wechsel keinen Verlaufseintrag anlegen,
 * dass Zurueck die Detailansicht schliesst und der Fokus zurueck auf die
 * Zeile geht, und dass die Seite ohne JavaScript bedienbar bleibt.
 */

const SEITE = "/de/dashboard/feld/pflueckaufgaben";
const eintraege = (page: Page) => page.locator("[data-eintrag]");
const detailansicht = (page: Page) => page.locator("#detailpanel");
const verlauf = (page: Page) => page.evaluate(() => history.length);

test.describe("Pflückaufgaben: Liste mit Detailansicht", () => {
  test.beforeEach(async ({ page }) => {
    await anmelden(page, "leitung");
  });

  test("ohne Auswahl nur die Liste, hoechstens 20 Eintraege", async ({ page }) => {
    await page.goto(SEITE);
    await expect(eintraege(page).first()).toBeVisible();
    await expect(detailansicht(page)).toHaveCount(0);
    expect(await eintraege(page).count()).toBeLessThanOrEqual(20);
  });

  test("oeffnen, weiterblaettern, Reiter behalten, Zurueck schliesst", async ({ page }) => {
    await page.goto(SEITE);
    const erste = eintraege(page).first();
    const id = (await erste.getAttribute("id"))!.replace("eintrag-", "");
    await erste.click();

    await expect(page).toHaveURL(new RegExp(`aufgabe=${id}`));
    await expect(detailansicht(page)).toBeVisible();
    await expect(page.locator("#detailpanel-titel")).toBeFocused();
    const nachOeffnen = await verlauf(page);

    // Reiter und Pfeile ersetzen den Verlaufseintrag.
    await detailansicht(page).getByRole("link", { name: /^Fotobelege/ }).click();
    await expect(page).toHaveURL(/reiter=fotos/);
    const weiter = detailansicht(page).getByRole("link", { name: "Nächster Eintrag" });
    if (await weiter.count()) {
      await weiter.click();
      await expect(page).not.toHaveURL(new RegExp(`aufgabe=${id}`));
      // Der Reiter bleibt beim Wechsel der Aufgabe stehen.
      await expect(page).toHaveURL(/reiter=fotos/);
    }
    expect(await verlauf(page)).toBe(nachOeffnen);

    // Zurueck fuehrt auf die Liste von vorher.
    await page.goBack();
    await expect(page).not.toHaveURL(/aufgabe=/);
    await expect(detailansicht(page)).toHaveCount(0);
  });

  test("Schliessen und Esc geben den Fokus an die Zeile zurueck", async ({ page }) => {
    await page.goto(SEITE);
    const erste = eintraege(page).first();
    const zeilenId = (await erste.getAttribute("id"))!;
    await erste.click();
    await expect(detailansicht(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/aufgabe=/);
    await expect(page.locator(`#${zeilenId}`)).toBeFocused();

    await erste.click();
    await detailansicht(page).getByRole("link", { name: "Detailansicht schließen" }).click();
    await expect(page).not.toHaveURL(/aufgabe=/);
    await expect(page.locator(`#${zeilenId}`)).toBeFocused();
  });

  test("eine Status-Pille springt auf Seite 1", async ({ page }) => {
    await page.goto(SEITE);
    const blaettern = page.getByRole("navigation", { name: "Seiten der Liste" });
    test.skip(!(await blaettern.count()), "Weniger als 20 Aufgaben, nichts zu blaettern.");

    await blaettern.getByRole("link", { name: /Weiter/ }).click();
    await expect(page).toHaveURL(/seite=2/);

    await page
      .getByRole("navigation", { name: "Status" })
      .getByRole("link", { name: /^Abgeschlossen/ })
      .click();
    await expect(page).toHaveURL(/status=abgeschlossen/);
    await expect(page).not.toHaveURL(/seite=/);
  });

  test("die Suche greift nach der Tipppause", async ({ page }) => {
    await page.goto(SEITE);
    const code = (await eintraege(page).first().locator(".font-mono").textContent())!.trim();
    await page.getByRole("searchbox", { name: "Suche" }).fill(code);
    await expect(page).toHaveURL(new RegExp(`suche=${code}`));
    await expect(eintraege(page).first()).toContainText(code);
  });

  test("auf dem Handy ersetzt die Detailansicht die Liste", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SEITE);
    await eintraege(page).first().click();
    await expect(detailansicht(page)).toBeVisible();
    await expect(eintraege(page).first()).toBeHidden();

    await detailansicht(page).getByRole("link", { name: "Zur Liste" }).click();
    await expect(page).not.toHaveURL(/aufgabe=/);
    await expect(eintraege(page).first()).toBeVisible();
    // Kein waagerechtes Scrollen der Seite, auch nicht mit der Pillenreihe.
    const ueberstand = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(ueberstand).toBeLessThanOrEqual(0);
  });
});

// Ganz ohne JavaScript zeigt das Dashboard nur den Ladezustand: die
// Modulseiten streamen ueber loading.tsx, und das Einsetzen des Inhalts
// uebernimmt ein Inline-Skript. Geprueft wird deshalb der Fall, der im Feld
// vorkommt - das Skript-Bundle ist noch nicht da oder kommt nie an. Dann
// bleiben die Links bedienbar, und Enter schickt die Suche als GET-Formular ab.
// Das Filterblatt auf dem Handy braucht das Skript (DESIGN.md Abschnitt 14).
test.describe("Pflückaufgaben ohne geladenes Skript-Bundle", () => {
  test("Suche per Formular und Detailansicht per Link", async ({ page }) => {
    await anmelden(page, "leitung");
    await page.route("**/_next/static/chunks/**", (route) => route.abort());

    await page.goto(SEITE);
    const suche = page.getByRole("searchbox", { name: "Suche" });
    await suche.fill("PA-");
    await suche.press("Enter");
    await expect(page).toHaveURL(/suche=PA-/);

    const erste = eintraege(page).first();
    const id = (await erste.getAttribute("id"))!.replace("eintrag-", "");
    await erste.click();
    await expect(page).toHaveURL(new RegExp(`aufgabe=${id}`));
    await expect(detailansicht(page)).toBeVisible();
  });
});
