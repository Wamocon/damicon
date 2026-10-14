import { fenster, pruefer, setzeAdresse, setzeRechteck, setzeUmgebungZurueck, beendeUmgebung, umgebungsFehler } from "./hilfen/dom-umgebung";
import { readFileSync, writeFileSync } from "node:fs";

// Charakterisierung von schnappschuss() aus src/components/ki/ui-steuerung.ts (Werkzeug seiteLesen) vor dem Zerlegen (seit 14.10.2026).
//
// schnappschuss liest den Inhaltsbereich (#main) für die KI-Steuerung: Adresse, Titel, Überschriften, Text, die bedienbaren Elemente
// (Typ, Beschriftung, Gruppe, Wert, Optionen, Pflicht, Format, deaktiviert, aktiv, Ziel) und die Abschnitte für Sprechmarken. Hier läuft es
// in der DOM-Umgebung (hilfen/dom-umgebung.tsx) auf vielen DOM-Bäumen: ohne #main, leer, Formulare mit allen Feldarten und
// Beschriftungswegen, Links, Rollen, Unsichtbares (display, visibility, opacity, ohne Fläche, hidden, aria-hidden, inert, KI-Panel),
// Gruppen, Fokus-Stichwort, mehr als 140 Elemente, lange Texte, Überschriften, Abschnitte (details, aria-expanded, data-offen, ids,
// kurze und lange Listen) und stabile Referenzen über mehrere Lesungen. Je Fall wird das Ergebnis als JSON festgehalten, dazu das Markup
// danach (die vergebenen data-ki-ref und data-ki-abschnitt), und mit dem Stand vor dem Zerlegen verglichen
// (fixtures/ui-schnappschuss-golden.json, Stand 1fb29cf1). Ausgeschriebene Regeln prüfen die wichtigsten Eigenschaften zusätzlich.
//
// jsdom hat kein Layout: jedes Element bekommt über setzeRechteck eine Fläche (200 x 20), außer es trägt data-test-flach (keine Fläche)
// oder data-test-hoch (2000 hoch). innerText und CSS.escape kennt jsdom nicht; hier stehen schlichte Nachbildungen (innerText wie
// textContent, CSS.escape nach der Spezifikation). Die Referenzen zählen je Modul weiter: die Fälle laufen in fester Reihenfolge.
// Vergleichswerte neu schreiben nur mit einem Code, dessen Verhalten gewollt ist:
//   npx --yes tsx supabase/tests/ui-schnappschuss.tsx --golden-schreiben
// Aufruf: npm run test:ui-schnappschuss

const { pruefe, ende } = pruefer();
const json = (wert: unknown) => JSON.stringify(wert);
const GOLDEN = "supabase/tests/fixtures/ui-schnappschuss-golden.json";
const schreiben = process.argv.includes("--golden-schreiben");
const golden = schreiben ? {} : (JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, unknown>);
const neu: Record<string, unknown> = {};

// ---- Nachbildungen für jsdom ------------------------------------------------------------------------------------------------------
Object.defineProperty(fenster.HTMLElement.prototype, "innerText", {
  configurable: true,
  get(this: HTMLElement) {
    return this.textContent ?? "";
  },
});
/** CSS.escape nach https://drafts.csswg.org/cssom/#serialize-an-identifier, ohne reguläre Ausdrücke. */
function cssEscape(wert: string): string {
  const s = String(wert);
  let aus = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ziffer = c >= 0x30 && c <= 0x39;
    if (c === 0) aus += "�";
    else if ((c >= 0x1 && c <= 0x1f) || c === 0x7f || (i === 0 && ziffer) || (i === 1 && ziffer && s.charCodeAt(0) === 0x2d)) aus += `\\${c.toString(16)} `;
    else if (i === 0 && s.length === 1 && c === 0x2d) aus += `\\${s.charAt(i)}`;
    else if (c >= 0x80 || c === 0x2d || c === 0x5f || ziffer || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) aus += s.charAt(i);
    else aus += `\\${s.charAt(i)}`;
  }
  return aus;
}
(globalThis as { CSS?: unknown }).CSS = { escape: cssEscape };

// ---- Aufbau je Fall ---------------------------------------------------------------------------------------------------------------
interface Aufbau {
  html: string;
  titel?: string;
  adresse?: string;
}
function baue({ html, titel = "Damicon", adresse = "/de/dashboard" }: Aufbau): void {
  setzeUmgebungZurueck();
  setzeAdresse(adresse);
  document.title = titel;
  document.body.innerHTML = html;
  let n = 0;
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (el.hasAttribute("data-test-flach")) continue;
    setzeRechteck(el, { left: 10, top: 80 + 24 * n++, width: 200, height: el.hasAttribute("data-test-hoch") ? 2000 : 20 });
  }
}

type Schnappschuss = Awaited<ReturnType<typeof import("@/components/ki/ui-steuerung").schnappschuss>>;
async function lies(schnappschuss: (fokus?: string) => Promise<Schnappschuss>, name: string, fokus?: string): Promise<Schnappschuss> {
  const ergebnis = await schnappschuss(fokus);
  const fall = { ergebnis, markup: document.body.innerHTML };
  neu[name] = fall;
  pruefe(`${name}: keine Meldung aus jsdom`, umgebungsFehler.length === 0, json(umgebungsFehler));
  if (!schreiben) {
    const soll = golden[name];
    const gleich = soll !== undefined && json(fall) === json(soll);
    pruefe(`${name}: Ergebnis und Markup wie vor dem Zerlegen`, gleich, gleich ? "" : `ist ${json(fall).slice(0, 400)} | soll ${json(soll ?? "(fehlt)").slice(0, 400)}`);
  }
  return ergebnis;
}

// ---- DOM-Bäume ----------------------------------------------------------------------------------------------------------------------
const FORMULAR = `
<main id="main">
  <h1>Lieferung   anlegen</h1>
  <form action="/de/dashboard/logistik" data-test-x>
    <legend>Neue Lieferung</legend>
    <label for="kunde">Kunde</label><input id="kunde" name="kunde" value="Handelskette A" required>
    <label for="feld:1.b">Sonderzeichen</label><input id="feld:1.b" name="sonder">
    <input name="nur-platzhalter" placeholder="Menge in kg">
    <input name="nur-titel" title="Bemerkung">
    <input name="nur-name">
    <label>Eingebettet <input name="eingebettet" type="number" value="12"></label>
    <input type="date" name="datum" required>
    <input type="time" name="zeit">
    <input type="datetime-local" name="abfahrt">
    <input type="month" name="monat">
    <input type="email" name="mail" aria-label="E-Mail des Fahrers">
    <span id="l1">Teil eins</span><span id="l2">Teil zwei</span><input name="zwei" aria-labelledby="l1 l2">
    <input name="leer-bezug" aria-labelledby="gibt-es-nicht" placeholder="Ersatz">
    <textarea name="notiz" required>Vorsicht   zerbrechlich</textarea>
    <select name="fahrzeug" required><option value="lkw1">LKW 1</option><option value="lkw2" selected>LKW 2</option></select>
    <input type="checkbox" name="kuehlung" checked aria-label="Kühlung">
    <input type="radio" name="art" value="a" aria-label="Express">
    <input type="password" name="geheim" aria-label="Passwort">
    <input type="hidden" name="versteckt" value="x">
    <input type="submit" value="Lieferung speichern">
    <input type="button" value="">
    <button type="submit" disabled>Gesperrt</button>
  </form>
</main>`;

const LINKS_UND_ROLLEN = `
<nav><a href="/de/dashboard">Außerhalb von main</a></nav>
<main id="main">
  <h1>Übersicht</h1>
  <section>
    <h2>Filter</h2>
    <a href="/de/dashboard/pruefung?bereich=steuer#befunde">Steuern</a>
    <a href="https://example.org/hilfe" title="Externe Hilfe"></a>
    <a href="/de/dashboard/lohn" title="Nur Titel"></a>
    <a href="/de/dashboard/ernte"></a>
    <button aria-pressed="true">Offen</button>
    <div role="button" aria-selected="true">Erledigt</div>
    <div role="tab">Reiter A</div>
    <div role="switch" aria-label="Agent-Modus"></div>
    <div role="checkbox">Auswahl</div>
    <div role="menuitem">Menüpunkt</div>
  </section>
  <article><h3>Karte</h3><button>In der Karte</button></article>
  <div role="dialog"><h1>Dialog</h1><button>Schließen</button></div>
  <details><summary>Mehr anzeigen</summary><p>Inhalt</p></details>
  <button>Ohne Gruppe</button>
  <button>   </button>
</main>`;

const UNSICHTBAR = `
<main id="main">
  <h1>Sichtbarkeit</h1>
  <button>Sichtbar</button>
  <button style="display: none">Display none</button>
  <button style="visibility: hidden">Visibility hidden</button>
  <button style="opacity: 0">Opacity null</button>
  <button data-test-flach>Ohne Fläche</button>
  <div hidden><button>In hidden</button></div>
  <div aria-hidden="true"><button>In aria-hidden</button></div>
  <div inert><button>In inert</button></div>
  <div class="ki-pane-huelle"><button>Im KI-Panel</button></div>
  <h2 style="display: none">Versteckte Überschrift</h2>
  <h2></h2>
  <h3>Sichtbare Unterüberschrift</h3>
</main>`;

const ABSCHNITTE = `
<main id="main">
  <h1>Prüfbericht</h1>
  <section class="rounded-xl"><h2>Steuern</h2><p>Zwei Befunde.</p></section>
  <details><summary>Zugeklappte Einzelheiten</summary><p>Text</p></details>
  <details open><summary>Offene Einzelheiten</summary><p>Text</p></details>
  <div class="rounded-lg"><button aria-expanded="false">Massnahmen</button><p>Liste</p></div>
  <div class="rounded-lg"><button aria-expanded="true">Offene Gruppe</button></div>
  <div><button aria-expanded="false" type="submit" form="x">Absenden-Klappe</button></div>
  <div><div role="tab" aria-expanded="false">Reiter mit Klappe</div></div>
  <div><button aria-expanded="false" aria-haspopup="menu">Menü</button></div>
  <div data-offen="false" class="pr-aufklappbar"><h3>Data-offen zu</h3></div>
  <div id="befund-st-1"><p>Befund mit Anker</p></div>
  <div id="X1"><p>Ungültiger Anker</p></div>
  <div id="ab"><p>Zu kurzer Anker</p></div>
  <ol><li>Erster Schritt</li><li>Zweiter Schritt</li><li>  </li></ol>
  <ul>${Array.from({ length: 9 }, (_, i) => `<li>Punkt ${i + 1}</li>`).join("")}</ul>
  <ul><li>${"Sehr langer Punkt ".repeat(15)}</li></ul>
  <div role="heading">Rollen-Kopf</div>
  <h4 aria-label="Kopf mit Beschriftung">sichtbarer Text</h4>
  <section data-test-hoch><h2>Riesige Karte</h2></section>
  <h3>x</h3>
  <input id="feld-mit-id" aria-label="Feld mit Id">
  <label id="label-mit-id">Beschriftung mit Id</label>
</main>`;

const VIELE = `
<main id="main">
  <h1>Lange Liste</h1>
  ${Array.from({ length: 150 }, (_, i) => `<button>${i % 10 === 0 ? "Speichern" : "Zeile"} ${i + 1}</button>`).join("\n  ")}
  ${Array.from({ length: 35 }, (_, i) => `<h3>Gruppe ${i + 1}</h3>`).join("")}
  ${Array.from({ length: 65 }, (_, i) => `<div id="stelle-${i + 1}"><p>Stelle</p></div>`).join("")}
</main>`;

const LANG = `
<main id="main">
  <p>${"Ein sehr langer Absatz mit vielen Wörtern. ".repeat(90)}</p>
  <button>${"Beschriftung ".repeat(8)}</button>
  <select name="sorten">${Array.from({ length: 30 }, (_, i) => `<option>${i === 0 ? "Eine sehr lange Sortenbezeichnung mit Zusatzangaben" : `Sorte ${i + 1}`}</option>`).join("")}</select>
  <select name="ohne"></select>
  <input name="lang" value="${"Wert ".repeat(20)}">
  <h2>${"Überschrift ".repeat(10)}</h2>
</main>`;

const GRUPPEN = `
<main id="main">
  <h1>Gruppen</h1>
  <section><h2>Kühlkette</h2><button>Messung speichern</button></section>
  <form><fieldset><legend>Ernte melden</legend><input name="menge" aria-label="Menge"><button type="submit">Melden</button></fieldset></form>
  <section><button>Ohne Kopf</button></section>
  <section><h3>${"Lange Gruppenüberschrift ".repeat(4)}</h3><button>Darin</button></section>
  <button>Abmelden</button>
</main>`;

async function main() {
  const { schnappschuss } = await import("@/components/ki/ui-steuerung");

  // ---- 1. Ohne und mit leerem Inhaltsbereich --------------------------------------------------------------------------------------
  baue({ html: `<div><button>Kein main</button></div>`, titel: "Ohne Inhalt", adresse: "/de/dashboard/feld?x=1#a" });
  let s = await lies(schnappschuss, "ohne #main");
  pruefe("ohne #main: Hinweis, Adresse samt Abfrage und Anker, Titel des Dokuments", s.hinweis === "Kein Inhaltsbereich gefunden." && s.url === "/de/dashboard/feld?x=1#a" && s.titel === "Ohne Inhalt" && s.elemente.length === 0, json(s));
  baue({ html: `<main id="main"></main>`, titel: "Leer" });
  s = await lies(schnappschuss, "leeres #main");
  pruefe("leeres #main: Titel aus dem Dokument, kein Hinweis", s.titel === "Leer" && s.text === "" && s.hinweis === undefined && s.elemente.length === 0 && s.abschnitte.length === 0, json(s));

  // ---- 2. Formular ------------------------------------------------------------------------------------------------------------------
  baue({ html: FORMULAR, adresse: "/de/dashboard/logistik?neu=1" });
  s = await lies(schnappschuss, "Formular");
  const nachLabel = (label: string) => s.elemente.find((e) => e.label === label);
  pruefe("Formular: Passwort- und versteckte Felder fehlen", !s.elemente.some((e) => e.label === "Passwort") && s.elemente.every((e) => e.typ !== "eingabe:hidden"), json(s.elemente.map((e) => e.label)));
  pruefe("Formular: Pflichtfelder und Formate", nachLabel("Kunde")?.pflicht === true && s.elemente.find((e) => e.typ === "eingabe:date")?.format === "JJJJ-MM-TT" && s.elemente.find((e) => e.typ === "eingabe:datetime-local")?.format?.startsWith("JJJJ-MM-TTTHH:MM") === true, json(s.elemente));
  pruefe("Formular: Auswahl mit Wert und Optionen, Kontrollkasten angehakt", json(s.elemente.find((e) => e.typ === "auswahl")) .includes('"wert":"LKW 2"') && nachLabel("Kühlung")?.angehakt === true, json(s.elemente));
  pruefe("Formular: deaktivierte Schaltfläche markiert, Senden-Knopf mit Wert", nachLabel("Gesperrt")?.deaktiviert === true && nachLabel("Lieferung speichern")?.typ === "schaltflaeche", json(s.elemente));
  const ersteRefs = s.elemente.map((e) => e.ref);
  s = await lies(schnappschuss, "Formular erneut gelesen");
  pruefe("Formular erneut gelesen: dieselben Referenzen", json(s.elemente.map((e) => e.ref)) === json(ersteRefs), json(s.elemente.map((e) => e.ref)));
  const neuesFeld = document.createElement("input");
  neuesFeld.name = "nachgeladen";
  document.querySelector("form")!.append(neuesFeld);
  setzeRechteck(neuesFeld, { left: 10, top: 900, width: 200, height: 20 });
  s = await lies(schnappschuss, "Formular mit nachgeladenem Feld");
  pruefe("Nachgeladenes Feld: neue Nummer, alte bleiben", s.elemente.at(-1)?.label === "nachgeladen" && !ersteRefs.includes(s.elemente.at(-1)!.ref) && json(s.elemente.slice(0, -1).map((e) => e.ref)) === json(ersteRefs), json(s.elemente.map((e) => e.ref)));
  s = await lies(schnappschuss, "Formular mit Fokus", "  LIEFERUNG ");
  pruefe("Fokus: nur Elemente, deren Beschriftung oder Gruppe das Stichwort enthält (ohne Groß- und Kleinschreibung)", s.elemente.length > 0 && s.elemente.every((e) => `${e.label} ${e.gruppe ?? ""}`.toLowerCase().includes("lieferung")), json(s.elemente.map((e) => e.label)));
  s = await lies(schnappschuss, "Formular mit Fokus ohne Treffer", "gibt es nicht");
  pruefe("Fokus ohne Treffer: keine Elemente, kein Hinweis", s.elemente.length === 0 && s.hinweis === undefined);

  // ---- 3. Links, Rollen, Gruppen -------------------------------------------------------------------------------------------------
  baue({ html: LINKS_UND_ROLLEN, titel: "Links", adresse: "/de/dashboard" });
  s = await lies(schnappschuss, "Links und Rollen");
  pruefe("Links: nur aus #main, Ziel samt Abfrage und Anker", !s.elemente.some((e) => e.label === "Außerhalb von main") && s.elemente.find((e) => e.label === "Steuern")?.ziel === "/de/dashboard/pruefung?bereich=steuer#befunde", json(s.elemente));
  pruefe("Rollen: aktiv bei aria-pressed und aria-selected, Reiter, Schalter, Aufklappbereich", nachTyp(s, "Offen")?.aktiv === true && nachTyp(s, "Erledigt")?.aktiv === true && nachTyp(s, "Reiter A")?.typ === "reiter" && nachTyp(s, "Agent-Modus")?.typ === "schalter" && nachTyp(s, "Mehr anzeigen")?.typ === "aufklappbereich", json(s.elemente));
  pruefe("Gruppen: Abschnitt, Karte und Dialog, ohne Bereich null", nachTyp(s, "In der Karte")?.gruppe === "Karte" && nachTyp(s, "Schließen")?.gruppe === "Dialog" && nachTyp(s, "Ohne Gruppe")?.gruppe === null, json(s.elemente));
  pruefe("Leere Beschriftung wird '(ohne Beschriftung)'", s.elemente.some((e) => e.label === "(ohne Beschriftung)"), json(s.elemente));

  baue({ html: GRUPPEN, titel: "Gruppen" });
  s = await lies(schnappschuss, "Gruppen");
  baue({ html: UNSICHTBAR, titel: "Sichtbarkeit" });
  s = await lies(schnappschuss, "Unsichtbares");
  pruefe("Unsichtbares: nur der sichtbare Knopf, nur sichtbare und nicht leere Überschriften", json(s.elemente.map((e) => e.label)) === json(["Sichtbar"]) && json(s.ueberschriften) === json(["Sichtbarkeit", "Sichtbare Unterüberschrift"]), json(s));

  // ---- 4. Abschnitte ---------------------------------------------------------------------------------------------------------------
  baue({ html: ABSCHNITTE, titel: "Abschnitte" });
  s = await lies(schnappschuss, "Abschnitte");
  pruefe("Abschnitte: zugeklappte Stellen markiert, offene nicht", s.abschnitte.find((a) => a.titel === "Zugeklappte Einzelheiten")?.zugeklappt === true && s.abschnitte.find((a) => a.titel === "Offene Einzelheiten")?.zugeklappt === undefined, json(s.abschnitte));
  pruefe("Abschnitte: Anker nur mit sprechender id, lange Listen ohne Punkte", s.abschnitte.some((a) => a.titel === "Befund mit Anker") && !s.abschnitte.some((a) => a.titel === "Ungültiger Anker" || a.titel === "Zu kurzer Anker") && !s.abschnitte.some((a) => a.titel.startsWith("Punkt ")), json(s.abschnitte));
  pruefe("Abschnitte: Referenzen a1, a2 ... am DOM", s.abschnitte.every((a) => /^a\d+$/.test(a.ref)) && document.querySelectorAll("[data-ki-abschnitt]").length === new Set(s.abschnitte.map((a) => a.ref)).size, json(s.abschnitte.map((a) => a.ref)));
  s = await lies(schnappschuss, "Abschnitte erneut gelesen");

  // ---- 5. Grenzen -------------------------------------------------------------------------------------------------------------------
  baue({ html: VIELE, titel: "Viele" });
  s = await lies(schnappschuss, "mehr als 140 Elemente");
  pruefe("Mehr als 140 Elemente: abgeschnitten mit Hinweis auf fokus, Überschriften und Abschnitte begrenzt", s.elemente.length === 140 && s.hinweis === "Mehr als 140 Elemente - nutze 'fokus', um die Liste einzugrenzen." && s.ueberschriften.length === 30 && s.abschnitte.length === 60, `${s.elemente.length} ${s.hinweis} ${s.ueberschriften.length} ${s.abschnitte.length}`);
  s = await lies(schnappschuss, "mehr als 140 Elemente mit Fokus", "speichern");
  pruefe("Mit Fokus: nur die 15 Speichern-Knöpfe, kein Hinweis", s.elemente.length === 15 && s.hinweis === undefined, `${s.elemente.length} ${s.hinweis}`);
  baue({ html: LANG, titel: "Lang" });
  s = await lies(schnappschuss, "lange Texte");
  pruefe("Langer Text: auf 3200 Zeichen plus Auslassung gekürzt, Leerraum zusammengefasst", s.text.length === 3201 && s.text.endsWith("…") && !s.text.includes("  "), String(s.text.length));
  pruefe("Lange Beschriftung: 70 Zeichen mit Auslassung, Auswahl mit höchstens 25 Optionen", s.elemente[0]!.label.length === 70 && s.elemente[0]!.label.endsWith("…") && s.elemente.find((e) => e.typ === "auswahl")?.optionen?.length === 25, json(s.elemente.slice(0, 2)));
  pruefe("Titel ohne h1: Dokumenttitel", s.titel === "Lang");

  beendeUmgebung();
  if (schreiben) {
    writeFileSync(GOLDEN, `${JSON.stringify(neu, null, 1)}\n`, "utf8");
    console.log(`Vergleichswerte geschrieben: ${GOLDEN} (${Object.keys(neu).length} Fälle)`);
  } else {
    pruefe("Alle Fälle des Vergleichsstands sind gelaufen", Object.keys(golden).every((n) => n in neu), Object.keys(golden).filter((n) => !(n in neu)).join(", "));
  }
  ende();
}

function nachTyp(s: Schnappschuss, label: string) {
  return s.elemente.find((e) => e.label === label);
}

main().catch((e) => {
  console.log("FAIL  Ausnahme", e instanceof Error ? e.stack : e);
  process.exit(1);
});
