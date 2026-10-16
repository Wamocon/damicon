// Wetteranbindung mit Temperatursummen-Heuristik (Anforderung 2.13). Reine
// Typen/Konstanten und testbare Rechenlogik ohne Server-Import, wie
// domain/lieferungen.ts. Bewusst eine Heuristik, kein Prognosemodell -
// "Prognosemodelle erst ab der zweiten Saison" (Masterplan-Anforderung 2.13).
// Diese Datei liefert die Zahl, kein Ertragsversprechen.

// Platzhalter-Koordinaten (Almaty-Stadtgebiet). Durch die tatsaechlichen
// GPS-Koordinaten der Plantage ersetzen, sobald bekannt - auf rund drei
// Hektar teilen sich alle Feldparzellen ohnehin dasselbe Mikroklima, eine
// einzige Koordinate je Betrieb genuegt.
export const WETTER_BREITENGRAD = 43.222;
export const WETTER_LAENGENGRAD = 76.8512;

// Basistemperatur der Wachstumsgradtag-Rechnung (Growing Degree Days): der
// allgemein fuer temperiertes Beerenobst uebliche Wert. Eine Agronomin/ein
// Agronom sollte das fuer Himbeeren am Standort bestaetigen oder anpassen -
// das ist eine fachliche Feinjustierung, keine, die den Mechanismus aendert.
export const GDD_BASIS_TEMPERATUR_C = 5;

// Start der Aufsummierung: 1. Januar des laufenden Jahres. Ebenfalls ein
// neutraler Platzhalter statt eines erfundenen biologischen Vegetationsbeginns
// (Austrieb) - siehe GDD_BASIS_TEMPERATUR_C, dieselbe Kategorie offener Punkt.
export function saisonStart(jahr: number): string {
  return `${jahr}-01-01`;
}

export interface WetterTag {
  datum: string;
  tempMinC: number | null;
  tempMaxC: number | null;
  niederschlagMm: number | null;
  /** Kumulierte Temperatursumme seit saisonStart() bis einschliesslich dieses Tages. */
  temperatursumme: number;
}

// Ein Tagesbeitrag zur Temperatursumme: der Tagesmittelwert ueber der
// Basistemperatur, nie negativ (ein kalter Tag zieht die Summe nicht wieder
// herunter - Waermeeinheiten akkumulieren nur, das ist der ganze Sinn der
// Kennzahl).
export function gddBeitrag(tempMinC: number | null, tempMaxC: number | null): number {
  if (tempMinC === null || tempMaxC === null) return 0;
  const mittel = (tempMinC + tempMaxC) / 2;
  return Math.max(0, mittel - GDD_BASIS_TEMPERATUR_C);
}

// Rechnet die kumulierte Temperatursumme fuer eine nach Datum aufsteigend
// sortierte Liste roher Tageswerte - reine Funktion, damit sie sich ohne
// Datenbank testen laesst.
export function berechneTemperatursummen(
  tage: { datum: string; tempMinC: number | null; tempMaxC: number | null; niederschlagMm: number | null }[],
): WetterTag[] {
  let laufsumme = 0;
  return tage.map((tag) => {
    laufsumme += gddBeitrag(tag.tempMinC, tag.tempMaxC);
    return { ...tag, temperatursumme: Math.round(laufsumme * 10) / 10 };
  });
}

// --- Aufbereitung für die Wetterseite (16.10.2026) -------------------------------------------------------------------------------------------
//
// Die Seite erklärt die Wärmesumme am eigenen Beispiel: was der letzte Tag beigetragen hat, wie die Summe der letzten Woche aussieht und warum die Zahl
// groß ist (sie wächst über rund dreihundert Tage). Gerechnet wird hier, damit die Zahlen auf der Seite und im Beispiel aus derselben Quelle stammen.

/** Der Mittelwert aus tiefstem und höchstem Wert des Tages; null, wenn einer fehlt. */
export function tagesMittel(tempMinC: number | null, tempMaxC: number | null): number | null {
  return tempMinC === null || tempMaxC === null ? null : (tempMinC + tempMaxC) / 2;
}

/** Ein Kalendertag vor oder nach einem Datum "JJJJ-MM-TT" (UTC, damit die Sommerzeit nichts verschiebt). */
function tagVersatz(datum: string, tage: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

export interface WaermeStand {
  /** Zahl der Tage mit einer Zeile in der Reihe (Lücken zählen nicht). */
  tage: number;
  /** Wärmesumme bis einschließlich des letzten Tages. */
  summe: number;
  letzterTag: { datum: string; tempMinC: number | null; tempMaxC: number | null; mittelC: number | null; beitrag: number };
  /** Beitrag der letzten sieben Kalendertage bis einschließlich des letzten Tages. */
  siebenTage: number;
  /** Summe geteilt durch die Zahl der Tage: warum die Zahl groß wird. */
  schnittJeTag: number;
}

/** Kennzahlen der Reihe; null ohne Tage. Beiträge werden aus Tiefst- und Höchstwert gerechnet, nicht aus den gespeicherten Summen. */
export function waermeStand(tage: readonly WetterTag[]): WaermeStand | null {
  const letzter = tage.at(-1);
  if (!letzter) return null;
  const grenze = tagVersatz(letzter.datum, -7);
  const siebenTage = tage.filter((t) => t.datum > grenze).reduce((s, t) => s + gddBeitrag(t.tempMinC, t.tempMaxC), 0);
  return {
    tage: tage.length,
    summe: letzter.temperatursumme,
    letzterTag: {
      datum: letzter.datum,
      tempMinC: letzter.tempMinC,
      tempMaxC: letzter.tempMaxC,
      mittelC: tagesMittel(letzter.tempMinC, letzter.tempMaxC),
      beitrag: gddBeitrag(letzter.tempMinC, letzter.tempMaxC),
    },
    siebenTage: Math.round(siebenTage * 10) / 10,
    schnittJeTag: Math.round((letzter.temperatursumme / tage.length) * 10) / 10,
  };
}

/** Der letzte Tag der Reihe, der nicht nach "datum" liegt, mit seiner Summe; null, wenn die Reihe erst danach beginnt. */
export function summeBis(tage: readonly WetterTag[], datum: string): { datum: string; summe: number } | null {
  const treffer = tage.filter((t) => t.datum <= datum).at(-1);
  return treffer ? { datum: treffer.datum, summe: treffer.temperatursumme } : null;
}
