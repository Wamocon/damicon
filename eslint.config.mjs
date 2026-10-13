import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // WMC-Vibecode-Cleanup (13.10.2026): Ausreisser sichtbar machen, ohne den Lauf zu brechen. Komplexitaet ueber 40 und Funktionen ueber
  // 400 Zeilen melden sich als Warnung; vor einer Erweiterung an solcher Stelle erst zerlegen (siehe docs/cleanup-2026-10-13.md).
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      complexity: ["warn", 40],
      "max-lines-per-function": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
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
