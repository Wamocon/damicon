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
const PRUEF = /requirePermission\(|getSessionProfile\b|requireAal2Aktuell\(|auth\.getUser\(|verwaltungsProfil\(|sitzungFuerRoute\(/;

/** Bewusst ohne Anmeldung erreichbar, jeweils mit Grund. */
const OEFFENTLICH = new Map([
  ["src/app/[locale]/herkunft/actions.ts herkunftSuchen", "reiner Weiterleiter zur öffentlichen Herkunftsseite"],
  ["src/app/[locale]/login/actions.ts anmelden", "Anmeldung"],
  ["src/app/[locale]/login/actions.ts abmelden", "Abmeldung"],
  ["src/app/[locale]/login/mfa/actions.ts mfaAnmeldenBestaetigen", "zweiter Faktor der Anmeldung (Sitzung aus Schritt 1)"],
  ["src/lib/actions/einladungen.ts einladungEinloesen", "Einladungscode statt Anmeldung, Digest-Prüfung im Rumpf"],
  ["src/app/api/integrationen/ausliefern/route.ts GET", "Cron-Dienst ohne Sitzung: Bearer-Geheimnis CRON_SECRET, zeitkonstanter Vergleich, ohne Geheimnis 503"],
]);

function bloecke(text) {
  // grob: von "export async function NAME" bis zur nächsten Zeile "}" in Spalte 0
  const aus = [];
  for (const m of text.matchAll(/^export (?:async )?function (\w+)[\s\S]*?^\}/gm)) aus.push({ name: m[1], rumpf: m[0] });
  for (const m of text.matchAll(/^export const (\w+)\s*=\s*(?:async\s*)?\([\s\S]*?^\};?/gm)) aus.push({ name: m[1], rumpf: m[0] });
  return aus;
}

/** Ohne Kommentare, damit eine bloße Erwähnung (zum Beispiel "getSessionProfile" in einem Kommentar) nicht als Prüfung zählt. */
const ohneKommentare = (text) => text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const befunde = [];
let geprueft = 0;
for (const f of dateien) {
  const t = readFileSync(R + f, "utf8");
  // Die Direktive darf hinter einem Kopfkommentar stehen (in Next.js erlaubt): erst Kommentare und Leerraum am Anfang überspringen.
  const ohneKopf = t.replace(/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*/, "");
  const istAktion = /^["']use server["']/.test(ohneKopf);
  const istRoute = /\/route\.tsx?$/.test(f);
  // Sicherheitsnetz: Steht die Direktive als eigene Zeile in der Datei, wurde sie aber nicht als Dateikopf erkannt, lieber melden als übergehen.
  if (!istAktion && /^\s*["']use server["'];?\s*$/m.test(t)) {
    befunde.push(`${f}  ("use server" steht nicht als erste Anweisung, die Datei ist nicht prüfbar)`);
    continue;
  }
  if (!istAktion && !istRoute) continue;
  // Exportformen, die bloecke() nicht erfasst, wären still ungeprüft: melden.
  if (istAktion && /^export\s+(?:default\b|\{)/m.test(t)) befunde.push(`${f}  (export default oder export { ... }: nicht prüfbar, als export async function schreiben)`);
  if (istAktion && /^export\s+const\s+\w+\s*=\s*(?!async\b|\()/m.test(t)) befunde.push(`${f}  (export const x = andereFunktion: nicht prüfbar, als export async function schreiben)`);
  // Funktionen der Datei (auch exportierte Kern-Funktionen), die selbst prüfen
  const helfer = [...t.matchAll(/^(?:export )?(?:async )?function (\w+)[\s\S]*?^\}/gm)].filter((m) => PRUEF.test(ohneKommentare(m[0]))).map((m) => m[1]);
  const helferRe = helfer.length ? new RegExp(`\\b(${helfer.join("|")})\\(`) : null;
  for (const b of bloecke(t)) {
    if (istRoute && !/^(GET|POST|PUT|PATCH|DELETE)$/.test(b.name)) continue;
    geprueft++;
    if (OEFFENTLICH.has(`${f} ${b.name}`)) continue;
    const rumpf = ohneKommentare(b.rumpf);
    const ok = PRUEF.test(rumpf) || (helferRe && helferRe.test(rumpf));
    if (!ok) befunde.push(`${f}  ${b.name}`);
  }
}
console.log(`Geprüfte Server Actions und Route Handler: ${geprueft}, davon bewusst öffentlich: ${OEFFENTLICH.size}, ohne erkennbare Prüfung: ${befunde.length}`);
if (befunde.length > 0) {
  console.log(befunde.join("\n"));
  console.log("\nJede exportierte Funktion einer \"use server\"-Datei ist von außen aufrufbar. Prüfung ergänzen oder (bewusst öffentlich) in OEFFENTLICH eintragen.");
  process.exit(1);
}
