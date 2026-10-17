// Erzeugt die Regeln fuer Claude Code aus den Copilot-Instructions.
//
// Warum: Die projekteigenen Regeln stehen in .github/instructions/*.instructions.md im Copilot-Format
// (Frontmatter "applyTo"). Claude Code liest davon nichts: Es laedt Regeln aus .claude/rules/ und kennt
// statt "applyTo" das Feld "paths". Ohne Kopie arbeiten Copilot und Claude nach verschiedenen Regeln.
//
// Quelle bleibt .github/instructions/. Die Dateien unter .claude/rules/ entstehen nur hier und tragen
// eine Kennzeichnung; wer sie von Hand aendert, verliert die Aenderung beim naechsten Lauf. Dateien ohne
// Kennzeichnung (von Hand angelegte Regeln) fasst das Skript nicht an.
//
// Eine Instruction ohne "applyTo" bricht den Lauf ab. Claude wuerde sie ohne "paths" in jeder Sitzung
// laden, Copilot dagegen nur auf Zuruf. Das soll jemand bewusst entscheiden, nicht das Skript.
//
// Aufruf:  node scripts/claude-regeln.mjs            schreibt .claude/rules/
//          node scripts/claude-regeln.mjs --pruefen  meldet fehlende, veraltete und verwaiste Kopien (Exitcode 1)

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const QUELLE = join(".github", "instructions");
const ZIEL = join(".claude", "rules");
const ZIEL_ANZEIGE = ".claude/rules";
const ENDUNG = ".instructions.md";
export const KENNZEICHEN = "<!-- Erzeugt von scripts/claude-regeln.mjs";

const ohneCr = (text) => text.replace(/\r\n?/g, "\n");

/** Zerlegt eine Datei in Frontmatter-Felder (einfache "schluessel: wert"-Zeilen) und Rumpf. */
export function zerlegen(text) {
  const t = ohneCr(text);
  const treffer = /^---\n([\s\S]*?)\n---\n?/.exec(t);
  if (!treffer) return { felder: new Map(), rumpf: t };
  const felder = new Map();
  for (const zeile of treffer[1].split("\n")) {
    const feld = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(zeile);
    if (feld) felder.set(feld[1], feld[2].trim());
  }
  return { felder, rumpf: t.slice(treffer[0].length) };
}

/** "applyTo"-Wert ("a,b" mit oder ohne Anfuehrungszeichen) als Liste von Mustern. */
export function pfadeAus(applyTo) {
  return String(applyTo ?? "")
    .replace(/^(["'])([\s\S]*)\1$/, "$2")
    .split(",")
    .map((muster) => muster.trim())
    .filter(Boolean);
}

/** Inhalt der Claude-Regel zu einer Instruction. Wirft, wenn "applyTo" fehlt oder leer ist. */
export function regelAus(quellname, text) {
  const { felder, rumpf } = zerlegen(text);
  const pfade = pfadeAus(felder.get("applyTo"));
  if (pfade.length === 0) {
    throw new Error(`${quellname}: "applyTo" fehlt oder ist leer. Ohne Muster wuerde Claude die Regel in jeder Sitzung laden.`);
  }
  const kopf = ["---", "paths:", ...pfade.map((muster) => `  - ${JSON.stringify(muster)}`), "---"].join("\n");
  const hinweis =
    `${KENNZEICHEN} aus .github/instructions/${quellname}. ` +
    "Dort bearbeiten, dann npm run claude:regeln. Aenderungen hier gehen verloren. -->";
  return `${kopf}\n${hinweis}\n\n${rumpf.replace(/^\n+/, "").replace(/\s*$/, "")}\n`;
}

/** Map Zieldatei -> erwarteter Inhalt fuer alle Instructions unter wurzel. */
export function erwarteteRegeln(wurzel) {
  const ordner = join(wurzel, QUELLE);
  const regeln = new Map();
  if (!existsSync(ordner)) return regeln;
  for (const name of readdirSync(ordner).sort()) {
    if (!name.endsWith(ENDUNG)) continue;
    const ziel = `${name.slice(0, -ENDUNG.length)}.md`;
    regeln.set(ziel, regelAus(name, readFileSync(join(ordner, name), "utf8")));
  }
  return regeln;
}

/** Dateien unter .claude/rules/, die dieses Skript erzeugt hat. */
function erzeugteDateien(wurzel) {
  const ordner = join(wurzel, ZIEL);
  if (!existsSync(ordner)) return [];
  return readdirSync(ordner)
    .filter((name) => name.endsWith(".md"))
    .filter((name) => readFileSync(join(ordner, name), "utf8").includes(KENNZEICHEN))
    .sort();
}

/** @returns {string[]} Abweichungen zwischen Instructions und Claude-Regeln, leer wenn alles aktuell ist */
export function abweichungen(wurzel) {
  const erwartet = erwarteteRegeln(wurzel);
  const funde = [];
  for (const [name, inhalt] of erwartet) {
    const pfad = join(wurzel, ZIEL, name);
    if (!existsSync(pfad)) funde.push(`fehlt: ${ZIEL_ANZEIGE}/${name}`);
    else if (ohneCr(readFileSync(pfad, "utf8")) !== inhalt) funde.push(`veraltet: ${ZIEL_ANZEIGE}/${name}`);
  }
  for (const name of erzeugteDateien(wurzel)) {
    if (!erwartet.has(name)) funde.push(`verwaist: ${ZIEL_ANZEIGE}/${name} (Quelle gibt es nicht mehr)`);
  }
  return funde;
}

/** Schreibt alle Regeln neu und entfernt verwaiste Kopien. @returns {string[]} was geaendert wurde */
export function schreiben(wurzel) {
  const erwartet = erwarteteRegeln(wurzel);
  const ordner = join(wurzel, ZIEL);
  const geaendert = [];
  mkdirSync(ordner, { recursive: true });
  for (const [name, inhalt] of erwartet) {
    const pfad = join(ordner, name);
    if (existsSync(pfad)) {
      const vorhanden = readFileSync(pfad, "utf8");
      if (!vorhanden.includes(KENNZEICHEN)) {
        throw new Error(`${ZIEL_ANZEIGE}/${name} ist von Hand angelegt und wird nicht ueberschrieben. Datei umbenennen oder entfernen.`);
      }
      if (ohneCr(vorhanden) === inhalt) continue;
    }
    writeFileSync(pfad, inhalt);
    geaendert.push(`geschrieben: ${ZIEL_ANZEIGE}/${name}`);
  }
  for (const name of erzeugteDateien(wurzel)) {
    if (erwartet.has(name)) continue;
    rmSync(join(ordner, name));
    geaendert.push(`entfernt: ${ZIEL_ANZEIGE}/${name}`);
  }
  return geaendert;
}

function main() {
  const wurzel = fileURLToPath(new URL("..", import.meta.url));
  if (process.argv.includes("--pruefen")) {
    const funde = abweichungen(wurzel);
    if (funde.length === 0) {
      console.log("Claude-Regeln sind aktuell.");
      return;
    }
    for (const fund of funde) console.log(fund);
    console.log("\nBehebung: npm run claude:regeln");
    process.exit(1);
  }
  const geaendert = schreiben(wurzel);
  for (const zeile of geaendert) console.log(zeile);
  console.log(geaendert.length ? `${geaendert.length} Datei(en) geaendert.` : "Claude-Regeln waren schon aktuell.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
