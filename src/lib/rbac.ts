// Rollen von Damicon - direkt aus 1Cati `apps/web/lib/rbac.ts` uebernommen
// ([UEBERNEHMEN], Analyse Kapitel 5). Die Guardianship-/Kind-Rollen aus 1Cati
// (guest, service_provider, child_owner, child_tenant, child_guest) sind wie in
// der Analyse gefordert entfernt. Es bleiben sechs Kernrollen mit Agrar-Bezug,
// dazu "picker" als siebte, neue Rolle ohne 1Cati-Entsprechung (Anforderung
// 7.1 aus dem Masterplan): der einzelne Pfluecker, beschraenkt auf die eigene
// Leistung, ohne Schreibrecht auf gebuchte Mengen.

export const roles = [
  "admin",
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
  catiRole: string;
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
    catiRole: "admin",
  },
  {
    key: "betriebsleitung",
    labelKey: "roles.betriebsleitung",
    descriptionKey: "roles.descriptions.betriebsleitung",
    level: 70,
    scope: "plantage",
    catiRole: "manager",
  },
  {
    key: "buchhaltung",
    labelKey: "roles.buchhaltung",
    descriptionKey: "roles.descriptions.buchhaltung",
    level: 60,
    scope: "finanzen",
    catiRole: "accountant",
  },
  {
    key: "brigade",
    labelKey: "roles.brigade",
    descriptionKey: "roles.descriptions.brigade",
    level: 40,
    scope: "feld",
    catiRole: "staff",
  },
  {
    key: "picker",
    labelKey: "roles.picker",
    descriptionKey: "roles.descriptions.picker",
    level: 25,
    scope: "pfluecker",
    catiRole: "keine Entsprechung - neu ab Anforderung 7.1",
  },
  {
    key: "erzeuger",
    labelKey: "roles.erzeuger",
    descriptionKey: "roles.descriptions.erzeuger",
    level: 20,
    scope: "erzeugerbetrieb",
    catiRole: "owner",
  },
  {
    key: "kunde",
    labelKey: "roles.kunde",
    descriptionKey: "roles.descriptions.kunde",
    level: 10,
    scope: "kunde",
    catiRole: "tenant",
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
  betriebsleitung: [
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
    ...crud("aggregator"),
    ...crud("schulungen"),
    // Anforderung 4.10: die eigene Pflichtschulung nachweisen, dasselbe
    // schmale Verb wie bei picker unten (siehe dortiger Kommentar) - crud()
    // deckt "complete" nicht ab.
    "schulungen:complete",
    ...view("rollen"),
  ],
  buchhaltung: [
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
    ...crud("aggregator"),
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

export function accessibleResources(role: Role): Resource[] {
  const seen = new Set<Resource>();
  for (const permission of rolePermissions[role]) {
    seen.add(permission.split(":")[0] as Resource);
  }
  return [...seen];
}
