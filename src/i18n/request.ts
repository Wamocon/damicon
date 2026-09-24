import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { deepMerge, type MessageTree } from "./deep-merge";
import deMessages from "../messages/de.json";

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
    messages: deepMerge(
      deMessages as MessageTree,
      localeMessages as MessageTree,
    ),
  };
});
