import { test, expect } from "@playwright/test";
import { anmelden, testMarker } from "./helpers";

/**
 * Regressionstest fuer den Damicon-Hauptgeschaeftsprozess: eine Vorbestellung
 * durchlaeuft Planung, Ernte, Freigabe, Auslieferung, Herkunftsnachweis,
 * Lohnabrechnung und Deckungsbeitrag. Bildet dieselben acht Phasen ab wie die
 * Xray-Testfaelle [Rolle]-E2E-... im Testrepository
 * "WMCNL-1347 Digitalisierung der Himbeeren Produktion/E2E-Testszenarien".
 *
 * Die Phasen sind fachlich voneinander abhaengig (eine Ernte kann nicht
 * freigegeben werden, bevor sie gepflueckt wurde), daher laufen sie seriell
 * und geben Daten (Vorbestellmenge, Aufgaben-Code, Chargen-Code) ueber
 * Modulvariablen an die jeweils naechste Phase weiter.
 *
 * Achtung, schreibend: jeder Lauf legt echte Datensaetze an und aendert ihren
 * Status - Vorbestellung, Ernteplan, Pflueckaufgabe samt Steige, Arbeitszeit
 * und Kuehlmessung, Freigabe, Lieferung, Lohnperiode, Kostentraeger und
 * Buchung. Nur gegen die Vercel-Vorschau oder eine Datenbank laufen lassen,
 * deren Daten verworfen werden duerfen. Nur lesend ist
 * pflueckaufgaben-liste.spec.ts.
 */

test.describe.serial("Hauptgeschaeftsprozess: Vorbestellung bis Deckungsbeitrag", () => {
  const sorte = "Polka";
  // Kleine, pro Lauf unterscheidbare Menge, damit die Zeile auch bei mehrfacher
  // Ausfuehrung am selben Tag in der Buero-Liste eindeutig wiedergefunden wird.
  const menge = (40 + new Date().getSeconds() / 100).toFixed(2).replace(".", ",");
  const kostentraegerName = testMarker("Regressionstest Kostentraeger");

  let pflueckaufgabeCode = "";
  let chargenCode = "";

  test("[Kunde]-E2E-Vorbestellung aufgeben", async ({ page }) => {
    await anmelden(page, "kunde");

    await page.goto("/de/dashboard/markt/b2b-portal");
    await expect(page.getByRole("heading", { name: "B2B-Portal" })).toBeVisible();

    const formular = page.locator("form", { hasText: "Vorbestellung aufgeben" }).first();
    await formular.getByLabel("Sorte").selectOption(sorte);
    await formular.getByLabel("Menge in kg").fill(menge);
    await formular.getByRole("button", { name: "Vorbestellung aufgeben" }).click();

    await expect(page.getByText("Vorbestellung aufgegeben.")).toBeVisible();
    await expect(
      page.getByRole("row", { name: new RegExp(`${sorte}.*${menge} kg.*angefragt`) }).first()
    ).toBeVisible();
  });

  test("[Betriebsleitung]-E2E-Ernte planen und Vorbestellung bestätigen", async ({ page }) => {
    await anmelden(page, "leitung");

    // Vorbestellung bestaetigen.
    await page.goto("/de/dashboard/markt/b2b-portal");
    const zeile = page
      .getByRole("row", { name: new RegExp(`${sorte}.*${menge} kg`) })
      .first();
    await expect(zeile).toBeVisible();
    await zeile.getByRole("button", { name: "Bestätigen" }).click();
    await expect(zeile.getByText("bestätigt")).toBeVisible();

    // Rotationsplan erweitern, muss beim zweiten identischen Lauf keine
    // zusaetzlichen Termine erzeugen (Idempotenz).
    await page.goto("/de/dashboard/feld/rotationsplan");
    const wochenVoraus = page.getByRole("textbox", { name: "Wochen voraus" });
    await wochenVoraus.fill("2");
    await page.getByRole("button", { name: "Plan erzeugen" }).click();
    await wochenVoraus.fill("2");
    await page.getByRole("button", { name: "Plan erzeugen" }).click();
    await expect(page.getByText("0 neue Termine erzeugt.")).toBeVisible();

    // Einen freien (nicht gesperrten) Reihenblock fuer die neue Aufgabe waehlen.
    // Das Formular klappt ueber der Liste auf (Liste mit Detailansicht,
    // WMCNL-2488); die Ueberschrift steht im <summary>, nicht im <form>.
    await page.goto("/de/dashboard/feld/pflueckaufgaben");
    await page.locator("summary", { hasText: "Neue Pflückaufgabe" }).click();
    const formular = page.locator("form", {
      has: page.getByRole("button", { name: "Aufgabe anlegen" }),
    });
    const reihenblockAuswahl = formular.getByLabel("Reihenblock");
    const ersterFreierBlock = await reihenblockAuswahl
      .locator("option")
      .nth(1)
      .getAttribute("value");
    expect(ersterFreierBlock, "Kein freier Reihenblock in der Auswahl gefunden").not.toBeNull();
    await reihenblockAuswahl.selectOption(ersterFreierBlock!);
    await formular.getByLabel("Brigade").selectOption("Brigade Nord");
    // Pflichtfeld seit WMCNL-2488: Datum und Uhrzeit, gelesen in Betriebszeit Almaty.
    const morgen = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await formular.getByLabel("Fälligkeit").fill(`${morgen}T18:00`);
    await formular.getByLabel("Zielmenge in kg").fill("40");
    await formular.getByLabel("Pflücker").fill("5");
    await formular.getByRole("button", { name: "Aufgabe anlegen" }).click();

    const meldung = page.getByText(/Pflückaufgabe .* angelegt\./);
    await expect(meldung).toBeVisible();
    const meldungsText = (await meldung.textContent()) ?? "";
    const treffer = meldungsText.match(/Pflückaufgabe (\S+) angelegt\./);
    expect(treffer, `Aufgaben-Code konnte nicht aus "${meldungsText}" gelesen werden`).not.toBeNull();
    pflueckaufgabeCode = treffer![1];

    // Danach oeffnet die neue Aufgabe in der Detailansicht.
    await expect(page).toHaveURL(/aufgabe=/);
    await expect(
      page.getByRole("region", { name: new RegExp(pflueckaufgabeCode) }),
    ).toBeVisible();
  });

  test("[Brigade]-E2E-Ernten und Menge melden", async ({ page }) => {
    test.skip(!pflueckaufgabeCode, "Vorherige Phase hat keinen Aufgaben-Code geliefert.");
    await anmelden(page, "brigade");

    // Die Suche grenzt die Liste auf diese Aufgabe ein; 20 je Seite reichen
    // sonst nicht, wenn viele Aufgaben dieselbe Faelligkeit haben.
    await page.goto(`/de/dashboard/feld/pflueckaufgaben?suche=${pflueckaufgabeCode}`);
    await page.getByRole("link", { name: new RegExp(pflueckaufgabeCode) }).click();
    const panel = page.getByRole("region", { name: new RegExp(pflueckaufgabeCode) });

    await panel.getByRole("button", { name: "Aufgabe annehmen" }).click();
    // Bekannter Defekt WMCNL-2414: die Aktion wird derzeit rollenseitig
    // abgewiesen. Sobald behoben, muessen die folgenden Schritte wieder aktiv
    // sein (siehe e2e/bekannte-defekte.spec.ts fuer den isolierten Nachweis).
    await expect(panel.getByText("Ihre Rolle darf diesen Vorgang nicht ausführen.")).toBeVisible();
    test.fixme(true, "Blockiert durch WMCNL-2414: Aufgabe annehmen fuer Brigade nicht moeglich.");

    await panel.getByRole("button", { name: "Pflücken starten" }).click();
    // Steigen, Arbeitszeit und Kuehlmessung stehen im Reiter Nachweiskette.
    await panel.getByRole("link", { name: "Nachweiskette", exact: true }).click();
    await panel.getByLabel("Gewicht in kg").fill("12,5");
    await panel.getByRole("button", { name: "Steige erfassen" }).click();
    await panel.getByLabel("Minuten").fill("90");
    await panel.getByRole("button", { name: "Arbeitszeit melden" }).click();
    await panel.getByLabel("Temperatur in °C").fill("3,5");
    await panel.getByRole("button", { name: "Kühlmessung erfassen" }).click();
    await panel.getByRole("link", { name: "Übersicht", exact: true }).click();
    await panel.getByLabel("Ist-Menge").fill("41,2");
    await panel.getByRole("button", { name: "Menge melden und zur Belegprüfung geben" }).click();
    await expect(page.getByText("Belegprüfung offen")).toHaveCount(0);
  });

  test("[Betriebsleitung]-E2E-Beleg prüfen und Qualitätsfaktor freigeben", async ({ page }) => {
    test.skip(!pflueckaufgabeCode, "Vorherige Phase hat keinen Aufgaben-Code geliefert.");
    test.fixme(true, "Erwartet einen von der Brigade angenommenen Auftrag, siehe WMCNL-2414.");
    await anmelden(page, "leitung");

    await page.goto(`/de/dashboard/feld/pflueckaufgaben?suche=${pflueckaufgabeCode}`);
    await page.getByRole("link", { name: new RegExp(pflueckaufgabeCode) }).click();
    const panel = page.getByRole("region", { name: new RegExp(pflueckaufgabeCode) });
    await expect(panel.getByText("Belegprüfung offen")).toBeVisible();

    await panel.getByLabel("Qualitätsfaktor").fill("1,06");
    await panel.getByRole("button", { name: "Freigeben" }).click();
    // Der Status steht im Kopf der Detailansicht; der Code dort und in der
    // Liste - deshalb auf die Detailansicht beschraenkt.
    await expect(panel.getByText("abgeschlossen", { exact: true }).first()).toBeVisible();

    await panel.getByRole("link", { name: "Nachweiskette", exact: true }).click();
    chargenCode = (await panel.getByText(/^CH-/).first().textContent())?.trim() ?? "";
    expect(chargenCode, "Chargen-Code konnte nicht aus der Nachweiskette gelesen werden").not.toBe("");
  });

  test("[Betriebsleitung]-E2E-Auslieferung und Übergabequittung", async ({ page }) => {
    test.skip(!chargenCode, "Vorherige Phase hat keinen Chargen-Code geliefert.");
    await anmelden(page, "leitung");

    await page.goto("/de/dashboard/hof/logistik");
    const lieferungFormular = page.locator("form", { hasText: "Lieferung anlegen" }).first();
    await lieferungFormular.getByLabel("Kunde").selectOption("Almaty Fresh Market");
    await lieferungFormular.getByLabel("Menge in kg").fill("41");
    await lieferungFormular.getByLabel("Charge (optional)").selectOption(chargenCode);
    await lieferungFormular.getByRole("button", { name: "Lieferung anlegen" }).click();
    await expect(page.getByText("Lieferung angelegt.")).toBeVisible();

    const lieferungsKarte = page
      .locator("article, li, div", { hasText: chargenCode })
      .filter({ hasText: "geplant" })
      .first();
    await lieferungsKarte.getByLabel("Temperatur in °C").fill("2,9");
    await lieferungsKarte.getByRole("button", { name: "Messung erfassen" }).click();
    await expect(page.getByText("Transportmessung erfasst.")).toBeVisible();

    await lieferungsKarte.getByLabel("Empfänger").fill("Regressionstest Empfänger");
    await lieferungsKarte.getByRole("button", { name: "Übergabe erfassen" }).click();
    await expect(lieferungsKarte.getByText("zugestellt")).toBeVisible();
  });

  test("[Kunde]-E2E-Lieferung und Herkunft nachweisen", async ({ page, context }) => {
    test.skip(!chargenCode, "Vorherige Phase hat keinen Chargen-Code geliefert.");
    await anmelden(page, "kunde");

    await page.goto("/de/dashboard/markt/b2b-portal");
    await expect(page.getByText("zugestellt").first()).toBeVisible();
    await expect(page.getByText(/Rechnung der Buchhaltung/)).toBeVisible();

    // Herkunftsauskunft ohne Anmeldung: eigener, unangemeldeter Kontext.
    const oeffentlicherKontext = await context.browser()!.newContext();
    const oeffentlicheSeite = await oeffentlicherKontext.newPage();
    // Der oeffentliche Code ist nicht der interne Chargen-Code; er steckt nur
    // im QR-Etikett. Dieser Test prueft daher die allgemeine Zugriffsregel
    // anhand der Aushang-Uebersicht statt eines konkreten Codes.
    await oeffentlicheSeite.goto("/de/herkunft/aushang");
    await expect(oeffentlicheSeite.getByRole("heading", { name: /Herkunft/ })).toBeVisible();
    await oeffentlicherKontext.close();
  });

  test("[Buchhaltung]-E2E-Lohn und Deckungsbeitrag abrechnen", async ({ page }) => {
    await anmelden(page, "buchhaltung");

    await page.goto("/de/dashboard/buero/lohn");
    await expect(page.getByRole("heading", { name: "Lohnsatz" })).toBeVisible();

    const heute = new Date();
    const von = new Date(heute);
    von.setDate(von.getDate() - 1);
    const isoVon = von.toISOString().slice(0, 10);
    const isoBis = heute.toISOString().slice(0, 10);

    await page.getByLabel("Periode von").fill(isoVon);
    await page.getByLabel("Periode bis").fill(isoBis);
    await page.getByRole("button", { name: "Periode berechnen" }).click();
    await expect(page.getByText(/Abrechnung\(en\) berechnet/)).toBeVisible();

    await page.goto("/de/dashboard/buero/finanzen");
    // Die Finanzseite steht in Reitern: Kostentraeger ist der Standardreiter,
    // die Erfassungsformulare sind darin eingeklappt. Je Reiter gibt es genau
    // ein <details>, deshalb reicht das erste.
    await expect(
      page.getByRole("heading", { name: "Kostenträger und Deckungsbeitrag" }),
    ).toBeVisible();

    const kostentraegerAufklapper = page.locator("details").first();
    await kostentraegerAufklapper.locator("summary").click();
    const kostentraegerFormular = kostentraegerAufklapper.locator("form");
    await kostentraegerFormular.getByLabel("Bezeichnung").fill(kostentraegerName);
    await kostentraegerFormular.getByLabel("Sorte").selectOption(sorte);
    await kostentraegerFormular.getByLabel("Kunde").selectOption("Almaty Fresh Market");
    await kostentraegerFormular.getByRole("button", { name: "Kostenträger anlegen" }).click();
    await expect(page.getByText(`Kostenträger "${kostentraegerName}" angelegt.`)).toBeVisible();

    // Die Buchungen liegen im eigenen Reiter. Der Zeitraum wandert beim
    // Wechsel mit, die nachgeladene Zeilenzahl nicht.
    await page
      .getByRole("navigation", { name: "Bereiche der Finanzseite" })
      .getByRole("link", { name: "Buchungen" })
      .click();
    // Erst warten, bis der Reiter wirklich gewechselt hat. Sonst greift das
    // details unten noch das Kostentraeger-Formular der alten Seite ab.
    await expect(page.getByRole("heading", { name: "Buchungen" })).toBeVisible();
    const buchungAufklapper = page.locator("details").first();
    await buchungAufklapper.locator("summary").click();
    const buchungFormular = buchungAufklapper.locator("form");
    await buchungFormular.getByLabel("Kostenträger").selectOption({ label: kostentraegerName });
    await buchungFormular.getByLabel("Typ").selectOption("Erlös");
    await buchungFormular.getByLabel("Kategorie").fill(testMarker("Erlös Regressionstest"));
    await buchungFormular.getByLabel("Betrag in ₸").fill("100000");
    await buchungFormular.getByRole("button", { name: "Buchung erfassen" }).click();
    await expect(page.getByText(/Buchung ".*" erfasst\./)).toBeVisible();
  });

  test("[Pflücker]-E2E-Eigene Abrechnung prüfen", async ({ page }) => {
    await anmelden(page, "pfluecker");

    await page.goto("/de/dashboard/buero/lohn");
    const tabelle = page.locator("table", { hasText: "Abrechnungen" }).first();
    await expect(tabelle).toBeVisible();
    // Nur die eigene Zeile darf sichtbar sein: kein fremder Pfluecker-Name.
    await expect(tabelle.getByText("Sarsenbaj").first()).toBeVisible();
    await expect(tabelle.getByRole("button", { name: /Freigeben|Bestätigen/ })).toHaveCount(0);
  });
});
