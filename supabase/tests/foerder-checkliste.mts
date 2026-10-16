// Checkliste je Foerderdossier (WMCNL-1448, Stufe 1): Fortschritt und Eingabepruefung der Anwendung
// (domain/foerder-checkliste.ts), Tabelle, Constraints und Zeilensicherheit der Datenbank
// (Migration 20261207060000), Texte in vier Sprachen. PGlite, kein Docker noetig.
//
// Aufruf: npm run test:foerder-checkliste

import { readFileSync } from "node:fs";
import { starte } from "./hilfen/pglite-rollen.mjs";
import {
  CHECKPUNKT_MAX_ZEICHEN,
  checklistenStand,
  checkpunktFehler,
  fortschrittProzent,
  istVorschlagPunkt,
  sortiereCheckpunkte,
  VORSCHLAG_PUNKTE,
  type Checkpunkt,
} from "@/lib/domain/foerder-checkliste";

const t = await starte();
const { db, check, als, mussScheitern } = t;

// --- 1. Anwendung -------------------------------------------------------------------------------------------
const punkt = (id: string, extra: Partial<Checkpunkt> = {}): Checkpunkt => ({
  id, dossierId: "d", vorlageKey: null, bezeichnung: id, pflicht: true, fristAm: null, erledigtAm: null, reihenfolge: 0, ...extra,
});
const HEUTE = "2026-10-14";
{
  const s = checklistenStand([], HEUTE);
  check("Stand: ohne Punkte ist nichts vollstaendig", s.gesamt === 0 && !s.vollstaendig && s.pflichtOffen === 0 && fortschrittProzent(s) === 0);
}
{
  const s = checklistenStand([punkt("a", { erledigtAm: HEUTE }), punkt("b"), punkt("c", { pflicht: false })], HEUTE);
  check("Stand: erledigt, Pflicht offen und freiwillig", s.gesamt === 3 && s.erledigt === 1 && s.pflichtOffen === 1 && !s.vollstaendig, JSON.stringify(s));
  check("Fortschritt in Prozent, gerundet", fortschrittProzent(s) === 33);
}
{
  const s = checklistenStand([punkt("a", { erledigtAm: HEUTE }), punkt("b", { pflicht: false })], HEUTE);
  check("Stand: nur ein freiwilliger Punkt offen, die Pflicht ist erfuellt", s.vollstaendig && s.pflichtOffen === 0);
}
{
  const s = checklistenStand([punkt("a", { fristAm: "2026-10-13" }), punkt("b", { fristAm: HEUTE }), punkt("c", { fristAm: "2026-10-01", erledigtAm: "2026-10-02" }), punkt("d", { fristAm: "2026-10-20" })], HEUTE);
  check("Stand: ueberfaellig ist offen und vor heute, der heutige Tag zaehlt nicht, Erledigtes nie", s.ueberfaellig === 1, `ueberfaellig: ${s.ueberfaellig}`);
}
{
  const sortiert = sortiereCheckpunkte([punkt("c", { erledigtAm: HEUTE, reihenfolge: 0 }), punkt("b", { reihenfolge: 2 }), punkt("a", { reihenfolge: 1 })]);
  check("Reihenfolge: offene zuerst, darin nach Reihenfolge, Erledigtes am Ende", sortiert.map((p) => p.id).join("") === "abc", sortiert.map((p) => p.id).join(""));
}
check("Eingabe: leer, nur Leerraum, genau die Grenze, ein Zeichen darueber", checkpunktFehler("") === "eingabe" && checkpunktFehler("  ") === "eingabe" && checkpunktFehler("x".repeat(CHECKPUNKT_MAX_ZEICHEN)) === null && checkpunktFehler("x".repeat(CHECKPUNKT_MAX_ZEICHEN + 1)) === "checkpunktZuLang");
check("Vorschlag: fuenf allgemeine Punkte, erkannt werden nur diese", VORSCHLAG_PUNKTE.length === 5 && VORSCHLAG_PUNKTE.every(istVorschlagPunkt) && !istVorschlagPunkt("foerderantrag"));

// --- 2. Texte ---------------------------------------------------------------------------------------------------
type Baum = { [k: string]: Baum | string };
for (const sprache of ["de", "en", "kk", "ru"]) {
  const d = JSON.parse(readFileSync(`src/messages/${sprache}.json`, "utf8")) as Baum;
  const text = d.foerdermittelCheckliste as Baum;
  const vorlage = text.vorlage as Baum;
  const fehlt = VORSCHLAG_PUNKTE.filter((k) => typeof vorlage[k] !== "string" || vorlage[k] === "");
  check(`${sprache}: Beschriftung fuer jeden Vorschlagspunkt`, fehlt.length === 0, fehlt.join(","));
  const noetig = ["titel", "lead", "fortschritt", "pflichtOffen", "ueberfaellig", "vollstaendig", "vorschlagHinweis", "vorschlagUebernehmen", "erledigen", "oeffnen", "entfernen", "hinzufuegen"];
  check(`${sprache}: Texte der Checkliste vollstaendig`, noetig.every((k) => typeof text[k] === "string" && text[k] !== ""));
}

// --- 3. Datenbank ----------------------------------------------------------------------------------------------------
const { rows: dossiers } = await db.query<{ id: string }>(`insert into public.foerderdossiers (portal, titel) values ('gosagro.kz', 'Kuehlhaus') returning id;`);
const dossier = dossiers[0].id;

for (const key of VORSCHLAG_PUNKTE) {
  const { rows } = await db.query(`insert into public.foerder_checkpunkte (dossier_id, vorlage_key) values ($1, $2) returning id;`, [dossier, key]);
  check(`Vorschlag ${key} wird von der Datenbank akzeptiert`, rows.length === 1);
}
await mussScheitern("Ein unbekannter Vorschlagsschluessel wird abgelehnt", `insert into public.foerder_checkpunkte (dossier_id, vorlage_key) values ($1, 'foerderantrag');`, [dossier], "23514");
await mussScheitern("Ein Punkt ohne Text und ohne Vorschlag wird abgelehnt", `insert into public.foerder_checkpunkte (dossier_id) values ($1);`, [dossier], "23514");
await mussScheitern("Ein Text ueber 200 Zeichen wird abgelehnt", `insert into public.foerder_checkpunkte (dossier_id, bezeichnung) values ($1, repeat('x', 201));`, [dossier], "23514");
await mussScheitern("Ein leerer Text wird abgelehnt", `insert into public.foerder_checkpunkte (dossier_id, bezeichnung) values ($1, '   ');`, [dossier], "23514");

for (const rolle of ["admin", "betriebsleitung", "buchhaltung"]) {
  await als(rolle, async () => {
    const { rows } = await db.query<{ id: string }>(`insert into public.foerder_checkpunkte (dossier_id, bezeichnung, frist_am) values ($1, $2, public.heute_almaty() + 3) returning id;`, [dossier, `Punkt von ${rolle}`]);
    check(`${rolle} legt einen Punkt an`, rows.length === 1);
    const { rows: erledigt } = await db.query(`update public.foerder_checkpunkte set erledigt_am = public.heute_almaty() where id = $1 returning id;`, [rows[0].id]);
    check(`${rolle} hakt ihn ab`, erledigt.length === 1);
    const { rows: weg } = await db.query(`delete from public.foerder_checkpunkte where id = $1 returning id;`, [rows[0].id]);
    check(`${rolle} entfernt ihn`, weg.length === 1);
  });
}
for (const rolle of ["brigade", "picker", "erzeuger", "kunde"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select id from public.foerder_checkpunkte;`);
    check(`${rolle} sieht keine Checkpunkte`, rows.length === 0, `Zeilen: ${rows.length}`);
  });
  await als(rolle, async () => {
    await mussScheitern(`${rolle} darf keinen Punkt anlegen`, `insert into public.foerder_checkpunkte (dossier_id, bezeichnung) values ($1, 'Fremd');`, [dossier], "42501");
  });
}
await t.alsRolle("anon");
await mussScheitern("anon darf nichts lesen", `select * from public.foerder_checkpunkte;`, [], "42501");

await db.query(`delete from public.foerderdossiers where id = $1;`, [dossier]);
{
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.foerder_checkpunkte where dossier_id = $1;`, [dossier]);
  check("Mit dem Dossier verschwindet seine Checkliste", rows[0].n === 0);
}

t.ende("Alle Checklisten-Tests gruen.");
