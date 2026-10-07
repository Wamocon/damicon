// Beweis, dass die Aenderungen an src/lib/wissen/sparse.ts und scripts/wissen-nach-supabase.ts (Admin-Upload, PR #144)
// die Ausgabe des ETL NICHT veraendern: sparse Vektoren und Wortgewichte fuer fuenf Proben (deutsch, russisch,
// gemischt, leer, sehr lang) sind Bit fuer Bit gleich der Ausgabe des Codes von origin/main. Die Vergleichswerte stehen in
// fixtures/wissen-sparse-golden.json (aus dem alten Code erzeugt), damit der Test ohne Git-Verlauf laeuft.
// Aufruf: npm run test:wissen-etl (laeuft ueber tsx).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { alsSparsevec, sparseDokument, sparseFrage, sparseIndex, sparsevecIndizes, tokens, wortgewichte } from "@/lib/wissen/sparse";
import { PROBEN } from "./fixtures/wissen-sparse-proben";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}
const sha = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

interface Golden {
  proben: { name: string; zeichen: number; tokens: number; woerter: number; dokument: string; frage: string; sparsevec: string; sparsevecLaenge: number; sparsevecVoll: string | null }[];
  gewichte: { n: number; woerter: number; sha: string; anfang: { hash: number; df: number; idf: number }[] };
}
const golden = JSON.parse(readFileSync("supabase/tests/fixtures/wissen-sparse-golden.json", "utf8")) as Golden;

pruefe("Proben: fuenf, in der Reihenfolge deutsch, russisch, gemischt, leer, sehr lang", PROBEN.map((p) => p.name).join() === "deutsch,russisch,gemischt,leer,sehr lang" && golden.proben.length === 5);

for (const [i, p] of PROBEN.entries()) {
  const g = golden.proben[i]!;
  const d = sparseDokument(p.text);
  const sv = alsSparsevec(d);
  pruefe(`${p.name}: Zeichen und Tokens wie im alten Code`, p.text.length === g.zeichen && tokens(p.text).length === g.tokens, `${g.zeichen} Zeichen, ${g.tokens} Tokens`);
  pruefe(`${p.name}: sparseDokument (Indizes und Gewichte) identisch`, sha(d) === g.dokument && d.indices.length === g.woerter, `${g.woerter} Woerter`);
  pruefe(`${p.name}: sparseFrage identisch`, sha(sparseFrage(p.text)) === g.frage);
  pruefe(`${p.name}: sparsevec-Text identisch (Hash und Laenge)`, createHash("sha256").update(sv).digest("hex") === g.sparsevec && sv.length === g.sparsevecLaenge, `${sv.length} Zeichen`);
  if (g.sparsevecVoll !== null) pruefe(`${p.name}: sparsevec-Text Zeichen fuer Zeichen identisch`, sv === g.sparsevecVoll);
  // Neue Hilfsfunktion: liest genau die Indizes zurueck, die alsSparsevec geschrieben hat
  const erwartet = [...new Set(d.indices.map(sparseIndex))].sort((a, b) => a - b);
  pruefe(`${p.name}: sparsevecIndizes liefert die geschriebenen Indizes zurueck`, sparsevecIndizes(sv).join() === erwartet.join());
}

// Wortgewichte: so, wie der ETL sie aus den Qdrant-Punkten bildet (Indizes mit sparseIndex abgebildet)
const listen = PROBEN.map((p) => sparseDokument(p.text).indices.map(sparseIndex));
const gewichte = wortgewichte(listen);
pruefe("Wortgewichte: Anzahl der Woerter wie im alten Code", gewichte.length === golden.gewichte.woerter, `${gewichte.length}`);
pruefe("Wortgewichte: df und idf je Wort in gleicher Reihenfolge identisch (Hash ueber alle)", sha(gewichte) === golden.gewichte.sha);
pruefe("Wortgewichte: die ersten 20 Eintraege stimmen mit dem alten Code ueberein", JSON.stringify(gewichte.slice(0, 20)) === JSON.stringify(golden.gewichte.anfang));
pruefe("Wortgewichte: ohne Textstellen entsteht nichts", wortgewichte([]).length === 0);

// Hochgeladene Textstellen (aus der Datenbank gelesen, schon abgebildet) zaehlen wie Qdrant-Punkte: drei aus Qdrant plus zwei
// "Uploads" ergeben dieselben Gewichte wie alle fuenf aus Qdrant.
const ausDb = PROBEN.slice(3).map((p) => sparsevecIndizes(alsSparsevec(sparseDokument(p.text))));
const gemischt = wortgewichte([...listen.slice(0, 3), ...ausDb]);
const gleich = (a: typeof gewichte, b: typeof gewichte) => a.length === b.length && sha([...a].sort((x, y) => x.hash - y.hash)) === sha([...b].sort((x, y) => x.hash - y.hash));
pruefe("Wortgewichte: 3 Qdrant-Punkte + 2 Upload-Zeilen = 5 Qdrant-Punkte (gleiche df, idf, N)", gleich(gemischt, gewichte));
pruefe("Wortgewichte: ohne Uploads (der heutige Fall) bleibt die ETL-Ausgabe, wie sie war", gewichte.length === golden.gewichte.woerter && sha(gewichte) === golden.gewichte.sha);

const etl = readFileSync("scripts/wissen-nach-supabase.ts", "utf8");
pruefe("ETL: berechnet die Gewichte ueber wortgewichte() aus sparse.ts, nicht mehr inline", /const begriffe = wortgewichte\(listen\)/.test(etl) && !/Math\.log\(1 \+/.test(etl));

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
if (fehler > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
