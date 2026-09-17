"use client";

import dynamic from "next/dynamic";
import type { TourStopp } from "@/lib/domain/tourenplanung";

// react-leaflet greift beim Import auf window/document zu - ssr:false ist nur
// aus einer Client-Komponente heraus erlaubt (Next.js App Router), deshalb
// dieser duenne Zwischenschritt statt des direkten Imports in der Server
// Component (logistik-ansicht.tsx).
const TourKarteInner = dynamic(
  () => import("@/components/db/tour-karte-inner").then((m) => m.TourKarteInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 items-center justify-center rounded-xl border border-border bg-muted/30 text-xs text-muted-foreground">
        Karte wird geladen …
      </div>
    ),
  },
);

export function TourKarte({
  stopps,
  geometrie,
}: {
  stopps: TourStopp[];
  geometrie: GeoJSON.LineString | null;
}) {
  return <TourKarteInner stopps={stopps} geometrie={geometrie} />;
}
