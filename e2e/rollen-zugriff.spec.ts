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

test.describe("Dokumente im Damicon-Layout", () => {
  // Je Art: wer sie bekommt, und was ohne Kennung (Beleg, Dossier, Lieferung) herauskommt: das Register, oder 404.
  const ARTEN: { art: string; darf: (rolle: Role) => boolean; ohneKennung: 200 | 404 }[] = [
    { art: "esutd", darf: (r) => hasPermission(r, "personal", "update"), ohneKennung: 200 },
    { art: "esf", darf: (r) => hasPermission(r, "integrationen", "view"), ohneKennung: 200 },
    { art: "nachweise", darf: (r) => hasPermission(r, "dokumente", "view"), ohneKennung: 200 },
    { art: "lieferplan", darf: (r) => hasPermission(r, "b2b_portal", "view"), ohneKennung: 200 },
    { art: "wirtschaftlichkeit", darf: (r) => hasPermission(r, "wirtschaftlichkeit", "view"), ohneKennung: 200 },
    { art: "foerderung", darf: (r) => hasPermission(r, "foerdermittel", "view"), ohneKennung: 404 },
    { art: "lieferung", darf: (r) => hasPermission(r, "logistik", "view") || hasPermission(r, "b2b_portal", "view"), ohneKennung: 404 },
  ];

  test("ohne Anmeldung 401, eine unbekannte Art 404", async ({ page, request }) => {
    expect((await request.get("/api/dokument/esutd")).status()).toBe(401);
    await anmelden(page, "admin");
    expect((await page.request.get("/api/dokument/gibt-es-nicht")).status()).toBe(404);
    expect((await page.request.get("/api/dokument/__proto__")).status()).toBe(404);
  });

  for (const rolle of ROLLEN) {
    test(`${rolle}: jede Dokumentart antwortet nach der Rechtematrix`, async ({ page }) => {
      await anmelden(page, rolle);
      for (const { art, darf, ohneKennung } of ARTEN) {
        const antwort = await page.request.get(`/api/dokument/${art}?sprache=de`);
        const erwartet = darf(RBAC_ROLLE[rolle]) ? ohneKennung : 403;
        expect(antwort.status(), `${rolle}: ${art}`).toBe(erwartet);
        if (erwartet === 200) {
          expect(antwort.headers()["content-type"]).toContain("text/html");
          expect(antwort.headers()["cache-control"]).toBe("no-store");
          const html = await antwort.text();
          expect(html, `${rolle}: ${art}`).toContain('class="deck"');
          expect(html).toContain("SHA-256");
        }
      }
    });
  }

  test("eine Kennung, die es nicht gibt oder die keine ist, ergibt 404", async ({ page }) => {
    await anmelden(page, "admin");
    for (const pfad of ["foerderung?dossier=00000000-0000-4000-8000-000000000000", "lieferung?lieferung=kein-uuid", "esf?beleg=00000000-0000-4000-8000-000000000000", "wirtschaftlichkeit?stand=00000000-0000-4000-8000-000000000000"]) {
      expect((await page.request.get(`/api/dokument/${pfad}`)).status(), pfad).toBe(404);
    }
  });

  test("die Sprache steuert die Texte, eine unbekannte Sprache faellt auf Deutsch zurueck", async ({ page }) => {
    await anmelden(page, "admin");
    const ru = await (await page.request.get("/api/dokument/nachweise?sprache=ru")).text();
    expect(ru).toContain('lang="ru"');
    expect(ru).toContain("Реестр подтверждений");
    const unbekannt = await (await page.request.get("/api/dokument/nachweise?sprache=fr")).text();
    expect(unbekannt).toContain('lang="de"');
  });
});
