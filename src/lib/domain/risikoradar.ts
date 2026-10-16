import type { NachweisFrist } from "./nachweise";
import { betriebsZeitzone } from "./tageszeit";
import { wandzeitZuUtc } from "@/lib/listen/zeitraum";

// Risiko-Radar: die EINE Stelle, an der alle gesetzlichen Fristen aus
// unterschiedlichen Fachdomaenen (MwSt, ESUTD, Datenschutz) zusammenlaufen.
// Reine Typen/Sortierlogik ohne Server-Import, damit compliance-ansicht.tsx
// (Compliance-Fristen), data/mwst.ts (MwSt-Frist) und data/esutd.ts
// (ESUTD-Fristen) unabhaengig bleiben - diese Datei fuegt nur zusammen, was
// anderswo bereits geladen wurde, sie laedt selbst nichts.

export type RisikoKategorie = "steuer" | "arbeit" | "datenschutz" | "nachweis";

export interface RisikoEintrag {
  id: string;
  kategorie: RisikoKategorie;
  label: string;
  faelligkeit: string;
  /** Direktlink zum Modul, das die Frist bearbeitet - der Radar selbst
   *  bearbeitet nichts, er zeigt nur und verweist weiter. */
  ziel: string;
}

// Sortierung: ueberfaellig (nach Alter, aeltester Verstoss zuerst) vor noch
// offen (nach Naehe, dringendster zuerst) - dieselbe Grundregel wie ein
// Posteingang, der Ungelesenes nicht nach Eingangszeit allein zeigt.
// "jetzt" als Parameter statt intern Date.now() aufzurufen: rein testbar mit
// einem festen Zeitpunkt, siehe supabase/tests-aequivalent im TS-Teil.
export function risikoSortieren(eintraege: RisikoEintrag[], jetzt: number): RisikoEintrag[] {
  return [...eintraege].sort((a, b) => {
    const aZeit = new Date(a.faelligkeit).getTime();
    const bZeit = new Date(b.faelligkeit).getTime();
    const aUeberfaellig = aZeit < jetzt;
    const bUeberfaellig = bZeit < jetzt;
    if (aUeberfaellig !== bUeberfaellig) return aUeberfaellig ? -1 : 1;
    // Innerhalb derselben Gruppe (beide ueberfaellig oder beide offen) gilt in
    // beiden Faellen aufsteigend nach Zeit: bei ueberfaelligen ist das der
    // aelteste Verstoss zuerst (kleinster Zeitwert zuerst), bei offenen der
    // naechste faellige Termin zuerst (ebenfalls kleinster Zeitwert zuerst).
    // Beide Zweige des vorherigen Ternarys rechneten bereits dasselbe.
    return aZeit - bZeit;
  });
}

export interface RisikoEintragBewertet extends RisikoEintrag {
  ueberfaellig: boolean;
}

export interface RisikoAufbereitet {
  sortiert: RisikoEintragBewertet[];
  ueberfaelligAnzahl: number;
}

// Buendelt den einzigen unreinen Schritt (Date.now()) in einer gewoehnlichen
// Funktion statt im Rumpf der Server-Komponente risiko-radar.tsx - eine
// React-Server-Komponente darf waehrend des Renderns keine unreine Funktion
// direkt aufrufen (react-hooks/purity), eine importierte Funktion wie diese
// hier schon. "ueberfaellig" wird hier einmalig festgestellt und
// mitgegeben, damit die Komponente selbst keinen zweiten Date.now()-Aufruf
// braucht.
/** Eine einzelne Quellenzeile, unabhaengig davon, aus welcher Fachdomaene sie
 *  stammt - baueRisikoEintraege() unten formt daraus die einheitlichen
 *  RisikoEintrag-Objekte. Damit steht die Zusammenfuehrlogik an EINER Stelle
 *  statt zweimal (compliance-ansicht.tsx und src/lib/ai/tools.ts hatten sie
 *  sonst unabhaengig voneinander nachgebaut). */
export interface RisikoRohdaten {
  mwstMeldefristAm: string | null;
  mwstRegistriert: boolean;
  esutdFristen: { id: string; pfluecker: string; meldefristAm: string; art?: "abschluss" | "aenderung" | "beendigung" }[];
  vorfaelleUeberfaellig: { id: string; meldefristAm: string | null }[];
  drittweitergabenUeberfaellig: { id: string; empfaenger: string; benachrichtigungsfristAm: string | null }[];
  /** Abgelaufene und bald ablaufende Nachweise aus dem Register (WMCNL-1469). */
  nachweise: NachweisFrist[];
}

/**
 * Der Nachweis gilt bis einschliesslich seines letzten Tages, die Frist endet
 * also mit dem Ende dieses Tages in der Betriebszeitzone, nicht um Mitternacht
 * davor: sonst stuende ein Zertifikat, das heute noch gilt, schon als
 * ueberfaellig im Radar.
 */
export function nachweisFaelligkeit(gueltigBis: string): string {
  return wandzeitZuUtc(`${gueltigBis}T23:59:59`, betriebsZeitzone)?.toISOString() ?? `${gueltigBis}T23:59:59Z`;
}

export async function baueRisikoEintraege(rohdaten: RisikoRohdaten): Promise<RisikoEintrag[]> {
  const { getTranslations } = await import("next-intl/server");
  const t = await getTranslations("complianceAnsicht.risikoRadar");

  return [
    ...(rohdaten.mwstMeldefristAm && !rohdaten.mwstRegistriert
      ? [
          {
            id: "mwst-registrierung",
            kategorie: "steuer" as const,
            label: t("labelMwst"),
            faelligkeit: rohdaten.mwstMeldefristAm,
            ziel: "/dashboard/buero/compliance#mwst-registrierung",
          },
        ]
      : []),
    ...rohdaten.esutdFristen.map((e) => ({
      id: `esutd-${e.id}`,
      kategorie: "arbeit" as const,
      label: t(e.art === "aenderung" ? "labelEsutdAenderung" : e.art === "beendigung" ? "labelEsutdBeendigung" : "labelEsutd", { name: e.pfluecker }),
      faelligkeit: e.meldefristAm,
      ziel: "/dashboard/buero/personal",
    })),
    ...rohdaten.vorfaelleUeberfaellig
      .filter((v) => v.meldefristAm)
      .map((v) => ({
        id: `vorfall-${v.id}`,
        kategorie: "datenschutz" as const,
        label: t("labelVorfall"),
        faelligkeit: v.meldefristAm as string,
        ziel: "/dashboard/buero/compliance#datenschutzvorfaelle",
      })),
    ...rohdaten.drittweitergabenUeberfaellig
      .filter((d) => d.benachrichtigungsfristAm)
      .map((d) => ({
        id: `drittweitergabe-${d.id}`,
        kategorie: "datenschutz" as const,
        label: t("labelDrittweitergabe", { empfaenger: d.empfaenger }),
        faelligkeit: d.benachrichtigungsfristAm as string,
        ziel: "/dashboard/buero/compliance#drittweitergaben",
      })),
    ...rohdaten.nachweise.map((n) => ({
      id: `nachweis-${n.id}`,
      kategorie: "nachweis" as const,
      label: t(n.status === "abgelaufen" ? "labelNachweisAbgelaufen" : "labelNachweisLaeuftAb", { name: n.name }),
      faelligkeit: nachweisFaelligkeit(n.gueltigBis),
      ziel: "/dashboard/buero/dokumente",
    })),
  ];
}

export function risikoAufbereiten(eintraege: RisikoEintrag[]): RisikoAufbereitet {
  const jetzt = Date.now();
  const sortiert = risikoSortieren(eintraege, jetzt).map((eintrag) => ({
    ...eintrag,
    ueberfaellig: new Date(eintrag.faelligkeit).getTime() < jetzt,
  }));
  const ueberfaelligAnzahl = sortiert.filter((e) => e.ueberfaellig).length;
  return { sortiert, ueberfaelligAnzahl };
}
