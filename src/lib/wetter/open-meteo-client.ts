// Open-Meteo (open-meteo.com): kostenlos, kein API-Key, keine Registrierung -
// passend fuer den Prototyp-Charakter dieser Anbindung (Anforderung 2.13).
// Jederzeit spaeter gegen einen bezahlten Dienst mit SLA tauschbar, ohne dass
// sich das Datenmodell (wetter_messungen) aendern muesste.
//
// Zwei Endpunkte, weil einer allein nicht reicht: die Archiv-API deckt einen
// beliebigen Datumsbereich ab, hat aber typischerweise einige Tage
// Verarbeitungsverzug bis "heute". Die Forecast-API liefert dafuer echte
// juengste Vergangenheitswerte (past_days), deckt aber hoechstens 92 Tage ab -
// zu wenig fuer eine seit Saisonbeginn (1. Januar) laufende Summe.

export interface OpenMeteoTag {
  datum: string;
  tempMinC: number | null;
  tempMaxC: number | null;
  niederschlagMm: number | null;
}

interface OpenMeteoAntwort {
  daily?: {
    time: string[];
    temperature_2m_min: (number | null)[];
    temperature_2m_max: (number | null)[];
    precipitation_sum: (number | null)[];
  };
}

function tageAusAntwort(daten: OpenMeteoAntwort): OpenMeteoTag[] {
  if (!daten.daily) return [];
  const { time, temperature_2m_min, temperature_2m_max, precipitation_sum } = daten.daily;
  return time.map((datum, i) => ({
    datum,
    tempMinC: temperature_2m_min[i] ?? null,
    tempMaxC: temperature_2m_max[i] ?? null,
    niederschlagMm: precipitation_sum[i] ?? null,
  }));
}

// Wirft nie: ein Ausfall des Wetterdienstes darf die Aktion nicht mit einem
// 5xx scheitern lassen, derselbe Grundsatz wie beim KI-Anbieter
// (sendeChatAnfrage). Eine leere Liste ist das stille Fehlersignal.
async function ladeTage(url: URL): Promise<OpenMeteoTag[]> {
  try {
    const antwort = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!antwort.ok) return [];
    return tageAusAntwort((await antwort.json()) as OpenMeteoAntwort);
  } catch (error) {
    console.error("[damicon] Open-Meteo-Abfrage fehlgeschlagen:", error);
    return [];
  }
}

// Beliebiger Datumsbereich in der Vergangenheit (YYYY-MM-DD, jeweils
// inklusive) - traegt die Saison seit dem 1. Januar.
export async function ladeOpenMeteoArchiv(
  breitengrad: number,
  laengengrad: number,
  startDatum: string,
  endDatum: string,
): Promise<OpenMeteoTag[]> {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(breitengrad));
  url.searchParams.set("longitude", String(laengengrad));
  url.searchParams.set("start_date", startDatum);
  url.searchParams.set("end_date", endDatum);
  url.searchParams.set("daily", "temperature_2m_min,temperature_2m_max,precipitation_sum");
  url.searchParams.set("timezone", "auto");
  return ladeTage(url);
}

// Die juengsten Tage inklusive heute - die Archiv-API hat dafuer noch keine
// Werte, deshalb der zweite Endpunkt.
export async function ladeOpenMeteoAktuell(
  breitengrad: number,
  laengengrad: number,
  pastDays: number,
): Promise<OpenMeteoTag[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(breitengrad));
  url.searchParams.set("longitude", String(laengengrad));
  url.searchParams.set("daily", "temperature_2m_min,temperature_2m_max,precipitation_sum");
  url.searchParams.set("past_days", String(Math.min(92, Math.max(0, pastDays))));
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "auto");
  return ladeTage(url);
}
