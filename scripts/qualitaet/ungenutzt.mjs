// Sucht Exporte in src, deren Name in keiner anderen Datei (src, supabase/tests, scripts, e2e) vorkommt, und Dateien, die nirgends importiert werden.
// Heuristik: Namensvergleich auf Wortgrenze. Next.js-Konventionen (page, layout, route, default-Exporte, metadata ...) zählen als benutzt.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const R = process.cwd().split("\\").join("/") + "/";
const alle = execSync("git ls-files src supabase/tests scripts e2e", { cwd: R, encoding: "utf8" }).split("\n").filter((f) => /\.(tsx?|mjs|js)$/.test(f));
const quellen = alle.filter((f) => f.startsWith("src/"));
const inhalt = new Map(alle.map((f) => [f, readFileSync(R + f, "utf8")]));
/** Text wörtlich in einen regulären Ausdruck einsetzen (Punkt im Dateinamen, $ im Bezeichner). */
const woertlich = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NEXT = new Set(["default", "metadata", "generateMetadata", "generateStaticParams", "viewport", "dynamic", "revalidate", "runtime", "maxDuration", "GET", "POST", "PUT", "PATCH", "DELETE", "config", "middleware", "proxy", "alt", "size", "contentType", "fetchCache", "preferredRegion"]);

// Index: Wort -> Dateien
const woerterJeDatei = new Map();
for (const [f, t] of inhalt) woerterJeDatei.set(f, new Set(t.match(/[A-Za-z_$][\w$]*/g) ?? []));

const ungenutzt = [];
const nurIntern = [];
for (const f of quellen) {
  if (/\.d\.ts$/.test(f) || f.includes("database.types")) continue;
  const t = inhalt.get(f);
  const namen = [...t.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  for (const m of t.matchAll(/^export\s*\{([^}]+)\}/gm)) for (const teil of m[1].split(",")) { const n = teil.trim().split(/\s+as\s+/).pop()?.trim(); if (n && n !== "type") namen.push(n.replace(/^type\s+/, "")); }
  for (const n of namen) {
    if (NEXT.has(n)) continue;
    const anderswo = [...woerterJeDatei].some(([g, w]) => g !== f && w.has(n));
    if (anderswo) continue;
    const intern = (t.match(new RegExp(`\\b${woertlich(n)}\\b`, "g")) ?? []).length > 1;
    (intern ? nurIntern : ungenutzt).push(`${f}  ${n}`);
  }
}

// Dateien, die nirgends importiert werden (ohne Next.js-Routen und Einstiegspunkte)
const unimportiert = [];
for (const f of quellen) {
  if (/\/(page|layout|route|loading|error|not-found|template|default|opengraph-image|icon|manifest|sitemap|robots|global-error)\.(tsx?|js)$/.test(f) || /src\/(middleware|proxy|instrumentation)\./.test(f)) continue;
  const basis = f.replace(/^src\//, "@/").replace(/\.(tsx?|mjs|js)$/, "").replace(/\/index$/, "");
  const name = f.split("/").pop().replace(/\.(tsx?|mjs|js)$/, "");
  const benutzt = [...inhalt].some(([g, t]) => g !== f && (t.includes(`"${basis}"`) || t.includes(`'${basis}'`) || new RegExp(`from ["']\\.{1,2}/[^"']*\\b${woertlich(name)}["']`).test(t) || t.includes(`/${name}"`) || t.includes(`import("${basis}")`)));
  if (!benutzt) unimportiert.push(f);
}

console.log(`== Exporte ohne jede Verwendung (${ungenutzt.length})`);
console.log(ungenutzt.join("\n"));
console.log(`\n== Exporte nur in der eigenen Datei benutzt, export unnötig (${nurIntern.length})`);
console.log(nurIntern.join("\n"));
console.log(`\n== Dateien, die nirgends importiert werden (${unimportiert.length})`);
console.log(unimportiert.join("\n"));
