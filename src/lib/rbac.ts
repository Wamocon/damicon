// Rollen von Damicon - direkt aus 1Cati `apps/web/lib/rbac.ts` uebernommen
// ([UEBERNEHMEN], Analyse Kapitel 5). Die Guardianship-/Kind-Rollen aus 1Cati
// (guest, service_provider, child_owner, child_tenant, child_guest) sind wie in
// der Analyse gefordert entfernt. Es bleiben sechs Kernrollen mit Agrar-Bezug,
// dazu "picker" als siebte, neue Rolle ohne 1Cati-Entsprechung (Anforderung
// 7.1 aus dem Masterplan): der einzelne Pfluecker, beschraenkt auf die eigene
// Leistung, ohne Schreibrecht auf gebuchte Mengen.

export const roles = [
  "admin",
  // Achte Rolle, nachtraeglich (weicht von "Anforderung 7.1: genau sieben
  // Rollen" ab, siehe Kommentar unten bei roleDefinitions/rolePermissions.ceo).
  "ceo",
  "betriebsleitung",
  "buchhaltung",
  "brigade",
  "picker",
  "erzeuger",
  "kunde",
] as const;

export type Role = (typeof roles)[number];

export const resources = [
  "dashboard",
  "standort",
  "reihenbloecke",
  "pflueckaufgaben",
  "pflanzenschutz",
  "rotationsplan",
  "kuehlkette",
  "logistik",
  "qr_steigen",
  "personal",
  "lohn",
  "finanzen",
  "dokumente",
  "compliance",
  "integrationen",
  "foerdermittel",
  "sortenkatalog",
  "b2b_portal",
  "reklamationen",
  "ki_assistent",
  "aggregator",
  "schulungen",
  "rollen",
  // Anforderung E.20: Zugangsverwaltung fuer B2B-Kundenkonten. Bewusst eine
  // eigene Ressource statt eines Schreibrechts auf "rollen": eine Einladung
  // legt genau ein Kundenkonto an, die Rollenverwaltung dagegen entscheidet
  // ueber jede Rolle im Betrieb. Wer einladen darf, soll damit nicht auch
  // Rollen vergeben duerfen.
  "einladungen",
  // Anforderung 5.6: lokal etablierte Kontaktkanaele und Zahlungswege
  // (WhatsApp, Kaspi QR o. Ae.), oeffentlich sichtbar auf der Website, vom
  // Buero gepflegt. Reine Anzeige/Verwaltung, keine echte API-Integration.
  "kanaele",
  // Anforderung 5.1/5.2: Preislisten-Verwaltung und Kundengruppen-Zuordnung.
  // Bewusst eine eigene Ressource statt einer Mitnutzung von "b2b_portal" -
  // kunde/erzeuger haben dort view/create/update (fuer die eigene
  // Vorbestellung), sollen darueber aber nicht auch Preislisten fuer alle
  // Kundengruppen anlegen oder aendern koennen.
  // Anforderung E.11: Rechtsform und Steueridentifikation (ИИН/БИН) von
  // Betrieb, Zulieferern und Kunden. Eigene Ressource, weil die Nummern
  // belegrelevant sind: wer sie aendert, aendert, was auf einer Rechnung
  // steht. Das ist eine andere Befugnis als Kunden oder Preise pflegen.
  "stammdaten",
  "preislisten",
] as const;

export type Resource = (typeof resources)[number];

export const actions = [
  "view",
  "create",
  "update",
  "delete",
  "manage",
  "approve",
  "assign",
  // Anforderung 2.12: ein picker hakt die eigene Kurzeinarbeitung ab - kein
  // generelles Schreibrecht auf das Modul "schulungen", nur dieser eine,
  // schmale Vorgang. Gleiches Prinzip wie approve/assign: eigener Verb statt
  // des breiteren "update".
  "complete",
] as const;

export type Action = (typeof actions)[number];

export interface RoleDefinition {
  key: Role;
  labelKey: string;
  descriptionKey: string;
  level: number;
  scope: "betrieb" | "plantage" | "finanzen" | "feld" | "pfluecker" | "erzeugerbetrieb" | "kunde";
}

// Remapping der sechs 1Cati-Kernrollen (admin, manager, accountant, staff,
// owner, tenant) auf den Himbeerbetrieb.
export const roleDefinitions: RoleDefinition[] = [
  {
    key: "admin",
    labelKey: "roles.admin",
    descriptionKey: "roles.descriptions.admin",
    level: 90,
    scope: "betrieb",
  },
  // Anforderung aus dem Auftrag vom 22.09.2026, weicht bewusst von
  // "Anforderung 7.1: genau sieben Rollen abgenommen" ab (siehe
  // supabase/migrations/20261103020000_ceo_rolle.sql). Rechte kuratiert, nicht
  // 1:1 admin: siehe rolePermissions.ceo unten.
  {
    key: "ceo",
    labelKey: "roles.ceo",
    descriptionKey: "roles.descriptions.ceo",
    level: 95,
    scope: "betrieb",
  },
  {
    key: "betriebsleitung",
    labelKey: "roles.betriebsleitung",
    descriptionKey: "roles.descriptions.betriebsleitung",
    level: 70,
    scope: "plantage",
  },
  {
    key: "buchhaltung",
    labelKey: "roles.buchhaltung",
    descriptionKey: "roles.descriptions.buchhaltung",
    level: 60,
    scope: "finanzen",
  },
  {
    key: "brigade",
    labelKey: "roles.brigade",
    descriptionKey: "roles.descriptions.brigade",
    level: 40,
    scope: "feld",
  },
  {
    key: "picker",
    labelKey: "roles.picker",
    descriptionKey: "roles.descriptions.picker",
    level: 25,
    scope: "pfluecker",
  },
  {
    key: "erzeuger",
    labelKey: "roles.erzeuger",
    descriptionKey: "roles.descriptions.erzeuger",
    level: 20,
    scope: "erzeugerbetrieb",
  },
  {
    key: "kunde",
    labelKey: "roles.kunde",
    descriptionKey: "roles.descriptions.kunde",
    level: 10,
    scope: "kunde",
  },
];

type Permission = `${Resource}:${Action}`;

const all = (resource: Resource): Permission[] =>
  actions.map((action) => `${resource}:${action}` as Permission);

const view = (resource: Resource): Permission[] => [`${resource}:view`];

const crud = (resource: Resource): Permission[] => [
  `${resource}:view`,
  `${resource}:create`,
  `${resource}:update`,
];

export const rolePermissions: Record<Role, Permission[]> = {
  admin: resources.flatMap((resource) => all(resource)),
  // Kuratierte Fuehrungsrolle: alle Rechte von admin, ausser
  // ki_assistent:manage (Verwaltung der KI-Provider-Schluessel - ein
  // IT-Betriebsthema, kein Fuehrungsthema, und ein vermeidbares Risiko an
  // einem haeufig per Phishing angegriffenen Konto). Der admin-only
  // Rollen-Vorschau-Debug-Schalter (components/dashboard/persona.tsx,
  // app/api/ki-assistent/route.ts) ist keine rbac-Berechtigung und bleibt
  // hier bewusst unangetastet, gilt also weiterhin nur fuer admin.
  ceo: resources.flatMap((resource) => all(resource)).filter((p) => p !== "ki_assistent:manage"),
  betriebsleitung: [
    ...crud("stammdaten"),
    ...view("dashboard"),
    ...crud("standort"),
    ...crud("reihenbloecke"),
    `reihenbloecke:approve`,
    ...crud("pflueckaufgaben"),
    `pflueckaufgaben:assign`,
    // Belegpruefung und Abschluss einer Pflueckaufgabe (Meilenstein B).
    `pflueckaufgaben:approve`,
    ...crud("pflanzenschutz"),
    ...crud("rotationsplan"),
    ...view("kuehlkette"),
    ...crud("logistik"),
    ...view("qr_steigen"),
    ...crud("personal"),
    ...view("lohn"),
    ...view("finanzen"),
    ...crud("dokumente"),
    ...crud("compliance"),
    ...view("integrationen"),
    ...crud("foerdermittel"),
    ...crud("sortenkatalog"),
    ...crud("b2b_portal"),
    // Bearbeiten und Schliessen einer Reklamation inklusive Gutschrift.
    ...crud("reklamationen"),
    `reklamationen:approve`,
    ...view("ki_assistent"),
    // Anforderung 5.4/5.5: eine Chat-Nachricht senden ist ein eigener,
    // schmalerer Vorgang als "update" (kein Zugriff auf die Anbieterliste
    // selbst, das bleibt "manage" und damit admin vorbehalten, siehe
    // rolePermissions.admin ueber all(resource) unten).
    `ki_assistent:create`,
    ...crud("aggregator"),
    ...crud("schulungen"),
    // Anforderung 4.10: die eigene Pflichtschulung nachweisen, dasselbe
    // schmale Verb wie bei picker unten (siehe dortiger Kommentar) - crud()
    // deckt "complete" nicht ab.
    "schulungen:complete",
    ...view("rollen"),
    // Anforderung E.20: Kundenzugaenge ausstellen und zurueckziehen. Kein
    // delete - eine ausgestellte Einladung bleibt nachvollziehbar, die
    // Migration 20261002000000 kennt dafuer gar keine Policy.
    ...crud("einladungen"),
    // Anforderung 5.6: Kontaktkanaele/Zahlungswege pflegen, inklusive
    // Loeschen eines falsch angelegten Kanals (anders als "einladungen" kein
    // Nachweisinteresse an alten Zeilen).
    ...crud("kanaele"),
    "kanaele:delete",
    // Anforderung 5.1/5.2: Preislisten anlegen/aendern und Positionen
    // entfernen (ein falsch angelegter Preis soll wieder verschwinden
    // koennen, dieselbe Begruendung wie bei "kanaele:delete" oben) sowie
    // Kunden einer Kundengruppe zuordnen. Preislisten selbst bleiben ohne
    // delete - nur deaktivierbar, sie bleiben historisch massgeblich fuer
    // bereits berechnete Proforma-Betraege (siehe domain/rechnungshistorie.ts).
    ...crud("preislisten"),
    "preislisten:delete",
  ],
  buchhaltung: [
    // Anforderung E.11: Die Buchhaltung stellt die Belege aus, auf denen
    // ИИН und БИН stehen - sie muss sie auch pflegen koennen.
    ...crud("stammdaten"),
    ...view("dashboard"),
    ...view("reihenbloecke"),
    ...view("pflueckaufgaben"),
    ...crud("lohn"),
    `lohn:approve`,
    ...all("finanzen"),
    ...crud("dokumente"),
    ...crud("compliance"),
    ...crud("integrationen"),
    ...crud("foerdermittel"),
    ...view("b2b_portal"),
    // Die Gutschrift ist eine Finanzbuchung - deshalb auch fuer die
    // Buchhaltung Bearbeitungsrecht, nicht nur Ansicht.
    ...crud("reklamationen"),
    `reklamationen:approve`,
    ...view("aggregator"),
    // KI-Assistent: MwSt, ESUTD, Compliance und Lohn sind das Fachgebiet der
    // Buchhaltung. Die KI sieht dabei nie mehr als die Rolle selbst (Werkzeuge
    // und RLS folgen den Rechten oben).
    ...view("ki_assistent"),
    "ki_assistent:create",
    // Anforderung 4.10: Buchhaltung sitzt im Buero wie betriebsleitung, faellt
    // unter dieselbe Pflichtschulungs-Zielgruppe (has_office_access()).
    ...view("schulungen"),
    "schulungen:complete",
  ],
  brigade: [
    ...view("dashboard"),
    ...view("standort"),
    ...view("reihenbloecke"),
    ...crud("pflueckaufgaben"),
    ...view("pflanzenschutz"),
    ...view("rotationsplan"),
    ...view("qr_steigen"),
    ...view("kuehlkette"),
    ...view("schulungen"),
    // Anforderung 4.10: Brigade ist Arbeitskraft im Feld wie picker, braucht
    // denselben Nachweis-Vorgang fuer die eigene Pflichtschulung.
    "schulungen:complete",
    // Anforderung 3.5: Brigade erfasst die Uebergabequittung (bestehende
    // Lieferung als zugestellt markieren), plant aber keine neue Lieferung -
    // das bleibt Planungsaufgabe der Betriebsleitung (kein logistik:create).
    ...view("logistik"),
    "logistik:update",
    // Anforderung 5.4/5.5, rollenbasierte Wissensgrundlage: Brigade darf den
    // KI-Assistenten nutzen, bekommt aber ausschliesslich feldbezogene
    // Verfahrensregeln als Kontext (baueWissensKontextFuerRolle(),
    // domain/ki-assistent.ts) - kein view("finanzen")/view("lohn") in dieser
    // Liste, also auch keine Finanz-/Lohndaten im Chat-Kontext.
    ...view("ki_assistent"),
    "ki_assistent:create",
  ],
  // Sieht nur die eigene Leistung (Anforderung 7.1): view("lohn") oeffnet
  // dasselbe Lohn-Modul wie betriebsleitung/buchhaltung, die RLS-Policies
  // lohn_abrechnungen_select_own/lohn_positionen_select_own (Migration
  // 20260909010000) lassen dabei ausschliesslich die eigene Zeile durch, ueber
  // profiles.pfluecker_id. Kein view("pflueckaufgaben"): das waere
  // betriebsweite Sicht statt "nur die eigene Leistung" - fuer die
  // Aufgabenzuweisung im Feld bleibt die Rolle brigade zustaendig.
  // schulungen:complete-own (Anforderung 2.12): ein picker hakt die eigene
  // Kurzeinarbeitung ab, RLS (einarbeitung_fortschritt_insert_own) laesst
  // dabei ausschliesslich die eigene pfluecker_id durch, gleiches Muster wie
  // die Lohn-Eigenzeile oben.
  picker: [
    ...view("dashboard"),
    ...view("lohn"),
    ...view("schulungen"),
    "schulungen:complete",
  ],
  erzeuger: [
    ...view("dashboard"),
    ...view("reihenbloecke"),
    ...view("pflueckaufgaben"),
    ...view("finanzen"),
    ...view("dokumente"),
    // WMCNL-2299: bis vor Kurzem crud("aggregator"). Die Schreib-RLS auf
    // nachbarbetriebe/zukauf_positionen bleibt laut Migrationskopf
    // 20260908140000 (Punkt 3) ausdruecklich admin/betriebsleitung
    // vorbehalten - ein echtes Self-Service-Szenario fuer erzeuger braucht
    // eine profiles->nachbarbetrieb-Verknuepfung, die es (noch) nicht gibt.
    // Mit crud() zeigte die Oberflaeche "Betrieb aufnehmen" und den
    // CSV-Import trotzdem an; jeder Versuch scheiterte serverseitig an der
    // RLS (fehler.berechtigung), ohne dass rbac.ts (die erste
    // Verteidigungslinie) das schon verhinderte. view() spiegelt die
    // tatsaechliche Rechtelage wider, bis die Self-Service-Anforderung
    // feststeht.
    ...view("aggregator"),
    ...view("b2b_portal"),
    ...view("schulungen"),
  ],
  kunde: [
    ...view("dashboard"),
    ...view("sortenkatalog"),
    ...crud("b2b_portal"),
    // Eigene Reklamation anlegen und einsehen - Bearbeiten und Schliessen
    // bleibt dem Buero vorbehalten (siehe RLS in der Migration).
    ...view("reklamationen"),
    `reklamationen:create`,
    ...view("ki_assistent"),
    `ki_assistent:create`,
    ...view("dokumente"),
  ],
};

export function hasPermission(
  role: Role | null | undefined,
  resource: Resource,
  action: Action,
): boolean {
  if (!role || !roles.includes(role)) return false;
  return rolePermissions[role].includes(`${resource}:${action}` as Permission);
}

