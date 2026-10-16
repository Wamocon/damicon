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
  /**
   * Fahrzeit der Teilstrecken in Sekunden, in der Reihenfolge der Route: zuerst vom Start zum ersten Stopp, zuletzt vom
   * letzten Stopp zurueck zum Start. Leer, wenn der Dienst sie nicht liefert.
   */
  teilstreckenSekunden: number[];
}

interface OsrmTripAntwort {
  code: string;
  trips?: { distance: number; duration: number; geometry: GeoJSON.LineString; legs?: { duration: number }[] }[];
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
      teilstreckenSekunden: (trip.legs ?? []).map((l) => l.duration),
    };
  } catch (error) {
    console.error("[damicon] Routenoptimierung fehlgeschlagen:", error);
    return null;
  }
}

/**
 * Geschaetzte Fahrzeit in Minuten vom ersten Stopp bis zurueck zum Start (bei der Abholrunde: ins Kuehlhaus), ohne die Anfahrt
 * zum ersten Stopp. Ohne Teilstrecken (der Dienst lieferte keine) null.
 */
export function minutenAbErstemStopp(trip: Pick<OsrmTrip, "teilstreckenSekunden">): number | null {
  const strecken = trip.teilstreckenSekunden;
  if (strecken.length < 2) return null;
  return Math.round(strecken.slice(1).reduce((a, b) => a + b, 0) / 60);
}

/**
 * Die Position jedes Stopps in der optimierten Route (0-basiert), in der Reihenfolge der Eingabe ohne den Startpunkt.
 *
 * OSRM liefert je Eingabepunkt den Index seiner Position in der Route (waypoint_index), nicht die Eingabe je Position: wer
 * "reihenfolge" in der Reihenfolge der Route lesen will, muss sie erst umkehren. Bei source=first steht der Start auf Position 0,
 * die Stopps beginnen bei 1.
 */
export function stoppPositionen(reihenfolge: number[]): number[] {
  return reihenfolge.slice(1).map((position) => position - 1);
}
