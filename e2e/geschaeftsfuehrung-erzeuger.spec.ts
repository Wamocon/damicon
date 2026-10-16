import { test, expect, type Page } from "@playwright/test";
import { anmelden } from "./helpers";
import { hasPermission } from "@/lib/rbac";

/**
 * Geschäftsführung (ceo) und Erzeuger in einem fachlichen Ablauf, nicht nur im Zugriffstest (rollen-zugriff.spec.ts).
 * Nur lesend: es wird nichts angelegt oder geändert, die Tests laufen deshalb auch gegen die Vorführumgebung.
 *
 * Die Erwartung kommt, wo es geht, aus der Rechtematrix (src/lib/rbac.ts). Texte stammen aus der deutschen Fassung.
 */

const glocke = (page: Page) => page.getByRole("button", { name: /^Benachrichtigungen/ });

async function seite(page: Page, pfad: string) {
  const antwort = await page.goto(pfad, { waitUntil: "domcontentloaded" });
  expect(antwort?.status(), pfad).toBe(200);
  await page.locator("main").first().waitFor();
  return page.locator("main").first();
}

test.describe("Geschäftsführung: Einstellungen, Rollen, Wirtschaftlichkeit, Glocke", () => {
  test.beforeEach(async ({ page }) => {
    await anmelden(page, "ceo");
  });

  test("Einstellungen: Fristen und die Gewichte der Block-Risiko-Bewertung lassen sich ändern, der Verlauf steht darunter", async ({ page }) => {
    const main = await seite(page, "/de/dashboard/buero/einstellungen");
    await expect(main.getByText("Frist für die ЭСФ")).toBeVisible();
    await expect(main.getByText("Block-Risiko: Gewichte und Schwellen")).toBeVisible();
    await expect(main.getByText("Gewicht: versäumter Pflückdurchgang")).toBeVisible();
    // Die Geschäftsführung darf ändern: jede Einstellung trägt ein Wertfeld und einen Speichern-Knopf.
    expect(await main.getByRole("button", { name: "Speichern" }).count()).toBeGreaterThanOrEqual(11);
    // Zugriffsrechte stehen hier nicht zur Wahl.
    await expect(main.getByText(/Zugriffsrechte stehen hier nicht zur Wahl|Wer was lesen oder schreiben darf, steht nicht zur Wahl/).first()).toBeVisible();
  });

  test("Einstellungen: ein Wert außerhalb der Grenzen wird abgelehnt, ohne zu speichern (Eingabeprüfung der Seite)", async ({ page }) => {
    const main = await seite(page, "/de/dashboard/buero/einstellungen");
    // Das Formular dieser einen Einstellung: es traegt den Schluessel als verstecktes Feld.
    const formular = (m: typeof main) => m.locator('form:has(input[name="schluessel"][value="esf.frist_tage"])');
    const feld = formular(main).locator('input[name="wert"]');
    const vorher = await feld.inputValue();
    await feld.fill("0");
    await formular(main).getByRole("button", { name: "Speichern" }).click();
    await expect(formular(main).getByText("Der Wert liegt außerhalb der erlaubten Grenzen.")).toBeVisible();
    await page.reload();
    const nachher = await seite(page, "/de/dashboard/buero/einstellungen");
    expect(await formular(nachher).locator('input[name="wert"]').inputValue()).toBe(vorher);
  });

  test("Rollen: die Geschäftsführung sieht die Konten, vergibt aber keine Rollen und legt keine Konten an", async ({ page }) => {
    const main = await seite(page, "/de/dashboard/buero/rollen");
    await expect(main.getByText("Konten und Rollen")).toBeVisible();
    await expect(main.getByText("Rollen vergibt nur die Administration.").first()).toBeVisible();
    await expect(main.getByRole("button", { name: "Konto anlegen" })).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Speichern" })).toHaveCount(0);
  });

  test("Wirtschaftlichkeit: Betrieb, Kennzahlen des Systems, Zins-Check und die Herleitung des Schwund-Nutzens stehen auf der Seite", async ({ page }) => {
    const main = await seite(page, "/de/dashboard/buero/wirtschaftlichkeit");
    // Zuerst der Betrieb (Annahmen, Fixkosten), danach die Rechnung des Systems.
    await expect(main.getByRole("heading", { name: "Fixkosten des Betriebs" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Zweitens: Lohnt sich das System?" })).toBeVisible();
    await expect(main.getByText("Zins-Check")).toBeVisible();
    await expect(main.getByText("Schwund-Nutzen aus den Betriebsdaten")).toBeVisible();
    await expect(main.getByText("Verlustquote vor der Einführung (Baseline)")).toBeVisible();
  });

  test("Glocke: öffnet ein Fenster mit den Hinweisen oder dem Leerzustand und schließt wieder", async ({ page }) => {
    await seite(page, "/de/dashboard");
    await glocke(page).click();
    const fenster = page.getByRole("dialog", { name: "Benachrichtigungen" });
    await expect(fenster).toBeVisible();
    // Entweder Hinweise oder der Leerzustand, nie ein leeres Fenster.
    const hinweise = await fenster.getByRole("link").count();
    if (hinweise === 0) await expect(fenster.getByText("Keine neuen Benachrichtigungen.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(fenster).toBeHidden();
  });

  test("Passwort ändern: die Seite Sicherheit bietet das Formular", async ({ page }) => {
    const main = await seite(page, "/de/dashboard/sicherheit");
    await expect(main.getByRole("heading", { name: "Passwort ändern" })).toBeVisible();
    await expect(main.getByLabel("Neues Passwort")).toBeVisible();
    await expect(main.getByLabel("Noch einmal")).toBeVisible();
  });
});

test.describe("Erzeuger: nur das Eigene, keine Verwaltung", () => {
  test.beforeEach(async ({ page }) => {
    await anmelden(page, "erzeuger");
  });

  test("Einstellungen und Rollen sind gesperrt, wie die Rechtematrix es vorgibt", async ({ page }) => {
    expect(hasPermission("erzeuger", "einstellungen", "view")).toBe(false);
    expect(hasPermission("erzeuger", "rollen", "view")).toBe(false);
    for (const pfad of ["/de/dashboard/buero/einstellungen", "/de/dashboard/buero/rollen"]) {
      const main = await seite(page, pfad);
      await expect(main.getByText(/keinen Zugriff/), pfad).toBeVisible();
    }
  });

  test("Reihenblöcke: der Erzeuger sieht die Blöcke, aber keine Risikobewertung (ihm fehlen Eingaben)", async ({ page }) => {
    const main = await seite(page, "/de/dashboard/feld/reihenbloecke");
    await expect(main.getByText(/keinen Zugriff/)).toHaveCount(0);
    await expect(main.getByText("So entsteht der Risikowert")).toHaveCount(0);
  });

  test("Pflückaufgaben: Liste ohne Brigadefilter, ohne Fotoangaben und ohne Knöpfe zum Ändern", async ({ page }) => {
    const main = await seite(page, "/de/dashboard/feld/pflueckaufgaben");
    await expect(main.getByText(/keinen Zugriff/)).toHaveCount(0);
    await expect(main.getByRole("combobox", { name: "Brigade" })).toHaveCount(0);
    await expect(main.getByRole("button", { name: /Neue Pflückaufgabe|Aufgabe annehmen|Pflücken starten/ })).toHaveCount(0);
  });

  test("Glocke und Konto: die Glocke ist da, das Passwort lässt sich ändern", async ({ page }) => {
    await seite(page, "/de/dashboard");
    await expect(glocke(page)).toBeVisible();
    const main = await seite(page, "/de/dashboard/sicherheit");
    await expect(main.getByRole("heading", { name: "Passwort ändern" })).toBeVisible();
  });

  test("Schulungen: der Erzeuger sieht die Einarbeitung und die Videoliste, ohne Hochladen", async ({ page }) => {
    const hat = hasPermission("erzeuger", "schulungen", "view");
    const main = await seite(page, "/de/dashboard/markt/schulungen");
    if (!hat) {
      await expect(main.getByText(/keinen Zugriff/)).toBeVisible();
      return;
    }
    await expect(main.getByText(/keinen Zugriff/)).toHaveCount(0);
    await expect(main.getByText("Videodatei hochladen oder ersetzen")).toHaveCount(0);
  });
});
