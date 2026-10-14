import type { ComponentProps } from "react";
import { BuchEintrag, WissenBuecher } from "../../src/components/db/wissen-buecher";
import type { Ansicht } from "../../src/components/db/ansicht-schalter";
import type { Analyse } from "../../src/lib/wissen/analyse";
import type { SeitenLuecke, SeitenPruefung } from "../../src/lib/wissen/seitenverlauf";
import type { Guete, GueteHinweis, GueteNote } from "../../src/lib/wissen/textguete";
import { imMarkup, pruefer, rendere, SPRACHEN, texteVon } from "./hilfen/ansicht-probe";

// Charakterisierung des Buch-Uploads (wissen-buecher.tsx), ohne Browser und ohne Datenbank:
//   * WissenBuecher: der Anfang der Karte (Cluster, Rollen, KI, Dateiwahl, Start gesperrt). Mehr erreichen die Angaben nicht, die Liste
//     entsteht erst durch die Dateiwahl.
//   * BuchEintrag: jeder Schritt eines Buchs (wartet, liest, bereit, lädt, fertig, Fehler, abgebrochen) in Liste und Raster, zu und aufgeklappt,
//     mit Textgüte, Qualität, Original, Seitenverlauf (lückenlos, eingeschränkt, Lücken mit und ohne Bestätigung), Artikelfolge, Analyse mit
//     und ohne KI, Nutzung und Pflicht-Link.
// Lesen, KI-Analyse, Hochladen und Abbrechen laufen über Ereignisse und Server Actions und bleiben Prüfpunkte im Browser.
// Aufruf: npm run test:wissen-buecher-ansicht

const { pruefe, ende } = pruefer();

type Eintrag = ComponentProps<typeof BuchEintrag>["e"];
type Texte = Record<string, string> & Record<string, Record<string, string>>;
const de = texteVon("de") as { roles: Record<string, string>; kiAssistentAnsicht: { wissensVerwaltung: Record<string, Texte> } };
const w = de.kiAssistentAnsicht.wissensVerwaltung;
const b = w.buecher;
const fehlerOriginal = b.original as unknown as Record<string, string> & { fehler: Record<string, string> };

const datei = new File(["x".repeat(2_097_152)], "steuerkodex-2026.pdf", { type: "application/pdf" });
const guete = (note: GueteNote, hinweise: GueteHinweis[] = [], prozent = 90) => ({ note, hinweise, prozent, kennzahlen: {} }) as unknown as Guete;
const analyse = (teil: Partial<Analyse> = {}): Analyse => ({ bereich: "steuer", quellenart: "fachliteratur", textgrundlage: "original", sprache: "de", sicherheit: "hoch", gruende: ["bereichSteuer", "artBuch"], quelle: "heuristik", ...teil });
const verlauf = (teil: Partial<SeitenPruefung> = {}): SeitenPruefung => ({ seiten: 300, erkannt: 290, abdeckung: 0.97, luecken: [], fehlend: 0, eingeschoben: 0, neuzaehlungen: 0, ohneText: [], eingeschraenkt: false, geprueft: true, ...teil });
const TEXT = "Steuerkodex Artikel 1 bis 3, ein kurzer Text für die Probe.";

const leer: Eintrag = {
  id: 7, datei, titel: "Steuerkodex 2026", schritt: "wartet", seite: 0, seiten: 0, paket: 0, pakete: 0, guete: null, verlauf: null, artikel: null, roheSeiten: null,
  trotzdem: false, qualitaet: null, original: null, originalProzent: null, versuch: 0, fehler: null, text: null, hash: null, analyse: null, ki: "aus",
  bereich: "recht", quellenart: "fachliteratur", textgrundlage: "original", url: "", eigene: new Set(),
};
/** Gelesen und bereit: Textgüte gut, Seitenverlauf lückenlos, Analyse nach Regeln. */
const bereit: Eintrag = { ...leer, schritt: "bereit", guete: guete("gut"), qualitaet: 92, text: TEXT, hash: "a".repeat(64), analyse: analyse(), bereich: "steuer", verlauf: verlauf(), pakete: 1 };

const eintrag = (e: Eintrag, o: { ansicht?: Ansicht; offen?: boolean; cluster?: string; mitKi?: boolean; loc?: string } = {}) =>
  rendere(
    <BuchEintrag e={e} ansicht={o.ansicht ?? "liste"} offen={o.offen ?? false} beiAufklappen={() => {}} cluster={o.cluster ?? "buecher"} mitKi={o.mitKi ?? true} setze={() => {}} aendere={() => {}} entferne={() => {}} />,
    o.loc ?? "de",
  );
const pillen = (html: string) => [...html.matchAll(/<span class="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0\.5 text-\[11px\] font-semibold leading-4 ([^"]+)">([^<]*)<\/span>/g)].map((m) => `${ton(m[1]!)}:${m[2]}`);
const TOENE: Record<string, string> = {
  "bg-success/10 text-success border-success/25": "success",
  "bg-primary/10 text-primary border-primary/25": "info",
  "bg-muted text-muted-foreground border-border": "neutral",
  "bg-warning/12 text-warning border-warning/25": "warning",
  "bg-destructive/10 text-destructive border-destructive/25": "danger",
};
const ton = (klasse: string) => TOENE[klasse] ?? klasse;
const infoZeile = (html: string) => html.match(/<p class="mt-1 text-\[11px\] text-muted-foreground">(steuerkodex-2026\.pdf[^<]*)<\/p>/)?.[1] ?? "";
const titelFeld = (html: string) => html.match(/<input type="text"[^>]*>/)?.[0] ?? "";
const auswahl = (html: string, wert: string) => html.match(new RegExp(`<select class="[^"]*"( disabled="")?>(?:(?!</select>)[\\s\\S])*?<option value="${wert}" selected=""`))?.[0] ?? "";

// ---- 1. WissenBuecher: der Anfang der Karte ------------------------------------------------------------------------------------------
{
  const { html, fehler } = rendere(<WissenBuecher beiFertig={() => {}} />);
  pruefe("Karte: baut ohne Fehler und ohne fehlenden Schlüssel auf", fehler.length === 0 && html.length > 0, fehler.slice(0, 3).join(" | "));
  pruefe("Karte: Titel und Einleitung", html.includes(`>${imMarkup(b.titel)}</p>`) && html.includes(imMarkup(b.lead)));
  pruefe("Karte: Cluster Bücher ist vorgewählt", /<select[^>]*name="buch_cluster"[^>]*>[\s\S]*?<option value="buecher" selected="">/.test(html) && html.includes(imMarkup(b.clusterHinweis)));
  pruefe("Karte: Administration immer dabei (angehakt und gesperrt), die anderen Rollen frei und leer", html.includes(`<input type="checkbox" disabled="" checked=""/>${de.roles.admin}</label>`) && ["ceo", "betriebsleitung", "buchhaltung"].every((r) => html.includes(`<input type="checkbox"/>${imMarkup(de.roles[r]!)}</label>`)));
  pruefe("Karte: KI-Analyse ist angehakt und frei", html.includes(`<input type="checkbox" class="mt-0.5" checked=""/><span><span class="font-semibold">${imMarkup(b.kiAn)}</span>`));
  pruefe("Karte: Dateiwahl für mehrere PDF, Markdown und Text, frei", /<input type="file" multiple="" accept="\.pdf,\.md,\.txt,application\/pdf,text\/markdown,text\/plain" class="[^"]+"\/>/.test(html));
  pruefe("Karte: ohne Dateien kein Fortschritt, keine Ansichtswahl, keine Liste", !html.includes('role="status"') && !html.includes("aria-pressed") && !html.includes("<ul") && !html.includes("<progress"));
  pruefe("Karte: Hinweis auf die Freigabe und gesperrter Start mit null Büchern, kein Abbrechen, keine Meldung", html.includes(imMarkup(w.formular.freigabeHinweis)) && html.includes(`<button type="button" disabled="" class="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">0 Bücher hochladen</button>`) && !html.includes(`>${b.stopp}</button>`) && !html.includes('role="alert"'));
}

// ---- 2. Eintrag wartet (Liste, zugeklappt) -------------------------------------------------------------------------------------------
{
  const { html, fehler } = eintrag(leer);
  pruefe("Wartet: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
  pruefe("Wartet: Titel änderbar, in der Liste ohne volle Breite", titelFeld(html) === `<input type="text" aria-label="${imMarkup(b.titelFeld)}" class="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground " value="Steuerkodex 2026"/>`, titelFeld(html));
  pruefe("Wartet: nur die Pille des Schritts", pillen(html).join("|") === `info:${b.schritt.wartet}`, pillen(html).join("|"));
  pruefe("Wartet: Aufklappknopf zu, mit Titel im Namen, und Entfernen", html.includes(`<button type="button" aria-expanded="false" aria-controls="eintrag-7" aria-label="Details von „Steuerkodex 2026“ aufklappen"`) && html.includes(`<button type="button" class="text-[11px] font-semibold underline">${b.entfernen}</button>`));
  pruefe("Wartet: Datei und Größe, sonst nichts", infoZeile(html) === "steuerkodex-2026.pdf (2.0 MB)", infoZeile(html));
  pruefe("Wartet: kein Balken, keine Details, kein Fehler, kein Hinweis auf fehlende Angaben", !html.includes("<progress") && !html.includes('id="eintrag-7"') && !html.includes('role="alert"') && !html.includes(imMarkup(b.angabenFehlen)));
}

// ---- 3. Eintrag liest --------------------------------------------------------------------------------------------------------------
{
  const { html } = eintrag({ ...leer, schritt: "liest", seite: 30, seiten: 120 });
  pruefe("Liest: Seite in der Infozeile und Balken", infoZeile(html) === "steuerkodex-2026.pdf (2.0 MB) · Seite 30 von 120" && html.includes(`<progress class="mt-1 h-1.5 w-full" max="120" value="30" aria-label="${imMarkup(b.fortschritt.lesenBalken)}"></progress>`), infoZeile(html));
  const ohne = eintrag({ ...leer, schritt: "liest" });
  pruefe("Liest ohne Seitenzahl: keine Seite, kein Balken", infoZeile(ohne.html) === "steuerkodex-2026.pdf (2.0 MB)" && !ohne.html.includes("<progress") && pillen(ohne.html).join() === `info:${b.schritt.liest}`);
  const offen = eintrag({ ...leer, schritt: "liest", analyse: analyse() }, { offen: true });
  pruefe("Liest aufgeklappt: noch keine Analyse", offen.html.includes('id="eintrag-7"') && !offen.html.includes("<select"));
}

// ---- 4. Eintrag bereit, aufgeklappt ------------------------------------------------------------------------------------------------
{
  const { html, fehler } = eintrag(bereit, { offen: true });
  pruefe("Bereit: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
  pruefe("Bereit: Pillen Schritt, Textgüte und Qualität", pillen(html).slice(0, 3).join("|") === `info:${b.schritt.bereit}|success:${w.guete.note.gut}|success:Qualität 92 %`, pillen(html).join("|"));
  pruefe("Bereit: Aufklappknopf offen", html.includes(`aria-expanded="true" aria-controls="eintrag-7" aria-label="Details von „Steuerkodex 2026“ zuklappen"`));
  pruefe("Bereit: Zeichenzahl in der Infozeile", infoZeile(html) === `steuerkodex-2026.pdf (2.0 MB) · ${TEXT.length} Zeichen`, infoZeile(html));
  pruefe("Bereit: Bereich, Quellenart und Textgrundlage als Auswahl, frei", html.includes(`<div class="grid gap-2 sm:grid-cols-3">`) && auswahl(html, "steuer") !== "" && !auswahl(html, "steuer").includes('disabled=""') && auswahl(html, "fachliteratur") !== "" && auswahl(html, "original") !== "");
  pruefe("Bereit: im Cluster Bücher sind die Arten aus dem Netz gesperrt", ["internetquelle", "forum", "internetrecherche"].every((a) => html.includes(`<option value="${a}" disabled="">`)) && !html.includes(`<option value="fachliteratur" disabled="">`));
  pruefe("Bereit: ohne Link-Pflicht kein Feld für den Link", !html.includes('type="url"'));
  pruefe("Bereit: sicherer Vorschlag nach Regeln mit Gründen", html.includes(`>${imMarkup(w.analyse.sicherheit.hoch)}</span><span>${imMarkup(w.analyse.vonRegeln)}: ${imMarkup(w.analyse.grund.bereichSteuer)}, ${imMarkup(w.analyse.grund.artBuch)}</span>`));
  pruefe("Bereit: Seitenverlauf lückenlos", html.includes(`<p class="mt-1 text-[11px] text-muted-foreground">Seitenverlauf lückenlos (300 Seiten, Seitenzahl auf 97 % der Seiten lesbar).</p>`));
  pruefe("Bereit: alle Angaben gültig, also kein Hinweis und kein Fehler", !html.includes(imMarkup(b.angabenFehlen)) && !html.includes('role="alert"') && !html.includes(imMarkup(w.formular.nutzungHinweis)));
  const zu = eintrag(bereit);
  pruefe("Bereit zugeklappt: keine Details", !zu.html.includes('id="eintrag-7"') && !zu.html.includes("<select"));
}

// ---- 5. Bereit, aber Angaben fehlen oder Text schlecht -------------------------------------------------------------------------------
{
  const ohneTitel = eintrag({ ...bereit, titel: "  " });
  pruefe("Ohne Titel: Hinweis auf fehlende Angaben", ohneTitel.html.includes(`<p class="mt-1 text-[11px] font-semibold text-warning">${imMarkup(b.angabenFehlen)}</p>`));
  const schlecht = eintrag({ ...bereit, guete: guete("schlecht", ["kaumText", "vieleSonderzeichen"]) }, { offen: true });
  pruefe("Schlecht: Pille rot, Hinweise hervorgehoben, gesperrt, kein Hinweis auf fehlende Angaben", pillen(schlecht.html)[1] === `danger:${w.guete.note.schlecht}` && schlecht.html.includes(`<p class="mt-1 text-[11px] font-semibold text-warning">${imMarkup(w.guete.hinweis.kaumText)} ${imMarkup(w.guete.hinweis.vieleSonderzeichen)}</p>`) && schlecht.html.includes(`<p class="mt-1 text-[11px] font-semibold text-destructive">${imMarkup(b.schlechtGesperrt)}</p>`) && !schlecht.html.includes(imMarkup(b.angabenFehlen)));
  const pruefen = eintrag({ ...bereit, guete: guete("pruefen") });
  pruefe("Prüfen: Pille gelb", pillen(pruefen.html)[1] === `warning:${w.guete.note.pruefen}`);
  const gutMitHinweis = eintrag({ ...bereit, guete: guete("gut", ["vieleZiffern"]) }, { offen: true });
  pruefe("Gut mit Hinweis: Hinweis ruhig", gutMitHinweis.html.includes(`<p class="mt-1 text-[11px] text-muted-foreground">${imMarkup(w.guete.hinweis.vieleZiffern)}</p>`));
  const falscherCluster = eintrag({ ...bereit, quellenart: "internetquelle", url: "https://example.org" });
  pruefe("Art passt nicht zum Cluster: Hinweis auf fehlende Angaben", falscherCluster.html.includes(imMarkup(b.angabenFehlen)));
}

// ---- 6. Lücken im Scan ---------------------------------------------------------------------------------------------------------------
{
  const einzeln: SeitenLuecke = { nachPdfSeite: 46, vonGedruckt: 48, bisGedruckt: 48, anzahl: 1, genau: true };
  const mehrere: SeitenLuecke = { nachPdfSeite: 99, vonGedruckt: 101, bisGedruckt: 103, anzahl: 3, genau: true };
  const ungefaehr: SeitenLuecke = { nachPdfSeite: 150, vonGedruckt: 152, bisGedruckt: 156, anzahl: 2, genau: false, bisPdfSeite: 153 };
  const ohneBis: SeitenLuecke = { nachPdfSeite: 200, vonGedruckt: 202, bisGedruckt: 205, anzahl: 1, genau: false };
  const mitLuecken: Eintrag = { ...bereit, verlauf: verlauf({ luecken: [einzeln, mehrere, ungefaehr, ohneBis], fehlend: 7 }) };
  const { html, fehler } = eintrag(mitLuecken, { offen: true });
  const stellen = [
    "gedruckte Seite 48 (nach PDF-Seite 46)",
    "gedruckte Seiten 101 bis 103 (nach PDF-Seite 99)",
    "2 Seiten zwischen den gedruckten Seiten 152 und 156, in den PDF-Seiten 150 bis 153",
    "1 Seite zwischen den gedruckten Seiten 202 und 205, in den PDF-Seiten 200 bis 200",
  ];
  pruefe("Lücken: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
  pruefe("Lücken: Meldung mit jeder Art von Stelle", html.includes(`<p role="alert" class="text-[11px] font-semibold text-warning">Im Scan fehlen 7 Seiten: `) && stellen.every((s) => html.includes(imMarkup(s))), html.match(/Im Scan fehlen[^<]*/)?.[0]);
  pruefe("Lücken: Bestätigung angeboten, nicht angehakt", html.includes(`<input type="checkbox" class="mt-0.5"/><span>${imMarkup(b.seiten.trotzdem)}</span>`));
  pruefe("Lücken offen: kein Hinweis auf fehlende Angaben", !html.includes(imMarkup(b.angabenFehlen)));
  const bestaetigt = eintrag({ ...mitLuecken, trotzdem: true }, { offen: true });
  pruefe("Lücken bestätigt: Häkchen gesetzt, Meldung bleibt", bestaetigt.html.includes(`<input type="checkbox" class="mt-0.5" checked=""/><span>${imMarkup(b.seiten.trotzdem)}</span>`) && bestaetigt.html.includes("Im Scan fehlen 7 Seiten"));
  const viele = eintrag({ ...bereit, verlauf: verlauf({ luecken: Array.from({ length: 13 }, (_, i) => ({ ...einzeln, vonGedruckt: 10 * i + 2, bisGedruckt: 10 * i + 2, nachPdfSeite: 10 * i })), fehlend: 13 }) }, { offen: true });
  pruefe("Viele Lücken: höchstens zwölf Stellen, dann Auslassung", (viele.html.match(/gedruckte Seite \d+ \(nach PDF-Seite \d+\)/g) ?? []).length === 12 && viele.html.includes("(nach PDF-Seite 110) ..."));
  const laedt = eintrag({ ...mitLuecken, schritt: "laedt", trotzdem: true, pakete: 4, paket: 1 }, { offen: true });
  pruefe("Lücken beim Hochladen: Häkchen gesperrt", laedt.html.includes(`<input type="checkbox" class="mt-0.5" disabled="" checked=""/>`));
}

// ---- 7. Seitenverlauf eingeschränkt, Seiten ohne Text, Artikelfolge -------------------------------------------------------------------
{
  const eingeschraenkt = eintrag({ ...bereit, verlauf: verlauf({ eingeschraenkt: true, abdeckung: 0.3, ohneText: Array.from({ length: 16 }, (_, i) => i + 10) }) }, { offen: true });
  pruefe("Eingeschränkt: Hinweis mit Anteil", eingeschraenkt.html.includes(`<p class="mt-1 text-[11px] text-muted-foreground">Keine Lücke gefunden, aber nur eingeschränkt prüfbar: Die Seitenzahl war nur auf 30 % der Seiten lesbar.</p>`));
  pruefe("Ohne Text: höchstens 15 Seiten, dann Auslassung", eingeschraenkt.html.includes("Seiten ohne Text mitten im Buch (PDF-Seiten): 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24 ...."));
  const ungeprueft = eintrag({ ...bereit, verlauf: verlauf({ geprueft: false, ohneText: [3] }) }, { offen: true });
  pruefe("Nicht geprüft (Markdown): kein Seitenverlauf, keine Seiten ohne Text", !ungeprueft.html.includes("Seitenverlauf") && !ungeprueft.html.includes("Seiten ohne Text"));
  const artikel = { artikel: 200, kleinste: 1, groesste: 210, luecken: [[5, 7], [100, 100]] as [number, number][], fehlend: 4 };
  const gesetz = eintrag({ ...bereit, quellenart: "rechtsnorm", artikel }, { offen: true });
  pruefe("Gesetz: fehlende Artikelnummern werden genannt", gesetz.html.includes("Es fehlen 4 Artikelnummern in der Folge 1 bis 210: 5-7, 100."), gesetz.html.match(/Es fehlen[^<]*/)?.[0]);
  const anweisung = eintrag({ ...bereit, quellenart: "verwaltungsanweisung", artikel }, { offen: true });
  pruefe("Verwaltungsanweisung zählt als Gesetz", anweisung.html.includes("Es fehlen 4 Artikelnummern"));
  const kommentar = eintrag({ ...bereit, artikel }, { offen: true });
  pruefe("Kommentar: Artikelfolge zählt nicht", !kommentar.html.includes("Artikelnummer"));
}

// ---- 8. Analyse: Herkunft des Vorschlags, Sicherheit, Nutzung, Link ------------------------------------------------------------------
{
  const herkunft = (e: Eintrag, mitKi = true) => eintrag(e, { offen: true, mitKi }).html.match(/<\/span><span>([^<]*)<\/span><\/p>/)?.[1] ?? "";
  pruefe("KI läuft", herkunft({ ...bereit, ki: "laeuft" }).startsWith(imMarkup(w.analyse.kiLaeuft) + ": "));
  pruefe("Von der KI mit eigenem Hinweis", herkunft({ ...bereit, ki: "fertig", analyse: analyse({ quelle: "ki", hinweis: "Kommentar zum Steuerrecht" }) }) === `${imMarkup(w.analyse.vonKi)}: Kommentar zum Steuerrecht`);
  pruefe("Keine KI erreichbar, KI gewünscht", herkunft({ ...bereit, ki: "keine" }).startsWith(imMarkup(w.analyse.nurRegeln) + ": "));
  pruefe("Keine KI, aber auch nicht gewünscht", herkunft({ ...bereit, ki: "keine" }, false).startsWith(imMarkup(w.analyse.vonRegeln) + ": "));
  pruefe("Ohne Gründe und Hinweis: nur die Herkunft", herkunft({ ...bereit, analyse: analyse({ gruende: [] }) }) === imMarkup(w.analyse.vonRegeln));
  const sicherheit = (s: Analyse["sicherheit"]) => pillen(eintrag({ ...bereit, analyse: analyse({ sicherheit: s }) }, { offen: true }).html).find((x) => x.endsWith(w.analyse.sicherheit[s]!));
  pruefe("Sicherheit: hoch grün, mittel blau, niedrig gelb", sicherheit("hoch")?.startsWith("success") === true && sicherheit("mittel")?.startsWith("info") === true && sicherheit("niedrig")?.startsWith("warning") === true);
  const hinweis = eintrag({ ...bereit, bereich: "recht", quellenart: "standard" }, { offen: true });
  pruefe("Norm im Recht: Nutzung nur als Hinweis", hinweis.html.includes(`<p class="text-[11px] font-semibold text-warning">${imMarkup(w.formular.nutzungHinweis)}</p>`));
  const netz = eintrag({ ...bereit, quellenart: "internetquelle", url: "https://example.org/x" }, { offen: true, cluster: "internet" });
  pruefe("Internetquelle: Feld für den Link mit Wert, Notbehelf, gültig", netz.html.includes(`<input type="url" class="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-60" placeholder="https://" value="https://example.org/x"/>`) && netz.html.includes(imMarkup(w.formular.nutzungNotfalls)) && !netz.html.includes(imMarkup(b.angabenFehlen)));
  const ohneLink = eintrag({ ...bereit, quellenart: "internetquelle", url: "" }, { cluster: "internet" });
  pruefe("Internetquelle ohne Link: Hinweis auf fehlende Angaben", ohneLink.html.includes(imMarkup(b.angabenFehlen)));
  const ohneArt = eintrag({ ...bereit, quellenart: "" }, { offen: true });
  pruefe("Ohne Art: Bitte wählen ist gewählt, keine Nutzung, Hinweis auf fehlende Angaben", ohneArt.html.includes(`<option value="" selected="">${imMarkup(w.formular.bitteWaehlen)}</option>`) && !ohneArt.html.includes(imMarkup(w.formular.nutzungHinweis)) && ohneArt.html.includes(imMarkup(b.angabenFehlen)));
}

// ---- 9. Eintrag lädt ---------------------------------------------------------------------------------------------------------------
{
  const laedt: Eintrag = { ...bereit, schritt: "laedt", pakete: 4, paket: 2 };
  const { html } = eintrag(laedt, { offen: true });
  pruefe("Lädt: Paket in der Infozeile und Balken des Buchs", infoZeile(html) === `steuerkodex-2026.pdf (2.0 MB) · Paket 2 von 4 · ${TEXT.length} Zeichen` && html.includes(`<progress class="mt-1 h-1.5 w-full" max="4" value="2" aria-label="${imMarkup(b.fortschritt.buchBalken)}"></progress>`), infoZeile(html));
  pruefe("Lädt: Titel und Auswahlfelder gesperrt, kein Entfernen", titelFeld(html).includes(`disabled=""`) && (html.match(/<select class="[^"]*" disabled="">/g) ?? []).length === 3 && !html.includes(`>${b.entfernen}</button>`));
  pruefe("Lädt: neuer Versuch eines Pakets", infoZeile(eintrag({ ...laedt, versuch: 1 }).html).includes(" · Paket 3 von 4: neuer Versuch 2 …"));
  pruefe("Lädt: nach dem letzten Paket der Fortschritt des Originals", infoZeile(eintrag({ ...laedt, paket: 4, originalProzent: 35 }).html).includes(" · Original wird abgelegt, 35 %") && infoZeile(eintrag({ ...laedt, paket: 4 }).html).includes(" · Original wird abgelegt, 0 %"));
  const ohnePakete = eintrag({ ...laedt, pakete: 0, paket: 0 });
  pruefe("Lädt ohne Pakete: Paket 0 von 0, kein Balken", infoZeile(ohnePakete.html).includes(" · Paket 0 von 0") && !ohnePakete.html.includes("<progress"));
}

// ---- 10. Fertig, Fehler, abgebrochen -----------------------------------------------------------------------------------------------
{
  const fertig: Eintrag = { ...bereit, schritt: "fertig", pakete: 1, paket: 1 };
  pruefe("Fertig mit Original: grüne Pillen", pillen(eintrag({ ...fertig, original: "ok" }).html).filter((x) => x.startsWith("success")).join("|") === `success:${b.schritt.fertig}|success:${w.guete.note.gut}|success:Qualität 92 %|success:${fehlerOriginal.abgelegt}`);
  pruefe("Fertig, Original zu groß: gelbe Pille mit Grund", pillen(eintrag({ ...fertig, original: "speicher" }).html).includes(`warning:${fehlerOriginal.fehler.speicher}`));
  pruefe("Fertig, unbekannter Grund: allgemeine Pille", pillen(eintrag({ ...fertig, original: "seltsam" }).html).includes(`warning:${fehlerOriginal.fehler.unbekannt}`));
  pruefe("Fertig ohne Versuch (Markdown): keine Original-Pille", pillen(eintrag(fertig).html).length === 3);
  pruefe("Original nur beim fertigen Buch", !pillen(eintrag({ ...bereit, original: "ok" }).html).includes(`success:${fehlerOriginal.abgelegt}`));
  pruefe("Fertig: Entfernen bleibt, Titel gesperrt", eintrag(fertig).html.includes(`>${b.entfernen}</button>`) && titelFeld(eintrag(fertig).html).includes(`disabled=""`));
  const fehler = eintrag({ ...leer, schritt: "fehler", fehler: "Paket 2 von 4 ist fehlgeschlagen." });
  pruefe("Fehler: rote Pille und Meldung", pillen(fehler.html)[0] === `danger:${b.schritt.fehler}` && fehler.html.includes(`<p role="alert" class="mt-1 text-[11px] font-semibold text-destructive">Paket 2 von 4 ist fehlgeschlagen.</p>`));
  pruefe("Abgebrochen: gelbe Pille", pillen(eintrag({ ...leer, schritt: "abgebrochen" }).html)[0] === `warning:${b.schritt.abgebrochen}`);
}

// ---- 11. Raster ----------------------------------------------------------------------------------------------------------------------
{
  const { html } = eintrag(bereit, { ansicht: "raster", offen: true });
  pruefe("Raster: Titel über die volle Breite, kein Aufklappknopf", titelFeld(html).includes(`text-foreground basis-full"`) && !html.includes("aria-expanded"));
  pruefe("Raster: Analyse untereinander", html.includes(`<div class="grid gap-2 ">`) && !html.includes("sm:grid-cols-3"));
}

// ---- 12. Alle Sprachen ---------------------------------------------------------------------------------------------------------------
for (const loc of SPRACHEN) {
  const karte = rendere(<WissenBuecher beiFertig={() => {}} />, loc);
  pruefe(`Sprache ${loc}, Karte: kein fehlender Schlüssel, kein Fehler`, karte.fehler.length === 0, karte.fehler.slice(0, 3).join(" | "));
  const zustaende: [string, Eintrag][] = [
    ["bereit mit Lücken und Artikeln", { ...bereit, quellenart: "rechtsnorm", verlauf: verlauf({ luecken: [{ nachPdfSeite: 4, vonGedruckt: 6, bisGedruckt: 8, anzahl: 3, genau: true }, { nachPdfSeite: 9, vonGedruckt: 12, bisGedruckt: 12, anzahl: 1, genau: true }, { nachPdfSeite: 20, vonGedruckt: 22, bisGedruckt: 25, anzahl: 2, genau: false }], fehlend: 6, ohneText: [3] }), artikel: { artikel: 50, kleinste: 1, groesste: 60, luecken: [[5, 6]], fehlend: 2 }, guete: guete("pruefen", ["vieleZiffern"]) }],
    ["lädt", { ...bereit, schritt: "laedt", pakete: 3, paket: 1, versuch: 1 }],
    ["fertig", { ...bereit, schritt: "fertig", original: "speicher" }],
    ["eingeschränkt", { ...bereit, ki: "keine", verlauf: verlauf({ eingeschraenkt: true }), quellenart: "standard", bereich: "recht" }],
  ];
  for (const [name, e] of zustaende) {
    const r = eintrag(e, { offen: true, loc });
    pruefe(`Sprache ${loc}, ${name}: kein fehlender Schlüssel, kein Fehler`, r.fehler.length === 0, r.fehler.slice(0, 3).join(" | "));
  }
}

ende();
