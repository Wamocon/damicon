import { kennzahlen } from "@/lib/pruefung/befund";
import { PRUEFBEREICHE, type Pruefbereich } from "@/lib/pruefung/rollen";
import type { Bericht, Kennzahlen } from "@/lib/pruefung/typen";

// Die vier Bereichskacheln im Reiter "CEO-Compliance", abgeleitet aus dem gespeicherten
// Pruefbericht. Rein und ohne React, damit die Ableitung ohne Datenbank und ohne Modell
// pruefbar ist (supabase/tests/tagesbericht.ts) - dasselbe Muster wie domain/risikoradar.ts.
//
// Hier stand bis zum 23.09.2026 zusaetzlich eine eigene, knappe Fassung der Zusammenfassung.
// Sie ist entfallen: der Kopf oberhalb der Reiterleiste zeigt jetzt 1:1 die Fassung aus main
// (Kopfkarte und Prioritaeten aus pruefung-bericht.tsx).
//
// Robustheit: lib/data/compliance-ceo.ts nimmt die jsonb-Spalte ungeprueft mit "as Bericht"
// entgegen. Eine aeltere oder beschnittene Zeile darf die Startseite nicht kippen, deshalb
// greift hier alles defensiv zu.

export interface Bereichskachel {
  bereich: Pruefbereich;
  /** false: der Bericht fuehrt diesen Bereich nicht - die Kachel zeigt "nicht geprueft", keine Reife. */
  geprueft: boolean;
  anzahl: number;
  kz: Kennzahlen | null;
  /** Fuer jeden Pruefpunkt dieses Bereichs fehlten die Betriebsdaten. Eine Reife von 100 waere hier gelogen. */
  ohneDaten: boolean;
}

/**
 * Eine Kachel je Pruefbereich, immer alle vier und immer in derselben Reihenfolge. Eine Kachel,
 * die taeglich die Position wechselt, macht die Seite unlesbar - deshalb wird hier bewusst NICHT
 * nach Schwere sortiert.
 */
export function bereichskacheln(bericht: Bericht | null): Bereichskachel[] {
  return PRUEFBEREICHE.map((bereich) => {
    const gefuehrt = Array.isArray(bericht?.bereiche) && bericht.bereiche.includes(bereich);
    if (!bericht || !gefuehrt || !Array.isArray(bericht.befunde)) {
      return { bereich, geprueft: false, anzahl: 0, kz: null, ohneDaten: false };
    }
    const befunde = bericht.befunde.filter((b) => b.bereich === bereich);
    return {
      bereich,
      geprueft: true,
      anzahl: befunde.length,
      kz: kennzahlen(befunde),
      // Nur wenn JEDER Punkt ohne Betriebsdaten blieb. Ein einzelner reicht nicht:
      // die Reife der uebrigen ist dann echt.
      ohneDaten: befunde.length > 0 && befunde.every((b) => b.ohneDaten === true),
    };
  });
}
