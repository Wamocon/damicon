// Tests fuer .claude/hooks/git-schutz.mjs (reine Logik) und fuer das Hook-Protokoll (JSON mit "ask" auf stdout).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pruefe, zerlegen } from "../../.claude/hooks/git-schutz.mjs";

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

/** Branch je Verzeichnis; ohne Eintrag gilt "auf". */
const zweige = (auf, je = {}) => (verzeichnis) => (verzeichnis === undefined ? auf : je[verzeichnis] ?? auf);
const auf = (zweig, werkzeug, befehl, je) => pruefe(werkzeug, { command: befehl }, zweige(zweig, je));
const frage = (name, befehl, zweig = "dev/x", werkzeug = "Bash", je) =>
  check(`Rueckfrage: ${name}`, auf(zweig, werkzeug, befehl, je) !== null, `${werkzeug}: ${befehl}`);
const frei = (name, befehl, zweig = "dev/x", werkzeug = "Bash", je) =>
  check(`frei: ${name}`, auf(zweig, werkzeug, befehl, je) === null, `${werkzeug}: ${befehl} -> ${auf(zweig, werkzeug, befehl, je)}`);

// --- Umgehen der Git-Hooks ----------------------------------------------------
frage("commit --no-verify", `git commit --no-verify -m "wip"`);
frage("commit mit abgekuerztem --no-verif", `git commit --no-verif -m "wip"`);
frage("commit -n", `git commit -n -m "wip"`);
frage("commit -nm", `git commit -nm "wip"`);
frage("push --no-verify", "git push --no-verify origin dev/x");
frage("merge --no-verify", "git merge --no-verify dev/y");
frage("-c core.hooksPath", "git -c core.hooksPath=/dev/null commit -m x");
frage("-c core.hooksPath in Anfuehrungszeichen", `git -c "core.hooksPath=/dev/null" commit -m x`);
frage("config core.hooksPath setzen", "git config core.hooksPath /tmp/leer");
frage("config --unset core.hooksPath", "git config --unset core.hooksPath");
frage("PowerShell: commit --no-verify", `git commit --no-verify -m 'wip'`, "dev/x", "PowerShell");
frage("nach && im zweiten Abschnitt", `git add -A && git commit --no-verify -m "x"`);
frei("config core.hooksPath nur lesen", "git config --get core.hooksPath");
frei("config core.hooksPath ohne Wert liest", "git config core.hooksPath");
frei("commit mit --no-edit", "git commit --amend --no-edit");
frei("Commit-Meldung nennt --no-verify nur", `git commit -m "docs: --no-verify nur im Notfall"`);
frei("Heredoc nennt --no-verify nur", "git commit -m \"$(cat <<'EOF'\nfix: kein --no-verify\nEOF\n)\"");
frei("PowerShell-Here-String nennt --no-verify nur", "git commit -m @'\nfix: kein --no-verify\n'@", "dev/x", "PowerShell");
frei("echo mit --no-verify", "echo git commit --no-verify");
frei("push -n ist ein Probelauf, kein Umgehen", "git push -n origin dev/x");

// --- Push nach main -------------------------------------------------------------
frage("push origin main", "git push origin main");
frage("push -u origin main", "git push -u origin main");
frage("push HEAD:main", "git push origin HEAD:main");
frage("push refs/heads/main", "git push origin dev/x:refs/heads/main");
frage("push +main (force)", "git push origin +main");
frage("push --force-with-lease origin main", "git push --force-with-lease origin main");
frage("main loeschen", "git push origin :main");
frage("push --all", "git push --all origin");
frage("push --mirror", "git push --mirror origin");
frage("push ohne Ziel auf main", "git push", "main");
frage("push origin ohne Ziel auf main", "git push origin", "main");
frage("push origin HEAD auf main", "git push origin HEAD", "main");
frage("PowerShell: push origin main", "git push origin main", "dev/x", "PowerShell");
frage("git -C mit Leerzeichen-Pfad auf main", `git -C "D:\\01 Antigrafity Projekte\\damicon" push`, "dev/x", "PowerShell", {
  "D:\\01 Antigrafity Projekte\\damicon": "main",
});
frage("cd in ein Repo auf main, dann push", `cd "D:/repo" && git push`, "dev/x", "Bash", { "D:/repo": "main" });
frage("checkout main, dann push", "git checkout main && git push");
frage("git.exe mit Pfad und Aufrufoperator", `& "C:\\Program Files\\Git\\cmd\\git.exe" push origin main`, "dev/x", "PowerShell");
frage("Umgebungsvariable vor git", "GIT_TRACE=1 git push origin main");
frei("git als Wort in einem anderen Befehl", "grep -rn git push origin main");
frei("push des eigenen Branches", "git push -u origin dev/wmoretz_claude-regeln");
frei("push ohne Ziel auf einem Branch", "git push", "dev/x");
frei("push HEAD auf einem Branch", "git push origin HEAD", "dev/x");
frei("push eines Branches, der main im Namen hat", "git push origin fix/main-menue");
frei("push --tags auf main", "git push --tags", "main");
frei("push mit -o-Wert main", "git push -o main origin dev/x");
frei("push vom Branch, obwohl ein anderes Repo auf main steht", `git -C "D:/anderes" status && git push`, "dev/x", "Bash", { "D:/anderes": "main" });
frei("Commit-Meldung nennt push origin main", `git commit -m "chore: git push origin main nur per PR"`);

// --- Merge und Pull Requests -----------------------------------------------------
frage("merge auf main", "git merge dev/x", "main");
frage("checkout main, dann merge", "git checkout main && git merge dev/x");
frage("gh pr create ohne --base", `gh pr create --title "x" --body "y"`);
frage("gh pr create --base main", "gh pr create --base main --fill");
frage("gh pr create --base=main", "gh pr create --base=main --fill");
frage("gh pr merge", "gh pr merge 12 --squash");
frei("merge auf einem Branch", "git merge origin/main", "dev/x");
frei("merge --abort auf main", "git merge --abort", "main");
frei("checkout -b vom main weg, dann merge", "git checkout -b dev/neu origin/main && git merge dev/x", "main");
frei("gh pr create gegen einen anderen Branch", "gh pr create --base dev/sammel --fill");
frei("gh pr view", "gh pr view 12");
frei("gh pr list", "gh pr list --state open");

// --- Andere Werkzeuge und Befehle --------------------------------------------------
check("frei: Read", pruefe("Read", { file_path: "x" }, () => "main") === null);
check("frei: Edit", pruefe("Edit", { file_path: "x" }, () => "main") === null);
frei("gewoehnliche Befehle auf main", "git status && git log --oneline -5 && npm run lint", "main");
frei("leerer Befehl", "", "main");
check("frei: fehlender command", pruefe("Bash", {}, () => "main") === null);

// --- Zerlegen ------------------------------------------------------------------------
const woerter = (befehl, werkzeug) => zerlegen(befehl, werkzeug).map((a) => a.map((w) => w.wert));
check("zerlegen: Abschnitte an && || ; |", JSON.stringify(woerter("a && b || c; d | e")) === JSON.stringify([["a"], ["b"], ["c"], ["d"], ["e"]]));
check("zerlegen: Bash-Escape im Wort", woerter("git -C a\\ b push")[0][2] === "a b");
check("zerlegen: PowerShell behaelt den Backslash im Pfad", woerter("git -C C:\\Users\\x push", "PowerShell")[0][2] === "C:\\Users\\x");
check("zerlegen: Bash maskiertes Anfuehrungszeichen", woerter(`echo "a \\" b"`)[0][1] === 'a " b');
check("zerlegen: PowerShell doppeltes Anfuehrungszeichen", woerter(`echo "a "" b"`, "PowerShell")[0][1] === 'a " b');
check("zerlegen: zitierte Woerter sind markiert", zerlegen(`git commit -m "--no-verify"`)[0][3].zitiert === true);

// --- Protokoll: Skript mit JSON auf stdin -----------------------------------------------
const skript = fileURLToPath(new URL("../../.claude/hooks/git-schutz.mjs", import.meta.url));
const aufrufen = (daten) => spawnSync(process.execPath, [skript], { input: JSON.stringify(daten), encoding: "utf8" });

const treffer = aufrufen({ tool_name: "PowerShell", tool_input: { command: "git commit --no-verify -m x" }, cwd: process.cwd() });
let ausgabe = null;
try {
  ausgabe = JSON.parse(treffer.stdout);
} catch {
  // bleibt null
}
check("Protokoll: Exitcode 0 bei Rueckfrage", treffer.status === 0, `status ${treffer.status}, stderr ${treffer.stderr}`);
check("Protokoll: permissionDecision ask", ausgabe?.hookSpecificOutput?.permissionDecision === "ask", treffer.stdout);
check("Protokoll: hookEventName PreToolUse", ausgabe?.hookSpecificOutput?.hookEventName === "PreToolUse");
check("Protokoll: Grund mit Umlauten", /für echte Geheimnisse/.test(ausgabe?.hookSpecificOutput?.permissionDecisionReason ?? ""));
check("Protokoll: Ausgabe nur ASCII", /^[\x00-\x7f]*$/.test(treffer.stdout));

const ohne = aufrufen({ tool_name: "Bash", tool_input: { command: "git status" }, cwd: process.cwd() });
check("Protokoll: ohne Treffer keine Ausgabe", ohne.status === 0 && ohne.stdout === "", `status ${ohne.status}, stdout ${ohne.stdout}`);
const kaputt = spawnSync(process.execPath, [skript], { input: "kein json", encoding: "utf8" });
check("Protokoll: unlesbare Eingabe fragt nicht nach", kaputt.status === 0 && kaputt.stdout === "");

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehlgeschlagen}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
