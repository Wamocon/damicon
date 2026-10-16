"use client";

import { useCallback, useRef, useState } from "react";
import { datenSuchen } from "@/lib/actions/suche";
import type { DatenStand } from "@/lib/suche/daten";

// Der Zustand der Datensuche im Suchfenster: das letzte Ergebnis, ob gerade
// gesucht wird und ob es misslang. Die Abfrage selbst laeuft als Server Action
// (lib/actions/suche.ts) und wird nur auf Wunsch ausgeloest, nicht bei jedem
// Tastendruck.

export type DatenFehler = "anmeldung" | "nichtVerfuegbar" | "fehler";

export interface DatenSucheZustand {
  stand: DatenStand | null;
  laedt: boolean;
  fehler: DatenFehler | null;
  suchen: (begriff: string) => void;
}

export function useDatenSuche(): DatenSucheZustand {
  const [stand, setStand] = useState<DatenStand | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<DatenFehler | null>(null);
  // Nur die juengste Abfrage zaehlt: wer waehrend der Suche weitertippt und
  // noch einmal sucht, soll nicht das Ergebnis der aelteren Abfrage sehen.
  const laufnummer = useRef(0);

  const suchen = useCallback((begriff: string) => {
    const nummer = ++laufnummer.current;
    setLaedt(true);
    setFehler(null);
    datenSuchen(begriff)
      .then((antwort) => {
        if (nummer !== laufnummer.current) return;
        if (antwort.ok) {
          setStand({ begriff: antwort.begriff, treffer: antwort.treffer });
        } else {
          setFehler(antwort.grund === "zuKurz" ? "fehler" : antwort.grund);
        }
      })
      .catch(() => {
        if (nummer === laufnummer.current) setFehler("fehler");
      })
      .finally(() => {
        if (nummer === laufnummer.current) setLaedt(false);
      });
  }, []);

  return { stand, laedt, fehler, suchen };
}
