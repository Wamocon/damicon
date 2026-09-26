// Loest "@/..." wie tsconfig.json (paths: "@/*" -> "src/*") auf, damit ein Test auch
// Browser-Module laden kann, die ihre Nachbarn ueber den Alias importieren - etwa
// components/ki/sprachausgabe-strom.ts. Eingehaengt mit module.register() aus dem Test;
// ohne Endung wird ".ts" angehaengt, wie Next es tut.
let src = "";

export function initialize(daten) {
  src = daten.src;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const pfad = specifier.slice(2);
    const mitEndung = /\.[cm]?[jt]sx?$/.test(pfad) ? pfad : `${pfad}.ts`;
    return nextResolve(new URL(mitEndung, src).href, context);
  }
  return nextResolve(specifier, context);
}
