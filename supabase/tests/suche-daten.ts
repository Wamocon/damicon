// Globale Suche, Stufe 2: Datensaetze (WMCNL-1467). Die Regeln in
// src/lib/suche/daten.ts und die Gruppen mit Datensuche in gruppen.ts.
// Die Datenbankfunktion selbst prueft supabase/tests/datensuche.mjs.
//
// Aufruf: npm run test:suche-daten (ueber tsx, damit die @/-Pfade aufloesen).

import { readFileSync } from "node:fs";
import {
  DATEN_AB,
  DATEN_BIS,
  DATEN_TYPEN,
  darfTypSehen,
  datenBegriff,
  datenTrefferHref,
  istDatenTyp,
  modulFuerTyp,
  trefferAusZeile,
  type DatenTreffer,
} from "@/lib/suche/daten";
import { baueSuchErgebnis, type SuchErgebnis } from "@/lib/suche/gruppen";
import { baueSeitenZiele, type Uebersetze } from "@/lib/suche/seiten-ziele";
import { hasPermission, roles } from "@/lib/rbac";
import { moduleHref } from "@/lib/modules";

let fehlgeschlagen = 0;
function pruefe(name: string, bedingung: boolean, zusatz = "") {
  console.log(`${bedingung ? "PASS" : "FAIL"}  ${name}${zusatz ? "  - " + zusatz : ""}`);
  if (!bedingung) fehlgeschlagen++;
}

type Baum = { [schluessel: string]: Baum | string };
const lade = (sprache: string) => JSON.parse(readFileSync(`src/messages/${sprache}.json`, "utf8")) as Baum;
const deutsch = lade("de");
const uebersetzer: Uebersetze = (pfad) => {
  const wert = pfad.split(".").reduce<unknown>((b, k) => (b && typeof b === "object" ? (b as Baum)[k] : undefined), deutsch);
  if (typeof wert !== "string") throw new Error(`Text fehlt: ${pfad}`);
  return wert;
};

// --- 1. Typen, Module, Rechte ---------------------------------------------------
for (const typ of DATEN_TYPEN) {
  const modul = modulFuerTyp(typ);
  pruefe(`Typ ${typ}: gehoert zu einem Modul (${modul.key})`, !!modul);
  const abweichung = roles.filter((r) => darfTypSehen(typ, r) !== hasPermission(r, modul.resource, "view"));
  pruefe(`Typ ${typ}: sichtbar genau fuer die Rollen, die das Modul sehen`, abweichung.length === 0, abweichung.join(","));
  pruefe(`Typ ${typ}: ohne Rolle nichts`, !darfTypSehen(typ, null) && !darfTypSehen(typ, undefined));
}
pruefe("istDatenTyp erkennt nur bekannte Typen", istDatenTyp("charge") && !istDatenTyp("tabelle") && !istDatenTyp(3) && !istDatenTyp(null));

// Eine Rolle ohne Personalrecht findet keinen Pfluecker, der Kundenstamm bleibt dem Buero.
pruefe("kunde sieht keine Pfluecker", !darfTypSehen("pfluecker", "kunde"));
pruefe("kunde sieht keinen Kundenstamm", !darfTypSehen("kunde", "kunde"));
pruefe("admin sieht alle Typen", DATEN_TYPEN.every((typ) => darfTypSehen(typ, "admin")));

// --- 2. Links ---------------------------------------------------------------------
const treffer = (typ: DatenTreffer["typ"], titel: string): DatenTreffer => ({ typ, id: "11111111-1111-1111-1111-111111111111", titel, untertitel: null });
for (const typ of DATEN_TYPEN) {
  const href = datenTrefferHref(treffer(typ, "X-1"));
  pruefe(`Link ${typ}: zeigt auf die Seite des Moduls`, href.startsWith(moduleHref(modulFuerTyp(typ))), href);
}
pruefe("Link Pflueckaufgabe traegt den Code in der Adresse", datenTrefferHref(treffer("aufgabe", "PA-2026-001")).endsWith("?aufgabe=PA-2026-001"));
pruefe("Link Pflueckaufgabe maskiert Sonderzeichen", datenTrefferHref(treffer("aufgabe", "A B&C")).endsWith("?aufgabe=A%20B%26C"));
pruefe("Link Charge traegt keine Adresszusaetze", !datenTrefferHref(treffer("charge", "CH-1")).includes("?"));

// --- 3. Eingabe und Zeilen ----------------------------------------------------------
pruefe("Begriff: Leerraum an den Enden faellt weg", datenBegriff("  CH-1  ") === "CH-1");
pruefe("Begriff: auf die Obergrenze gekuerzt", datenBegriff("x".repeat(DATEN_BIS + 20)).length === DATEN_BIS);
const zeile = { treffer_typ: "charge", treffer_id: "id-1", treffer_titel: "CH-1", treffer_untertitel: null as string | null };
pruefe("Zeile: bekannter Typ wird ein Treffer", trefferAusZeile(zeile)?.typ === "charge");
pruefe("Zeile: unbekannter Typ wird verworfen", trefferAusZeile({ ...zeile, treffer_typ: "geheim" }) === null);
pruefe("Zeile: ohne Id oder Titel wird verworfen", trefferAusZeile({ ...zeile, treffer_id: "" }) === null && trefferAusZeile({ ...zeile, treffer_titel: "" }) === null);

// --- 4. Gruppen mit Datensuche -----------------------------------------------------------
{
  const ziele = baueSeitenZiele("admin", { demoModus: false, locale: "de" }, uebersetzer);
  const ergebnis = (begriff: string, extra: Partial<Parameters<typeof baueSuchErgebnis>[0]> = {}) =>
    baueSuchErgebnis({ ziele, begriff, zuletzt: [], offeneSeite: "uebersicht", kiVerfuegbar: true, datenSuchbar: true, ...extra });
  const arten = (e: SuchErgebnis) => e.gruppen.map((g) => g.art).join(",");
  const gefunden: DatenTreffer[] = [treffer("charge", "CH-9"), treffer("steige", "ST-9")];

  const nichts = ergebnis("Xylophon");
  pruefe("ohne Namenstreffer: erst die Datensuche, dann die KI-Frage", arten(nichts) === "datensuche,ki", arten(nichts));
  pruefe("die Datensuchzeile traegt den Begriff", nichts.gruppen[0]?.optionen[0]?.art === "datensuche");

  pruefe("im Demo-Modus gibt es keine Datensuche", arten(ergebnis("Xylophon", { datenSuchbar: false })) === "ki");
  pruefe("ein einzelnes Zeichen sucht nicht in Daten", !arten(ergebnis("ж".repeat(DATEN_AB - 1))).includes("datensuche"));

  const mit = ergebnis("Xylophon", { daten: { begriff: "Xylophon", treffer: gefunden } });
  pruefe("mit Ergebnis: Datensaetze statt Datensuchzeile, keine KI-Frage", arten(mit) === "daten", arten(mit));
  pruefe("mit Ergebnis: die Ansage zaehlt die Datensaetze", mit.anzahl === 2 && mit.hinweis === null, `${mit.anzahl}`);
  pruefe("mit Ergebnis: jede Option ist ein Datensatz", mit.gruppen[0]!.optionen.every((o) => o.art === "datensatz"));

  const leer = ergebnis("Xylophon", { daten: { begriff: "Xylophon", treffer: [] } });
  pruefe("Ergebnis ohne Treffer: eigener Hinweis und die KI-Frage, keine zweite Datensuche", arten(leer) === "ki" && leer.hinweis === "keineDaten" && leer.anzahl === 0, `${arten(leer)} / ${leer.hinweis}`);

  const fremd = ergebnis("Xylophon", { daten: { begriff: "Xylo", treffer: gefunden } });
  pruefe("Ergebnis zu einem anderen Begriff zaehlt nicht", arten(fremd) === "datensuche,ki" && fremd.anzahl === 0, arten(fremd));

  const mitNamen = ergebnis("Lohn");
  pruefe("mit Namenstreffern steht die Datensuchzeile dahinter", arten(mitNamen).split(",").at(-1) === "datensuche" && !arten(mitNamen).includes("ki"), arten(mitNamen));
  pruefe("ohne Eingabe keine Datensuche", !arten(ergebnis("")).includes("datensuche"));
}

// --- 5. Texte in allen Sprachen ---------------------------------------------------------
for (const sprache of ["de", "en", "kk", "ru"]) {
  const suche = lade(sprache).suche as Baum;
  const typen = (suche.datenTyp ?? {}) as Baum;
  const fehlt = DATEN_TYPEN.filter((t) => typeof typen[t] !== "string");
  pruefe(`${sprache}: Typnamen fuer alle Datentypen`, fehlt.length === 0, fehlt.join(","));
  const noetig = ["gruppeDaten", "datenSuchen", "datenLaedt", "keineDaten"].filter((k) => typeof suche[k] !== "string");
  const fehler = (suche.datenFehler ?? {}) as Baum;
  const fehlerFehlt = ["anmeldung", "nichtVerfuegbar", "fehler"].filter((k) => typeof fehler[k] !== "string");
  pruefe(`${sprache}: Texte der Datensuche vollstaendig`, noetig.length === 0 && fehlerFehlt.length === 0, [...noetig, ...fehlerFehlt].join(","));
  pruefe(`${sprache}: Datensuchzeile nennt den Begriff`, String(suche.datenSuchen).includes("{begriff}") && String(suche.keineDaten).includes("{begriff}"));
}

console.log("");
if (fehlgeschlagen > 0) {
  console.error(`${fehlgeschlagen} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle Pruefungen bestanden.");
