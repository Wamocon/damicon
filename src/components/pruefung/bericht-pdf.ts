import type { Befund, Bericht } from "@/lib/pruefung/typen";

// Der Pruefbericht als Dokument zum Weitergeben (Behoerden, Steuerberater, Pruefer): eine A4-Seite je Abschnitt
// gegliedert, mit Kopf, Reifegrad, Zusammenfassung, Befunden samt Rechtsquellen, Massnahmenplan, Anhang mit dem
// Wortlaut der zitierten Rechtstexte (auch Russisch) und dem Siegel. Der Browser macht daraus ueber "Drucken"
// eine PDF-Datei; das Dokument traegt dafuer einen sinnvollen Titel, der als Dateiname vorgeschlagen wird.
// Bewusst kein PDF-Baukasten: der Browser bringt Schriften fuer Kyrillisch und Kasachisch mit, ein Baukasten
// muesste eine Schrift von rund 500 KB mitliefern und den Zeilenumbruch selbst nachbauen.

type Uebersetze = (schluessel: string, werte?: Record<string, string | number>) => string;

export interface PdfTexte {
  /** Namensraum "pruefung" */
  t: Uebersetze;
  /** Namensraum "pruefungPdf" */
  p: Uebersetze;
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FRIST: Record<string, string> = { sofort: "sofort", "7 Tage": "tage7", "30 Tage": "tage30", "90 Tage": "tage90" };

function datum(iso: string, sprache: string): string {
  try {
    return new Date(iso).toLocaleString(sprache, { dateStyle: "long", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/** Dateiname ohne Sonderzeichen, aus Berichtsnummer und Datum. */
export function pdfDateiname(b: Bericht): string {
  return `Compliance-Pruefbericht-${b.erstelltAm.slice(0, 10)}-${b.id.slice(0, 8)}`;
}

const STIL = `
@page { size: A4; margin: 16mm 14mm 18mm; @bottom-center { content: counter(page) " / " counter(pages); font: 8pt system-ui, sans-serif; color: #666; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 10pt/1.45 "Segoe UI", system-ui, -apple-system, Arial, sans-serif; color: #14212b; }
h1 { margin: 0; font-size: 20pt; letter-spacing: -0.01em; }
h2 { margin: 18pt 0 6pt; padding-bottom: 3pt; border-bottom: 1.5pt solid #00768f; font-size: 12pt; color: #00768f; break-after: avoid; }
h3 { margin: 0 0 3pt; font-size: 10.5pt; }
p { margin: 0 0 5pt; }
.kopf { display: flex; justify-content: space-between; align-items: flex-end; gap: 12pt; padding-bottom: 8pt; border-bottom: 2pt solid #00768f; }
.marke { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #00768f; }
.meta { font-size: 8.5pt; color: #4a5a66; text-align: right; }
.reife { display: grid; grid-template-columns: auto 1fr; gap: 14pt; align-items: center; margin-top: 12pt; padding: 10pt 12pt; border: 1pt solid #cfd8de; border-radius: 6pt; }
.reife__zahl { font-size: 30pt; font-weight: 800; line-height: 1; text-align: center; }
.reife__zahl small { display: block; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #4a5a66; }
.reife[data-stufe="bereit"] .reife__zahl, .reife[data-stufe="bereit"] strong { color: #17805a; }
.reife[data-stufe="luecken"] .reife__zahl, .reife[data-stufe="luecken"] strong { color: #b06a10; }
.reife[data-stufe="nicht-bereit"] .reife__zahl, .reife[data-stufe="nicht-bereit"] strong { color: #b23a3a; }
.zahlen { margin-top: 5pt; font-size: 8.5pt; color: #4a5a66; }
.zahlen span { margin-right: 10pt; }
ol.prio { margin: 0; padding-left: 16pt; }
ol.prio li { margin-bottom: 3pt; font-weight: 600; }
.befund { margin: 0 0 8pt; padding: 7pt 9pt; border: 1pt solid #cfd8de; border-left: 3.5pt solid var(--f, #5b7488); border-radius: 4pt; break-inside: avoid; }
.befund[data-status="verstoss"] { --f: #b23a3a; }
.befund[data-status="luecke"] { --f: #b06a10; }
.befund[data-status="hinweis"] { --f: #5b7488; }
.befund[data-status="konform"] { --f: #17805a; }
.marken { margin-bottom: 3pt; font-size: 8pt; }
.marke2 { display: inline-block; margin-right: 4pt; padding: 0 5pt; border: 0.75pt solid currentColor; border-radius: 8pt; font-weight: 700; color: var(--f); }
.marke2.neutral { color: #4a5a66; }
.klein { font-size: 8.5pt; color: #4a5a66; }
.quellen { margin-top: 3pt; font-size: 8.5pt; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th { text-align: left; padding: 4pt 6pt; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; color: #4a5a66; border-bottom: 1pt solid #cfd8de; }
td { padding: 4pt 6pt; vertical-align: top; border-bottom: 0.5pt solid #e1e7eb; }
tr { break-inside: avoid; }
.quelle { margin: 0 0 7pt; padding: 6pt 8pt; border: 0.75pt solid #cfd8de; border-radius: 4pt; break-inside: avoid; }
.quelle blockquote { margin: 3pt 0 0; padding-left: 6pt; border-left: 1.5pt solid #cfd8de; font-size: 8.5pt; color: #33434f; }
.siegel { margin-top: 10pt; padding: 8pt 10pt; border: 1pt dashed #00768f; border-radius: 5pt; break-inside: avoid; }
.siegel code { font: 8pt ui-monospace, Consolas, monospace; overflow-wrap: anywhere; }
.hinweis { margin-top: 10pt; font-size: 8pt; color: #4a5a66; }
`;

function befundHtml(b: Befund, belegeNachId: Map<string, Bericht["belege"][number]>, x: PdfTexte): string {
  const quellen = b.belege
    .map((id) => belegeNachId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => `${esc(q.id)}: ${esc(q.fundstelle)}`)
    .join(" &nbsp;|&nbsp; ");
  const nachweise = b.nachweise.map((n) => `${esc(n.quelle)}, SHA-256 ${esc(n.hash.slice(0, 12))}`).join("; ");
  const massnahmen = b.massnahmen.length
    ? `<ul style="margin:3pt 0 0;padding-left:14pt">${b.massnahmen
        .map((m) => `<li>${esc(m.schritt)} <span class="klein">(${esc(x.t(`rolle.${m.verantwortlich}`))}, ${esc(x.t(`frist.${FRIST[m.frist]}`))})</span></li>`)
        .join("")}</ul>`
    : "";
  const warn = [b.ohneRechtsbeleg ? x.t("bericht.ohneRechtsbeleg") : "", b.ohneDaten ? x.t("bericht.ohneDaten") : ""].filter(Boolean).join(" ");
  return `<article class="befund" data-status="${b.status}">
  <div class="marken"><span class="marke2">${esc(x.t(`status.${b.status}`))}</span>${b.schwere !== "keine" ? `<span class="marke2 neutral">${esc(x.t(`schwere.${b.schwere}`))}</span>` : ""}<span class="marke2 neutral">${esc(x.t(`bereich.${b.bereich}.name`))}</span></div>
  <h3>${esc(b.titel)}</h3>
  <p>${esc(b.befund)}</p>
  ${warn ? `<p class="klein"><em>${esc(warn)}</em></p>` : ""}
  ${quellen ? `<p class="quellen"><strong>${esc(x.p("quelle"))}:</strong> ${quellen}</p>` : ""}
  ${nachweise ? `<p class="klein">${esc(x.t("bericht.betriebsdaten"))}: ${nachweise}</p>` : ""}
  ${massnahmen}
</article>`;
}

export function berichtAlsHtml(b: Bericht, x: PdfTexte): string {
  const nachId = new Map(b.belege.map((q) => [q.id, q]));
  const kz = b.kennzahlen;
  const plan = b.massnahmen;
  const zeilenPlan = plan
    .map((m) => `<tr><td>${esc(m.schritt)}<br><span class="klein">${esc(m.titel)}</span></td><td>${esc(x.t(`rolle.${m.verantwortlich}`))}</td><td>${esc(x.t(`frist.${FRIST[m.frist]}`))}</td></tr>`)
    .join("");
  const anhang = b.belege
    .map((q) => {
      const stufe = q.stufe !== null ? `${esc(x.p("stufe"))} ${q.stufe}` : "";
      const stand = q.gueltigAb ? `${esc(x.p("stand"))} ${esc(q.gueltigAb)}` : q.abgerufenAm ? `${esc(x.p("abgerufen"))} ${esc(q.abgerufenAm)}` : "";
      const text = q.text.replace(/^#{1,6}\s+/gm, "").replace(/\s+/g, " ").trim();
      return `<div class="quelle"><strong>${esc(q.id)}: ${esc(q.fundstelle)}</strong><div class="klein">${[stufe, q.sprache ? q.sprache.toUpperCase() : "", stand].filter(Boolean).join(" &middot; ")}${q.url ? ` &middot; ${esc(q.url)}` : ""}</div><blockquote>${esc(text.length > 700 ? `${text.slice(0, 700)} ...` : text)}</blockquote></div>`;
    })
    .join("");
  const hinweise = [!b.vollstaendig ? x.t("bericht.unvollstaendig") : "", ...b.hinweise].filter(Boolean);
  return `<!doctype html><html lang="${esc(b.sprache)}"><head><meta charset="utf-8"><title>${esc(pdfDateiname(b))}</title><style>${STIL}</style></head><body>
<div class="kopf"><div><div class="marke">Damicon</div><h1>${esc(x.p("titel"))}</h1></div><div class="meta">${esc(datum(b.erstelltAm, b.sprache))}<br>${esc(b.ersteller.name)} (${esc(x.t(`rolle.${b.ersteller.rolle}`))})<br>${esc(x.t("siegel.id"))}: ${esc(b.id.slice(0, 8))}</div></div>

<div class="reife" data-stufe="${kz.stufe}"><div class="reife__zahl">${kz.reife}<small>${esc(x.t("bericht.reife"))}</small></div><div><strong style="font-size:13pt">${esc(x.t(`stufe.${kz.stufe}`))}</strong><p style="margin-top:3pt">${esc(b.zusammenfassung)}</p>
<div class="zahlen"><span>${kz.nachStatus.verstoss} ${esc(x.t("status.verstoss"))}</span><span>${kz.nachStatus.luecke} ${esc(x.t("status.luecke"))}</span><span>${kz.nachStatus.hinweis} ${esc(x.t("status.hinweis"))}</span><span>${kz.nachStatus.konform} ${esc(x.t("status.konform"))}</span></div></div></div>

${b.prioritaeten.length ? `<h2>${esc(x.t("bericht.prioritaeten"))}</h2><ol class="prio">${b.prioritaeten.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}

<h2>${esc(x.t("bericht.befunde"))}</h2>
${b.befunde.map((f) => befundHtml(f, nachId, x)).join("")}

${plan.length ? `<h2>${esc(x.t("bericht.massnahmen"))}</h2><table><thead><tr><th>${esc(x.p("massnahme"))}</th><th>${esc(x.p("verantwortlich"))}</th><th>${esc(x.p("frist"))}</th></tr></thead><tbody>${zeilenPlan}</tbody></table>` : ""}

${b.belege.length ? `<h2>${esc(x.p("anhang"))}</h2>${anhang}` : ""}

<h2>${esc(x.t("siegel.titel"))}</h2>
<div class="siegel"><table><tbody>
<tr><td><strong>${esc(x.t("siegel.id"))}</strong></td><td><code>${esc(b.id)}</code></td></tr>
<tr><td><strong>${esc(x.t("siegel.erstellt"))}</strong></td><td>${esc(datum(b.erstelltAm, b.sprache))}, ${esc(b.ersteller.name)}</td></tr>
<tr><td><strong>${esc(x.t("siegel.modell"))}</strong></td><td>${esc(b.modell)}</td></tr>
<tr><td><strong>${esc(x.t("siegel.pruefsumme"))}</strong></td><td><code>${esc(b.siegel.algorithmus)} ${esc(b.siegel.wert)}</code></td></tr>
</tbody></table></div>
${hinweise.length ? `<p class="hinweis"><strong>${esc(x.t("bericht.hinweise"))}:</strong> ${hinweise.map(esc).join(" &middot; ")}</p>` : ""}
<p class="hinweis">${esc(x.p("haftung"))}</p>
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
