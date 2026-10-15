import { test, expect, type Page } from "@playwright/test";
import { anmelden } from "./helpers";

/**
 * Himbi und das angedockte KI-Panel (haustier.css, haustier-huelle-koerper.ts: usePaneAusweichen). Rückmeldung vom 15.10.2026: Himbi soll nur dann
 * nach links rücken, wenn das Aufgehen des Panels sie verdecken würde. Steht sie weiter links, bleibt sie, wo sie ist.
 *
 * Gemessen wird in einem echten Browser (Layout, CSS-Variablen, Übergang), was jsdom nicht kann. Nur lesend, es wird nichts angelegt.
 * Breite Fenster (ab 1100 px steht das Panel neben der Hauptspalte).
 */

test.use({ viewport: { width: 1600, height: 900 } });

const griff = (page: Page) => page.locator(".haustier__griff");
const kiKnopf = (page: Page) => page.getByRole("button", { name: "KI fragen" }).first();

/** Rechter und linker Rand des Griffs von Himbi in Fensterpixeln. */
async function rand(page: Page): Promise<{ links: number; rechts: number }> {
  const r = await griff(page).evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { links: b.left, rechts: b.right };
  });
  return r;
}

/** Breite des Panels in Pixeln, wie das Dokument sie führt (--ki-pane-breite). */
const paneBreite = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;height:0;width:var(--ki-pane-breite, 25rem)";
    document.body.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  });

async function vorbereiten(page: Page, position?: { x: number; y: number }) {
  await page.addInitScript((pos) => {
    // Keine Tour, kein Tagesgruß: sie würden Himbi und das Panel von sich aus bewegen.
    localStorage.setItem("damicon-haustier-tour", "gesehen");
    localStorage.setItem("damicon-himbi-tagesbeginn-an", "aus");
    if (pos) localStorage.setItem("damicon-haustier-pos", JSON.stringify(pos));
  }, position ?? null);
  await anmelden(page, "admin");
  await page.goto("/de/dashboard");
  await expect(griff(page)).toBeVisible();
  // Der erste Rahmen: die Position ist geklemmt und gespeichert gelesen.
  await page.waitForTimeout(300);
}

test.describe("Himbi weicht dem KI-Panel nur aus, wenn es sie verdecken würde", () => {
  test("an der Standardposition rückt Himbi vor das Panel", async ({ page }) => {
    await vorbereiten(page);
    const vorher = await rand(page);
    expect(vorher.rechts).toBeGreaterThan(1500); // unten rechts

    await kiKnopf(page).click();
    await expect(page.locator(".haustier")).toHaveAttribute("data-pane-offen", "true");
    await page.waitForTimeout(900); // Übergang 0,5 s

    const breite = await paneBreite(page);
    const nachher = await rand(page);
    const paneLinks = 1600 - breite;
    // Himbi steht jetzt links vom Panel (mit Luft) und ist nicht verdeckt.
    expect(nachher.rechts).toBeLessThanOrEqual(paneLinks);
    expect(nachher.rechts).toBeGreaterThan(paneLinks - 60);
    await expect(page.locator(".haustier")).toHaveAttribute("data-pane-verdeckt", "true");
  });

  test("steht Himbi weit links, bewegt sie sich beim Öffnen nicht", async ({ page }) => {
    await vorbereiten(page, { x: -800, y: 0 });
    const vorher = await rand(page);
    expect(vorher.rechts).toBeLessThan(900); // weit links, vom Panel nie berührt

    await kiKnopf(page).click();
    await expect(page.locator(".haustier")).toHaveAttribute("data-pane-offen", "true");
    await page.waitForTimeout(900);

    const nachher = await rand(page);
    expect(Math.abs(nachher.links - vorher.links)).toBeLessThan(1.5);
    expect(Math.abs(nachher.rechts - vorher.rechts)).toBeLessThan(1.5);
    await expect(page.locator(".haustier")).toHaveAttribute("data-pane-verdeckt", "false");
  });

  test("ragt Himbi nur ein Stück in die Fläche des Panels, rückt sie nur so weit wie nötig", async ({ page }) => {
    // 20 px Rand plus 150 px nach links: der rechte Rand liegt bei etwa 1430, das Panel beginnt bei etwa 1200 bis 1250 (Breite 350 bis 400)
    await vorbereiten(page, { x: -150, y: 0 });
    const vorher = await rand(page);
    await kiKnopf(page).click();
    await expect(page.locator(".haustier")).toHaveAttribute("data-pane-offen", "true");
    await page.waitForTimeout(900);
    const breite = await paneBreite(page);
    const nachher = await rand(page);
    const paneLinks = 1600 - breite;
    expect(vorher.rechts).toBeGreaterThan(paneLinks); // das Panel hätte sie verdeckt
    expect(nachher.rechts).toBeLessThanOrEqual(paneLinks);
    // weniger als die ganze Panelbreite: sie rückt nur um die Überlappung plus Luft
    expect(vorher.rechts - nachher.rechts).toBeLessThan(breite);
  });
});
