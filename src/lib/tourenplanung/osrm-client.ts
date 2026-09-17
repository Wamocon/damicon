// OSRM (Open Source Routing Machine): kostenloser oeffentlicher Demo-Server,
// kein API-Key. Der "trip"-Dienst loest ein Rundreiseproblem (Travelling
// Salesman) - anders als der reine "route"-Dienst legt er die Reihenfolge der
// Stopps selbst optimal fest, das ist die eigentliche Routenoptimierung
// (Anforderung 3.5, Nutzer-Entscheidung "echte Routenoptimierung mit Karte").
//
// Nur eine Demo-Instanz mit Kapazitaetsgrenzen - fuer den Produktivbetrieb
// spaeter gegen eine selbst gehostete OSRM-Instanz oder einen bezahlten
// Dienst tauschbar, ohne dass sich das Datenmodell (touren.routen_geometrie)
// aendern muesste.

export interface Wegpunkt {
  breitengrad: number;
  laengengrad: number;
}

export interface OsrmTrip {
  /** Wegpunkte in der von OSRM optimierten Reihenfolge, als Index in das urspruengliche Array. */
  reihenfolge: number[];
  distanzKm: number;
  dauerMinuten: number;
  /** GeoJSON-LineString der gesamten Route, direkt fuer Leaflet nutzbar. */
  geometrie: GeoJSON.LineString | null;
}

interface OsrmTripAntwort {
  code: string;
  trips?: { distance: number; duration: number; geometry: GeoJSON.LineString }[];
  waypoints?: { waypoint_index: number }[];
}

// Wirft nie - ein Ausfall des Routingdienstes darf die Tourenplanung nicht
// mit einem 5xx scheitern lassen, derselbe Grundsatz wie bei Wetter/Geokodierung.
// null ist das stille Fehlersignal.
export async function berechneOptimierteTour(wegpunkte: Wegpunkt[]): Promise<OsrmTrip | null> {
  if (wegpunkte.length < 2) return null;

  const koordinaten = wegpunkte.map((w) => `${w.laengengrad},${w.breitengrad}`).join(";");
  const url = new URL(`https://router.project-osrm.org/trip/v1/driving/${koordinaten}`);
  // source=first: die Tour beginnt am Betrieb (erster Wegpunkt), nicht an
  // einem von OSRM frei gewaehlten Startpunkt.
  url.searchParams.set("source", "first");
  url.searchParams.set("roundtrip", "true");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");

  try {
    const antwort = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!antwort.ok) return null;

    const daten = (await antwort.json()) as OsrmTripAntwort;
    if (daten.code !== "Ok" || !daten.trips?.[0] || !daten.waypoints) return null;

    const trip = daten.trips[0];
    return {
      reihenfolge: daten.waypoints.map((w) => w.waypoint_index),
      distanzKm: Math.round((trip.distance / 1000) * 10) / 10,
      dauerMinuten: Math.round(trip.duration / 60),
      geometrie: trip.geometry ?? null,
    };
  } catch (error) {
    console.error("[damicon] Routenoptimierung fehlgeschlagen:", error);
    return null;
  }
}
