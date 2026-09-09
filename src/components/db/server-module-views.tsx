import type { ReactNode } from "react";
import { StandortAnsicht } from "@/components/db/standort-ansicht";
import { ReihenbloeckeAnsicht } from "@/components/db/reihenbloecke-ansicht";
import { PflueckaufgabenAnsicht } from "@/components/db/pflueckaufgaben-ansicht";
import { DokumenteAnsicht } from "@/components/db/dokumente-ansicht";
import { ComplianceAnsicht } from "@/components/db/compliance-ansicht";
import { ReklamationenAnsicht } from "@/components/db/reklamationen-ansicht";
import { LohnAnsicht } from "@/components/db/lohn-ansicht";
import { FinanzenAnsicht } from "@/components/db/finanzen-ansicht";
import { RotationsplanAnsicht } from "@/components/db/rotationsplan-ansicht";
import { ZukaufAnsicht } from "@/components/db/zukauf-ansicht";
import { QrSteigenAnsicht } from "@/components/db/qr-steigen-ansicht";
import { EinarbeitungAnsicht } from "@/components/db/einarbeitung-ansicht";
import { PflichtschulungenAnsicht } from "@/components/db/pflichtschulungen-ansicht";
import { FoerdermittelAnsicht } from "@/components/db/foerdermittel-ansicht";
import type { ModuleDef } from "@/lib/modules";

// Module, die in Meilenstein B an der Datenbank haengen. Sie werden als Server
// Component gerendert (Daten + Server Actions).
//
// Diese Ansichten gelten in beiden Betriebsarten: ohne Supabase-Umgebung liefert
// die Datenschicht (src/lib/data/) die Beispieldaten und die Schreibformulare
// entfallen mangels Anmeldung. So gibt es nur einen Oberflaechen-Pfad statt
// zweier, die auseinanderlaufen koennen.
//
// Alles, was hier nicht gelistet ist, bleibt bei der Demo-Ansicht aus
// src/components/demo/registry.tsx.
export function serverModulAnsicht(
  module: ModuleDef,
  kontext: {
    pfad: string;
    suche: { status?: string; aufgabe?: string; reklamation?: string };
  },
): ReactNode | null {
  switch (module.key) {
    case "standort":
      return <StandortAnsicht />;
    case "reihenbloecke":
      return (
        <ReihenbloeckeAnsicht pfad={kontext.pfad} statusFilter={kontext.suche.status} />
      );
    // Anforderung 2.4: eigenstaendiger Dashboard-Eintrag "Pflanzenschutz"
    // zeigte bisher reine Mock-Daten (PflanzenschutzDemo), obwohl die echte
    // Behandlungserfassung samt Aufwandmenge und Person bereits als Teil der
    // Reihenbloecke-Ansicht existiert. Dieselbe echte Ansicht statt einer
    // zweiten, separat zu pflegenden Oberflaeche.
    case "pflanzenschutz":
      return (
        <ReihenbloeckeAnsicht pfad={kontext.pfad} statusFilter={kontext.suche.status} />
      );
    case "pflueckaufgaben":
      return (
        <PflueckaufgabenAnsicht pfad={kontext.pfad} auswahl={kontext.suche.aufgabe} />
      );
    case "dokumente":
      return <DokumenteAnsicht />;
    case "compliance":
      return <ComplianceAnsicht />;
    case "reklamationen":
      return (
        <ReklamationenAnsicht pfad={kontext.pfad} auswahl={kontext.suche.reklamation} />
      );
    case "lohn":
      return <LohnAnsicht />;
    case "finanzen":
      return <FinanzenAnsicht />;
    case "rotationsplan":
      return <RotationsplanAnsicht />;
    case "aggregator":
      return <ZukaufAnsicht />;
    case "qr_steigen":
      return <QrSteigenAnsicht />;
    // Anforderung 4.12: Foerdermitteldossier als bedienbares UI-Modul statt
    // reinem Container-Datenmodell.
    case "foerdermittel":
      return <FoerdermittelAnsicht />;
    // Anforderung 2.12: bebilderte Kurzeinarbeitung, mehrsprachig ueber
    // einarbeitung_schritte, personalisierter Fortschritt fuer Picker.
    // Anforderung 4.10: jaehrliche Pflichtschulung mit Nachweis und
    // Fristueberwachung, eigenstaendige Tabelle im selben Modul - andere
    // Zielgruppe (die ganze Belegschaft statt nur Picker) und anderer
    // fachlicher Charakter (wiederkehrend statt einmalig).
    case "schulungen":
      return (
        <div className="space-y-6">
          <EinarbeitungAnsicht />
          <PflichtschulungenAnsicht />
        </div>
      );
    default:
      return null;
  }
}
