import { STRAHLEN } from "@/components/brand/damicon-logo";
import type { Befund, Bericht } from "@/lib/pruefung/typen";

// Der Pruefbericht als Dokument zum Weitergeben (Behoerden, Steuerberater, Pruefer, Banken): Deckblatt mit Marke, Reifegrad
// und Eckdaten, laufende Kopf- und Fusszeile mit Seitenzahl, nummerierte Abschnitte (Zusammenfassung, Ergebnis nach Bereich,
// Prioritaeten, Befunde, Massnahmenplan, Methodik, Anhang mit dem Wortlaut der Rechtsquellen, Freigabe, Siegel).
// Der Browser macht daraus ueber "Drucken" eine PDF-Datei; das Dokument traegt dafuer einen sinnvollen Titel, der als
// Dateiname vorgeschlagen wird. Bewusst kein PDF-Baukasten: der Browser bringt Schriften fuer Kyrillisch und Kasachisch mit,
// ein Baukasten muesste eine Schrift von rund 500 KB mitliefern und den Zeilenumbruch selbst nachbauen.
//
// Kopf- und Fusszeile laufen ueber @page-Randfelder (Chromium: Chrome, Edge). Andere Browser drucken das Dokument ohne sie,
// mit ihrer eigenen Kopf- und Fusszeile; der Inhalt ist derselbe.

type Uebersetze = (schluessel: string, werte?: Record<string, string | number>) => string;

export interface PdfTexte {
  /** Namensraum "pruefung" */
  t: Uebersetze;
  /** Namensraum "pruefungPdf" */
  p: Uebersetze;
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FRIST: Record<string, string> = { sofort: "sofort", "7 Tage": "tage7", "30 Tage": "tage30", "90 Tage": "tage90" };

// Farben der Marke: dieselben Werte wie app/icon.svg. Das Dokument lebt in einem eigenen Rahmen ohne die Theme-Variablen der App.
const PETROL = "#00768f";
const GOLD = "#f2c14b";
const HIMBEERE = "#ff5c7a";
const TINTE = "#14212b";
const GRAU = "#5b6b78";

/** Die Bildmarke (Sonnensiegel) als eigenstaendiges SVG; dieselben Strahlen wie components/brand/damicon-logo.tsx. */
function logoSvg(px: number): string {
  const strahlen = STRAHLEN.map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${px}" height="${px}"><rect width="128" height="128" rx="28" fill="${PETROL}"/><circle cx="64" cy="64" r="46" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="4.5"/><g fill="none" stroke="${GOLD}" stroke-width="4.5" stroke-linecap="round">${strahlen}</g><circle cx="64" cy="68" r="15" fill="${HIMBEERE}"/><path d="M32 92H96" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="5.5" stroke-linecap="round"/></svg>`;
}
const base64 = (s: string): string => (typeof btoa === "function" ? btoa(s) : Buffer.from(s, "utf8").toString("base64"));
const logoAlsUrl = (px: number): string => `data:image/svg+xml;base64,${base64(logoSvg(px))}`;

function datum(iso: string, sprache: string): string {
  try {
    return new Date(iso).toLocaleString(sprache, { dateStyle: "long", timeStyle: "short" });
  } catch {
    return iso;
  }
}
function tag(iso: string, sprache: string): string {
  try {
    return new Date(iso).toLocaleDateString(sprache, { dateStyle: "long" });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Dateiname ohne Sonderzeichen, aus Berichtsnummer und Datum. */
export function pdfDateiname(b: Bericht): string {
  return `Compliance-Prüfbericht-${b.erstelltAm.slice(0, 10)}-${b.id.slice(0, 8)}`;
}

const STIL = (x: PdfTexte, b: Bericht): string => `
@page { size: A4; margin: 25mm 16mm 22mm;
  @top-left { content: url("${logoAlsUrl(18)}"); vertical-align: middle; padding-bottom: 3mm; border-bottom: 0.75pt solid ${PETROL}; }
  @top-center { content: "Damicon  ·  ${x.p("titel").replace(/"/g, "'")}"; font: 700 7.5pt "Segoe UI", system-ui, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: ${PETROL}; vertical-align: middle; padding-bottom: 3mm; border-bottom: 0.75pt solid ${PETROL}; }
  @top-right { content: "${esc(b.id.slice(0, 8))}"; font: 600 7.5pt ui-monospace, Consolas, monospace; color: ${GRAU}; vertical-align: middle; padding-bottom: 3mm; border-bottom: 0.75pt solid ${PETROL}; }
  @bottom-left { content: "${x.p("fussVertraulich").replace(/"/g, "'")}"; font: 7.5pt "Segoe UI", system-ui, sans-serif; color: ${GRAU}; vertical-align: top; padding-top: 3mm; border-top: 0.5pt solid #cfd8de; }
  @bottom-right { content: "${x.p("seite").replace(/"/g, "'")} " counter(page) " ${x.p("von").replace(/"/g, "'")} " counter(pages); font: 600 7.5pt "Segoe UI", system-ui, sans-serif; color: ${TINTE}; vertical-align: top; padding-top: 3mm; border-top: 0.5pt solid #cfd8de; }
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
.deck__reife { display: grid; grid-template-columns: 34mm 1fr; align-items: center; gap: 7mm; margin-top: 12mm; padding: 7mm 8mm; border: 1pt solid #cfd8de; border-radius: 3mm; background: #f6f9fa; }
.deck__ring { position: relative; width: 34mm; height: 34mm; }
.deck__ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.deck__ring b { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; font-size: 25pt; line-height: 1; }
.deck__ring small { display: block; margin-top: 1mm; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${GRAU}; }
.deck__reife strong { font-size: 14pt; }
.deck__reife p { margin: 2mm 0 0; font-size: 9.5pt; color: #33434f; }
.deck__zahlen { display: flex; flex-wrap: wrap; gap: 3mm 6mm; margin-top: 3mm; font-size: 8.5pt; color: ${GRAU}; }
.deck__zahlen b { color: ${TINTE}; }
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
ol.prio { margin: 0; padding: 0; list-style: none; counter-reset: prio; }
ol.prio li { counter-increment: prio; position: relative; margin-bottom: 4pt; padding: 5pt 8pt 5pt 26pt; border: 0.75pt solid #cfd8de; border-radius: 3pt; font-weight: 600; break-inside: avoid; }
ol.prio li::before { content: counter(prio); position: absolute; left: 7pt; top: 5pt; display: grid; place-items: center; width: 13pt; height: 13pt; border-radius: 50%; font-size: 8pt; font-weight: 800; color: #fff; background: ${PETROL}; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th { text-align: left; padding: 4pt 6pt; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: ${GRAU}; border-bottom: 1pt solid #cfd8de; background: #f6f9fa; }
td { padding: 4.5pt 6pt; vertical-align: top; border-bottom: 0.5pt solid #e1e7eb; }
tr { break-inside: avoid; }
td.zahl, th.zahl { text-align: center; font-variant-numeric: tabular-nums; }
td.nb { white-space: nowrap; }
.tabelle-bereich td:first-child { font-weight: 700; }
.befund { margin: 0 0 9pt; padding: 8pt 10pt 8pt 11pt; border: 1pt solid #cfd8de; border-left: 4pt solid var(--f, #5b7488); border-radius: 3pt; break-inside: avoid; }
.befund[data-status="verstoss"] { --f: #b23a3a; }
.befund[data-status="luecke"] { --f: #b06a10; }
.befund[data-status="hinweis"] { --f: #5b7488; }
.befund[data-status="konform"] { --f: #17805a; }
.befund__kopf { display: flex; flex-wrap: wrap; align-items: center; gap: 4pt; margin-bottom: 4pt; font-size: 7.5pt; }
.nr { font: 700 8pt ui-monospace, Consolas, monospace; color: ${GRAU}; margin-right: 2pt; }
.marke2 { display: inline-block; padding: 0 5pt; border: 0.75pt solid currentColor; border-radius: 8pt; font-weight: 700; color: var(--f); }
.marke2.neutral { color: ${GRAU}; }
.klein { font-size: 8.5pt; color: ${GRAU}; }
.quellen { margin-top: 4pt; font-size: 8.5pt; }
.massnahmen { margin: 4pt 0 0; padding-left: 14pt; font-size: 9pt; }
.legende { display: grid; gap: 3pt; margin-top: 6pt; font-size: 8.5pt; color: #33434f; }
.legende span::before { content: ""; display: inline-block; width: 7pt; height: 7pt; margin-right: 5pt; border-radius: 2pt; background: var(--f); }
.quelle { margin: 0 0 7pt; padding: 6pt 8pt; border: 0.75pt solid #cfd8de; border-radius: 3pt; break-inside: avoid; }
.quelle blockquote { margin: 3pt 0 0; padding-left: 6pt; border-left: 1.5pt solid #cfd8de; font-size: 8.5pt; color: #33434f; }
.freigabe { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10mm; margin-top: 8mm; break-inside: avoid; }
.freigabe div { padding-top: 14mm; border-top: 0.75pt solid ${TINTE}; font-size: 8pt; color: ${GRAU}; }
.siegel { margin-top: 8pt; padding: 8pt 10pt; border: 1pt dashed ${PETROL}; border-radius: 4pt; break-inside: avoid; }
.siegel code { font: 8pt ui-monospace, Consolas, monospace; overflow-wrap: anywhere; }
.hinweis { margin-top: 10pt; font-size: 8pt; color: ${GRAU}; }
`;

function befundHtml(b: Befund, nr: number, belegeNachId: Map<string, Bericht["belege"][number]>, x: PdfTexte): string {
  const quellen = b.belege
    .map((id) => belegeNachId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => esc(q.fundstelle))
    .join(" &nbsp;|&nbsp; ");
  const nachweise = b.nachweise.map((n) => `${esc(n.quelle)}, SHA-256 ${esc(n.hash.slice(0, 12))}`).join("; ");
  const massnahmen = b.massnahmen.length
    ? `<ul class="massnahmen">${b.massnahmen.map((m) => `<li>${esc(m.schritt)} <span class="klein">(${esc(x.t(`rolle.${m.verantwortlich}`))}, ${esc(x.t(`frist.${FRIST[m.frist]}`))})</span></li>`).join("")}</ul>`
    : "";
  const warn = [b.ohneRechtsbeleg ? x.t("bericht.ohneRechtsbeleg") : "", b.ohneDaten ? x.t("bericht.ohneDaten") : ""].filter(Boolean).join(" ");
  return `<article class="befund" data-status="${b.status}">
  <div class="befund__kopf"><span class="nr">${String(nr).padStart(2, "0")}</span><span class="marke2">${esc(x.t(`status.${b.status}`))}</span>${b.schwere !== "keine" ? `<span class="marke2 neutral">${esc(x.t(`schwere.${b.schwere}`))}</span>` : ""}<span class="marke2 neutral">${esc(x.t(`bereich.${b.bereich}.name`))}</span></div>
  <h3>${esc(b.titel)}</h3>
  <p>${esc(b.befund)}</p>
  ${warn ? `<p class="klein"><em>${esc(warn)}</em></p>` : ""}
  ${quellen ? `<p class="quellen"><strong>${esc(x.p("quelle"))}:</strong> ${quellen}</p>` : ""}
  ${nachweise ? `<p class="klein">${esc(x.t("bericht.betriebsdaten"))}: ${nachweise}</p>` : ""}
  ${massnahmen}
</article>`;
}

/** Ring mit dem Reifegrad, als SVG (Umfang bei r=42: 263,9). */
function ringHtml(reife: number, farbe: string, x: PdfTexte): string {
  const voll = 263.9;
  return `<div class="deck__ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="#dde6ea" stroke-width="9"/><circle cx="50" cy="50" r="42" fill="none" stroke="${farbe}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${((reife / 100) * voll).toFixed(1)} ${voll}"/></svg><b style="color:${farbe}">${reife}<small>${esc(x.t("bericht.reife"))}</small></b></div>`;
}

const STUFE_FARBE = { bereit: "#17805a", luecken: "#b06a10", "nicht-bereit": "#b23a3a" } as const;

export function berichtAlsHtml(b: Bericht, x: PdfTexte): string {
  const nachId = new Map(b.belege.map((q) => [q.id, q]));
  const kz = b.kennzahlen;
  const farbe = STUFE_FARBE[kz.stufe];
  const plan = b.massnahmen;
  const bereichsnamen = b.bereiche.map((k) => x.t(`bereich.${k}.name`)).join(" · ");
  const datenquellen = new Set(b.befunde.flatMap((f) => f.nachweise.map((n) => n.quelle))).size;

  // Abschnitte in der Reihenfolge, in der sie im Dokument stehen; das Inhaltsverzeichnis auf dem Deckblatt folgt derselben Liste.
  const abschnitte = [
    x.p("abschnitt.zusammenfassung"),
    x.p("abschnitt.ergebnis"),
    ...(b.prioritaeten.length ? [x.t("bericht.prioritaeten")] : []),
    x.t("bericht.befunde"),
    ...(plan.length ? [x.t("bericht.massnahmen")] : []),
    x.p("abschnitt.methodik"),
    ...(b.belege.length ? [x.p("anhang")] : []),
    x.p("abschnitt.freigabe"),
    x.t("siegel.titel"),
  ];

  const zeilenBereich = b.bereiche
    .map((k) => {
      const f = b.befunde.filter((y) => y.bereich === k);
      const n = (s: string) => f.filter((y) => y.status === s).length;
      return `<tr><td>${esc(x.t(`bereich.${k}.name`))}</td><td class="zahl">${f.length}</td><td class="zahl">${n("verstoss")}</td><td class="zahl">${n("luecke")}</td><td class="zahl">${n("hinweis")}</td><td class="zahl">${n("konform")}</td></tr>`;
    })
    .join("");
  const zeilenPlan = plan
    .map(
      (m, i) =>
        `<tr><td class="zahl">${i + 1}</td><td>${esc(m.schritt)}<br><span class="klein">${esc(m.titel)}</span></td><td class="nb">${esc(x.t(`rolle.${m.verantwortlich}`))}</td><td class="nb">${esc(x.t(`frist.${FRIST[m.frist]}`))}</td><td class="nb">${m.schwere !== "keine" ? esc(x.t(`schwere.${m.schwere}`)) : ""}</td></tr>`,
    )
    .join("");
  const anhang = b.belege
    .map((q) => {
      const stufe = q.stufe !== null ? `${esc(x.p("stufe"))} ${q.stufe}` : "";
      const stand = q.gueltigAb ? `${esc(x.p("stand"))} ${esc(q.gueltigAb)}` : q.abgerufenAm ? `${esc(x.p("abgerufen"))} ${esc(q.abgerufenAm)}` : "";
      const text = q.text.replace(/^#{1,6}\s+/gm, "").replace(/\s+/g, " ").trim();
      return `<div class="quelle"><strong>${esc(q.fundstelle)}</strong><div class="klein">${[stufe, q.sprache ? q.sprache.toUpperCase() : "", stand].filter(Boolean).join(" &middot; ")}${q.url ? ` &middot; ${esc(q.url)}` : ""}</div><blockquote>${esc(text.length > 700 ? `${text.slice(0, 700)} ...` : text)}</blockquote></div>`;
    })
    .join("");
  const hinweise = [!b.vollstaendig ? x.t("bericht.unvollstaendig") : "", ...b.hinweise].filter(Boolean);
  const unterschrift = (rolle: string) => `<div>${esc(x.p("freigabe.unterschrift"))}: ${esc(rolle)}<br>${esc(x.p("freigabe.ort"))}</div>`;

  return `<!doctype html><html lang="${esc(b.sprache)}"><head><meta charset="utf-8"><title>${esc(pdfDateiname(b))}</title><style>${STIL(x, b)}</style></head><body>

<section class="deck">
  <div class="deck__band">
    <div class="deck__marke">${logoSvg(52)}<div><strong>DAMICON</strong><small>${esc(x.p("untertitel"))}</small></div></div>
    <span class="stempel">${esc(x.p("vertraulich"))}</span>
  </div>
  <div class="deck__linie"><i></i><i></i></div>
  <div class="deck__inhalt">
    <p class="deck__art">${esc(x.p("dokumentart"))}</p>
    <h1>${esc(x.p("titel"))}</h1>
    <p class="deck__sub">${esc(bereichsnamen)}</p>

    <div class="deck__reife">
      ${ringHtml(kz.reife, farbe, x)}
      <div>
        <strong style="color:${farbe}">${esc(x.t(`stufe.${kz.stufe}`))}</strong>
        <p>${esc(b.zusammenfassung)}</p>
        <div class="deck__zahlen"><span><b>${kz.nachStatus.verstoss}</b> ${esc(x.t("status.verstoss"))}</span><span><b>${kz.nachStatus.luecke}</b> ${esc(x.t("status.luecke"))}</span><span><b>${kz.nachStatus.hinweis}</b> ${esc(x.t("status.hinweis"))}</span><span><b>${kz.nachStatus.konform}</b> ${esc(x.t("status.konform"))}</span></div>
      </div>
    </div>

    <table class="deck__meta"><tbody>
      <tr><th>${esc(x.p("nummer"))}</th><td>${esc(b.id)}</td></tr>
      <tr><th>${esc(x.p("erstelltAm"))}</th><td>${esc(datum(b.erstelltAm, b.sprache))}</td></tr>
      <tr><th>${esc(x.p("ersteller"))}</th><td>${esc(b.ersteller.name)} (${esc(x.t(`rolle.${b.ersteller.rolle}`))})</td></tr>
      <tr><th>${esc(x.p("umfang"))}</th><td>${esc(x.p("umfangWert", { felder: b.befunde.length, quellen: b.belege.length, daten: datenquellen }))}</td></tr>
      <tr><th>${esc(x.t("siegel.modell"))}</th><td>${esc(b.modell)}</td></tr>
    </tbody></table>

    <div class="deck__inhaltsliste"><p class="deck__inhaltstitel">${esc(x.p("inhalt"))}</p><ol>${abschnitte.map((a) => `<li>${esc(a)}</li>`).join("")}</ol></div>
  </div>
  <div class="deck__fuss">${esc(x.p("siegelKurz"))}: <code>${esc(b.siegel.algorithmus)} ${esc(b.siegel.wert)}</code></div>
</section>

<main>
<h2>${esc(x.p("abschnitt.zusammenfassung"))}</h2>
<p class="lead">${esc(b.zusammenfassung)}</p>

<h2>${esc(x.p("abschnitt.ergebnis"))}</h2>
<table class="tabelle-bereich"><thead><tr><th>${esc(x.p("tabelle.bereich"))}</th><th class="zahl">${esc(x.p("tabelle.felder"))}</th><th class="zahl">${esc(x.t("status.verstoss"))}</th><th class="zahl">${esc(x.t("status.luecke"))}</th><th class="zahl">${esc(x.t("status.hinweis"))}</th><th class="zahl">${esc(x.t("status.konform"))}</th></tr></thead><tbody>${zeilenBereich}</tbody></table>
<div class="legende">
  <span style="--f:#b23a3a">${esc(x.p("legende.verstoss"))}</span>
  <span style="--f:#b06a10">${esc(x.p("legende.luecke"))}</span>
  <span style="--f:#5b7488">${esc(x.p("legende.hinweis"))}</span>
  <span style="--f:#17805a">${esc(x.p("legende.konform"))}</span>
  <span style="--f:${PETROL}">${esc(x.p("legende.stufen"))}</span>
</div>

${b.prioritaeten.length ? `<h2>${esc(x.t("bericht.prioritaeten"))}</h2><ol class="prio">${b.prioritaeten.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}

<h2>${esc(x.t("bericht.befunde"))}</h2>
${b.befunde.map((f, i) => befundHtml(f, i + 1, nachId, x)).join("")}

${plan.length ? `<h2>${esc(x.t("bericht.massnahmen"))}</h2><table><thead><tr><th class="zahl">#</th><th>${esc(x.p("massnahme"))}</th><th>${esc(x.p("verantwortlich"))}</th><th>${esc(x.p("frist"))}</th><th>${esc(x.p("prioritaet"))}</th></tr></thead><tbody>${zeilenPlan}</tbody></table>` : ""}

<h2>${esc(x.p("abschnitt.methodik"))}</h2>
<p>${esc(x.p("methodik.absatz1"))}</p>
<p>${esc(x.p("methodik.absatz2"))}</p>

${b.belege.length ? `<h2>${esc(x.p("anhang"))}</h2>${anhang}` : ""}

<h2>${esc(x.p("abschnitt.freigabe"))}</h2>
<p>${esc(x.p("freigabe.text"))}</p>
<div class="freigabe">${unterschrift(x.t("rolle.betriebsleitung"))}${unterschrift(x.t("rolle.buchhaltung"))}${unterschrift(x.p("freigabe.pruefer"))}</div>

<h2>${esc(x.t("siegel.titel"))}</h2>
<div class="siegel"><table><tbody>
<tr><td><strong>${esc(x.t("siegel.id"))}</strong></td><td><code>${esc(b.id)}</code></td></tr>
<tr><td><strong>${esc(x.t("siegel.erstellt"))}</strong></td><td>${esc(datum(b.erstelltAm, b.sprache))}, ${esc(b.ersteller.name)}</td></tr>
<tr><td><strong>${esc(x.t("siegel.modell"))}</strong></td><td>${esc(b.modell)}</td></tr>
<tr><td><strong>${esc(x.t("siegel.pruefsumme"))}</strong></td><td><code>${esc(b.siegel.algorithmus)} ${esc(b.siegel.wert)}</code></td></tr>
</tbody></table></div>
<p class="hinweis">${esc(x.p("verifikation"))}</p>
${hinweise.length ? `<p class="hinweis"><strong>${esc(x.t("bericht.hinweise"))}:</strong> ${hinweise.map(esc).join(" &middot; ")}</p>` : ""}
<p class="hinweis">${esc(x.p("haftung"))}</p>
<p class="hinweis">${esc(tag(b.erstelltAm, b.sprache))} &middot; Damicon</p>
</main>
</body></html>`;
}

/** Oeffnet das Druckfenster des Browsers fuer den Bericht (dort "Als PDF speichern"). Laeuft in einem unsichtbaren Rahmen, das Panel bleibt unberuehrt. */
export function berichtAlsPdfSpeichern(b: Bericht, x: PdfTexte): void {
  const rahmen = document.createElement("iframe");
  rahmen.setAttribute("aria-hidden", "true");
  rahmen.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(rahmen);
  const fenster = rahmen.contentWindow;
  const dokument = rahmen.contentDocument;
  if (!fenster || !dokument) {
    rahmen.remove();
    return;
  }
  const aufraeumen = () => window.setTimeout(() => rahmen.remove(), 500);
  dokument.open();
  dokument.write(berichtAlsHtml(b, x));
  dokument.close();
  fenster.addEventListener("afterprint", aufraeumen);
  // Schriften und Layout muessen fertig sein, bevor der Druckdialog Seitenzahl und Umbrueche berechnet.
  window.setTimeout(() => {
    fenster.focus();
    fenster.print();
  }, 250);
}
