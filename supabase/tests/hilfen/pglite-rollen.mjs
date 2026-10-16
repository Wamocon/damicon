// Gemeinsame Grundlage fuer Datenbanktests mit PGlite und simulierten Rollen.
//
// Baut eine frische In-Process-Datenbank auf (Auth-Stub, alle Migrationen ohne
// pgvector, Seed), legt je Rolle ein Konto an und liefert die kleinen Werkzeuge,
// die jeder rollenbezogene Test braucht: "eingeloggt als", "erwarte Fehler" und
// eine Zaehlung der Pruefungen. Keine Verbindung zu einer Cloud-Datenbank.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MIGRATIONEN = join(WURZEL, "supabase", "migrations");
const AUTH_STUB = join(WURZEL, "supabase", "fixtures", "auth-stub.sql");
const SEED = join(WURZEL, "supabase", "seed.sql");

export const ROLLEN = ["admin", "ceo", "betriebsleitung", "buchhaltung", "brigade", "picker", "erzeuger", "kunde"];

/**
 * @param {{ bis?: string }} [optionen] bis: letzte Migrationsdatei, die noch angewendet wird
 *   (zum Pruefen eines Vorher-Zustands, etwa vor einer Datenmigration).
 */
export async function starte(optionen = {}) {
  let fehlschlaege = 0;
  const check = (name, ok, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
    if (!ok) fehlschlaege += 1;
  };

  const db = new PGlite();
  try {
    await db.exec(readFileSync(AUTH_STUB, "utf8"));
    const dateien = readdirSync(MIGRATIONEN)
      .filter((f) => f.endsWith(".sql") && !f.endsWith("_pgvector.sql"))
      .filter((f) => !optionen.bis || f <= optionen.bis)
      .sort();
    for (const datei of dateien) await db.exec(readFileSync(join(MIGRATIONEN, datei), "utf8"));
    await db.exec(readFileSync(SEED, "utf8"));
    check(`Grundlage: ${dateien.length} Migrationen und Seed angewendet`, true);
  } catch (e) {
    check("Grundlage: Migrationen und Seed", false, String(e.message ?? e).slice(0, 300));
    process.exit(1);
  }

  async function alsRolle(rolle, authUserId = null) {
    await db.exec(`set role ${rolle};`);
    await db.query("select set_config('request.jwt.claim.role', $1, false);", [rolle]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false);", [authUserId ?? ""]);
  }

  // Auch die JWT-Claims leeren: bleibt request.jwt.claim.sub gesetzt, ist auth.uid()
  // weiterhin der zuletzt simulierte Nutzer und die Schutztrigger greifen bei Vorgaengen,
  // die als Superuser laufen sollen.
  async function alsAdmin() {
    await db.exec("reset role;");
    await db.query("select set_config('request.jwt.claim.role', '', false);");
    await db.query("select set_config('request.jwt.claim.sub', '', false);");
  }

  /** Fuehrt fn als angemeldetes Konto dieser Rolle aus und setzt danach zurueck. */
  async function als(rolle, fn) {
    await alsRolle("authenticated", konten[rolle]);
    try {
      return await fn();
    } finally {
      await alsAdmin();
    }
  }

  async function mussScheitern(name, sql, params, erwarteterCode) {
    try {
      await db.query(sql, params);
      check(name, false, "die Anweisung war erfolgreich, erwartet war ein Fehler");
    } catch (e) {
      const code = e?.cause?.code ?? e?.code;
      check(name, erwarteterCode ? code === erwarteterCode : true, `errcode: ${code ?? String(e).slice(0, 90)}`);
    } finally {
      await alsAdmin();
    }
  }

  // Je Rolle ein Konto: das Profil entsteht per Trigger aus auth.users.
  const konten = {};
  for (const rolle of ROLLEN) {
    const { rows } = await db.query(
      `insert into auth.users (email, raw_app_meta_data) values ($1, $2::jsonb) returning id;`,
      [`qa-${rolle}@damicon.demo`, JSON.stringify({ role: rolle })],
    );
    konten[rolle] = rows[0].id;
  }
  const { rows: kunden } = await db.query(`select id from public.b2b_kunden order by name limit 1;`);
  await db.query(`update public.profiles set b2b_kunde_id = $1 where auth_user_id = $2;`, [kunden[0].id, konten.kunde]);

  return {
    db,
    check,
    konten,
    kundeId: kunden[0].id,
    alsRolle,
    alsAdmin,
    als,
    mussScheitern,
    /** Beendet den Lauf mit dem passenden Exit-Code. */
    ende: (meldung) => {
      console.log("");
      if (fehlschlaege > 0) {
        console.error(`${fehlschlaege} Pruefung(en) fehlgeschlagen.`);
        process.exit(1);
      }
      console.log(meldung);
    },
  };
}
