import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
