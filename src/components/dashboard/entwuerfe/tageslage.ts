// Offene Vorgaenge, je Zone. Die Route zaehlt sie serverseitig aus denselben
// Tabellen, aus denen die Module lesen; hier steht nur, welche Zahl zu welcher
// Zone gehoert und wohin sie fuehrt.
import type { Resource } from "@/lib/rbac";
import type { ZoneKey } from "@/lib/modules";

export interface Tageslage {
  /** Feld: Pflueckaufgaben, die nicht abgeschlossen sind. */
  aufgabenOffen: number;
  /** Feld: Reihenbloecke mit laufender Wartezeit nach Pflanzenschutz. */
  bloeckeGesperrt: number;
  /** Feld: davon solche, deren Wartezeit abgelaufen ist. */
  bloeckeFaellig: number;
  /** Hof: Chargen, die noch auf die Vorkuehlung warten. */
  chargenOhneKuehlung: number;
  /** Buero: Dokumente mit Status abgelaufen. */
  dokumenteAbgelaufen: number;
  /** Markt: Reklamationen offen oder in Pruefung. */
  reklamationenOffen: number;
}

export interface Vorgang {
  key: string;
  resource: Resource;
  pfad: string;
  anzahl: number;
  ton: "danger" | "warning" | "info";
  /** Zusatz unter der Zahl, wenn es etwas zu sagen gibt. */
  zusatzKey?: string;
  zusatzAnzahl?: number;
}

export function vorgaengeFuerZone(
  zone: ZoneKey,
  lage: Tageslage,
): Vorgang[] {
  switch (zone) {
    case "feld":
      return [
        {
          key: "aufgabenOffen",
          resource: "pflueckaufgaben",
          pfad: "/dashboard/feld/pflueckaufgaben",
          anzahl: lage.aufgabenOffen,
          ton: "info",
        },
        {
          key: "bloeckeGesperrt",
          resource: "reihenbloecke",
          pfad: "/dashboard/feld/reihenbloecke",
          anzahl: lage.bloeckeGesperrt,
          ton: lage.bloeckeFaellig > 0 ? "warning" : "info",
          zusatzKey: lage.bloeckeFaellig > 0 ? "bloeckeFaellig" : undefined,
          zusatzAnzahl: lage.bloeckeFaellig,
        },
      ];
    case "hof":
      return [
        {
          key: "chargenOhneKuehlung",
          resource: "kuehlkette",
          pfad: "/dashboard/hof/kuehlkette",
          anzahl: lage.chargenOhneKuehlung,
          ton: "warning",
        },
      ];
    case "buero":
      return [
        {
          key: "dokumenteAbgelaufen",
          resource: "dokumente",
          pfad: "/dashboard/buero/dokumente",
          anzahl: lage.dokumenteAbgelaufen,
          ton: "danger",
        },
      ];
    case "markt":
      return [
        {
          key: "reklamationenOffen",
          resource: "reklamationen",
          pfad: "/dashboard/markt/reklamationen",
          anzahl: lage.reklamationenOffen,
          ton: "warning",
        },
      ];
  }
}
