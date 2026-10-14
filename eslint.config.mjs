import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // WMC-Vibecode-Cleanup (13. und 14.10.2026, docs/cleanup-2026-10-13.md): Nach dem Zerlegen aller Ausreißer liegt keine Funktion in src
  // über Komplexität 30 oder über 300 Zeilen. Damit das so bleibt, sind beide Grenzen Fehler: Der Lint-Lauf (auch in der PR-Prüfung)
  // bricht, wenn eine Funktion sie überschreitet. Dann die Funktion zerlegen, nicht die Grenze anheben.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      complexity: ["error", 30],
      "max-lines-per-function": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python-Umgebung der Robot-Framework-Tests. Sie bringt eigene
    // JavaScript-Dateien mit (Playwright, Robot-Berichte), die weder unser
    // Code noch unser Stil sind.
    ".venv-robot/**",
  ]),
]);

export default eslintConfig;
