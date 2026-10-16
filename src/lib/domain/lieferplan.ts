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

/** Ein Termin des Plans, unabhaengig von der Ausgabe (Kalenderdatei oder Dokument). */
export interface PlanEintrag {
  id: string;
  art: "lieferung" | "vorbestellung";
  /** Liefertag (JJJJ-MM-TT): der Tag der Tour bei einer Lieferung, der Wunschtermin bei einer Vorbestellung. */
  tag: string;
  status: string;
  kunde: string | null;
  sorte: string | null;
  mengeKg: number;
}

/**
 * Die Termine des Plans, unsortiert: die EINE Regel fuer Kalenderdatei und Dokument. Bis zum 15.10.2026 stand sie in zwei Kopien, und die des Dokuments
 * hatte den Statusfilter der Vorbestellungen nicht (eine stornierte Vorbestellung stuende dort als "angefragt"; nur der Lader schuetzte davor).
 */
export function lieferplanEintraege(quelle: LieferplanQuelle, heute: string): PlanEintrag[] {
  const feste = quelle.lieferungen.filter((l) => l.status === "geplant" && l.tourDatum !== null && l.tourDatum >= heute);
  const mitTour = new Set(feste.map((l) => l.vorbestellungId).filter((id): id is string => id !== null));

  // Die Sorte einer Lieferung kennt nur ihre Vorbestellung.
  const sorteJeVorbestellung = new Map(quelle.vorbestellungen.map((v) => [v.id, v.sorte]));

  return [
    ...feste.map(
      (l): PlanEintrag => ({
        id: l.id,
        art: "lieferung",
        tag: l.tourDatum as string,
        status: l.status,
        kunde: l.kunde,
        sorte: l.vorbestellungId ? (sorteJeVorbestellung.get(l.vorbestellungId) ?? null) : null,
        mengeKg: l.mengeKg,
      }),
    ),
    ...quelle.vorbestellungen
      .filter((v) => (v.status === "angefragt" || v.status === "bestaetigt") && v.liefertermin !== null && v.liefertermin >= heute && !mitTour.has(v.id))
      .map((v): PlanEintrag => ({ id: v.id, art: "vorbestellung", tag: v.liefertermin as string, status: v.status, kunde: v.kunde, sorte: v.sorte, mengeKg: v.mengeKg })),
  ];
}

export function lieferplanTermine(
  quelle: LieferplanQuelle,
  heute: string,
  beschrifte: Beschriftung,
): IcsTermin[] {
  const termine = lieferplanEintraege(quelle, heute).map(
    (e): IcsTermin => ({
      uid: `${e.art}-${e.id}${UID_ENDUNG}`,
      tag: e.tag,
      // Eine Lieferung auf einer Tour ist fest; eine angefragte Vorbestellung noch nicht zugesagt: im Kalender als "vorlaeufig".
      zustand: e.art === "lieferung" || e.status === "bestaetigt" ? "CONFIRMED" : "TENTATIVE",
      ...beschrifte(e.art, { mengeKg: e.mengeKg, sorte: e.sorte, kunde: e.kunde, status: e.status }),
    }),
  );

  return termine.sort((a, b) => (a.tag === b.tag ? a.uid.localeCompare(b.uid) : a.tag.localeCompare(b.tag)));
}
