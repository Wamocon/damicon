import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// Jeder Textschluessel, den der Code aufruft, muss in src/messages/de.json stehen.
//
// Fehlt einer, zeigt next-intl ohne Fehlermeldung den Pfad an - so stand auf
// allen vier Bereichsseiten "dashboard.home.moduleTitel" als Ueberschrift
// (WMCNL-2493). TypeScript prueft die Schluessel in diesem Projekt nicht, und
// die anderen Sprachen fallen auf Deutsch zurueck. Deshalb reicht es, gegen
// de.json zu pruefen.
//
// Erfasst werden Uebersetzer aus useTranslations/getTranslations, die an einer
// Konstanten haengen, auch als Element von Promise.all. Geprueft wird:
//   - fester Schluessel: steht als Text in de.json (bei .raw auch als Objekt)
//   - Schluessel mit ${...}: mindestens ein Text passt auf das Muster
//   - Bedingung a ? "x" : "y": beide Zweige
// Nicht pruefbar sind Schluessel aus Variablen und Uebersetzer, die als
// Parameter weitergereicht werden - beide zaehlt der Test nur mit.
//
// Kein Netzwerk. Aufruf: npm run test:schluessel

type Baum = { [k: string]: string | Baum };

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const wurzel = path.resolve(__dirname, "../..");
const deutsch = JSON.parse(readFileSync(path.join(wurzel, "src/messages/de.json"), "utf8")) as Baum;

function nachschlagen(pfad: string): string | Baum | undefined {
  let knoten: string | Baum | undefined = deutsch;
  for (const teil of pfad.split(".")) {
    if (knoten && typeof knoten === "object" && teil in knoten) knoten = knoten[teil];
    else return undefined;
  }
  return knoten;
}

const allePfade: string[] = [];
(function geh(knoten: Baum, pfad: string) {
  for (const [k, v] of Object.entries(knoten)) {
    const p = pfad ? `${pfad}.${k}` : k;
    allePfade.push(p);
    if (typeof v !== "string") geh(v, p);
  }
})(deutsch, "");

// ---- Analyse ------------------------------------------------------------------------------------------------

type Fund = { ort: string; schluessel: string; grund: string };
type Ergebnis = { fest: number; muster: number; ohneAufloesung: number; funde: Fund[] };

const ERZEUGER = new Set(["useTranslations", "getTranslations"]);
const DYNAMISCH = Symbol("dynamisch");
type Namensraum = string | typeof DYNAMISCH;

/** Namensraum, wenn der Ausdruck einen Uebersetzer erzeugt; "" ist die Wurzel. */
function namensraumVon(ausdruck: ts.Expression | undefined): Namensraum | undefined {
  if (!ausdruck) return undefined;
  if (ts.isAwaitExpression(ausdruck) || ts.isParenthesizedExpression(ausdruck)) {
    return namensraumVon(ausdruck.expression);
  }
  if (!ts.isCallExpression(ausdruck) || !ts.isIdentifier(ausdruck.expression)) return undefined;
  if (!ERZEUGER.has(ausdruck.expression.text)) return undefined;
  const arg = ausdruck.arguments[0];
  if (!arg) return "";
  if (ts.isStringLiteralLike(arg)) return arg.text;
  if (ts.isObjectLiteralExpression(arg)) {
    const ns = arg.properties.find(
      (p): p is ts.PropertyAssignment =>
        ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "namespace",
    );
    if (!ns) return "";
    return ts.isStringLiteralLike(ns.initializer) ? ns.initializer.text : DYNAMISCH;
  }
  return DYNAMISCH;
}

/** Namensraum der Deklaration, an der ein aufgerufener Bezeichner haengt. */
function namensraumDerDeklaration(dekl: ts.Declaration): Namensraum | undefined {
  if (ts.isVariableDeclaration(dekl)) return namensraumVon(dekl.initializer);
  // const [t, tq] = await Promise.all([getTranslations("a"), getTranslations("b")])
  if (ts.isBindingElement(dekl) && ts.isArrayBindingPattern(dekl.parent)) {
    const index = dekl.parent.elements.indexOf(dekl);
    const variable = dekl.parent.parent;
    if (!ts.isVariableDeclaration(variable) || !variable.initializer) return undefined;
    let init: ts.Expression = variable.initializer;
    if (ts.isAwaitExpression(init)) init = init.expression;
    if (
      ts.isCallExpression(init) &&
      ts.isPropertyAccessExpression(init.expression) &&
      init.expression.getText() === "Promise.all" &&
      init.arguments[0] &&
      ts.isArrayLiteralExpression(init.arguments[0])
    ) {
      return namensraumVon(init.arguments[0].elements[index]);
    }
  }
  return undefined;
}

type Schluessel =
  | { art: "fest"; text: string }
  | { art: "muster"; text: string; muster: string }
  | { art: "variabel" };

function schluesselAus(ausdruck: ts.Expression): Schluessel[] {
  if (ts.isStringLiteralLike(ausdruck)) return [{ art: "fest", text: ausdruck.text }];
  if (ts.isParenthesizedExpression(ausdruck)) return schluesselAus(ausdruck.expression);
  if (ts.isConditionalExpression(ausdruck)) {
    return [...schluesselAus(ausdruck.whenTrue), ...schluesselAus(ausdruck.whenFalse)];
  }
  if (ts.isTemplateExpression(ausdruck)) {
    let muster = maskieren(ausdruck.head.text);
    for (const teil of ausdruck.templateSpans) muster += "[^.]+" + maskieren(teil.literal.text);
    return [{ art: "muster", text: ausdruck.getText(), muster }];
  }
  return [{ art: "variabel" }];
}

function maskieren(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function analysieren(programm: ts.Program, dateien: ReadonlySet<string>): Ergebnis {
  const pruefer = programm.getTypeChecker();
  const ergebnis: Ergebnis = { fest: 0, muster: 0, ohneAufloesung: 0, funde: [] };

  for (const quelle of programm.getSourceFiles()) {
    if (!dateien.has(path.normalize(quelle.fileName))) continue;
    const relativ = path.relative(wurzel, quelle.fileName).replace(/\\/g, "/");

    const besuche = (knoten: ts.Node) => {
      if (ts.isCallExpression(knoten) && knoten.arguments.length > 0) {
        pruefeAufruf(knoten);
      }
      ts.forEachChild(knoten, besuche);
    };

    const pruefeAufruf = (aufruf: ts.CallExpression) => {
      let ziel = aufruf.expression;
      let methode: string | null = null;
      if (ts.isPropertyAccessExpression(ziel) && ["rich", "raw", "markup", "has"].includes(ziel.name.text)) {
        methode = ziel.name.text;
        ziel = ziel.expression;
      }
      // t.has(...) fragt nur, ob es den Text gibt - dort darf er fehlen.
      if (!ts.isIdentifier(ziel) || methode === "has") return;

      const dekl = pruefer.getSymbolAtLocation(ziel)?.declarations?.[0];
      if (!dekl) return;
      const ns = namensraumDerDeklaration(dekl);
      if (ns === undefined) return;

      const zeile = quelle.getLineAndCharacterOfPosition(aufruf.getStart()).line + 1;
      const ort = `${relativ}:${zeile}`;

      for (const s of schluesselAus(aufruf.arguments[0])) {
        if (ns === DYNAMISCH || s.art === "variabel") {
          ergebnis.ohneAufloesung++;
          continue;
        }
        const vorn = ns ? `${ns}.` : "";
        if (s.art === "fest") {
          ergebnis.fest++;
          const pfad = vorn + s.text;
          const wert = nachschlagen(pfad);
          if (wert === undefined) {
            ergebnis.funde.push({ ort, schluessel: pfad, grund: "fehlt in de.json" });
          } else if (typeof wert !== "string" && methode !== "raw") {
            ergebnis.funde.push({ ort, schluessel: pfad, grund: "ist ein Abschnitt, kein Text" });
          }
        } else {
          ergebnis.muster++;
          const regel = new RegExp(`^${maskieren(vorn)}${s.muster}$`);
          if (!allePfade.some((p) => regel.test(p))) {
            ergebnis.funde.push({ ort, schluessel: vorn + s.text, grund: "kein Text passt auf das Muster" });
          }
        }
      }
    };

    besuche(quelle);
  }
  return ergebnis;
}

// ---- Selbsttest: erkennt die Analyse, was sie erkennen soll? ------------------------------------------------

function programmAusText(text: string): { programm: ts.Program; datei: string } {
  const datei = path.join(wurzel, "__selbsttest__.tsx");
  const optionen: ts.CompilerOptions = { noLib: true, noResolve: true, jsx: ts.JsxEmit.ReactJSX };
  const host = ts.createCompilerHost(optionen);
  const probe = ts.createSourceFile(datei, text, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
  const lesen = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) => (path.normalize(name) === datei ? probe : lesen(name, ...rest));
  host.fileExists = (name) => path.normalize(name) === datei || ts.sys.fileExists(name);
  return { programm: ts.createProgram([datei], optionen, host), datei };
}

const probe = programmAusText(`
  export function Probe({ x, stand }: { x: boolean; stand: string }) {
    const t = useTranslations("dashboard");
    const k = useTranslations("dashboard.kennzahl");
    t("zoneKennzahlTitel");
    t("gibtEsNicht");
    t(x ? "zoneKennzahlLead" : "fehltImZweig");
    t("kennzahl");
    t.has("fehltAberGefragt");
    k(\`zielstand.\${stand}\`);
    k(\`nirgends.\${stand}\`);
    return null;
  }
  export async function Server() {
    const [a] = await Promise.all([getTranslations({ locale: "de", namespace: "dashboard" })]);
    a("fehltImServer");
  }
`);
const selbst = analysieren(probe.programm, new Set([probe.datei]));
const gefunden = (schluessel: string) => selbst.funde.find((f) => f.schluessel === schluessel);

pruefe("Selbsttest: fehlender Schluessel wird erkannt", !!gefunden("dashboard.gibtEsNicht"));
pruefe("Selbsttest: vorhandener Schluessel gilt als vorhanden", !gefunden("dashboard.zoneKennzahlTitel"));
pruefe(
  "Selbsttest: beide Zweige einer Bedingung werden geprueft",
  !!gefunden("dashboard.fehltImZweig") && !gefunden("dashboard.zoneKennzahlLead"),
);
pruefe("Selbsttest: Abschnitt statt Text wird erkannt", gefunden("dashboard.kennzahl")?.grund === "ist ein Abschnitt, kein Text");
pruefe("Selbsttest: t.has() darf nach Fehlendem fragen", !gefunden("dashboard.fehltAberGefragt"));
pruefe(
  "Selbsttest: Muster mit und ohne Treffer",
  !selbst.funde.some((f) => f.schluessel.includes("zielstand")) && selbst.funde.some((f) => f.schluessel.includes("nirgends")),
);
pruefe("Selbsttest: Uebersetzer aus Promise.all wird zugeordnet", !!gefunden("dashboard.fehltImServer"));
pruefe("Selbsttest: genau die fuenf erwarteten Funde", selbst.funde.length === 5, `${selbst.funde.length} Funde`);

// ---- Der echte Code unter src/ ------------------------------------------------------------------------------

const konfig = ts.readConfigFile(path.join(wurzel, "tsconfig.json"), ts.sys.readFile);
const gelesen = ts.parseJsonConfigFileContent(konfig.config, ts.sys, wurzel);
const quellen = gelesen.fileNames
  .map((f) => path.normalize(f))
  .filter((f) => f.startsWith(path.join(wurzel, "src") + path.sep));
const programm = ts.createProgram(quellen, { ...gelesen.options, noEmit: true, incremental: false });
const echt = analysieren(programm, new Set(quellen));

for (const f of echt.funde) pruefe(`${f.ort}  ${f.schluessel}`, false, f.grund);
pruefe("src: feste Schluessel stehen in de.json", !echt.funde.some((f) => !f.grund.startsWith("kein Text")), `${echt.fest} Aufrufe`);
pruefe("src: jedes Muster trifft mindestens einen Text", !echt.funde.some((f) => f.grund.startsWith("kein Text")), `${echt.muster} Aufrufe`);
pruefe("src: die Analyse findet Aufrufe", echt.fest > 1000, `${quellen.length} Dateien`);
console.log(`INFO  nicht pruefbar (Schluessel aus Variablen): ${echt.ohneAufloesung} Aufrufe`);

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
if (fehler > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
