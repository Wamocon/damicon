import type { Resource } from "./rbac";

// Zielarchitektur aus dem Pitch-Dossier: die vier Zonen Feld, Hof, Buero, Markt.
export type ZoneKey = "feld" | "hof" | "buero" | "markt";

// Klassifikation je Baustein aus Analyse Kapitel 5.
export type Klassifikation = "uebernehmen" | "anpassen" | "neu-bauen";

// Reifegrad im Prototyp:
//  - "angebunden": Hauptfunktion, an die Datenbank angebunden, mit echten
//    Schreibvorgaengen unter RLS (Meilenstein B)
//  - "demo": Hauptfunktion, als bedienbare Mock-Oberflaeche gebaut
//  - "in-entwicklung": Unterfunktion, sichtbarer Menuepunkt mit Status-Badge
export type Reifegrad = "angebunden" | "demo" | "in-entwicklung";

export interface ModuleDef {
  key: string;
  zone: ZoneKey;
  slug: string;
  icon: string;
  resource: Resource;
  klassifikation: Klassifikation;
  reifegrad: Reifegrad;
}

export interface ZoneDef {
  key: ZoneKey;
  slug: string;
  icon: string;
  accent: string;
}

export const zones: ZoneDef[] = [
  { key: "feld", slug: "feld", icon: "sprout", accent: "var(--accent)" },
  { key: "hof", slug: "hof", icon: "snowflake", accent: "var(--chart-5)" },
  { key: "buero", slug: "buero", icon: "briefcase", accent: "var(--primary)" },
  { key: "markt", slug: "markt", icon: "store", accent: "var(--warning)" },
];

export const modules: ModuleDef[] = [
  // ---------------------------------------------------------------- Zone Feld
  {
    key: "standort",
    zone: "feld",
    slug: "standort",
    icon: "map",
    resource: "standort",
    klassifikation: "anpassen",
    reifegrad: "angebunden",
  },
  {
    key: "reihenbloecke",
    zone: "feld",
    slug: "reihenbloecke",
    icon: "grid-3x3",
    resource: "reihenbloecke",
    klassifikation: "anpassen",
    reifegrad: "angebunden",
  },
  {
    key: "pflueckaufgaben",
    zone: "feld",
    slug: "pflueckaufgaben",
    icon: "clipboard-check",
    resource: "pflueckaufgaben",
    klassifikation: "uebernehmen",
    reifegrad: "angebunden",
  },
  {
    key: "pflanzenschutz",
    zone: "feld",
    slug: "pflanzenschutz",
    icon: "shield-alert",
    resource: "pflanzenschutz",
    klassifikation: "anpassen",
    // Anforderung 2.4: zeigt jetzt dieselbe echte Reihenbloecke-Ansicht wie
    // das Modul "reihenbloecke" (siehe server-module-views.tsx), nicht mehr
    // die reine Demo-Komponente.
    reifegrad: "angebunden",
  },
  {
    key: "rotationsplan",
    zone: "feld",
    slug: "rotationsplan",
    icon: "calendar-sync",
    resource: "rotationsplan",
    klassifikation: "neu-bauen",
    // Anforderung 2.2 (P1, "die erste zu bauende Funktion"): Zyklusrechnung
    // und Sperrlogik laufen jetzt vollstaendig in der Datenbank (Migration
    // 20260910000000) - Generator-RPC, automatisches Sperren/Entsperren bei
    // Behandlung/Freigabe, automatisches Erledigen bei neuer Pflueckaufgabe.
    // Wetterszenarien (dritter Teil der Anforderung) fehlen bewusst, siehe
    // src/lib/domain/rotationsplan.ts - die Wetteranbindung (2.13) selbst
    // ist noch nicht gebaut.
    reifegrad: "angebunden",
  },
  {
    key: "wetter",
    zone: "feld",
    slug: "wetter",
    icon: "cloud-sun",
    resource: "rotationsplan",
    klassifikation: "neu-bauen",
    // Anforderung 2.13: Temperatursummen-Heuristik ueber Open-Meteo, siehe
    // wetter-ansicht.tsx. Bewusst kein Prognosemodell ("Prognosemodelle erst
    // ab der zweiten Saison") - die Kennzahl wird sichtbar, nicht bewertet.
    reifegrad: "angebunden",
  },

  // ----------------------------------------------------------------- Zone Hof
  {
    key: "kuehlkette",
    zone: "hof",
    slug: "kuehlkette",
    icon: "thermometer-snowflake",
    resource: "kuehlkette",
    klassifikation: "neu-bauen",
    // Anforderung 3.1: die Live-Alarmlogik (KuehlkettenAlarm, mitzaehlend vor
    // Ablauf der 60-Minuten-Grenze statt nur rueckblickend zu urteilen) gab es
    // bereits je Pflueckaufgabe - hier jetzt betriebsweit fuer alle offenen
    // Chargen, siehe kuehlkette-ansicht.tsx.
    reifegrad: "angebunden",
  },
  {
    key: "logistik",
    zone: "hof",
    slug: "logistik",
    icon: "truck",
    resource: "logistik",
    klassifikation: "anpassen",
    // Anforderung 3.5 Teil 1 (Tourenplanung mit Routenoptimierung ueber
    // OSRM/Nominatim) und Teil 2 (digitale Uebergabequittung) sind beide
    // angebunden (LogistikAnsicht). Fahrzeugkapazitaet und Lieferzeitfenster
    // bleiben bewusst aussen vor, siehe Migration 20261010000000.
    reifegrad: "angebunden",
  },
  {
    key: "qr_steigen",
    zone: "hof",
    slug: "qr-steigen",
    icon: "qr-code",
    resource: "qr_steigen",
    klassifikation: "anpassen",
    // WMCNL-1439: QR-Etiketten (Steigen), Pfluecker-Ausweise und ein
    // Aushang-Poster werden serverseitig aus echten steigen/chargen/
    // pfluecker-Zeilen erzeugt (kein Mock mehr, siehe
    // src/components/db/qr-steigen-ansicht.tsx) - deshalb "angebunden",
    // obwohl rbac.ts fuer diese Ressource bewusst nur "view" vergibt: Steigen
    // entstehen bereits ueber die Nachweiskette (pflueckaufgaben), dieses
    // Modul erzeugt daraus nur Erzeugnisse zum Anzeigen/Drucken, es hat also
    // planmaessig keinen eigenen Schreibpfad.
    // Anforderung 2.7/2.8: die Scan-Oberflaeche am Ausgabepunkt ist jetzt
    // ebenfalls angebunden - der Ausweis-QR kodiert seither den eigenen
    // Ausweis-Code der Person statt einer fuer alle Ausweise identischen
    // Navigations-URL, gescannt wird in SteigeFormular/ArbeitszeitFormular
    // (nachweiskette-formulare.tsx, AusweisScanFeld), wo Menge/Reihenblock/
    // Uhrzeit ueber die Aufgabe ohnehin schon feststehen - nur die Person kam
    // bisher per Dropdown, nicht per Scan.
    reifegrad: "angebunden",
  },
  {
    key: "esf",
    zone: "hof",
    slug: "lieferschein-esf",
    icon: "file-check-2",
    resource: "integrationen",
    klassifikation: "neu-bauen",
    reifegrad: "in-entwicklung",
  },

  // --------------------------------------------------------------- Zone Buero
  {
    key: "rollen",
    zone: "buero",
    slug: "rollen",
    icon: "shield-check",
    resource: "rollen",
    klassifikation: "uebernehmen",
    // Anforderung E.20: die Einladungsverwaltung (EinladungenAnsicht) schreibt
    // echte kundeneinladungen-Zeilen unter RLS und legt beim Einloesen ein
    // Konto an - der erste schreibende Vorgang in diesem Modul ueberhaupt.
    // Die Rechtematrix darueber bleibt reine Anzeige, zeigt aber die echte
    // Konfiguration aus rbac.ts, keine Mock-Daten; sie war nie der Grund fuer
    // "demo". Offen bleibt die Verwaltung bestehender Konten (Rolle aendern,
    // Zugang sperren) - dafuer gibt es noch keine Anforderung.
    reifegrad: "angebunden",
  },
  {
    key: "finanzen",
    zone: "buero",
    slug: "finanzen",
    icon: "coins",
    resource: "finanzen",
    klassifikation: "anpassen",
    // Anforderung 4.2 (P0): Kostentraeger und Ledger-Buchungen laufen jetzt
    // ueber echte Schreibpfade unter RLS (Migration 20260909000000), der
    // Deckungsbeitrag kommt aus der Datenbank-View
    // deckungsbeitrag_je_kostentraeger - kein Mock mehr, siehe
    // src/components/db/finanzen-ansicht.tsx.
    reifegrad: "angebunden",
  },
  {
    key: "personal",
    zone: "buero",
    slug: "personal",
    icon: "users",
    resource: "personal",
    klassifikation: "anpassen",
    // Anforderung 2.11: Schicht-Konzept (brigade_einsatzplan),
    // Bedarfsrechnung (brigadenplanung_bedarf) und Reserveliste sind
    // angebunden. Wetterszenarien bleiben offen (Anforderung 2.13, bewusst
    // zurueckgestellt auf 2027, siehe PersonalAnsicht).
    reifegrad: "angebunden",
  },
  {
    key: "lohn",
    zone: "buero",
    slug: "lohn",
    icon: "calculator",
    resource: "lohn",
    klassifikation: "neu-bauen",
    reifegrad: "angebunden",
  },
  {
    key: "dokumente",
    zone: "buero",
    slug: "dokumente",
    icon: "folder-lock",
    resource: "dokumente",
    klassifikation: "uebernehmen",
    reifegrad: "angebunden",
  },
  {
    key: "compliance",
    zone: "buero",
    slug: "compliance",
    icon: "scale",
    resource: "compliance",
    klassifikation: "anpassen",
    reifegrad: "angebunden",
  },
  {
    key: "integrationen",
    zone: "buero",
    slug: "integrationen",
    icon: "plug",
    resource: "integrationen",
    klassifikation: "neu-bauen",
    reifegrad: "in-entwicklung",
  },
  {
    key: "foerdermittel",
    zone: "buero",
    slug: "foerdermittel",
    icon: "landmark",
    resource: "foerdermittel",
    klassifikation: "anpassen",
    // Anforderung 4.12: Status/Frist eines Dossiers pflegen und angehaengte
    // Nachweisdokumente sehen ist angebunden. Echte Antragsvorlagen fuer
    // gosagro.kz/qoldau.kz bleiben bewusst offen (fachliche Festlegung, siehe
    // FoerdermittelAnsicht).
    reifegrad: "angebunden",
  },

  // --------------------------------------------------------------- Zone Markt
  {
    key: "sortenkatalog",
    zone: "markt",
    slug: "sortenkatalog",
    icon: "book-open",
    resource: "sortenkatalog",
    klassifikation: "anpassen",
    reifegrad: "demo",
  },
  {
    key: "b2b_portal",
    zone: "markt",
    slug: "b2b-portal",
    icon: "handshake",
    resource: "b2b_portal",
    klassifikation: "anpassen",
    // Anforderung 5.2 Teil 2a: "Meine Lieferungen" mit echtem Lieferstatus.
    // Anforderung 5.1, Teil 2 von 2: Preisliste anzeigen und Vorbestellung
    // aufgeben (manuelle Buero-Bestaetigung statt automatischem
    // Kontingent-Verbrauch) sind jetzt ebenfalls angebunden. Bewusst noch
    // offen, beides eine fachliche statt technische Festlegung: automatischer
    // Kontingent-Verbrauch (wie kontingente.reserviert_kg verbraucht/
    // zurueckgesetzt wird), Preisstaffelung je Kundengruppe und
    // Rechnungshistorie (5.2 Teil 2b, was ueberhaupt als "Rechnung" gilt).
    reifegrad: "angebunden",
  },
  {
    // Zone "markt", nicht "buero": anders als Lohn/Compliance/Foerdermittel hat
    // eine Reklamation eine Kunde-Sichtseite - der B2B-Kunde muss das Modul
    // selbst oeffnen koennen, um anzulegen und den eigenen Stand einzusehen.
    key: "reklamationen",
    zone: "markt",
    slug: "reklamationen",
    icon: "message-square-warning",
    resource: "reklamationen",
    klassifikation: "neu-bauen",
    reifegrad: "angebunden",
  },
  {
    key: "preislisten",
    zone: "markt",
    slug: "preislisten",
    icon: "tag",
    resource: "b2b_portal",
    klassifikation: "anpassen",
    reifegrad: "in-entwicklung",
  },
  {
    key: "ki_assistent",
    zone: "markt",
    slug: "ki-assistent",
    icon: "sparkles",
    resource: "ki_assistent",
    klassifikation: "uebernehmen",
    // Anforderung 5.4/5.5: echter, anbieteruebergreifender Chat statt reinem
    // Platzhalter-Chatfenster (KiAssistentMock entfaellt). Ein Admin bindet
    // Sokrates, Claude (Anthropic) oder ein selbst gehostetes Open-Source-
    // Modell jeweils per API-Key an (ki-assistent-ansicht.tsx).
    reifegrad: "angebunden",
  },
  {
    key: "aggregator",
    zone: "markt",
    slug: "aggregator",
    icon: "network",
    resource: "aggregator",
    klassifikation: "anpassen",
    // WMCNL-1453: CSV-Import (src/lib/import/zukauf-parser.ts) schreibt unter
    // RLS echte zukauf_positionen/chargen-Zeilen ueber die atomare RPC
    // public.zukauf_positionen_importieren() - Ende-zu-Ende-Erfassung
    // funktioniert, "angebunden" ist damit ehrlich (siehe module-meta.tsx).
    reifegrad: "angebunden",
  },
  {
    key: "schulungen",
    zone: "markt",
    slug: "schulungen",
    icon: "graduation-cap",
    resource: "schulungen",
    klassifikation: "uebernehmen",
    // Anforderung 2.12: mehrsprachige Kurzeinarbeitung als bebilderte
    // Checkliste (einarbeitung_schritte/-fortschritt) loest die bisherige
    // Mock-Ansicht ab, siehe EinarbeitungAnsicht.
    reifegrad: "angebunden",
  },
  {
    key: "kanaele",
    zone: "markt",
    slug: "kanaele",
    icon: "message-circle",
    resource: "kanaele",
    klassifikation: "neu-bauen",
    // Anforderung 5.6: lokal etablierte Kontaktkanaele/Zahlungswege, vom
    // Buero gepflegt und im Seitenfuss oeffentlich sichtbar. Reine Anzeige,
    // keine echte API-Integration (Nutzer-Entscheidung).
    reifegrad: "angebunden",
  },
];

export function modulesForZone(zone: ZoneKey): ModuleDef[] {
  return modules.filter((module) => module.zone === zone);
}

export function moduleByPath(zone: string, slug: string): ModuleDef | undefined {
  return modules.find((module) => module.zone === zone && module.slug === slug);
}

// Einzige Stelle, an der die Modulroute gebaut wird. Wer sie von Hand
// zusammensetzt, haengt beim naechsten Umbau des Pfades hinterher.
export function moduleHref(module: ModuleDef): string {
  return `/dashboard/${module.zone}/${module.slug}`;
}
