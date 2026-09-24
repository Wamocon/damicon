import { zerlegeAnfrage } from "./kern";
import {
  sucheInTexten,
  sucheSeiten,
  type SeitenZiel,
  type ZielSchluessel,
} from "./seiten-ziele";
import { zuletztAufloesen } from "./zuletzt";

// Was das Suchfenster zu einer Eingabe zeigt, ohne React: die Gruppen der
// Trefferliste, die Zahl fuer die Ansage und ein Hinweis, wenn die Liste
// leer bleibt. Rein, damit die Regeln im Test stehen und nicht nur im
// Browser zu sehen sind (supabase/tests/suche.ts).
//
// Mit Eingabe bis zu drei Gruppen: die Namenstreffer, darunter "Erwaehnt in"
// mit Seiten, deren Text den Begriff nennt, und wenn beides leer bleibt die
// Frage an die KI. Ohne Eingabe die zuletzt geoeffneten Seiten.

export type SuchOption =
  | { art: "ziel"; ziel: SeitenZiel; auszug?: string }
  | { art: "ki"; begriff: string };

/** Zugleich Schluessel der Gruppe in der Liste; die Ueberschrift haengt daran. */
export type GruppenArt = "treffer" | "erwaehnt" | "ki" | "zuletzt";

export interface SuchGruppe {
  art: GruppenArt;
  optionen: SuchOption[];
}

export interface SuchErgebnis {
  /** Nur Gruppen mit mindestens einer Option, in dieser Reihenfolge. */
  gruppen: SuchGruppe[];
  /** Gefundene Seiten fuer die Ansage, null ohne Eingabe. */
  anzahl: number | null;
  /** Steht statt der Liste da, wenn sie leer bleibt. */
  hinweis: "keineTreffer" | "leer" | null;
}

// Ein einzelner Buchstabe ist keine Frage an die KI.
export const KI_AB = 2;

export function baueSuchErgebnis({
  ziele,
  begriff,
  zuletzt,
  offeneSeite,
  kiVerfuegbar,
}: {
  ziele: readonly SeitenZiel[];
  /** Die Eingabe ohne Leerraum an den Enden. */
  begriff: string;
  zuletzt: readonly string[];
  offeneSeite: ZielSchluessel | null;
  kiVerfuegbar: boolean;
}): SuchErgebnis {
  const anfrage = zerlegeAnfrage(begriff);
  if (!anfrage) {
    const zuletztZiele = zuletztAufloesen(zuletzt, ziele, offeneSeite);
    return {
      gruppen: gefuellt([{ art: "zuletzt", optionen: zuletztZiele.map(alsOption) }]),
      anzahl: null,
      hinweis: zuletztZiele.length === 0 ? "leer" : null,
    };
  }

  const namen = sucheSeiten(ziele, anfrage);
  const erwaehnt = sucheInTexten(
    ziele,
    anfrage,
    new Set<ZielSchluessel>(namen.map((ziel) => ziel.schluessel)),
  );
  const anzahl = namen.length + erwaehnt.length;
  const kiZeile = anzahl === 0 && kiVerfuegbar && begriff.length >= KI_AB;
  return {
    gruppen: gefuellt([
      { art: "treffer", optionen: namen.map(alsOption) },
      {
        art: "erwaehnt",
        optionen: erwaehnt.map(({ ziel, auszug }): SuchOption => ({ art: "ziel", ziel, auszug })),
      },
      { art: "ki", optionen: kiZeile ? [{ art: "ki", begriff }] : [] },
    ]),
    anzahl,
    hinweis: anzahl === 0 ? "keineTreffer" : null,
  };
}

function alsOption(ziel: SeitenZiel): SuchOption {
  return { art: "ziel", ziel };
}

function gefuellt(gruppen: SuchGruppe[]): SuchGruppe[] {
  return gruppen.filter((gruppe) => gruppe.optionen.length > 0);
}
