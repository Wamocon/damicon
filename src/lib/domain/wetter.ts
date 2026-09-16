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
