// Werkzeuge des KI-Assistenten, in vier Schichten:
//   1. Fachwerkzeuge fuer Steuer-, Arbeits- und Pruefungsrisiko (dieses
//      File, Migration 20261025000000 + 20261026000000): jedes ruft
//      AUSSCHLIESSLICH eine bereits vorhandene, RLS-gepruefte
//      Datenzugriffsfunktion auf und liefert ein Sprungziel mit.
//   2. Navigation (oeffneBereich): leitet sich aus modules.ts ab - ein neues
//      Modul ist ohne Aenderung hier sofort fuer den Agenten erreichbar.
//   3. Generische Datenabfrage (daten-werkzeuge.ts): liest das von PostgREST
//      veroeffentlichte Schema - neue Tabellen sind ohne Aenderung abfragbar.
//      Das Modell formuliert nie SQL: Tabelle, Spalten und Filter werden gegen
//      das Schema und eine feste Operatorenliste geprueft und laufen unter
//      der Sitzung des Nutzers (RLS).
//   4. Aktionen (aktionen.ts): dieselben Server Actions wie die Formulare,
//      jede mit ausdruecklicher Nutzerfreigabe.
//
// Rollenbindung nach demselben Prinzip wie wissensQuellenFuerFaehigkeiten()
// (domain/ki-assistent.ts): ein Werkzeug wird dem Modell erst gar nicht
// angeboten, wenn die anfragende Rolle keine Berechtigung dafuer hat - keine
// Prompt-Anweisung, die ein hartnaeckiger Nutzer umgehen koennte, sondern
// schlichte Abwesenheit der Moeglichkeit.
//
// Fachliche Gliederung (fuer den Systemprompt, siehe agent.ts): die ersten
// drei Werkzeuge entsprechen den drei Blickwinkeln, die ein Fachberater in
// dieser Reihenfolge einnehmen wuerde - Steuer (MwSt), Arbeitsrecht (ESUTD),
// Pruefung/Datenschutz (Compliance) - das vierte fasst alle drei zu einer
// einzigen, nach Dringlichkeit sortierten Sicht zusammen (dieselbe Funktion,
// die auch das Risiko-Radar im Compliance-Cockpit befuellt).

import { tool } from "ai";
import { z } from "zod";
import { hasPermission, type Role } from "@/lib/rbac";
import { ladeMwstStatus } from "@/lib/data/mwst";
import { ladeOffeneEsutdFristen } from "@/lib/data/esutd";
import { ladeCompliance } from "@/lib/data/compliance";
import { ladeKuehlkettenUebersicht } from "@/lib/data/kuehlkette";
import { baueRisikoEintraege, risikoAufbereiten } from "@/lib/domain/risikoradar";
import { moduleHref, modules } from "@/lib/modules";
import { baueAktionen } from "@/lib/ai/aktionen";
import { baueDatenWerkzeuge } from "@/lib/ai/daten-werkzeuge";
import {
  ZIEL_COMPLIANCE,
  ZIEL_ESUTD,
  ZIEL_KUEHLKETTE,
  ZIEL_MWST,
  ZIEL_RISIKO_RADAR,
} from "@/lib/ai/ziele";
import de from "@/messages/de.json";

const leeresSchema = z.object({});

// --- Steuer-Fachberater: MwSt-Registrierung ---------------------------------
const mwstStatusAbrufen = tool({
  description:
    "Ruft den aktuellen Stand der MwSt-Registrierung ab: Registrierungsstatus, gesetzlicher Satz, rollierender 12-Monats-Umsatz gegen die gesetzliche Schwelle, und die 5-Werktage-Meldefrist, falls die Schwelle bereits ueberschritten wurde. Nutze dieses Werkzeug fuer jede Frage zu Mehrwertsteuer, Umsatzschwelle oder Steuerregistrierung.",
  inputSchema: leeresSchema,
  execute: async () => {
    const { status } = await ladeMwstStatus();
    if (!status) return { verfuegbar: false, ziel: ZIEL_MWST };
    return {
      verfuegbar: true,
      ziel: ZIEL_MWST,
      registriert: status.registriert,
      registriertAm: status.registriertAm,
      standardProzent: status.standardProzent,
      schwelleTenge: status.schwelleTenge,
      letzterUmsatzTenge: status.letzterUmsatzTenge,
      letztePruefungAm: status.letztePruefungAm,
      schwelleUeberschrittenAm: status.schwelleUeberschrittenAm,
      meldefristAm: status.meldefristAm,
    };
  },
});

// --- Arbeitsrecht-Fachberater: ESUTD -----------------------------------------
const esutdOffeneFristenAbrufen = tool({
  description:
    "Ruft alle offenen ESUTD-Meldefristen ab (Arbeitsvertraege, die innerhalb von 5 Werktagen nach Vertragsbeginn im ESUTD-System erfasst werden muessen). Nutze dieses Werkzeug fuer Fragen zu Arbeitsvertraegen, ESUTD oder Meldefristen fuer Pfluecker.",
  inputSchema: leeresSchema,
  execute: async () => {
    const fristen = await ladeOffeneEsutdFristen();
    const jetzt = Date.now();
    return {
      ziel: ZIEL_ESUTD,
      anzahl: fristen.length,
      fristen: fristen.map((f) => ({
        pfluecker: f.pfluecker,
        meldefristAm: f.meldefristAm,
        ueberfaellig: new Date(f.meldefristAm).getTime() < jetzt,
      })),
    };
  },
});

// --- Pruefungs-Fachberater: Compliance/Datenschutz ---------------------------
const complianceUebersichtAbrufen = tool({
  description:
    "Ruft eine Zusammenfassung des Datenschutz- und Compliance-Stands ab: aktive/widerrufene Einwilligungen, ueberfaellige Meldefristen fuer Datenschutzvorfaelle, ueberfaellige Benachrichtigungen zu Drittweitergaben. Nutze dieses Werkzeug fuer Fragen zu Datenschutz, Einwilligungen, Vorfaellen oder Drittweitergaben.",
  inputSchema: leeresSchema,
  execute: async () => {
    const cockpit = await ladeCompliance();
    return {
      ziel: ZIEL_COMPLIANCE,
      kennzahlen: cockpit.kennzahlen,
      ueberfaelligeVorfaelle: cockpit.vorfaelle
        .filter((v) => v.ueberfaellig)
        .map((v) => ({ art: v.art, meldefristAm: v.meldefristAm })),
      ueberfaelligeDrittweitergaben: cockpit.drittweitergaben
        .filter((d) => d.ueberfaellig)
        .map((d) => ({ empfaenger: d.empfaenger, benachrichtigungsfristAm: d.benachrichtigungsfristAm })),
    };
  },
});

// --- Feldbetrieb: Kuehlkette (eigener Blickwinkel, kein Steuer-/Rechtsrisiko,
// aber dieselbe "live pruefen statt vermuten"-Haltung) ----------------------
const kuehlketteAbrufen = tool({
  description:
    "Ruft den aktuellen Kuehlketten-Status ab: Chargen, die gerade auf die Vorkuehlung warten, und die juengsten Messungen mit Ergebnis (ok/warnung/verstoss). Nutze dieses Werkzeug fuer Fragen zur Kuehlkette oder zur 60-Minuten-Regel.",
  inputSchema: leeresSchema,
  execute: async () => {
    const uebersicht = await ladeKuehlkettenUebersicht();
    return {
      ziel: ZIEL_KUEHLKETTE,
      offeneChargenAnzahl: uebersicht.offeneChargen.length,
      letzteMessungen: uebersicht.letzteMessungen.slice(0, 5).map((m) => ({
        chargeCode: m.chargeCode,
        ergebnis: m.ergebnis,
        minutenSeitPfluecken: m.minutenSeitPfluecken,
      })),
    };
  },
});

// --- Zusammenfassung aller drei Rechtsgrundlagen -----------------------------
// Je Rolle gebaut: das Radar fasst nur die Quellen zusammen, die die Rolle
// auch einzeln sehen darf (dieselben rbac.ts-Rechte wie die Einzelwerkzeuge).
// Sonst liesse sich ueber die Zusammenfassung lesen, was die Rolle direkt nicht
// abrufen kann.
function baueRadar(rolle: Role | null | undefined) {
  const darfMwst = hasPermission(rolle, "stammdaten", "view");
  const darfEsutd = hasPermission(rolle, "personal", "view");
  const darfCompliance = hasPermission(rolle, "compliance", "view");
  return tool({
    description:
      "Ruft ALLE offenen gesetzlichen Fristen zusammen ab (Steuer, Arbeitsrecht, Datenschutz), nach Dringlichkeit sortiert - ueberfaellige zuerst. Nutze dieses Werkzeug, wenn nach dem GESAMTEN Risikostand gefragt wird, nicht nur nach einem einzelnen Bereich.",
    inputSchema: leeresSchema,
    execute: async () => {
      const [mwstErgebnis, esutdFristen, cockpit] = await Promise.all([
        darfMwst ? ladeMwstStatus() : Promise.resolve({ status: null }),
        darfEsutd ? ladeOffeneEsutdFristen() : Promise.resolve([]),
        darfCompliance ? ladeCompliance() : Promise.resolve(null),
      ]);
      const mwst = mwstErgebnis.status;
      const eintraege = await baueRisikoEintraege({
        mwstMeldefristAm: mwst?.meldefristAm ?? null,
        mwstRegistriert: mwst?.registriert ?? false,
        esutdFristen,
        vorfaelleUeberfaellig: cockpit?.vorfaelle.filter((v) => v.ueberfaellig) ?? [],
        drittweitergabenUeberfaellig: cockpit?.drittweitergaben.filter((d) => d.ueberfaellig) ?? [],
      });
      const { sortiert, ueberfaelligAnzahl } = risikoAufbereiten(eintraege);
      return {
        ziel: ZIEL_RISIKO_RADAR,
        ueberfaelligAnzahl,
        offenGesamt: sortiert.length,
        eintraege: sortiert.map((e) => ({
          kategorie: e.kategorie,
          label: e.label,
          faelligkeit: e.faelligkeit,
          ueberfaellig: e.ueberfaellig,
          // Jeder Einzeleintrag traegt bereits sein eigenes, feineres Ziel
          // (z. B. direkt zur ESUTD-Zeile) - das Werkzeug-weite "ziel" oben
          // bleibt der Rueckfall fuer den Chip selbst.
          ziel: e.ziel,
        })),
      };
    },
  });
}

// --- Navigation: den Nutzer durch die Anwendung fuehren ----------------------
// Kein Datenzugriff - das Werkzeug liefert nur die Adresse eines Bereichs, den
// die Rolle ohnehin sehen darf (dieselbe hasPermission-Regel wie die
// Seitenleiste, sidebar.tsx). Im Agent-Modus oeffnet der Client jedes Werkzeug-
// Ergebnis mit "ziel" automatisch im Hauptfenster; im Assistent-Modus wird
// daraus nur ein anklickbarer Verweis. Die Auswahl ist eine geschlossene
// Aufzaehlung (z.enum) - das Modell kann keine beliebige Adresse erfinden.
function baueNavigationsWerkzeug(rolle: Role | null | undefined) {
  const sichtbar = modules.filter((m) => hasPermission(rolle, m.resource, "view"));
  if (sichtbar.length === 0) return null;
  const beschreibung = (schluessel: string) => {
    const eintrag = (de.modules as Record<string, { title?: string; summary?: string }>)[schluessel];
    return eintrag?.title ? `${eintrag.title}${eintrag.summary ? ` - ${eintrag.summary}` : ""}` : schluessel;
  };
  const liste = sichtbar.map((m) => `${m.key}: ${beschreibung(m.key)}`).join("\n");
  return tool({
    description: `Oeffnet einen Bereich der Anwendung im Hauptfenster des Nutzers, ohne Daten abzurufen. Nutze es, wenn der Nutzer dich bittet, ihm einen Bereich zu zeigen, oder als Abschluss einer Tour. Ordne die Formulierung des Nutzers sinngemaess dem passenden Bereich zu (z. B. 'Lohnabrechnung' -> lohn, 'Kuehlung' -> kuehlkette, 'Datenschutz' -> compliance). Erlaubte Bereiche (Schluessel: Titel - Kurzbeschreibung):\n${liste}`,
    inputSchema: z.object({
      bereich: z.enum(sichtbar.map((m) => m.key) as [string, ...string[]]),
    }),
    execute: async ({ bereich }) => {
      const modul = sichtbar.find((m) => m.key === bereich);
      return modul ? { ziel: moduleHref(modul), bereich: modul.key } : { fehler: "unbekannter-bereich" };
    },
  });
}

/** Welche Werkzeuge diese Rolle bekommt - siehe Migrationskopf: keine
 *  Prompt-Anweisung, sondern schlichte Abwesenheit. Deckungsgleich mit den
 *  rbac.ts-Rechten, die auch die jeweilige Ansicht freischalten. */
export function baueWerkzeuge(
  rolle: Role | null | undefined,
  optionen: {
    vorschau?: boolean;
    /** Ohne Aktionen: fuer Wege ohne Freigabe-Oberflaeche (nicht-streamende Anfrage in agent.ts). */
    nurLesen?: boolean;
  } = {},
) {
  const oeffneBereich = baueNavigationsWerkzeug(rolle);
  const risikoRadarAbrufen = baueRadar(rolle);
  // Bedingtes Spreaden statt eines vorab getypten Record<string, ...>: der
  // generische Rueckgabetyp von tool() laesst sich ohne eine Aufrufstelle
  // nicht sauber annotieren (TypeScript faellt sonst auf Tool<never, never>
  // zurueck). Diese Form laesst TypeScript den praezisen Typ je Schluessel
  // selbst herleiten - genau das, was generateText() unten braucht.
  return {
    ...(hasPermission(rolle, "stammdaten", "view") ? { mwstStatusAbrufen } : {}),
    ...(hasPermission(rolle, "personal", "view") ? { esutdOffeneFristenAbrufen } : {}),
    ...(hasPermission(rolle, "compliance", "view") ? { complianceUebersichtAbrufen } : {}),
    ...(hasPermission(rolle, "kuehlkette", "view") ? { kuehlketteAbrufen } : {}),
    // Das zusammenfassende Werkzeug braucht mindestens eine der drei
    // Rechtsgrundlagen - sonst haette es ohnehin nichts zu zeigen.
    ...(hasPermission(rolle, "stammdaten", "view") ||
    hasPermission(rolle, "personal", "view") ||
    hasPermission(rolle, "compliance", "view")
      ? { risikoRadarAbrufen }
      : {}),
    ...(oeffneBereich ? { oeffneBereich } : {}),
    ...baueDatenWerkzeuge(rolle, optionen.vorschau ?? false),
    ...(optionen.nurLesen ? {} : baueAktionen(rolle)),
  };
}
