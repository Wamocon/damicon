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
import { baueRisikoEintraege, risikoAufbereiten, type RisikoRohdaten } from "@/lib/domain/risikoradar";
import type { Datenquelle } from "@/lib/supabase/config";
import { moduleHref, modules, sichtbareModule, zones } from "@/lib/modules";
import { darfCeoBerichtLesen, PRUEFBEREICHE } from "@/lib/pruefung/rollen";
import { startkarteFuer } from "@/lib/domain/startkarte";
import { baueAktionen } from "@/lib/ai/aktionen";
import { baueDatenWerkzeuge } from "@/lib/ai/daten-werkzeuge";
import { baueUiWerkzeuge } from "@/lib/ai/ui-werkzeuge";
import { baueWissenWerkzeug } from "@/lib/ai/wissen-werkzeug";
import { baueWissenVerwaltungWerkzeuge } from "@/lib/ai/wissen-verwaltung-werkzeug";
import { baueTagesLageWerkzeug } from "@/lib/ai/tages-lage";
import { darfRisikoRadar, type TagesLageProfil } from "@/lib/domain/tages-lage";
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
    "Ruft den aktuellen Stand der MwSt-Registrierung ab: Registrierungsstatus, gesetzlicher Satz, rollierender 12-Monats-Umsatz gegen die gesetzliche Schwelle, und die 5-Werktage-Meldefrist, falls die Schwelle bereits überschritten wurde. Nutze dieses Werkzeug für jede Frage zu Mehrwertsteuer, Umsatzschwelle oder Steuerregistrierung.",
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
    "Ruft alle offenen ESUTD-Meldefristen ab (Arbeitsverträge, die innerhalb von 5 Werktagen nach Vertragsbeginn im ESUTD-System erfasst werden müssen). Nutze dieses Werkzeug für Fragen zu Arbeitsverträgen, ESUTD oder Meldefristen für Pflücker.",
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
    "Ruft eine Zusammenfassung des Datenschutz- und Compliance-Stands ab: aktive/widerrufene Einwilligungen, überfällige Meldefristen für Datenschutzvorfälle, überfällige Benachrichtigungen zu Drittweitergaben. Nutze dieses Werkzeug für Fragen zu Datenschutz, Einwilligungen, Vorfällen oder Drittweitergaben.",
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
    "Ruft den aktuellen Kühlketten-Status ab: Chargen, die gerade auf die Vorkühlung warten, und die jüngsten Messungen mit Ergebnis (ok/warnung/verstoss). Nutze dieses Werkzeug für Fragen zur Kühlkette oder zur 60-Minuten-Regel.",
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
//
// Das Laden steht seit dem 28.09.2026 in einer eigenen Funktion: die Tageslage
// (tagesLageAbrufen, lib/ai/tages-lage.ts) nimmt dieselben Fristen auf, mit
// derselben Rollenpruefung, statt sie ein zweites Mal zusammenzusuchen.
/** Teilquellen des Radars, die ausfallen koennen - benannt wie die Kategorie ihrer Eintraege. */
export type RadarAusfall = "steuer" | "datenschutz";

/**
 * Welche geladenen Daten ins Radar duerfen (Fund 9 der Pruefung vom
 * 28.09.2026). ladeCompliance() und ladeMwstStatus() fallen bei einem
 * Datenbankfehler auf Beispieldaten zurueck (quelle "fehler"). Das Radar
 * uebernahm sie ungeprueft: die erfundenen Vorfaelle "demo-v1" und "demo-d1"
 * standen dann als echte ueberfaellige Datenschutzfristen im Radar und ganz
 * oben in der Tageslage. Jetzt faellt eine solche Teilquelle weg und steht
 * unter "ausgefallen". Der gewollte Demo-Modus (quelle "demo", keine
 * Datenbank) bleibt, wie er ist.
 */
export function radarRohdaten(geladen: {
  mwst: { quelle?: Datenquelle; status: { registriert: boolean; meldefristAm: string | null } | null } | null;
  esutdFristen: RisikoRohdaten["esutdFristen"];
  cockpit: {
    quelle: Datenquelle;
    vorfaelle: (RisikoRohdaten["vorfaelleUeberfaellig"][number] & { ueberfaellig: boolean })[];
    drittweitergaben: (RisikoRohdaten["drittweitergabenUeberfaellig"][number] & { ueberfaellig: boolean })[];
  } | null;
}): { rohdaten: RisikoRohdaten; ausgefallen: RadarAusfall[] } {
  const ausgefallen: RadarAusfall[] = [];
  const mwstAusfall = geladen.mwst?.quelle === "fehler";
  const cockpitAusfall = geladen.cockpit?.quelle === "fehler";
  if (mwstAusfall) ausgefallen.push("steuer");
  if (cockpitAusfall) ausgefallen.push("datenschutz");
  const mwst = mwstAusfall ? null : (geladen.mwst?.status ?? null);
  const cockpit = cockpitAusfall ? null : geladen.cockpit;
  return {
    rohdaten: {
      mwstMeldefristAm: mwst?.meldefristAm ?? null,
      mwstRegistriert: mwst?.registriert ?? false,
      esutdFristen: geladen.esutdFristen,
      vorfaelleUeberfaellig: cockpit?.vorfaelle.filter((v) => v.ueberfaellig) ?? [],
      drittweitergabenUeberfaellig: cockpit?.drittweitergaben.filter((d) => d.ueberfaellig) ?? [],
    },
    ausgefallen,
  };
}

export async function ladeRadarEintraege(rolle: Role | null | undefined) {
  const darfMwst = hasPermission(rolle, "stammdaten", "view");
  const darfEsutd = hasPermission(rolle, "personal", "view");
  const darfCompliance = hasPermission(rolle, "compliance", "view");
  const [mwst, esutdFristen, cockpit] = await Promise.all([
    darfMwst ? ladeMwstStatus() : Promise.resolve(null),
    darfEsutd ? ladeOffeneEsutdFristen() : Promise.resolve([]),
    darfCompliance ? ladeCompliance() : Promise.resolve(null),
  ]);
  const { rohdaten, ausgefallen } = radarRohdaten({ mwst, esutdFristen, cockpit });
  const eintraege = await baueRisikoEintraege(rohdaten);
  return { ...risikoAufbereiten(eintraege), ausgefallen };
}

/**
 * Die Antwort des Werkzeugs risikoRadarAbrufen. Ist eine Teilquelle
 * ausgefallen, sagt das Ergebnis das ausdruecklich (fehler, ausgefallen) -
 * die uebrigen, echten Fristen kommen trotzdem mit.
 */
export function radarAntwort(ergebnis: Awaited<ReturnType<typeof ladeRadarEintraege>>) {
  const { sortiert, ueberfaelligAnzahl, ausgefallen } = ergebnis;
  return {
    ziel: ZIEL_RISIKO_RADAR,
    ...(ausgefallen.length > 0 ? { fehler: "quelle-ausgefallen", ausgefallen } : {}),
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
}

function baueRadar(rolle: Role | null | undefined) {
  return tool({
    description:
      "Ruft ALLE offenen gesetzlichen Fristen zusammen ab (Steuer, Arbeitsrecht, Datenschutz), nach Dringlichkeit sortiert - überfällige zuerst. Nutze dieses Werkzeug, wenn nach dem GESAMTEN Risikostand gefragt wird, nicht nur nach einem einzelnen Bereich. Steht im Ergebnis fehler 'quelle-ausgefallen', konnten die Bereiche unter 'ausgefallen' nicht geladen werden: sage das, statt 'keine Fristen' zu melden.",
    inputSchema: leeresSchema,
    execute: async () => {
      return radarAntwort(await ladeRadarEintraege(rolle));
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
  const texte = de.modules as Record<string, { title?: string; summary?: string; description?: string; todo?: string }>;
  const beschreibung = (schluessel: string) => {
    const eintrag = texte[schluessel];
    return eintrag?.title ? `${eintrag.title}${eintrag.summary ? ` - ${eintrag.summary}` : ""}` : schluessel;
  };
  // Neben den Modulen feste Ziele: die Startuebersicht und die Kontosicherheit
  // (jede Rolle), die vier Zonen mit ihrer Uebersichtsseite (wer darin ein Modul
  // sieht) und der volle Compliance-Pruefbericht (wer ihn lesen darf). Bis zum
  // 25.09.2026 gab es weder Zonen noch Pruefbericht: "Erklaere mir den Bereich
  // Hof" oeffnete nur das Modul Kuehlkette, "Zeig mir die Pruefberichte" das
  // Datenschutz-Cockpit (Live-Test vom 25.09.2026).
  const zonenTexte = de.zones as Record<string, { name: string; tagline: string; description: string }>;
  // Die Uebersicht zeigt je Rolle anderes (dashboard/page.tsx): den Deckungsbeitrag nur
  // mit Finanz-Startkarte, den Compliance-Check nur, wer den Bericht lesen darf.
  const uebersichtText = [
    "Startseite:",
    startkarteFuer(rolle) === "finanzen" && hasPermission(rolle, "finanzen", "view") ? "Begruessung mit Deckungsbeitrag," : "Begruessung,",
    darfCeoBerichtLesen(rolle)
      ? "'Das Wichtigste heute' mit dem automatischen Compliance-Check (Reife, wichtigste Schritte, Kacheln der Pruefbereiche Audit, Steuern, Recht, Risiko, Massnahmen, Einschraenkungen, Siegel)"
      : "",
    "und die Bereiche mit ihren Kennzahlen.",
  ]
    .filter(Boolean)
    .join(" ");
  const feste: Record<string, { ziel: string; titel: string; text: string }> = {
    uebersicht: { ziel: "/dashboard", titel: "Uebersicht", text: uebersichtText },
    sicherheit: { ziel: "/dashboard/sicherheit", titel: "Kontosicherheit", text: "Eigene Anmeldung, Zwei-Faktor-Authentifizierung (MFA) und Sitzungssicherheit." },
  };
  for (const zone of zones) {
    const zonenModule = sichtbareModule(rolle, zone.key);
    if (zonenModule.length === 0) continue;
    const z = zonenTexte[zone.key];
    const modulTitel = zonenModule.map((m) => texte[m.key]?.title ?? m.key).join(", ");
    feste[zone.key] = {
      ziel: `/dashboard/${zone.slug}`,
      titel: `Zone ${z?.name ?? zone.key}`,
      text: `Uebersichtsseite der Zone ${z?.name ?? zone.key} (${z?.tagline ?? ""}): ${z?.description ?? ""} Module: ${modulTitel}.`,
    };
  }
  if (darfCeoBerichtLesen(rolle)) {
    feste.pruefbericht = {
      ziel: "/dashboard/compliance",
      titel: "Compliance-Pruefbericht",
      text: "Der zuletzt gespeicherte Gesamtbericht der Compliance-Pruefung: Kopf mit Reife und Zusammenfassung, Prioritaeten, Befunde mit Filter nach Pruefbereich (Audit, Steuern, Recht, Risiko), Massnahmenplan, Hinweise und Siegel. Mit 'abschnitt' audit, steuer, recht oder risiko oeffnet er gefiltert auf diesen Pruefbereich. Nicht das Datenschutz-Cockpit (compliance).",
    };
  }
  const liste = [
    ...Object.entries(feste).map(([k, v]) => `${k}: ${v.titel} - ${v.text}`),
    ...sichtbar.map((m) => `${m.key}: ${beschreibung(m.key)}`),
  ].join("\n");
  const schluessel = [...Object.keys(feste), ...sichtbar.map((m) => m.key)] as [string, ...string[]];
  return tool({
    description: `Oeffnet einen Bereich der Anwendung im Hauptfenster des Nutzers und liefert dessen Beschreibung. Nutze es bei JEDER Frage zu einem Bereich oder einer Funktion der Anwendung ('was ist ...', 'wie funktioniert ...', 'wo finde ich ...', 'zeig mir ...') - auch bei Tippfehlern oder unvollstaendigen Fragen: ordne sie dem wahrscheinlichsten Bereich zu (z. B. 'qr crate identification' -> qr_steigen, 'Lohnabrechnung' -> lohn, 'Kuehlung' -> kuehlkette, 'Datenschutz' -> compliance, 'Bereich Hof' -> hof, 'Pruefbericht Audit' -> pruefbericht mit abschnitt audit) und erklaere den Bereich anhand der gelieferten Beschreibung. Beim Compliance-Cockpit (compliance) springt 'abschnitt' zu einem Abschnitt, beim Pruefbericht (pruefbericht) filtert er auf einen Pruefbereich. Erlaubte Bereiche (Schluessel: Titel - Kurzbeschreibung):
${liste}`,
    inputSchema: z.object({
      bereich: z.enum(schluessel),
      abschnitt: z
        .enum(["mwst-registrierung", "risiko-radar", "datenschutzvorfaelle", "drittweitergaben", "pruefprotokoll", ...PRUEFBEREICHE])
        .optional()
        .describe("Bei bereich=compliance: Abschnitt, zu dem gescrollt wird. Bei bereich=pruefbericht: audit, steuer, recht oder risiko filtert den Bericht auf diesen Pruefbereich."),
    }),
    execute: async ({ bereich, abschnitt }) => {
      const fest = feste[bereich];
      if (fest) {
        const pruefbereich = bereich === "pruefbericht" && (PRUEFBEREICHE as readonly string[]).includes(abschnitt ?? "") ? abschnitt : null;
        return {
          ziel: pruefbereich ? `${fest.ziel}?bereich=${pruefbereich}` : fest.ziel,
          bereich,
          titel: fest.titel,
          beschreibung: pruefbereich
            ? `${fest.text} Geoeffnet gefiltert auf den Pruefbereich ${pruefbereich}: der Filter ist schon gesetzt, nicht erneut anklicken.`
            : fest.text,
          ...(pruefbereich ? { pruefbereich } : {}),
        };
      }
      const modul = sichtbar.find((m) => m.key === bereich);
      if (!modul) return { fehler: "unbekannter-bereich" };
      const eintrag = texte[modul.key];
      return {
        ziel: `${moduleHref(modul)}${bereich === "compliance" && abschnitt && !(PRUEFBEREICHE as readonly string[]).includes(abschnitt) ? `#${abschnitt}` : ""}`,
        bereich: modul.key,
        titel: eintrag?.title ?? modul.key,
        beschreibung: [eintrag?.description, eintrag?.summary].filter(Boolean).join(" "),
        nochOffen: eintrag?.todo ?? null,
      };
    },
  });
}

// Fluchtweg fuer den Agent-Modus, in dem der erste Schritt IMMER ein Werkzeug
// aufrufen muss (route.ts, prepareStep): ohne ihn wuerde eine reine Hoeflichkeit
// ("danke") eine sinnlose Navigation ausloesen. Bewusst ohne "ziel" - der Chat
// zeigt den Schritt nicht an und das Hauptfenster bleibt, wie es ist.
const ohneAnsicht = tool({
  description:
    "Nur für Nachrichten, die weder Daten noch Status noch einen Bereich der Anwendung betreffen (Dank, Gruß, Nachfrage zur Formulierung deiner letzten Antwort). Bei JEDER Frage zu Zahlen, Fristen, Status, Personen, Bereichen oder Funktionen der Anwendung stattdessen das passende Werkzeug aufrufen - auch wenn du die Antwort weiter oben im Gespräch schon einmal gegeben hast.",
  inputSchema: z.object({}),
  execute: async () => ({ ok: true }),
});

/** Welche Werkzeuge diese Rolle bekommt - siehe Migrationskopf: keine
 *  Prompt-Anweisung, sondern schlichte Abwesenheit. Deckungsgleich mit den
 *  rbac.ts-Rechten, die auch die jeweilige Ansicht freischalten. */
export function baueWerkzeuge(
  rolle: Role | null | undefined,
  optionen: {
    vorschau?: boolean;
    /** Ohne Aktionen: fuer Wege ohne Freigabe-Oberflaeche (nicht-streamende Anfrage in agent.ts). */
    nurLesen?: boolean;
    /** Agent-Modus: ergaenzt ohneAnsicht, den bewussten Verzicht auf eine Ansicht. */
    agentModus?: boolean;
    /** Client-Werkzeuge (laufen im Browser): "lesen" = nur seiteLesen, "steuern" = Seite bedienen. */
    oberflaeche?: "lesen" | "steuern";
    /** Erste freie Belegkennung der laufenden Antwort (siehe naechsteBelegNummer). */
    belegStart?: number;
    /** Der angemeldete Nutzer fuer tagesLageAbrufen (Brigade, Kunde, eigene
     *  Schulung). Ohne Angabe und in der Vorschau gilt die reine Rollensicht. */
    profil?: TagesLageProfil;
  } = {},
) {
  const oeffneBereich = baueNavigationsWerkzeug(rolle);
  const risikoRadarAbrufen = baueRadar(rolle);
  const wissenSuchen = baueWissenWerkzeug(rolle, optionen.belegStart);
  const wissenVerwaltung = baueWissenVerwaltungWerkzeuge(rolle);
  // Tageslage: nur lesen, deshalb auch im Weg ohne Aktionen (nurLesen). Die
  // Fristen kommen aus derselben Funktion wie das Risiko-Radar.
  const tagesLageAbrufen =
    rolle && hasPermission(rolle, "ki_assistent", "create")
      ? baueTagesLageWerkzeug(rolle, {
          profil: optionen.profil,
          vorschau: optionen.vorschau,
          ladeFristen: () => ladeRadarEintraege(rolle),
        })
      : null;
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
    // Rechtsgrundlagen - sonst haette es ohnehin nichts zu zeigen. Dieselbe Regel
    // wie die Frist-Quelle der Tageslage (darfRisikoRadar).
    ...(darfRisikoRadar(rolle) ? { risikoRadarAbrufen } : {}),
    ...(tagesLageAbrufen ? { tagesLageAbrufen } : {}),
    ...(oeffneBereich ? { oeffneBereich } : {}),
    // Wissensbasis (Recht, Steuer, Compliance, Audit): nur mit Rollenrecht und vorhandenem Index.
    ...(wissenSuchen ? { wissenSuchen } : {}),
    // Verwaltung der Wissensbasis (Hochladen, Einordnen, Analysieren): nur Administration, nur lesend; Aenderungen laufen ueber die Aktion mit Bestaetigung.
    ...(wissenVerwaltung ? { wissensbasisAbrufen: wissenVerwaltung.wissensbasisAbrufen, wissenDokumentAnalysieren: wissenVerwaltung.wissenDokumentAnalysieren } : {}),
    ...baueDatenWerkzeuge(rolle, optionen.vorschau ?? false),
    ...(optionen.nurLesen ? {} : baueAktionen(rolle)),
    ...(optionen.agentModus ? { ohneAnsicht } : {}),
    ...(optionen.oberflaeche ? baueUiWerkzeuge(optionen.oberflaeche) : {}),
  };
}
