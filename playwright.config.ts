import { defineConfig, devices } from "@playwright/test";

/**
 * Browsertests fuer Damicon: Hauptgeschaeftsprozess (Vorbestellung bis Deckungsbeitrag), Rechte je Rolle,
 * Pflueckaufgabenliste und, mit dem Tag @visuell, der Bildvergleich der Kernseiten.
 *
 * Zielumgebung ist standardmaessig die Demo-/Staging-Instanz, ueberschreibbar per DAMICON_BASE_URL. Die
 * Pipeline (.github/workflows/pr-pipeline.yml) startet den frisch gebauten Stand gegen die lokale Datenbank
 * und setzt DAMICON_BASE_URL=http://localhost:3000. Lokal: npm run dev gegen den lokalen Supabase-Stack,
 * dann DAMICON_BASE_URL=http://localhost:3000 npm run test:e2e.
 *
 * Funktionstests: npm run test:e2e. Bildvergleich: npm run test:visuell (Referenzbilder nur aus der CI-Umgebung,
 * siehe e2e/visuell.spec.ts).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: process.env.DAMICON_BASE_URL ?? "https://damicon.vercel.app",
    locale: "de-DE",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
