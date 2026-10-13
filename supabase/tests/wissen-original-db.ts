// =============================================================================
// Damicon - Original-PDF bis zur Freigabe gegen ECHTES Postgres und ECHTEN Storage (Bucket wissen-originale, Tabelle wissen_original)
// =============================================================================
// Ausfuehren:  npx tsx --env-file=.env.local supabase/tests/wissen-original-db.ts   (Teil von npm run test:wissen-db)
// Voraussetzung: laufende LOKALE Supabase-Instanz (mit Storage) und alle Migrationen (20261204000000), Demo-Zugaenge (npm run db:seed-auth).
// Der Upload laeuft wie im Browser: wiederaufnehmbar (TUS, Stuecke zu 6 MB) mit der Sitzung der Administration; der Bucket erlaubt das nur ihr.
// Sicherheitsnetz wie die anderen Datenbanktests: nur lokal, nur eigene Zeilen und Dateien, am Ende aufgeraeumt.
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DB_OPTION } from "@/lib/supabase/schema";
import type { Einbettung } from "@/lib/wissen/embed";
import { verarbeiteUpload } from "@/lib/wissen/hochladen";
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import {
  bereiteOriginalVor,
  bestaetigeOriginal,
  entferneOriginal,
  GIB,
  ORIGINAL_GESAMT_MAX_BYTES,
  ORIGINAL_MAX_BYTES,
  originalAdresse,
  OriginalFehler,
  originalBucket,
  originalPfad,
  originalPlausibel,
  pruefeOriginalPlatz,
  pruefePlatz,
} from "@/lib/wissen/original";
import { tokens } from "@/lib/wissen/sparse";
import { supabaseSpeicher } from "@/lib/wissen/speicher-supabase";
import { gruppiereWissenDokumente, type WissenListeZeile } from "@/lib/wissen/dokumente-liste";
import { ladeInStuecken, TUS_STUECK } from "@/lib/wissen/tus-upload";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("Fehlende Env-Variablen. Aufruf: npx tsx --env-file=.env.local supabase/tests/wissen-original-db.ts");
  process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("Dieser Test schreibt Testdaten und laeuft nur gegen eine lokale Datenbank.");
  process.exit(1);
}

let gesamt = 0;
let fehlerAnzahl = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehlerAnzahl++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const dienst = createClient(url, serviceKey, { auth: { persistSession: false }, db: DB_OPTION });
const anon = createClient(url, anonKey, { auth: { persistSession: false }, db: DB_OPTION });
const DIM = 1024;
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const einbettung: Einbettung = {
  modell: "synthetisch-bge-m3",
  dimension: DIM,
  async einbetten(texte) {
    return texte.map((t) => {
      const v = new Array<number>(DIM).fill(0);
      for (const w of tokens(t)) v[hash32(w) % DIM]! += 1;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
  },
};
const TEXT =
  "Qzorig Buch Pruefung Original Datei Scan Seitenzahl Kapitel Abschnitt Verzeichnis Anhang Fussnote Quellenangabe Kommentar Auslegung Rechtsprechung Gesetzgeber Begruendung Vorschrift Anwendungsbereich Ausnahme Voraussetzung Rechtsfolge";
const PDF = Buffer.from("%PDF-1.4\n% Testdatei fuer wissen-original-db\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

async function anmelden(email: string): Promise<string> {
  const c = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: "DamiconDemo2026!" });
  if (error || !data.session) throw new Error(`Anmeldung ${email}: ${error?.message}`);
  return data.session.access_token;
}

async function main() {
  const { data: profile } = await dienst.from("profiles").select("id").eq("email", "admin@damicon.demo");
  const ADMIN = (profile as { id: string }[] | null)?.[0]?.id;
  if (!ADMIN) throw new Error("Demo-Zugaenge fehlen (npm run db:seed-auth)");
  const adminToken = await anmelden("admin@damicon.demo");
  const kundeToken = await anmelden("kunde@damicon.demo");
  const db = dienst as unknown as SupabaseClient;
  const bucketName = originalBucket();
  const speicher = supabaseSpeicher(dienst);
  const d = { speicher, einbettung, jetzt: () => new Date("2026-10-13T10:00:00.000Z"), umgebung: {}, schema: "public" };
  const ids: string[] = [];
  const FALSCH = "upload:" + "f".repeat(32);
  const aufraeumen = async () => {
    for (const q of ids) await loescheHochgeladenesDokument(q, { speicher, umgebung: {}, schema: "public" }).catch(() => undefined);
    for (const q of ids) await entferneOriginal(db, q);
    await dienst.from("wissen_original").delete().eq("quelle_id", FALSCH);
  };
  await aufraeumen();

  const fehlerCode = async (f: () => Promise<unknown>) => {
    try {
      await f();
      return "kein-fehler";
    } catch (x) {
      return x instanceof OriginalFehler ? x.code : `andere:${String(x)}`;
    }
  };
  const tus = (daten: Buffer, token: string, pfad: string, fortschritt?: (p: number) => void) =>
    ladeInStuecken(daten, { url: url!, anonKey: anonKey!, token, bucket: bucketName, pfad }, fortschritt);

  try {
    // ---- reine Regeln ---------------------------------------------------------------------------------------------------------------------
    pruefe("Pfad: nur für Uploads (32 Hexzeichen), sonst null", originalPfad("upload:" + "a".repeat(32)) === "a".repeat(32) + ".pdf" && originalPfad("legal/x/y.md") === null && originalPfad("upload:zz") === null);
    pruefe("Plausibel: PDF, nicht leer, höchstens 1 GiB", originalPlausibel("Buch.PDF", 1000) && originalPlausibel("buch.pdf", GIB) && !originalPlausibel("buch.txt", 1000) && !originalPlausibel("buch.pdf", 0) && !originalPlausibel("buch.pdf", GIB + 1) && !originalPlausibel("buch.pdf", Number.NaN));
    pruefe("Grenzen: je Datei 1 GiB, alle wartenden zusammen 50 GiB", ORIGINAL_MAX_BYTES === GIB && ORIGINAL_GESAMT_MAX_BYTES === 50 * GIB);
    pruefe("Platz: wartend plus neu darf genau die Obergrenze erreichen, nicht überschreiten", pruefePlatz(49 * GIB, GIB).passt && !pruefePlatz(49 * GIB, GIB + 1).passt && pruefePlatz(0, 0).passt && !pruefePlatz(51 * GIB, 0).passt);
    pruefe("Platz: ungültige Zahlen zählen als 0", pruefePlatz(Number.NaN, -5).passt && pruefePlatz(Number.NaN, -5).wartend === 0 && pruefePlatz(Number.NaN, -5).neu === 0);
    pruefe("Stückgröße ist 6 MB (Vorgabe der Schnittstelle)", TUS_STUECK === 6 * 1024 * 1024);

    // ---- Bucket und Schutz -----------------------------------------------------------------------------------------------------------------
    const { data: bucket } = await dienst.storage.getBucket(bucketName);
    pruefe("Bucket wissen-originale existiert, ist privat und auf 1 GiB begrenzt", !!bucket && bucket.public === false && Number(bucket.file_size_limit) === GIB, JSON.stringify(bucket)?.slice(0, 160));
    const anonTabelle = await anon.from("wissen_original").select("quelle_id").limit(1);
    pruefe("wissen_original ist für anonyme Aufrufe gesperrt", anonTabelle.error !== null || (anonTabelle.data ?? []).length === 0, anonTabelle.error?.message ?? "keine Daten");

    // ---- Dokument hochladen, Original ablegen ---------------------------------------------------------------------------------------------
    const quelleId = (
      await verarbeiteUpload({ titel: "Original Testbuch", bereich: "recht", quellenart: "fachliteratur", rollen: ["admin"], dateiname: "original.txt", bytes: new TextEncoder().encode(TEXT), hochgeladenVon: { id: ADMIN, name: "Test Admin" }, url: "https://beispiel.example/o" }, d)
    ).quelleId;
    ids.push(quelleId);
    pruefe("Vorbereiten: unbekannte Kennung ergibt keinDokument", (await fehlerCode(() => bereiteOriginalVor(db, "upload:" + "0".repeat(32), "x.pdf", 10))) === "keinDokument");
    pruefe("Vorbereiten: Skript-Quelle ergibt keinUpload", (await fehlerCode(() => bereiteOriginalVor(db, "legal/Legal/x.md", "x.pdf", 10))) === "keinUpload");
    pruefe("Vorbereiten: keine PDF oder zu groß ergibt ungueltig", (await fehlerCode(() => bereiteOriginalVor(db, quelleId, "x.txt", 10))) === "ungueltig" && (await fehlerCode(() => bereiteOriginalVor(db, quelleId, "x.pdf", GIB + 1))) === "ungueltig");
    pruefe("Bestätigen ohne hochgeladene Datei ergibt nichtDa", (await fehlerCode(() => bestaetigeOriginal(db, quelleId, "x.pdf", ADMIN))) === "nichtDa");

    const vor = await bereiteOriginalVor(db, quelleId, "Original Testbuch.pdf", PDF.length);
    pruefe("Vorbereiten: liefert Pfad und Bucket (kein Token mehr: der Browser lädt mit seiner Sitzung)", vor.pfad === originalPfad(quelleId) && vor.bucket === bucketName && !("token" in vor));

    // Wer nicht Administration ist, darf nichts schreiben (Policy auf storage.objects)
    const kundeFehler = await tus(PDF, kundeToken, vor.pfad).then(() => null, (e: unknown) => e);
    pruefe("Schutz: ein Kunde kann nicht hochladen (Policy nur für die Administration)", kundeFehler !== null, String((kundeFehler as Error | null)?.message ?? "").slice(0, 120));
    const anonFehler = await tus(PDF, anonKey!, vor.pfad).then(() => null, (e: unknown) => e);
    pruefe("Schutz: ohne Anmeldung (nur der anonyme Schlüssel) kann niemand hochladen", anonFehler !== null);
    pruefe("Schutz: die abgelehnten Versuche haben keine Datei hinterlassen", ((await dienst.storage.from(bucketName).list("", { search: vor.pfad })).data ?? []).every((x) => x.name !== vor.pfad));

    // Die Administration lädt hoch, wie der Browser: in Stücken, mit Fortschritt
    const prozente: number[] = [];
    await tus(PDF, adminToken, vor.pfad, (p) => prozente.push(p));
    pruefe("Hochladen mit der Sitzung der Administration gelingt, der Fortschritt endet bei 100", prozente.length > 0 && prozente[prozente.length - 1] === 100, prozente.join(","));
    const best = await bestaetigeOriginal(db, quelleId, "Original Testbuch.pdf", ADMIN);
    pruefe("Bestätigen: Größe stimmt, Verweis liegt in wissen_original", best.groesse === PDF.length && ((await dienst.from("wissen_original").select("quelle_id, dateiname, groesse, abgelegt_von").eq("quelle_id", quelleId)).data ?? []).length === 1);
    const liste = (await dienst.rpc("wissen_liste")).data as WissenListeZeile[];
    const zeile = gruppiereWissenDokumente(liste).find((x) => x.schluessel === quelleId);
    pruefe("Liste: wissen_liste() zeigt die Größe des Originals (originalGroesse)", zeile?.originalGroesse === PDF.length, String(zeile?.originalGroesse));

    // ---- Öffnen ---------------------------------------------------------------------------------------------------------------------------
    const adr = await originalAdresse(db, quelleId);
    const antwort = await fetch(adr.url);
    const gelesen = new Uint8Array(await antwort.arrayBuffer());
    pruefe("Öffnen: die signierte Adresse liefert genau die abgelegten Bytes", antwort.ok && gelesen.length === PDF.length && gelesen.every((b, i) => b === PDF[i]), `status ${antwort.status}`);
    pruefe("Öffnen: Dateiname und Größe stimmen", adr.dateiname === "Original Testbuch.pdf" && adr.groesse === PDF.length);
    const ohneAnmeldung = await fetch(`${url}/storage/v1/object/${bucketName}/${vor.pfad}`);
    pruefe("Schutz: ohne signierte Adresse ist die Datei nicht abrufbar", !ohneAnmeldung.ok, `status ${ohneAnmeldung.status}`);
    const adminLesen = await fetch(`${url}/storage/v1/object/authenticated/${bucketName}/${vor.pfad}`, { headers: { authorization: `Bearer ${adminToken}`, apikey: anonKey! } });
    pruefe("Schutz: auch die angemeldete Administration liest nicht direkt (nur über die Adresse des Servers)", !adminLesen.ok, `status ${adminLesen.status}`);
    const anonAdresse = await anon.storage.from(bucketName).createSignedUrl(vor.pfad, 60);
    pruefe("Schutz: ein anonymer Aufruf bekommt keine Adresse", anonAdresse.error !== null || !anonAdresse.data);
    const anonListe = await anon.storage.from(bucketName).list("");
    pruefe("Schutz: ein anonymer Aufruf sieht keine Dateien im Bucket", (anonListe.data ?? []).length === 0);
    pruefe("Öffnen: ohne Verweis ergibt nichtDa", (await fehlerCode(() => originalAdresse(db, "upload:" + "1".repeat(32)))) === "nichtDa");

    // ---- Erneutes Vorbereiten ersetzt die alte Datei ----------------------------------------------------------------------------------------
    const neuVor = await bereiteOriginalVor(db, quelleId, "Original Testbuch.pdf", PDF.length);
    pruefe("Erneutes Vorbereiten räumt die alte Datei und den Verweis weg (der Upload beginnt sauber)", neuVor.pfad === vor.pfad && ((await dienst.storage.from(bucketName).list("", { search: vor.pfad })).data ?? []).every((x) => x.name !== vor.pfad) && ((await dienst.from("wissen_original").select("quelle_id").eq("quelle_id", quelleId)).data ?? []).length === 0);

    // ---- Mehrere Stücke: 14 MB sind drei Stücke zu 6 MB --------------------------------------------------------------------------------------
    const gross = Buffer.alloc(14 * 1024 * 1024);
    for (let i = 0; i < gross.length; i += 4096) gross[i] = (i / 4096) % 251;
    gross.write("%PDF-1.4\n", 0);
    const grossProzent: number[] = [];
    await tus(gross, adminToken, neuVor.pfad, (p) => grossProzent.push(p));
    pruefe("Mehrere Stücke: 14 MB werden in Stücken übertragen (Fortschritt steigt in Schritten bis 100)", grossProzent.length >= 3 && grossProzent[grossProzent.length - 1] === 100 && grossProzent.some((p) => p > 0 && p < 100), grossProzent.join(","));
    const grossBest = await bestaetigeOriginal(db, quelleId, "gross.pdf", ADMIN);
    pruefe("Mehrere Stücke: die Größe im Speicher ist genau die der Datei", grossBest.groesse === gross.length, String(grossBest.groesse));
    const grossAdr = await originalAdresse(db, quelleId);
    const grossAntwort = Buffer.from(await (await fetch(grossAdr.url)).arrayBuffer());
    pruefe("Mehrere Stücke: der Inhalt kommt unverändert zurück", grossAntwort.length === gross.length && grossAntwort.equals(gross));

    // ---- Obergrenze für alle wartenden Originale -----------------------------------------------------------------------------------------
    await dienst.from("wissen_original").insert({ quelle_id: FALSCH, pfad: "f.pdf", dateiname: "fremd.pdf", groesse: 49 * GIB + GIB / 2, abgelegt_von: ADMIN });
    const platz = await pruefeOriginalPlatz(db, GIB);
    pruefe("Platz: 49,5 GiB wartend plus 1 GiB neu überschreiten die Obergrenze", !platz.passt && Math.abs(platz.wartend - (49 * GIB + GIB / 2 + gross.length)) < 1, JSON.stringify(platz));
    pruefe("Platz: bereiteOriginalVor lehnt dann mit zuVoll ab, nichts wird angelegt", (await fehlerCode(() => bereiteOriginalVor(db, quelleId, "noch-eins.pdf", GIB))) === "zuVoll");
    pruefe("Platz: das Ersetzen des eigenen Originals zählt nicht doppelt", pruefePlatz(49 * GIB + GIB / 2, 100).passt);
    await dienst.from("wissen_original").delete().eq("quelle_id", FALSCH);
    pruefe("Platz: nach dem Entfernen der Fremdlast passt es wieder", (await pruefeOriginalPlatz(db, GIB)).passt);

    // ---- Entfernen (Freigabe/Ablehnung/Löschen) -----------------------------------------------------------------------------------------
    await entferneOriginal(db, quelleId);
    const nach = await dienst.storage.from(bucketName).list("", { search: vor.pfad });
    pruefe("Entfernen: Datei und Verweis sind weg", (nach.data ?? []).every((x) => x.name !== vor.pfad) && ((await dienst.from("wissen_original").select("quelle_id").eq("quelle_id", quelleId)).data ?? []).length === 0);
    await entferneOriginal(db, quelleId);
    pruefe("Entfernen: wiederholbar, ohne Fehler", true);

    // Löschen eines Uploads nimmt das Original mit
    const hoch2 = await bereiteOriginalVor(db, quelleId, "x.pdf", PDF.length);
    await tus(PDF, adminToken, hoch2.pfad);
    await bestaetigeOriginal(db, quelleId, "x.pdf", ADMIN);
    await loescheHochgeladenesDokument(quelleId, { speicher, umgebung: {}, schema: "public" });
    const nach2 = await dienst.storage.from(bucketName).list("", { search: hoch2.pfad });
    pruefe("Löschen des Uploads entfernt auch Datei und Verweis", (nach2.data ?? []).every((x) => x.name !== hoch2.pfad) && ((await dienst.from("wissen_original").select("quelle_id").eq("quelle_id", quelleId)).data ?? []).length === 0);
  } finally {
    await aufraeumen();
  }

  console.log(`\n${gesamt - fehlerAnzahl}/${gesamt} bestanden`);
  process.exit(fehlerAnzahl > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
