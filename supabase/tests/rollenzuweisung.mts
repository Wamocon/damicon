// Rollenzuweisung (WMCNL-1441): Schutz des letzten Administrators in der Datenbank
// (Migration 20261207030000) und die Pruefregeln der Anwendung (domain/rollen-zuweisung.ts).
//
// Aufruf: npm run test:rollenzuweisung (PGlite, kein Docker noetig).

import { starte } from "./hilfen/pglite-rollen.mjs";
import {
  PASSWORT_MAX,
  PASSWORT_MIN,
  darfRollenVergeben,
  istZuweisbareRolle,
  kontoAnlageFehler,
  passwortFehler,
  pruefeRollenwechsel,
  sperrFehler,
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

// --- 4. Konten sperren statt loeschen (15.10.2026, Migration 20261208090000) ---------------------------------------------------------------
const alsScheitert = (rolle: string, name: string, sql: string, params: unknown[], code?: string) => als(rolle, () => mussScheitern(name, sql, params, code));
const sperren = (rolle: string, ziel: string, an: boolean, grund: string | null = "Austritt zum Monatsende") =>
  als(rolle, async () => (await db.query<{ u: string }>(`select public.konto_sperren($1, $2, $3) as u;`, [ziel, an, grund])).rows[0].u);
const gesperrtAm = async (id: string) => (await db.query<{ g: string | null }>(`select gesperrt_am::text as g from public.profiles where id = $1;`, [id])).rows[0].g;
const picker = await profilId("picker");

{
  const authBrigade = await sperren("admin", brigade, true);
  check("Sperren: die Administration sperrt ein Konto, die Funktion nennt den Auth-Benutzer fuer die Sperre im Auth-Dienst", authBrigade === t.konten.brigade && (await gesperrtAm(brigade)) !== null);
  const { rows: g } = await db.query<{ grund: string | null; von: string | null }>(`select gesperrt_grund as grund, gesperrt_von::text as von from public.profiles where id = $1;`, [brigade]);
  check("Sperren: Grund und handelnde Person stehen am Profil", g[0].grund === "Austritt zum Monatsende" && g[0].von === admin);

  // Ein gesperrtes Konto hat keine App-Rolle mehr: keine rollenbezogene Policy greift, auch nicht mit dem noch gueltigen Token.
  await als("brigade", async () => {
    const { rows: r } = await db.query<{ rolle: string | null }>(`select public.current_app_role()::text as rolle;`);
    const { rows: s } = await db.query(`select id from public.reihenbloecke;`);
    const { rows: k } = await db.query<{ k: string | null }>(`select public.current_profil_id()::text as k;`);
    check("Gesperrt: keine App-Rolle, keine Bloecke, keine Profil-Id", r[0].rolle === null && s.length === 0 && k[0].k === null, JSON.stringify([r[0].rolle, s.length, k[0].k]));
  });
  await als("brigade", async () => {
    const { rows } = await db.query(`update public.abholrunden set status = status returning id;`);
    check("Gesperrt: die Brigade aendert keine Abholrunde mehr", rows.length === 0);
  });

  await sperren("admin", brigade, true, "anderer Grund");
  const { rows: z } = await db.query<{ g: string | null; grund: string | null }>(`select gesperrt_am::text as g, gesperrt_grund as grund from public.profiles where id = $1;`, [brigade]);
  check("Sperren ist idempotent: ein zweites Sperren behaelt den Zeitpunkt und nimmt den neuen Grund", z[0].g === (await gesperrtAm(brigade)) && z[0].grund === "anderer Grund");

  await sperren("admin", brigade, false, null);
  check("Entsperren: das Konto ist wieder aktiv, Grund und Person sind leer", (await gesperrtAm(brigade)) === null);
  await als("brigade", async () => {
    const { rows: r } = await db.query<{ rolle: string | null }>(`select public.current_app_role()::text as rolle;`);
    check("Entsperrt: die Rolle gilt wieder", r[0].rolle === "brigade");
  });
}

// Die Datenbank behandelt die Geschaeftsfuehrung wie die Administration (has_role); die Aktion der Anwendung ist strenger und laesst nur die Administration zu.
for (const rolle of ["betriebsleitung", "buchhaltung", "brigade", "kunde"]) {
  await alsScheitert(rolle, `Sperren: ${rolle} darf kein Konto sperren (42501)`, `select public.konto_sperren($1, true, 'Test');`, [picker], "42501");
}
await alsScheitert("admin", "Sperren: das eigene Konto sperrt man nicht (23514)", `select public.konto_sperren($1, true, 'Test');`, [admin], "23514");
await alsScheitert("admin", "Sperren: ohne Grund wird nicht gesperrt (23514)", `select public.konto_sperren($1, true, '  ');`, [picker], "23514");
await alsScheitert("admin", "Sperren: ein unbekanntes Konto ergibt einen Fehler (23503)", `select public.konto_sperren(gen_random_uuid(), true, 'Test');`, [], "23503");
// Die Sperre ändert sich nicht direkt, auch nicht am eigenen Profil (Selbstentsperrung).
await sperren("admin", picker, true);
// Das gesperrte Konto hat keine Rolle, seine Policy auf das eigene Profil greift ueber auth_user_id: ein direkter Versuch scheitert am Schutz der Sperre (DA019),
// und auch die Leitung setzt die Sperre nicht direkt.
await alsScheitert("picker", "Sperre: das gesperrte Konto entsperrt sich nicht selbst (DA019)", `update public.profiles set gesperrt_am = null where id = $1;`, [picker], "DA019");
check("Sperre: der Versuch aendert nichts", (await gesperrtAm(picker)) !== null);
await alsScheitert("betriebsleitung", "Sperre: auch die Leitung setzt die Sperre nicht direkt (DA019)", `update public.profiles set gesperrt_am = now() where id = $1;`, [leitung], "DA019");
await sperren("admin", picker, false, null);

// Der letzte aktive Administrator.
{
  await db.query(`update public.profiles set role = 'admin' where id = $1;`, [leitung]);
  await sperren("admin", leitung, true);
  check("Letzter Administrator: ein zweiter Administrator laesst sich sperren", (await gesperrtAm(leitung)) !== null);
  await als("admin", async () => {
    await mussScheitern("Letzter Administrator: der einzige aktive Administrator laesst sich nicht herabstufen, wenn der andere gesperrt ist (DA011)", `update public.profiles set role = 'brigade' where id = $1;`, [admin], "DA011");
  });
  await alsAdmin();
  const { rows } = await db.query(`select 1 from public.profiles where role = 'admin' and gesperrt_am is null;`);
  check("Letzter Administrator: es bleibt genau einer aktiv", rows.length === 1);
  await sperren("admin", leitung, false, null);
  await db.query(`update public.profiles set role = 'betriebsleitung' where id = $1;`, [leitung]);
  // Ein direkter Versuch, den letzten Administrator zu sperren (als Dienstschluessel, der den Schutz nicht umgeht).
  await mussScheitern("Letzter Administrator: auch ein Dienstschluessel sperrt den letzten aktiven Administrator nicht (DA011)", `update public.profiles set gesperrt_am = now() where id = $1;`, [admin], "DA011");
}

// --- 5. Regeln der Anwendung -----------------------------------------------------------------------------------------------------------------
{
  check("Konto: ein vollstaendiger Antrag ist in Ordnung", kontoAnlageFehler({ name: "Aliya Sadykova", email: "aliya@example.kz", rolle: "brigade" }) === null);
  check("Konto: Name zu kurz oder zu lang", kontoAnlageFehler({ name: "A", email: "a@b.kz", rolle: "brigade" }) === "kontoName" && kontoAnlageFehler({ name: "x".repeat(101), email: "a@b.kz", rolle: "brigade" }) === "kontoName");
  check("Konto: eine E-Mail ohne At, ohne Punkt oder mit Leerzeichen wird abgelehnt", ["aliya", "aliya@example", "ali ya@example.kz", "@example.kz", ""].every((e) => kontoAnlageFehler({ name: "Aliya", email: e, rolle: "brigade" }) === "kontoEmail"));
  check("Konto: kunde und unbekannte Rollen sind keine Rollen fuer Mitarbeitende", kontoAnlageFehler({ name: "Aliya", email: "a@b.kz", rolle: "kunde" }) === "kontoRolle" && kontoAnlageFehler({ name: "Aliya", email: "a@b.kz", rolle: "chef" }) === "kontoRolle");
  const gut = "Beeren-Saison-2026";
  check("Passwort: ab 12 Zeichen mit zwei gleichen Eingaben in Ordnung", passwortFehler(gut, gut, "a@b.kz") === null && PASSWORT_MIN === 12 && PASSWORT_MAX === 72);
  check("Passwort: zu kurz, zu lang (Bytes), ungleich", passwortFehler("kurz", "kurz", null) === "passwortKurz" && passwortFehler("ä".repeat(40), "ä".repeat(40), null) === "passwortLang" && passwortFehler(gut, gut + "x", null) === "passwortUngleich");
  check("Passwort: nicht die E-Mail-Adresse und nicht nur wenige verschiedene Zeichen", passwortFehler("aliya@example.kz", "aliya@example.kz", "Aliya@Example.kz") === "passwortEinfach" && passwortFehler("aaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaa", null) === "passwortEinfach" && passwortFehler("abababababababab", "abababababababab", null) === "passwortEinfach");
  check("Passwort: Leerzeichen am Rand zaehlen mit (es wird nicht getrimmt)", passwortFehler("   zwoelf    ", "   zwoelf    ", null) === null);
  const basis = { akteurProfilId: "a", zielProfilId: "b", zielRolle: "brigade" as Role, zielGesperrt: false, sperren: true, grund: "Austritt", aktiveAdmins: 1 };
  check("Sperrregel: ein normales Sperren ist in Ordnung", sperrFehler(basis) === null);
  check("Sperrregel: das eigene Konto, ein Grund unter 3 oder ueber 300 Zeichen", sperrFehler({ ...basis, zielProfilId: "a" }) === "eigeneSperre" && sperrFehler({ ...basis, grund: "ab" }) === "sperrgrund" && sperrFehler({ ...basis, grund: "x".repeat(301) }) === "sperrgrund");
  check("Sperrregel: der letzte aktive Administrator, aber nicht ein schon gesperrter oder bei zwei aktiven", sperrFehler({ ...basis, zielRolle: "admin" }) === "letzterAdmin" && sperrFehler({ ...basis, zielRolle: "admin", aktiveAdmins: 2 }) === null && sperrFehler({ ...basis, zielRolle: "admin", zielGesperrt: true }) === null);
  check("Sperrregel: Entsperren braucht keinen Grund", sperrFehler({ ...basis, sperren: false, grund: "" }) === null);
}

t.ende("Alle Rollenzuweisungs-Tests gruen.");
