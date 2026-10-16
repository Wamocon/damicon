// Schulungsvideos im Portal (Migration 20261208130000): die Regeln für Datei, Pfad und Sprachwahl, die Zeilensicherheit der Dateitabelle, die Nachführung von
// schulungsvideos.sprachen und die Texte in vier Sprachen. PGlite, kein Docker.
//
// Aufruf: npm run test:schulungsvideos

import { readFileSync } from "node:fs";
import { starte } from "./hilfen/pglite-rollen.mjs";
import {
  VIDEO_MAX_BYTES,
  VIDEO_SPRACHEN,
  dauerAus,
  istVideoPfad,
  istVideoSprache,
  pruefeVideoDatei,
  videoPfad,
  waehleVideoDatei,
} from "@/lib/domain/schulungsvideos";

const t = await starte();
const { db, check, als, mussScheitern } = t;
const alsScheitert = (rolle: string, name: string, sql: string, params: unknown[], code?: string) => als(rolle, () => mussScheitern(name, sql, params, code));

// --- 1. Regeln der Anwendung -----------------------------------------------------------------------------------------------------------
{
  check("Datei: MP4 und WebM in Grenzen sind zulässig", JSON.stringify(pruefeVideoDatei("Einweisung.MP4", 10_000_000)) === JSON.stringify({ ok: true, endung: "mp4", mime: "video/mp4" }) && pruefeVideoDatei("a.webm", 1).ok);
  check("Datei: andere Endungen und Namen ohne Endung werden abgelehnt", ["a.mov", "a.avi", "a.mkv", "a.pdf", "mp4", "a"].every((n) => JSON.stringify(pruefeVideoDatei(n, 1000)) === JSON.stringify({ ok: false, grund: "typ" })));
  check("Datei: leer, negativ, zu groß oder keine Zahl wird abgelehnt", [0, -5, VIDEO_MAX_BYTES + 1, Number.NaN, Number.POSITIVE_INFINITY].every((g) => JSON.stringify(pruefeVideoDatei("a.mp4", g)) === JSON.stringify({ ok: false, grund: "groesse" })));
  check("Datei: genau 500 MB sind erlaubt", pruefeVideoDatei("a.mp4", VIDEO_MAX_BYTES).ok);

  const video = "11111111-1111-4111-8111-111111111111";
  const pfad = videoPfad(video, "kk", "mp4", 1_789_000_000_000);
  check("Pfad: Video, Sprache, Zeitstempel und Endung", pfad === `${video}/kk-1789000000000.mp4`, pfad);
  check("Pfad: gültig nur für dasselbe Video und dieselbe Sprache", istVideoPfad(pfad, video, "kk") && !istVideoPfad(pfad, video, "ru") && !istVideoPfad(pfad, "22222222-2222-4222-8222-222222222222", "kk"));
  check("Pfad: fremde Formen werden abgelehnt (Verzeichniswechsel, andere Endung, kein Zeitstempel)", ["../x.mp4", `${video}/../kk-1789000000000.mp4`, `${video}/kk-1789000000000.exe`, `${video}/kk.mp4`, `${video}/kk-12.mp4`, ""].every((p) => !istVideoPfad(p, video, "kk")));
  check("Sprache: genau die vier Portalsprachen", VIDEO_SPRACHEN.join() === "de,en,ru,kk" && istVideoSprache("kk") && !istVideoSprache("tr") && !istVideoSprache(undefined) && !istVideoSprache(""));

  const d = (s: string) => ({ sprache: s });
  check("Auswahl: die Sprache der Person, wenn es sie gibt", waehleVideoDatei([d("ru"), d("kk"), d("de")], "kk")?.sprache === "kk");
  check("Auswahl: sonst Russisch, dann Kasachisch, dann Deutsch, dann Englisch", waehleVideoDatei([d("en"), d("kk")], "de")?.sprache === "kk" && waehleVideoDatei([d("en"), d("de")], "kk")?.sprache === "de" && waehleVideoDatei([d("en"), d("ru"), d("kk")], "de")?.sprache === "ru" && waehleVideoDatei([d("en")], "kk")?.sprache === "en");
  check("Auswahl: ohne Dateien gibt es nichts", waehleVideoDatei([], "ru") === null);
  check("Auswahl: eine unbekannte Sprache der Datei bleibt der letzte Rückfall", waehleVideoDatei([d("tr")], "ru")?.sprache === "tr");
  check("Dauer: Minuten und Sekunden, ohne Angabe null", JSON.stringify(dauerAus(185)) === JSON.stringify({ min: 3, sek: 5 }) && dauerAus(null) === null && dauerAus(0) === null && JSON.stringify(dauerAus(59.6)) === JSON.stringify({ min: 1, sek: 0 }));
}

// --- 2. Datenbank -----------------------------------------------------------------------------------------------------------------------
const { rows: videos } = await db.query<{ id: string }>(`select id from public.schulungsvideos order by titel limit 2;`);
const [v1, v2] = [videos[0].id, videos[1].id];
const datei = (video: string, sprache: string, pfad: string, groesse = 1_000_000) =>
  db.query(`insert into public.schulungsvideo_dateien (video_id, sprache, storage_path, groesse_bytes) values ($1, $2, $3, $4);`, [video, sprache, pfad, groesse]);
const sprachen = async (video: string) => (await db.query<{ s: string[] }>(`select sprachen as s from public.schulungsvideos where id = $1;`, [video])).rows[0].s.join();

{
  const { rows } = await db.query<{ id: string; file_size_limit: string; allowed_mime_types: string[] | null; public: boolean }>(`select id, file_size_limit::text, allowed_mime_types, public from storage.buckets where id = 'schulungsvideos';`);
  check("Bucket: privat, 500 MB, nur MP4 und WebM", rows.length === 1 && rows[0].public === false && Number(rows[0].file_size_limit) === VIDEO_MAX_BYTES && (rows[0].allowed_mime_types ?? []).slice().sort().join() === "video/mp4,video/webm", JSON.stringify(rows));
}

await als("admin", async () => {
  await datei(v1, "ru", `${v1}/ru-1789000000001.mp4`);
  await datei(v1, "kk", `${v1}/kk-1789000000002.mp4`);
  check("Dateien: die Administration legt Dateien an, schulungsvideos.sprachen folgt (kk,ru)", (await sprachen(v1)) === "kk,ru", await sprachen(v1));
});
await mussScheitern("Dateien: je Video und Sprache nur eine Datei (23505)", `insert into public.schulungsvideo_dateien (video_id, sprache, storage_path, groesse_bytes) values ($1, 'ru', 'x/y-1789000000003.mp4', 5);`, [v1], "23505");
await mussScheitern("Dateien: nur die vier Sprachen (23514)", `insert into public.schulungsvideo_dateien (video_id, sprache, storage_path, groesse_bytes) values ($1, 'tr', 'x/y-1789000000004.mp4', 5);`, [v1], "23514");
await mussScheitern("Dateien: leer oder über 500 MB wird abgelehnt (23514)", `insert into public.schulungsvideo_dateien (video_id, sprache, storage_path, groesse_bytes) values ($1, 'de', 'x/y-1789000000005.mp4', 0);`, [v1], "23514");
await mussScheitern("Dateien: über 500 MB wird abgelehnt (23514)", `insert into public.schulungsvideo_dateien (video_id, sprache, storage_path, groesse_bytes) values ($1, 'de', 'x/y-1789000000006.mp4', 524288001);`, [v1], "23514");

await als("betriebsleitung", async () => {
  await datei(v2, "de", `${v2}/de-1789000000007.webm`);
  check("Dateien: die Betriebsleitung legt eine Datei an", (await sprachen(v2)) === "de");
});
for (const rolle of ["brigade", "picker", "buchhaltung", "erzeuger", "kunde"]) {
  await alsScheitert(rolle, `Dateien: ${rolle} legt keine Datei an (42501)`, `insert into public.schulungsvideo_dateien (video_id, sprache, storage_path, groesse_bytes) values ($1, 'en', 'x/y-1789000000008.mp4', 5);`, [v2], "42501");
}
for (const rolle of ["admin", "ceo", "betriebsleitung", "buchhaltung", "brigade", "picker", "erzeuger"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select id from public.schulungsvideo_dateien;`);
    check(`Lesen: ${rolle} sieht die Dateien`, rows.length === 3, `Zeilen: ${rows.length}`);
  });
}
await als("kunde", async () => {
  const { rows } = await db.query(`select id from public.schulungsvideo_dateien;`);
  check("Lesen: ein Kunde sieht keine Schulungsvideos", rows.length === 0, `Zeilen: ${rows.length}`);
});
await t.alsRolle("anon");
await mussScheitern("Lesen: anon hat keinen Zugriff auf die Dateien (42501)", `select * from public.schulungsvideo_dateien;`, [], "42501");
await t.alsAdmin();

await alsScheitert("admin", "Ändern: das Video einer Datei lässt sich nicht umhängen (42501, Spaltenrecht)", `update public.schulungsvideo_dateien set video_id = $1 where video_id = $2;`, [v2, v1], "42501");
await als("admin", async () => {
  await db.query(`update public.schulungsvideo_dateien set storage_path = $2, groesse_bytes = 2000000 where video_id = $1 and sprache = 'ru';`, [v1, `${v1}/ru-1789000000009.mp4`]);
  check("Ändern: Pfad und Größe lassen sich ersetzen (neue Datei in derselben Sprache)", (await sprachen(v1)) === "kk,ru");
});
for (const rolle of ["brigade", "picker"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`delete from public.schulungsvideo_dateien where video_id = $1 returning id;`, [v1]).catch(() => ({ rows: [] }));
    check(`Löschen: ${rolle} löscht keine Datei`, rows.length === 0);
  });
}
await als("betriebsleitung", async () => {
  await db.query(`delete from public.schulungsvideo_dateien where video_id = $1 and sprache = 'ru';`, [v1]);
  check("Löschen: ohne die russische Datei bleibt kk", (await sprachen(v1)) === "kk", await sprachen(v1));
});
await als("admin", async () => {
  await db.query(`delete from public.schulungsvideo_dateien where video_id = $1;`, [v1]);
  check("Löschen: ohne Dateien ist die Liste der Sprachen leer", (await sprachen(v1)) === "", await sprachen(v1));
  await datei(v1, "ru", `${v1}/ru-1789000000010.mp4`);
});
await db.query(`delete from public.schulungsvideos where id = $1;`, [v1]);
check("Video löschen: die Dateien verschwinden mit (cascade)", (await db.query(`select 1 from public.schulungsvideo_dateien where video_id = $1;`, [v1])).rows.length === 0);

// --- 3. Texte ----------------------------------------------------------------------------------------------------------------------------
{
  const codes = ["zugriff", "ungueltig", "typ", "groesse", "nichtDa", "speicher", "unbekannt"];
  for (const l of ["de", "en", "ru", "kk"]) {
    const m = JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8"));
    const s = m.schulungsvideos;
    const fehlt = [
      s?.titel, s?.lead, s?.pflicht, s?.dauer, s?.nochKeinVideo, s?.keineDatei, s?.sprachwahl, s?.kein_video_support, s?.entfernen,
      s?.upload?.titel, s?.upload?.sprache, s?.upload?.datei, s?.upload?.knopf, s?.upload?.laeuft, s?.upload?.fertig, s?.upload?.hinweis,
      m.aktionen?.ok?.videoEntfernt,
      ...VIDEO_SPRACHEN.map((x) => s?.sprache?.[x]),
      ...codes.map((c) => s?.fehler?.[c]),
    ].filter((x) => typeof x !== "string" || x.length < 2);
    check(`Texte (${l}): alle Texte der Schulungsvideos vorhanden`, fehlt.length === 0, String(fehlt.length));
  }
}

t.ende("Alle Tests der Schulungsvideos gruen.");
