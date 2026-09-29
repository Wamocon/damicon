// Loest "@/..." wie tsconfig.json (paths: "@/*" -> "src/*") auf, damit ein Test auch
// Browser-Module laden kann, die ihre Nachbarn ueber den Alias importieren - etwa
// components/ki/sprachausgabe-strom.ts. Eingehaengt mit module.register() aus dem Test;
// ohne Endung wird ".ts" angehaengt, wie Next es tut.
//
// Ein Modul, das mit "?react=attrappe" geladen wird, bekommt fuer "react" die Attrappe
// aus react-attrappe.mjs (Hook-Tests ohne Browser, seit 29.09.2026). Alle anderen
// Module sehen das echte React.
let src = "";
const REACT_ATTRAPPE = new URL("./react-attrappe.mjs", import.meta.url).href;

export function initialize(daten) {
  src = daten.src;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "react" && context.parentURL?.includes("react=attrappe")) {
    return { url: REACT_ATTRAPPE, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const pfad = specifier.slice(2);
    const mitEndung = /\.[cm]?[jt]sx?$/.test(pfad) ? pfad : `${pfad}.ts`;
    return nextResolve(new URL(mitEndung, src).href, context);
  }
  return nextResolve(specifier, context);
}
