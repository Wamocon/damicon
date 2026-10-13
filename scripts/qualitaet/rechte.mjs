// Prüft jede exportierte Funktion in "use server"-Dateien und jeden Route Handler: Steht eine Rechte- oder Anmeldeprüfung im Rumpf, direkt oder
// über einen Helfer derselben Datei, der sie aufruft? Eine exportierte Funktion einer "use server"-Datei ist von außen aufrufbar, auch wenn die
// Oberfläche sie nicht anbietet: Ohne Prüfung ist sie offen.
//
// Entstanden beim WMC-Vibecode-Cleanup vom 13.10.2026 (docs/cleanup-2026-10-13.md). Eine Heuristik, kein Beweis: Sie erkennt die Prüfung an
// bekannten Aufrufen. Wer einen neuen Prüfhelfer einführt, trägt ihn in PRUEF ein; wer bewusst eine öffentliche Aktion baut (Anmeldung,
// Einladung), trägt sie mit Begründung in OEFFENTLICH ein.
// Aufruf: npm run test:rechte (Teil von npm test). Endet mit 1, wenn eine Aktion ohne erkennbare Prüfung gefunden wird.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const R = process.cwd().split("\\").join("/") + "/";
const dateien = execSync("git ls-files src", { cwd: R, encoding: "utf8" }).split("\n").filter((f) => /\.(tsx?)$/.test(f));

/** Aufrufe, an denen eine Prüfung erkennbar ist (getSessionProfile auch ohne Klammern: als Abhängigkeit übergeben). */
const PRUEF = /requirePermission\(|getSessionProfile\b|requireAal2Aktuell\(|auth\.getUser\(|verwaltungsProfil\(/;

/** Bewusst ohne Anmeldung erreichbar, jeweils mit Grund. */
const OEFFENTLICH = new Map([
  ["src/app/[locale]/herkunft/actions.ts herkunftSuchen", "reiner Weiterleiter zur öffentlichen Herkunftsseite"],
  ["src/app/[locale]/login/actions.ts anmelden", "Anmeldung"],
  ["src/app/[locale]/login/actions.ts abmelden", "Abmeldung"],
  ["src/app/[locale]/login/mfa/actions.ts mfaAnmeldenBestaetigen", "zweiter Faktor der Anmeldung (Sitzung aus Schritt 1)"],
  ["src/lib/actions/einladungen.ts einladungEinloesen", "Einladungscode statt Anmeldung, Digest-Prüfung im Rumpf"],
]);

function bloecke(text) {
  // grob: von "export async function NAME" bis zur nächsten Zeile "}" in Spalte 0
  const aus = [];
  for (const m of text.matchAll(/^export (?:async )?function (\w+)[\s\S]*?^\}/gm)) aus.push({ name: m[1], rumpf: m[0] });
  for (const m of text.matchAll(/^export const (\w+)\s*=\s*(?:async\s*)?\([\s\S]*?^\};?/gm)) aus.push({ name: m[1], rumpf: m[0] });
  return aus;
}

const befunde = [];
let geprueft = 0;
for (const f of dateien) {
  const t = readFileSync(R + f, "utf8");
  const istAktion = /^\s*["']use server["']/.test(t);
  const istRoute = /\/route\.tsx?$/.test(f);
  if (!istAktion && !istRoute) continue;
  // Funktionen der Datei (auch exportierte Kern-Funktionen), die selbst prüfen
  const helfer = [...t.matchAll(/^(?:export )?(?:async )?function (\w+)[\s\S]*?^\}/gm)].filter((m) => PRUEF.test(m[0])).map((m) => m[1]);
  const helferRe = helfer.length ? new RegExp(`\\b(${helfer.join("|")})\\(`) : null;
  for (const b of bloecke(t)) {
    if (istRoute && !/^(GET|POST|PUT|PATCH|DELETE)$/.test(b.name)) continue;
    geprueft++;
    if (OEFFENTLICH.has(`${f} ${b.name}`)) continue;
    const ok = PRUEF.test(b.rumpf) || (helferRe && helferRe.test(b.rumpf));
    if (!ok) befunde.push(`${f}  ${b.name}`);
  }
}
console.log(`Geprüfte Server Actions und Route Handler: ${geprueft}, davon bewusst öffentlich: ${OEFFENTLICH.size}, ohne erkennbare Prüfung: ${befunde.length}`);
if (befunde.length > 0) {
  console.log(befunde.join("\n"));
  console.log("\nJede exportierte Funktion einer \"use server\"-Datei ist von außen aufrufbar. Prüfung ergänzen oder (bewusst öffentlich) in OEFFENTLICH eintragen.");
  process.exit(1);
}
