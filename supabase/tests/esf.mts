// Belegregister der elektronischen Rechnung (WMCNL-1440, Stufe 1), Datenbankseite (Migration
// 20261207070000): Statuslauf mit Pflichtangaben, Unveraenderlichkeit des Entwurfs, nur zugestellte
// Lieferungen, Zeilensicherheit je Rolle und die Sicht v_esf_offen. PGlite, kein Docker noetig.
//
// Aufruf: npm run test:esf-db

import { starte } from "./hilfen/pglite-rollen.mjs";
import { ESF_STATUS, wechselErlaubt, type EsfStatus } from "@/lib/domain/esf";

const t = await starte();
const { db, check, als, mussScheitern } = t;

const ENTWURF = JSON.stringify({ version: 1, kunde: { name: "Test" } });
const ENTWURF_NEU = JSON.stringify({ version: 1, kunde: { name: "Neu" } });

async function lieferung(status: string, tageHer = 2): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`insert into public.lieferungen (b2b_kunde_id, menge_kg) values ($1, 100) returning id;`, [t.kundeId]);
  if (status !== "geplant") {
    // Der Uebergabe-Trigger setzt Zeit und Quittung; fuer die Testdaten reicht der Zustand.
    await db.exec("alter table public.lieferungen disable trigger user;");
    await db.query(`update public.lieferungen set status = $2::public.lieferung_status, geliefert_am = now() - ($3 || ' days')::interval where id = $1;`, [rows[0].id, status, String(tageHer)]);
    await db.exec("alter table public.lieferungen enable trigger user;");
  }
  return rows[0].id;
}

const beleg = (lieferungId: string) => db.query<{ id: string }>(`insert into public.esf_belege (lieferung_id, entwurf) values ($1, $2::jsonb) returning id;`, [lieferungId, ENTWURF]);
const setze = (id: string, felder: string, params: unknown[] = []) => db.query<{ id: string }>(`update public.esf_belege set ${felder} where id = $1 returning id;`, [id, ...params]);

// --- 1. Anlegen ------------------------------------------------------------------------------------------------
const zugestellt = await lieferung("zugestellt");
const geplant = await lieferung("geplant");

await mussScheitern("Eine geplante Lieferung bekommt keinen Beleg (DA014)", `insert into public.esf_belege (lieferung_id, entwurf) values ($1, '{}'::jsonb);`, [geplant], "DA014");
await mussScheitern("Ein Beleg beginnt als Entwurf (DA013)", `insert into public.esf_belege (lieferung_id, status, esf_nummer, ausgestellt_am, entwurf) values ($1, 'ausgestellt', 'X1', current_date, '{}'::jsonb);`, [zugestellt], "DA013");
await mussScheitern("Eine unbekannte Lieferung wird abgelehnt", `insert into public.esf_belege (lieferung_id, entwurf) values (gen_random_uuid(), '{}'::jsonb);`, [], "23503");

let belegId = "";
await als("buchhaltung", async () => {
  const { rows } = await beleg(zugestellt);
  belegId = rows[0].id;
  check("buchhaltung legt einen Entwurf an", rows.length === 1);
  const { rows: gesetzt } = await db.query<{ erstellt_von_profil_id: string | null; status: string }>(`select erstellt_von_profil_id, status from public.esf_belege where id = $1;`, [belegId]);
  check("Der Ersteller wird aus der Anmeldung gesetzt, der Status ist entwurf", gesetzt[0].erstellt_von_profil_id !== null && gesetzt[0].status === "entwurf", JSON.stringify(gesetzt[0]));
});
await mussScheitern("Je Lieferung gibt es genau einen Beleg", `insert into public.esf_belege (lieferung_id, entwurf) values ($1, '{}'::jsonb);`, [zugestellt], "23505");

// --- 2. Statuslauf ------------------------------------------------------------------------------------------
await als("buchhaltung", async () => {
  await mussScheitern("entwurf nach ausgestellt ohne Nummer verletzt die Pflichtangaben", `update public.esf_belege set status = 'ausgestellt', ausgestellt_am = current_date where id = $1;`, [belegId], "23514");
});
await als("buchhaltung", async () => {
  await mussScheitern("entwurf nach bestaetigt ist kein erlaubter Wechsel (DA013)", `update public.esf_belege set status = 'bestaetigt', esf_nummer = 'X', ausgestellt_am = current_date, bestaetigt_am = current_date where id = $1;`, [belegId], "DA013");
});
await als("buchhaltung", async () => {
  await mussScheitern("Papier verlangt eine Begruendung", `update public.esf_belege set status = 'papier' where id = $1;`, [belegId], "23514");
});
await als("buchhaltung", async () => {
  await mussScheitern("Eine Anmerkung unter drei Zeichen wird abgelehnt", `update public.esf_belege set bemerkung = 'ab' where id = $1;`, [belegId], "23514");
});
await als("buchhaltung", async () => {
  const { rows } = await setze(belegId, `status = 'ausgestellt', esf_nummer = 'ЭСФ-2026-0001', ausgestellt_am = current_date`);
  check("entwurf nach ausgestellt mit Nummer und Datum", rows.length === 1);
});
await als("buchhaltung", async () => {
  await mussScheitern("Ein ausgestellter Entwurf ist unveraenderlich (DA013)", `update public.esf_belege set entwurf = $2::jsonb where id = $1;`, [belegId, ENTWURF_NEU], "DA013");
});
await als("buchhaltung", async () => {
  const { rows } = await setze(belegId, `esf_nummer = 'ЭСФ-2026-0001-A'`);
  check("Eine Nummer darf nach dem Ausstellen noch korrigiert werden", rows.length === 1);
});
await als("buchhaltung", async () => {
  await mussScheitern("ausgestellt nach papier ist nicht vorgesehen (DA013)", `update public.esf_belege set status = 'papier', esf_nummer = null, ausgestellt_am = null, bemerkung = 'Portal gestoert' where id = $1;`, [belegId], "DA013");
});
await als("buchhaltung", async () => {
  await mussScheitern("Bestaetigt nicht vor dem Ausstellen", `update public.esf_belege set status = 'bestaetigt', bestaetigt_am = current_date - 3 where id = $1;`, [belegId], "23514");
});
await als("buchhaltung", async () => {
  const { rows } = await setze(belegId, `status = 'bestaetigt', bestaetigt_am = current_date`);
  check("ausgestellt nach bestaetigt", rows.length === 1);
});
await als("buchhaltung", async () => {
  await mussScheitern("Ein bestaetigter Beleg ist abgeschlossen (DA013)", `update public.esf_belege set bemerkung = 'nachtraeglich' where id = $1;`, [belegId], "DA013");
});

// Ablehnung und neuer Entwurf
const lieferungB = await lieferung("zugestellt", 5);
let belegB = "";
await als("admin", async () => {
  belegB = (await beleg(lieferungB)).rows[0].id;
  await setze(belegB, `status = 'ausgestellt', esf_nummer = 'N-2', ausgestellt_am = current_date`);
});
await als("admin", async () => {
  await mussScheitern("Eine Ablehnung braucht eine Begruendung", `update public.esf_belege set status = 'abgelehnt' where id = $1;`, [belegB], "23514");
});
await als("admin", async () => {
  const { rows } = await setze(belegB, `status = 'abgelehnt', bemerkung = 'Kaeufernummer unbekannt'`);
  check("ausgestellt nach abgelehnt mit Begruendung", rows.length === 1);
});
await als("admin", async () => {
  await mussScheitern("abgelehnt nach bestaetigt ist nicht vorgesehen (DA013)", `update public.esf_belege set status = 'bestaetigt', bestaetigt_am = current_date where id = $1;`, [belegB], "DA013");
});
await als("admin", async () => {
  const { rows } = await db.query<{ status: string; esf_nummer: string | null; entwurf: { kunde: { name: string } } }>(
    `update public.esf_belege set status = 'entwurf', esf_nummer = null, ausgestellt_am = null, bemerkung = null, entwurf = $2::jsonb where id = $1 returning status, esf_nummer, entwurf;`,
    [belegB, ENTWURF_NEU],
  );
  check("abgelehnt nach entwurf: neues Standbild, Angaben geleert", rows.length === 1 && rows[0].status === "entwurf" && rows[0].esf_nummer === null && rows[0].entwurf.kunde.name === "Neu", JSON.stringify(rows[0]));
});
await als("admin", async () => {
  const { rows } = await setze(belegB, `entwurf = $2::jsonb`, [ENTWURF]);
  check("Im Entwurf laesst sich das Standbild neu berechnen", rows.length === 1);
});

// Papier bei Stoerung
const lieferungC = await lieferung("zugestellt", 1);
let belegC = "";
await als("ceo", async () => {
  belegC = (await beleg(lieferungC)).rows[0].id;
  const { rows } = await setze(belegC, `status = 'papier', bemerkung = 'Portal war nicht erreichbar'`);
  check("ceo: entwurf nach papier mit Stoerungsgrund", rows.length === 1);
});
await als("ceo", async () => {
  await mussScheitern("papier ist ein Endzustand (DA013)", `update public.esf_belege set status = 'entwurf' where id = $1;`, [belegC], "DA013");
});

// --- 3. Loeschen ------------------------------------------------------------------------------------------------
const lieferungD = await lieferung("zugestellt", 4);
await als("buchhaltung", async () => {
  const id = (await beleg(lieferungD)).rows[0].id;
  const { rows } = await db.query(`delete from public.esf_belege where id = $1 returning id;`, [id]);
  check("Ein Entwurf laesst sich loeschen", rows.length === 1);
});
await als("buchhaltung", async () => {
  const { rows } = await db.query(`delete from public.esf_belege where id = $1 returning id;`, [belegId]);
  check("Ein bestaetigter Beleg laesst sich nicht loeschen", rows.length === 0);
});
await mussScheitern("Eine Lieferung mit Beleg laesst sich nicht loeschen (restrict)", `delete from public.lieferungen where id = $1;`, [zugestellt], "23001");

// --- 4. Rechte ----------------------------------------------------------------------------------------------------
const lieferungE = await lieferung("zugestellt", 3);
// Wer die Lieferung sieht, scheitert an der Zeilensicherheit (42501). Wer sie nicht einmal sieht (picker,
// erzeuger), scheitert schon vorher an der Pruefung "Lieferung nicht gefunden" (23503): kein Hinweis, ob es
// die Lieferung gibt.
const ABGELEHNT: Record<string, string> = { betriebsleitung: "42501", brigade: "42501", kunde: "42501", picker: "23503", erzeuger: "23503" };
for (const [rolle, code] of Object.entries(ABGELEHNT)) {
  await als(rolle, async () => {
    await mussScheitern(`${rolle} darf keinen Beleg anlegen`, `insert into public.esf_belege (lieferung_id, entwurf) values ($1, '{}'::jsonb);`, [lieferungE], code);
  });
}
for (const rolle of ["admin", "ceo", "betriebsleitung", "buchhaltung"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select id from public.esf_belege;`);
    check(`${rolle} sieht die Belege`, rows.length >= 3, `Zeilen: ${rows.length}`);
  });
}
for (const rolle of ["brigade", "picker", "erzeuger", "kunde"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select id from public.esf_belege;`);
    check(`${rolle} sieht keine Belege`, rows.length === 0, `Zeilen: ${rows.length}`);
  });
}
await als("betriebsleitung", async () => {
  const { rows } = await db.query(`update public.esf_belege set bemerkung = 'Test' where id = $1 returning id;`, [belegB]);
  check("betriebsleitung darf einen Beleg nicht aendern", rows.length === 0);
});
await t.alsRolle("anon");
await mussScheitern("anon darf nichts lesen", `select * from public.esf_belege;`, [], "42501");
await t.alsRolle("anon"); // mussScheitern setzt die Rolle zurueck
await mussScheitern("anon darf die Sicht nicht lesen", `select * from public.v_esf_offen;`, [], "42501");

// --- 5. Offene Lieferungen -------------------------------------------------------------------------------------------
await als("buchhaltung", async () => {
  const { rows } = await db.query<{ lieferung_id: string; beleg_status: string | null; tage_seit_lieferung: number }>(
    `select lieferung_id, beleg_status, tage_seit_lieferung from public.v_esf_offen order by lieferung_id;`,
  );
  const nach = new Map(rows.map((r) => [r.lieferung_id, r]));
  check("Offen: bestaetigt ist nicht dabei", !nach.has(zugestellt));
  check("Offen: Papier ist nicht dabei", !nach.has(lieferungC));
  check("Offen: ein Entwurf ist dabei", nach.get(lieferungB)?.beleg_status === "entwurf", JSON.stringify(nach.get(lieferungB)));
  check("Offen: ohne Beleg ist dabei", nach.get(lieferungE)?.beleg_status === null && nach.has(lieferungE));
  check("Offen: eine geplante Lieferung ist nicht dabei", !nach.has(geplant));
  check("Offen: das Alter zaehlt in Tagen ab dem Liefertag", Number(nach.get(lieferungE)?.tage_seit_lieferung) >= 2 && Number(nach.get(lieferungE)?.tage_seit_lieferung) <= 4, String(nach.get(lieferungE)?.tage_seit_lieferung));
});
await als("admin", async () => {
  await setze(belegB, `status = 'ausgestellt', esf_nummer = 'N-3', ausgestellt_am = current_date`);
  const { rows } = await db.query(`select 1 from public.v_esf_offen where lieferung_id = $1;`, [lieferungB]);
  check("Offen: ein ausgestellter Beleg ist nicht mehr dabei", rows.length === 0);
  await setze(belegB, `status = 'abgelehnt', bemerkung = 'Fehler im Portal'`);
  const { rows: wieder } = await db.query(`select 1 from public.v_esf_offen where lieferung_id = $1;`, [lieferungB]);
  check("Offen: ein abgelehnter Beleg ist wieder dabei", wieder.length === 1);
});
for (const rolle of ["kunde", "erzeuger", "brigade"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select 1 from public.v_esf_offen;`);
    check(`${rolle} sieht in der Sicht nichts`, rows.length === 0, `Zeilen: ${rows.length}`);
  });
}

// --- 6. Gleichlauf: die Uebergangstabelle der Anwendung gegen den Trigger der Datenbank ---------------------------------
{
  const felderFuer = (status: EsfStatus): string => {
    switch (status) {
      case "entwurf": return "esf_nummer = null, ausgestellt_am = null, bestaetigt_am = null, bemerkung = null";
      case "ausgestellt": return "esf_nummer = 'N-1', ausgestellt_am = current_date - 1, bestaetigt_am = null, bemerkung = null";
      case "bestaetigt": return "esf_nummer = 'N-1', ausgestellt_am = current_date - 1, bestaetigt_am = current_date, bemerkung = null";
      case "abgelehnt": return "esf_nummer = 'N-1', ausgestellt_am = current_date - 1, bestaetigt_am = null, bemerkung = 'Grund der Ablehnung'";
      case "papier": return "esf_nummer = null, ausgestellt_am = null, bestaetigt_am = null, bemerkung = 'Portal gestoert'";
    }
  };
  let abweichungen = 0;
  let paare = 0;
  for (const von of ESF_STATUS) {
    for (const nach of ESF_STATUS) {
      if (von === nach) continue;
      paare += 1;
      const id = (await beleg(await lieferung("zugestellt", 1))).rows[0].id;
      await db.exec("alter table public.esf_belege disable trigger user;");
      await db.query(`update public.esf_belege set status = $2, ${felderFuer(von)} where id = $1;`, [id, von]);
      await db.exec("alter table public.esf_belege enable trigger user;");
      let erlaubt = true;
      try {
        await db.query(`update public.esf_belege set status = $2, ${felderFuer(nach)} where id = $1;`, [id, nach]);
      } catch (fehler) {
        if ((fehler as { code?: string }).code !== "DA013") throw fehler;
        erlaubt = false;
      }
      if (erlaubt !== wechselErlaubt(von, nach)) {
        abweichungen += 1;
        check(`Uebergang ${von} nach ${nach}: Datenbank ${erlaubt ? "erlaubt" : "verbietet"}, Anwendung ${wechselErlaubt(von, nach) ? "erlaubt" : "verbietet"}`, false);
      }
    }
  }
  check(`Uebergangstabelle: ${paare} Paare, Datenbank und Anwendung stimmen ueberein`, abweichungen === 0, `${abweichungen} Abweichungen`);
}

t.ende("Alle ЭСФ-Datenbanktests gruen.");
