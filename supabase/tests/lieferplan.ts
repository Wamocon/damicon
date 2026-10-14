// Lieferplan als Kalenderdatei und Nachrichten je Vorbestellung (WMCNL-1472): die Regeln in
// domain/ics.ts, domain/lieferplan.ts und domain/nachrichten.ts, die Download-Route und die
// Texte in vier Sprachen. Die Datenbankseite der Nachrichten prueft vorbestellung-nachrichten.mts.
//
// Aufruf: npm run test:lieferplan (ueber tsx, damit die @/-Pfade aufloesen).

import { readFileSync } from "node:fs";
import { folgetag, ICS_ZEILENENDE, icsFalten, icsKalender, icsTag, icsText, icsZeitstempel, type IcsTermin } from "@/lib/domain/ics";
import { lieferplanTermine, type Beschriftung, type LieferplanQuelle } from "@/lib/domain/lieferplan";
import { jeVorbestellung, NACHRICHT_MAX_ZEICHEN, nachrichtFehler, type NachrichtZeile } from "@/lib/domain/nachrichten";

let fehlgeschlagen = 0;
function pruefe(name: string, ok: boolean, zusatz = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${zusatz ? "  - " + zusatz : ""}`);
  if (!ok) fehlgeschlagen++;
}
const oktette = (s: string) => new TextEncoder().encode(s).length;

// --- 1. Maskieren --------------------------------------------------------------------------------------
pruefe("Text: Backslash, Semikolon, Komma und Umbruch werden maskiert", icsText("a\\b;c,d\ne") === "a\\\\b\\;c\\,d\\ne", icsText("a\\b;c,d\ne"));
pruefe("Text: ein Windows-Umbruch wird genau ein \\n", icsText("a\r\nb") === "a\\nb");
pruefe("Text: kyrillisch bleibt unveraendert", icsText("Поставка: Полка") === "Поставка: Полка");

// --- 2. Falten ------------------------------------------------------------------------------------------
{
  const kurz = "X".repeat(75);
  pruefe("Falten: 75 Oktette bleiben eine Zeile", icsFalten(kurz) === kurz);
  const lang = "SUMMARY:" + "x".repeat(200);
  const gefaltet = icsFalten(lang);
  const teile = gefaltet.split(ICS_ZEILENENDE);
  pruefe("Falten: jede Zeile hat hoechstens 75 Oktette", teile.every((z) => oktette(z) <= 75), teile.map(oktette).join(","));
  pruefe("Falten: Folgezeilen beginnen mit einem Leerzeichen", teile.slice(1).every((z) => z.startsWith(" ")));
  pruefe("Falten: ohne die Umbrueche ist der Inhalt unveraendert", gefaltet.split(`${ICS_ZEILENENDE} `).join("") === lang);
}
{
  const kyrillisch = "SUMMARY:" + "Поставка клубники ".repeat(12);
  const gefaltet = icsFalten(kyrillisch);
  const teile = gefaltet.split(ICS_ZEILENENDE);
  pruefe("Falten: Bytes statt Zeichen, kein Zeichen wird geteilt (Kyrillisch)", teile.every((z) => oktette(z) <= 75) && gefaltet.split(`${ICS_ZEILENENDE} `).join("") === kyrillisch, teile.map(oktette).join(","));
  const emoji = "SUMMARY:" + "🍓".repeat(40);
  const g2 = icsFalten(emoji);
  pruefe("Falten: auch Zeichen mit vier Bytes bleiben ganz", g2.split(ICS_ZEILENENDE).every((z) => oktette(z) <= 75) && g2.split(`${ICS_ZEILENENDE} `).join("") === emoji);
}

// --- 3. Tage --------------------------------------------------------------------------------------------------
pruefe("Tag ohne Striche", icsTag("2026-10-14") === "20261014");
pruefe("Folgetag: Monatswechsel, Jahreswechsel, Schalttag", folgetag("2026-10-31") === "2026-11-01" && folgetag("2026-12-31") === "2027-01-01" && folgetag("2028-02-28") === "2028-02-29" && folgetag("2028-02-29") === "2028-03-01" && folgetag("2027-02-28") === "2027-03-01");
pruefe("Zeitstempel in UTC ohne Millisekunden", icsZeitstempel(new Date("2026-10-14T10:10:30.456Z")) === "20261014T101030Z");

// --- 4. Datei -------------------------------------------------------------------------------------------------------
const termine: IcsTermin[] = [
  { uid: "lieferung-1@damicon", tag: "2026-10-20", titel: "Lieferung: Polka, 120 kg", beschreibung: "Zeile 1\nZeile 2", zustand: "CONFIRMED" },
  { uid: "vorbestellung-2@damicon", tag: "2026-10-21", titel: "Vorbestellung: Polana, 80 kg", zustand: "TENTATIVE" },
];
const datei = icsKalender(termine, { jetzt: new Date("2026-10-14T10:10:30Z"), name: "Damicon Lieferplan", produkt: "-//WAMOCON//Damicon Lieferplan//EN" });
pruefe("Datei: beginnt mit BEGIN:VCALENDAR und endet mit END:VCALENDAR und CRLF", datei.startsWith("BEGIN:VCALENDAR\r\n") && datei.endsWith("END:VCALENDAR\r\n"));
pruefe("Datei: jeder Zeilenumbruch ist CRLF, kein einzelnes LF", !/(^|[^\r])\n/.test(datei));
pruefe("Datei: Version, Produkt und Name", datei.includes("VERSION:2.0\r\n") && datei.includes("PRODID:-//WAMOCON//Damicon Lieferplan//EN\r\n") && datei.includes("X-WR-CALNAME:Damicon Lieferplan\r\n"));
pruefe("Datei: ein Termin je Eintrag", (datei.match(/BEGIN:VEVENT/g) ?? []).length === 2 && (datei.match(/END:VEVENT/g) ?? []).length === 2);
pruefe("Datei: ganztaegig, Ende ist der Folgetag", datei.includes("DTSTART;VALUE=DATE:20261020\r\n") && datei.includes("DTEND;VALUE=DATE:20261021\r\n"));
pruefe("Datei: Kennung, Zeitstempel und Zustand", datei.includes("UID:lieferung-1@damicon\r\n") && datei.includes("DTSTAMP:20261014T101030Z\r\n") && datei.includes("STATUS:CONFIRMED\r\n") && datei.includes("STATUS:TENTATIVE\r\n"));
pruefe("Datei: Komma im Titel und Umbruch in der Beschreibung sind maskiert", datei.includes("SUMMARY:Lieferung: Polka\\, 120 kg\r\n") && datei.includes("DESCRIPTION:Zeile 1\\nZeile 2\r\n"));
pruefe("Datei: ohne Beschreibung keine DESCRIPTION-Zeile fuer diesen Termin", (datei.match(/DESCRIPTION:/g) ?? []).length === 1);
pruefe("Datei: Termine blockieren den Kalender nicht (TRANSPARENT)", (datei.match(/TRANSP:TRANSPARENT/g) ?? []).length === 2);
{
  const zweiter = icsKalender(termine, { jetzt: new Date("2026-10-15T08:00:00Z"), name: "Damicon Lieferplan", produkt: "x" });
  const uids = (s: string) => [...s.matchAll(/UID:([^\r]+)/g)].map((m) => m[1]).join(",");
  pruefe("Datei: die Kennungen bleiben bei jedem Abruf gleich", uids(datei) === uids(zweiter));
  const leer = icsKalender([], { jetzt: new Date(), name: "Leer", produkt: "x" });
  pruefe("Datei: ohne Termine ein gueltiger, leerer Kalender", leer.startsWith("BEGIN:VCALENDAR") && !leer.includes("BEGIN:VEVENT") && leer.endsWith("END:VCALENDAR\r\n"));
}

// --- 5. Auswahl der Termine -------------------------------------------------------------------------------------------
const HEUTE = "2026-10-14";
const beschrifte: Beschriftung = (art, d) => ({ titel: `${art}: ${d.sorte ?? "?"} ${d.mengeKg}`, beschreibung: `${d.kunde ?? ""}|${d.status}` });
const quelle: LieferplanQuelle = {
  vorbestellungen: [
    { id: "v1", status: "bestaetigt", mengeKg: 100, liefertermin: "2026-10-18", sorte: "Polka", kunde: "A" },
    { id: "v2", status: "angefragt", mengeKg: 50, liefertermin: "2026-10-16", sorte: "Polana", kunde: "B" },
    { id: "v3", status: "storniert", mengeKg: 50, liefertermin: "2026-10-17", sorte: "Polka", kunde: "A" },
    { id: "v4", status: "geliefert", mengeKg: 50, liefertermin: "2026-10-17", sorte: "Polka", kunde: "A" },
    { id: "v5", status: "bestaetigt", mengeKg: 70, liefertermin: "2026-10-10", sorte: "Polka", kunde: "A" },
    { id: "v6", status: "bestaetigt", mengeKg: 70, liefertermin: null, sorte: "Polka", kunde: "A" },
    { id: "v7", status: "bestaetigt", mengeKg: 90, liefertermin: HEUTE, sorte: "Tulameen", kunde: "C" },
  ],
  lieferungen: [
    { id: "l1", vorbestellungId: "v1", status: "geplant", mengeKg: 100, tourDatum: "2026-10-17", kunde: "A" },
    { id: "l2", vorbestellungId: null, status: "geplant", mengeKg: 20, tourDatum: "2026-10-15", kunde: "D" },
    { id: "l3", vorbestellungId: null, status: "zugestellt", mengeKg: 20, tourDatum: "2026-10-15", kunde: "D" },
    { id: "l4", vorbestellungId: null, status: "storniert", mengeKg: 20, tourDatum: "2026-10-15", kunde: "D" },
    { id: "l5", vorbestellungId: null, status: "geplant", mengeKg: 20, tourDatum: null, kunde: "D" },
    { id: "l6", vorbestellungId: null, status: "geplant", mengeKg: 20, tourDatum: "2026-10-01", kunde: "D" },
  ],
};
{
  const ergebnis = lieferplanTermine(quelle, HEUTE, beschrifte);
  const ids = ergebnis.map((t) => t.uid.replace("@damicon", ""));
  pruefe("Termine: geplante Lieferungen auf Tour, offene Vorbestellungen mit Termin ab heute, nach Tag sortiert", ids.join(",") === `vorbestellung-v7,lieferung-l2,vorbestellung-v2,lieferung-l1`, ids.join(","));
  pruefe("Termine: eine Vorbestellung mit geplanter Tour-Lieferung steht nicht doppelt da (Tag der Tour gilt)", !ids.includes("vorbestellung-v1") && ergebnis.find((t) => t.uid.startsWith("lieferung-l1"))?.tag === "2026-10-17");
  pruefe("Termine: storniert, geliefert, vergangen und ohne Termin fehlen", !ids.some((i) => ["vorbestellung-v3", "vorbestellung-v4", "vorbestellung-v5", "vorbestellung-v6"].includes(i)));
  pruefe("Termine: zugestellte, stornierte, tourlose und vergangene Lieferungen fehlen", !ids.some((i) => ["lieferung-l3", "lieferung-l4", "lieferung-l5", "lieferung-l6"].includes(i)));
  pruefe("Termine: der heutige Tag zaehlt noch", ids.includes("vorbestellung-v7"));
  pruefe("Termine: angefragt ist vorlaeufig, bestaetigt und Lieferung sind fest", ergebnis.find((t) => t.uid.startsWith("vorbestellung-v2"))?.zustand === "TENTATIVE" && ergebnis.find((t) => t.uid.startsWith("vorbestellung-v7"))?.zustand === "CONFIRMED" && ergebnis.find((t) => t.uid.startsWith("lieferung-l1"))?.zustand === "CONFIRMED");
  pruefe("Termine: die Sorte einer Lieferung stammt aus ihrer Vorbestellung", ergebnis.find((t) => t.uid.startsWith("lieferung-l1"))?.titel === "lieferung: Polka 100");
  pruefe("Termine: eine Lieferung ohne Vorbestellung hat keine Sorte", ergebnis.find((t) => t.uid.startsWith("lieferung-l2"))?.titel === "lieferung: ? 20");
  pruefe("Termine: leere Quelle, leerer Plan", lieferplanTermine({ lieferungen: [], vorbestellungen: [] }, HEUTE, beschrifte).length === 0);
}

// --- 6. Nachrichten -----------------------------------------------------------------------------------------------------
pruefe("Nachricht: leer und nur Leerraum sind ungueltig", nachrichtFehler("") === "eingabe" && nachrichtFehler("   \n ") === "eingabe");
pruefe("Nachricht: gueltig", nachrichtFehler("Bitte einen Tag frueher.") === null);
pruefe("Nachricht: genau die Obergrenze ist erlaubt, ein Zeichen mehr nicht", nachrichtFehler("x".repeat(NACHRICHT_MAX_ZEICHEN)) === null && nachrichtFehler("x".repeat(NACHRICHT_MAX_ZEICHEN + 1)) === "nachrichtZuLang");
pruefe("Nachricht: gezaehlt werden Zeichen, nicht UTF-16-Einheiten (Emoji)", nachrichtFehler("🍓".repeat(NACHRICHT_MAX_ZEICHEN)) === null);
pruefe("Nachricht: Leerraum an den Enden zaehlt nicht mit", nachrichtFehler("  " + "x".repeat(NACHRICHT_MAX_ZEICHEN) + "  ") === null);
{
  const z = (id: string, vb: string, zeit: string): NachrichtZeile => ({ id, vorbestellungId: vb, autor: "A", rolle: "kunde", text: id, erstelltAm: zeit });
  const gruppen = jeVorbestellung([z("c", "v1", "2026-10-14T10:00:00Z"), z("a", "v1", "2026-10-14T08:00:00Z"), z("b", "v2", "2026-10-14T09:00:00Z"), z("d", "v1", "2026-10-14T08:00:00Z")]);
  pruefe("Nachrichten: je Vorbestellung, aelteste zuerst, bei gleicher Zeit nach Id", gruppen.v1.map((n) => n.id).join("") === "adc" && gruppen.v2.length === 1, gruppen.v1.map((n) => n.id).join(""));
}

// --- 7. Route ------------------------------------------------------------------------------------------------------------------
{
  const route = readFileSync("src/app/api/lieferplan/route.ts", "utf8");
  pruefe("Route: Anmeldung, Recht und zweiter Faktor werden geprueft", route.includes("getSessionProfile()") && route.includes('hasPermission(profil.role, "b2b_portal", "view")') && route.includes("requireAal2Aktuell()"));
  pruefe("Route: Download ohne Zwischenspeicher", route.includes('"Cache-Control": "no-store"') && route.includes("attachment;") && route.includes("text/calendar"));
  pruefe("Route: nur bekannte Sprachen, sonst die Standardsprache", route.includes("routing.locales") && route.includes("routing.defaultLocale"));
  pruefe("Route: kein Token in der Adresse (es gibt nur den Sprachparameter)", !/searchParams\.get\("(token|key|schluessel|code)"\)/.test(route));
}

// --- 8. Texte ---------------------------------------------------------------------------------------------------------------------------
type Baum = { [k: string]: Baum | string };
for (const sprache of ["de", "en", "kk", "ru"]) {
  const d = JSON.parse(readFileSync(`src/messages/${sprache}.json`, "utf8")) as Baum;
  const n = d.nachrichten as Baum;
  const l = d.lieferplan as Baum;
  const a = d.aktionen as Baum;
  const text = (b: Baum, k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
  const nachrichtenOk = ["titel", "lead", "keineVorbestellung", "keineNachrichten", "anzahl", "feld", "platzhalter", "hinweis", "senden", "storniert"].every((k) => text(n, k));
  const downloadOk = text(n.download as Baum, "knopf") !== "" && text(n.download as Baum, "hinweis") !== "";
  pruefe(`${sprache}: Texte der Nachrichten vollstaendig`, nachrichtenOk && downloadOk);
  const lieferplanOk = ["kalenderName", "titelLieferung", "titelVorbestellung", "lieferungGeplant", "kunde", "sorteMenge", "ohneSorte"].every((k) => text(l, k)) && text(l.status as Baum, "angefragt") !== "" && text(l.status as Baum, "bestaetigt") !== "";
  pruefe(`${sprache}: Texte des Kalenders vollstaendig`, lieferplanOk);
  pruefe(`${sprache}: Meldungen der Aktion`, text(a.ok as Baum, "nachricht") !== "" && text(a.fehler as Baum, "nachrichtZuLang") !== "" && text(a.fehler as Baum, "vorbestellungStorniert") !== "");
  pruefe(`${sprache}: Titel des Kalenders nennen Sorte und Menge`, text(l, "titelLieferung").includes("{sorte}") && text(l, "titelLieferung").includes("{menge}") && text(l, "titelVorbestellung").includes("{sorte}"));
}

console.log("");
if (fehlgeschlagen > 0) {
  console.error(`${fehlgeschlagen} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle Pruefungen bestanden.");
