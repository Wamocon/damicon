// Stammdaten mit Rechtsform und Steueridentifikation (Anforderung E.11).
//
// Drei Gruppen, eine Maske: der eigene Betrieb, die Zulieferer und die
// Abnehmer. Sie liegen in drei Tabellen (betriebe, nachbarbetriebe,
// b2b_kunden), tragen aber dieselben zwei Felder und werden von derselben
// Person gepflegt - wer Belege ausstellt, braucht alle drei.
//
// Die Gruppe steht deshalb als Feld an der Zeile und nicht in drei getrennten
// Listen: das Formular ist fuer alle drei identisch, nur die Zieltabelle
// unterscheidet sich.

import type { Rechtsform } from "@/lib/domain/rechtsform";

export const STAMMDATEN_GRUPPEN = ["betrieb", "zulieferer", "kunde"] as const;
export type StammdatenGruppe = (typeof STAMMDATEN_GRUPPEN)[number];

/** Zu welcher Gruppe welche Tabelle gehoert. Einzige Stelle der Zuordnung. */
export const TABELLE_JE_GRUPPE: Readonly<Record<StammdatenGruppe, string>> = {
  betrieb: "betriebe",
  zulieferer: "nachbarbetriebe",
  kunde: "b2b_kunden",
};

export interface StammdatenZeile {
  id: string;
  gruppe: StammdatenGruppe;
  name: string;
  rechtsform: Rechtsform | null;
  identifikationsnummer: string | null;
}

export function istStammdatenGruppe(wert: unknown): wert is StammdatenGruppe {
  return typeof wert === "string" && (STAMMDATEN_GRUPPEN as readonly string[]).includes(wert);
}

// Demo-Daten fuer den Betrieb ohne Supabase-Anbindung. Die Nummern sind frei
// erfunden, tragen aber eine gueltige Pruefziffer - sonst liefe die Maske im
// Demo-Modus in eine Fehlermeldung, die es in der Sache gar nicht gibt.
export const demoStammdaten: StammdatenZeile[] = [
  {
    id: "demo-betrieb",
    gruppe: "betrieb",
    name: "КХ Damicon",
    rechtsform: "kh_fh",
    identifikationsnummer: "850101123458",
  },
  {
    id: "demo-zulieferer-1",
    gruppe: "zulieferer",
    name: "ТОО Алатау Агро",
    rechtsform: "too",
    identifikationsnummer: "014040012342",
  },
  {
    id: "demo-zulieferer-2",
    gruppe: "zulieferer",
    name: "КХ Тургень",
    rechtsform: null,
    identifikationsnummer: null,
  },
  {
    id: "demo-kunde-1",
    gruppe: "kunde",
    name: "АО Магнум",
    rechtsform: "ao",
    identifikationsnummer: "220610123454",
  },
  {
    id: "demo-kunde-2",
    gruppe: "kunde",
    name: "Розничный покупатель",
    rechtsform: null,
    identifikationsnummer: null,
  },
];
