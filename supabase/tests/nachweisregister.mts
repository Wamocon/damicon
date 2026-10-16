// Nachweisregister (WMCNL-1469): Ablaufstatus in Datenbank und Anwendung, Constraints,
// Sicht v_dokumente mit Zeilensicherheit, Eingabepruefung und Radar-Fristen.
// Die Statusregel steht zweimal: public.nachweis_status() und domain/nachweise.ts.
// Dieser Test rechnet beide gegeneinander, damit sie nicht auseinanderlaufen.
//
// Aufruf: npm run test:nachweisregister (ueber tsx, PGlite, kein Docker noetig).

import { starte } from "./hilfen/pglite-rollen.mjs";
import { readFileSync } from "node:fs";
import {
  aktuelleVersionen,
  nachweisFristen,
  ordneVersionen,
  nachweisStatus,
  nachweisZaehlung,
  partnerAusWert,
  tageBisAblauf,
  tageZwischen,
  warnungTageAus,
  zeitraumFehler,
  type NachweisZeitraum,
} from "@/lib/domain/nachweise";
import { nachweisFaelligkeit } from "@/lib/domain/risikoradar";
import { tagePlus } from "@/lib/listen/zeitraum";
import { tagInZone } from "@/lib/domain/tageszeit";

const t = await starte();
const { db, check, als, mussScheitern } = t;

const pruefe = check;

// --- 1. Statusregel: Datenbank gegen Anwendung -------------------------------------------
const STICHTAG = "2026-10-14";
async function sqlStatus(z: NachweisZeitraum, stichtag = STICHTAG): Promise<string> {
  const { rows } = await db.query(
    "select public.nachweis_status($1::date, $2::date, $3::boolean, $4::integer, $5::date) as s;",
    [z.gueltigVon, z.gueltigBis, z.unbefristet, z.warnungTage, stichtag],
  );
  return rows[0].s as string;
}

const faelle: [string, NachweisZeitraum, string][] = [
  ["Ende heute: gilt noch, laeuft ab", { gueltigVon: null, gueltigBis: STICHTAG, unbefristet: false, warnungTage: 60 }, "laeuft_ab"],
  ["Ende gestern: abgelaufen", { gueltigVon: null, gueltigBis: tagePlus(STICHTAG, -1), unbefristet: false, warnungTage: 60 }, "abgelaufen"],
  ["Ende in genau 60 Tagen: laeuft ab", { gueltigVon: null, gueltigBis: tagePlus(STICHTAG, 60), unbefristet: false, warnungTage: 60 }, "laeuft_ab"],
  ["Ende in 61 Tagen: gueltig", { gueltigVon: null, gueltigBis: tagePlus(STICHTAG, 61), unbefristet: false, warnungTage: 60 }, "gueltig"],
  ["eigene Vorwarnzeit 10: Ende in 10 Tagen laeuft ab", { gueltigVon: null, gueltigBis: tagePlus(STICHTAG, 10), unbefristet: false, warnungTage: 10 }, "laeuft_ab"],
  ["eigene Vorwarnzeit 10: Ende in 11 Tagen gueltig", { gueltigVon: null, gueltigBis: tagePlus(STICHTAG, 11), unbefristet: false, warnungTage: 10 }, "gueltig"],
  ["unbefristet ohne Datum: gueltig", { gueltigVon: null, gueltigBis: null, unbefristet: true, warnungTage: 60 }, "gueltig"],
  ["kein Zeitraum und nicht unbefristet: offen", { gueltigVon: null, gueltigBis: null, unbefristet: false, warnungTage: 60 }, "offen"],
  ["Beginn in der Zukunft: offen", { gueltigVon: tagePlus(STICHTAG, 3), gueltigBis: tagePlus(STICHTAG, 400), unbefristet: false, warnungTage: 60 }, "offen"],
  ["Beginn in der Zukunft, unbefristet: offen", { gueltigVon: tagePlus(STICHTAG, 1), gueltigBis: null, unbefristet: true, warnungTage: 60 }, "offen"],
  ["Beginn heute: wirksam", { gueltigVon: STICHTAG, gueltigBis: tagePlus(STICHTAG, 400), unbefristet: false, warnungTage: 60 }, "gueltig"],
  ["abgelaufen schlaegt Vorwarnung 365", { gueltigVon: null, gueltigBis: tagePlus(STICHTAG, -400), unbefristet: false, warnungTage: 365 }, "abgelaufen"],
];
for (const [name, zeitraum, erwartet] of faelle) {
  const ts = nachweisStatus(zeitraum, STICHTAG);
  const sql = await sqlStatus(zeitraum);
  pruefe(`Status: ${name}`, ts === erwartet && sql === erwartet, `Anwendung ${ts}, Datenbank ${sql}, erwartet ${erwartet}`);
}

// Gleichlauf ueber ein dichtes Raster: jede Abweichung zwischen SQL und TS faellt auf.
{
  const abweichungen: string[] = [];
  let gerechnet = 0;
  for (const warnung of [1, 10, 60, 365]) {
    for (let abstand = -5; abstand <= 70; abstand++) {
      for (const unbefristet of [false, true]) {
        const z: NachweisZeitraum = { gueltigVon: null, gueltigBis: unbefristet ? null : tagePlus(STICHTAG, abstand), unbefristet, warnungTage: warnung };
        const ts = nachweisStatus(z, STICHTAG);
        const sql = await sqlStatus(z);
        gerechnet++;
        if (ts !== sql) abweichungen.push(`${warnung}/${abstand}/${unbefristet}: TS ${ts} SQL ${sql}`);
      }
    }
  }
  pruefe(`Gleichlauf SQL und Anwendung ueber ${gerechnet} Faelle`, abweichungen.length === 0, abweichungen.slice(0, 3).join("; "));
}

pruefe("Tage bis zum Ende: heute 0, gestern -1, in 5 Tagen 5",
  tageBisAblauf({ gueltigVon: null, gueltigBis: STICHTAG, unbefristet: false, warnungTage: 60 }, STICHTAG) === 0 &&
  tageBisAblauf({ gueltigVon: null, gueltigBis: tagePlus(STICHTAG, -1), unbefristet: false, warnungTage: 60 }, STICHTAG) === -1 &&
  tageBisAblauf({ gueltigVon: null, gueltigBis: tagePlus(STICHTAG, 5), unbefristet: false, warnungTage: 60 }, STICHTAG) === 5);
pruefe("Tage bis zum Ende: unbefristet und ohne Datum null",
  tageBisAblauf({ gueltigVon: null, gueltigBis: null, unbefristet: true, warnungTage: 60 }, STICHTAG) === null &&
  tageBisAblauf({ gueltigVon: null, gueltigBis: null, unbefristet: false, warnungTage: 60 }, STICHTAG) === null);
pruefe("tageZwischen rechnet ueber Monats- und Jahresgrenzen", tageZwischen("2026-12-30", "2027-01-02") === 3 && tageZwischen("2026-02-27", "2026-03-01") === 2);

// --- 2. Der Tag in Almaty ---------------------------------------------------------------------
{
  const { rows } = await db.query("select public.heute_almaty()::text as tag;");
  const sqlTag = rows[0].tag as string;
  const tsTag = tagInZone(new Date());
  pruefe("heute_almaty liegt hoechstens einen Tag neben dem Tag der Anwendung", Math.abs(tageZwischen(sqlTag, tsTag)) <= 1, `SQL ${sqlTag}, Anwendung ${tsTag}`);
}

// --- 3. Constraints --------------------------------------------------------------------------------
const einfuegen = (spalten: string, werte: unknown[]) =>
  `insert into public.dokumente (name, ${spalten}) values ('Pruefung', ${werte.map((_, i) => `$${i + 1}`).join(", ")});`;
await mussScheitern("Constraint: Vorwarnzeit 0 wird abgelehnt", einfuegen("warnung_tage", [0]), [0], "23514");
await mussScheitern("Constraint: Vorwarnzeit 366 wird abgelehnt", einfuegen("warnung_tage", [366]), [366], "23514");
await mussScheitern("Constraint: Ende vor Beginn wird abgelehnt", einfuegen("gueltig_von, gueltig_bis", ["2026-05-01", "2026-04-01"]), ["2026-05-01", "2026-04-01"], "23514");
await mussScheitern("Constraint: unbefristet mit Enddatum wird abgelehnt", einfuegen("unbefristet, gueltig_bis", [true, "2027-01-01"]), [true, "2027-01-01"], "23514");

// --- 4. Die Sicht ------------------------------------------------------------------------------------
const { rows: heuteZeile } = await db.query("select public.heute_almaty()::text as tag;");
const heute = heuteZeile[0].tag as string;
await db.query(
  `insert into public.dokumente (name, kategorie, gueltig_bis, warnung_tage, rechtsgrundlage) values
     ('Reg-abgelaufen', 'zertifikat', $1, 60, 'Auflage A'),
     ('Reg-laeuft-ab', 'zertifikat', $2, 60, null),
     ('Reg-gueltig', 'zertifikat', $3, 60, null);`,
  [tagePlus(heute, -3), tagePlus(heute, 20), tagePlus(heute, 300)],
);
await db.query(`insert into public.dokumente (name, kategorie, unbefristet) values ('Reg-unbefristet', 'liefervertrag', true), ('Reg-offen', 'sonstiges', false);`);

await als("admin", async () => {
  const { rows } = await db.query(
    `select name, nachweis_status, tage_bis_ablauf from public.v_dokumente where name like 'Reg-%' order by name;`,
  );
  const status = Object.fromEntries(rows.map((r) => [r.name, r.nachweis_status]));
  pruefe("Sicht: abgelaufen, laeuft ab, gueltig, unbefristet und offen", status["Reg-abgelaufen"] === "abgelaufen" && status["Reg-laeuft-ab"] === "laeuft_ab" && status["Reg-gueltig"] === "gueltig" && status["Reg-unbefristet"] === "gueltig" && status["Reg-offen"] === "offen", JSON.stringify(status));
  const tage = Object.fromEntries(rows.map((r) => [r.name, r.tage_bis_ablauf]));
  pruefe("Sicht: Tage bis zum Ablauf negativ, positiv und leer", tage["Reg-abgelaufen"] === -3 && tage["Reg-laeuft-ab"] === 20 && tage["Reg-unbefristet"] === null && tage["Reg-offen"] === null, JSON.stringify(tage));
  const { rows: bis } = await db.query(`select count(*)::int as n from public.v_dokumente where nachweis_status in ('laeuft_ab', 'abgelaufen') and gueltig_bis is not null;`);
  pruefe("Sicht: nach Status filtern, wie die Radar-Abfrage es tut", bis[0].n >= 2, `Treffer: ${bis[0].n}`);
});

// Seed-Dokumente ohne Zeitraum erscheinen als offen: es werden keine Daten erfunden.
await als("admin", async () => {
  const { rows } = await db.query(`select nachweis_status, count(*)::int as n from public.v_dokumente where name not like 'Reg-%' and name <> 'Pruefung' group by 1;`);
  pruefe("Bestehende Dokumente ohne Zeitraum sind offen, nicht gueltig", rows.every((r) => r.nachweis_status === "offen"), JSON.stringify(rows));
});

// --- 5. Zeilensicherheit ---------------------------------------------------------------------------------
for (const rolle of ["admin", "betriebsleitung", "buchhaltung"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select count(*)::int as n from public.v_dokumente where name like 'Reg-%';`);
    pruefe(`RLS: ${rolle} sieht das Register`, rows[0].n === 5, `Zeilen: ${rows[0].n}`);
  });
}
for (const rolle of ["kunde", "picker", "erzeuger", "brigade"]) {
  await als(rolle, async () => {
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.v_dokumente;`);
    const direkt = await db.query<{ n: number }>(`select count(*)::int as n from public.dokumente;`);
    pruefe(`RLS: ${rolle} sieht durch die Sicht nicht mehr als in der Tabelle`, rows[0].n === direkt.rows[0].n, `Sicht ${rows[0].n}, Tabelle ${direkt.rows[0].n}`);
  });
}
await t.alsRolle("anon");
await mussScheitern("RLS: anon darf die Sicht nicht lesen", "select * from public.v_dokumente;", [], "42501");

await als("buchhaltung", async () => {
  const { rows } = await db.query(
    `update public.dokumente set gueltig_bis = $1, unbefristet = false where name = 'Reg-offen' returning id;`,
    [tagePlus(heute, 400)],
  );
  pruefe("Schreiben: Buchhaltung traegt ein Enddatum nach", rows.length === 1);
});
await als("admin", async () => {
  const { rows } = await db.query<{ nachweis_status: string }>(`select nachweis_status from public.v_dokumente where name = 'Reg-offen';`);
  pruefe("Schreiben: aus offen wird gueltig, sobald ein Enddatum steht", rows[0]?.nachweis_status === "gueltig", rows[0]?.nachweis_status);
});

// --- 6. Eingabepruefung der Anwendung ------------------------------------------------------------------------
pruefe("Zeitraum: gueltige Eingabe", zeitraumFehler({ gueltigVon: "2026-01-01", gueltigBis: "2026-12-31", unbefristet: false }) === null);
pruefe("Zeitraum: Ende vor Beginn", zeitraumFehler({ gueltigVon: "2026-05-01", gueltigBis: "2026-04-01", unbefristet: false }) === "zeitraum");
pruefe("Zeitraum: unbefristet mit Enddatum", zeitraumFehler({ gueltigVon: null, gueltigBis: "2026-04-01", unbefristet: true }) === "zeitraum");
pruefe("Zeitraum: unmogliches Datum", zeitraumFehler({ gueltigVon: null, gueltigBis: "2026-02-30", unbefristet: false }) === "eingabe");
pruefe("Zeitraum: leere Eingabe ist erlaubt (offen)", zeitraumFehler({ gueltigVon: null, gueltigBis: null, unbefristet: false }) === null);
pruefe("Vorwarnzeit: leer ist die Vorgabe 60", warnungTageAus("") === 60 && warnungTageAus("  ") === 60);
pruefe("Vorwarnzeit: Grenzen 1 und 365", warnungTageAus("1") === 1 && warnungTageAus("365") === 365 && warnungTageAus("0") === null && warnungTageAus("366") === null);
pruefe("Vorwarnzeit: Bruch und Text sind ungueltig", warnungTageAus("2.5") === null && warnungTageAus("abc") === null);
const uuid = "11111111-1111-4111-8111-111111111111";
pruefe("Partner: leer heisst keiner", partnerAusWert("") === "keiner");
pruefe("Partner: Kunde und Nachbarbetrieb", JSON.stringify(partnerAusWert(`kunde:${uuid}`)) === JSON.stringify({ art: "kunde", id: uuid }) && JSON.stringify(partnerAusWert(`nachbar:${uuid}`)) === JSON.stringify({ art: "nachbar", id: uuid }));
pruefe("Partner: unbekannte Art oder keine Id ist ungueltig", partnerAusWert(`lieferant:${uuid}`) === null && partnerAusWert("kunde:") === null && partnerAusWert("kunde:keine-uuid") === null);

// --- 7. Radar -----------------------------------------------------------------------------------------------------
{
  const zeilen = [
    { id: "a", name: "A", gueltigBis: "2026-10-01", status: "abgelaufen" as const },
    { id: "b", name: "B", gueltigBis: "2026-11-01", status: "laeuft_ab" as const },
    { id: "c", name: "C", gueltigBis: "2027-05-01", status: "gueltig" as const },
    { id: "d", name: "D", gueltigBis: null, status: "offen" as const },
    { id: "e", name: "E", gueltigBis: null, status: "abgelaufen" as const },
  ];
  const fristen = nachweisFristen(zeilen);
  pruefe("Radar: nur abgelaufen und laeuft ab, jeweils mit Datum", fristen.map((f) => f.id).join(",") === "a,b", fristen.map((f) => f.id).join(","));
  const zaehler = nachweisZaehlung(zeilen.map((z) => z.status));
  pruefe("Zaehlung je Status", zaehler.abgelaufen === 2 && zaehler.laeuft_ab === 1 && zaehler.gueltig === 1 && zaehler.offen === 1);
  const faellig = nachweisFaelligkeit("2026-10-14");
  pruefe("Faelligkeit: Ende des Tages in Almaty (UTC+5), nicht Mitternacht davor", faellig === "2026-10-14T18:59:59.000Z", faellig);
}

// --- 8. Versionen (Migration 20261208120000) --------------------------------------------------------------------------------------
{
  const neu = async (name: string, kategorie: string, gueltigBis: string | null, ersetzt: string | null = null) =>
    (await db.query<{ id: string }>(
      `insert into public.dokumente (name, kategorie, gueltig_bis, ersetzt_id) values ($1, $2::public.dokument_kategorie, $3::date, $4::uuid) returning id;`,
      [name, kategorie, gueltigBis, ersetzt],
    )).rows[0].id;
  const sicht = async (id: string) =>
    (await db.query<{ ersetzt_id: string | null; ersetzt_durch_id: string | null; nachweis_status: string }>(
      `select ersetzt_id, ersetzt_durch_id, nachweis_status from public.v_dokumente where id = $1;`,
      [id],
    )).rows[0];

  const vorjahr = tagePlus(tagInZone(new Date()), -30);
  const naechstesJahr = tagePlus(tagInZone(new Date()), 300);
  const v1 = await neu("Ver-Zertifikat 2025", "zertifikat", vorjahr);
  const v2 = await neu("Ver-Zertifikat 2026", "zertifikat", naechstesJahr, v1);
  const a = await sicht(v1);
  const b = await sicht(v2);
  pruefe("Version: die ersetzte Version nennt ihren Nachfolger, die neue ihre Vorversion", a.ersetzt_durch_id === v2 && a.ersetzt_id === null && b.ersetzt_id === v1 && b.ersetzt_durch_id === null);
  pruefe("Version: die ersetzte Version bleibt unverändert abgelaufen, die neue gilt", a.nachweis_status === "abgelaufen" && b.nachweis_status === "gueltig", `${a.nachweis_status} / ${b.nachweis_status}`);
  {
    const { rows } = await db.query<{ id: string }>(
      `select id from public.v_dokumente where name like 'Ver-%' and nachweis_status in ('laeuft_ab', 'abgelaufen') and ersetzt_durch_id is null;`,
    );
    pruefe("Version: eine ersetzte, abgelaufene Version erscheint nicht mehr im Radar (Filter ersetzt_durch_id)", rows.length === 0, rows.length + " Zeilen");
  }
  await mussScheitern("Version: eine Version hat höchstens einen Nachfolger (23505)", `insert into public.dokumente (name, kategorie, ersetzt_id) values ('Ver-Zweiter', 'zertifikat', $1);`, [v1], "23505");
  const sonstiges = await neu("Ver-Sonstiges", "sonstiges", null);
  await mussScheitern("Version: eine andere Kategorie wird abgelehnt (DA020)", `insert into public.dokumente (name, kategorie, ersetzt_id) values ('Ver-Falsch', 'zertifikat', $1);`, [sonstiges], "DA020");
  await mussScheitern("Version: die Vorversion ändert sich nach dem Anlegen nicht (DA020)", `update public.dokumente set ersetzt_id = $2 where id = $1;`, [sonstiges, v2], "DA020");
  await mussScheitern("Version: ein Dokument ersetzt nicht sich selbst (DA020)", `insert into public.dokumente (id, name, kategorie, ersetzt_id) values ('22222222-2222-4222-8222-222222222222', 'Ver-Selbst', 'zertifikat', '22222222-2222-4222-8222-222222222222');`, [], "DA020");
  await mussScheitern("Version: eine unbekannte Vorversion wird abgelehnt (23503 oder DA020)", `insert into public.dokumente (name, kategorie, ersetzt_id) values ('Ver-Unbekannt', 'zertifikat', gen_random_uuid());`, [], "DA020");
  {
    // Die alte Version wird gelöscht: die Verknüpfung wird leer, die neue bleibt (on delete set null darf die Vorversion leeren).
    await db.query(`delete from public.dokumente where id = $1;`, [v1]);
    const nach = await sicht(v2);
    pruefe("Version: wird die alte Version gelöscht, bleibt die neue ohne Verknüpfung stehen", nach.ersetzt_id === null && nach.nachweis_status === "gueltig");
  }
  for (const rolle of ["brigade", "kunde"]) {
    await als(rolle, async () => {
      await mussScheitern(`Version: ${rolle} legt keine Version an`, `insert into public.dokumente (name, kategorie, ersetzt_id) values ('Ver-Fremd', 'zertifikat', $1);`, [v2], "42501");
    });
  }

  // Ordnung in der Anwendung
  type Z = { id: string; ersetztId: string | null; ersetztDurchId: string | null };
  const z = (id: string, ersetztId: string | null, ersetztDurchId: string | null): Z => ({ id, ersetztId, ersetztDurchId });
  const kette = [z("c", "b", null), z("a", null, "b"), z("b", "a", "c"), z("x", null, null)];
  const g = ordneVersionen(kette);
  pruefe("Ordnung: aktuell ist, was keinen Nachfolger hat; die Reihenfolge der Eingabe bleibt", g.map((e) => e.aktuell.id).join() === "c,x", g.map((e) => e.aktuell.id).join());
  pruefe("Ordnung: die früheren Versionen stehen neueste zuerst", g[0].vorversionen.map((e) => e.id).join() === "b,a" && g[1].vorversionen.length === 0);
  pruefe("Ordnung: aktuelleVersionen liefert nur die aktuellen", aktuelleVersionen(kette).map((e) => e.id).join() === "c,x");
  {
    // Ein Kreis (die Datenbank verhindert ihn) bricht ab, statt endlos zu laufen.
    const kreis = [z("p", "q", null), z("q", "p", "p")];
    const k = ordneVersionen(kreis);
    pruefe("Ordnung: ein Kreis bricht ab", k.length === 1 && k[0].aktuell.id === "p" && k[0].vorversionen.map((e) => e.id).join() === "q");
  }
  {
    // Der Nachfolger ist für die Person nicht sichtbar (Zeilensicherheit): das Dokument bleibt sichtbar und gilt als aktuell.
    const unsichtbar = ordneVersionen([z("alt", null, "geheim")]);
    pruefe("Ordnung: ein nicht sichtbarer Nachfolger macht das Dokument nicht unsichtbar", unsichtbar.length === 1 && unsichtbar[0].aktuell.id === "alt");
    pruefe("Ordnung: eine fehlende Vorversion bricht die Kette ab", ordneVersionen([z("neu", "weg", null)])[0].vorversionen.length === 0);
    pruefe("Ordnung: leere Eingabe", ordneVersionen([]).length === 0);
  }
  const sprachen = ["de", "en", "ru", "kk"].map((l) => ({ l, m: JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")) }));
  for (const { l, m } of sprachen) {
    const fehlt = [
      m.nachweisregister?.neueVersion, m.nachweisregister?.vorversionen, m.nachweisregister?.bis, m.nachweisregister?.versionLead,
      m.dokumenteVerwaltung?.versionKnopf, m.aktionen?.ok?.dokumentVersion, m.aktionen?.fehler?.versionSchonErsetzt, m.aktionen?.fehler?.versionRegel,
    ].filter((x) => typeof x !== "string" || x.length < 3);
    pruefe(`Version: alle Texte stehen in ${l}`, fehlt.length === 0);
  }
}

t.ende("Alle Nachweisregister-Tests gruen.");
