import type { IcsTermin } from "@/lib/domain/ics";

// Lieferplan als Kalenderdatei (WMCNL-1472): welche Termine in die Datei kommen.
// Rein, ohne Datenbank; die Daten laedt lib/data/lieferplan.ts, den Text der
// Datei baut domain/ics.ts.
//
// Zwei Quellen, ohne Doppelungen:
//   * Lieferungen, die geplant sind und auf einer Tour liegen: der Tag der Tour ist der
//     Liefertag. Das ist der feste Termin.
//   * Vorbestellungen mit Wunschtermin, solange sie angefragt oder bestaetigt sind. Eine
//     Vorbestellung, zu der schon eine geplante Lieferung auf einer Tour gehoert, steht nicht
//     noch einmal da: dort gilt der Tag der Tour, nicht der Wunsch.
// Vergangene Tage fehlen: der Plan zeigt, was kommt.

export interface PlanLieferung {
  id: string;
  vorbestellungId: string | null;
  status: string;
  mengeKg: number;
  /** Tag der Tour, auf der die Lieferung liegt; null ohne Tour. */
  tourDatum: string | null;
  kunde: string | null;
}

export interface PlanVorbestellung {
  id: string;
  status: string;
  mengeKg: number;
  liefertermin: string | null;
  sorte: string | null;
  kunde: string | null;
}

export interface LieferplanQuelle {
  lieferungen: readonly PlanLieferung[];
  vorbestellungen: readonly PlanVorbestellung[];
}

/** Die Beschriftung eines Termins: die Datei traegt sie in der Sprache der Person, die sie abruft. */
export type Beschriftung = (
  art: "lieferung" | "vorbestellung",
  daten: { mengeKg: number; sorte: string | null; kunde: string | null; status: string },
) => { titel: string; beschreibung: string };

const UID_ENDUNG = "@damicon";

export function lieferplanTermine(
  quelle: LieferplanQuelle,
  heute: string,
  beschrifte: Beschriftung,
): IcsTermin[] {
  const feste = quelle.lieferungen.filter((l) => l.status === "geplant" && l.tourDatum !== null && l.tourDatum >= heute);
  const mitTour = new Set(feste.map((l) => l.vorbestellungId).filter((id): id is string => id !== null));

  // Die Sorte einer Lieferung kennt nur ihre Vorbestellung.
  const sorteJeVorbestellung = new Map(quelle.vorbestellungen.map((v) => [v.id, v.sorte]));

  const termine: IcsTermin[] = [
    ...feste.map((l): IcsTermin => ({
      uid: `lieferung-${l.id}${UID_ENDUNG}`,
      tag: l.tourDatum as string,
      zustand: "CONFIRMED",
      ...beschrifte("lieferung", {
        mengeKg: l.mengeKg,
        sorte: l.vorbestellungId ? (sorteJeVorbestellung.get(l.vorbestellungId) ?? null) : null,
        kunde: l.kunde,
        status: l.status,
      }),
    })),
    ...quelle.vorbestellungen
      .filter(
        (v) =>
          (v.status === "angefragt" || v.status === "bestaetigt") &&
          v.liefertermin !== null &&
          v.liefertermin >= heute &&
          !mitTour.has(v.id),
      )
      .map((v): IcsTermin => ({
        uid: `vorbestellung-${v.id}${UID_ENDUNG}`,
        tag: v.liefertermin as string,
        // Angefragt ist noch nicht zugesagt: im Kalender als "vorlaeufig".
        zustand: v.status === "bestaetigt" ? "CONFIRMED" : "TENTATIVE",
        ...beschrifte("vorbestellung", { mengeKg: v.mengeKg, sorte: v.sorte, kunde: v.kunde, status: v.status }),
      })),
  ];

  return termine.sort((a, b) => (a.tag === b.tag ? a.uid.localeCompare(b.uid) : a.tag.localeCompare(b.tag)));
}
