// Tests fuer die Startkarten-Zuordnung (lib/domain/startkarte.ts) und fuer die Auswahl der
// Kennzahlen, die auf die Uebersichtsseite gehoeren (lib/domain/zielstand.ts).
//
// Kein Netzwerk, keine Datenbank: beides sind reine Funktionen ueber fertige Objekte.
// Genau deshalb liegen sie in lib/domain und nicht in den Komponenten.
// Aufruf: npm run test:uebersicht-reiter (ueber tsx, damit die @/-Pfade aufloesen).

import { readdirSync, readFileSync } from "node:fs";
import { kpis as alleKpis, kpisFuerRolle, type Kpi } from "@/lib/domain/kpis";
import { STARTKARTEN, startkarteFuer } from "@/lib/domain/startkarte";
import { auffaelligeZuerst, nurAuffaellige, zielAuswerten } from "@/lib/domain/zielstand";
import { roles, type Role } from "@/lib/rbac";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}
const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- Bausteine -----------------------------------------------------------------------------

function kpi(teil: Partial<Kpi> & { key: string }): Kpi {
  return {
    zone: "hof",
    wert: "5 %",
    ziel: "< 6 %",
    trend: null,
    gutRichtung: "runter",
    stufe: "kern",
    sichtbarFuer: ["admin"],
    gerechnet: { zahl: 5, einheit: "%", basis: "test", datensaetze: 10 },
    ...teil,
  } as Kpi;
}

// ---- Welche Startkarte eine Rolle bekommt ----------------------------------------------------

pruefe("Fuehrung und Buero bekommen die Finanzzahl", (["admin", "ceo", "betriebsleitung", "buchhaltung"] as Role[]).every((r) => startkarteFuer(r) === "finanzen"));
pruefe("Brigade bekommt die offenen Pflueckaufgaben", startkarteFuer("brigade") === "pflueckaufgaben");
pruefe("Pfluecker bekommt den letzten Lohnlauf", startkarteFuer("picker") === "lohn");
pruefe("Kunde bekommt die naechste Lieferung", startkarteFuer("kunde") === "lieferung");
// Die Rechtematrix gibt erzeuger finanzen:view, aber das sind die Nachbarbetriebe im Zukauf -
// ein externer Zulieferer soll den Gesamtdeckungsbeitrag nicht als erste Zahl lesen.
pruefe("Erzeuger bekommt KEINE Finanzzahl, trotz finanzen:view", startkarteFuer("erzeuger") === null);
pruefe("Ohne Rolle keine Startkarte", startkarteFuer(null) === null && startkarteFuer(undefined) === null);
pruefe("Jede Rolle ist entschieden, keine ist vergessen", roles.every((r) => startkarteFuer(r) === null || STARTKARTEN.includes(startkarteFuer(r)!)));


// ---- Auswahl der auffaelligen Kennzahlen -----------------------------------------------------

const imZiel = kpi({ key: "imZiel", wert: "4 %", ziel: "< 6 %", gerechnet: { zahl: 4, einheit: "%", basis: "test", datensaetze: 10 } });
const knapp = kpi({ key: "knapp", wert: "6,3 %", ziel: "< 6 %", gerechnet: { zahl: 6.3, einheit: "%", basis: "test", datensaetze: 10 } });
const verfehlt = kpi({ key: "verfehlt", wert: "9 %", ziel: "< 6 %", gerechnet: { zahl: 9, einheit: "%", basis: "test", datensaetze: 10 } });
const platzhalter = kpi({ key: "platzhalter", wert: "3 %", ziel: "< 6 %", gerechnet: null });
const ohneZiel = kpi({ key: "ohneZiel", wert: "12 t", ziel: "Ausgangswert", gerechnet: { zahl: 12, einheit: "%", basis: "test", datensaetze: 10 } });

pruefe("Zielstaende der Bausteine stimmen", gleich(
  [imZiel, knapp, verfehlt, ohneZiel].map((k) => zielAuswerten(k).stand),
  ["erfuellt", "knapp", "verfehlt", "offen"],
));

const auswahl = nurAuffaellige([imZiel, knapp, verfehlt, platzhalter, ohneZiel]);
pruefe("Was im Ziel liegt, faellt raus", !auswahl.some((k) => k.key === "imZiel"));
pruefe("Verfehlt, knapp, Platzhalter und ohne Ziel bleiben", auswahl.length === 4);
pruefe("Verfehlt steht vor knapp", auswahl.findIndex((k) => k.key === "verfehlt") < auswahl.findIndex((k) => k.key === "knapp"));
// Platzhalter und Kennzahlen ohne Zielwert stehen hinter allem Gemessenen, obwohl der
// Platzhalter rechnerisch gut dasteht (3 % gegen ein Ziel von unter 6 %). Ein
// unterschriebener Ausgangswert ist keine Messung und gehoert nicht nach vorn.
pruefe("Gemessenes vorn, Platzhalter und Zielloses hinten", gleich(auswahl.map((k) => k.key), ["verfehlt", "knapp", "ohneZiel", "platzhalter"]));
pruefe("Der Platzhalter ist als solcher erkannt", zielAuswerten(platzhalter).platzhalter);

pruefe("Alles im Ziel: leere Auswahl, kein Absturz", nurAuffaellige([imZiel]).length === 0);
pruefe("Leere Eingabe: leere Auswahl", nurAuffaellige([]).length === 0);
pruefe("Die Eingabeliste wird nicht veraendert", (() => {
  const ein = [verfehlt, imZiel, knapp];
  const vorher = ein.map((k) => k.key).join(",");
  nurAuffaellige(ein);
  return ein.map((k) => k.key).join(",") === vorher;
})());

// Zwei Laeufe mit derselben Eingabe muessen dasselbe liefern, auch bei gleichem Abstand.
const gleichAuf = [kpi({ key: "a", wert: "9 %", ziel: "< 6 %", gerechnet: { zahl: 9, einheit: "%", basis: "test", datensaetze: 10 } }), kpi({ key: "b", wert: "9 %", ziel: "< 6 %", gerechnet: { zahl: 9, einheit: "%", basis: "test", datensaetze: 10 } })];
pruefe("Gleicher Abstand ergibt eine stabile Reihenfolge", gleich(nurAuffaellige(gleichAuf).map((k) => k.key), nurAuffaellige(gleichAuf).map((k) => k.key)));

// ---- Auffuellen bis zur Mindestzahl ----------------------------------------------------------

// Eine Zonenkarte zeigt mindestens vier Kennzahlen, Auffaelliges zuerst, der Rest aufgefuellt
// mit dem, was im Ziel liegt. Eine Karte mit einer einzigen Kachel saehe aus, als fehle etwas.
const vier = auffaelligeZuerst([imZiel, knapp, verfehlt, platzhalter, ohneZiel], 4);
pruefe("Genau vier, wenn mehr vorhanden sind", vier.length === 4);
pruefe("Bei vier Auffaelligen bleibt kein Platz zum Auffuellen", !vier.includes(imZiel));

// Der eigentliche Auffuell-Fall: ein Auffaelliges, drei im Ziel.
const imZiel2 = kpi({ key: "imZiel2", wert: "4,5 %", ziel: "< 6 %", gerechnet: { zahl: 4.5, einheit: "%", basis: "test", datensaetze: 10 } });
const imZiel3 = kpi({ key: "imZiel3", wert: "4,8 %", ziel: "< 6 %", gerechnet: { zahl: 4.8, einheit: "%", basis: "test", datensaetze: 10 } });
const aufgefuellt = auffaelligeZuerst([imZiel, imZiel2, imZiel3, verfehlt], 4);
pruefe("Aufgefuellt bis zur Mindestzahl", aufgefuellt.length === 4);
pruefe("Das Auffaellige steht dabei vorn", aufgefuellt[0]!.key === "verfehlt");
pruefe("Platzhalter werden nicht von Erfuelltem verdraengt", auffaelligeZuerst([imZiel, imZiel2, imZiel3, platzhalter], 2).includes(platzhalter));
pruefe("Weniger vorhanden als gefordert: alles, was da ist", auffaelligeZuerst([imZiel, knapp], 4).length === 2);
pruefe("Nichts vorhanden: leer, kein Absturz", auffaelligeZuerst([], 4).length === 0);
// Nie weniger als alles Auffaellige - eine Obergrenze verstecke genau das, wofuer die Seite da ist.
const fuenfAuffaellige = [verfehlt, knapp, platzhalter, ohneZiel, kpi({ key: "v2", wert: "20 %", ziel: "< 6 %", gerechnet: { zahl: 20, einheit: "%", basis: "test", datensaetze: 10 } })];
pruefe("Mehr Auffaelliges als die Mindestzahl wird nicht gekuerzt", auffaelligeZuerst([...fuenfAuffaellige, imZiel], 4).length === 5);
pruefe("Und das Erfuellte faellt dann raus", !auffaelligeZuerst([...fuenfAuffaellige, imZiel], 4).includes(imZiel));

// ---- Die Weichen im Code ---------------------------------------------------------------------

const quelle = (p: string) => readFileSync(p, "utf8");
const seite = quelle("src/app/[locale]/dashboard/page.tsx");
const bereiche = quelle("src/components/dashboard/bereiche-box.tsx");
pruefe("Die Kennzahlen stehen bei ihrem Bereich, vier je Bereich", bereiche.includes("auffaelligeZuerst") && bereiche.includes("kpi.zone === zone.key") && bereiche.includes("JE_BEREICH = 4"));
pruefe("Die Startseite kennt keine Reiter mehr", !seite.includes("reiterAusText") && !seite.includes("searchParams"));
pruefe("Die Bereiche stehen unter dem Report, nicht dahinter", seite.indexOf("compliance={") < seite.indexOf("bereiche={"));

// "Zusammenfassung im Chat" und "Tour erneut starten" stehen in der Kopfzeile des Reports
// (#117). Beim Umbau auf diese Uebersicht (#122) gingen sie mit der alten Datei verloren,
// ohne dass es jemand merkte - diese Pruefung haelt sie dort fest.
const uebersicht = quelle("src/components/dashboard/tages-uebersicht.tsx");
const tourAktionen = quelle("src/components/dashboard/ceo-tour-aktionen.tsx");
const kacheln = quelle("src/components/dashboard/tages-kacheln.tsx");
pruefe(
  "Kopfzeile: beide Tour-Knoepfe stehen neben 'Jetzt neu pruefen'",
  /action=\{[\s\S]*<CeoTourAktionen \/>[\s\S]*<CeoAktualisierenKnopf \/>/.test(uebersicht),
);
pruefe(
  "Kopfzeile: es sind Zusammenfassung UND Tour-Neustart",
  tourAktionen.includes('tc("tour.zusammenfassung")') && tourAktionen.includes('tc("tour.neustart")'),
);
pruefe("Kein zweiter Neustart-Knopf neben 'Befunde'", !kacheln.includes('tc("tour.neustart")'));

// ---- Kennzahlen-Verlauf: Datenbank und Anwendung ziehen dieselbe Grenze (28.09.2026) ----
// public.kpi_sichtbar() spiegelt sichtbarFuer. Laeuft beides auseinander, saehe eine Rolle ueber
// Himbis datenLesen einen Verlauf, den die Uebersicht ihr nicht zeigt (oder umgekehrt fehlte ihr
// der Trendpfeil). Gelesen wird die NEUESTE Migration, die kpi_sichtbar definiert: Migrationen sind
// unveraenderlich, eine neue Kennzahl kommt ueber ein neues "create or replace" (Funde 82 und 90,
// 28.09.2026). Ob die Policy wirklich an kpi_sichtbar haengt, prueft pglite-fast.mjs am Verhalten
// je Rolle und ohne Anmeldung; der fruehere Textvergleich der Policy entfaellt (Fund 76).
/** Die zuletzt angelegte kpi_sichtbar: Datei und Funktion vom "create" bis zum Ende des $-Rumpfs. */
function neuesteKpiSichtbar(dateien: { name: string; text: string }[]) {
  const definition = /create\s+(?:or\s+replace\s+)?function\s+public\.kpi_sichtbar\s*\(/i;
  // eine Erwaehnung im SQL-Kommentar ist keine Definition
  const ohneKommentare = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");
  const treffer = [...dateien].sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({ name: d.name, text: ohneKommentare(d.text) }))
    .filter((d) => definition.test(d.text)).at(-1);
  if (!treffer) return undefined;
  const start = treffer.text.search(definition);
  const marke = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(treffer.text.slice(start));
  if (!marke) return { datei: treffer.name, funktion: "" };
  const rumpfStart = start + marke.index + marke[0].length;
  return { datei: treffer.name, funktion: treffer.text.slice(start, treffer.text.indexOf(marke[1]!, rumpfStart)) };
}
function rollenJeKennzahl(funktion: string) {
  const inDb = new Map<string, string[]>();
  for (const m of funktion.matchAll(/when '([A-Za-z]+)'\s+then public\.has_role\(([^)]*)\)/g)) {
    inDb.set(m[1]!, [...m[2]!.matchAll(/'([a-z]+)'/g)].map((r) => r[1]!).sort());
  }
  return inDb;
}
{
  const def = (rollen: string) =>
    `create or replace function public.kpi_sichtbar(p text) returns boolean language sql as $$\n  select case p\n    when 'verlustquote' then public.has_role(${rollen})\n    else public.has_role('admin')\n  end;\n$$;\n`;
  const alt = { name: "20261112000000_a.sql", text: def("'admin'") };
  const neu = { name: "20261201000000_b.sql", text: def("'admin', 'kunde'") + "create policy x on public.kpi_verlauf using (public.has_role('gast'));\n" };
  const nurKommentar = { name: "20261301000000_c.sql", text: "-- ersetzt create or replace function public.kpi_sichtbar( aus b\nselect 1;\n" };
  const gewaehlt = neuesteKpiSichtbar([neu, nurKommentar, alt]);
  pruefe("Kennzahlen-Verlauf (Suche): die neueste Definition gilt, eine Erwaehnung im Kommentar nicht", gewaehlt?.datei === neu.name, gewaehlt?.datei);
  pruefe("Kennzahlen-Verlauf (Suche): gelesen wird nur die Funktion, nicht was danach kommt",
    gleich([...rollenJeKennzahl(gewaehlt?.funktion ?? "").entries()], [["verlustquote", ["admin", "kunde"]]]) && !gewaehlt?.funktion.includes("gast"));
}
{
  const ordner = new URL("./../migrations/", import.meta.url);
  const gefunden = neuesteKpiSichtbar(readdirSync(ordner).filter((f) => f.endsWith(".sql"))
    .map((f) => ({ name: f, text: readFileSync(new URL(f, ordner), "utf8") })));
  pruefe("Kennzahlen-Verlauf: eine Migration definiert kpi_sichtbar", gefunden !== undefined);
  const datei = gefunden?.datei;
  const funktion = gefunden?.funktion ?? "";
  const inDb = rollenJeKennzahl(funktion);
  const inApp = new Map(alleKpis.map((k) => [k.key, [...k.sichtbarFuer].sort()]));
  const fehlend = [...inApp.keys()].filter((k) => !inDb.has(k));
  const ueberzaehlig = [...inDb.keys()].filter((k) => !inApp.has(k));
  const abweichend = [...inApp.entries()].filter(([k, r]) => inDb.has(k) && !gleich(inDb.get(k), r)).map(([k]) => k);
  pruefe(`Kennzahlen-Verlauf: jede Kennzahl der Anwendung steht in kpi_sichtbar (${datei}), keine zusaetzliche`, fehlend.length === 0 && ueberzaehlig.length === 0, `fehlt: ${fehlend.join(", ")} zusaetzlich: ${ueberzaehlig.join(", ")}`);
  pruefe("Kennzahlen-Verlauf: die Rollen je Kennzahl sind in Datenbank und sichtbarFuer gleich", abweichend.length === 0, abweichend.join(", "));
  pruefe("Kennzahlen-Verlauf: unbekannte Kennzahlen nur fuer admin (und damit ceo)", /else\s+public\.has_role\('admin'\)\s*end\b/i.test(funktion));
  // Dieselbe Regel fuer ceo wie in kpisFuerRolle: ceo sieht, was admin sieht.
  pruefe("Kennzahlen-Verlauf: ceo sieht in der Anwendung genau die Kennzahlen mit admin", gleich(kpisFuerRolle("ceo", alleKpis).kern.concat(kpisFuerRolle("ceo", alleKpis).erweitert).map((k) => k.key).sort(), alleKpis.filter((k) => k.sichtbarFuer.includes("admin")).map((k) => k.key).sort()));
}

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
if (fehler > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
