import { hasPermission, type Role } from "@/lib/rbac";
import { moduleHref, modules } from "@/lib/modules";

// Jedes Werkzeug gibt neben den Fachdaten ein "ziel" mit - die Route im
// Dashboard, aus der diese Daten stammen. Der Chat (ki/ki-chat.tsx) macht
// daraus einen anklickbaren Schritt bzw. im Agent-Modus eine Station der Tour:
// "woher kommt diese Antwort" zeigt dieselbe Adresse, die auch das Risiko-
// Radar im Compliance-Cockpit fuer denselben Sachverhalt verlinkt
// (risiko-radar.tsx) - eine einzige Quelle der Wahrheit fuer "wo im Dashboard
// steht das", nicht mehrere unabhaengig gepflegte Adresslisten.
export const ZIEL_MWST = "/dashboard/buero/compliance#mwst-registrierung";
export const ZIEL_ESUTD = "/dashboard/buero/personal";
export const ZIEL_COMPLIANCE = "/dashboard/buero/compliance#datenschutzvorfaelle";
export const ZIEL_KUEHLKETTE = "/dashboard/hof/kuehlkette";
export const ZIEL_RISIKO_RADAR = "/dashboard/buero/compliance#risiko-radar";
export const ZIEL_SORTENKATALOG = "/dashboard/markt/sortenkatalog";

/** Adresse eines Moduls anhand seines Schluessels - nur wenn die Rolle es
 *  sehen darf, sonst null (ein Ziel, das die Seitenleiste dieser Rolle gar
 *  nicht anbietet, waere ein Weg an der Berechtigung vorbei). */
export function zielFuerModul(schluessel: string, rolle: Role | null | undefined): string | null {
  const modul = modules.find((m) => m.key === schluessel);
  if (!modul || !hasPermission(rolle, modul.resource, "view")) return null;
  return moduleHref(modul);
}

// Tabelle -> Modul, fuer Abfragen ueber das entdeckte Datenmodell
// (datenmodell.ts). Reine Navigationshilfe, keine Berechtigung: eine Tabelle
// ohne Eintrag ist genauso abfragbar, nur ohne Sprungziel - der Agent kann
// dann oeffneBereich nutzen. Namensgleiche Tabellen (pflueckaufgaben,
// reklamationen, dokumente ...) finden ihr Modul ohnehin selbst.
const TABELLE_ZU_MODUL: Record<string, string> = {
  plantagen: "standort",
  feldparzellen: "standort",
  reihengruppen: "reihenbloecke",
  psm_mittel: "pflanzenschutz",
  pflanzenschutz_behandlungen: "pflanzenschutz",
  rotationsplan_eintraege: "rotationsplan",
  wetter_messungen: "wetter",
  kuehlketten_messungen: "kuehlkette",
  lieferungen: "logistik",
  touren: "logistik",
  transport_temperatur_messungen: "logistik",
  steigen: "qr_steigen",
  chargen: "qr_steigen",
  finance_ledger_entries: "finanzen",
  kostentraeger: "finanzen",
  deckungsbeitrag_je_charge: "finanzen",
  deckungsbeitrag_je_kostentraeger: "finanzen",
  pfluecker: "personal",
  brigaden: "personal",
  brigade_einsatzplan: "personal",
  brigadenplanung_bedarf: "personal",
  arbeitszeiten: "personal",
  esutd_vertraege: "personal",
  esutd_vertraege_mit_frist: "personal",
  lohn_abrechnungen: "lohn",
  lohn_positionen: "lohn",
  lohn_saetze: "lohn",
  lohn_steuersaetze_kz: "lohn",
  lohn_monatsabzuege: "lohn",
  media_belege: "dokumente",
  datenschutzvorfaelle: "compliance",
  einwilligungen: "compliance",
  drittweitergaben: "compliance",
  verarbeitungszwecke: "compliance",
  integration_outbox: "integrationen",
  foerderdossiers: "foerdermittel",
  sorten: "sortenkatalog",
  b2b_kunden: "b2b_portal",
  vorbestellungen: "b2b_portal",
  kontingente: "b2b_portal",
  reklamation_ereignisse: "reklamationen",
  zukauf_positionen: "aggregator",
  kontaktkanaele: "kanaele",
  betriebe: "stammdaten",
  betriebe_mwst_status: "stammdaten",
  mwst_saetze: "stammdaten",
  profiles: "rollen",
  schulungsteilnahmen: "schulungen",
  schulungsteilnahmen_status: "schulungen",
  schulungsvideos: "schulungen",
  einarbeitung_schritte: "schulungen",
  einarbeitung_fortschritt: "schulungen",
};

/** Das Modul einer Tabelle (ausdruecklich zugeordnet oder namensgleich), sonst null. */
export function modulFuerTabelle(tabelle: string) {
  const schluessel =
    TABELLE_ZU_MODUL[tabelle] ?? modules.find((m) => m.key === tabelle || tabelle.startsWith(`${m.key}_`))?.key;
  return modules.find((m) => m.key === schluessel) ?? null;
}

export function zielFuerTabelle(tabelle: string, rolle: Role | null | undefined): string | null {
  const modul = modulFuerTabelle(tabelle);
  return modul ? zielFuerModul(modul.key, rolle) : null;
}
