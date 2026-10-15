// Abgleich der Rechtematrix (src/lib/rbac.ts) mit der Zeilensicherheit der Datenbank (WMCNL-1461).
//
// Die Matrix sagt, welche Rolle welche Ressource sehen (view), anlegen (create), aendern (update) und
// loeschen (delete) darf. Die Datenbank entscheidet verbindlich ueber RLS-Policies und Rechte. Dieser
// Test parst keine Policies, er PROBIERT den Zugriff aus: je Rolle, Ressource und Aktion ein Versuch auf
// der Haupttabelle der Ressource, mit einer Rueckrollung danach. Das Ergebnis geht gegen die Matrix.
//
//   view    select auf die Tabelle: sichtbar, wenn mindestens eine Zeile durchkommt (Superuser sieht eine)
//   create  Einfuegen einer Kopie einer vorhandenen Zeile: Zeilensicherheit und Rechte entscheiden vor
//           der Eindeutigkeit, ein Schluesselkonflikt (23505) heisst also "durchgelassen"
//   update  Aenderung ohne Wirkung (Spalte auf sich selbst) an allen Zeilen: mindestens eine Zeile betroffen
//   delete  Loeschen aller sichtbaren Zeilen: mindestens eine betroffen
//
// Zwei Richtungen von Abweichungen:
//   Matrix erlaubt, Datenbank nicht: die Oberflaeche bietet etwas an, das scheitert (Komfortfehler).
//   Datenbank erlaubt, Matrix nicht: die zweite Verteidigungslinie ist weiter als die erste (Sicherheitsluecke
//   oder veraltete Matrix) und gehoert zuerst angesehen.
//
// Bekannte Abweichungen stehen mit Begruendung in BEKANNT. Eine neue Abweichung und eine veraltete Ausnahme
// lassen den Test scheitern. Nicht pruefbar sind Ressourcen ohne eigene Tabelle und Aktionen, die nur die
// Anwendung kennt (approve, assign, manage, complete): sie stehen in NICHT_PRUEFBAR.
//
// Aufruf: npm run test:rbac-rls

import { starte, ROLLEN } from "./hilfen/pglite-rollen.mjs";
import { resources, hasPermission, type Action, type Resource, type Role } from "@/lib/rbac";

const t = await starte();
const { db, alsAdmin, als, check } = t;

type ProbeAktion = "view" | "create" | "update" | "delete";

/** Haupttabelle je Ressource und Aktion. Fehlt ein Eintrag, wird die Aktion nicht geprueft (siehe NICHT_PRUEFBAR). */
const SONDEN: Partial<Record<Resource, Partial<Record<ProbeAktion, string>>>> = {
  standort: { view: "plantagen", create: "plantagen", update: "plantagen" },
  reihenbloecke: { view: "reihenbloecke", create: "reihenbloecke", update: "reihenbloecke" },
  pflueckaufgaben: { view: "pflueckaufgaben", create: "pflueckaufgaben", update: "pflueckaufgaben" },
  pflanzenschutz: { view: "pflanzenschutz_behandlungen", create: "pflanzenschutz_behandlungen", update: "pflanzenschutz_behandlungen" },
  rotationsplan: { view: "rotationsplan_eintraege", create: "rotationsplan_eintraege", update: "rotationsplan_eintraege" },
  kuehlkette: { view: "kuehlketten_messungen", create: "kuehlketten_messungen" },
  logistik: { view: "lieferungen", create: "lieferungen", update: "lieferungen" },
  qr_steigen: { view: "steigen", create: "steigen", update: "steigen" },
  personal: { view: "pfluecker", create: "pfluecker", update: "pfluecker" },
  lohn: { view: "lohn_abrechnungen" },
  finanzen: { view: "finance_ledger_entries", create: "finance_ledger_entries" },
  dokumente: { view: "dokumente", create: "dokumente", update: "dokumente" },
  compliance: { view: "datenschutzvorfaelle", create: "datenschutzvorfaelle", update: "datenschutzvorfaelle" },
  integrationen: { view: "integrationen", create: "esf_belege", update: "esf_belege" },
  foerdermittel: { view: "foerderdossiers", create: "foerderdossiers", update: "foerderdossiers" },
  sortenkatalog: { view: "sorten", create: "sorten", update: "sorten" },
  b2b_portal: { view: "vorbestellungen", create: "vorbestellungen", update: "vorbestellungen" },
  reklamationen: { view: "reklamationen", create: "reklamationen", update: "reklamationen" },
  aggregator: { view: "nachbarbetriebe", create: "nachbarbetriebe", update: "nachbarbetriebe" },
  schulungen: { view: "schulungsvideos" },
  kanaele: { view: "kontaktkanaele", create: "kontaktkanaele", update: "kontaktkanaele", delete: "kontaktkanaele" },
  stammdaten: { view: "b2b_kunden", update: "b2b_kunden" },
  preislisten: { view: "preislisten", create: "preislisten", update: "preislisten", delete: "preislisten_positionen" },
};

/** Was der Test bewusst nicht prueft, mit Grund. */
const NICHT_PRUEFBAR: Record<string, string> = {
  dashboard: "keine eigene Tabelle: die Startseite liest Kennzahlen und Sichten, jede mit eigener Zeilensicherheit",
  wirtschaftlichkeit: "rechnet heute aus Konstanten, hat keine Tabelle (WMCNL-2470)",
  ki_assistent: "Chat- und Anbietertabellen sind leer im Seed und haengen an der Anwendungslogik (Einwilligung, Ratenlimit)",
  rollen: "profiles: jede Rolle liest und aendert die eigene Zeile, die Rollenvergabe schuetzen Trigger (profil_rolle_schuetzen, profil_letzter_admin_schuetzen), geprueft in rollenzuweisung.mts",
  einladungen: "die Tabelle ist im Seed leer, ein gueltiges Muster-Einladungsdatum gehoert in einen eigenen Test (einladungen.mts)",
  "delete (ausser kanaele, preislisten)": "delete ist ausserhalb von kanaele und preislisten nur ueber all() fuer admin und ceo vergeben: Tabellen sind teils bewusst unveraenderlich (Protokolle, Buchungen, Nachrichten)",
  "approve, assign, manage, complete": "Verben der Anwendung ohne eigene Tabellenoperation; sie greifen als Spaltenaenderung oder Funktionsaufruf",
};

/**
 * Bekannte Abweichungen mit Begruendung. Eine Regel gilt fuer alle genannten Rollen. Wird eine Abweichung behoben,
 * meldet der Test die Ausnahme als veraltet. "Entscheidung" heisst: Matrix oder Policy muss angepasst werden, welche,
 * ist eine fachliche Frage.
 */
const BEKANNTE_REGELN: { rollen: Role[]; ressource: Resource; aktionen: ProbeAktion[]; grund: string }[] = [
  // Datenbank erlaubt mehr als die Matrix
  { rollen: ["brigade", "buchhaltung", "erzeuger", "kunde", "picker"], ressource: "kanaele", aktionen: ["view"], grund: "Kontaktkanaele sind oeffentlich (kontaktkanaele_select_public/_intern, Anforderung 5.6), die Website zeigt sie jedem" },
  { rollen: ["brigade", "buchhaltung", "picker"], ressource: "sortenkatalog", aktionen: ["view"], grund: "Sorten sind Stammdaten fuer Auswahllisten (sorten_select_public), jede Rolle braucht sie" },
  { rollen: ["erzeuger"], ressource: "sortenkatalog", aktionen: ["view"], grund: "wie oben: Sorten sind fuer alle lesbar" },
  { rollen: ["kunde"], ressource: "schulungen", aktionen: ["view"], grund: "Schulungsvideos sind oeffentlich lesbar (schulungsvideos_select_public)" },
  { rollen: ["kunde"], ressource: "preislisten", aktionen: ["view"], grund: "entschieden am 15.10.2026: der Kunde liest die Preislisten seiner eigenen Kundengruppe und die gruppenlosen Standardlisten (preislisten_select_rollen), im B2B-Portal. Das Verwaltungsmodul Preislisten bleibt ihm verschlossen" },
  { rollen: ["brigade", "buchhaltung", "picker"], ressource: "personal", aktionen: ["view"], grund: "pfluecker_select_personal (Lohn und Einsatzplanung brauchen die Pflueckernamen) und pfluecker_select_own (die eigene Zeile des Pfluecker)" },
  { rollen: ["buchhaltung"], ressource: "kuehlkette", aktionen: ["view"], grund: "kuehlketten_messungen_select_feld nennt die Buchhaltung (Nachweis zur Rechnung), die Matrix nicht" },
  { rollen: ["betriebsleitung", "brigade"], ressource: "kuehlkette", aktionen: ["create"], grund: "kuehlketten_messungen_insert_hof erlaubt der Feldarbeit das Erfassen einer Messung (Nachweiskette einer Pflueckaufgabe), die Matrix kennt kuehlkette nur als view" },
  { rollen: ["buchhaltung"], ressource: "qr_steigen", aktionen: ["view"], grund: "steigen_select_feld nennt die Buchhaltung, die Matrix nicht" },
  { rollen: ["betriebsleitung"], ressource: "qr_steigen", aktionen: ["create", "update"], grund: "steigen_insert_feld und _update_feld erlauben der Betriebsleitung das Erfassen und Korrigieren von Steigen, die Matrix kennt qr_steigen nur als view" },
  { rollen: ["buchhaltung", "kunde"], ressource: "logistik", aktionen: ["view"], grund: "Lieferungen sind fuers Buero lesbar, der Kunde liest seine eigenen (lieferungen_select_kunde_buero), das B2B-Portal zeigt sie" },
  // Matrix erlaubt mehr als die Datenbank: seit dem 15.10.2026 keine Ausnahme mehr (dokumente, b2b_portal, finanzen sind aus der Matrix entfallen)
];

const BEKANNT: Record<string, string> = {};
for (const r of BEKANNTE_REGELN) for (const rolle of r.rollen) for (const aktion of r.aktionen) BEKANNT[`${rolle}:${r.ressource}:${aktion}`] = r.grund;

// --- Vorbereitung -----------------------------------------------------------------------------------------
// Konten mit ihren Zeilen verknuepfen, damit "nur die eigene Zeile" greift (wie im Betrieb).
{
  const { rows: brig } = await db.query<{ id: string }>(`select id from public.brigaden order by name limit 1;`);
  const { rows: pf } = await db.query<{ pfluecker_id: string }>(`select pfluecker_id from public.lohn_abrechnungen order by created_at limit 1;`);
  await db.query(`update public.profiles set brigade_id = $1 where auth_user_id = $2;`, [brig[0].id, t.konten.brigade]);
  await db.query(`update public.profiles set pfluecker_id = $1 where auth_user_id = $2;`, [pf[0].pfluecker_id, t.konten.picker]);
}

// Zeilen, die dem Seed fehlen oder dem Test-Kunden nicht gehoeren, als Superuser herstellen. Die Versuche
// brauchen je Tabelle eine Zeile, die die jeweilige Rolle sehen darf, sonst sieht "keine Zeile durchgekommen"
// aus wie "verboten". Die Geschaeftsregeln der Tabellen (Trigger) sind hier nicht Gegenstand.
{
  const kunde = t.kundeId;
  await db.exec("alter table public.lieferungen disable trigger user;");
  const { rows: l } = await db.query<{ id: string }>(
    `insert into public.lieferungen (b2b_kunde_id, menge_kg, status, geliefert_am, empfaenger_name) values ($1, 50, 'zugestellt', now() - interval '1 day', 'Abgleich') returning id;`,
    [kunde],
  );
  await db.exec("alter table public.lieferungen enable trigger user;");
  await db.query(`insert into public.esf_belege (lieferung_id, entwurf) values ($1, '{}'::jsonb);`, [l[0].id]);
  for (const tabelle of ["vorbestellungen", "reklamationen"]) {
    await db.exec(`alter table public.${tabelle} disable trigger user;`);
    // Eine Vorbestellung kann der Kunde nur stornieren, solange sie angefragt ist: eine solche Zeile nehmen.
    const bedingung = tabelle === "vorbestellungen" ? "where status = 'angefragt'" : "";
    await db.query(`update public.${tabelle} set b2b_kunde_id = $1 where id = (select id from public.${tabelle} ${bedingung} order by id limit 1);`, [kunde]);
    await db.exec(`alter table public.${tabelle} enable trigger user;`);
  }
}

/** Tabellen, deren Trigger einen Versuch ablehnen koennten, BEVOR die Zeilensicherheit greift: fuer den Abgleich abgeschaltet. */
const TRIGGER_AUS = ["kuehlketten_messungen", "steigen", "pflanzenschutz_behandlungen", "lieferungen", "esf_belege"];
for (const tabelle of TRIGGER_AUS) await db.exec(`alter table public.${tabelle} disable trigger user;`);

/** Was "aendern" je Tabelle bedeutet, wenn die Rolle nicht beliebige Spalten aendern darf (zum Beispiel stornieren). */
const AENDERUNG: Record<string, string> = { vorbestellungen: "status = 'storniert'" };

interface Spaltenwissen {
  einfuegbar: string[];
  aenderbar: string | null;
}
const wissen = new Map<string, Spaltenwissen>();
const klonOk = new Set<string>();

async function bereite(tabelle: string): Promise<Spaltenwissen> {
  const bekannt = wissen.get(tabelle);
  if (bekannt) return bekannt;
  const { rows } = await db.query<{ column_name: string; is_generated: string; identity_generation: string | null }>(
    `select column_name, is_generated, identity_generation from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position;`,
    [tabelle],
  );
  const einfuegbar = rows.filter((r) => r.is_generated === "NEVER" && r.identity_generation === null).map((r) => r.column_name);
  const { rows: pk } = await db.query<{ attname: string }>(
    `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = ('public.' || $1)::regclass and i.indisprimary;`,
    [tabelle],
  );
  const pkSpalten = new Set(pk.map((p) => p.attname));
  const aenderbar = einfuegbar.find((c) => !pkSpalten.has(c)) ?? null;
  const w = { einfuegbar, aenderbar };
  wissen.set(tabelle, w);
  return w;
}

/** Legt eine Kopie der ersten Zeile als temporaere Tabelle an (als Superuser), damit der Einfuegeversuch eine gueltige Zeile ist. */
async function klone(tabelle: string): Promise<boolean> {
  if (klonOk.has(tabelle)) return true;
  const w = await bereite(tabelle);
  const spalten = w.einfuegbar.map((c) => `"${c}"`).join(", ");
  await db.exec(`drop table if exists pg_temp._klon_${tabelle};`);
  const { rows: hat } = await db.query<{ n: number }>(`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'b2b_kunde_id';`, [tabelle]);
  const bevorzugt = hat[0].n > 0 ? `order by (b2b_kunde_id = '${t.kundeId}') desc` : "";
  await db.exec(`create temp table _klon_${tabelle} as select ${spalten} from public.${tabelle} ${bevorzugt} limit 1;`);
  await db.exec(`grant select on pg_temp._klon_${tabelle} to public;`);
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from pg_temp._klon_${tabelle};`);
  if (rows[0].n === 0) return false;
  klonOk.add(tabelle);
  return true;
}

type Ergebnis = "ja" | "nein" | "unklar" | "keine Daten";

async function versuche(aktion: ProbeAktion, tabelle: string): Promise<Ergebnis> {
  const w = await bereite(tabelle);
  await db.exec("begin;");
  try {
    if (aktion === "view") {
      const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.${tabelle};`);
      return rows[0].n > 0 ? "ja" : "nein";
    }
    if (aktion === "create") {
      const spalten = w.einfuegbar.map((c) => `"${c}"`).join(", ");
      try {
        await db.query(`insert into public.${tabelle} (${spalten}) select ${spalten} from pg_temp._klon_${tabelle};`);
        return "ja";
      } catch (e) {
        const code = (e as { cause?: { code?: string }; code?: string })?.cause?.code ?? (e as { code?: string })?.code;
        if (code === "42501") return "nein";
        return code === "23505" ? "ja" : "unklar";
      }
    }
    if (aktion === "update") {
      if (!w.aenderbar) return "unklar";
      const setzen = AENDERUNG[tabelle] ?? `"${w.aenderbar}" = "${w.aenderbar}"`;
      const { rows } = await db.query(`update public.${tabelle} set ${setzen} returning 1;`);
      return rows.length > 0 ? "ja" : "nein";
    }
    const { rows } = await db.query(`delete from public.${tabelle} returning 1;`);
    return rows.length > 0 ? "ja" : "nein";
  } catch (e) {
    const code = (e as { cause?: { code?: string }; code?: string })?.cause?.code ?? (e as { code?: string })?.code;
    return code === "42501" ? "nein" : "unklar";
  } finally {
    await db.exec("rollback;");
  }
}

// Zeilen vorhanden? (Superuser)
const leereTabellen = new Set<string>();
for (const sonden of Object.values(SONDEN)) {
  for (const tabelle of Object.values(sonden ?? {})) {
    if (!tabelle || wissen.has(tabelle) || leereTabellen.has(tabelle)) continue;
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.${tabelle};`);
    if (rows[0].n === 0) leereTabellen.add(tabelle);
    else await klone(tabelle);
  }
}

// --- Versuche -------------------------------------------------------------------------------------------------
interface Befund {
  rolle: Role;
  ressource: Resource;
  aktion: ProbeAktion;
  tabelle: string;
  matrix: boolean;
  datenbank: Ergebnis;
}
const befunde: Befund[] = [];
let versuche_n = 0;

for (const rolle of ROLLEN as Role[]) {
  await als(rolle, async () => {
    for (const ressource of resources) {
      const sonden = SONDEN[ressource];
      if (!sonden) continue;
      for (const [aktion, tabelle] of Object.entries(sonden) as [ProbeAktion, string][]) {
        if (leereTabellen.has(tabelle)) continue;
        versuche_n += 1;
        const datenbank = await versuche(aktion, tabelle);
        befunde.push({ rolle, ressource, aktion, tabelle, matrix: hasPermission(rolle, ressource, aktion as Action), datenbank });
      }
    }
  });
}
await alsAdmin();
for (const tabelle of TRIGGER_AUS) await db.exec(`alter table public.${tabelle} enable trigger user;`);

const uebereinstimmung = (b: Befund) => (b.matrix ? b.datenbank === "ja" : b.datenbank === "nein");
const abweichungen = befunde.filter((b) => !uebereinstimmung(b));
const schluessel = (b: Befund) => `${b.rolle}:${b.ressource}:${b.aktion}`;

console.log(`\nVersuche: ${versuche_n}, uebereinstimmend: ${befunde.length - abweichungen.length}, Abweichungen: ${abweichungen.length}`);
console.log(`Ohne Daten im Seed (nicht geprueft): ${[...leereTabellen].join(", ") || "keine"}`);
for (const [was, grund] of Object.entries(NICHT_PRUEFBAR)) console.log(`Nicht pruefbar: ${was}: ${grund}`);

const neu = abweichungen.filter((b) => !(schluessel(b) in BEKANNT));
const veraltet = Object.keys(BEKANNT).filter((k) => !abweichungen.some((b) => schluessel(b) === k));

const beschreibe = (b: Befund) =>
  `${b.rolle.padEnd(16)} ${(b.ressource + ":" + b.aktion).padEnd(26)} ${b.tabelle.padEnd(28)} Matrix ${b.matrix ? "erlaubt" : "verbietet"}, Datenbank ${b.datenbank === "ja" ? "erlaubt" : b.datenbank === "nein" ? "verbietet" : b.datenbank}`;

if (neu.length > 0) {
  console.log("\nAbweichungen ohne Eintrag in BEKANNT:");
  const richtung = (b: Befund) => (b.datenbank === "ja" && !b.matrix ? "DB WEITER ALS MATRIX" : b.matrix && b.datenbank !== "ja" ? "MATRIX WEITER ALS DB" : "UNKLAR");
  for (const b of neu.sort((a, c) => richtung(a).localeCompare(richtung(c)) || schluessel(a).localeCompare(schluessel(c)))) console.log(`  [${richtung(b)}] ${beschreibe(b)}`);
}
for (const k of veraltet) check(`Ausnahme veraltet: ${k}`, false, "die Abweichung besteht nicht mehr, Eintrag in BEKANNT entfernen");
check(`Matrix und Zeilensicherheit stimmen ueberein (${befunde.length} Versuche, ${Object.keys(BEKANNT).length} bekannte Abweichungen)`, neu.length === 0, `${neu.length} neue Abweichungen`);

t.ende("Rechtematrix und Datenbank stimmen ueberein.");
