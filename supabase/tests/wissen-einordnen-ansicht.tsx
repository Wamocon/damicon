import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { WissenBestandEinordnen } from "../../src/components/db/wissen-einordnen";
import { gruppiereWissenDokumente, type WissenListeZeile } from "../../src/lib/wissen/dokumente-liste";

// Render-Probe der Oberflaeche "Bestand einordnen" in allen vier Sprachen. Sie faengt, was ein Typpruefer nicht sieht: einen
// Uebersetzungsschluessel, den es in einer Sprache nicht gibt (next-intl meldet das ueber onError), und einen Platzhalter, der
// beim Einsetzen scheitert. Ohne Browser und ohne Datenbank: nur der erste Aufbau (renderToStaticMarkup), also die Liste, die
// Vorschlaege, die Schaltflaechen und das Bestaetigungsfenster mit der Wirkung (das Fenster steht geschlossen im Markup).

let bestanden = 0;
let fehlgeschlagen = 0;
function pruefe(name: string, bedingung: boolean, zusatz = "") {
  if (bedingung) {
    bestanden++;
    console.log(`PASS  ${name}${zusatz ? "  - " + zusatz : ""}`);
  } else {
    fehlgeschlagen++;
    console.log(`FAIL  ${name}${zusatz ? "  - " + zusatz : ""}`);
  }
}

const zeile = (id: string, titel: string, bereich: string, stufe: number | null, url: string | null, extra: Partial<WissenListeZeile> = {}): WissenListeZeile => ({
  id, quelle_id: `q-${id}`, pfad: `p/${id}.md`, titel, bereich, rollen: ["admin"], eingelesen_am: "2026-01-01", upload_quelle: null, hochgeladen_von: null,
  autoritaetsstufe: stufe, quellenart: null, cluster: null, pruefstatus: "freigegeben", pruefen_bis: null, url, rechtsstelle: null, ...extra,
});
const dokumente = gruppiereWissenDokumente([
  zeile("a", "AIFC: Steuerregime (offizielle Darstellung)", "amtlich", 3, "https://www.aifc.kz/steuerregime"),
  zeile("b", "Blogbeitrag zur Umsatzsteuer", "fachquellen", 5, "https://medium.com/x"),
  zeile("c", "Ohne Link", "kernwissen", 4, null),
  zeile("d", "Schon eingeordnet", "legal", 4, "https://x.example/a", { quellenart: "fachliteratur", cluster: "buecher" }),
]);

for (const loc of ["de", "en", "ru", "kk"]) {
  const messages = JSON.parse(readFileSync(`src/messages/${loc}.json`, "utf8"));
  const fehler: string[] = [];
  let html = "";
  try {
    html = renderToStaticMarkup(
      <NextIntlClientProvider locale={loc} messages={messages} onError={(e) => { if (e.code !== "ENVIRONMENT_FALLBACK") fehler.push(e.message); }} getMessageFallback={({ key }) => `!!${key}!!`}>
        <WissenBestandEinordnen dokumente={dokumente} beiFertig={() => {}} />
      </NextIntlClientProvider>,
    );
  } catch (e) {
    fehler.push(`Render: ${(e as Error).message}`);
  }
  pruefe(`Ansicht ${loc}: baut ohne fehlenden Schluessel oder Fehler auf`, fehler.length === 0 && html.length > 0 && !html.includes("!!"), fehler.slice(0, 3).join(" | "));
  pruefe(`Ansicht ${loc}: nennt drei offene von vier Dokumenten (das eingeordnete fehlt in der Liste)`, html.includes("AIFC: Steuerregime") && html.includes("Blogbeitrag zur Umsatzsteuer") && html.includes("Ohne Link") && !html.includes("Schon eingeordnet"));
  pruefe(`Ansicht ${loc}: Vorschlaege vorbelegt (AIFC als Behoerdeninformation, Cluster Internet), nichts ist ausgewaehlt`, html.includes('value="behoerdeninfo" selected') && html.includes('value="internet" selected') && !/checked=""/.test(html));
  pruefe(`Ansicht ${loc}: das Dokument ohne Link hat keinen Cluster-Vorschlag (die Administration waehlt), und sein Haekchen ist gesperrt`, /aria-label="[^"]*Ohne Link"[^>]*disabled=""/.test(html) && !/aria-label="[^"]*Blogbeitrag[^"]*"[^>]*disabled=""/.test(html));
  pruefe(`Ansicht ${loc}: das Bestaetigungsfenster steht im Markup (geschlossen) mit Speichern und Abbrechen`, html.includes("<dialog") && (html.match(/<button[^>]*type="submit"/g) ?? []).length >= 1);
}

console.log(`\nPruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
