// Tests fuer scripts/claude-regeln.mjs: Umwandlung applyTo -> paths, Schreiben in einem leeren Verzeichnis und
// am Ende die Pruefung, dass die Regeln unter .claude/rules/ zu .github/instructions/ passen. Kein Netzwerk.
// Aufruf: npm run test:claude-regeln
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { KENNZEICHEN, abweichungen, pfadeAus, regelAus, schreiben, zerlegen } from "../../scripts/claude-regeln.mjs";

let fehlgeschlagen = 0;
let gesamt = 0;
function check(name, bedingung, detail = "") {
  gesamt++;
  if (bedingung) console.log(`PASS  ${name}`);
  else {
    fehlgeschlagen++;
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}
const wirft = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

// --- Umwandlung ------------------------------------------------------------------
const quelle = `---\r\ndescription: Nur fuer Copilot\r\napplyTo: "**/*.tsx,**/*.ts, src/**/x.css"\r\n---\r\n# Titel\r\n\r\nText mit Ümlaut.\r\n\r\n`;
const regel = regelAus("beispiel.instructions.md", quelle);
check("pfadeAus: Liste mit Anfuehrungszeichen", JSON.stringify(pfadeAus(`"a,b , c"`)) === JSON.stringify(["a", "b", "c"]));
check("pfadeAus: ohne Anfuehrungszeichen", JSON.stringify(pfadeAus("**/*.ts")) === JSON.stringify(["**/*.ts"]));
check("pfadeAus: leer", pfadeAus(undefined).length === 0);
check("regelAus: beginnt mit paths-Frontmatter", regel.startsWith(`---\npaths:\n  - "**/*.tsx"\n  - "**/*.ts"\n  - "src/**/x.css"\n---\n`), regel);
check("regelAus: description entfaellt", !regel.includes("description:"));
check("regelAus: applyTo entfaellt", !regel.includes("applyTo"));
check("regelAus: Kennzeichen mit Quelle", regel.includes(`${KENNZEICHEN} aus .github/instructions/beispiel.instructions.md`));
check("regelAus: Rumpf unveraendert", regel.includes("# Titel\n\nText mit Ümlaut.\n"));
check("regelAus: nur LF, genau ein Zeilenende am Schluss", !regel.includes("\r") && regel.endsWith("Ümlaut.\n"));
check("regelAus: ohne applyTo wirft", wirft(() => regelAus("x.instructions.md", "---\ndescription: d\n---\nText\n")));
check("regelAus: ohne Frontmatter wirft", wirft(() => regelAus("x.instructions.md", "# Nur Text\n")));
check("zerlegen: Frontmatter-Felder", zerlegen("---\na: 1\nb: zwei\n---\nR").felder.get("b") === "zwei");

// --- Schreiben und Pruefen in einem leeren Verzeichnis ---------------------------------
const wurzel = mkdtempSync(join(tmpdir(), "claude-regeln-"));
try {
  const instructions = join(wurzel, ".github", "instructions");
  const rules = join(wurzel, ".claude", "rules");
  mkdirSync(instructions, { recursive: true });
  writeFileSync(join(instructions, "eins.instructions.md"), `---\napplyTo: "**/*.ts"\n---\nEins\n`);
  writeFileSync(join(instructions, "zwei.instructions.md"), `---\napplyTo: "**/*.css"\n---\nZwei\n`);
  writeFileSync(join(instructions, "notiz.md"), "keine Instruction\n");

  check("vorher: beide Regeln fehlen", abweichungen(wurzel).filter((f) => f.startsWith("fehlt")).length === 2, abweichungen(wurzel).join("; "));
  const erster = schreiben(wurzel);
  check("schreiben: zwei Dateien", erster.length === 2, erster.join("; "));
  check("schreiben: Dateiname ohne .instructions", existsSync(join(rules, "eins.md")) && existsSync(join(rules, "zwei.md")));
  check("schreiben: andere Markdown-Dateien bleiben aussen vor", !existsSync(join(rules, "notiz.md")));
  check("danach: keine Abweichung", abweichungen(wurzel).length === 0, abweichungen(wurzel).join("; "));
  check("zweiter Lauf: nichts zu tun", schreiben(wurzel).length === 0);

  writeFileSync(join(rules, "eins.md"), readFileSync(join(rules, "eins.md"), "utf8").replace(/\n/g, "\r\n"));
  check("CRLF nach dem Auschecken zaehlt nicht als Abweichung", abweichungen(wurzel).length === 0, abweichungen(wurzel).join("; "));

  writeFileSync(join(instructions, "eins.instructions.md"), `---\napplyTo: "**/*.ts"\n---\nEins, geaendert\n`);
  check("Quelle geaendert: veraltet", abweichungen(wurzel).some((f) => f === "veraltet: .claude/rules/eins.md" || f === "veraltet: .claude\\rules/eins.md"), abweichungen(wurzel).join("; "));

  writeFileSync(join(rules, "eigene.md"), "# Von Hand\n");
  rmSync(join(instructions, "zwei.instructions.md"));
  const funde = abweichungen(wurzel);
  check("Quelle entfernt: verwaist", funde.some((f) => f.includes("verwaist") && f.includes("zwei.md")), funde.join("; "));
  check("Regel ohne Kennzeichen gilt nicht als verwaist", !funde.some((f) => f.includes("eigene.md")));

  schreiben(wurzel);
  check("schreiben entfernt die verwaiste Kopie", !existsSync(join(rules, "zwei.md")));
  check("schreiben laesst die eigene Regel stehen", readFileSync(join(rules, "eigene.md"), "utf8") === "# Von Hand\n");
  check("nach dem Schreiben: aktuell", abweichungen(wurzel).length === 0, abweichungen(wurzel).join("; "));

  writeFileSync(join(instructions, "eigene.instructions.md"), `---\napplyTo: "**/*.md"\n---\nX\n`);
  check("schreiben ueberschreibt keine Regel ohne Kennzeichen", wirft(() => schreiben(wurzel)));
} finally {
  rmSync(wurzel, { recursive: true, force: true });
}

// --- Das Repository selbst -----------------------------------------------------------------
const repo = fileURLToPath(new URL("../..", import.meta.url));
const imRepo = abweichungen(repo);
check("Repository: .claude/rules passt zu .github/instructions (sonst npm run claude:regeln)", imRepo.length === 0, imRepo.join("; "));

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehlgeschlagen}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
