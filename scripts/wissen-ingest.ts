// Liest Wissensdokumente in die Vektordatenbank ein (Qdrant).
//
//   npx tsx scripts/wissen-ingest.ts --wurzel <ordner> [Optionen]
//
// Optionen:
//   --wurzel <ordner>     Ordner mit .md-Dateien (Pflicht)
//   --bereiche a,b        nur diese obersten Unterordner (Standard: alle)
//   --bereich <name>      Bereichsname fuer ALLE Dateien (fuer Ordner ohne Unterstruktur)
//   --sprachen ru,de      nur Dokumente in diesen Sprachen (Standard: alle)
//   --sprache de          Sprache fuer Dateien ohne Frontmatter
//   --stufe 4             Autoritaetsstufe fuer Dateien ohne Frontmatter (1 Recht ... 5 Presse)
//   --limit N             hoechstens N Dokumente (zum Ausprobieren)
//   --batch 8             Texte je Einbettungsaufruf
//   --ersetzen            vorher alle Punkte der eingelesenen Bereiche loeschen (bei geaendertem Chunking)
//   --nur-zaehlen         nichts einbetten, nur Umfang und Dauer schaetzen
//
// Erneutes Ausfuehren ueberspringt, was schon drin ist (stabile IDs). Laeuft nur
// gegen die in QDRANT_URL / WISSEN_EMBED_URL genannten Dienste, Standard ist lokal.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { chunkiere, einbettungsText, erkenneSprache, parseDokument, type WissensChunk } from "../src/lib/wissen/chunker";
import { ollamaEinbettung } from "../src/lib/wissen/embed";
import { anzahl, loescheBereich, qdrantAusUmgebung, schreibePunkte, stelleSammlungSicher, vorhandeneIds } from "../src/lib/wissen/qdrant";
import { rollenFuerBereich } from "../src/lib/wissen/rollen";
import { sparseDokument } from "../src/lib/wissen/sparse";

function arg(name: string, standard?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? standard) : standard;
}
const hat = (name: string) => process.argv.includes(`--${name}`);

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    return statSync(p).isDirectory() ? dateien(p) : p.endsWith(".md") ? [p] : [];
  });
}

const wurzel = arg("wurzel");
if (!wurzel) {
  console.error("--wurzel <ordner> fehlt");
  process.exit(1);
}
const bereichFilter = arg("bereiche")?.split(",").map((b) => b.toLowerCase());
const bereichName = arg("bereich");
const sprachFilter = arg("sprachen")?.split(",");
const standardSprache = arg("sprache");
const standardStufe = arg("stufe") ? Number(arg("stufe")) : null;
const limit = arg("limit") ? Number(arg("limit")) : Infinity;
const batch = Number(arg("batch", "8"));

// ------------------------------------------------------------ Dokumente laden
const chunks: WissensChunk[] = [];
let dokumente = 0;
for (const datei of dateien(wurzel)) {
  if (dokumente >= limit) break;
  const pfad = relative(wurzel, datei).replace(/\\/g, "/");
  const dok = parseDokument(pfad, readFileSync(datei, "utf8"));
  // Ordnernamen klein schreiben: "Audit" und "audit" sollen derselbe Bereich sein (Filter, Rollen).
  dok.bereich = (bereichName ?? dok.bereich).toLowerCase();
  if (bereichFilter && !bereichFilter.includes(dok.bereich)) continue;
  // Dateien ohne Frontmatter: Angaben aus den Optionen und der ersten Ueberschrift.
    dok.meta.sprache ??= erkenneSprache(dok.text) ?? standardSprache ?? null;
    dok.meta.abgerufen_am ??= statSync(datei).mtime.toISOString().slice(0, 10);
  dok.meta.autoritaetsstufe ??= standardStufe;
  dok.meta.chunk_id ??= `${dok.bereich}/${pfad}`;
  dok.meta.quelle_id ??= dok.meta.chunk_id;
  dok.meta.titel ??= dok.text.match(/^#+\s+(.+)$/m)?.[1]?.trim() ?? null;
  if (sprachFilter && dok.meta.sprache && !sprachFilter.includes(dok.meta.sprache)) continue;
  dokumente += 1;
  chunks.push(...chunkiere(dok));
}

const nachBereich = new Map<string, number>();
for (const c of chunks) nachBereich.set(`${c.bereich}/${c.meta.sprache ?? "?"}`, (nachBereich.get(`${c.bereich}/${c.meta.sprache ?? "?"}`) ?? 0) + 1);
const zeichen = chunks.reduce((s, c) => s + c.text.length, 0);
console.log(`${dokumente} Dokumente -> ${chunks.length} Chunks, mittlere Laenge ${Math.round(zeichen / Math.max(1, chunks.length))} Zeichen`);
for (const [k, n] of [...nachBereich].sort()) console.log(`  ${k.padEnd(34)} ${n}`);

if (hat("nur-zaehlen")) {
  console.log(`Schaetzung bei 1,3 Chunks/s (lokale Grafikkarte): ${Math.round(chunks.length / 1.3 / 60)} Minuten`);
  process.exit(0);
}

async function einlesen(): Promise<void> {
  const verbindung = qdrantAusUmgebung();
  const einbettung = ollamaEinbettung();
  console.log(`Sammlung ${verbindung.sammlung} bei ${verbindung.url}, Modell ${einbettung.modell}`);
  console.log(`Sammlung: ${await stelleSammlungSicher(verbindung, einbettung.dimension)}`);

  if (hat("ersetzen")) {
    for (const bereich of new Set(chunks.map((c) => c.bereich))) {
      await loescheBereich(verbindung, bereich);
      console.log(`Bereich ${bereich}: bestehende Punkte geloescht`);
    }
  }

  const vorhanden = new Set<string>();
  for (let i = 0; i < chunks.length; i += 200) {
    for (const id of await vorhandeneIds(verbindung, chunks.slice(i, i + 200).map((c) => c.id))) vorhanden.add(id);
  }
  const offen = chunks.filter((c) => !vorhanden.has(c.id));
  console.log(`${vorhanden.size} schon vorhanden, ${offen.length} werden eingelesen`);

  const start = Date.now();
  let fertig = 0;
  for (let i = 0; i < offen.length; i += batch) {
    const teil = offen.slice(i, i + batch);
    const dichte = await einbettung.einbetten(teil.map(einbettungsText));
    await schreibePunkte(
      verbindung,
      teil.map((c, j) => ({
        id: c.id,
        dense: dichte[j]!,
        sparse: sparseDokument(einbettungsText(c)),
        payload: {
          ...c.meta,
          pfad: c.pfad,
          bereich: c.bereich,
          teil: c.teil,
          teile: c.teile,
          kontext: c.kontext,
          text: c.text,
          rollen: rollenFuerBereich(c.bereich),
          eingelesen_am: new Date().toISOString().slice(0, 10),
          embed_modell: einbettung.modell,
        },
      })),
    );
    fertig += teil.length;
    if ((i / batch) % 5 === 0 || fertig === offen.length) {
      const s = (Date.now() - start) / 1000;
      const rate = fertig / s;
      console.log(`  ${fertig}/${offen.length}  ${rate.toFixed(2)} Chunks/s  Rest ca. ${Math.round((offen.length - fertig) / rate / 60)} min`);
    }
  }
  console.log(`fertig: ${await anzahl(verbindung)} Punkte in ${verbindung.sammlung}`);
}

einlesen().catch((fehler) => {
  console.error(fehler);
  process.exit(1);
});
