// Nominatim (nominatim.openstreetmap.org): kostenlose Geokodierung ohne
// API-Key, derselbe OSM-Datenbestand wie bei OSRM. Nutzungsbedingungen
// verlangen einen aussagekraeftigen User-Agent statt des Standard-Fetch-
// Headers - https://operations.osmfoundation.org/policies/nominatim/.

export interface GeokodierungsErgebnis {
  breitengrad: number;
  laengengrad: number;
}

// Wirft nie: ein Ausfall des Geokodierungsdienstes oder eine nicht auffindbare
// Adresse darf das Anlegen/Aktualisieren eines Kunden nicht mit einem 5xx
// scheitern lassen - derselbe Grundsatz wie beim Wetterdienst und beim
// KI-Anbieter. null ist das stille Fehlersignal, die Aktion setzt
// geokodiert_am dann bewusst nicht.
export async function geokodiereAdresse(adresse: string): Promise<GeokodierungsErgebnis | null> {
  if (!adresse.trim()) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", adresse);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  try {
    const antwort = await fetch(url, {
      headers: { "User-Agent": "Damicon/1.0 (WAMOCON GmbH, Himbeerbetrieb Almaty)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!antwort.ok) return null;

    const treffer = (await antwort.json()) as { lat: string; lon: string }[];
    const erster = treffer[0];
    if (!erster) return null;

    const breitengrad = Number(erster.lat);
    const laengengrad = Number(erster.lon);
    if (!Number.isFinite(breitengrad) || !Number.isFinite(laengengrad)) return null;

    return { breitengrad, laengengrad };
  } catch (error) {
    console.error("[damicon] Geokodierung fehlgeschlagen:", error);
    return null;
  }
}
