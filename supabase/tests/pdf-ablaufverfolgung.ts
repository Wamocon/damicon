// Regressionstest zum Fehler "jedes PDF laesst sich auf Vercel nicht lesen" (nach PR #144).
//
// Ursache: Auf Vercel besteht eine Funktion nur aus den Dateien, die die Ablaufverfolgung (@vercel/nft) im Code findet.
// PDF.js laedt seinen Worker ("./pdf.worker.mjs") und das native @napi-rs/canvas ueber berechnete Pfade; beides fehlte in
// der Funktion. Ohne canvas gibt es kein DOMMatrix: pdf.mjs bricht schon beim Import ab. Lokal ist alles in node_modules,
// deshalb fiel es erst in der Produktion auf.
//
// Dieser Test ohne Build prueft zweierlei:
//   * Bauanleitung: hochladen.ts laedt "pdf-parse/worker" VOR "pdf-parse" und setzt den Worker aus getData().
//   * Ablaufverfolgung: Die beiden Module, die der Upload (ueber diese festen Importe) einbindet, ziehen nft den Worker
//     und canvas nach. Das ist der Teil, der auf Vercel fehlte. Gegenprobe: das alte Muster (nur pdf-parse) tat es nicht.
// Nach einem Build prueft `npm run pruefe:pdf-ablaufverfolgung` dasselbe an den echten Ablaufverfolgungsdateien der Routen.
// Aufruf: npm run test:pdf-ablaufverfolgung (laeuft ueber tsx).

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { extrahiereText } from "@/lib/wissen/hochladen";

const require = createRequire(import.meta.url);
const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft") as {
  nodeFileTrace: (files: string[], opts: { base: string; processCwd: string }) => Promise<{ fileList: Set<string> }>;
};

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const gleich = (p: string) => p.replace(/\\/g, "/");

async function main() {
  const quelle = readFileSync("src/lib/wissen/hochladen.ts", "utf8");
  const iWorker = quelle.indexOf('import("pdf-parse/worker")');
  const iParse = quelle.indexOf('import("pdf-parse")');
  pruefe("Bauanleitung: hochladen.ts importiert pdf-parse/worker mit festem Namen (nft kann ihn verfolgen)", iWorker > 0);
  pruefe("Bauanleitung: pdf-parse/worker wird VOR pdf-parse geladen (canvas muss da sein, bevor pdf.mjs DOMMatrix braucht)", iWorker > 0 && iParse > iWorker);
  pruefe("Bauanleitung: der Worker kommt aus getData() (data:-URL, keine Datei noetig)", /PDFParse\.setWorker\(worker\.getData\(\)\)/.test(quelle));
  pruefe("Bauanleitung: pdf-parse wird nirgends sonst vor dem Worker geladen", quelle.split('import("pdf-parse")').length === 2 && !/from "pdf-parse"/.test(quelle));
  pruefe("Bauanleitung: ein Ladefehler ist 'pdfDienst' und wird nicht als 'lesen' (Datei kaputt) gemeldet", /new UploadFehler\("pdfDienst"/.test(quelle) && /instanceof UploadFehler\) throw ursache/.test(quelle));

  const next = readFileSync("next.config.ts", "utf8");
  pruefe("next.config.ts: pdf-parse bleibt ein externes Paket (wird nicht gebuendelt)", /serverExternalPackages:\s*\[[^\]]*"pdf-parse"/.test(next));

  const wurzel = process.cwd();
  const spur = async (dateien: string[]) => {
    const r = await nodeFileTrace(dateien, { base: wurzel, processCwd: wurzel });
    return new Set([...r.fileList].map(gleich));
  };
  const WORKER = "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";
  const CANVAS = "node_modules/@napi-rs/canvas/index.js";
  const hatBinaerdatei = (s: Set<string>) => [...s].some((p) => /^node_modules\/@napi-rs\/canvas-[^/]+\/.*\.node$/.test(p));

  const neu = await spur(["node_modules/pdf-parse/dist/worker/esm/index.js", "node_modules/pdf-parse/dist/pdf-parse/esm/index.js"]);
  pruefe("Ablaufverfolgung: pdf-parse/worker + pdf-parse ziehen den PDF.js-Worker (pdf.worker.mjs) nach", neu.has(WORKER));
  pruefe("Ablaufverfolgung: ... und @napi-rs/canvas (liefert DOMMatrix fuer pdf.mjs)", neu.has(CANVAS));
  pruefe("Ablaufverfolgung: ... samt nativer Binaerdatei fuer die Plattform dieses Rechners", hatBinaerdatei(neu), process.platform);

  const alt = await spur(["node_modules/pdf-parse/dist/pdf-parse/esm/index.js"]);
  const altOk = !alt.has(WORKER) && !alt.has(CANVAS);
  console.log(`${altOk ? "INFO" : "HINWEIS"}  Gegenprobe (altes Muster, nur pdf-parse): Worker ${alt.has(WORKER) ? "mitgezogen" : "FEHLT"}, canvas ${alt.has(CANVAS) ? "mitgezogen" : "FEHLT"}${altOk ? " (so war der Fehler auf Vercel)" : " (pdf-parse hat sein Verhalten geaendert, die Gegenprobe ist hinfaellig)"}`);

  // Echtes Parsen mit dem Lader des Uploads (gleicher Weg wie in der Funktion): ein gueltiges, selbst gebautes PDF.
  const strom = "BT /F1 12 Tf 72 720 Td (Testwort-Zebra-4711 im Regressionstest) Tj ET";
  const objekte = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${strom.length} >>\nstream\n${strom}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const versatz: number[] = [];
  objekte.forEach((o, i) => {
    versatz.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${versatz.map((v) => `${String(v).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const text = await extrahiereText(new TextEncoder().encode(pdf), "pdf");
  pruefe("Parsen: ein gueltiges PDF mit Textebene liefert seinen Text ueber den Lader des Uploads", /Testwort-Zebra-4711/.test(text), JSON.stringify(text.slice(0, 50)));
  pruefe("Parsen: der Worker kommt aus der data:-URL (PDF.js bekommt keinen Dateipfad)", String((globalThis as { pdfjs?: { GlobalWorkerOptions?: { workerSrc?: string } } }).pdfjs?.GlobalWorkerOptions?.workerSrc ?? "").startsWith("data:text/javascript"));

  for (const loc of ["de", "en", "ru", "kk"]) {
    const m = JSON.parse(readFileSync(`src/messages/${loc}.json`, "utf8")) as { aktionen: { fehler: Record<string, string> } };
    pruefe(`Texte ${loc}: Meldung "PDF-Leser nicht verfuegbar" ist vorhanden und unterscheidet sich von "Datei nicht lesbar"`, !!m.aktionen.fehler.wissenPdfDienst && m.aktionen.fehler.wissenPdfDienst !== m.aktionen.fehler.wissenLesen);
  }
  const aktion = readFileSync("src/lib/actions/wissen.ts", "utf8");
  pruefe("Action: der Code pdfDienst hat eine eigene Meldung", /pdfDienst: "fehler\.wissenPdfDienst"/.test(aktion));

  console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
  void pathToFileURL;
  if (fehler > 0) process.exit(1);
  console.log("Alle Pruefungen bestanden.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
