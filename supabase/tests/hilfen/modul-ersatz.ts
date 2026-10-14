import * as nodeModule from "node:module";

// Ersetzt ganze Module durch Attrappen, ohne den Code unter Test anzufassen (seit 14.10.2026).
//
// Server-Komponenten und Datenlader holen sich ihre Abhängigkeiten selbst: createClient() aus lib/supabase/server liest Cookies,
// getTranslations() aus next-intl/server gibt es nur im Server-Bündel, getSessionProfile() fragt die Anmeldung ab. Ohne Ersatz lässt
// sich so ein Baustein außerhalb von Next nicht aufrufen. Eingehängt wird über module.registerHooks (Node 22.15 oder neuer), das für
// import und require gleichermaßen greift.
//
// Jeder Export einer Attrappe ist eine Funktion. Der erzeugte Modultext ruft bei jedem Aufruf die Funktion, die in diesem Moment im
// Ersatzobjekt steht; ein Test kann sie also zwischen zwei Fällen austauschen. Wichtig: ersetzeModule() muss laufen, bevor das Modul
// unter Test geladen wird, also das Modul unter Test erst danach mit await import() holen.

type Attrappe = Record<string, (...argumente: never[]) => unknown>;

interface Hooks {
  resolve(
    spezifizierer: string,
    kontext: unknown,
    weiter: (spezifizierer: string, kontext?: unknown) => { url: string },
  ): { url: string; shortCircuit?: boolean };
  load(
    url: string,
    kontext: unknown,
    weiter: (url: string, kontext?: unknown) => unknown,
  ): unknown;
}

const registerHooks = (nodeModule as unknown as { registerHooks?: (hooks: Hooks) => unknown }).registerHooks;
const SCHEMA = "modul-ersatz:";

/** Text als JavaScript-Literal im erzeugten Modul: JSON plus Maskierung von <, >, / und den Zeilentrennern (CodeQL js/bad-code-sanitization). */
export const alsLiteral = (s: string) =>
  JSON.stringify(s).replace(/[<>/\u2028\u2029]/g, (z) => `\\u${z.charCodeAt(0).toString(16).padStart(4, "0")}`);

/** Exportnamen landen ungequotet im Modultext, deshalb nur gültige Bezeichner. */
export const bezeichner = (n: string) => {
  if (!/^[A-Za-z_$][\w$]*$/.test(n)) throw new Error(`modul-ersatz: ungültiger Exportname ${JSON.stringify(n)}`);
  return n;
};

/** Ersetzt jedes genannte Modul (so geschrieben wie im import, etwa "@/lib/auth" oder "next-intl/server") durch seine Attrappe. */
export function ersetzeModule(ersatz: Record<string, Attrappe>): void {
  if (!registerHooks) throw new Error("module.registerHooks fehlt: dieser Test braucht Node 22.15 oder neuer.");
  (globalThis as { __modulErsatz?: Record<string, Attrappe> }).__modulErsatz = ersatz;
  registerHooks({
    resolve(spezifizierer, kontext, weiter) {
      if (Object.hasOwn(ersatz, spezifizierer)) return { url: SCHEMA + spezifizierer, shortCircuit: true };
      return weiter(spezifizierer, kontext);
    },
    load(url, kontext, weiter) {
      if (!url.startsWith(SCHEMA)) return weiter(url, kontext);
      const name = url.slice(SCHEMA.length);
      const quelle = Object.keys(ersatz[name]!)
        .map((n) => `export const ${bezeichner(n)} = (...a) => globalThis.__modulErsatz[${alsLiteral(name)}][${alsLiteral(n)}](...a);`)
        .join("\n");
      return { format: "module", source: quelle, shortCircuit: true };
    },
  });
}
