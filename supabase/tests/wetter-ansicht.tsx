import { NextIntlClientProvider, createFormatter, createTranslator } from "next-intl";
import { prerender } from "react-dom/static";
import type { SessionProfile } from "../../src/lib/auth";
import type { WetterUebersicht } from "../../src/lib/data/wetter";
import { berechneTemperatursummen, summeBis } from "../../src/lib/domain/wetter";
import type { Role } from "../../src/lib/rbac";
import { ersetzeModule } from "./hilfen/modul-ersatz";
import { imMarkup, pruefer, SPRACHEN, texteVon } from "./hilfen/ansicht-probe";

// Die Wetterseite (db/wetter-ansicht.tsx), ohne Browser und ohne Datenbank (16.10.2026): die Wärmesumme wird erklärt, nicht nur gezeigt.
//   * Zahl, Einheit, Stand und die drei Werte (letzter Tag, letzte sieben Tage, Durchschnitt je Tag),
//   * die Rechnung in drei Schritten und am letzten Tag vorgerechnet (warmer Tag, kalter Tag, fehlende Werte),
//   * der Satz, warum die Zahl groß ist, und die Einordnung mit der ersten Ernte (mit Ernte, ohne Ernte, ohne Wetterwerte am Erntetag),
//   * Tabelle der letzten 14 Tage mit Mittelwert, Beitrag und Summe, Hinweis bei veralteter Reihe, Formular nur mit Recht und Datenbank,
//   * leere Reihe, Demo und Lesefehler, alle Texte in vier Sprachen ohne fehlenden Schlüssel.
// Server-Bausteine sind ersetzt (hilfen/modul-ersatz.ts): next-intl/server liefert Übersetzer und Formatierer aus den echten Texten, getSessionProfile die
// Anmeldung, ladeWetterUebersicht feste Daten. Die Kurve selbst (recharts) misst ihre Breite erst im Browser und bleibt dort ein Prüfpunkt.
// Aufruf: npm run test:wetter-ansicht

const { pruefe, ende } = pruefer();
type Sprache = (typeof SPRACHEN)[number];

const ZEITZONE = "Europe/Berlin";
const ersatzText = ({ namespace, key }: { namespace?: string; key: string }) => `!!${namespace ? `${namespace}.` : ""}${key}!!`;
let sprache: Sprache = "de";
let uebersicht: WetterUebersicht;
let rolle: Role | null = "admin";
let textFehler: string[] = [];

ersetzeModule({
  "next-intl/server": {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: sprache, messages: texteVon(sprache) as never, namespace: namespace as never, onError: (e) => textFehler.push(e.message), getMessageFallback: ersatzText }),
    getFormatter: async () => createFormatter({ locale: sprache, timeZone: ZEITZONE }),
    getLocale: async () => sprache,
  },
  "@/lib/auth": {
    getSessionProfile: async () => (rolle === null ? null : ({ id: "p1", role: rolle } as unknown as SessionProfile)),
  },
  "@/lib/data/wetter": {
    ladeWetterUebersicht: async () => uebersicht,
  },
});

async function ansicht(loc: Sprache): Promise<{ html: string; fehler: string[] }> {
  sprache = loc;
  textFehler = [];
  const konsole: string[] = [];
  const echt = console.error;
  console.error = (...a: unknown[]) => konsole.push(a.map(String).join(" "));
  try {
    const { WetterAnsicht } = await import("../../src/components/db/wetter-ansicht");
    const element = await WetterAnsicht();
    const { prelude } = await prerender(
      <NextIntlClientProvider locale={loc} timeZone={ZEITZONE} messages={texteVon(loc)} onError={(e) => textFehler.push(e.message)} getMessageFallback={ersatzText}>
        {element}
      </NextIntlClientProvider>,
    );
    const html = await new Response(prelude).text();
    // Bekannt und hier ohne Belang: das Pfadfeld der Formulare meldet ohne Router value={null}.
    const fehler = [...textFehler, ...konsole.filter((z) => !z.includes("`value` prop on `%s` should not be null")), ...(html.match(/!![^!]+!!/g) ?? [])];
    return { html, fehler };
  } finally {
    console.error = echt;
  }
}

// ---- Testdaten: Tage relativ zu heute, damit "veraltet" stimmt ---------------------------------------------------------------------
const tagIso = (tageHer: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - tageHer);
  return d.toISOString().slice(0, 10);
};

/** Eine Reihe von `anzahl` Tagen, die `bisTageHer` Tage vor heute endet. Jeder Tag trägt min bis max, davor ein warmer Anlauf. */
function reihe(anzahl: number, bisTageHer: number, letzter: { min: number | null; max: number | null }, warm = { min: 10, max: 22 }) {
  return berechneTemperatursummen(
    Array.from({ length: anzahl }, (_, i) => {
      const hinten = anzahl - 1 - i;
      const istLetzter = hinten === 0;
      return {
        datum: tagIso(bisTageHer + hinten),
        tempMinC: istLetzter ? letzter.min : warm.min,
        tempMaxC: istLetzter ? letzter.max : warm.max,
        niederschlagMm: hinten % 5 === 0 ? 3.2 : 0,
      };
    }),
  );
}

const WARM = reihe(40, 0, { min: 10, max: 22 }); // Beitrag je Tag 11, Summe 440
const KALT = reihe(40, 0, { min: -2, max: 6 }); // letzter Tag: Mittel 2 liegt unter 5, trägt 0 bei
const OHNE_WERTE = reihe(40, 0, { min: null, max: null });
const VERALTET = reihe(40, 3, { min: 10, max: 22 });
const ernteAm = (tageHer: number, tage = WARM): WetterUebersicht["ersteErnte"] => ({ datum: tagIso(tageHer), summe: summeBis(tage, tagIso(tageHer))?.summe ?? null });

const lage = (tage: WetterUebersicht["tage"], extra: Partial<WetterUebersicht> = {}): WetterUebersicht => ({ quelle: "db", tage, ersteErnte: ernteAm(20), ...extra });

const de = texteVon("de") as Record<string, Record<string, unknown>>;
type Texte = Record<string, string>;
const t = de.wetterAnsicht as unknown as Texte & { stat: Texte; erklaerung: Texte; verlauf: Texte; einordnung: Texte; col: Texte; formular: Texte };

async function main() {
  // ---- 1. Warmer Tag mit erster Ernte, in allen vier Sprachen ----------------------------------------------------------------------
  uebersicht = lage(WARM);
  for (const loc of SPRACHEN) {
    const { html, fehler } = await ansicht(loc);
    const text = texteVon(loc) as Record<string, Record<string, unknown>>;
    const w = text.wetterAnsicht as unknown as Texte & { erklaerung: Texte; verlauf: Texte };
    pruefe(`${loc}: kein fehlender Schlüssel, kein Platzhalter und keine Meldung von next-intl`, fehler.length === 0, fehler.slice(0, 3).join(" | "));
    pruefe(`${loc}: Titel der Wärmesumme, Erklärung und Verlauf stehen auf der Seite`, html.includes(imMarkup(w.summeTitel)) && html.includes(imMarkup(w.erklaerung.titel)) && html.includes(imMarkup(w.verlauf.titel)));
    pruefe(`${loc}: der alte Platzhalter-Satz "Koordinaten und Basistemperatur sind Platzhalter" ist weg`, !html.includes("Platzhalter"));
  }

  sprache = "de";
  {
    const { html } = await ansicht("de");
    pruefe("de: die Zahl steht als ganze Zahl mit der Einheit Gradtage (440, nicht 440,0)", html.includes(">440<") && html.includes(imMarkup(t.einheit)));
    pruefe("de: letzter Tag +11, letzte 7 Tage +77, Durchschnitt 11", html.includes(">+11<") && html.includes(">+77<") && html.includes(">11<"), "Werte der Kacheln");
    pruefe("de: Beispiel am letzten Tag: Mittelwert 16 minus 5 ergibt 11 Gradtage", html.includes("Mittelwert 16 °C. 16 minus 5 ergibt 11 Gradtage"));
    pruefe("de: der Satz, warum die Zahl groß ist: 40 Tage, Durchschnitt 11", html.includes("Die Zahl ist groß, weil sie über 40 Tage wächst. Im Durchschnitt kommen 11 Gradtage je Tag zusammen."));
    pruefe("de: drei Schritte der Erklärung", [t.erklaerung.schritt1, t.erklaerung.schritt3].every((s) => html.includes(imMarkup(s))) && html.includes("Liegt der Mittelwert über 5 °C, zählt der Unterschied. Ein kühlerer Tag zählt 0."));
    pruefe("de: Einordnung mit der ersten Ernte und der Wärmesumme an dem Tag (20 Tage mal 11 = 220)", html.includes("Die Wärmesumme lag an diesem Tag bei 220 Gradtagen."), html.match(/lag an diesem Tag bei [\d.]+ Gradtagen/)?.[0]);
    pruefe("de: Hinweis, dass die Wärmesumme keine Vorhersage der Erntemenge ist", html.includes("Eine Vorhersage der Erntemenge ist die Wärmesumme nicht."));
    pruefe("de: Tabelle hat sieben Spalten und 14 Zeilen", [t.col.datum, t.col.min, t.col.max, t.col.mittel, t.col.beitrag, t.col.summe, t.col.niederschlag].every((k) => html.includes(imMarkup(k))) && (html.match(/<tr/g) ?? []).length === 15);
    pruefe("de: ein Formular zum Aktualisieren mit Recht und Datenbank", html.includes(imMarkup(t.formular.knopf)));
    pruefe("de: die Reihe endet heute, also kein Hinweis auf eine veraltete Reihe", !html.includes("Die Messreihe endet am"));
    pruefe("de: Grundlagen nennen Standort und Basistemperatur", html.includes("43,222 Grad Nord, 76,851 Grad Ost") && html.includes("Basistemperatur von 5 °C"));
    pruefe("de: das Wort Temperatursumme kommt auf der Seite nicht mehr vor", !html.includes("Temperatursumme") && !html.includes("°C-Tage"));
  }

  // ---- 2. Kalter letzter Tag, fehlende Werte ---------------------------------------------------------------------------------------
  uebersicht = lage(KALT);
  {
    const { html, fehler } = await ansicht("de");
    pruefe("kalter Tag: das Beispiel sagt, dass er 0 Gradtage zählt", html.includes("Der Mittelwert von 2 °C liegt nicht über 5 °C. Der Tag zählt 0 Gradtage.") && fehler.length === 0, fehler.join(" | "));
    pruefe("kalter Tag: die Kachel zeigt 0 statt +0", html.includes(">0<") && !html.includes(">+0<"));
  }
  uebersicht = lage(OHNE_WERTE);
  {
    const { html, fehler } = await ansicht("de");
    pruefe("fehlende Werte am letzten Tag: kein Beispiel, die Seite bleibt heil", !html.includes("Beispiel ") && html.includes(imMarkup(t.erklaerung.titel)) && fehler.length === 0, fehler.join(" | "));
  }

  // ---- 3. Erste Ernte: ohne Ernte, ohne Wetterwerte am Erntetag --------------------------------------------------------------------
  uebersicht = lage(WARM, { ersteErnte: null });
  {
    const { html } = await ansicht("de");
    pruefe("ohne Ernte: die Seite sagt, dass es noch keinen Vergleichswert gibt", html.includes("In diesem Jahr ist noch keine Ernte erfasst. Deshalb gibt es noch keinen Vergleichswert."));
  }
  uebersicht = lage(WARM, { ersteErnte: { datum: "2026-01-01", summe: null } });
  {
    const { html } = await ansicht("de");
    pruefe("Ernte vor dem Beginn der Reihe: kein erfundener Wert, die Seite sagt es", html.includes("Für diesen Tag liegen keine Wetterwerte vor.") && !html.includes("lag an diesem Tag bei"));
  }

  // ---- 4. Leere Reihe, veraltete Reihe, Demo, Rollen -------------------------------------------------------------------------------
  uebersicht = lage([], { ersteErnte: null });
  {
    const { html, fehler } = await ansicht("de");
    pruefe("leere Reihe: Leerzustand statt Zahl, Erklärung und Verlauf fehlen", html.includes(imMarkup(t.keineDaten)) && !html.includes(imMarkup(t.erklaerung.titel)) && !html.includes(imMarkup(t.verlauf.titel)) && fehler.length === 0, fehler.join(" | "));
  }
  uebersicht = lage(VERALTET);
  {
    const { html } = await ansicht("de");
    pruefe("veraltete Reihe: der Hinweis nennt das Ende der Reihe", html.includes("Die Messreihe endet am") && html.includes("Jetzt aktualisieren"));
  }
  uebersicht = lage(WARM, { quelle: "demo", ersteErnte: null });
  {
    const { html } = await ansicht("de");
    pruefe("Demo: kein Formular zum Aktualisieren, die Seite rechnet trotzdem", !html.includes(imMarkup(t.formular.knopf)) && html.includes(">440<"));
  }
  uebersicht = lage(WARM);
  for (const lesend of ["kunde", "brigade", "betriebsleitung"] as Role[]) {
    rolle = lesend;
    const { html } = await ansicht("de");
    // Das Recht zum Aktualisieren ist das des Rotationsplans: die Betriebsleitung darf, Kunde und Pflücker nicht.
    const darf = lesend === "betriebsleitung";
    pruefe(`Rolle ${lesend}: ${darf ? "sieht" : "sieht nicht"} das Formular zum Aktualisieren`, html.includes(imMarkup(t.formular.knopf)) === darf);
  }
  rolle = null;
  {
    const { html } = await ansicht("de");
    pruefe("ohne Anmeldung: die Seite rendert, ohne Formular", html.includes(imMarkup(t.summeTitel)) && !html.includes(imMarkup(t.formular.knopf)));
  }
  rolle = "admin";

  ende();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
