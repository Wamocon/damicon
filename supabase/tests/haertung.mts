// Härtung aus der Prüfung des Pull Requests #156 (Migration 20261208050000, 15.10.2026), Datenbankseite und Rechenregeln: ein Ist-Wert je Monat,
// Modellwerte und Checklisten-Vorschlag ohne Doppeleinfügung, Abholrunde atomar, Grenze der Adresssuche, Präfix des Geheimnisses, Plausibilität der
// Risiko-Parameter, Block-Risiko nur für Rollen mit allen Eingaben, kaufmännisches Runden, weitere Adressbereiche. PGlite, kein Docker noetig.
//
// Aufruf: npm run test:haertung

import { readFileSync } from "node:fs";
import { starte } from "./hilfen/pglite-rollen.mjs";
import { rundeKaufmaennisch } from "@/lib/domain/runden";
import { istInternerHost, GEHEIMNIS_MUSTER } from "@/lib/domain/integration-auslieferung";
import { baueEsfEntwurf } from "@/lib/domain/esf";

const t = await starte();
const { db, check, als, mussScheitern } = t;
const alsScheitert = (rolle: string, name: string, sql: string, params: unknown[], code?: string) => als(rolle, () => mussScheitern(name, sql, params, code));

// --- 1. Ein Ist-Wert je Monat, Kategorie und Währung ---------------------------------------------------------------------------------------
await als("buchhaltung", async () => {
  await db.query(`insert into public.wirtschaftlichkeit_ist (monat, kategorie, betrag, waehrung) values ('2026-09-01', 'schwund', 100, 'KZT');`);
  await db.query(`insert into public.wirtschaftlichkeit_ist (monat, kategorie, betrag, waehrung) values ('2026-10-01', 'schwund', 100, 'KZT');`);
  await db.query(`insert into public.wirtschaftlichkeit_ist (monat, kategorie, betrag, waehrung) values ('2026-09-01', 'audit', 100, 'KZT');`);
  await db.query(`insert into public.wirtschaftlichkeit_ist (monat, kategorie, betrag, waehrung) values ('2026-09-01', 'schwund', 100, 'EUR');`);
  check("Ist: anderer Monat, andere Kategorie und andere Währung sind je ein eigener Wert", true);
});
await alsScheitert("buchhaltung", "Ist: derselbe Monat, dieselbe Kategorie und dieselbe Währung ein zweites Mal wird abgelehnt (23505)", `insert into public.wirtschaftlichkeit_ist (monat, kategorie, betrag, waehrung) values ('2026-09-01', 'schwund', 55, 'KZT');`, [], "23505");

// --- 2. Modellwerte und Checklisten-Vorschlag: kein Doppeleintrag --------------------------------------------------------------------------
{
  const posten = JSON.stringify([
    { art: "investition", kategorie: "Technik", bezeichnung: "Logger", betrag: 1000, waehrung: "EUR", datum: "2026-10-01", herkunft: "geschaetzt", notiz: "Modell" },
    { art: "nutzen", kategorie: "sonstiges", bezeichnung: "Nutzen", betrag: 500, waehrung: "EUR", datum: "2026-10-01", herkunft: "geschaetzt", notiz: "Modell" },
  ]);
  const { rows: p } = await db.query<{ id: string }>(`select id from public.profiles where role = 'buchhaltung' limit 1;`);
  await db.exec(`delete from public.wirtschaftlichkeit_posten;`);
  const erster = await als("buchhaltung", async () => (await db.query<{ n: number }>(`select public.wirtschaftlichkeit_posten_uebernehmen($1::jsonb, $2) as n;`, [posten, p[0].id])).rows[0].n);
  const zweiter = await als("buchhaltung", async () => (await db.query<{ n: number }>(`select public.wirtschaftlichkeit_posten_uebernehmen($1::jsonb, $2) as n;`, [posten, p[0].id])).rows[0].n);
  const { rows: z } = await db.query<{ n: number }>(`select count(*)::int as n from public.wirtschaftlichkeit_posten;`);
  check("Modellwerte: der erste Aufruf fügt zwei Posten ein, der zweite (Doppelklick) keinen", erster === 2 && zweiter === 0 && z[0].n === 2, `${erster}/${zweiter}/${z[0].n}`);
  await alsScheitert("kunde", "Modellwerte: ohne Schreibrecht scheitert die Funktion an der Zeilensicherheit", `select public.wirtschaftlichkeit_posten_uebernehmen($1::jsonb, null);`, [posten]);
}
{
  const { rows: d } = await db.query<{ id: string }>(`select id from public.foerderdossiers limit 1;`);
  await db.exec(`delete from public.foerder_checkpunkte;`);
  const punkte = ["antragsformular", "identifikation", "kostenaufstellung"];
  const erster = await als("buchhaltung", async () => (await db.query<{ n: number }>(`select public.foerder_checkliste_vorschlag_uebernehmen($1, $2::text[]) as n;`, [d[0].id, punkte])).rows[0].n);
  const zweiter = await als("buchhaltung", async () => (await db.query<{ n: number }>(`select public.foerder_checkliste_vorschlag_uebernehmen($1, $2::text[]) as n;`, [d[0].id, punkte])).rows[0].n);
  const { rows: z } = await db.query<{ n: number; max: number }>(`select count(*)::int as n, max(reihenfolge)::int as max from public.foerder_checkpunkte where dossier_id = $1;`, [d[0].id]);
  check("Checkliste: der erste Aufruf fügt drei Punkte in Reihenfolge ein, der zweite keinen", erster === 3 && zweiter === 0 && z[0].n === 3 && z[0].max === 2, `${erster}/${zweiter}/${z[0].n}/${z[0].max}`);
}

// --- 3. Abholrunde atomar --------------------------------------------------------------------------------------------------------------------
const nachbar = async (name: string): Promise<string> => (await db.query<{ id: string }>(`insert into public.nachbarbetriebe (name, ort) values ($1, 'Talgar') returning id;`, [name])).rows[0].id;
const A = await nachbar("Härtung A");
const B = await nachbar("Härtung B");
{
  const stopps = JSON.stringify([
    { nachbarbetrieb_id: A, reihenfolge: 0, menge_geplant_kg: 100 },
    { nachbarbetrieb_id: B, reihenfolge: 1, menge_geplant_kg: 50 },
  ]);
  const id = await als("betriebsleitung", async () => (await db.query<{ id: string }>(`select public.abholrunde_anlegen(current_date + 2, 'Wagen H', null, 12.5, 40, 25, null, $1::jsonb) as id;`, [stopps])).rows[0].id);
  const { rows } = await db.query<{ fahrzeug: string; erstellt: string | null; n: number }>(
    `select r.fahrzeug, r.erstellt_von_profil_id::text as erstellt, (select count(*)::int from public.abholstopps s where s.runde_id = r.id) as n from public.abholrunden r where r.id = $1;`, [id]);
  check("Abholrunde: Runde mit zwei Stopps in einem Aufruf, die planende Person ist eingetragen", rows[0].fahrzeug === "Wagen H" && rows[0].n === 2 && rows[0].erstellt !== null, JSON.stringify(rows[0]));
}
{
  const vorher = (await db.query<{ n: number }>(`select count(*)::int as n from public.abholrunden;`)).rows[0].n;
  // Der zweite Stopp verletzt die Regel "ein Betrieb je Runde": die ganze Runde darf nicht entstehen.
  const doppelt = JSON.stringify([
    { nachbarbetrieb_id: A, reihenfolge: 0, menge_geplant_kg: 100 },
    { nachbarbetrieb_id: A, reihenfolge: 1, menge_geplant_kg: 50 },
  ]);
  await alsScheitert("betriebsleitung", "Abholrunde: ein fehlerhafter Stopp lässt keine Runde zurück (23505)", `select public.abholrunde_anlegen(current_date + 3, 'Wagen X', null, null, null, null, null, $1::jsonb);`, [doppelt], "23505");
  const nachher = (await db.query<{ n: number }>(`select count(*)::int as n from public.abholrunden;`)).rows[0].n;
  check("Abholrunde: nach dem Fehler gibt es keine zusätzliche Runde", nachher === vorher, `${vorher} -> ${nachher}`);
  for (const rolle of ["brigade", "buchhaltung", "kunde"]) {
    await alsScheitert(rolle, `Abholrunde: ${rolle} legt über die Funktion keine Runde an`, `select public.abholrunde_anlegen(current_date + 4, null, null, null, null, null, null, '[]'::jsonb);`, []);
  }
}

// --- 4. Grenze der Adresssuche ----------------------------------------------------------------------------------------------------------------
{
  await als("admin", () => db.query(`select public.einstellung_setzen('sicherheit.adresssuche_je_stunde', 3, null, null);`));
  const aufrufe = async (rolle: string, n: number) => als(rolle, async () => {
    const ergebnisse: boolean[] = [];
    for (let i = 0; i < n; i++) ergebnisse.push((await db.query<{ ok: boolean }>(`select public.adresssuche_zulassen() as ok;`)).rows[0].ok);
    return ergebnisse;
  });
  const betrieb = await aufrufe("betriebsleitung", 5);
  check("Adresssuche: drei Anfragen je Stunde und Person gehen durch, die vierte und fünfte nicht", JSON.stringify(betrieb) === JSON.stringify([true, true, true, false, false]), JSON.stringify(betrieb));
  const admin = await aufrufe("admin", 1);
  check("Adresssuche: die Grenze zählt je Person, eine andere Person ist unberührt", admin[0] === true);
  await db.exec(`update public.adresssuche_protokoll set zeitpunkt = now() - interval '2 hours';`);
  check("Adresssuche: nach einer Stunde zählt die Anfrage nicht mehr", (await aufrufe("betriebsleitung", 1))[0] === true);
  await db.exec(`update public.adresssuche_protokoll set zeitpunkt = now() - interval '2 days';`);
  await aufrufe("admin", 1);
  const { rows: alt } = await db.query<{ n: number }>(`select count(*)::int as n from public.adresssuche_protokoll where zeitpunkt < now() - interval '1 day';`);
  check("Adresssuche: Einträge über einen Tag werden mit aufgeräumt", alt[0].n === 0, String(alt[0].n));
  await als("admin", () => db.query(`select public.einstellung_setzen('sicherheit.adresssuche_je_stunde', null, null, null);`));
  const frei = await aufrufe("betriebsleitung", 6);
  check("Adresssuche: nicht gesetzt heißt keine Grenze", frei.every(Boolean));
  await als("admin", () => db.query(`select public.einstellung_setzen('sicherheit.adresssuche_je_stunde', 20, null, null);`));
  await t.alsRolle("anon");
  await mussScheitern("Adresssuche: anon ruft die Funktion nicht auf", `select public.adresssuche_zulassen();`, [], "42501");
  await t.alsAdmin();
}
await alsScheitert("admin", "Adresssuche: das Protokoll lässt sich auch als Administration nicht direkt lesen (42501)", `select * from public.adresssuche_protokoll;`, [], "42501");

// --- 5. Geheimnis mit Präfix ---------------------------------------------------------------------------------------------------------------------
{
  const { rows: i } = await db.query<{ id: string }>(`select id from public.integrationen order by key limit 1;`);
  for (const name of ["CRON_SECRET", "KI_ANBIETER_SCHLUESSEL", "SUPABASE_SERVICE_ROLE_KEY", "DAMICON_HOOK_", "damicon_hook_esf", "DAMICON_HOOK_" + "X".repeat(49)]) {
    await alsScheitert("admin", `Geheimnis: ${name.length > 40 ? name.slice(0, 30) + "..." : name} ist als Name nicht zulässig (23514)`, `update public.integrationen set geheimnis_name = $2 where id = $1;`, [i[0].id, name], "23514");
  }
  await als("admin", async () => {
    await db.query(`update public.integrationen set geheimnis_name = 'DAMICON_HOOK_ESF_TEST' where id = $1;`, [i[0].id]);
    check("Geheimnis: DAMICON_HOOK_ plus Großbuchstaben, Ziffern und Unterstriche ist zulässig", true);
  });
  check("Geheimnis: das Muster im Code und in der Datenbank sind gleich", GEHEIMNIS_MUSTER.source === "^DAMICON_HOOK_[A-Z0-9_]{1,48}$");
}

// --- 6. Block-Risiko --------------------------------------------------------------------------------------------------------------------------------
{
  await alsScheitert("admin", "Risiko: die Schwelle hoch unter der Schwelle mittel wird abgelehnt (23514)", `update public.risiko_parameter set wert = 20 where schluessel = 'schwelle_hoch';`, [], "23514");
  await alsScheitert("admin", "Risiko: der kritische Ausschuss unter dem Zielwert wird abgelehnt (23514)", `update public.risiko_parameter set wert = 3 where schluessel = 'ausschuss_kritisch_prozent';`, [], "23514");
  await alsScheitert("admin", "Risiko: die Schwelle mittel über der Schwelle hoch wird abgelehnt (23514)", `update public.risiko_parameter set wert = 60 where schluessel = 'schwelle_mittel';`, [], "23514");
  await als("ceo", async () => {
    await db.query(`update public.risiko_parameter set wert = 55 where schluessel = 'schwelle_hoch';`);
    await db.query(`update public.risiko_parameter set wert = 55 where schluessel = 'schwelle_hoch';`);
    check("Risiko: eine plausible Änderung (hoch 55 über mittel 25) geht durch", true);
  });
  await db.exec(`update public.risiko_parameter set wert = 50 where schluessel = 'schwelle_hoch';`);
  for (const rolle of ["admin", "ceo", "betriebsleitung", "brigade"]) {
    await als(rolle, async () => {
      const { rows } = await db.query(`select reihenblock_id from public.v_block_risiko;`);
      check(`Risiko: ${rolle} sieht die Bewertung der Blöcke`, rows.length > 0, `Zeilen: ${rows.length}`);
    });
  }
  for (const rolle of ["buchhaltung", "erzeuger", "picker", "kunde"]) {
    await als(rolle, async () => {
      const { rows } = await db.query(`select reihenblock_id from public.v_block_risiko;`);
      check(`Risiko: ${rolle} bekommt keine Bewertung (ihre Eingaben wären unvollständig und das Ergebnis zu niedrig)`, rows.length === 0, `Zeilen: ${rows.length}`);
    });
  }
}

// --- 7. Rechenregeln ----------------------------------------------------------------------------------------------------------------------------------
{
  check("Runden: 1,005 ergibt 1,01 (Math.round(x * 100) / 100 ergibt 1,00)", rundeKaufmaennisch(1.005) === 1.01 && Math.round(1.005 * 100) / 100 === 1);
  check("Runden: halbe Werte gehen weg von null, auch negativ", rundeKaufmaennisch(0.5, 0) === 1 && rundeKaufmaennisch(-0.5, 0) === -1 && rundeKaufmaennisch(2.675) === 2.68 && rundeKaufmaennisch(-2.675) === -2.68);
  check("Runden: Werte, die schon passen, bleiben (6,125 mit sechs Stellen)", rundeKaufmaennisch(6.125, 6) === 6.125 && rundeKaufmaennisch(0.06125 * 100, 6) === 6.125);
  check("Runden: sehr kleine und sehr große Werte rechnen weiter", rundeKaufmaennisch(1e-9) === 0 && Math.abs(rundeKaufmaennisch(1e21) - 1e21) / 1e21 < 1e-12 && Number.isNaN(rundeKaufmaennisch(Number.NaN)));
  const e = baueEsfEntwurf({
    stichtag: "2026-10-12",
    kunde: { name: "K", identifikationsnummer: "123456789012", rechtsform: "too", kundengruppe: null },
    sorteId: "s1",
    sorteName: "Heritage",
    chargeCode: null,
    mengeKg: 1,
    preislisten: [{ gueltigAb: "2026-01-01", gueltigBis: null, kundengruppe: null, positionen: [{ sorteId: "s1", preisTengeKg: 1.005 }] }],
    mwstSaetze: [{ gueltigAb: "2026-01-01", gueltigBis: null, prozent: 16 }],
    mwstRegistriert: true,
    mwstRegistriertAm: null,
  } as never);
  check("ЭСФ: der Betrag 1,005 Tenge wird auf 1,01 gerundet, nicht auf 1,00", e.ware.betragTenge === 1.01, String(e.ware.betragTenge));
}
{
  const intern = ["192.0.0.5", "192.0.2.1", "198.18.0.1", "198.19.255.255", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255", "64:ff9b::7f00:1", "2002:7f00:1::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:db8::1", "ff02::1"];
  const offen = ["8.8.8.8", "93.184.216.34", "198.20.0.1", "223.255.255.255", "2606:4700:4700::1111", "2a00:1450:4001::200e"];
  check(`Adressen: die neuen Bereiche sind intern (${intern.length})`, intern.every(istInternerHost), intern.filter((h) => !istInternerHost(h)).join(", "));
  check("Adressen: öffentliche Adressen bleiben zulässig", offen.every((h) => !istInternerHost(h)), offen.filter(istInternerHost).join(", "));
  check("Adressen: die bisherigen Bereiche bleiben intern", ["10.0.0.1", "127.0.0.1", "172.16.5.5", "192.168.1.1", "169.254.1.1", "100.64.0.1", "::1", "fe80::1", "fd00::1", "localhost"].every(istInternerHost));
}

// --- 8. Das Protokoll des Exports ---------------------------------------------------------------------------------------------------------------
{
  const route = readFileSync("src/app/api/esutd/export/route.ts", "utf8");
  check("Export: die Datei mit Namen und Ausweisnummern geht nur mit Protokolleintrag hinaus (500 ohne)", route.includes("protokolliereStreng(profil") && route.includes("Der Zugriff konnte nicht protokolliert werden") && route.includes(", 500);") && route.indexOf("protokolliereStreng(profil") < route.indexOf("new Response("));
  const dok = readFileSync("src/lib/actions/formular-helfer.ts", "utf8");
  check("Protokoll: protokolliere() bricht eine geschehene Aktion weiter nicht ab, meldet aber den Fehler im Log", dok.includes("export async function protokolliere(") && dok.includes("protokolliereStreng(profil, aktion, ressource, ressourceId, metadata)") && dok.includes("console.error"));
}

t.ende("Alle Härtungstests grün.");
