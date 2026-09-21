// Tests fuer die deutsche Schreibweise (lib/text/umlaute.ts): die Ersatzschreibung wird zu Umlauten, korrektes Deutsch,
// fremde Sprachen und Kennungen bleiben unberuehrt. Am Ende zusaetzlich die Gegenrichtung: der deutsche Sprachkatalog
// darf selbst keine Ersatzschreibung mehr enthalten. Kein Netzwerk. Aufruf: npm run test:umlaute

import { readFileSync } from "node:fs";
import { fuerSprache, mitUmlauten } from "@/lib/text/umlaute";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}
const gleich = (name: string, eingabe: string, erwartet: string) => {
  const ist = mitUmlauten(eingabe);
  pruefe(name, ist === erwartet, ist === erwartet ? "" : `erwartet "${erwartet}", war "${ist}"`);
};

// ---- Was umgewandelt wird -----------------------------------------------------------------------------------
gleich("Pruefung, pruefen, Abschlusspruefung", "Die Pruefung muss die Abschlusspruefung pruefen.", "Die Prüfung muss die Abschlussprüfung prüfen.");
gleich("fuer, ueber, dafuer", "Das gilt fuer alle, ueber die wir sprechen, und dafuer auch.", "Das gilt für alle, über die wir sprechen, und dafür auch.");
gleich("Kuehlkette und Pflueckaufgabe", "Die Kuehlkette nach der Pflueckaufgabe.", "Die Kühlkette nach der Pflückaufgabe.");
gleich("Verstoesse, Luecken, Massnahmen", "Zwei Verstoesse, drei Luecken und alle Massnahmen.", "Zwei Verstöße, drei Lücken und alle Maßnahmen.");
gleich("Verstoss (Einzahl) und Ueberfaelligkeit", "Ein Verstoss: die Frist ist ueberfaellig.", "Ein Verstoß: die Frist ist überfällig.");
gleich("Faelligkeit und Fristen", "Die Faelligkeit der Fristen.", "Die Fälligkeit der Fristen.");
gleich("Qualitaet, Prioritaet, Kapazitaeten", "Qualitaet, Prioritaeten und Kapazitaeten.", "Qualität, Prioritäten und Kapazitäten.");
gleich("Qualitaetssortierung (Fall aus der Textpruefung)", "Qualitaetssortierung je Schale", "Qualitätssortierung je Schale");
gleich("koennen, muessen, moechten, duerfen", "Sie koennen, muessen und duerfen; wir moechten helfen.", "Sie können, müssen und dürfen; wir möchten helfen.");
gleich("Loehne, Gehaelter, Betraege", "Loehne, Gehaelter und Betraege.", "Löhne, Gehälter und Beträge.");
gleich("Aenderung, Ergaenzung, naechste", "Die Aenderung, die Ergaenzung und der naechste Schritt.", "Die Änderung, die Ergänzung und der nächste Schritt.");
gleich("Gross geschrieben am Wortanfang", "Grosse Betriebe, gross und Grosshandel.", "Große Betriebe, groß und Großhandel.");
gleich("Ueberpruefung mit Wortanfang und Stamm", "Ueberpruefung", "Überprüfung");
gleich("Buero, Gebaeude, Geraete", "Im Buero, im Gebaeude, mit Geraeten.", "Im Büro, im Gebäude, mit Geräten.");
gleich("gemaess und Bussgeld", "Gemaess Artikel 5 droht ein Bussgeld.", "Gemäß Artikel 5 droht ein Bußgeld.");
gleich("Loesung, loesen, aufloesen", "Die Loesung ist bekannt, wir loesen es und die Aufloesung folgt.", "Die Lösung ist bekannt, wir lösen es und die Auflösung folgt.");
gleich("loes nur vor bekannten Endungen", "Kloesse und Groesse", "Kloesse und Größe");
gleich("Grossbuchstaben-Wort", "PRUEFUNG UND MASSNAHMEN", "PRÜFUNG UND MASSNAHMEN");
gleich("Bindestrich-Zusammensetzung", "Pflueck- und Kuehlzeitpunkt", "Pflück- und Kühlzeitpunkt");

gleich("weitere Woerter aus den Prompts", "Ausserhalb: ausschliesslich Gespraech, Oberflaeche, Schaltflaechen, Auskuenfte, Primaerquelle, sinngemaess, unvollstaendig, enthaelt, Vorschlaege, Laender.", "Außerhalb: ausschließlich Gespräch, Oberfläche, Schaltflächen, Auskünfte, Primärquelle, sinngemäß, unvollständig, enthält, Vorschläge, Länder.");

// ---- Was NICHT angefasst wird -------------------------------------------------------------------------------
const unveraendert = [
  "Steuer, Steuerberater, Feuer, Feuerwehr, Abenteuer, teuer, neue, neuer, treue, Sauerstoff, Steuererklärung.",
  "Prüfung, für, über, Verstöße, Lücke, Maßnahme, fällig, Größe (schon richtig).",
  "Der Abschluss, das Ergebnis, dass, muss, Prozess, Adresse, Kasse, Klasse.",
  "The audit found two gaps; queue, value, issue, blue, true and dialogue stay as they are.",
  "Налоговая проверка и аудит. Тексерілетін файл.",
  "Quelle S12, Fundstelle НК РК ст. 101.",
];
for (const s of unveraendert) gleich(`unveraendert: ${s.slice(0, 44)}`, s, s);

// ---- Kennungen, Code und Adressen ---------------------------------------------------------------------------
gleich("Code-Abschnitt bleibt", "Nutze `pruefungStarten` und `wissen.pruefung`.", "Nutze `pruefungStarten` und `wissen.pruefung`.");
gleich("Code-Block bleibt", "Vorher\n```\nconst pruefung = fuer(x);\n```\nNachher pruefen", "Vorher\n```\nconst pruefung = fuer(x);\n```\nNachher prüfen");
gleich("Adresse bleibt", "Siehe https://example.com/pruefung/fuer und danach pruefen.", "Siehe https://example.com/pruefung/fuer und danach prüfen.");
gleich("Pfad bleibt", "Route /de/dashboard/pruefung und die Pruefung.", "Route /de/dashboard/pruefung und die Prüfung.");
gleich("snake_case und camelCase bleiben", "ki_pruefung_lauf und pruefungStarten, aber die Pruefung.", "ki_pruefung_lauf und pruefungStarten, aber die Prüfung.");
gleich("Dateiname bleibt", "Datei pruefung.pdf und die Pruefung.", "Datei pruefung.pdf und die Prüfung.");

// ---- Eigenschaften ------------------------------------------------------------------------------------------
const probe = "Pruefung fuer Verstoesse, Luecken und Massnahmen (Kuehlkette, Loehne, Qualitaet, ueberfaellig).";
pruefe("idempotent: zweimal angewendet ist wie einmal", mitUmlauten(mitUmlauten(probe)) === mitUmlauten(probe));
pruefe("leerer Text und Text ohne Treffer bleiben gleich", mitUmlauten("") === "" && mitUmlauten("Hallo Welt") === "Hallo Welt");
pruefe("fuerSprache: nur bei Deutsch", fuerSprache("Pruefung", "de") === "Prüfung" && fuerSprache("Pruefung", "en") === "Pruefung" && fuerSprache("Pruefung", "ru") === "Pruefung");
const lang = "Die Pruefung der Massnahmen fuer den Betrieb. ".repeat(4000);
const t0 = Date.now();
mitUmlauten(lang);
pruefe("schnell genug fuer lange Antworten (180 KB unter 500 ms)", Date.now() - t0 < 500, `${Date.now() - t0} ms`);

// ---- Der deutsche Katalog selbst ----------------------------------------------------------------------------
// Der Fehler, der diese Pruefung veranlasst hat, lag nicht in der Funktion,
// sondern in einer Datei, die die Funktion nie gesehen hat: "Qualitaetssortierung
// je Schale" stand in src/messages/de.json. Der Fall oben (Zeile mit "Qualitaet")
// haette ihn nie gefunden - mitUmlauten kann ihn, sie wurde nur nicht gefragt.
//
// Also andersherum gepruefte Richtung: jeder deutsche Textbaustein muss bereits
// so dastehen, wie mitUmlauten ihn schreiben wuerde. Ist er es nicht, steckt
// Ersatzschreibung drin.
//
// Fehlalarme sind kaum zu erwarten: mitUmlauten laesst Code in Backticks,
// Adressen, Pfade, snake_case, camelCase und Dateinamen unberuehrt (siehe die
// Faelle weiter oben), und die Staemme kommen in den anderen drei Sprachen nicht
// vor. Taucht doch einer auf, gehoert er hierher - mit Begruendung - und nicht
// in eine Lockerung von lib/text/umlaute.ts.
const AUSNAHMEN = new Set<string>([]);

type Baum = { [k: string]: string | Baum };
const deutsch = JSON.parse(readFileSync("src/messages/de.json", "utf8")) as Baum;
const ersatzschreibung: string[] = [];
(function geh(knoten: Baum, pfad: string) {
  for (const [k, v] of Object.entries(knoten)) {
    const p = pfad ? `${pfad}.${k}` : k;
    if (typeof v === "string") {
      if (!AUSNAHMEN.has(p) && mitUmlauten(v) !== v) ersatzschreibung.push(p);
    } else {
      geh(v, p);
    }
  }
})(deutsch, "");
pruefe(
  "de.json: kein Textbaustein in Ersatzschreibung",
  ersatzschreibung.length === 0,
  ersatzschreibung.slice(0, 6).join(", ") || `${anzahlBausteine(deutsch)} Bausteine`,
);

function anzahlBausteine(knoten: Baum): number {
  return Object.values(knoten).reduce<number>((n, v) => n + (typeof v === "string" ? 1 : anzahlBausteine(v)), 0);
}

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
if (fehler > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
