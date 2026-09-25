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
// Ueber die Rolle statt ueber #detailpanel: waehrend React streamt, steht die
// Detailansicht kurz doppelt im Dokument, einmal davon versteckt.
const detailansicht = (page: Page) => page.getByRole("region", { name: /^Pflückaufgabe / });
const verlauf = (page: Page) => page.evaluate(() => history.length);
const zahl = (text: string | null) => Number((text ?? "").replace(/\D/g, "") || 0);

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
    // Die erste Zeile hat immer einen Nachfolger, sobald die Liste zwei hat.
    const weiter = detailansicht(page).getByRole("link", { name: "Nächster Eintrag" });
    await expect(weiter).toBeVisible();
    await weiter.click();
    await expect(page).not.toHaveURL(new RegExp(`aufgabe=${id}`));
    // Der Reiter bleibt beim Wechsel der Aufgabe stehen.
    await expect(page).toHaveURL(/reiter=fotos/);
    expect(await verlauf(page)).toBe(nachOeffnen);

    // Zurueck fuehrt genau auf die Liste von vorher: nicht auf eine zuvor
    // angesehene Aufgabe und nicht aus der Seite heraus.
    await page.goBack();
    await expect(page).toHaveURL(/\/feld\/pflueckaufgaben$/);
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
    // Erst die Liste abwarten: count() wartet nicht, und vor dem Streamen
    // der Liste uebersprang sich der Test sonst selbst.
    await expect(eintraege(page).first()).toBeVisible();
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
    // Der Code der letzten Zeile: die erste enthielte ihn auch ohne Filter.
    const code = (await eintraege(page).last().locator(".font-mono").textContent())!.trim();
    await page.getByRole("searchbox", { name: "Suche" }).fill(code);
    await expect(page).toHaveURL(new RegExp(`suche=${code}`));
    await expect(eintraege(page)).toHaveCount(1);
    await expect(eintraege(page).first()).toContainText(code);
  });

  test("die Zahlen an den Pillen passen zueinander und zur Liste", async ({ page }) => {
    await page.goto(SEITE);
    const status = page.getByRole("navigation", { name: "Status" });
    const anzahl = async (name: RegExp) =>
      zahl(await status.getByRole("link", { name }).locator("span").first().textContent());
    const alle = await anzahl(/^Alle/);
    const offen = await anzahl(/^Zu erledigen/);
    const ueberfaellig = await anzahl(/^Überfällig/);
    const pruefung = await anzahl(/^Belegprüfung/);
    const fertig = await anzahl(/^Abgeschlossen/);
    expect(offen + fertig).toBe(alle);
    expect(ueberfaellig).toBeLessThanOrEqual(offen);
    expect(pruefung).toBeLessThanOrEqual(offen);

    // Eine kleine Pille ganz durchblaettern: so viele Zeilen, wie sie verspricht.
    const kandidaten = [
      { name: /^Belegprüfung/, soll: pruefung },
      { name: /^Überfällig/, soll: ueberfaellig },
      { name: /^Zu erledigen/, soll: offen },
      { name: /^Abgeschlossen/, soll: fertig },
    ].filter((pille) => pille.soll > 0 && pille.soll <= 60);
    test.skip(kandidaten.length === 0, "Keine Pille mit 1 bis 60 Aufgaben in den Testdaten.");
    // Die groesste passende, damit moeglichst ueber mehrere Seiten gezaehlt wird.
    const { name, soll } = kandidaten.sort((a, b) => b.soll - a.soll)[0];
    await status.getByRole("link", { name }).click();
    await expect(status.getByRole("link", { name })).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#liste p[aria-live]")).toHaveText(new RegExp(`^${soll}\\s`));

    let gezaehlt = 0;
    for (let seite = 1; ; seite++) {
      await expect(eintraege(page).first()).toBeVisible();
      gezaehlt += await eintraege(page).count();
      const weiter = page
        .getByRole("navigation", { name: "Seiten der Liste" })
        .getByRole("link", { name: /Weiter/ });
      if (!(await weiter.count())) break;
      await weiter.click();
      await expect(page).toHaveURL(new RegExp(`seite=${seite + 1}`));
    }
    expect(gezaehlt).toBe(soll);
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

// Die Brigade darf nur eigene und freie Aufgaben bearbeiten
// (20261018000000_brigade_schreibumfang.sql). Mit "Alle Brigaden" sieht sie
// auch fremde; dort darf die Oberflaeche keine Knoepfe zeigen, die die
// Datenbank ablehnen wuerde. Fremd heisst: nicht die Brigade, deren Aufgaben
// unter "Eigene Brigade" stehen - bestimmt aus der Liste, nicht aus den
// Knoepfen, die hier geprueft werden.
test.describe("Pflückaufgaben als Brigade", () => {
  test("an Aufgaben anderer Brigaden nur der Hinweis, keine Knöpfe", async ({ page }) => {
    await anmelden(page, "brigade");
    await page.goto(`${SEITE}?brigade=meine`);
    await expect(eintraege(page).first()).toBeVisible();
    const orte = await eintraege(page).locator("p").allTextContents();
    const eigene = new Set(
      orte.map((ort) => ort.split(" · ")[0].trim()).filter((name) => name !== "Ohne Brigade"),
    );
    test.skip(eigene.size === 0, "Die Brigade-Anmeldung hat auf Seite 1 keine eigenen Aufgaben.");

    const optionen = await page
      .locator('select[name="brigade"]')
      .first()
      .locator("option")
      .evaluateAll((liste) =>
        liste.map((option) => ({
          wert: (option as HTMLOptionElement).value,
          text: option.textContent?.trim() ?? "",
        })),
      );
    const fremde = optionen.find(
      (option) => !["alle", "meine", "ohne"].includes(option.wert) && !eigene.has(option.text),
    );
    test.skip(!fremde, "Es gibt keine zweite Brigade.");

    await page.goto(`${SEITE}?brigade=${fremde!.wert}&status=zu-erledigen`);
    const erste = eintraege(page).first();
    test.skip(!(await erste.count()), "Die andere Brigade hat keine offenen Aufgaben.");
    await erste.click();

    const schritt = detailansicht(page).getByRole("region", { name: "Nächster Schritt" });
    await expect(
      schritt.getByText(/gehört zu einer anderen Brigade|wartet auf die Belegprüfung/),
    ).toBeVisible();
    await expect(schritt.getByRole("button")).toHaveCount(0);
    await expect(schritt.getByText("Menge korrigieren")).toHaveCount(0);
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
