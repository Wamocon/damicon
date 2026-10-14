import { test, expect, type Page } from "@playwright/test";
import { anmelden } from "./helpers";

/**
 * Visuelle Regression (WMCNL-1460): Bildvergleich der Kernseiten in Hell und Dunkel und in den vier Sprachen.
 *
 * Die Referenzbilder entstehen in der CI-Umgebung (Linux, derselbe Browser, dieselben Schriften) und liegen
 * unter e2e/visuell.spec.ts-snapshots/. Ein Bild von einem anderen Rechner wuerde bei jeder kleinen
 * Schriftglaettung scheitern. Neu erzeugen: npm run test:visuell:aktualisieren (oder der Workflow
 * "Visuelle Referenz" in GitHub), dann die Bilder pruefen und einchecken. Ohne eingecheckte Bilder erzeugt die
 * Pipeline sie nur und haengt sie als Artefakt an, ohne zu scheitern.
 *
 * Gewaehlt sind Seiten, deren Inhalt aus den Seed-Daten kommt und nicht von der Tageszeit oder vom Datum abhaengt:
 * oeffentliche Seiten und Stammdatenseiten des Portals. Bilder mit Uhrzeit, Fristen in Tagen oder Live-Werten
 * (Uebersicht, Aufgabenlisten) wuerden taeglich abweichen. Das Haustier ist ausgeblendet (visuell.css).
 *
 * Der Tag @visuell trennt diese Datei von den Funktionstests: npm run test:e2e laesst sie aus.
 */

const ANSICHT = { width: 1280, height: 800 };

async function thema(page: Page, dunkel: boolean) {
  await page.addInitScript((wert) => {
    try {
      localStorage.setItem("damicon-theme", wert);
    } catch {
      // Ohne localStorage bleibt es beim Standard der Seite.
    }
  }, dunkel ? "dark" : "light");
}

async function bild(page: Page, name: string) {
  // Schriften und Bilder fertig laden lassen, dann ruhige Momentaufnahme.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    stylePath: "e2e/visuell.css",
    maxDiffPixelRatio: 0.01,
  });
}

const SPRACHEN = ["de", "en", "kk", "ru"] as const;

test.describe("@visuell oeffentliche Seiten", () => {
  test.use({ viewport: ANSICHT });

  const SEITEN: { name: string; pfad: string }[] = [
    { name: "startseite", pfad: "" },
    { name: "anmeldung", pfad: "/login" },
    { name: "herkunft", pfad: "/herkunft" },
    { name: "impressum", pfad: "/impressum" },
    { name: "datenschutz", pfad: "/datenschutz" },
  ];

  // Deutsch in Hell und Dunkel, alle Seiten.
  for (const dunkel of [false, true]) {
    for (const seite of SEITEN) {
      test(`${seite.name}, de, ${dunkel ? "dunkel" : "hell"}`, async ({ page }) => {
        await thema(page, dunkel);
        await page.goto(`/de${seite.pfad}`);
        await bild(page, `${seite.name}-de-${dunkel ? "dunkel" : "hell"}`);
      });
    }
  }

  // Die uebrigen Sprachen: Startseite und Anmeldung in Hell und Dunkel (Textlaenge und Schrift brechen dort zuerst).
  for (const sprache of SPRACHEN.filter((s) => s !== "de")) {
    for (const dunkel of [false, true]) {
      for (const seite of SEITEN.slice(0, 2)) {
        test(`${seite.name}, ${sprache}, ${dunkel ? "dunkel" : "hell"}`, async ({ page }) => {
          await thema(page, dunkel);
          await page.goto(`/${sprache}${seite.pfad}`);
          await bild(page, `${seite.name}-${sprache}-${dunkel ? "dunkel" : "hell"}`);
        });
      }
    }
  }
});

test.describe("@visuell Portal", () => {
  test.use({ viewport: ANSICHT });

  const PORTAL: { name: string; pfad: string }[] = [
    { name: "rollen", pfad: "/dashboard/buero/rollen" },
    { name: "sicherheit", pfad: "/dashboard/sicherheit" },
    { name: "preislisten", pfad: "/dashboard/markt/preislisten" },
    { name: "sortenkatalog", pfad: "/dashboard/markt/sortenkatalog" },
  ];

  for (const dunkel of [false, true]) {
    for (const seite of PORTAL) {
      test(`${seite.name}, de, ${dunkel ? "dunkel" : "hell"}`, async ({ page }) => {
        await thema(page, dunkel);
        await anmelden(page, "admin");
        await page.goto(`/de${seite.pfad}`);
        await page.locator("main").first().waitFor();
        await bild(page, `portal-${seite.name}-de-${dunkel ? "dunkel" : "hell"}`);
      });
    }
  }

  // Zwei Seiten in den anderen Sprachen, hell.
  for (const sprache of SPRACHEN.filter((s) => s !== "de")) {
    for (const seite of [PORTAL[0], PORTAL[3]]) {
      test(`${seite.name}, ${sprache}, hell`, async ({ page }) => {
        await thema(page, false);
        await anmelden(page, "admin");
        await page.goto(`/${sprache}${seite.pfad}`);
        await page.locator("main").first().waitFor();
        await bild(page, `portal-${seite.name}-${sprache}-hell`);
      });
    }
  }
});
