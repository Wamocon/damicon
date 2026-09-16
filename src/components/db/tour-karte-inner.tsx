"use client";

import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { WETTER_BREITENGRAD, WETTER_LAENGENGRAD } from "@/lib/domain/wetter";
import type { TourStopp } from "@/lib/domain/tourenplanung";

// Anforderung 3.5: Kartendarstellung der optimierten Tour. Eigene
// divIcon-Marker statt Leaflets Standard-Bildern - die verweisen relativ auf
// Bilddateien im Paket, die Next.js/Webpack ohne Zusatzkonfiguration nicht
// aufloest (bekannte Standardfalle bei react-leaflet in Next.js).
function nummerIcon(nummer: number | string, farbe: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${farbe};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:bold 12px sans-serif;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)">${nummer}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export function TourKarteInner({
  stopps,
  geometrie,
}: {
  stopps: TourStopp[];
  geometrie: GeoJSON.LineString | null;
}) {
  const betrieb: [number, number] = [WETTER_BREITENGRAD, WETTER_LAENGENGRAD];
  const stoppsMitKoordinaten = stopps.filter(
    (s): s is TourStopp & { breitengrad: number; laengengrad: number } =>
      s.breitengrad !== null && s.laengengrad !== null,
  );

  const linie: [number, number][] | null = geometrie
    ? geometrie.coordinates.map(([lon, lat]) => [lat, lon])
    : null;

  return (
    <MapContainer
      center={betrieb}
      zoom={11}
      scrollWheelZoom={false}
      style={{ height: "320px", width: "100%", borderRadius: "0.75rem" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={betrieb} icon={nummerIcon("B", "#166534")}>
        <Tooltip>Betrieb</Tooltip>
      </Marker>
      {stoppsMitKoordinaten.map((s, i) => (
        <Marker key={s.lieferungId} position={[s.breitengrad, s.laengengrad]} icon={nummerIcon(i + 1, "#1d4ed8")}>
          <Tooltip>
            {i + 1}. {s.kunde} ({s.mengeKg} kg)
          </Tooltip>
        </Marker>
      ))}
      {linie ? <Polyline positions={linie} color="#1d4ed8" weight={4} opacity={0.7} /> : null}
    </MapContainer>
  );
}
