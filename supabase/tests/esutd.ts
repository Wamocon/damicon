// Meldeprozess fuer das Einheitssystem ЕСУТД (WMCNL-1447, Stufe 1): Faelligkeit, Zaehlung und
// Reihenfolge der Meldungen, Pruefung der Eingaben und die Texte in vier Sprachen. Die Datenbankseite
// prueft test:esutd-db.
//
// Aufruf: npm run test:esutd

import { readFileSync } from "node:fs";
import { csvDatei, csvZelle } from "@/lib/domain/csv";
import {
  BESCHREIBUNG_MAX_ZEICHEN,
  BESTAETIGUNG_MAX_ZEICHEN,
  ESUTD_ARTEN,
  VERTRAGSNUMMER_MAX_ZEICHEN,
  esutdEreignisFehler,
  esutdErfassenFehler,
  esutdTon,
  esutdAltbestand,
  esutdVertragFehler,
  istEsutdArt,
  meldungUeberfaellig,
  sortiereMeldungen,
  zaehleMeldungen,
  type EsutdMeldung,
} from "@/lib/domain/esutd";

let fehler = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const HEUTE = "2026-10-14";
const m = (id: string, extra: Partial<EsutdMeldung> = {}): EsutdMeldung => ({
  quelle: "vertrag", id, pfluecker: id, ausweis: null, art: "abschluss", ereignisAm: "2026-10-01", beschreibung: null, vertragsnummer: null,
  status: "offen", erfasstAm: null, bestaetigung: null, belegDokumentId: null, meldefristAm: null, ...extra,
});

// --- 1. Arten, Faelligkeit, Zaehlung ----------------------------------------------------------------------------------
check("Arten: Abschluss, Aenderung, Beendigung", ESUTD_ARTEN.length === 3 && ESUTD_ARTEN.every(istEsutdArt) && !istEsutdArt("kuendigung"));
check("Faelligkeit: der Tag der Frist zaehlt noch, danach ist sie ueberschritten", !meldungUeberfaellig(m("a", { meldefristAm: HEUTE }), HEUTE) && meldungUeberfaellig(m("a", { meldefristAm: "2026-10-13" }), HEUTE) && !meldungUeberfaellig(m("a", { meldefristAm: "2026-10-15" }), HEUTE));
check("Faelligkeit: ohne Frist nie, erledigt nie", !meldungUeberfaellig(m("a"), HEUTE) && !meldungUeberfaellig(m("a", { status: "erfasst", meldefristAm: "2026-01-01" }), HEUTE));
{
  const z = zaehleMeldungen(
    [m("a", { meldefristAm: "2026-10-01" }), m("b", { meldefristAm: "2026-10-20" }), m("c"), m("d", { status: "erfasst", erfasstAm: "2026-10-02" }), m("e", { quelle: "ereignis", art: "beendigung" })],
    HEUTE,
  );
  check("Zaehlung: offen, ueberschritten, gemeldet", z.offen === 4 && z.ueberfaellig === 1 && z.erfasst === 1, JSON.stringify(z));
}
check("Farbton: offen warnt, gemeldet ist gut", esutdTon.offen === "warning" && esutdTon.erfasst === "success");

// --- 2. Reihenfolge ----------------------------------------------------------------------------------------------------------
{
  const sortiert = sortiereMeldungen([
    m("erledigt-alt", { status: "erfasst", erfasstAm: "2026-09-01" }),
    m("ohne-frist-spaet", { ereignisAm: "2026-12-31", quelle: "ereignis", art: "beendigung" }),
    m("frist-spaet", { meldefristAm: "2026-10-20" }),
    m("erledigt-neu", { status: "erfasst", erfasstAm: "2026-10-10" }),
    m("frist-frueh", { meldefristAm: "2026-10-05" }),
    m("ohne-frist-frueh", { ereignisAm: "2026-11-01", quelle: "ereignis", art: "aenderung" }),
  ]);
  const ids = sortiert.map((x) => x.id).join(",");
  check("Reihenfolge: Offenes vor Erledigtem, mit Frist zuerst, dann nach Datum, Erledigtes juengste zuerst", ids === "frist-frueh,frist-spaet,ohne-frist-frueh,ohne-frist-spaet,erledigt-neu,erledigt-alt", ids);
  const original = [m("b", { meldefristAm: "2026-10-20" }), m("a", { meldefristAm: "2026-10-01" })];
  sortiereMeldungen(original);
  check("Reihenfolge: die Eingabe bleibt unveraendert", original[0].id === "b");
}

// --- 3. Eingaben -------------------------------------------------------------------------------------------------------------
check("Abschluss: Beginn muss ein echtes Datum sein", esutdVertragFehler({ beginn: "", vertragsnummer: "" }) === "esutdDatum" && esutdVertragFehler({ beginn: "2026-02-30", vertragsnummer: "" }) === "esutdDatum" && esutdVertragFehler({ beginn: "2026-10-01", vertragsnummer: "" }) === null);
check("Abschluss: ein Beginn in der Zukunft ist erlaubt (der Vertrag kann spaeter anfangen)", esutdVertragFehler({ beginn: "2027-03-01", vertragsnummer: "V-1" }) === null);
check("Abschluss: Vertragsnummer nur bis zur Grenze", esutdVertragFehler({ beginn: "2026-10-01", vertragsnummer: "x".repeat(VERTRAGSNUMMER_MAX_ZEICHEN) }) === null && esutdVertragFehler({ beginn: "2026-10-01", vertragsnummer: "x".repeat(VERTRAGSNUMMER_MAX_ZEICHEN + 1) }) === "esutdVertragsnummer");
check("Aenderung: braucht Datum und eine Beschreibung von 3 bis 300 Zeichen", esutdEreignisFehler({ art: "aenderung", ereignisAm: "2026-10-01", beschreibung: "" }) === "esutdBeschreibung" && esutdEreignisFehler({ art: "aenderung", ereignisAm: "2026-10-01", beschreibung: "ab" }) === "esutdBeschreibung" && esutdEreignisFehler({ art: "aenderung", ereignisAm: "2026-10-01", beschreibung: "abc" }) === null && esutdEreignisFehler({ art: "aenderung", ereignisAm: "2026-10-01", beschreibung: "x".repeat(BESCHREIBUNG_MAX_ZEICHEN + 1) }) === "esutdBeschreibung" && esutdEreignisFehler({ art: "aenderung", ereignisAm: "kaputt", beschreibung: "abc" }) === "esutdDatum");
check("Beendigung: die Beschreibung ist freiwillig, aber nicht ein oder zwei Zeichen", esutdEreignisFehler({ art: "beendigung", ereignisAm: "2026-12-31", beschreibung: "" }) === null && esutdEreignisFehler({ art: "beendigung", ereignisAm: "2026-12-31", beschreibung: "x" }) === "esutdBeschreibung" && esutdEreignisFehler({ art: "beendigung", ereignisAm: "2026-12-31", beschreibung: "Saisonende" }) === null);
check("Erfassen: Meldedatum nicht in der Zukunft und echt", esutdErfassenFehler({ erfasstAm: HEUTE, bestaetigung: "" }, HEUTE) === null && esutdErfassenFehler({ erfasstAm: "2026-10-15", bestaetigung: "" }, HEUTE) === "esutdDatum" && esutdErfassenFehler({ erfasstAm: "", bestaetigung: "" }, HEUTE) === "esutdDatum" && esutdErfassenFehler({ erfasstAm: "31.12.2025", bestaetigung: "" }, HEUTE) === "esutdDatum");
check("Erfassen: Bestaetigung optional, hoechstens 100 Zeichen", esutdErfassenFehler({ erfasstAm: HEUTE, bestaetigung: "x".repeat(BESTAETIGUNG_MAX_ZEICHEN) }, HEUTE) === null && esutdErfassenFehler({ erfasstAm: HEUTE, bestaetigung: "x".repeat(BESTAETIGUNG_MAX_ZEICHEN + 1) }, HEUTE) === "esutdBestaetigung");

// --- 3b. CSV ---------------------------------------------------------------------------------------------------------------
const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const TAB = String.fromCharCode(9);
check("CSV: einfache Werte bleiben unveraendert, leere Zellen sind leer", csvZelle("Name") === "Name" && csvZelle(null) === "" && csvZelle(undefined) === "" && csvZelle(5) === "5");
check("CSV: Trenner, Anfuehrungszeichen und Zeilenumbruch werden eingefasst", csvZelle("a;b") === '"a;b"' && csvZelle('sagt "ja"') === '"sagt ""ja"""' && csvZelle(`zwei${NL}Zeilen`) === `"zwei${NL}Zeilen"`);
check("CSV: Formel-Anfaenge werden entschaerft", csvZelle("=1+1") === "'=1+1" && csvZelle("+7701") === "'+7701" && csvZelle("-5") === "'-5" && csvZelle("@SUM(A1)") === "'@SUM(A1)" && csvZelle(`${TAB}Tab`) === `'${TAB}Tab`);
check("CSV: ein entschaerfter Wert mit Trenner bleibt eingefasst", csvZelle('=HYPERLINK("x";"y")') === `"'=HYPERLINK(""x"";""y"")"`);
check("CSV: Zeilen enden mit CRLF, kyrillische Namen bleiben erhalten", csvDatei([["Имя", "Ausweis"], ["Қойшыбай М.", "MAL-1"]]) === `Имя;Ausweis${CR}${NL}Қойшыбай М.;MAL-1${CR}${NL}`);

// --- 4. Texte in vier Sprachen -----------------------------------------------------------------------------------------------
type Baum = { [k: string]: Baum | string };
const wert = (baum: Baum, pfad: string): unknown => pfad.split(".").reduce<unknown>((b, k) => (typeof b === "object" && b !== null ? (b as Baum)[k] : undefined), baum);
const quelle = `${readFileSync("src/lib/actions/esutd.ts", "utf8")}`;
const schluesselAusCode = [...quelle.matchAll(/"(ok|fehler)\.(esutd\w+)"|`fehler\.\$\{abgelehnt\}`/g)].filter((x) => x[1]).map((x) => `aktionen.${x[1]}.${x[2]}`);
const ausFehlerTyp = ["esutdDatum", "esutdVertragsnummer", "esutdBeschreibung", "esutdBestaetigung"].map((k) => `aktionen.fehler.${k}`); // ueber fehler.${abgelehnt} gebildet
const noetig = [
  ...new Set([...schluesselAusCode, ...ausFehlerTyp]),
  ...["titel", "lead", "stufeHinweis", "nurLesen"].map((k) => `esutdAnsicht.${k}`),
  ...["offen", "ueberfaellig", "erfasst"].map((k) => `esutdAnsicht.zaehl.${k}`),
  ...ESUTD_ARTEN.map((a) => `esutdAnsicht.art.${a}`),
  "esutdAnsicht.status.offen", "esutdAnsicht.status.erfasst",
  ...["titel", "leer", "ohneName", "keineFrist", "fristBis", "ueberfaellig", "ausweis", "vertrag", "erfasstAm", "bestaetigung", "beleg", "keinBeleg"].map((k) => `esutdAnsicht.liste.${k}`),
  ...["person", "art", "datum", "frist", "status", "beleg"].map((k) => `esutdAnsicht.liste.col.${k}`),
  ...["titel", "datum", "bestaetigung", "beleg", "keinBeleg", "hinweis", "knopf"].map((k) => `esutdAnsicht.aktion.erfassen.${k}`),
  "esutdAnsicht.aktion.oeffnen", "esutdAnsicht.aktion.entfernen",
  ...["titel", "person", "bitteWaehlen", "keinePersonen", "beginn", "nummer", "knopf"].map((k) => `esutdAnsicht.neu.abschluss.${k}`),
  ...["titel", "vertrag", "keineVertraege", "art", "datum", "beschreibung", "knopf"].map((k) => `esutdAnsicht.neu.ereignis.${k}`),
  "modules.integrationen.description", "modules.integrationen.summary", "modules.integrationen.todo",
  "esutdAnsicht.export.knopf", "esutdAnsicht.export.hinweis",
  ...["person", "ausweis", "art", "vertrag", "datum", "frist", "beschreibung", "status", "erfasstAm", "bestaetigung"].map((k) => `esutdAnsicht.export.spalte.${k}`),
];
check("Texte: die Aktionen nennen mindestens fuenf Schluessel", schluesselAusCode.length >= 5, String(schluesselAusCode.length));
for (const sprache of ["de", "en", "kk", "ru"]) {
  const d = JSON.parse(readFileSync(`src/messages/${sprache}.json`, "utf8")) as Baum;
  const fehlt = noetig.filter((p) => typeof wert(d, p) !== "string" || wert(d, p) === "");
  check(`${sprache}: alle ${noetig.length} Texte des Meldeprozesses vorhanden`, fehlt.length === 0, fehlt.join(", "));
}

// --- Vertrag mit erfassten Meldungen bleibt (Pruefung PR #156, 15.10.2026) -----------------------------------------------------------------
{
  const lies = (pfad: string) => readFileSync(pfad, "utf8").replace(/\r\n/g, "\n");
  const status = lies("src/lib/actions/status.ts");
  check("DA017: der Fehlercode der Datenbank wird auf die Meldung abgebildet", /case "DA017":[\s\S]{0,300}fehler\("fehler\.esutdErfassteMeldungen"\)/.test(status));
  const alleSprachen = ["de", "en", "kk", "ru"].every((s) => lies(`src/messages/${s}.json`).includes('"esutdErfassteMeldungen"'));
  check("DA017: die Meldung steht in allen vier Sprachen", alleSprachen);
}

// --- Altbestand: "erfasst" ohne Vertrag im Meldeprozess (15.10.2026) ----------------------------------------------------------------------
{
  check("Altbestand: erfasst ohne Vertrag, bei sichtbaren Verträgen, ist Altbestand", esutdAltbestand({ status: "erfasst", hatVertrag: false, vertraegeSichtbar: true }));
  check("Altbestand: mit Vertrag ist es keiner", !esutdAltbestand({ status: "erfasst", hatVertrag: true, vertraegeSichtbar: true }));
  check("Altbestand: ein offener Status braucht den Hinweis nicht (die Frist läuft ohnehin nicht)", !esutdAltbestand({ status: "offen", hatVertrag: false, vertraegeSichtbar: true }));
  check("Altbestand: wo die Verträge nicht lesbar sind, gibt es keinen Hinweis (sonst bei jeder Person falsch)", !esutdAltbestand({ status: "erfasst", hatVertrag: false, vertraegeSichtbar: false }));
  check("Altbestand: unbekannt (Demo) ist kein Altbestand", !esutdAltbestand({ status: "erfasst", hatVertrag: undefined, vertraegeSichtbar: true }));
  const sprachen = ["de", "en", "kk", "ru"].map((l) => JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")) as { personalAnsicht?: { esutdAltbestand?: string } });
  check("Altbestand: der Hinweis steht in allen vier Sprachen", sprachen.every((m) => typeof m.personalAnsicht?.esutdAltbestand === "string" && m.personalAnsicht.esutdAltbestand.length > 20));
}

if (fehler > 0) {
  console.log(`\n${fehler} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("\nAlle ЕСУТД-Tests gruen.");
