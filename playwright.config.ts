import { defineConfig, devices } from "@playwright/test";

/**
 * Regressionstestset fuer den Damicon-Hauptgeschaeftsprozess (Vorbestellung bis
 * Deckungsbeitrag). Zielumgebung ist standardmaessig die Demo-/Staging-Instanz,
 * ueberschreibbar per DAMICON_BASE_URL fuer andere Umgebungen.
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
