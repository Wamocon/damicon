"use client";

import Image from "next/image";
import { medienErlaubt, useBrowserBedingung } from "@/lib/bewegung";

// Echtes Rundgangsmaterial aus der Plantage statt eines Stockfotos oder einer
// gezeichneten Animation - übernommen aus dem parallelen Projekt
// "Digitalisierung-Himbeerenbetrieb", das dafür bereits vor Ort gedreht hat.
// Bewusst ohne die dortige mehraktige Notations-Choreografie (die ist an
// exakt vermessene Bildkoordinaten dieses einen Schnitts gebunden) - hier
// läuft das Material als ruhige Endlosschleife im Hintergrund. Reduzierte
// Bewegung und langsame Verbindung zeigen stattdessen nur das Standbild; die
// Regeln dafuer stehen in lib/bewegung.ts und gelten fuer alle bewegten
// Medien der Seite.

export function HeroVideo({ className }: { className?: string }) {
  const zeigeVideo = useBrowserBedingung(medienErlaubt);

  // Kein eigenes "relative" hier: der Aufrufer bestimmt die Positionierung
  // (typischerweise "absolute inset-0" innerhalb einer Bühne mit eigenem
  // position-Kontext). Ein zusaetzliches "relative" auf demselben Element
  // widerspraeche dem und lieferte je nach Tailwind-Regelreihenfolge eine
  // Hoehe von 0 - das Bild und Video haetten dann nichts zum Ausfuellen.
  return (
    <div className={`overflow-hidden ${className ?? ""}`}>
      <Image
        src="/hero-standbild.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {zeigeVideo ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/hero-standbild.webp"
        >
          <source src="/hero-himbeere.mp4" type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
