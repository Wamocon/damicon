import type { ComponentProps } from "react";
import { BuchEintrag, BuchFortschritt, WissenBuecher } from "../../src/components/db/wissen-buecher";
import {
  angabenFehlen,
  artPasst,
  brauchtAufmerksamkeit,
  buchKopf,
  eintragOk,
  gesamtFortschritt,
  gesperrt,
  istGesetz,
  istLadbar,
  istTextDatei,
  mitEigenemFeld,
  mitKiAntwort,
  nachDemLesen,
  neuerEintrag,
  uebernimm,
  type Ladbar,
  type Lauf,
} from "../../src/lib/wissen/buch-eintrag";
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
//   * seit dem Zerlegen (14.10.2026) das Modell eines Eintrags in lib/wissen/buch-eintrag.ts als reine Funktionen (neu, gelesen, von Hand
//     geändert, von der KI eingeordnet, ladbar, Kopf fürs Hochladen, Gesamtfortschritt) und die Fortschrittsanzeige BuchFortschritt.
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

// ---- 12. Das Modell eines Eintrags als reine Funktionen (buch-eintrag.ts, seit dem Zerlegen am 14.10.2026) -------------------------------
// Was in der Oberfläche erst durch Dateiwahl, Lesen, KI-Antwort und Hochladen entsteht.
{
  const md = new File(["# Titel"], "mein_kommentar.md", { type: "text/markdown" });
  const neu = neuerEintrag(3, md);
  pruefe("Neu: wartet, Titel aus dem Dateinamen, Vorgaben Recht, Fachliteratur, Original, nichts eigen", neu.id === 3 && neu.schritt === "wartet" && neu.titel === "Mein kommentar" && neu.bereich === "recht" && neu.quellenart === "fachliteratur" && neu.textgrundlage === "original" && neu.eigene.size === 0 && neu.ki === "aus" && neu.text === null && neu.url === "");
  pruefe("Dateiart: Markdown und Text werden direkt gelesen, PDF nicht", istTextDatei(md) && istTextDatei(new File([""], "a.TXT")) && !istTextDatei(datei));

  const a = analyse({ bereich: "compliance", quellenart: "standard", textgrundlage: "amtlich_uebersetzt" });
  const ueb = uebernimm(leer, a, "publikationen");
  pruefe("Analyse übernehmen: Bereich, Art und Textgrundlage aus der Analyse", ueb.analyse === a && ueb.bereich === "compliance" && ueb.quellenart === "standard" && ueb.textgrundlage === "amtlich_uebersetzt");
  const eigen = uebernimm({ ...leer, bereich: "risiko", eigene: new Set(["bereich"] as const) }, a, "publikationen");
  pruefe("Analyse übernehmen: selbst geänderte Felder bleiben", eigen.bereich === "risiko" && eigen.quellenart === "standard");
  pruefe("Analyse übernehmen: eine Art, die nicht zum Cluster passt, wird Fachliteratur", uebernimm(leer, analyse({ quellenart: "internetquelle" }), "buecher").quellenart === "fachliteratur" && uebernimm(leer, analyse({ quellenart: "internetquelle" }), "internet").quellenart === "internetquelle");

  const vorher = new Set<"bereich" | "quellenart" | "textgrundlage">();
  const geaendert = mitEigenemFeld({ ...bereit, eigene: vorher }, "quellenart", "standard");
  pruefe("Von Hand geändert: Wert gesetzt, Feld gilt als eigen, der alte Satz bleibt unberührt", geaendert.quellenart === "standard" && geaendert.eigene.has("quellenart") && vorher.size === 0);
  pruefe("Von Hand geändert: ein zulässiger Bereich lässt die Art stehen", mitEigenemFeld({ ...bereit, quellenart: "internetquelle" }, "bereich", "audit").quellenart === "internetquelle");

  const ki = { bereich: "recht" as const, quellenart: "rechtsnorm" as const, textgrundlage: "original" as const, titel: "  Steuerkodex der Republik Kasachstan  ", begruendung: "Gesetzestext.", sicherheit: "hoch" as const };
  const mitAnalyse: Eintrag = { ...bereit, titel: "Steuerkodex 2026", datei: new File([""], "steuerkodex_2026.pdf") };
  pruefe("KI: ohne Antwort zu diesem Eintrag bleibt er unverändert", mitKiAntwort(mitAnalyse, undefined, "buecher") === mitAnalyse);
  pruefe("KI: leere Antwort oder keine Analyse ergibt nur nach Regeln", mitKiAntwort(mitAnalyse, { id: "7", ki: null }, "buecher").ki === "keine" && mitKiAntwort({ ...mitAnalyse, analyse: null }, { id: "7", ki }, "buecher").ki === "keine");
  const eingeordnet = mitKiAntwort(mitAnalyse, { id: "7", ki }, "buecher");
  pruefe("KI: Einordnung, Herkunft und Titel aus der Antwort, solange der Titel vom Dateinamen stammt", eingeordnet.ki === "fertig" && eingeordnet.quellenart === "rechtsnorm" && eingeordnet.bereich === "recht" && eingeordnet.analyse?.quelle === "ki" && eingeordnet.analyse?.hinweis === "Gesetzestext." && eingeordnet.titel === "Steuerkodex der Republik Kasachstan");
  pruefe("KI: ein eigener Titel bleibt, ohne Titel in der Antwort auch", mitKiAntwort({ ...mitAnalyse, titel: "Mein Titel" }, { id: "7", ki }, "buecher").titel === "Mein Titel" && mitKiAntwort(mitAnalyse, { id: "7", ki: { ...ki, titel: undefined } }, "buecher").titel === "Steuerkodex 2026");
  pruefe("KI: ein langer Titel wird auf 200 Zeichen gekürzt", mitKiAntwort(mitAnalyse, { id: "7", ki: { ...ki, titel: "x".repeat(250) } }, "buecher").titel.length === 200);

  const gelesenText = { text: TEXT, guete: guete("gut", [], 80), verlauf: verlauf({ seiten: 100, fehlend: 4 }), artikel: null, hash: "b".repeat(64), analyse: analyse(), pakete: 2, roheSeiten: ["s1"] };
  const gelesen = nachDemLesen({ ...leer, schritt: "liest", trotzdem: true }, gelesenText, "buecher");
  pruefe("Gelesen: bereit, Text, Hash, Pakete, Bestätigung zurückgesetzt, KI noch aus", gelesen.schritt === "bereit" && gelesen.text === TEXT && gelesen.hash === "b".repeat(64) && gelesen.pakete === 2 && !gelesen.trotzdem && gelesen.ki === "aus" && gelesen.roheSeiten?.[0] === "s1" && gelesen.bereich === "steuer");
  pruefe("Gelesen: Qualität vorab um fehlende Seiten gemindert (80 % mal 0,8)", gelesen.qualitaet === 64, String(gelesen.qualitaet));
  pruefe("Gelesen: ohne geprüften Seitenverlauf zählt nur der Text", nachDemLesen(leer, { ...gelesenText, verlauf: verlauf({ geprueft: false, fehlend: 50 }) }, "buecher").qualitaet === 80 && nachDemLesen(leer, { ...gelesenText, verlauf: null }, "buecher").qualitaet === 80);

  pruefe("Ladbar: nur mit Text, Hash und gültiger Art", istLadbar(bereit) && !istLadbar({ ...bereit, text: "" }) && !istLadbar({ ...bereit, hash: null }) && !istLadbar({ ...bereit, quellenart: "" }));
  pruefe("Gesperrt beim Hochladen und danach", gesperrt({ ...bereit, schritt: "laedt" }) && gesperrt({ ...bereit, schritt: "fertig" }) && !gesperrt(bereit) && !gesperrt({ ...bereit, schritt: "fehler" }));
  pruefe("Gesetz: Rechtsnorm und Verwaltungsanweisung", istGesetz({ ...bereit, quellenart: "rechtsnorm" }) && istGesetz({ ...bereit, quellenart: "verwaltungsanweisung" }) && !istGesetz(bereit));
  pruefe("Art passt: Internetquelle nur im Cluster Internet, ohne gültigen Cluster nichts", artPasst("internetquelle", "internet") && !artPasst("internetquelle", "buecher") && artPasst("fachliteratur", "buecher") && !artPasst("fachliteratur", "unsinn") && !artPasst("", "buecher"));
  pruefe("Ok: bereit und vollständig", eintragOk(bereit, "buecher"));
  pruefe("Nicht ok: anderer Schritt, ohne Güte, schlechter Text, ohne Text oder Hash", !eintragOk({ ...bereit, schritt: "fertig" }, "buecher") && !eintragOk({ ...bereit, guete: null }, "buecher") && !eintragOk({ ...bereit, guete: guete("schlecht") }, "buecher") && !eintragOk({ ...bereit, text: null }, "buecher") && !eintragOk({ ...bereit, hash: null }, "buecher"));
  pruefe("Nicht ok: offene Lücken, bestätigte Lücken ok", !eintragOk({ ...bereit, verlauf: verlauf({ fehlend: 2 }) }, "buecher") && eintragOk({ ...bereit, verlauf: verlauf({ fehlend: 2 }), trotzdem: true }, "buecher"));
  pruefe("Nicht ok: unbekannter Bereich, unbekannte Art, Art passt nicht, unbekannte Textgrundlage, leerer Titel", !eintragOk({ ...bereit, bereich: "amtlich" }, "buecher") && !eintragOk({ ...bereit, quellenart: "unsinn" }, "buecher") && !eintragOk({ ...bereit, quellenart: "forum", url: "https://x.example" }, "buecher") && !eintragOk({ ...bereit, textgrundlage: "frei" }, "buecher") && !eintragOk({ ...bereit, titel: " " }, "buecher"));
  pruefe("Pflicht-Link: fehlt oder kein http(s), mit Leerzeichen und Großschreibung ok", !eintragOk({ ...bereit, quellenart: "forum" }, "internet") && !eintragOk({ ...bereit, quellenart: "forum", url: "forum.example" }, "internet") && eintragOk({ ...bereit, quellenart: "forum", url: "  HTTPS://forum.example " }, "internet"));
  pruefe("Angaben fehlen: nur bei bereit, nicht bei schlechtem Text oder offenen Lücken", angabenFehlen({ ...bereit, titel: "" }, "buecher") && !angabenFehlen(bereit, "buecher") && !angabenFehlen({ ...bereit, titel: "", guete: guete("schlecht") }, "buecher") && !angabenFehlen({ ...bereit, titel: "", verlauf: verlauf({ fehlend: 1 }) }, "buecher") && !angabenFehlen({ ...leer, titel: "" }, "buecher"));
  pruefe("Von selbst aufgeklappt: Fehler, offene Lücken, schlechter Text, fehlende Angaben", brauchtAufmerksamkeit({ ...leer, fehler: "x" }, "buecher") && brauchtAufmerksamkeit({ ...bereit, verlauf: verlauf({ fehlend: 1 }) }, "buecher") && brauchtAufmerksamkeit({ ...bereit, guete: guete("schlecht") }, "buecher") && brauchtAufmerksamkeit({ ...bereit, titel: "" }, "buecher") && !brauchtAufmerksamkeit(bereit, "buecher") && !brauchtAufmerksamkeit(leer, "buecher"));

  const ladbar = { ...bereit, titel: "  Steuerkodex  ", url: "  ", verlauf: verlauf({ geprueft: false }) } as Ladbar;
  const kopf = buchKopf(ladbar, ["p1", "p2"], ["buchhaltung"], "buecher");
  pruefe("Kopf: Titel gekürzt, leerer Link entfällt als undefined, Zahl der Pakete und Zeichen", kopf.titel === "Steuerkodex" && "url" in kopf && kopf.url === undefined && kopf.pakete === 2 && kopf.zeichen === TEXT.length && kopf.hash === "a".repeat(64) && kopf.cluster === "buecher" && kopf.rollen.join() === "buchhaltung" && kopf.dateiname === "steuerkodex-2026.pdf");
  pruefe("Kopf: ohne geprüften Seitenverlauf keine Seitenangabe", !("seiten" in kopf));
  pruefe("Kopf: Reihenfolge der Angaben", Object.keys(kopf).join() === "titel,bereich,rollen,dateiname,hash,quellenart,cluster,textgrundlage,url,pakete,zeichen");
  const mitSeiten = buchKopf({ ...ladbar, url: " https://x.example ", verlauf: verlauf({ luecken: [{ nachPdfSeite: 46, vonGedruckt: 48, bisGedruckt: 49, anzahl: 2, genau: true }], fehlend: 2 }), quellenart: "rechtsnorm", artikel: { artikel: 40, kleinste: 1, groesste: 42, luecken: [[5, 6]], fehlend: 2 } } as Ladbar, ["p1"], [], "publikationen");
  pruefe("Kopf: Link getrimmt, Seitenangabe mit Stellen und bei Gesetzen mit Artikeln", mitSeiten.url === "https://x.example" && mitSeiten.seiten?.stellen === "48-49 (46)" && mitSeiten.seiten?.fehlend === 2 && mitSeiten.seiten?.artikelFehlend === 2 && mitSeiten.seiten?.orte === undefined);
  const kommentar = buchKopf({ ...ladbar, verlauf: verlauf(), artikel: { artikel: 40, kleinste: 1, groesste: 42, luecken: [[5, 6]], fehlend: 2 } } as Ladbar, ["p1"], [], "buecher");
  pruefe("Kopf: beim Kommentar keine Artikel in der Seitenangabe", !!kommentar.seiten && kommentar.seiten.artikelFehlend === undefined);

  const e = (id: number, teil: Partial<Eintrag>): Eintrag => ({ ...bereit, id, ...teil });
  const liste = [e(1, { schritt: "fertig", pakete: 3 }), e(2, { schritt: "laedt", pakete: 4, paket: 2 }), e(3, { schritt: "fehler", pakete: 2 }), e(4, { schritt: "abgebrochen", pakete: 5 }), e(5, { pakete: 6 })];
  const lauf: Lauf = { ids: [1, 2, 3, 4], start: 1000, ende: null };
  const f = gesamtFortschritt(liste, lauf, 61000);
  pruefe("Fortschritt: Pakete im Lauf, erledigt zählt fertige und gescheiterte ganz, die laufende nach Paketen", f.imLauf.length === 4 && f.paketeGesamt === 14 && f.paketeErledigt === 12 && f.buecherFertig === 1 && f.buecherFehler === 2 && f.aktuellesBuch?.id === 2 && f.prozent === 85);
  pruefe("Fortschritt: Restzeit aus der bisherigen Geschwindigkeit, mindestens eine Minute", f.restMinuten === 1 && gesamtFortschritt(liste, { ...lauf, start: 61000 - 600_000 }, 61000).restMinuten === 2);
  pruefe("Fortschritt: keine Restzeit nach dem Ende, unter zwei Paketen oder unter fünf Sekunden", gesamtFortschritt(liste, { ...lauf, ende: 50000 }, 61000).restMinuten === null && gesamtFortschritt([e(2, { schritt: "laedt", pakete: 4, paket: 1 })], { ids: [2], start: 1000, ende: null }, 61000).restMinuten === null && gesamtFortschritt(liste, { ...lauf, start: 58000 }, 61000).restMinuten === null);
  pruefe("Fortschritt: ohne Lauf nichts im Lauf, ohne Pakete null Prozent", gesamtFortschritt(liste, null, 0).imLauf.length === 0 && gesamtFortschritt(liste, null, 0).restMinuten === null && gesamtFortschritt([e(1, { schritt: "laedt", pakete: 0 })], { ids: [1], start: 0, ende: null }, 9000).prozent === 0);
  pruefe("Fortschritt: höchstens 100 Prozent", gesamtFortschritt([e(1, { schritt: "laedt", pakete: 2, paket: 5 })], { ids: [1], start: 0, ende: null }, 1).prozent === 100);
  const lesen = gesamtFortschritt([e(1, { schritt: "wartet" }), e(2, { schritt: "liest" }), e(3, {}), e(4, { schritt: "fehler" })], null, 0);
  pruefe("Fortschritt: Lesen läuft, solange ein Eintrag wartet oder liest, gelesen zählt die übrigen", lesen.liestNoch && lesen.gelesen === 2 && !gesamtFortschritt([e(3, {})], null, 0).liestNoch);

  const balken = (eintraege: Eintrag[], l: Lauf | null, jetzt = 61000) => rendere(<BuchFortschritt eintraege={eintraege} lauf={l} jetzt={jetzt} />).html;
  pruefe("Fortschrittsanzeige: ohne Einträge oder ohne Lesen und Lauf nichts", balken([], lauf) === "" && balken([bereit], null) === "");
  const leseAnzeige = balken([e(1, { schritt: "wartet" }), e(2, {})], null);
  pruefe("Fortschrittsanzeige: Lesen mit Zahl und Balken", leseAnzeige.startsWith(`<div role="status" aria-live="polite" class="mt-3 space-y-1.5 rounded-lg border border-border bg-muted/30 p-2.5"><div class="space-y-1"><p class="text-xs font-semibold text-card-foreground">Dateien lesen und analysieren: 1 von 2</p><progress class="h-1.5 w-full" max="2" value="1" aria-label="${imMarkup(b.fortschritt.lesenBalken)}"></progress></div></div>`));
  const laufAnzeige = balken(liste, lauf);
  pruefe("Fortschrittsanzeige: Hochladen mit Buch, Prozent, Paketen, aktuellem Buch, Restzeit und Hinweis", laufAnzeige.includes("Buch 4 von 4 wird hochgeladen, insgesamt 85 Prozent") && laufAnzeige.includes(`<progress class="h-2 w-full" max="14" value="12" aria-label="${imMarkup(b.fortschritt.gesamtBalken)}"></progress>`) && laufAnzeige.includes("12 von 14 Paketen übertragen · gerade: Steuerkodex 2026 (Paket 2 von 4) · noch etwa 1 Min.") && laufAnzeige.includes(imMarkup(b.fortschritt.nichtSchliessen)));
  pruefe("Fortschrittsanzeige: ein langer Titel wird auf 60 Zeichen gekürzt", balken([e(2, { schritt: "laedt", pakete: 4, paket: 2, titel: "y".repeat(80) })], { ids: [2], start: 1000, ende: null }).includes(`gerade: ${"y".repeat(60)} (Paket`));
  pruefe("Fortschrittsanzeige: Ende mit Fehlern, ohne Restzeit und ohne Hinweis", balken(liste, { ...lauf, ende: 50000 }).includes("Beendet: 1 Bücher hochgeladen, 2 nicht.") && !balken(liste, { ...lauf, ende: 50000 }).includes("noch etwa") && !balken(liste, { ...lauf, ende: 50000 }).includes(imMarkup(b.fortschritt.nichtSchliessen)));
  pruefe("Fortschrittsanzeige: Ende ohne Fehler", balken([e(1, { schritt: "fertig", pakete: 3 })], { ids: [1], start: 0, ende: 9000 }).includes("Fertig: 1 Bücher hochgeladen."));
  pruefe("Fortschrittsanzeige: ein Lauf ohne passende Einträge zeigt nur den leeren Rahmen", balken([bereit], { ids: [99], start: 0, ende: null }) === `<div role="status" aria-live="polite" class="mt-3 space-y-1.5 rounded-lg border border-border bg-muted/30 p-2.5"></div>`);
}

// ---- 13. Alle Sprachen ---------------------------------------------------------------------------------------------------------------
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
