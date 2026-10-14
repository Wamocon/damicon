import { test, expect } from "@playwright/test";
import { anmelden, KONTEN, type Rolle } from "./helpers";
import { hasPermission, type Role } from "@/lib/rbac";
import { modules, moduleHref, zones } from "@/lib/modules";

/**
 * Rechte und Weiterleitungen im Browser (WMCNL-1461, Teil Oberflaeche). Der Datenbankabgleich
 * (npm run test:rbac-rls) prueft, was die Zeilensicherheit zulaesst. Hier steht die andere Seite: was die
 * Oberflaeche je Rolle zeigt. Die Erwartung kommt aus derselben Rechtematrix, nach der sich das Portal richtet
 * (src/lib/rbac.ts), nicht aus einer zweiten Liste: ein neues Modul oder ein geaendertes Recht gilt damit
 * auch hier, ohne dass jemand daran denken muss.
 *
 * Nur lesend. Laeuft gegen die lokale Instanz in der CI und gegen jede Umgebung mit den Demo-Konten.
 */

const RBAC_ROLLE: Record<Rolle, Role> = {
  admin: "admin",
  ceo: "ceo",
  leitung: "betriebsleitung",
  buchhaltung: "buchhaltung",
  brigade: "brigade",
  pfluecker: "picker",
  erzeuger: "erzeuger",
  kunde: "kunde",
};

const ROLLEN = Object.keys(KONTEN) as Rolle[];

test.describe("Module je Rolle", () => {
  for (const rolle of ROLLEN) {
    test(`${rolle}: jedes Modul zeigt sich oder ist gesperrt, wie die Rechtematrix es vorgibt`, async ({ page }) => {
      test.setTimeout(240_000);
      await anmelden(page, rolle);

      const abweichungen: string[] = [];
      for (const modul of modules) {
        const erlaubt = hasPermission(RBAC_ROLLE[rolle], modul.resource, "view");
        const antwort = await page.goto(moduleHref(modul).replace(/^/, "/de"), { waitUntil: "domcontentloaded" });
        // "main" erst, wenn die Seite fertig gezeichnet ist: die Sperre und die Ansicht kommen beide aus dem Server.
        await page.locator("main").first().waitFor();
        const text = await page.locator("main").first().innerText();
        const gesperrt = /keinen Zugriff/.test(text);
        if (antwort?.status() !== 200) abweichungen.push(`${modul.key}: Status ${antwort?.status()}`);
        else if (gesperrt === erlaubt) abweichungen.push(`${modul.key}: Matrix ${erlaubt ? "erlaubt" : "sperrt"}, Seite ${gesperrt ? "gesperrt" : "offen"}`);
      }
      expect(abweichungen, abweichungen.join("\n")).toEqual([]);
    });
  }
});

test.describe("Bereichsseiten und Weiterleitungen", () => {
  test("ohne Anmeldung leitet jede Seite unter /dashboard auf die Anmeldung um", async ({ page }) => {
    for (const pfad of ["/de/dashboard", "/de/dashboard/buero/dokumente", "/de/dashboard/hof/lieferschein-esf", "/de/dashboard/sicherheit"]) {
      await page.goto(pfad);
      await expect(page, pfad).toHaveURL(/\/de\/login/);
    }
  });

  test("angemeldet leitet die Anmeldeseite auf das Portal weiter", async ({ page }) => {
    await anmelden(page, "admin");
    await page.goto("/de/login");
    await expect(page).toHaveURL(/\/de\/dashboard/);
  });

  test("ein unbekanntes Modul ergibt 404, auch angemeldet", async ({ page }) => {
    await anmelden(page, "admin");
    const antwort = await page.goto("/de/dashboard/buero/gibt-es-nicht");
    expect(antwort?.status()).toBe(404);
  });

  for (const rolle of ROLLEN) {
    test(`${rolle}: jede Bereichsseite antwortet`, async ({ page }) => {
      await anmelden(page, rolle);
      for (const zone of zones) {
        const antwort = await page.goto(`/de/dashboard/${zone.key}`);
        expect(antwort?.status(), `${rolle}: ${zone.key}`).toBe(200);
      }
    });
  }
});

test.describe("Schnittstellen mit eigener Rechtepruefung", () => {
  // Liefertermine: wer das B2B-Portal sehen darf. Meldungen ins ЕСУТД: wer Personal aendern darf.
  const ERWARTUNG: { pfad: string; ressource: Parameters<typeof hasPermission>[1]; aktion: Parameters<typeof hasPermission>[2] }[] = [
    { pfad: "/api/lieferplan", ressource: "b2b_portal", aktion: "view" },
    { pfad: "/api/esutd/export", ressource: "personal", aktion: "update" },
  ];

  for (const { pfad, ressource, aktion } of ERWARTUNG) {
    test(`${pfad}: ohne Anmeldung 401`, async ({ request }) => {
      const antwort = await request.get(pfad);
      expect(antwort.status()).toBe(401);
    });

    for (const rolle of ROLLEN) {
      const erlaubt = hasPermission(RBAC_ROLLE[rolle], ressource, aktion);
      test(`${pfad}: ${rolle} bekommt ${erlaubt ? "200" : "403"}`, async ({ page }) => {
        await anmelden(page, rolle);
        const antwort = await page.request.get(pfad);
        expect(antwort.status()).toBe(erlaubt ? 200 : 403);
        if (erlaubt) expect(antwort.headers()["cache-control"]).toBe("no-store");
      });
    }
  }
});
