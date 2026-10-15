// Das Produkthandbuch (scripts/handbuch/): die Ergänzungen der Anleitungen (ergaenzungen.ts) und die erzeugten Dateien unter docs/manual/.
//   * Alle vier Sprachen haben nach den Ergänzungen dieselben Anleitungen in derselben Reihenfolge, jede mit mindestens zwei Schritten.
//   * Neue Texte enthalten keinen Gedankenstrich und keine Ersatzschreibung der Umlaute (deutsche Fassung).
//   * Die Pfade zu den Modulen stimmen mit den Sprachkatalogen überein, eine Ergänzung zu einer unbekannten Kennung bricht ab.
//   * Die erzeugten Dateien sind aktuell: Sie enthalten jede Anleitung mit ihrem Titel (ein Lauf von npm run handbuch nach jeder Änderung).
//
// Aufruf: npm run test:handbuch

import { readFileSync } from "node:fs";
import { einleitungen, ergaenzungen, wendeErgaenzungenAn } from "../../scripts/handbuch/ergaenzungen";
import { de as textDe } from "../../scripts/handbuch/texte-de";
import { en as textEn } from "../../scripts/handbuch/texte-en";
import { kk as textKk } from "../../scripts/handbuch/texte-kk";
import { ru as textRu } from "../../scripts/handbuch/texte-ru";
import { sprachen, type Anleitung, type Sprache } from "../../scripts/handbuch/typen";

let fehler = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const texte = { de: textDe, en: textEn, kk: textKk, ru: textRu };
const fertig = Object.fromEntries(sprachen.map((s) => [s, wendeErgaenzungenAn(texte[s].anleitungen.liste, ergaenzungen[s])])) as Record<Sprache, Anleitung[]>;

const ids = (s: Sprache) => fertig[s].map((a) => a.id).join(",");
check("Anleitungen: alle vier Sprachen haben dieselben Kennungen in derselben Reihenfolge", sprachen.every((s) => ids(s) === ids("de")), sprachen.map((s) => `${s}:${fertig[s].length}`).join(" "));
check("Anleitungen: keine Kennung doppelt", sprachen.every((s) => new Set(fertig[s].map((a) => a.id)).size === fertig[s].length));
check("Anleitungen: jede hat Titel und mindestens zwei Schritte, kein Schritt ist leer", sprachen.every((s) => fertig[s].every((a) => a.titel.trim() !== "" && a.schritte.length >= 2 && a.schritte.every((x) => x.trim().length > 20))));
for (const neu of ["blockrisiko", "datensuche", "foerdercheckliste", "konten", "einstellungen", "schulungsvideos", "benachrichtigungen"]) {
  check(`Neu: ${neu} steht in allen vier Sprachen`, sprachen.every((s) => fertig[s].some((a) => a.id === neu)));
}

// Gedankenstriche und Umlaut-Ersatz in den Ergänzungen
{
  const texteDerErgaenzungen = sprachen.flatMap((s) => ergaenzungen[s].flatMap((e) => [e.neu?.titel, e.neu?.einleitung, ...(e.neu?.schritte ?? []), ...(e.zusatzSchritte ?? [])]).filter((x): x is string => typeof x === "string"));
  const mitStrich = texteDerErgaenzungen.filter((x) => /[—–]/.test(x));
  check("Ergänzungen: kein Gedankenstrich im Fließtext", mitStrich.length === 0, mitStrich[0]?.slice(0, 80) ?? "");
  const deutsch = ergaenzungen.de.flatMap((e) => [e.neu?.titel, e.neu?.einleitung, ...(e.neu?.schritte ?? []), ...(e.zusatzSchritte ?? [])]).filter((x): x is string => typeof x === "string");
  const ersatz = deutsch.filter((x) => /\b\w*(ae|oe|ue)\w*\b/i.test(x) && /\b(Aenderung|Pruefung|Gueltig|Fuer|ueber|waehlen|oeffnen|Loeschen|koennen|muessen)\b/i.test(x));
  check("Ergänzungen: die deutschen Texte nutzen echte Umlaute", ersatz.length === 0, ersatz[0]?.slice(0, 80) ?? "");
  check("Ergänzungen: keine Ersatzschreibung ß als ss in häufigen Wörtern", !deutsch.some((x) => /\b(Strasse|gross|Grösse|heisst|schliessen)\b/.test(x)));
}

// Pfade und Platzhalter
{
  const pfade = sprachen.map((s) => ergaenzungen[s].flatMap((e) => (e.neu?.schritte ?? []).concat(e.zusatzSchritte ?? [])).filter((x) => x.includes("→")));
  check("Pfade: jede Sprache nennt Pfade aus Zone und Modul", pfade.every((p) => p.length >= 5), pfade.map((p) => p.length).join(","));
  check("Pfade: deutsch Büro → Einstellungen, englisch Office → Settings, russisch Офис → Настройки, kasachisch Кеңсе → Баптаулар", ergaenzungen.de.some((e) => e.neu?.schritte.some((x) => x.includes("Büro → Einstellungen"))) && ergaenzungen.en.some((e) => e.neu?.schritte.some((x) => x.includes("Office → Settings"))) && ergaenzungen.ru.some((e) => e.neu?.schritte.some((x) => x.includes("Офис → Настройки"))) && ergaenzungen.kk.some((e) => e.neu?.schritte.some((x) => x.includes("Кеңсе → Баптаулар"))));
  check("Einleitungen: in allen Sprachen vorhanden und ohne Zahlwort", sprachen.every((s) => einleitungen[s].length > 30 && !/Zwölf|Twelve/i.test(einleitungen[s])));
}

// Fehlerfälle
{
  let geworfen = "";
  try {
    wendeErgaenzungenAn(fertig.de, [{ id: "gibt-es-nicht", zusatzSchritte: ["x"] }]);
  } catch (e) {
    geworfen = String((e as Error).message);
  }
  check("Ergänzung zu einer unbekannten Kennung bricht ab", geworfen.includes("gibt es nicht"), geworfen);
  geworfen = "";
  try {
    wendeErgaenzungenAn(fertig.de, [{ id: "x", nach: "unbekannt", neu: { id: "x", titel: "T", schritte: ["a", "b"] } }]);
  } catch (e) {
    geworfen = String((e as Error).message);
  }
  check("Neue Anleitung nach einer unbekannten Kennung bricht ab", geworfen.includes("nach"), geworfen);
  geworfen = "";
  try {
    wendeErgaenzungenAn(fertig.de, [{ id: "wartezeit", neu: { id: "wartezeit", titel: "T", schritte: ["a", "b"] } }]);
  } catch (e) {
    geworfen = String((e as Error).message);
  }
  check("Eine schon vorhandene Kennung wird nicht doppelt angelegt", geworfen.includes("gibt es schon"), geworfen);
  const vorher = texte.de.anleitungen.liste.length;
  wendeErgaenzungenAn(texte.de.anleitungen.liste, ergaenzungen.de);
  check("Die Liste aus den Texten bleibt unverändert (Kopie)", texte.de.anleitungen.liste.length === vorher);
}

// Erzeugte Dateien
{
  const dateien: Record<Sprache, string> = { de: "docs/manual/index.html", en: "docs/manual/index-en.html", ru: "docs/manual/index-ru.html", kk: "docs/manual/index-kk.html" };
  for (const s of sprachen) {
    const html = readFileSync(dateien[s], "utf8");
    const fehlen = fertig[s].filter((a) => !html.includes(`id="anleitung-${a.id}"`) || !html.includes(a.titel.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")));
    check(`Erzeugt (${s}): jede Anleitung steht in ${dateien[s]}, bitte npm run handbuch ausführen, wenn nicht`, fehlen.length === 0, fehlen.map((a) => a.id).join(","));
  }
}

console.log("");
if (fehler > 0) {
  console.error(`${fehler} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle Handbuch-Pruefungen bestanden.");
