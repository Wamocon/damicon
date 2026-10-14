import { STRAHLEN } from "@/components/brand/damicon-logo";

// Das Damicon-Dokument: ein Rahmen fuer alles, was das System als Dokument herausgibt (Meldelisten, Belege,
// Checklisten, Nachweise, Protokolle). Er folgt dem Compliance-Pruefbericht (components/pruefung/bericht-pdf.ts):
// Deckblatt mit Marke, Vertraulich-Stempel und Eckdaten, laufende Kopf- und Fusszeile mit Seite x von y, nummerierte
// Abschnitte, Hinweise, Freigabe mit Unterschriftsfeldern und ein Siegel (SHA-256 ueber den Inhalt).
//
// Das Ergebnis ist ein eigenstaendiges HTML-Dokument. Der Browser macht daraus ueber "Drucken" eine PDF-Datei, wie beim
// Pruefbericht, bewusst ohne PDF-Baukasten: der Browser bringt Schriften fuer Kyrillisch und Kasachisch mit. Kopf- und
// Fusszeile laufen ueber @page-Randfelder (Chromium: Chrome, Edge); andere Browser drucken ohne sie, der Inhalt bleibt gleich.
//
// Alles, was von aussen kommt (Namen, Beschreibungen, Notizen), wird hier maskiert. Die Bausteine fuer Abschnitte
// (tabelle, absatz, liste, definitionen) nehmen Klartext und maskieren selbst; nur Zellen mit { html } werden unveraendert
// uebernommen und stammen immer aus diesem Modul.

// Farben der Marke: dieselben Werte wie app/icon.svg. Das Dokument lebt in einem eigenen Rahmen ohne die Theme-Variablen der App.
export const PETROL = "#00768f";
export const GOLD = "#f2c14b";
export const HIMBEERE = "#ff5c7a";
export const TINTE = "#14212b";
export const GRAU = "#5b6b78";
export const GRUEN = "#17805a";
export const BERNSTEIN = "#b06a10";
export const ROT = "#b23a3a";

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Die Bildmarke (Sonnensiegel) als eigenstaendiges SVG; dieselben Strahlen wie components/brand/damicon-logo.tsx. */
export function logoSvg(px: number): string {
  const strahlen = STRAHLEN.map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${px}" height="${px}"><rect width="128" height="128" rx="28" fill="${PETROL}"/><circle cx="64" cy="64" r="46" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="4.5"/><g fill="none" stroke="${GOLD}" stroke-width="4.5" stroke-linecap="round">${strahlen}</g><circle cx="64" cy="68" r="15" fill="${HIMBEERE}"/><path d="M32 92H96" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="5.5" stroke-linecap="round"/></svg>`;
}
const base64 = (s: string): string => (typeof btoa === "function" ? btoa(s) : Buffer.from(s, "utf8").toString("base64"));
export const logoAlsUrl = (px: number): string => `data:image/svg+xml;base64,${base64(logoSvg(px))}`;

/** Die festen Texte des Rahmens, in der Sprache des Dokuments. Kommen aus dem Namensraum "dokument.rahmen". */
export interface RahmenTexte {
  sprache: string;
  untertitel: string;
  vertraulich: string;
  fussVertraulich: string;
  seite: string;
  von: string;
  inhalt: string;
  kennung: string;
  erstelltAm: string;
  ersteller: string;
  siegel: string;
  siegelKurz: string;
  siegelHinweis: string;
  unterschrift: string;
  ortDatum: string;
  freigabe: string;
  freigabeText: string;
  hinweise: string;
  drucken: string;
  tippDruck: string;
}

export type Ton = "gut" | "warnung" | "schlecht" | "neutral";
const TON_FARBE: Record<Ton, string> = { gut: GRUEN, warnung: BERNSTEIN, schlecht: ROT, neutral: PETROL };

export interface Kennzahl {
  label: string;
  wert: string;
  ton?: Ton;
}

export interface DokumentAbschnitt {
  titel: string;
  html: string;
}

export interface DokumentEingabe {
  /** Eindeutige Nummer des Dokuments, steht im Kopf jeder Seite. */
  kennung: string;
  /** Dateiname ohne Endung: der Browser schlaegt ihn beim Speichern als PDF vor. */
  dateiname: string;
  /** Kopfzeile ueber dem Titel auf dem Deckblatt, zum Beispiel "ЕСУТД · Meldeprozess". */
  art: string;
  titel: string;
  untertitel?: string;
  erstelltAm: string;
  ersteller: { name: string; rolle: string };
  meta: { label: string; wert: string }[];
  kennzahlen?: Kennzahl[];
  /** Zwei, drei Saetze auf dem Deckblatt neben den Kennzahlen. */
  zusammenfassung?: string;
  abschnitte: DokumentAbschnitt[];
  /** Beschriftungen der Unterschriftsfelder. Ohne Angabe gibt es keinen Freigabe-Abschnitt. */
  freigabe?: string[];
  hinweise?: string[];
  /** SHA-256 (hex) ueber den kanonischen Inhalt. */
  siegel: string;
}

// ---- Bausteine fuer Abschnitte ---------------------------------------------------------------------------------------------

export type Zelle = string | number | null | undefined | { html: string; zahl?: boolean };

const zelleHtml = (z: Zelle): string => (typeof z === "object" && z !== null ? z.html : esc(z === null || z === undefined ? "" : String(z)));

/** Eine Tabelle. `zahlen` nennt die Spalten (Index ab 0), die zentriert stehen. */
export function tabelle(spalten: string[], zeilen: Zelle[][], zahlen: number[] = []): string {
  const kopf = spalten.map((s, i) => `<th${zahlen.includes(i) ? ' class="zahl"' : ""}>${esc(s)}</th>`).join("");
  const rumpf = zeilen.map((z) => `<tr>${z.map((c, i) => `<td${zahlen.includes(i) ? ' class="zahl"' : ""}>${zelleHtml(c)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${kopf}</tr></thead><tbody>${rumpf}</tbody></table>`;
}

/** Eine Liste von Angaben (Beschriftung, Wert), zum Beispiel die Angaben fuer das Portal. */
export function definitionen(zeilen: { label: string; wert: Zelle }[]): string {
  return `<table class="angaben"><tbody>${zeilen.map((z) => `<tr><th>${esc(z.label)}</th><td>${zelleHtml(z.wert)}</td></tr>`).join("")}</tbody></table>`;
}

export const absatz = (text: string, klasse = ""): string => `<p${klasse ? ` class="${klasse}"` : ""}>${esc(text)}</p>`;
export const liste = (punkte: string[]): string => `<ul class="punkte">${punkte.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
export const leerHinweis = (text: string): string => `<p class="klein"><em>${esc(text)}</em></p>`;

/** Eine kleine farbige Marke, zum Beispiel fuer einen Status. */
export function marke(text: string, ton: Ton = "neutral"): { html: string } {
  return { html: `<span class="marke2" style="--f:${TON_FARBE[ton]}">${esc(text)}</span>` };
}

/** Ein Kasten mit Hinweis, farbig umrandet (Warnung, Luecke). */
export function kasten(titel: string, punkte: string[], ton: Ton = "warnung"): string {
  return `<div class="kasten" style="--f:${TON_FARBE[ton]}"><strong>${esc(titel)}</strong>${liste(punkte)}</div>`;
}

// ---- Rahmen -------------------------------------------------------------------------------------------------------------------

function datum(iso: string, sprache: string): string {
  try {
    return new Date(iso).toLocaleString(sprache, { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Almaty" });
  } catch {
    return iso;
  }
}
function tag(iso: string, sprache: string): string {
  try {
    return new Date(iso).toLocaleDateString(sprache, { dateStyle: "long", timeZone: "Asia/Almaty" });
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Das Stilblatt des Rahmens: Seitenraender mit Kopf- und Fusszeile, Deckblatt, nummerierte Abschnitte und Tabellen.
 * Der Pruefbericht haengt seine eigenen Regeln (Befunde, Quellen) dahinter, siehe components/pruefung/bericht-pdf.ts.
 */
export function rahmenCss(t: Pick<RahmenTexte, "fussVertraulich" | "seite" | "von">, kopfTitel: string, kennung: string): string {
  const q = (s: string) => s.replace(/"/g, "'");
  return `
@page { size: A4; margin: 25mm 16mm 22mm;
  @top-left { content: url("${logoAlsUrl(18)}"); vertical-align: middle; padding-bottom: 3mm; border-bottom: 0.75pt solid ${PETROL}; }
  @top-center { content: "Damicon  ·  ${q(kopfTitel)}"; font: 700 7.5pt "Segoe UI", system-ui, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: ${PETROL}; vertical-align: middle; padding-bottom: 3mm; border-bottom: 0.75pt solid ${PETROL}; }
  @top-right { content: "${q(kennung)}"; font: 600 7.5pt ui-monospace, Consolas, monospace; color: ${GRAU}; vertical-align: middle; padding-bottom: 3mm; border-bottom: 0.75pt solid ${PETROL}; }
  @bottom-left { content: "${q(t.fussVertraulich)}"; font: 7.5pt "Segoe UI", system-ui, sans-serif; color: ${GRAU}; vertical-align: top; padding-top: 3mm; border-top: 0.5pt solid #cfd8de; }
  @bottom-right { content: "${q(t.seite)} " counter(page) " ${q(t.von)} " counter(pages); font: 600 7.5pt "Segoe UI", system-ui, sans-serif; color: ${TINTE}; vertical-align: top; padding-top: 3mm; border-top: 0.5pt solid #cfd8de; }
}
@page :first { margin: 0; @top-left { content: none; border: 0; } @top-center { content: none; border: 0; } @top-right { content: none; border: 0; } @bottom-left { content: none; border: 0; } @bottom-right { content: none; border: 0; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 9.6pt/1.5 "Segoe UI", system-ui, -apple-system, Arial, sans-serif; color: ${TINTE}; }
p { margin: 0 0 5pt; }
h1, h2, h3, h4 { font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif; }

/* ---- Deckblatt ---- */
.deck { position: relative; display: flex; flex-direction: column; width: 210mm; height: 297mm; break-after: page; overflow: hidden; }
.deck__band { display: flex; align-items: center; justify-content: space-between; padding: 14mm 18mm 12mm; color: #fff; background: linear-gradient(135deg, ${PETROL} 0%, #005a6e 100%); }
.deck__marke { display: flex; align-items: center; gap: 4mm; }
.deck__marke strong { display: block; font-size: 17pt; letter-spacing: 0.22em; }
.deck__marke small { display: block; margin-top: 1mm; font-size: 8pt; letter-spacing: 0.08em; opacity: 0.85; }
.stempel { padding: 2mm 5mm; border: 1.5pt solid ${GOLD}; border-radius: 1.5mm; font-size: 8.5pt; font-weight: 800; letter-spacing: 0.24em; text-transform: uppercase; color: ${GOLD}; transform: rotate(-3deg); }
.deck__linie { display: flex; height: 3mm; }
.deck__linie i:first-child { width: 34%; background: ${GOLD}; }
.deck__linie i:last-child { width: 6%; background: ${HIMBEERE}; }
.deck__inhalt { flex: 1; display: flex; flex-direction: column; padding: 16mm 18mm 0; }
.deck__art { margin: 0 0 3mm; font-size: 8.5pt; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: ${PETROL}; }
.deck h1 { margin: 0; font-size: 31pt; line-height: 1.08; letter-spacing: -0.015em; }
.deck__sub { margin: 4mm 0 0; font-size: 11pt; color: ${GRAU}; }
.deck__meta { width: 100%; margin-top: 10mm; border-collapse: collapse; font-size: 9pt; }
.deck__meta th { width: 38mm; padding: 2mm 0; background: none; text-align: left; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${GRAU}; border-bottom: 0.5pt solid #e1e7eb; vertical-align: top; }
.deck__meta td { padding: 2mm 0; border-bottom: 0.5pt solid #e1e7eb; }
.deck__inhaltsliste { margin-top: 9mm; columns: 2; column-gap: 12mm; }
.deck__inhaltstitel { margin: 0 0 2mm; font-size: 8pt; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: ${PETROL}; break-after: avoid; }
.deck__inhaltsliste ol { margin: 0; padding-left: 5mm; font-size: 9pt; line-height: 1.7; }
.deck__fuss { padding: 6mm 18mm 8mm; border-top: 0.75pt solid #cfd8de; font-size: 7.5pt; color: ${GRAU}; }
.deck__fuss code { font: 7.5pt ui-monospace, Consolas, monospace; overflow-wrap: anywhere; color: ${TINTE}; }

/* ---- Textteil ---- */
main { counter-reset: abschnitt; }
h2 { counter-increment: abschnitt; margin: 20pt 0 8pt; padding-bottom: 4pt; border-bottom: 1.5pt solid ${PETROL}; font-size: 13pt; color: ${PETROL}; break-after: avoid; }
h2::before { content: counter(abschnitt) ".  "; color: ${GOLD}; -webkit-text-stroke: 0.2pt ${PETROL}; }
h2:first-child { margin-top: 0; }
h3 { margin: 0 0 3pt; font-size: 10.5pt; }
.lead { font-size: 10.5pt; line-height: 1.55; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th { text-align: left; padding: 4pt 6pt; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: ${GRAU}; border-bottom: 1pt solid #cfd8de; background: #f6f9fa; }
td { padding: 4.5pt 6pt; vertical-align: top; border-bottom: 0.5pt solid #e1e7eb; }
tr { break-inside: avoid; }
td.zahl, th.zahl { text-align: center; font-variant-numeric: tabular-nums; }
.angaben th { width: 44%; text-transform: none; letter-spacing: 0; font-size: 8.5pt; font-weight: 600; background: none; }
.klein { font-size: 8.5pt; color: ${GRAU}; }
.marke2 { display: inline-block; padding: 0 5pt; border: 0.75pt solid currentColor; border-radius: 8pt; font-size: 7.5pt; font-weight: 700; color: var(--f, ${GRAU}); white-space: nowrap; }
.punkte { margin: 3pt 0 0; padding-left: 14pt; }
.kasten { margin: 8pt 0; padding: 7pt 10pt; border: 1pt solid #cfd8de; border-left: 4pt solid var(--f, ${BERNSTEIN}); border-radius: 3pt; break-inside: avoid; }
.freigabe { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10mm; margin-top: 8mm; break-inside: avoid; }
.freigabe div { padding-top: 14mm; border-top: 0.75pt solid ${TINTE}; font-size: 8pt; color: ${GRAU}; }
.siegel { margin-top: 8pt; padding: 8pt 10pt; border: 1pt dashed ${PETROL}; border-radius: 4pt; break-inside: avoid; }
.siegel code { font: 8pt ui-monospace, Consolas, monospace; overflow-wrap: anywhere; }
.hinweis { margin-top: 10pt; font-size: 8pt; color: ${GRAU}; }
`;
}

/** Kennzahlenfeld auf dem Deckblatt: bis zu vier Kaesten mit Wert und Beschriftung. */
function kennzahlenHtml(k: Kennzahl[], zusammenfassung: string | undefined): string {
  const kaesten = k
    .map((z) => `<div style="border-left:3pt solid ${TON_FARBE[z.ton ?? "neutral"]}"><b style="color:${TON_FARBE[z.ton ?? "neutral"]}">${esc(z.wert)}</b><span>${esc(z.label)}</span></div>`)
    .join("");
  return `<div class="deck__kennzahlen">${kaesten}</div>${zusammenfassung ? `<p class="deck__zusammenfassung">${esc(zusammenfassung)}</p>` : ""}`;
}

const DECK_ZUSATZ = `
.deck__kennzahlen { display: grid; grid-template-columns: repeat(auto-fit, minmax(34mm, 1fr)); gap: 4mm; margin-top: 12mm; padding: 6mm 7mm; border: 1pt solid #cfd8de; border-radius: 3mm; background: #f6f9fa; }
.deck__kennzahlen div { padding-left: 4mm; }
.deck__kennzahlen b { display: block; font-size: 21pt; line-height: 1.1; }
.deck__kennzahlen span { display: block; margin-top: 1mm; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${GRAU}; }
.deck__zusammenfassung { margin: 5mm 0 0; font-size: 10pt; color: #33434f; }
@media screen {
  body { background: #e9eef1; padding: 64px 0 24px; }
  .deck, main { max-width: 210mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 2px 14px rgba(20, 33, 43, 0.18); }
  .deck { height: auto; min-height: 297mm; }
  main { padding: 18mm 16mm 16mm; }
  .werkzeugleiste { position: fixed; top: 0; left: 0; right: 0; z-index: 10; display: flex; align-items: center; gap: 12px; padding: 10px 18px; background: ${PETROL}; color: #fff; font: 600 13px "Segoe UI", system-ui, sans-serif; }
  .werkzeugleiste button { padding: 6px 14px; border: 0; border-radius: 6px; background: ${GOLD}; color: ${TINTE}; font: 700 13px "Segoe UI", system-ui, sans-serif; cursor: pointer; }
  .werkzeugleiste span { opacity: 0.85; font-weight: 400; }
}
@media print { .werkzeugleiste { display: none; } }
`;

/** Das fertige Dokument als eigenstaendiges HTML. */
export function dokumentAlsHtml(e: DokumentEingabe, t: RahmenTexte): string {
  const abschnitte = e.abschnitte;
  const verzeichnis = [...abschnitte.map((a) => a.titel), ...(e.freigabe?.length ? [t.freigabe] : []), t.siegel];
  const meta = [
    { label: t.kennung, wert: e.kennung },
    { label: t.erstelltAm, wert: datum(e.erstelltAm, t.sprache) },
    { label: t.ersteller, wert: `${e.ersteller.name} (${e.ersteller.rolle})` },
    ...e.meta,
  ];
  const unterschrift = (rolle: string) => `<div>${esc(t.unterschrift)}: ${esc(rolle)}<br>${esc(t.ortDatum)}</div>`;

  return `<!doctype html><html lang="${esc(t.sprache)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(e.dateiname)}</title><style>${rahmenCss(t, e.titel, e.kennung.slice(-8))}${DECK_ZUSATZ}</style></head><body>
<div class="werkzeugleiste"><button type="button" onclick="window.print()">${esc(t.drucken)}</button><span>${esc(t.tippDruck)}</span></div>

<section class="deck">
  <div class="deck__band">
    <div class="deck__marke">${logoSvg(52)}<div><strong>DAMICON</strong><small>${esc(t.untertitel)}</small></div></div>
    <span class="stempel">${esc(t.vertraulich)}</span>
  </div>
  <div class="deck__linie"><i></i><i></i></div>
  <div class="deck__inhalt">
    <p class="deck__art">${esc(e.art)}</p>
    <h1>${esc(e.titel)}</h1>
    ${e.untertitel ? `<p class="deck__sub">${esc(e.untertitel)}</p>` : ""}
    ${e.kennzahlen?.length ? kennzahlenHtml(e.kennzahlen, e.zusammenfassung) : e.zusammenfassung ? `<p class="deck__zusammenfassung">${esc(e.zusammenfassung)}</p>` : ""}
    <table class="deck__meta"><tbody>${meta.map((m) => `<tr><th>${esc(m.label)}</th><td>${esc(m.wert)}</td></tr>`).join("")}</tbody></table>
    <div class="deck__inhaltsliste"><p class="deck__inhaltstitel">${esc(t.inhalt)}</p><ol>${verzeichnis.map((v) => `<li>${esc(v)}</li>`).join("")}</ol></div>
  </div>
  <div class="deck__fuss">${esc(t.siegelKurz)}: <code>SHA-256 ${esc(e.siegel)}</code></div>
</section>

<main>
${abschnitte.map((a) => `<h2>${esc(a.titel)}</h2>\n${a.html}`).join("\n\n")}
${e.freigabe?.length ? `\n<h2>${esc(t.freigabe)}</h2>\n<p>${esc(t.freigabeText)}</p>\n<div class="freigabe">${e.freigabe.map(unterschrift).join("")}</div>` : ""}

<h2>${esc(t.siegel)}</h2>
<div class="siegel"><table><tbody>
<tr><td><strong>${esc(t.kennung)}</strong></td><td><code>${esc(e.kennung)}</code></td></tr>
<tr><td><strong>${esc(t.erstelltAm)}</strong></td><td>${esc(datum(e.erstelltAm, t.sprache))}, ${esc(e.ersteller.name)}</td></tr>
<tr><td><strong>${esc(t.siegelKurz)}</strong></td><td><code>SHA-256 ${esc(e.siegel)}</code></td></tr>
</tbody></table></div>
<p class="hinweis">${esc(t.siegelHinweis)}</p>
${e.hinweise?.length ? `<p class="hinweis"><strong>${esc(t.hinweise)}:</strong> ${e.hinweise.map(esc).join(" &middot; ")}</p>` : ""}
<p class="hinweis">${esc(tag(e.erstelltAm, t.sprache))} &middot; Damicon</p>
</main>
</body></html>`;
}
