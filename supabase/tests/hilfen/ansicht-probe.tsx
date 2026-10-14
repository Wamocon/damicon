import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

// Render-Probe für Oberflächen der Wissensverwaltung ohne Browser (seit 14.10.2026): baut eine Komponente einmal auf
// (renderToStaticMarkup, also nur der erste Aufbau: keine Effekte, keine Ereignisse) und sammelt dabei, was next-intl meldet.
// Ein fehlender Übersetzungsschlüssel erscheint im Markup als !!schluessel!! und steht in `fehler`.

export const SPRACHEN = ["de", "en", "ru", "kk"] as const;

const texte = new Map<string, Record<string, unknown>>();

/** Die Texte einer Sprache aus src/messages (einmal gelesen). */
export function texteVon(loc: string): Record<string, unknown> {
  let m = texte.get(loc);
  if (!m) {
    m = JSON.parse(readFileSync(`src/messages/${loc}.json`, "utf8")) as Record<string, unknown>;
    texte.set(loc, m);
  }
  return m;
}

/** Rendert `element` in der Sprache `loc`. `fehler` nennt fehlende Schlüssel, misslungene Platzhalter und Ausnahmen beim Aufbau. */
export function rendere(element: ReactElement, loc = "de"): { html: string; fehler: string[] } {
  const fehler: string[] = [];
  let html = "";
  try {
    html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale={loc}
        timeZone="Europe/Berlin"
        messages={texteVon(loc)}
        onError={(e) => {
          if (e.code !== "ENVIRONMENT_FALLBACK") fehler.push(e.message);
        }}
        getMessageFallback={({ namespace, key }) => `!!${namespace ? `${namespace}.` : ""}${key}!!`}
      >
        {element}
      </NextIntlClientProvider>,
    );
  } catch (e) {
    fehler.push(`Render: ${(e as Error).message}`);
  }
  if (html.includes("!!")) fehler.push(...(html.match(/!![^!]+!!/g) ?? []));
  return { html, fehler };
}

/** Text so, wie React ihn ins Markup schreibt (Anführungszeichen und Apostroph maskiert). */
export const imMarkup = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/** Eine Zahl von Prüfungen mit PASS- und FAIL-Zeilen; `ende()` schreibt die Summe und beendet bei Fehlern mit Exit-Code 1. */
export function pruefer() {
  let bestanden = 0;
  let fehlgeschlagen = 0;
  const pruefe = (name: string, bedingung: boolean, zusatz = "") => {
    if (bedingung) bestanden++;
    else fehlgeschlagen++;
    console.log(`${bedingung ? "PASS" : "FAIL"}  ${name}${zusatz ? "  - " + zusatz : ""}`);
  };
  const ende = () => {
    console.log(`\nPruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
    if (fehlgeschlagen > 0) process.exit(1);
    console.log("Alle Pruefungen bestanden.");
  };
  return { pruefe, ende };
}
