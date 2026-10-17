// PreToolUse-Hook fuer Claude Code: fragt nach, bevor ein Git-Befehl die Pruefungen umgeht oder nach main geht.
//
// Rueckfrage (der Befehl laeuft erst, wenn ein Mensch zustimmt):
//   - --no-verify, git commit -n, git -c core.hooksPath=..., git config core.hooksPath <wert>:
//     umgeht den pre-commit-Hook mit Geheimnis-Scanner, typecheck und lint (HOWTO.md, 1c)
//   - git push nach main: ausdruecklich (main, HEAD:main, refs/heads/main, --all, --mirror) oder ohne
//     Ziel bzw. mit HEAD, waehrend main ausgecheckt ist
//   - git merge, waehrend main ausgecheckt ist (auch nach git checkout/switch main im selben Befehl)
//   - gh pr create ohne --base oder mit --base main, gh pr merge
// Alles andere laeuft ohne Rueckfrage.
//
// Warum Rueckfrage statt Sperre: Der Notfall-Bypass aus HOWTO.md bleibt moeglich, aber nur mit Zustimmung.
// Und nicht alles gehoert nach main; sensible Unterlagen bleiben lokal. Das ist eine Leitplanke gegen
// Versehen, kein Sicherheitsrand: wer sie umgehen will, kann es.
//
// Protokoll: JSON auf stdin ({ tool_name, tool_input, cwd }); bei einem Treffer JSON mit
// permissionDecision "ask" auf stdout, Exitcode 0. Ohne Treffer keine Ausgabe.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HAUPTZWEIG = "main";

const UMGEHUNG =
  "Dieser Befehl umgeht den pre-commit-Hook (Geheimnis-Scanner, typecheck, lint). " +
  "Laut HOWTO.md, Abschnitt 1c, nur im Notfall und nie für echte Geheimnisse.";
const NACH_MAIN =
  "Nicht alles gehört nach main, sensible Unterlagen bleiben lokal. " +
  "Vor der Zustimmung prüfen, was mitgeht; Änderungen laufen sonst per Branch und Pull Request.";

/** Entfernt Heredoc-Texte und PowerShell-Here-Strings; ihr Inhalt ist Text, kein Befehl. */
function ohneTextbloecke(befehl) {
  return befehl
    .replace(/@'\r?\n[\s\S]*?\r?\n'@/g, "''")
    .replace(/@"\r?\n[\s\S]*?\r?\n"@/g, '""')
    .replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\s*\2\b/g, " ");
}

/**
 * Liest eine Zeichenkette ab text[start] (dort steht das oeffnende Zeichen) nach den Regeln der Shell.
 * Bash: in '...' kein Escape, in "..." maskiert \ nur $ ` " \ und Zeilenumbruch.
 * PowerShell: in '...' steht '' fuer ', in "..." maskiert ` jedes Zeichen und "" steht fuer ".
 * @returns {{ inhalt: string, ende: number }} ende = Index des schliessenden Zeichens
 */
function zeichenkette(text, start, powershell) {
  const zeichen = text[start];
  let inhalt = "";
  let j = start + 1;
  while (j < text.length) {
    const z = text[j];
    if (z === zeichen) {
      if (powershell && text[j + 1] === zeichen) {
        inhalt += zeichen;
        j += 2;
        continue;
      }
      return { inhalt, ende: j };
    }
    if (zeichen === '"' && powershell && z === "`" && j + 1 < text.length) {
      inhalt += text[j + 1];
      j += 2;
    } else if (zeichen === '"' && !powershell && z === "\\" && '$`"\\\n'.includes(text[j + 1] ?? "")) {
      inhalt += text[j + 1];
      j += 2;
    } else {
      inhalt += z;
      j++;
    }
  }
  return { inhalt, ende: text.length };
}

/**
 * Zerlegt einen Befehl in Abschnitte (getrennt durch && || ; | und Zeilenumbruch) und jeden Abschnitt in
 * Woerter. Anfuehrungszeichen halten ein Wort zusammen; zitiert markiert Woerter, die nur Werte sein
 * koennen (eine Commit-Meldung mit "--no-verify" ist keine Option). Escape-Zeichen ausserhalb von
 * Anfuehrungszeichen: \ in Bash, ` in PowerShell (dort ist \ ein gewoehnliches Pfadzeichen).
 * @returns {{ wert: string, zitiert: boolean }[][]}
 */
export function zerlegen(befehl, werkzeug = "Bash") {
  const powershell = werkzeug === "PowerShell";
  const escape = powershell ? "`" : "\\";
  const text = ohneTextbloecke(String(befehl ?? ""));
  const abschnitte = [];
  let woerter = [];
  let wert = "";
  let zitiert = false;
  let offen = false;
  const wortEnde = () => {
    if (offen) woerter.push({ wert, zitiert });
    wert = "";
    zitiert = false;
    offen = false;
  };
  const abschnittEnde = () => {
    wortEnde();
    if (woerter.length) abschnitte.push(woerter);
    woerter = [];
  };
  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    if (z === "'" || z === '"') {
      const { inhalt, ende } = zeichenkette(text, i, powershell);
      wert += inhalt;
      zitiert = true;
      offen = true;
      i = ende;
    } else if (z === escape && i + 1 < text.length) {
      if (text[i + 1] === "\n") wortEnde(); // Zeilenfortsetzung
      else {
        wert += text[i + 1];
        offen = true;
      }
      i++;
    } else if (z === "\n" || z === ";" || z === "|" || (z === "&" && text[i + 1] === "&")) {
      if (z === "&" || (z === "|" && text[i + 1] === "|")) i++;
      abschnittEnde();
    } else if (/\s/.test(z)) {
      wortEnde();
    } else {
      wert += z;
      offen = true;
    }
  }
  abschnittEnde();
  return abschnitte;
}

const VORSATZ = new Set(["&", ".", "sudo", "env", "command", "exec", "time", "nice", "nohup"]);

/** Index des aufgerufenen Programms: erstes Wort nach Vorsaetzen wie &, sudo, env und VAR=wert; sonst -1. */
function programmIndex(woerter) {
  let i = 0;
  while (i < woerter.length && !woerter[i].zitiert && (VORSATZ.has(woerter[i].wert.toLowerCase()) || /^[A-Za-z_]\w*=/.test(woerter[i].wert))) i++;
  return i < woerter.length ? i : -1;
}

/** true, wenn der Abschnitt das Programm name aufruft (auch mit Pfad oder .exe). Gibt dessen Index zurueck, sonst -1. */
function aufrufVon(woerter, name) {
  const i = programmIndex(woerter);
  return i !== -1 && new RegExp(`(^|[\\\\/])${name}(\\.exe)?$`, "i").test(woerter[i].wert) ? i : -1;
}

const istOption = (wort) => !wort.zitiert && wort.wert.startsWith("-");
const istNoVerify = (wert) => wert.length >= "--no-v".length && "--no-verify".startsWith(wert);

/** Ziel eines Refspecs ohne +, refs/heads/ und Quellteil. */
function zielVon(refspec) {
  const ohnePlus = refspec.replace(/^\+/, "");
  const ziel = ohnePlus.includes(":") ? ohnePlus.slice(ohnePlus.lastIndexOf(":") + 1) : ohnePlus;
  return ziel.replace(/^refs\/heads\//, "");
}

/** Git-Aufruf in einem Abschnitt: globale Optionen, Unterbefehl, Rest. */
function gitAufruf(woerter) {
  const start = aufrufVon(woerter, "git");
  if (start === -1) return null;
  const global = [];
  let i = start + 1;
  while (i < woerter.length && istOption(woerter[i])) {
    const opt = woerter[i].wert;
    global.push(woerter[i]);
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(opt) && i + 1 < woerter.length) {
      global.push(woerter[++i]);
    }
    i++;
  }
  if (i >= woerter.length) return null;
  const verzeichnisIndex = global.findIndex((w) => w.wert === "-C" && !w.zitiert);
  return {
    global,
    befehl: woerter[i].wert,
    rest: woerter.slice(i + 1),
    verzeichnis: verzeichnisIndex !== -1 ? global[verzeichnisIndex + 1]?.wert : undefined,
  };
}

function umgehtHooks(aufruf) {
  for (let i = 0; i < aufruf.global.length; i++) {
    const w = aufruf.global[i];
    if (w.zitiert) continue;
    if (w.wert === "-c" && /^core\.hookspath\s*=/i.test(aufruf.global[i + 1]?.wert ?? "")) return true;
    if (/^-ccore\.hookspath=/i.test(w.wert)) return true;
  }
  const optionen = aufruf.rest.filter(istOption).map((w) => w.wert);
  if (optionen.some(istNoVerify)) return true;
  if (aufruf.befehl === "commit" && optionen.some((o) => /^-[A-Za-z]*n[A-Za-z]*$/.test(o))) return true;
  if (aufruf.befehl === "config") {
    const schluessel = aufruf.rest.findIndex((w) => /^core\.hookspath$/i.test(w.wert));
    if (schluessel === -1) return false;
    const setzt = aufruf.rest.slice(schluessel + 1).some((w) => !istOption(w));
    const entfernt = optionen.some((o) => /^--(unset|unset-all|replace-all|add)$/.test(o));
    return setzt || entfernt;
  }
  return false;
}

const MIT_WERT = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);

/** true, wenn ein git push main trifft. zweig() liefert den ausgecheckten Branch (oder null). */
function pushNachMain(rest, zweig) {
  const optionen = new Set();
  const positionen = [];
  for (let i = 0; i < rest.length; i++) {
    if (istOption(rest[i])) {
      optionen.add(rest[i].wert);
      if (MIT_WERT.has(rest[i].wert)) i++;
    } else positionen.push(rest[i].wert);
  }
  if (optionen.has("--all") || optionen.has("--mirror")) return true;
  const refspecs = positionen.slice(1);
  if (refspecs.length === 0) return !optionen.has("--tags") && zweig() === HAUPTZWEIG;
  return refspecs.some((refspec) => {
    const ziel = zielVon(refspec);
    if (ziel === "HEAD" || ziel === "@" || ziel === "") return zweig() === HAUPTZWEIG;
    return ziel === HAUPTZWEIG;
  });
}

/** Branch, den git checkout/switch in diesem Abschnitt auscheckt, sonst undefined. */
function neuerZweig(aufruf) {
  if (aufruf.befehl !== "checkout" && aufruf.befehl !== "switch") return undefined;
  const neu = aufruf.rest.findIndex((w) => !w.zitiert && ["-b", "-B", "-c", "-C", "--create", "--force-create"].includes(w.wert));
  if (neu !== -1) return aufruf.rest[neu + 1]?.wert;
  if (aufruf.rest.some((w) => w.wert === "--")) return undefined;
  return aufruf.rest.find((w) => !istOption(w))?.wert;
}

function ghPrNachMain(woerter) {
  const start = aufrufVon(woerter, "gh");
  if (start === -1 || woerter[start + 1]?.wert !== "pr") return false;
  const befehl = woerter[start + 2]?.wert;
  if (befehl === "merge") return true;
  if (befehl !== "create") return false;
  const rest = woerter.slice(start + 3);
  for (let i = 0; i < rest.length; i++) {
    const w = rest[i].wert;
    if (w === "--base" || w === "-B") return (rest[i + 1]?.wert ?? "") === HAUPTZWEIG;
    if (w.startsWith("--base=")) return w.slice("--base=".length) === HAUPTZWEIG;
  }
  return true; // ohne --base nimmt gh den Standard-Branch, also main
}

const VERZEICHNISWECHSEL = new Set(["cd", "chdir", "pushd", "set-location", "sl"]);

/** Verzeichnis b relativ zu a (a darf fehlen). Absolute Pfade gelten unveraendert. */
const unter = (a, b) => (b === undefined ? a : a === undefined || /^([A-Za-z]:|[\\/~])/.test(b) ? b : `${a}/${b}`);

/**
 * @param {string} werkzeug  tool_name des Aufrufs
 * @param {{ command?: string } | undefined} eingabe  tool_input
 * @param {(verzeichnis?: string) => string | null} zweigVon  liefert den ausgecheckten Branch; verzeichnis
 *        ist relativ zum Arbeitsverzeichnis des Aufrufs oder absolut, undefined heisst dort selbst
 * @returns {string | null} Grund fuer die Rueckfrage oder null
 */
export function pruefe(werkzeug, eingabe, zweigVon = () => null) {
  if (werkzeug !== "Bash" && werkzeug !== "PowerShell") return null;
  /** @type {Map<string, string | null>} */
  const bekannt = new Map();
  let ausgecheckt; // nach git checkout/switch im selben Befehl
  let ort; // nach cd im selben Befehl
  for (const woerter of zerlegen(eingabe?.command, werkzeug)) {
    if (VERZEICHNISWECHSEL.has(woerter[0].wert.toLowerCase()) && woerter[1] && !istOption(woerter[1])) {
      ort = unter(ort, woerter[1].wert);
      ausgecheckt = undefined;
      continue;
    }
    if (ghPrNachMain(woerter)) return `Pull Request nach main über gh. ${NACH_MAIN}`;
    const aufruf = gitAufruf(woerter);
    if (!aufruf) continue;
    const verzeichnis = unter(ort, aufruf.verzeichnis);
    const zweig = () => {
      if (ausgecheckt !== undefined) return ausgecheckt;
      const schluessel = verzeichnis ?? "";
      if (!bekannt.has(schluessel)) bekannt.set(schluessel, zweigVon(verzeichnis));
      return bekannt.get(schluessel);
    };
    if (umgehtHooks(aufruf)) return UMGEHUNG;
    if (aufruf.befehl === "push" && pushNachMain(aufruf.rest, zweig)) return `Push nach main. ${NACH_MAIN}`;
    if (aufruf.befehl === "merge" && !aufruf.rest.some((w) => /^--(abort|continue|quit)$/.test(w.wert)) && zweig() === HAUPTZWEIG) {
      return `Merge in main. ${NACH_MAIN}`;
    }
    const neu = neuerZweig(aufruf);
    if (neu !== undefined) ausgecheckt = neu;
  }
  return null;
}

/** Ausgecheckter Branch in verzeichnis, null ausserhalb eines Repositorys. */
function aktuellerZweig(verzeichnis) {
  try {
    return execFileSync("git", ["-C", verzeichnis, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

/** JSON nur aus ASCII-Zeichen, damit Umlaute unabhaengig von der Codepage der Konsole ankommen. */
const alsAscii = (wert) => JSON.stringify(wert).replace(/[\u007f-￿]/g, (z) => `\\u${z.charCodeAt(0).toString(16).padStart(4, "0")}`);

function main() {
  let daten;
  try {
    daten = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return; // kein lesbarer Aufruf: nicht nachfragen
  }
  const basis = String(daten.cwd ?? process.cwd());
  const zweigVon = (verzeichnis) => aktuellerZweig(resolve(basis, (verzeichnis ?? ".").replace(/^~(?=[\\/]|$)/, homedir())));
  const grund = pruefe(String(daten.tool_name ?? ""), daten.tool_input, zweigVon);
  if (!grund) return;
  process.stdout.write(
    `${alsAscii({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `Git-Schutz: ${grund}`,
      },
    })}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
