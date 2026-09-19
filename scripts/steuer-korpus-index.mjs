// Erzeugt den Korpusindex aus den Frontmatter-Feldern aller Korpusdateien.
// Aufruf: node scripts/steuer-korpus-index.mjs

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const WURZEL = "docs/recherche/steuern/korpus";

async function sammeln(verzeichnis, treffer = []) {
  for (const e of await readdir(verzeichnis, { withFileTypes: true })) {
    const p = join(verzeichnis, e.name);
    if (e.isDirectory()) await sammeln(p, treffer);
    else if (e.name.endsWith(".md")) treffer.push(p);
  }
  return treffer;
}

function feld(fm, re) {
  const m = fm.match(re);
  return m ? m[1].trim().replace(/^"|"$/g, "") : "";
}

const pfade = await sammeln(WURZEL);
const nachStufe = {};
const nachSprache = {};
const nachBereich = {};
let ueberholt = 0;
let bytes = 0;

for (const p of pfade) {
  const text = await readFile(p, "utf8");
  const fm = text.split("---")[1] ?? "";
  const stufe = feld(fm, /autoritaetsstufe: (\d)/) || "unbekannt";
  const sprache = feld(fm, /sprache: (.*)/) || "unbekannt";
  const bereich = p.split(/[\\/]/)[4] ?? "wurzel";
  nachStufe[stufe] = (nachStufe[stufe] ?? 0) + 1;
  nachSprache[sprache] = (nachSprache[sprache] ?? 0) + 1;
  nachBereich[bereich] = (nachBereich[bereich] ?? 0) + 1;
  if (/ist_ueberholt: true/.test(fm)) ueberholt++;
  bytes += text.length;
}

const liste = (o) => Object.entries(o).sort().map(([k, v]) => `  ${k}: ${v}`);

const inhalt = [
  "# Korpusindex",
  "#",
  "# Erzeugt aus den Frontmatter-Feldern aller Korpusdateien.",
  "# Neu erzeugen mit: node scripts/steuer-korpus-index.mjs",
  "",
  `erzeugt_am: "${new Date().toISOString().slice(0, 10)}"`,
  `dateien: ${pfade.length}`,
  `groesse_mb: ${(bytes / 1048576).toFixed(1)}`,
  `als_ueberholt_markiert: ${ueberholt}`,
  "",
  "# 1 Primaerrecht, 2 untergesetzlich, 3 amtliche Erlaeuterung,",
  "# 4 Fachquelle, 5 Presse. Siehe quellenregister-schema.yaml.",
  "nach_autoritaetsstufe:",
  ...liste(nachStufe),
  "",
  "nach_sprache:",
  ...liste(nachSprache),
  "",
  "nach_bereich:",
  ...liste(nachBereich),
  "",
].join("\n");

await writeFile(join(WURZEL, "korpus-index.yaml"), inhalt, "utf8");
console.log(inhalt);
