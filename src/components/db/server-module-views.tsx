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
import { LogistikAnsicht } from "@/components/db/logistik-ansicht";
import { B2bPortalAnsicht } from "@/components/db/b2b-portal-ansicht";
import { PersonalAnsicht } from "@/components/db/personal-ansicht";
import { KiAssistentAnsicht } from "@/components/db/ki-assistent-ansicht";
import { EinladungenAnsicht } from "@/components/db/einladungen-ansicht";
import { KuehletteAnsicht } from "@/components/db/kuehlkette-ansicht";
import { RollenDemo } from "@/components/demo/buero";
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
    // Anforderung 3.5 Teil 2 (Uebergabequittung) und 5.2 Teil 2a
    // (Lieferstatus): logistik ist die interne Arbeitsansicht (Buero/
    // Brigade erfassen), b2b_portal die kundenseitige Sicht auf dieselben
    // Daten, ergaenzt um Preisliste/Vorbestellung (Anforderung 5.1, Teil 2
    // von 2). Tourenplanung (3.5 Teil 1) und Rechnungshistorie/automatischer
    // Kontingent-Verbrauch (5.1/5.2 Teil 2b) bleiben offen, siehe
    // Modulkommentare.
    case "logistik":
      return <LogistikAnsicht />;
    // Anforderung 3.1: die Live-Alarmlogik (KuehlkettenAlarm) lief bisher nur
    // eingebettet in der Nachweiskette EINER Pflueckaufgabe. Dieses Modul
    // zeigt dieselbe Komponente betriebsweit fuer alle gerade offenen Chargen
    // statt der bisherigen drei fest verdrahteten Beispielchargen
    // (KuehlketteMock).
    case "kuehlkette":
      return <KuehletteAnsicht />;
    case "b2b_portal":
      return <B2bPortalAnsicht />;
    // Anforderung 2.11: Schicht-Konzept, Bedarfsrechnung und Reserveliste
    // statt reiner Demo-Ansicht. Wetterszenarien bleiben offen
    // (Anforderung 2.13, bewusst zurueckgestellt auf 2027).
    case "personal":
      return <PersonalAnsicht />;
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
    // Anforderung 5.4/5.5: echte Anbindung statt KiAssistentMock.
    case "ki_assistent":
      return <KiAssistentAnsicht />;
    // Anforderung E.20: Kundenzugang ueber Einladung. Die Rechtematrix
    // darueber bleibt, was sie war - eine Anzeige des Rollenmodells aus
    // rbac.ts, die nichts schreibt. Neu darunter ist die einzige schreibende
    // Zugangsverwaltung, die es im Betrieb gibt: bisher entstand ein
    // Kundenkonto ausschliesslich ueber den service_role-Schluessel in
    // supabase/seed-auth.mjs.
    case "rollen":
      return (
        <div className="space-y-6">
          <RollenDemo />
          <EinladungenAnsicht />
        </div>
      );
    default:
      return null;
  }
}
