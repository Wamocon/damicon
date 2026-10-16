import { WissenUmordnenKnopf } from "../../src/components/db/wissen-umordnen";
import { bewerteUmordnung, weitereVon } from "../../src/lib/wissen/umordnen-bewertung";
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
  weitereBereiche: [],
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
/** Die Kontrollkästchen "Gilt auch in": Wert und ob angekreuzt. */
const weitereKaesten = (html: string) =>
  [...html.matchAll(/<input[^>]*name="weitereBereiche"[^>]*>/g)].map((m) => ({ wert: m[0].match(/value="([^"]+)"/)?.[1] ?? "", an: m[0].includes('checked=""') }));
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
  const kaesten = weitereKaesten(html);
  pruefe("Weitere Bereiche: die vier anderen Bereiche als Kontrollkästchen (nicht der Hauptbereich), keiner angekreuzt", kaesten.map((k) => k.wert).join(",") === "steuer,compliance,audit,risiko" && kaesten.every((k) => !k.an), JSON.stringify(kaesten));
  pruefe("Weitere Bereiche: die Marke geht verdeckt mit (ohne Haken heißt das: keine weiteren Bereiche)", html.includes(`<input type="hidden" name="weitereBereicheGesetzt" value="1"/>`));
  pruefe("Weitere Bereiche: Beschriftung und Hinweis stehen im Fenster", html.includes(imMarkup(formular.weitereBereiche!)) && html.includes(imMarkup(formular.weitereBereicheHinweis!)));
  pruefe("Upload: im Cluster Bücher sind die Arten aus dem Netz gesperrt", gesperrteArten(html) === "internetquelle,forum,internetrecherche", gesperrteArten(html));
  const wi = wirkung(html);
  pruefe("Upload: Wirkung Stufe 4, normale Nutzung, keine Wiedervorlage", !!wi && wi[1] === "text-muted-foreground" && wi[2] === "4" && wi[3] === " ", wi?.[0] ?? "keine Wirkung");
  pruefe("Upload: kein fehlender Link, keine Vier-Augen-Sperre", !html.includes(imMarkup(u.urlFehlt)) && !html.includes(imMarkup(u.vierAugen)));
  pruefe("Upload: Speichern ist frei, Abbrechen davor", speichern(html) !== "" && !speichern(html).includes('disabled=""') && html.indexOf(`>${imMarkup(u.abbrechen)}</button>`) < html.indexOf(`>${imMarkup(u.speichern)}</button>`));
}

// ---- 1b. Dokument, das auch im Bereich Risiko gilt --------------------------------------------------------------------------------
{
  const { html, fehler } = fenster({ ...basis, bereich: "audit", weitereBereiche: ["risiko", "legal"] });
  pruefe("Weitere Bereiche: vorangekreuzt, was gespeichert ist (legal heißt recht); der Hauptbereich steht nicht dabei", fehler.length === 0 && weitereKaesten(html).map((k) => `${k.wert}${k.an ? "+" : "-"}`).join(",") === "recht+,steuer-,compliance-,risiko+", JSON.stringify(weitereKaesten(html)));
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

// ---- 6. Die Bewertung der Wahl als reine Funktion (seit dem Zerlegen, 14.10.2026) ---------------------------------------------------
// Was erst nach einer Änderung im Fenster entsteht: Vier-Augen-Sperre, neue Wiedervorlage, fremder Bereich.
{
  type Wert = Parameters<typeof bewerteUmordnung>[1];
  const wie = (d: WissenDokumentZeile, teil: Partial<Wert> = {}): Wert => ({ cluster: d.cluster ?? "", bereich: d.bereich === "legal" ? "recht" : d.bereich, weitere: weitereVon(d), quellenart: d.quellenart ?? "", textgrundlage: d.textgrundlage ?? "original", ...teil });
  const b = (d: WissenDokumentZeile, teil: Partial<Wert> = {}, ichId: string | null = "u-anna") => bewerteUmordnung(d, wie(d, teil), ichId);

  const unveraendert = b(basis);
  pruefe("Bewertung: unverändert ist gültig, ohne Sperre, ohne neue Wiedervorlage", unveraendert.gueltig && !unveraendert.gesperrtDurchVierAugen && unveraendert.wiedervorlage === null && unveraendert.art === "fachliteratur" && unveraendert.stufe === 4 && unveraendert.nutzung === "ja" && unveraendert.bereichSteht && !unveraendert.urlFehlt);
  pruefe("Vier Augen: eigene Person ändert Bereich, Quellenart oder Textgrundlage eines freigegebenen Uploads", b(basis, { bereich: "steuer" }).gesperrtDurchVierAugen && b(basis, { quellenart: "praxisbeitrag" }).gesperrtDurchVierAugen && b(basis, { textgrundlage: "original" }).gesperrtDurchVierAugen);
  pruefe("Vier Augen: auch die weiteren Bereiche eines freigegebenen Uploads ändert die eigene Person nicht", b(basis, { weitere: ["risiko"] }).gesperrtDurchVierAugen && !b(basis, { weitere: ["risiko"] }, "u-bert").gesperrtDurchVierAugen);
  pruefe("Vier Augen: unveränderte weitere Bereiche (auch in anderer Reihenfolge, mit dem Hauptbereich darunter) sperren nicht",
    !b({ ...basis, bereich: "audit", weitereBereiche: ["legal", "risiko"] }, { weitere: ["risiko", "recht"] }).gesperrtDurchVierAugen && !b({ ...basis, bereich: "audit", weitereBereiche: ["risiko"] }, { weitere: ["risiko", "audit"] }).gesperrtDurchVierAugen);
  pruefe("Weitere Bereiche: Startwahl ohne Hauptbereich, mit Schlüsseln statt gespeicherter Werte", JSON.stringify(weitereVon({ bereich: "audit", weitereBereiche: ["legal", "risiko"] })) === JSON.stringify(["recht", "risiko"]) && weitereVon(basis).length === 0);
  pruefe("Vier Augen: der Cluster allein sperrt nicht", !b(basis, { cluster: "publikationen" }).gesperrtDurchVierAugen && b(basis, { cluster: "publikationen" }).gueltig);
  pruefe("Vier Augen: eine andere Person, ohne Anmeldung, ein ungeprüfter Upload oder Bestand sperren nicht", !b(basis, { bereich: "steuer" }, "u-bert").gesperrtDurchVierAugen && !b(basis, { bereich: "steuer" }, null).gesperrtDurchVierAugen && !b({ ...basis, pruefstatus: "ungeprueft" }, { bereich: "steuer" }).gesperrtDurchVierAugen && !b({ ...basis, herkunft: "skript" }, { bereich: "steuer" }).gesperrtDurchVierAugen);
  pruefe("Wiedervorlage: neue Art mit Frist bei einem freigegebenen Upload (Praxisbeitrag 24 Monate, Internetquelle 12)", b(basis, { quellenart: "praxisbeitrag", cluster: "publikationen" }).wiedervorlage === 24 && b(basis, { quellenart: "internetquelle", cluster: "internet" }).wiedervorlage === 12);
  pruefe("Wiedervorlage: keine bei Art ohne Frist, bei gleicher Art, bei ungeprüftem Upload oder ohne Art", b(basis, { quellenart: "rechtsnorm" }).wiedervorlage === null && b({ ...basis, quellenart: "praxisbeitrag" }).wiedervorlage === null && b({ ...basis, pruefstatus: "ungeprueft" }, { quellenart: "praxisbeitrag" }).wiedervorlage === null && b(basis, { quellenart: "" }).wiedervorlage === null);
  const fremderBereich = b(basis, { bereich: "amtlich" });
  pruefe("Bereich: ein fremder Korpusbereich steht nicht, Nutzung gilt dann als ja, nicht gültig", !fremderBereich.bereichSteht && fremderBereich.nutzung === "ja" && !fremderBereich.gueltig);
  const eigenerKorpus = b({ ...basis, herkunft: "skript", bereich: "fachquellen", quellenart: "internetquelle", cluster: "internet", url: "https://x.example" });
  pruefe("Bereich: der eigene Korpusbereich steht, mit der strengsten Nutzung der Art", eigenerKorpus.bereichSteht && eigenerKorpus.nutzung === "notfalls" && eigenerKorpus.gueltig);
  const ohneArt = b({ ...basis, stufe: 3 }, { quellenart: "" });
  pruefe("Ohne Art: Stufe des Dokuments, Nutzung ja, nicht gültig", ohneArt.art === null && ohneArt.stufe === 3 && ohneArt.nutzung === "ja" && !ohneArt.gueltig);
  pruefe("Pflicht-Link: fehlt ohne Link und bei Freitext, Groß- und Kleinschreibung egal", b(basis, { quellenart: "forum", cluster: "internet" }).urlFehlt && b({ ...basis, url: "forum.example" }, { quellenart: "forum", cluster: "internet" }).urlFehlt && !b({ ...basis, url: "HTTPS://forum.example" }, { quellenart: "forum", cluster: "internet" }).urlFehlt && b({ ...basis, url: "https://forum.example" }, { quellenart: "forum", cluster: "internet" }).gueltig);
  pruefe("Cluster: ohne Cluster oder unpassend nicht gültig", !b(basis, { cluster: "" }).gueltig && !b({ ...basis, url: "https://x.example" }, { quellenart: "internetquelle", cluster: "buecher" }).gueltig);
  pruefe("Nutzung: Norm im Recht nur als Hinweis, gültig", b(basis, { quellenart: "standard" }).nutzung === "hinweis" && b(basis, { quellenart: "standard" }).gueltig && b(basis, { quellenart: "standard" }).stufe === 3);
}

// ---- 7. Alle Sprachen --------------------------------------------------------------------------------------------------------------
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
