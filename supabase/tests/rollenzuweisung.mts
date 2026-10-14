// Rollenzuweisung (WMCNL-1441): Schutz des letzten Administrators in der Datenbank
// (Migration 20261207030000) und die Pruefregeln der Anwendung (domain/rollen-zuweisung.ts).
//
// Aufruf: npm run test:rollenzuweisung (PGlite, kein Docker noetig).

import { starte } from "./hilfen/pglite-rollen.mjs";
import {
  darfRollenVergeben,
  istZuweisbareRolle,
  pruefeRollenwechsel,
  ZUWEISBARE_ROLLEN,
} from "@/lib/domain/rollen-zuweisung";
import { roles, type Role } from "@/lib/rbac";

const t = await starte();
const { db, check, als, alsAdmin, mussScheitern } = t;

const profilId = async (rolle: string) => {
  const { rows } = await db.query<{ id: string }>(`select id from public.profiles where auth_user_id = $1;`, [t.konten[rolle]]);
  return rows[0].id;
};

// --- 1. Datenbank: ein Administrator ---------------------------------------------------------------
{
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.profiles where role = 'admin';`);
  check("Ausgangslage: genau ein Administrator", rows[0].n === 1, `Administratoren: ${rows[0].n}`);
}
const admin = await profilId("admin");
const leitung = await profilId("betriebsleitung");

await als("admin", async () => {
  await mussScheitern(
    "Der einzige Administrator kann sich die Rolle nicht nehmen",
    `update public.profiles set role = 'betriebsleitung' where id = $1;`,
    [admin],
    "DA011",
  );
});
await alsAdmin();
{
  const { rows } = await db.query<{ role: string }>(`select role from public.profiles where id = $1;`, [admin]);
  check("Die Rolle des einzigen Administrators ist unveraendert", rows[0].role === "admin");
}

await als("admin", async () => {
  const { rows } = await db.query(`update public.profiles set full_name = 'Qa Admin Neu' where id = $1 returning id;`, [admin]);
  check("Andere Spalten des letzten Administrators bleiben aenderbar", rows.length === 1);
});

// service_role ist nicht ausgenommen: auch ein Skript laesst den Betrieb nicht ohne Administrator.
await db.exec("set role service_role;");
await mussScheitern(
  "Auch service_role kann den letzten Administrator nicht herabstufen",
  `update public.profiles set role = 'betriebsleitung' where id = $1;`,
  [admin],
  "DA011",
);

// --- 2. Datenbank: Rollen vergeben ----------------------------------------------------------------------
const buchhaltung = await profilId("buchhaltung");
const brigade = await profilId("brigade");
await als("admin", async () => {
  const { rows } = await db.query(`update public.profiles set role = 'picker' where id = $1 returning id;`, [leitung]);
  check("Der Administrator setzt die Betriebsleitung auf Picker", rows.length === 1);
});
{
  const { rows } = await db.query<{ role: string }>(`select role from public.profiles where id = $1;`, [leitung]);
  check("Die neue Rolle steht im Profil", rows[0].role === "picker");
}
await db.query(`update public.profiles set role = 'betriebsleitung' where id = $1;`, [leitung]);

await als("betriebsleitung", async () => {
  // profiles_update_leitung laesst die Leitung fremde Profile pflegen, die Rolle aendern darf sie nicht.
  await mussScheitern("Die Betriebsleitung darf keine Rolle vergeben (profil_rolle_schuetzen)", `update public.profiles set role = 'admin' where id = $1;`, [buchhaltung], "42501");
});
await als("brigade", async () => {
  const { rows } = await db.query(`update public.profiles set role = 'admin' where id = $1 returning id;`, [buchhaltung]);
  check("Die Brigade erreicht fremde Profile gar nicht", rows.length === 0, `Zeilen: ${rows.length}`);
});
await als("brigade", async () => {
  await mussScheitern("Niemand befoerdert sich selbst zum Administrator", `update public.profiles set role = 'admin' where id = $1;`, [brigade], "42501");
});

// --- 3. Datenbank: zweiter Administrator --------------------------------------------------------------------------
await als("admin", async () => {
  const { rows } = await db.query(`update public.profiles set role = 'admin' where id = $1 returning id;`, [buchhaltung]);
  check("Der Administrator ernennt einen zweiten Administrator", rows.length === 1);
});
await als("admin", async () => {
  const { rows } = await db.query(`update public.profiles set role = 'buchhaltung' where id = $1 returning id;`, [buchhaltung]);
  check("Mit zwei Administratoren darf einer die Rolle verlieren", rows.length === 1);
});
await als("admin", async () => {
  await mussScheitern("Danach ist der erste wieder der letzte und bleibt geschuetzt", `update public.profiles set role = 'brigade' where id = $1;`, [admin], "DA011");
});

// --- 4. Anwendung: Pruefregeln ---------------------------------------------------------------------------------------------
const fall = (name: string, w: Partial<Parameters<typeof pruefeRollenwechsel>[0]>, erwartet: string | null) => {
  const ergebnis = pruefeRollenwechsel({ akteurProfilId: "a", zielProfilId: "z", alteRolle: "brigade", neueRolle: "buchhaltung", adminAnzahl: 2, ...w });
  check(`Regel: ${name}`, ergebnis === erwartet, `Ergebnis ${ergebnis}, erwartet ${erwartet}`);
};
fall("gueltiger Wechsel", {}, null);
fall("die eigene Rolle bleibt", { zielProfilId: "a" }, "eigeneRolle");
fall("ein Kundenkonto wird nicht umgesetzt", { alteRolle: "kunde" }, "kundenkonto");
fall("niemand wird zum Kunden", { neueRolle: "kunde" }, "kundenkonto");
fall("eine unbekannte Rolle wird abgelehnt", { neueRolle: "geschaeftsfuehrer" }, "eingabe");
fall("eine leere Rolle wird abgelehnt", { neueRolle: "" }, "eingabe");
fall("dieselbe Rolle ist keine Aenderung", { neueRolle: "brigade" }, "rolleUnveraendert");
fall("der letzte Administrator bleibt", { alteRolle: "admin", neueRolle: "brigade", adminAnzahl: 1 }, "letzterAdmin");
fall("mit zwei Administratoren darf einer gehen", { alteRolle: "admin", neueRolle: "brigade", adminAnzahl: 2 }, null);
fall("ein Administrator darf einen Mitarbeitenden zum Administrator machen", { alteRolle: "brigade", neueRolle: "admin", adminAnzahl: 1 }, null);
fall("die Pruefung der eigenen Rolle kommt vor allem anderen", { zielProfilId: "a", alteRolle: "admin", neueRolle: "brigade", adminAnzahl: 1 }, "eigeneRolle");

check("Nur die Administration vergibt Rollen", roles.every((r: Role) => darfRollenVergeben(r) === (r === "admin")));
check("Weder keine Rolle noch undefined vergibt Rollen", !darfRollenVergeben(null) && !darfRollenVergeben(undefined));
check("Zuweisbar sind alle Rollen ausser kunde", ZUWEISBARE_ROLLEN.length === roles.length - 1 && !ZUWEISBARE_ROLLEN.includes("kunde" as never));
check("istZuweisbareRolle erkennt nur bekannte Rollen", istZuweisbareRolle("picker") && !istZuweisbareRolle("kunde") && !istZuweisbareRolle(7));

t.ende("Alle Rollenzuweisungs-Tests gruen.");
