// Tests fuer die Bausteine der Wissenssuche (src/lib/wissen). Kein Netz, keine
// Datenbank: Frontmatter, Chunking, stabile IDs, sparse Vektoren. Die Suche
// gegen Qdrant selbst prueft scripts/wissen-eval.ts.
// Aufruf: npm run test:wissen (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import { chunkiere, einbettungsText, erkenneSprache, MAX_ZEICHEN, parseDokument, sprachcode, stabileId, stufeAusQuellenart, trenneFrontmatter } from "@/lib/wissen/chunker";
import { belegeAusErgebnis, naechsteBelegNummer, stufeSchluessel, verlinkeZitate, zitierteKennungen } from "@/lib/wissen/belege";
import { sparseDokument, sparseFrage, tokens } from "@/lib/wissen/sparse";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt += 1;
  if (!ok) fehler += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

// --- 1. Frontmatter ---------------------------------------------------------
const artikel = `---
chunk_id: "nk-214-viii-ru#art-3"
quelle_id: "adilet-nk-214-viii-ru"
sprache: "ru"
autoritaetsstufe: 1
rechtsstelle: "НК РК ст. 3"
titel: "Понятия, связанные с субъектами"
gueltig_ab: "2026-01-01"
gueltig_bis: null
ist_ueberholt: false
perspektiven: [P2, P3]
url: "https://old.adilet.zan.kz/rus/docs/K2500000214#z19"
---
# Статья 3. Понятия

Первый абзац.

Второй абзац.
`;
const f = trenneFrontmatter(artikel.replace(/\n/g, "\r\n"));
pruefe("Frontmatter: Text, Zahl, null, Wahrheitswert, Liste (auch mit CRLF)", f.felder.autoritaetsstufe === 1 && f.felder.gueltig_bis === null && f.felder.ist_ueberholt === false && Array.isArray(f.felder.perspektiven) && f.felder.rechtsstelle === "НК РК ст. 3");
pruefe("Frontmatter: Datei ohne Block bleibt unveraendert", trenneFrontmatter("nur Text").text === "nur Text");

const dok = parseDokument("nk-214-viii/ru/art-0003.md", artikel);
pruefe("Dokument: Bereich aus dem obersten Ordner", dok.bereich === "nk-214-viii");
pruefe("Dokument: Beleg-Metadaten uebernommen (Stelle, Stufe, Link, Stand)", dok.meta.rechtsstelle === "НК РК ст. 3" && dok.meta.autoritaetsstufe === 1 && dok.meta.url?.includes("adilet") === true && dok.meta.gueltig_ab === "2026-01-01");

// --- 2. Chunking ------------------------------------------------------------
const kurz = chunkiere(dok);
pruefe("Ein kurzer Artikel ergibt genau einen Chunk mit Fundstelle als Kontext", kurz.length === 1 && kurz[0]!.kontext === "НК РК ст. 3: Понятия, связанные с субъектами");
pruefe("Einbettungstext beginnt mit der Fundstelle", einbettungsText(kurz[0]!).startsWith("НК РК ст. 3:"));

const absatz = (n: number) => `${n}) ${"Слово ".repeat(35)}конец пункта ${n}.`;
const lang = parseDokument("recht/x.md", `---\nchunk_id: "lang#1"\n---\n${Array.from({ length: 30 }, (_, i) => absatz(i + 1)).join("\n\n")}`);
const chunks = chunkiere(lang);
pruefe("Langer Text wird in mehrere Chunks geteilt", chunks.length > 5, `${chunks.length} Chunks`);
pruefe("Kein Chunk ist laenger als das Maximum (mit Ueberlapp-Spielraum)", chunks.every((c) => c.text.length <= MAX_ZEICHEN + 400), `laengster ${Math.max(...chunks.map((c) => c.text.length))}`);
pruefe("Kein Absatz geht verloren", Array.from({ length: 30 }, (_, i) => `конец пункта ${i + 1}.`).every((s) => chunks.some((c) => c.text.includes(s))));
pruefe("Kein winziger Endchunk nur aus dem Ueberlapp", chunks.every((c) => c.text.length > 100));
pruefe("Teilnummern lueckenlos, Gesamtzahl stimmt", chunks.every((c, i) => c.teil === i && c.teile === chunks.length));
const uebergang = chunks.slice(1).every((c, i) => c.text.startsWith(chunks[i]!.text.split("\n\n").at(-1)!.slice(0, 40)));
pruefe("Ueberlapp: ein Chunk beginnt mit dem Ende des vorigen", uebergang);

const riesig = chunkiere(parseDokument("recht/y.md", `---\nchunk_id: "y#1"\n---\n${"Ein Satz ohne Ende. ".repeat(400)}`));
pruefe("Ein einzelner riesiger Absatz wird an Satzenden geschnitten", riesig.length > 1 && riesig.every((c) => c.text.length <= MAX_ZEICHEN + 400));
pruefe("Leeres Dokument ergibt keine Chunks", chunkiere(parseDokument("a/b.md", "---\nchunk_id: \"z\"\n---\n\n\n")).length === 0);

// --- 3. Stabile IDs ---------------------------------------------------------
const id1 = stabileId("nk-214-viii-ru#art-3#0");
pruefe("ID ist eine UUID und stabil", /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/.test(id1) && id1 === stabileId("nk-214-viii-ru#art-3#0"));
pruefe("Andere Teilnummer = andere ID", id1 !== stabileId("nk-214-viii-ru#art-3#1"));
pruefe("Wiederholtes Chunking liefert dieselben IDs (erneutes Einlesen ueberschreibt)", JSON.stringify(chunkiere(lang).map((c) => c.id)) === JSON.stringify(chunks.map((c) => c.id)));

// --- 3b. Spracherkennung ------------------------------------------------------
pruefe("Sprache: russischer Text", erkenneSprache("Постановка на регистрационный учет по НДС обязательна при превышении порога оборота за двенадцать месяцев.") === "ru");
pruefe("Sprache: kasachischer Text (Sonderbuchstaben)", erkenneSprache("ҚҚС бойынша тіркеуге тұру үшін он екі айдағы айналым шегі асқан жағдайда міндетті болып табылады және ұйымдар үшін қажет.") === "kk");
pruefe("Sprache: deutscher Text", erkenneSprache("Die Umsatzsteuer ist für jeden Betrieb mit einem Jahresumsatz über der Schwelle verpflichtend und muss gemeldet werden.") === "de");
pruefe("Sprache: englischer Text", erkenneSprache("Value added tax registration is mandatory once the annual turnover exceeds the statutory threshold set by the code.") === "en");
pruefe("Sprache: zu kurzer Text bleibt unbestimmt", erkenneSprache("Kurz") === null);

// --- 3c. Unterschiedliche Kopfzeilen (Steuerkorpus, Legal-KB, Audit-KB) ---------
const legalKb = parseDokument(
  "Legal/x/agrarrecht.md",
  `---\ntitle: "Agribusiness-Foerderung in Kasachstan"\nthema: "agrarrecht-allgemein"\nquelltyp: gesetzestext\nquelle_url: "https://invest.gov.kz/x"\nsprache_original: ru\nabgerufen_am: "2026-09-18"\nvertrauenswuerdigkeit: bestaetigt\n---\n# Titel\n\nText des Gesetzes.`,
);
pruefe(
  "Legal-KB: title, quelle_url, sprache_original, vertrauenswuerdigkeit werden uebernommen",
  legalKb.meta.titel === "Agribusiness-Foerderung in Kasachstan" && legalKb.meta.url === "https://invest.gov.kz/x" && legalKb.meta.sprache === "ru" && legalKb.meta.konfidenz === "bestaetigt" && legalKb.meta.abgerufen_am === "2026-09-18",
);
pruefe("Legal-KB: quelltyp gesetzestext = Stufe 1", legalKb.meta.autoritaetsstufe === 1);

const auditKb = parseDokument(
  "Audit/x/quelle.md",
  `---\ntitle: "IFS Food Standard Version 8"\nsource_type: "Primaerquelle (Standardsetzer)"\nsource_url: "https://www.ifs-certification.com"\noriginal_language: "Englisch"\nretrieval_date: "2026-09-19"\ntrustworthiness: "hoch"\n---\nText.`,
);
pruefe(
  "Audit-KB: title, source_url, original_language, retrieval_date werden uebernommen",
  auditKb.meta.titel === "IFS Food Standard Version 8" && auditKb.meta.url === "https://www.ifs-certification.com" && auditKb.meta.sprache === "en" && auditKb.meta.abgerufen_am === "2026-09-19" && auditKb.meta.konfidenz === "hoch",
);
pruefe("Audit-KB: Standardsetzer ist Fachquelle (4), nicht Recht", auditKb.meta.autoritaetsstufe === 4);

pruefe(
  "Stufe aus der Quellenart: Gesetzestext 1, Sekundaerquelle 4, Forum 5, Fachpresse bleibt 4",
  stufeAusQuellenart("Primaerquelle (Gesetzestext ueber Spiegelportal)") === 1 &&
    stufeAusQuellenart("Sekundaerquelle (Fachpublikation)") === 4 &&
    stufeAusQuellenart("forum") === 5 &&
    stufeAusQuellenart("Kasachische Fachpresse (Sekundaerquelle)") === 4 &&
    stufeAusQuellenart(undefined) === null,
);
pruefe(
  "Sprachcode: erste genannte Sprache gilt, auch bei Zusaetzen",
  sprachcode("Russisch") === "ru" &&
    sprachcode("ru") === "ru" &&
    sprachcode("ueberwiegend Russisch, teilweise Englisch") === "ru" &&
    sprachcode("Russisch (Drittanbieter, nicht kasachisch)") === "ru" &&
    sprachcode("Kasachisch") === "kk" &&
    sprachcode("Deutsch") === "de" &&
    sprachcode(undefined) === null,
);
const steuerKopf = parseDokument("amtlich/x.md", `---\nchunk_id: "a#1"\nsprache: "kk"\nautoritaetsstufe: 3\ntitel: "T"\nurl: "https://x.kz"\n---\nText`);
pruefe("Steuerkorpus-Kopf bleibt unveraendert (Stufe 3, Sprache kk)", steuerKopf.meta.autoritaetsstufe === 3 && steuerKopf.meta.sprache === "kk" && steuerKopf.meta.url === "https://x.kz");

// --- 4. Sparse Vektoren -----------------------------------------------------
pruefe("Tokenizer: Zahlen bleiben ganz, lange Woerter werden auf den Stamm gekuerzt", tokens("статья 358 налогообложения").join(",") === "статья,358,налого");
pruefe("Tokenizer: Endungen fuehren zum selben Stamm", tokens("налогообложение")[0] === tokens("налогообложения")[0]);
const d = sparseDokument("НДС НДС НДС ставка 16");
const q = sparseFrage("ставка НДС");
pruefe("Sparse: Frage und Dokument teilen Indizes", q.indices.filter((i) => d.indices.includes(i)).length === 2);
pruefe("Sparse: Wiederholung wirkt abgeschwaecht (1 + ln n), nicht linear", Math.max(...d.values) < 3 && Math.max(...d.values) > 1);
pruefe("Sparse: keine doppelten Indizes", new Set(d.indices).size === d.indices.length);

// --- 5. Belege im Chat (lib/wissen/belege.ts) ---------------------------------
const antwort = "Die Schwelle liegt bei 10 000 MRP [S1]. Frist fuenf Werktage [S2][S3], siehe auch [S1] und [S9].";
pruefe("Zitate: Kennungen in Reihenfolge, ohne Doppelte", JSON.stringify(zitierteKennungen(antwort)) === JSON.stringify(["S1", "S2", "S3", "S9"]));
pruefe("Zitate: [S1] wird zur Marke, ein normaler Link bleibt", verlinkeZitate("a [S1] b [Doku](https://x.de)") === "a [S1](quelle:S1) b [Doku](https://x.de)");
const roh = {
  belege: [
    { id: "S1", fundstelle: "НК РК ст. 82", stufe: 1, url: "https://old.adilet.zan.kz/x", text: "Текст", ueberholt: false },
    { id: "S2", fundstelle: "Boese", stufe: 4, url: "javascript:alert(1)", text: "x" },
    { id: "kaputt", fundstelle: "ohne gueltige Kennung" },
    null,
  ],
};
const gelesen = belegeAusErgebnis(roh);
pruefe("Belege: nur gueltige Kennungen werden uebernommen", gelesen.length === 2 && gelesen[0]!.id === "S1");
pruefe("Belege: nur http(s)-Links (kein javascript:)", gelesen[0]!.url === "https://old.adilet.zan.kz/x" && gelesen[1]!.url === null);
pruefe("Belege: Muell als Ausgabe ergibt eine leere Liste", belegeAusErgebnis("text").length === 0 && belegeAusErgebnis(null).length === 0 && belegeAusErgebnis({ belege: "x" }).length === 0);
pruefe("Stufen: 1 Recht ... 5 Presse, sonst unbekannt", stufeSchluessel(1) === "recht" && stufeSchluessel(5) === "presse" && stufeSchluessel(null) === "unbekannt");
const verlauf = [
  { role: "user", parts: [{ type: "text" }] },
  { role: "assistant", parts: [{ type: "tool-wissenSuchen", output: { belege: [{ id: "S1" }, { id: "S2" }, { id: "S3" }] } }] },
];
pruefe("Fortzaehlung: die naechste Anfrage der Antwort beginnt nach S3", naechsteBelegNummer(verlauf) === 4);
pruefe(
  "Fortzaehlung: eine neue Nutzerfrage beginnt wieder bei S1",
  naechsteBelegNummer([...verlauf, { role: "user", parts: [{ type: "text" }] }]) === 1,
);

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
if (fehler > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
