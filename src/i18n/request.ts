import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { deepMerge, type MessageTree } from "./deep-merge";
import deMessages from "../messages/de.json";
import { betriebsZeitzone } from "../lib/domain/tageszeit";

// Die Ziel-Locales tr/kk/ru sind fuer den Prototyp bewusst nicht vollstaendig
// uebersetzt (Analyse Kapitel 9: "nicht zwingend jeder Unterpunkt bereits
// vollstaendig uebersetzt"). Fehlende Schluessel fallen auf die deutsche
// Fassung zurueck, damit der Sprachumschalter trotzdem ueberall funktioniert
// (deep-merge.ts).

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const localeMessages =
    locale === "de"
      ? deMessages
      : (await import(`../messages/${locale}.json`)).default;

  return {
    locale,
    // Uhrzeiten gelten in der Betriebszeitzone, nicht in der des Servers (UTC auf Vercel). Ohne diese Angabe stand ein Pflueckbeginn um 08:00 in Almaty
    // als 03:00 auf dem Bildschirm, waehrend das Dokument 08:00 zeigte (Pruefung PR #156, 15.10.2026). Tageswerte ohne Uhrzeit rechnen weiter mit
    // timeZone "UTC" und ihrer Mitternacht (Almaty liegt im Plus, der Tag bleibt derselbe).
    timeZone: betriebsZeitzone,
    messages: deepMerge(
      deMessages as MessageTree,
      localeMessages as MessageTree,
    ),
  };
});
