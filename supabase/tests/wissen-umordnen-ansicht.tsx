import { WissenUmordnenKnopf } from "../../src/components/db/wissen-umordnen";
import type { WissenDokumentZeile } from "../../src/lib/wissen/dokumente-liste";
import { imMarkup, pruefer, rendere, SPRACHEN, texteVon } from "./hilfen/ansicht-probe";

// Charakterisierung des Fensters "Einordnung ändern" (WissenUmordnenKnopf in wissen-umordnen.tsx), ohne Browser und ohne Datenbank.
// Der erste Aufbau übernimmt die Angaben des Dokuments; geprüft wird, was daraus folgt: Vorbelegung der Felder, eigener Bereich des
// Bestands, gesperrte Quellenarten, Wirkung (Stufe und Nutzung), fehlender Pflicht-Link und ob Speichern frei ist. Was erst nach einer
// Änderung im Fenster entsteht (Vier-Augen-Sperre, Wiedervorlage), prüft ab dem Zerlegen die reine Bewertung selbst.
// Aufruf: npm run test:wissen-umordnen-ansicht

const { pruefe, ende } = pruefer();

const de = texteVon("de") as { kiAssistentAnsicht: { wissensVerwaltung: Record<string, Record<string, string>> } };
const u = de.kiAssistentAnsicht.wissensVerwaltung.umordnen;
const formular = de.kiAssistentAnsicht.wissensVerwaltung.formular;

const basis: WissenDokumentZeile = {
  schluessel: "upload:feed01",
  schluesselSpalte: "quelle_id",
  titel: "Kommentar zum Zivilgesetzbuch",
  bereich: "legal",
  rollen: ["admin"],
  datum: "2026-09-01",
  hochgeladenVon: "Anna Admin",
  hochgeladenVonId: "u-anna",
  chunks: 12,
  herkunft: "upload",
  loeschbar: true,
  quellenart: "fachliteratur",
  cluster: "buecher",
  textgrundlage: "amtlich_uebersetzt",
  stufe: 4,
  rechtsstelle: null,
  nutzung: "ja",
  pruefstatus: "freigegeben",
  pruefenBis: null,
  paketeGesamt: 2,
  paketeDa: 2,
  unvollstaendig: false,
  guete: "gut",
  gueteHinweise: [],
  gueteProzent: 90,
  originalGroesse: null,
  seitenFehlend: 0,
  seitenStellen: null,
  seitenVermerk: null,
  seitenBestaetigt: null,
  seitenVermerkt: false,
  seitenNachgeladen: null,
  seitenOffen: 0,
  seitenOffenStellen: null,
  abgelaufen: false,
  url: null,
};

const fenster = (d: WissenDokumentZeile, ichId: string | null = "u-anna", loc = "de") => rendere(<WissenUmordnenKnopf dokument={d} ichId={ichId} beiErgebnis={() => {}} />, loc);
/** Der Inhalt eines Auswahlfelds (zwischen <select name="..."> und </select>). */
const auswahl = (html: string, name: string) => html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)</select>`))?.[1] ?? "";
const gewaehlt = (html: string, name: string) => auswahl(html, name).match(/<option value="([^"]*)" selected="">/)?.[1] ?? null;
const gesperrteArten = (html: string) => [...auswahl(html, "quellenart").matchAll(/<option value="([^"]+)" disabled="">/g)].map((m) => m[1]).join(",");
const speichern = (html: string) => html.match(/<button type="submit"[^>]*>/)?.[0] ?? "";
const wirkung = (html: string) => html.match(/<p class="text-\[11px\] ([^"]*)">Die Stufe folgt der Quellenart: Stufe (\d+)\.([^<]*)<\/p>/);

// ---- 1. Freigegebener Upload der eigenen Person, unverändert ------------------------------------------------------------------------
{
  const { html, fehler } = fenster(basis);
  pruefe("Upload: baut ohne Fehler und ohne fehlenden Schlüssel auf", fehler.length === 0 && html.length > 0, fehler.slice(0, 3).join(" | "));
  pruefe("Upload: Knopf öffnet das Fenster mit Titel", html.startsWith(`<button type="button" class="inline-flex h-7 items-center rounded-lg border border-border px-2.5`) && html.includes(`>${imMarkup(u.knopf)}</button>`) && html.includes(`<dialog aria-labelledby="umordnen-titel-upload:feed01"`) && html.includes(`<h3 id="umordnen-titel-upload:feed01" class="text-sm font-black">${imMarkup(u.titel)}</h3>`));
  pruefe("Upload: Schlüssel und Schlüsselspalte gehen verdeckt mit", html.includes(`<input type="hidden" name="schluessel" value="upload:feed01"/>`) && html.includes(`<input type="hidden" name="spalte" value="quelle_id"/>`));
  pruefe("Upload: Titel des Dokuments steht im Fenster", html.includes(`<span class="font-semibold">Dokument: </span>Kommentar zum Zivilgesetzbuch</p>`));
  pruefe("Upload: Felder mit den Angaben des Dokuments vorbelegt (legal als recht)", gewaehlt(html, "cluster") === "buecher" && gewaehlt(html, "bereich") === "recht" && gewaehlt(html, "quellenart") === "fachliteratur" && gewaehlt(html, "textgrundlage") === "amtlich_uebersetzt");
  pruefe("Upload: Bereich zeigt die fünf Bereiche, keinen zusätzlichen", (auswahl(html, "bereich").match(/<option /g) ?? []).length === 5);
  pruefe("Upload: im Cluster Bücher sind die Arten aus dem Netz gesperrt", gesperrteArten(html) === "internetquelle,forum,internetrecherche", gesperrteArten(html));
  const wi = wirkung(html);
  pruefe("Upload: Wirkung Stufe 4, normale Nutzung, keine Wiedervorlage", !!wi && wi[1] === "text-muted-foreground" && wi[2] === "4" && wi[3] === " ", wi?.[0] ?? "keine Wirkung");
  pruefe("Upload: kein fehlender Link, keine Vier-Augen-Sperre", !html.includes(imMarkup(u.urlFehlt)) && !html.includes(imMarkup(u.vierAugen)));
  pruefe("Upload: Speichern ist frei, Abbrechen davor", speichern(html) !== "" && !speichern(html).includes('disabled=""') && html.indexOf(`>${imMarkup(u.abbrechen)}</button>`) < html.indexOf(`>${imMarkup(u.speichern)}</button>`));
}

// ---- 2. Bestand mit Korpusbereich, ohne Einordnung ---------------------------------------------------------------------------------
{
  const d: WissenDokumentZeile = { ...basis, schluessel: "amtlich/merkblatt-mwst.md", schluesselSpalte: "pfad", herkunft: "skript", bereich: "amtlich", quellenart: null, cluster: null, textgrundlage: null, stufe: 3, pruefstatus: "freigegeben", hochgeladenVonId: null };
  const { html, fehler } = fenster(d);
  pruefe("Bestand: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
  pruefe("Bestand: Schlüsselspalte pfad geht mit", html.includes(`<input type="hidden" name="spalte" value="pfad"/>`));
  pruefe("Bestand: ohne Cluster und ohne Quellenart steht Bitte wählen", gewaehlt(html, "cluster") === "" && gewaehlt(html, "quellenart") === "" && auswahl(html, "cluster").includes(`<option value="" selected="">${imMarkup(formular.bitteWaehlen)}</option>`));
  pruefe("Bestand: der eigene Korpusbereich bleibt wählbar und ist gewählt", auswahl(html, "bereich").includes(`<option value="amtlich" selected="">amtlich</option>`) && (auswahl(html, "bereich").match(/<option /g) ?? []).length === 6);
  pruefe("Bestand: ohne Textgrundlage gilt Originaltext", gewaehlt(html, "textgrundlage") === "original");
  pruefe("Bestand: ohne Cluster ist keine Art gesperrt", gesperrteArten(html) === "");
  pruefe("Bestand: ohne Quellenart keine Wirkung, Speichern gesperrt", !wirkung(html) && speichern(html).includes('disabled=""'));
}

// ---- 3. Internetquelle ohne Link ---------------------------------------------------------------------------------------------------
{
  const d: WissenDokumentZeile = { ...basis, bereich: "steuer", quellenart: "internetquelle", cluster: "internet", url: null };
  const { html, fehler } = fenster(d);
  const wi = wirkung(html);
  pruefe("Ohne Link: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
  pruefe("Ohne Link: Wirkung Stufe 5 als Notbehelf hervorgehoben", !!wi && wi[1] === "font-semibold text-warning" && wi[2] === "5" && wi[3] === ` ${formular.nutzungNotfalls}`, wi?.[0] ?? "keine Wirkung");
  pruefe("Ohne Link: Hinweis auf den fehlenden Pflicht-Link, Speichern gesperrt", html.includes(`<p role="alert" class="text-[11px] font-semibold text-destructive">${imMarkup(u.urlFehlt)}</p>`) && speichern(html).includes('disabled=""'));
  pruefe("Ohne Link: im Cluster Internet ist keine Art gesperrt", gesperrteArten(html) === "");
}

// ---- 4. Internetquelle mit Link, ein Freitext zählt nicht als Link ----------------------------------------------------------------
{
  const mitLink = fenster({ ...basis, bereich: "risiko", quellenart: "internetquelle", cluster: "internet", url: "https://example.org/a" });
  pruefe("Mit Link: kein Hinweis, Speichern frei", !mitLink.html.includes(imMarkup(u.urlFehlt)) && !speichern(mitLink.html).includes('disabled=""'));
  const freitext = fenster({ ...basis, bereich: "risiko", quellenart: "forum", cluster: "internet", url: "forum.example.org" });
  pruefe("Freitext statt Link: Hinweis und Speichern gesperrt", freitext.html.includes(imMarkup(u.urlFehlt)) && speichern(freitext.html).includes('disabled=""'));
}

// ---- 5. Nutzung als Hinweis, Bestand mit Korpusbereich und Art --------------------------------------------------------------------
{
  const { html } = fenster({ ...basis, quellenart: "standard", cluster: "publikationen" });
  const wi = wirkung(html);
  pruefe("Norm im Recht: Stufe 3, nur als Hinweis hervorgehoben", !!wi && wi[1] === "font-semibold text-warning" && wi[2] === "3" && wi[3] === ` ${formular.nutzungHinweis}`, wi?.[0] ?? "keine Wirkung");
  const korpus = fenster({ ...basis, herkunft: "skript", bereich: "fachquellen", quellenart: "internetquelle", cluster: "internet", url: "https://example.org/b", pruefstatus: "freigegeben" });
  const wk = wirkung(korpus.html);
  pruefe("Korpusbereich mit Internetquelle: strengste Regel (Notbehelf), Speichern frei", !!wk && wk[3] === ` ${formular.nutzungNotfalls}` && !speichern(korpus.html).includes('disabled=""'), wk?.[0] ?? "keine Wirkung");
  const ohneCluster = fenster({ ...basis, cluster: null });
  pruefe("Ohne Cluster: Speichern gesperrt, auch mit Quellenart", speichern(ohneCluster.html).includes('disabled=""') && gewaehlt(ohneCluster.html, "cluster") === "");
  const fremd = fenster(basis, "u-bert");
  pruefe("Andere Person: dasselbe Fenster, Speichern frei", fremd.html === fenster(basis, null).html && !speichern(fremd.html).includes('disabled=""'));
}

// ---- 6. Alle Sprachen --------------------------------------------------------------------------------------------------------------
for (const loc of SPRACHEN) {
  const zustaende: [string, WissenDokumentZeile][] = [
    ["Upload", basis],
    ["Bestand", { ...basis, herkunft: "skript", bereich: "amtlich", quellenart: null, cluster: null, textgrundlage: null }],
    ["Ohne Link", { ...basis, quellenart: "internetquelle", cluster: "internet" }],
    ["Hinweis", { ...basis, quellenart: "standard", cluster: "publikationen" }],
  ];
  for (const [name, d] of zustaende) {
    const { fehler } = fenster(d, "u-anna", loc);
    pruefe(`Sprache ${loc}, ${name}: kein fehlender Schlüssel, kein Fehler`, fehler.length === 0, fehler.slice(0, 3).join(" | "));
  }
}

ende();
