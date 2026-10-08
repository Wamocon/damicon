// Nach `next build`: Pruefen, dass JEDE Route, die pdf-parse einbindet, auch den PDF.js-Worker und @napi-rs/canvas
// in ihrer Ablaufverfolgung (.nft.json) hat, also in der Vercel-Funktion mitgeliefert wird. Fehlt eines, scheitert jedes
// PDF im Wissens-Upload in der Produktion, obwohl es lokal geht (siehe supabase/tests/pdf-ablaufverfolgung.ts).
//   npm run build && npm run pruefe:pdf-ablaufverfolgung
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const wurzel = ".next/server";
if (!existsSync(wurzel)) {
  console.error("Kein .next/server gefunden: zuerst `npm run build`.");
  process.exit(2);
}
const dateien = [];
(function suche(ordner) {
  for (const n of readdirSync(ordner)) {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) suche(p);
    else if (n.endsWith(".nft.json")) dateien.push(p);
  }
})(wurzel);

const norm = (s) => s.replaceAll("\\", "/");
let betroffen = 0;
const fehlt = [];
for (const d of dateien) {
  const j = JSON.parse(readFileSync(d, "utf8"));
  const liste = j.files.map(norm);
  if (!liste.some((f) => /node_modules\/pdf-parse(\/|-)/.test(f))) continue;
  betroffen++;
  const hat = (muster) => liste.some((f) => muster.test(f));
  const probleme = [];
  if (!hat(/node_modules\/pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs$/)) probleme.push("pdf.worker.mjs");
  if (!hat(/node_modules\/@napi-rs\/canvas\/index\.js$/)) probleme.push("@napi-rs/canvas");
  if (!hat(/node_modules\/@napi-rs\/canvas-[^/]+\/.*\.node$/)) probleme.push("canvas-Binaerdatei der Plattform");
  if (probleme.length) fehlt.push(`${d}: fehlt ${probleme.join(", ")}`);
}
console.log(`${betroffen} Routen binden pdf-parse ein, ${fehlt.length} davon unvollstaendig.`);
if (betroffen === 0) {
  console.error("FEHLER: keine Route mit pdf-parse gefunden (Pruefung wirkungslos).");
  process.exit(1);
}
for (const f of fehlt) console.error(`FEHLER ${f}`);
process.exit(fehlt.length ? 1 : 0);
