// Abdeckungs- und Rollentest fuer den KI-Agenten. Kein Datenbankzugriff - er
// prueft, dass sich der Agent an Aenderungen der Anwendung ANPASST, statt still
// zu veralten:
//   * jedes Modul aus modules.ts ist fuer den Agenten beschrieben (Titel +
//     Kurzbeschreibung in allen Sprachen) - ein neues Modul ohne Text faellt hier auf
//   * jedes Werkzeug, das IRGENDEINE Rolle bekommen kann, hat Beschriftungen in
//     allen fuenf Sprachen (sonst zeigt der Chat einen Platzhalter)
//   * die Rollenzuschnitte stimmen: ein Kunde bekommt keine Lohn- oder
//     Steuerwerkzeuge, ein Admin bekommt alles
//   * alle Sprachdateien haben denselben Schluesselsatz
//   * die Markdown-Zerlegung des Chats liefert beim Streamen dasselbe wie ein Gesamtdurchlauf
//   * der Systemprompt verbietet dem Agenten die vorschnelle Ablehnung
//   * abgelaufene Sitzung wird als solche gemeldet, Abmelden beendet nur die eigene Sitzung,
//     die Rollenfreigabe des KI-Assistenten stimmt
// Aufruf: npm run test:agent (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import { readdirSync, readFileSync } from "node:fs";
import { generateText, stepCountIs, tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import { istRechtsfrage, waehleSchritt } from "@/lib/ai/schritt-steuerung";
import { AKTIONS_NAMEN } from "@/lib/ai/aktionen-meta";
import { CLIENT_WERKZEUG_NAMEN } from "@/lib/ai/client-werkzeuge-meta";
import { chatFehlerArt } from "@/lib/ai/chat-fehler";
import { baueWerkzeuge } from "@/lib/ai/tools";
import { zerlege, type Zerlegung } from "@/lib/markdown-bloecke";
import { agentPhase, haustierZustand, leseSichtbarkeit, modulAusPfad, TOUR_SCHRITTE, tourDauer } from "@/lib/haustier";
import { modules } from "@/lib/modules";
import { hasPermission, roles } from "@/lib/rbac";

const sprachen = ["de", "en", "ru", "kk", "tr"] as const;
type Baum = { [k: string]: string | Baum };
const texte = Object.fromEntries(
  sprachen.map((s) => [s, JSON.parse(readFileSync(`src/messages/${s}.json`, "utf8")) as Baum]),
) as Record<(typeof sprachen)[number], Baum>;

function holen(baum: Baum, pfad: string): unknown {
  return pfad.split(".").reduce<unknown>((b, k) => (b && typeof b === "object" ? (b as Baum)[k] : undefined), baum);
}
function schluessel(o: Baum, pre = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? schluessel(v, `${pre}${k}.`) : [`${pre}${k}`]));
}

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt += 1;
  if (!ok) fehler += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

// --- 1. Module: fuer den Agenten beschrieben --------------------------------
const ohneTitel: string[] = [];
const ohneKurz: string[] = [];
for (const m of modules) {
  for (const s of sprachen) {
    if (typeof holen(texte[s], `modules.${m.key}.title`) !== "string") ohneTitel.push(`${s}:${m.key}`);
  }
  if (typeof holen(texte.de, `modules.${m.key}.summary`) !== "string") ohneKurz.push(m.key);
}
pruefe("Jedes Modul hat in allen Sprachen einen Titel", ohneTitel.length === 0, ohneTitel.join(", ") || `${modules.length} Module`);
pruefe("Jedes Modul hat eine Kurzbeschreibung fuer den Agenten (de)", ohneKurz.length === 0, ohneKurz.join(", "));

// --- 2. Werkzeuge: Beschriftungen fuer alle Rollen --------------------------
const alleNamen = new Set<string>();
for (const rolle of roles) Object.keys(baueWerkzeuge(rolle)).forEach((n) => alleNamen.add(n));
const fehlend: string[] = [];
for (const name of alleNamen) {
  const istAktion = (AKTIONS_NAMEN as string[]).includes(name);
  const benoetigt = istAktion
    ? [`kiAssistentAnsicht.aktion.titel.${name}`, `kiAssistentAnsicht.ziel.${name}`]
    : [`kiAssistentAnsicht.werkzeug.${name}`, `kiAssistentAnsicht.laeuft.${name}`, `kiAssistentAnsicht.ziel.${name}`];
  for (const s of sprachen) {
    for (const pfad of benoetigt) if (typeof holen(texte[s], pfad) !== "string") fehlend.push(`${s}:${pfad}`);
  }
}
pruefe("Jedes Werkzeug (aller Rollen) ist in allen Sprachen beschriftet", fehlend.length === 0, fehlend.slice(0, 4).join(", ") || `${alleNamen.size} Werkzeuge`);

const feldNamen = ["reihenblockCode", "zielmengeKg", "pflueckerAnzahl", "faelligkeit", "aufgabeCode", "neuerStatus", "temperaturC", "grund", "betreff", "beschreibung", "betroffeneMengeKg", "chargeCode", "kundenName", "periodeStart", "periodeEnde"];
const feldFehlt = sprachen.flatMap((s) => feldNamen.filter((f) => typeof holen(texte[s], `kiAssistentAnsicht.aktion.felder.${f}`) !== "string").map((f) => `${s}:${f}`));
pruefe("Alle Aktionsfelder haben Beschriftungen", feldFehlt.length === 0, feldFehlt.slice(0, 4).join(", "));

// --- 2b. Client-Werkzeuge (Seite lesen und bedienen) --------------------------
const uiFehlt = sprachen.flatMap((s) =>
  CLIENT_WERKZEUG_NAMEN.flatMap((n) =>
    [`kiAssistentAnsicht.laeuft.${n}`, `kiAssistentAnsicht.werkzeug.${n}`]
      .filter((pfad) => typeof holen(texte[s], pfad) !== "string")
      .map((pfad) => `${s}:${pfad}`),
  ),
);
pruefe("Jedes Client-Werkzeug ist in allen Sprachen beschriftet", uiFehlt.length === 0, uiFehlt.slice(0, 4).join(", ") || `${CLIENT_WERKZEUG_NAMEN.length} Werkzeuge`);
const lesen = Object.keys(baueWerkzeuge("betriebsleitung", { oberflaeche: "lesen" })).filter((n) => (CLIENT_WERKZEUG_NAMEN as readonly string[]).includes(n));
const steuern = Object.keys(baueWerkzeuge("betriebsleitung", { oberflaeche: "steuern" })).filter((n) => (CLIENT_WERKZEUG_NAMEN as readonly string[]).includes(n));
pruefe("Assistent-Modus bekommt nur seiteLesen", lesen.length === 1 && lesen[0] === "seiteLesen", lesen.join(", "));
pruefe("Agent-Modus bekommt alle Client-Werkzeuge", CLIENT_WERKZEUG_NAMEN.every((n) => steuern.includes(n)), steuern.join(", "));
pruefe("Die nicht-streamende Anfrage (nurLesen) bekommt keine Client-Werkzeuge", !Object.keys(baueWerkzeuge("admin", { nurLesen: true })).some((n) => (CLIENT_WERKZEUG_NAMEN as readonly string[]).includes(n) || (AKTIONS_NAMEN as string[]).includes(n)));

// --- 3. Rollenzuschnitt -----------------------------------------------------
const namen = (rolle: (typeof roles)[number]) => Object.keys(baueWerkzeuge(rolle));
const admin = namen("admin");
pruefe("Admin bekommt alle Aktionen", (AKTIONS_NAMEN as string[]).every((a) => admin.includes(a)), `${admin.length} Werkzeuge`);
const kunde = namen("kunde");
pruefe("Kunde bekommt keine Steuer-/Lohn-/Compliance-Werkzeuge", !["mwstStatusAbrufen", "esutdOffeneFristenAbrufen", "complianceUebersichtAbrufen", "risikoRadarAbrufen", "lohnPeriodeBerechnen", "mwstSchwellePruefen"].some((n) => kunde.includes(n)), kunde.join(", "));
pruefe("Kunde darf reklamieren und hat Navigation + Datenabfrage", ["reklamationAnlegen", "oeffneBereich", "datenLesen"].every((n) => kunde.includes(n)));
const picker = namen("picker");
pruefe("Pfluecker bekommt keine Lohnberechnung und keine Reklamation", !picker.includes("lohnPeriodeBerechnen") && !picker.includes("reklamationAnlegen"), picker.join(", "));
const buchhaltung = namen("buchhaltung");
pruefe("Buchhaltung bekommt Lohnberechnung, aber kein ESUTD-Werkzeug", buchhaltung.includes("lohnPeriodeBerechnen") && !buchhaltung.includes("esutdOffeneFristenAbrufen"), buchhaltung.join(", "));

// --- 4. Navigation folgt dem Modulregister ----------------------------------
const navigation = baueWerkzeuge("admin").oeffneBereich as unknown as { description?: string } | undefined;
const nichtErreichbar = modules.filter((m) => !navigation?.description?.includes(`${m.key}:`)).map((m) => m.key);
pruefe("Der Agent kann JEDES Modul oeffnen (Admin)", nichtErreichbar.length === 0, nichtErreichbar.join(", ") || `${modules.length} Module`);
const kundeNav = (baueWerkzeuge("kunde").oeffneBereich as unknown as { description?: string } | undefined)?.description ?? "";
pruefe("Kunde kann Lohn NICHT oeffnen", !kundeNav.includes("lohn:"));

// --- 5. Sprachdateien: gleicher Schluesselsatz ------------------------------
const basis = new Set(schluessel(texte.de));
for (const s of sprachen.filter((x) => x !== "de")) {
  const menge = new Set(schluessel(texte[s]));
  const fehlt = [...basis].filter((k) => !menge.has(k));
  const zuviel = [...menge].filter((k) => !basis.has(k));
  pruefe(`Sprachdatei ${s} hat denselben Schluesselsatz wie de`, fehlt.length === 0 && zuviel.length === 0, `fehlt ${fehlt.length}, zuviel ${zuviel.length}`);
}

// --- 6. Markdown-Zerlegung: inkrementell == vollstaendig --------------------
// Beim Streamen wird nur ab dem letzten Block neu geparst. Das darf zu keinem
// Zeitpunkt etwas anderes ergeben als ein Gesamtdurchlauf desselben Textes.
const markdownProben: Record<string, string> = {
  bericht:
    "**Fazit: alles gut.**\n\n## Abschnitt\n\nText mit **Zahl 12** und `code`.\n\n- eins\n- zwei\n  - verschachtelt\n- drei\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n\nEmpfehlung: weiter so.",
  lockereListe: "1. Erster\n\n   Absatz im Punkt\n\n2. Zweiter\n\n3. Dritter\n\nEnde",
  code: "Vorher\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nNachher mit [Link](https://example.com)",
  zitatUndTrenner: "> Zitat 1\n>\n> Zitat 2\n\n---\n\nText\nnoch eine Zeile\n\n1. a\n2. b",
};
for (const [name, text] of Object.entries(markdownProben)) {
  let stand: Zerlegung | null = null;
  let abweichung: string | null = null;
  for (let ende = 1; ende <= text.length && !abweichung; ende += 3) {
    const teil = text.slice(0, ende);
    stand = zerlege(teil, stand);
    const voll = zerlege(teil, null);
    if (JSON.stringify(stand.bloecke) !== JSON.stringify(voll.bloecke)) abweichung = `bei ${ende} Zeichen`;
  }
  pruefe(`Markdown-Zerlegung beim Streamen == Gesamtdurchlauf (${name})`, abweichung === null, abweichung ?? `${text.length} Zeichen`);
}
pruefe("Eine lockere Liste bleibt EIN Block (Nummerierung bleibt erhalten)", zerlege(markdownProben.lockereListe!).bloecke.length === 2);

// --- 7. Systemprompt: keine vorschnelle Ablehnung ---------------------------
const routeQuelle = readFileSync("src/app/api/ki-assistent/route.ts", "utf8");
pruefe(
  "Agent-Prompt: ohne Aktionswerkzeug ueber die Oberflaeche arbeiten, nicht ablehnen",
  routeQuelle.includes("KEIN passendes Aktionswerkzeug") && routeQuelle.includes("NIE 'dafuer habe ich kein Werkzeug'"),
);
pruefe(
  "Rollen-Prompt: fehlende Berechtigung nur mit Beleg aus der Anwendung behaupten",
  routeQuelle.includes("keine fehlende Berechtigung ohne Beleg"),
);

// --- 8. Sitzung, Fehlermeldungen, Rollenfreigabe -----------------------------
// Ein abgelaufene Sitzung darf im Chat nicht wie ein Ausfall der KI aussehen.
pruefe("Chat-Fehler: 'nicht angemeldet' (401) wird als abgelaufene Sitzung erkannt", chatFehlerArt(new Error("nicht angemeldet")) === "sitzung");
pruefe("Chat-Fehler: 'keine berechtigung' (403) wird als Rollenproblem erkannt", chatFehlerArt(new Error("keine berechtigung")) === "berechtigung");
pruefe(
  "Chat-Fehler: alles andere bleibt die allgemeine Meldung",
  chatFehlerArt(new Error("kein-anbieter")) === "allgemein" && chatFehlerArt(new Error("Failed to fetch")) === "allgemein" && chatFehlerArt(null) === null,
);

// Abmelden beendet nur die eigene Sitzung: der Standard ("global") wirft bei
// geteilten Konten alle anderen Nutzer hinaus.
const abmeldenQuelle = readFileSync("src/app/[locale]/login/actions.ts", "utf8");
pruefe("Abmelden beendet nur die eigene Sitzung (scope local)", abmeldenQuelle.includes('signOut({ scope: "local" })'));

// Rollenfreigabe des KI-Assistenten
const buchhaltungWerkzeuge = Object.keys(baueWerkzeuge("buchhaltung"));
pruefe("Buchhaltung darf den KI-Assistenten nutzen", hasPermission("buchhaltung", "ki_assistent", "create"));
pruefe(
  "Buchhaltung bekommt Steuer- und Lohnwerkzeuge, aber keine Feldaktionen",
  ["mwstStatusAbrufen", "risikoRadarAbrufen", "lohnPeriodeBerechnen"].every((n) => buchhaltungWerkzeuge.includes(n)) &&
    !buchhaltungWerkzeuge.includes("kuehlmessungErfassen") &&
    !buchhaltungWerkzeuge.includes("aufgabeAnlegen"),
  buchhaltungWerkzeuge.join(", "),
);
pruefe(
  "Pfluecker und Erzeuger haben (noch) keinen KI-Assistenten",
  !hasPermission("picker", "ki_assistent", "create") && !hasPermission("erzeuger", "ki_assistent", "create"),
);

// --- 9. Himbi, der Begleiter --------------------------------------------------
pruefe(
  "Himbi: eine offene Freigabe schlaegt Arbeiten, Fehler und Ruhe",
  agentPhase({ beschaeftigt: true, freigabeOffen: true, fehler: true }) === "freigabe" &&
    agentPhase({ beschaeftigt: true, freigabeOffen: false, fehler: true }) === "arbeitet" &&
    agentPhase({ beschaeftigt: false, freigabeOffen: false, fehler: true }) === "fehler" &&
    agentPhase({ beschaeftigt: false, freigabeOffen: false, fehler: false }) === "ruhe",
);
pruefe(
  "Himbi: Zustand nach Rangfolge (Freigabe, Fehler, Arbeiten, Sprechen, Fertig, Schlaf, Ruhe)",
  haustierZustand({ phase: "freigabe", fertigUngelesen: true, schlaeft: true }) === "freigabe" &&
    haustierZustand({ phase: "fehler", fertigUngelesen: true, schlaeft: true }) === "fehler" &&
    haustierZustand({ phase: "arbeitet", fertigUngelesen: true, schlaeft: true }) === "denkt" &&
    haustierZustand({ phase: "ruhe", fertigUngelesen: true, schlaeft: true, spricht: true }) === "spricht" &&
    haustierZustand({ phase: "ruhe", fertigUngelesen: true, schlaeft: true }) === "fertig" &&
    haustierZustand({ phase: "ruhe", fertigUngelesen: false, schlaeft: true }) === "schlaeft" &&
    haustierZustand({ phase: "ruhe", fertigUngelesen: false, schlaeft: false }) === "ruhe",
);
const lohnModul = modules.find((m) => m.key === "lohn")!;
pruefe(
  "Himbi: das Modul zu einem Dashboard-Pfad wird erkannt, Fremdes nicht",
  modulAusPfad(`/dashboard/${lohnModul.zone}/${lohnModul.slug}`, modules)?.key === "lohn" &&
    modulAusPfad(`/dashboard/${lohnModul.zone}/${lohnModul.slug}?x=1`, modules)?.key === "lohn" &&
    modulAusPfad("/dashboard", modules) === null &&
    modulAusPfad("/login", modules) === null &&
    modulAusPfad("/dashboard/buero/gibt-es-nicht", modules) === null,
);

// Die Tour: jede Station hat ihren Text in allen Sprachen und einen echten Abschnitt auf der Startseite.
const tourOhneText: string[] = [];
for (const s of TOUR_SCHRITTE) {
  for (const sp of sprachen) {
    for (const feld of ["titel", "text"]) {
      if (typeof holen(texte[sp], `haustier.tour.${s.schluessel}.${feld}`) !== "string") tourOhneText.push(`${sp}:${s.schluessel}.${feld}`);
    }
  }
}
pruefe("Himbi-Tour: jede Station hat Titel und Text in allen Sprachen", tourOhneText.length === 0, tourOhneText.slice(0, 4).join(", ") || `${TOUR_SCHRITTE.length} Stationen`);
const seitenQuelle = readdirSync("src/components/site")
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => readFileSync(`src/components/site/${f}`, "utf8"))
  .join("\n");
const tourOhneAnker = TOUR_SCHRITTE.filter((s) => !seitenQuelle.includes(`id="${s.anker}"`)).map((s) => s.anker);
pruefe("Himbi-Tour: jede Station zeigt auf einen Abschnitt, den es auf der Startseite gibt", tourOhneAnker.length === 0, tourOhneAnker.join(", "));
// Wegschicken und Zurueckholen: gespeicherte Werte, Beschriftungen, kein altes Kreuz mehr.
pruefe(
  "Himbi: gespeicherte Sichtbarkeit wird gelesen, Unbekanntes heisst 'da'",
  leseSichtbarkeit("weg") === "weg" && leseSichtbarkeit("aus") === "aus" && leseSichtbarkeit("an") === "an" && leseSichtbarkeit(null) === "an" && leseSichtbarkeit("kaputt") === "an" && leseSichtbarkeit("") === "an",
);
const wegOhneText: string[] = [];
for (const sp of sprachen) {
  for (const k of ["weg.halten", "weg.tschuess", "weg.hinweis", "willkommen", "zurueckholen", "einstellung.text"]) {
    if (typeof holen(texte[sp], `haustier.${k}`) !== "string") wegOhneText.push(`${sp}:${k}`);
  }
}
pruefe("Himbi: Wegschicken, Zurueckholen und Abschied sind in allen Sprachen beschriftet", wegOhneText.length === 0, wegOhneText.slice(0, 4).join(", "));
const huelleQuelle = readFileSync("src/components/haustier/haustier-huelle.tsx", "utf8");
pruefe("Himbi: kein Schliessen-Kreuz mehr, Wegschicken laeuft ueber Halten (und Entf-Taste)", !huelleQuelle.includes("onVerstecken") && huelleQuelle.includes("HALTEN_DAUER_MS") && huelleQuelle.includes('"Delete"'));
// Der Autopilot der Tour: Verweildauer, Texte, Regeln fuer den Eingriff des Besuchers.
pruefe(
  "Himbi-Tour: Verweildauer waechst mit dem Text, bleibt aber zwischen 5,5 und 9,5 Sekunden",
  tourDauer("") === 5500 && tourDauer("x".repeat(60)) > 5500 && tourDauer("x".repeat(60)) < 9500 && tourDauer("x".repeat(500)) === 9500 && tourDauer("x".repeat(80)) >= tourDauer("x".repeat(60)),
  `${tourDauer("x".repeat(90))} ms bei 90 Zeichen`,
);
const autoOhneText: string[] = [];
for (const sp of sprachen) {
  for (const k of ["autoStart", "pausiert", "auto", "pause"]) {
    if (typeof holen(texte[sp], `haustier.tour.${k}`) !== "string") autoOhneText.push(`${sp}:${k}`);
  }
}
pruefe("Himbi-Tour: Autopilot-Texte in allen Sprachen", autoOhneText.length === 0, autoOhneText.slice(0, 4).join(", "));
const tourQuelle = readFileSync("src/components/haustier/haustier-tour.tsx", "utf8");
pruefe(
  "Himbi-Tour: Besucher-Eingriffe (Klick, Mausrad, Wischen, Scroll-Tasten) geben die Fuehrung ab",
  ["wheel", "touchstart", "pointerdown", "keydown", "SCROLL_TASTEN", 'closest(".haustier")'].every((m) => tourQuelle.includes(m)),
);
pruefe("Himbi-Tour: bei reduzierter Bewegung startet nichts von allein", tourQuelle.includes("setAutoStart(!bewegungReduziert())") && tourQuelle.includes("setAuto(!bewegungReduziert())"));
const zustaendeOhneLabel = (["ruhe", "denkt", "freigabe", "fertig", "fehler", "schlaeft", "spricht", "tour"] as const).filter((z) =>
  sprachen.some((sp) => typeof holen(texte[sp], `haustier.label.${z}`) !== "string"),
);
pruefe("Himbi: jeder Zustand hat eine Beschriftung fuer Screenreader in allen Sprachen", zustaendeOhneLabel.length === 0, zustaendeOhneLabel.join(", "));

// --- Zuverlaessigkeit: im Faehigkeitstest gemessene Fehler, dauerhaft abgesichert ---------------
const aktionenQuelle = readFileSync("src/lib/ai/aktionen.ts", "utf8");
const routeQuelle2 = readFileSync("src/app/api/ki-assistent/route.ts", "utf8");
const uiQuelle = readFileSync("src/components/ki/ui-steuerung.ts", "utf8");
pruefe("Agent-Prompt: kein Zug endet mit einer Ankuendigung, kein zweites Absenden", routeQuelle2.includes("ZUGENDE_ANWEISUNG") && routeQuelle2.includes("NIE mit einer Ankuendigung") && routeQuelle2.includes("NICHT noch einmal ab"));
pruefe("Eskalation ist kein Ausweg: nur auf ausdruecklichen Wunsch, Buero-Rollen nie an das Buero", aktionenQuelle.includes("Nur wenn der Nutzer AUSDRUECKLICH einen Menschen sprechen will") && aktionenQuelle.includes("SIND das Buero"));
pruefe("Lohn: Zeitraum wird aus dem Datum abgeleitet, nicht erfragt", aktionenQuelle.includes("'diesen Monat' = erster bis letzter Tag"));
pruefe("Kuehlmessung: Charge wird zur Pflueckaufgabe aufgeloest", aktionenQuelle.includes("suche ZUERST mit datenLesen die passende Pflueckaufgabe"));
pruefe("Doppelabsendung: Freigabekarte warnt, wenn dasselbe Formular kurz zuvor abgeschickt wurde", uiQuelle.includes('"doppelt"') && uiQuelle.includes("DOPPELT_FENSTER_MS") && sprachen.every((sp) => typeof holen(texte[sp], "kiAssistentAnsicht.klick.grund.doppelt") === "string"));

// Lange Agentenlaeufe: die Route kuerzt alte Werkzeugausgaben, BEVOR sie die Grenze prueft (gemessen: nach
// etwa acht Seitenschnappschuessen antwortete sie mit 413 und der Chat zeigte "KI nicht erreichbar").
const kuerzenPos = routeQuelle2.indexOf("const nachrichten = alteAusgabenKuerzen(");
const grenzePos = routeQuelle2.indexOf("JSON.stringify(nachrichten).length > MAX_VERLAUF_ZEICHEN");
pruefe("Route: Verlauf wird gekuerzt, DANN gegen die Grenze geprueft", kuerzenPos > 0 && grenzePos > kuerzenPos);
pruefe("Chat: 'verlauf zu gross' (413) hat eine eigene Meldung, kein Fake-Ausfall", chatFehlerArt(new Error("verlauf zu gross")) === "zulang");
pruefe("Chat: 'Neu beginnen' und Meldung in allen Sprachen", sprachen.every((sp) => typeof holen(texte[sp], "kiAssistentAnsicht.fehler.zuLang") === "string" && typeof holen(texte[sp], "kiAssistentAnsicht.fehler.neuBeginnen") === "string"));
pruefe("Agent-Prompt: Klicks nicht zusaetzlich im Chat bestaetigen lassen", routeQuelle2.includes("Frage deshalb NICHT zusaetzlich im Chat um Erlaubnis"));


// --- Wissenssuche wird erzwungen, nicht erhofft (lib/ai/schritt-steuerung.ts) ---------------------------
const rechtsfragen = [
  "Ab welchem Umsatz muss sich ein Betrieb in Kasachstan fuer die Mehrwertsteuer registrieren? Nenne die Fundstelle.",
  "Wie viele Tage hat ein Betrieb nach Ueberschreiten der Umsatzschwelle Zeit, sich anzumelden?",
  "Welche Strafen drohen bei Verstoessen gegen die ESUTD-Pflicht?",
  "Wann ist eine Abschlusspruefung Pflicht?",
  "Sind wir beim Datenschutz compliant?",
  "Welche Lohnsteuer faellt fuer Saisonkraefte an?",
  "What is the VAT registration threshold in Kazakhstan?",
  "Какой порог постановки на учет по НДС?",
  "ЭСФ кімге міндетті?",
  "Kazakistan'da KDV kaydı için eşik nedir?",
];
const keineRechtsfragen = [
  "Zeig mir die Rechte der Rolle Admin",
  "Gib mir alle Use Cases der Rolle Admin",
  "Steuere die Seite und oeffne die Pflueckaufgaben",
  "Wie ist die Steuerung der Kuehlung eingestellt?",
  "Lege eine Pflueckaufgabe fuer Block 3 an",
  "Wie viele Schalen wurden gestern geerntet?",
  "Hallo Himbi",
];
pruefe("Rechtsfragen in fuenf Sprachen werden erkannt", rechtsfragen.every((f) => istRechtsfrage(f)), rechtsfragen.filter((f) => !istRechtsfrage(f)).join(" | "));
pruefe("Bedienung und Betriebsfragen loesen KEINE erzwungene Suche aus", keineRechtsfragen.every((f) => !istRechtsfrage(f)), keineRechtsfragen.filter((f) => istRechtsfrage(f)).join(" | "));
const eingabe = (o: Partial<Parameters<typeof waehleSchritt>[0]> = {}) => ({ stepNumber: 0, modus: "assistent" as const, neueNutzerFrage: true, frage: rechtsfragen[0]!, wissenAngeboten: true, ...o });
const erzwungen = '{"toolChoice":{"type":"tool","toolName":"wissenSuchen"}}';
pruefe("Schritt 0, Rechtsfrage, Werkzeug angeboten: wissenSuchen erzwungen (Assistent und Agent)",
  JSON.stringify(waehleSchritt(eingabe())) === erzwungen && JSON.stringify(waehleSchritt(eingabe({ modus: "agent" }))) === erzwungen);
pruefe("Ab Schritt 1 entscheidet das Modell wieder frei", waehleSchritt(eingabe({ stepNumber: 1 })) === undefined);
pruefe("Freigabe-Runde (keine neue Nutzerfrage): nichts erzwingen", waehleSchritt(eingabe({ neueNutzerFrage: false })) === undefined);
pruefe("Ohne angebotenes Werkzeug wird nichts Unmoegliches erzwungen", waehleSchritt(eingabe({ wissenAngeboten: false })) === undefined);
pruefe("Agent-Modus, keine Rechtsfrage: weiterhin 'required'", JSON.stringify(waehleSchritt(eingabe({ modus: "agent", frage: "Oeffne die Pflueckaufgaben" }))) === '{"toolChoice":"required"}');
pruefe("Assistent, keine Rechtsfrage: nichts erzwingen", waehleSchritt(eingabe({ frage: "Hallo" })) === undefined);
const routeQuelle3 = readFileSync("src/app/api/ki-assistent/route.ts", "utf8");
pruefe("Route nutzt waehleSchritt in prepareStep", routeQuelle3.includes("waehleSchritt({") && routeQuelle3.includes('wissenAngeboten: "wissenSuchen" in werkzeuge'));
pruefe("Route: ohne Wissensbasis gilt OHNE_QUELLEN_ANWEISUNG (kein Rechtsrat aus Trainingswissen)", routeQuelle3.includes('"wissenSuchen" in werkzeuge ? QUELLEN_ANWEISUNG : OHNE_QUELLEN_ANWEISUNG') && routeQuelle3.includes("NICHT aus deinem Trainingswissen"));

// Gegen das echte SDK: der erste Aufruf traegt toolChoice { type: "tool", toolName: "wissenSuchen" },
// der zweite ist wieder frei. Mock-Modell, kein Netzwerk.
async function sdkPruefung() {
  const leer = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
  let aufruf = 0;
  const modell = new MockLanguageModelV3({
    doGenerate: async () => {
      aufruf++;
      return aufruf === 1
        ? { content: [{ type: "tool-call" as const, toolCallId: "t1", toolName: "wissenSuchen", input: JSON.stringify({ frage: "USt-Schwelle" }) }], finishReason: { unified: "tool-calls" as const, raw: undefined }, usage: leer, warnings: [] }
        : { content: [{ type: "text" as const, text: "Antwort [S1]" }], finishReason: { unified: "stop" as const, raw: undefined }, usage: leer, warnings: [] };
    },
  });
  let gesucht = 0;
  const werkzeuge = {
    wissenSuchen: tool({ description: "Wissensbasis", inputSchema: z.object({ frage: z.string() }), execute: async () => { gesucht++; return { anzahl: 1, belege: [] }; } }),
    oeffneBereich: tool({ description: "Navigation", inputSchema: z.object({}), execute: async () => ({}) }),
  };
  const r = await generateText({
    model: modell,
    prompt: rechtsfragen[0]!,
    tools: werkzeuge,
    stopWhen: stepCountIs(4),
    prepareStep: ({ stepNumber }) => waehleSchritt({ stepNumber, modus: "assistent", neueNutzerFrage: true, frage: rechtsfragen[0]!, wissenAngeboten: true }),
  });
  const erster = modell.doGenerateCalls[0]?.toolChoice;
  const zweiter = modell.doGenerateCalls[1]?.toolChoice;
  pruefe("SDK: erster Modellaufruf traegt toolChoice { tool: wissenSuchen }", erster?.type === "tool" && (erster as { toolName?: string }).toolName === "wissenSuchen", JSON.stringify(erster));
  pruefe("SDK: zweiter Modellaufruf ist wieder frei (auto)", zweiter === undefined || zweiter.type === "auto", JSON.stringify(zweiter));
  pruefe("SDK: das Werkzeug wurde ausgefuehrt und die Antwort kam danach", gesucht === 1 && r.text === "Antwort [S1]" && r.steps.length === 2);
}

sdkPruefung()
  .catch((e) => pruefe("SDK-Pruefung laeuft durch", false, String(e)))
  .then(() => {
    console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
    if (fehler > 0) process.exit(1);
    console.log("Alle Pruefungen bestanden.");
  });
