"use client";

import { useCallback, useRef } from "react";
import type { DemoSprache } from "@/lib/demo/drehbuch";

// Der Ton der Vorführung als Dateien im Speicher des Browsers: ein Abruf je Schritt und Sprache, dann
// gemerkt. Der Player holt den Ton der nächsten Schritte schon, während der aktuelle läuft.
//
// Die Schritte im Voraus laufen nacheinander, nicht gleichzeitig: mehrere Anfragen auf einmal werden
// vom Sprachdienst gern abgewiesen, und dann sprach die Route mit der Ersatzstimme, ein Schritt klang
// plötzlich anders. Der Ton des laufenden Schritts geht sofort, daneben läuft höchstens einer im
// Hintergrund. Ein Fehlschlag wird nicht gemerkt, ein erneuter Lauf versucht es noch einmal.

export type HoleTon = (id: string, sprache: DemoSprache, imHintergrund?: boolean) => Promise<Blob | null>;

export function useTonSpeicher(): HoleTon {
  const speicher = useRef(new Map<string, Promise<Blob | null>>());
  const kette = useRef<Promise<void>>(Promise.resolve());

  return useCallback<HoleTon>((id, sprache, imHintergrund = false) => {
    const schluessel = `${sprache}:${id}`;
    const vorhanden = speicher.current.get(schluessel);
    if (vorhanden) return vorhanden;
    const lade = () =>
      fetch(`/api/demo-sprachausgabe?schritt=${encodeURIComponent(id)}&sprache=${sprache}`)
        .then((antwort) => (antwort.ok ? antwort.blob() : null))
        .catch(() => null);
    const abruf = (imHintergrund ? kette.current.then(lade, lade) : lade()).then((blob) => {
      if (!blob) speicher.current.delete(schluessel);
      return blob;
    });
    if (imHintergrund) kette.current = abruf.then(() => undefined);
    speicher.current.set(schluessel, abruf);
    return abruf;
  }, []);
}
