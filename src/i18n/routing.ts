import { defineRouting } from "next-intl/routing";

// Sprachen von Damicon. Analyse Kapitel 7 gibt de/tr/kk/ru vor und laesst
// Englisch (en) bewusst weg. Englisch wurde auf ausdrueckliche Anweisung wieder
// aufgenommen - das deckt sich mit dem Pitch-Dossier, das Dokumente in Russisch
// UND Englisch empfiehlt. Kasachisch (kk) bleibt neu gegenueber 1Cati.
// Startsprache: Deutsch (interner Demo- und Freigabe-Kontext).
export const routing = defineRouting({
  locales: ["de", "en", "kk", "ru"],
  defaultLocale: "de",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
