// =============================================================================
// Damicon - Wissens-Upload gegen ECHTES Postgres (Adapter, Vier-Augen-Pruefung, Loeschen, RLS, Suche)
// =============================================================================
// Ausfuehren:  npm run test:wissen-db   (laeuft nach wissen-pgvector.mjs)
//        oder: npx tsx --env-file=.env.local supabase/tests/wissen-upload-db.ts
// Voraussetzung: laufende LOKALE Supabase-Instanz mit allen Migrationen und Demo-Zugaengen (npm run db:seed-auth).
//
// Warum es diesen Test gibt: supabase/tests/wissen-upload.ts prueft die Logik gegen einen Speicher im Arbeitsspeicher.
// Die riskantesten Stellen sind aber der Adapter (src/lib/wissen/speicher-supabase.ts) und die Datenbank selbst:
// PostgREST-Filter auf extra->>quelle, LIKE auf quelle_id, DELETE ... RETURNING, die Zeilensicherheit (ungepruefte Zeilen
// sieht niemand), der Waechter fuer das Vier-Augen-Prinzip (Trigger wissen_pruefung_wache) und die Suchfunktion. Das laesst
// sich nur gegen Postgres beweisen. Die Einbettung ist synthetisch (1024 Dimensionen, deterministisch), der Rest ist echt.
//
// Sicherheitsnetz: Der Test laeuft nur gegen eine lokale Datenbank, fasst nur Zeilen an, die er selbst anlegt
// (eigene quelle_id, eigene Fantasiewoerter), und raeumt am Ende auf. Er vergleicht wissen_begriffe vor und nach dem
// Upload-Loesch-Kreislauf Wort fuer Wort.
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DB_OPTION } from "@/lib/supabase/schema";
import { gruppiereWissenDokumente, LISTE_SPALTEN, type WissenListeZeile } from "@/lib/wissen/dokumente-liste";
import type { Einbettung } from "@/lib/wissen/embed";
import { entscheideUeberUpload } from "@/lib/wissen/freigabe";
import { UploadFehler, verarbeiteUpload, type UploadEingabe, type WissenSpeicher } from "@/lib/wissen/hochladen";
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import { alsSparsevec, idf, sparseDokument, sparseIndex, sparseFrage, sparsevecIndizes, tokens, zaehleWoerter } from "@/lib/wissen/sparse";
import { supabaseSpeicher } from "@/lib/wissen/speicher-supabase";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Fehlende Env-Variablen. Aufruf: npx tsx --env-file=.env.local supabase/tests/wissen-upload-db.ts");
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
async function alsNutzer(kurz: string): Promise<SupabaseClient> {
  const c = createClient(url!, anonKey!, { auth: { persistSession: false }, db: DB_OPTION });
  const { error } = await c.auth.signInWithPassword({ email: `${kurz}@damicon.demo`, password: "DamiconDemo2026!" });
  if (error) throw new Error(`Anmeldung ${kurz}: ${error.message}`);
  return c;
}

// ---- Testdaten: Fantasiewoerter, die im echten Korpus nicht vorkommen (sechs Zeichen nach dem Kuerzen) -------
const W = { alpha: "qxzval", beta: "qxzbet", gamma: "qxzgam", delta: "qxzdel", eps: "qxzeps" };
const MEINE_HASHES = Object.values(W).map((w) => sparseIndex(sparseDokument(w).indices[0]!));
const SKRIPT_QUELLE = "test-wissen-upload-db/skript.md";
const FALSCH_UPLOAD_OHNE_MARKER = `upload:${"0".repeat(31)}1`; // sieht aus wie ein Upload, traegt aber extra.quelle nicht
const FALSCH_MARKER_OHNE_PRAEFIX = "test-wissen-upload-db/gefaelscht.md"; // extra.quelle = upload, aber Pfad statt upload:...
const DIM = 1024;

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** Deterministische Einbettung: Woerter fallen in 1024 Faecher, danach normiert. Gleiche Woerter = aehnliche Vektoren. */
function vektorVon(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  for (const t of tokens(text)) v[hash32(t) % DIM]! += 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
const einbettung: Einbettung = {
  modell: "synthetisch-bge-m3",
  dimension: DIM,
  async einbetten(texte) {
    return texte.map(vektorVon);
  },
};
const bytes = (s: string) => new TextEncoder().encode(s);

// Die zwei Personen des Vier-Augen-Prinzips sind echte Profile (geprueft_von verweist per Fremdschluessel auf profiles.id).
let ADMIN_ID = "";
let CEO_ID = "";
const eingabe = (o: Partial<UploadEingabe> & { text: string }): UploadEingabe => ({
  titel: "Testkodex Db",
  bereich: "recht",
  quellenart: "fachliteratur",
  rollen: ["buchhaltung"],
  dateiname: "testkodex.txt",
  bytes: bytes(o.text),
  hochgeladenVon: { id: ADMIN_ID, name: "Test Admin" },
  ...o,
});
const fehlerCode = async (f: () => Promise<unknown>) => {
  try {
    await f();
    return "kein-fehler";
  } catch (e) {
    return e instanceof UploadFehler ? e.code : `andere:${e instanceof Error ? e.message : String(e)}`;
  }
};

async function begriffeAbbild(): Promise<string> {
  // Alle Woerter der Tabelle (nicht nur meine): der Kreislauf darf nirgends etwas veraendern.
  const aus: Array<[number, number, number]> = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await dienst.from("wissen_begriffe").select("hash, df, idf").order("hash").range(von, von + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { hash: number; df: number; idf: number }[]) aus.push([r.hash, r.df, r.idf]);
    if (!data || data.length < 1000) break;
  }
  return JSON.stringify(aus);
}
interface Zeile {
  id: string;
  quelle_id: string;
  titel: string;
  bereich: string;
  rollen: string[];
  autoritaetsstufe: number | null;
  extra: Record<string, unknown>;
  sparse: string;
  dense: string;
  text: string;
  quellenart: string | null;
  textgrundlage: string | null;
  pruefstatus: string;
  pruefen_bis: string | null;
  geprueft_von: string | null;
  geprueft_am: string | null;
  url: string | null;
}
async function zeilenVon(quelleId: string): Promise<Zeile[]> {
  const { data, error } = await dienst
    .from("wissen_chunks")
    .select("id, quelle_id, titel, bereich, rollen, autoritaetsstufe, extra, sparse, dense, text, quellenart, textgrundlage, pruefstatus, pruefen_bis, geprueft_von, geprueft_am, url")
    .eq("quelle_id", quelleId)
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Zeile[];
}

const meineQuellen: string[] = [SKRIPT_QUELLE, FALSCH_UPLOAD_OHNE_MARKER, FALSCH_MARKER_OHNE_PRAEFIX];
async function aufraeumen() {
  for (const q of meineQuellen) {
    const { error } = await dienst.from("wissen_chunks").delete().eq("quelle_id", q);
    if (error) throw new Error(`Aufraeumen ${q}: ${error.message}`);
  }
  const { error } = await dienst.from("wissen_begriffe").delete().in("hash", MEINE_HASHES);
  if (error) throw new Error(`Aufraeumen Begriffe: ${error.message}`);
}

/** Eine Vorbestandszeile (wie vom ETL): eigener Text, eigene Vektoren, eigene Kennung. */
function vorbestandZeile(id: string, quelleId: string, text: string, extra: Record<string, unknown>, pruefstatus = "freigegeben") {
  return {
    id,
    chunk_id: quelleId,
    quelle_id: quelleId,
    sprache: "de",
    titel: `Vorbestand ${id.slice(-4)}`,
    pfad: quelleId,
    bereich: "legal",
    teil: 1,
    teile: 1,
    kontext: null,
    text,
    rollen: ["admin", "ceo", "betriebsleitung", "buchhaltung"],
    eingelesen_am: "2026-10-01T00:00:00.000Z",
    embed_modell: "synthetisch-bge-m3",
    extra,
    pruefstatus,
    dense: `[${vektorVon(text).join(",")}]`,
    sparse: alsSparsevec(sparseDokument(text)),
  };
}

async function main() {
  await aufraeumen(); // Reste eines frueheren Abbruchs
  const { data: profile, error: profilFehler } = await dienst.from("profiles").select("id, email").in("email", ["admin@damicon.demo", "ceo@damicon.demo"]);
  if (profilFehler || (profile ?? []).length !== 2) throw new Error("Demo-Zugaenge fehlen (npm run db:seed-auth)");
  ADMIN_ID = (profile as { id: string; email: string }[]).find((p) => p.email === "admin@damicon.demo")!.id;
  CEO_ID = (profile as { id: string; email: string }[]).find((p) => p.email === "ceo@damicon.demo")!.id;

  const speicher: WissenSpeicher = supabaseSpeicher(dienst);
  const d = { speicher, einbettung, jetzt: () => new Date("2026-10-07T10:00:00.000Z"), umgebung: {}, schema: "public" };
  const zweite = { speicher, pruefer: { id: CEO_ID }, umgebung: {}, schema: "public" };

  try {
    // ---- 0. Vorbestand ---------------------------------------------------------------------------
    const vorbestand = [
      vorbestandZeile("00000000-0000-4000-8000-0000000d0001", SKRIPT_QUELLE, `${W.alpha} ${W.beta}`, {}),
      // Fallen: sehen aus wie Uploads, sind aber keine. Nichts davon darf je geloescht oder freigegeben werden.
      vorbestandZeile("00000000-0000-4000-8000-0000000d0002", FALSCH_UPLOAD_OHNE_MARKER, `${W.beta} ${W.delta}`, {}),
      // Ein Upload-Marker beginnt (Waechter der Datenbank) immer ungeprueft.
      vorbestandZeile("00000000-0000-4000-8000-0000000d0003", FALSCH_MARKER_OHNE_PRAEFIX, `${W.alpha} ${W.delta}`, { quelle: "upload" }, "ungeprueft"),
    ];
    {
      const { error } = await dienst.from("wissen_chunks").insert(vorbestand);
      if (error) throw new Error(`Vorbestand: ${error.message}`);
    }
    // Wortgewichte des Vorbestands wie nach einem ETL-Lauf: N = alle Zeilen der Tabelle (auch fremde), df nur meine Woerter.
    // Die Vorbestandstexte bestehen NUR aus Fantasiewoertern: so schreibt und loescht der Test keine Gewichte echter Woerter.
    const n0 = await speicher.zaehleChunks();
    const df0 = zaehleWoerter(vorbestand.map((z) => sparsevecIndizes(z.sparse)));
    await speicher.schreibeBegriffe([...df0].map(([hash, df]) => ({ hash, df, idf: idf(n0, df) })));
    const vorher = await begriffeAbbild();
    const dfMeine = () => speicher.leseDokumenthaeufigkeit(MEINE_HASHES);
    const idxAlpha = sparseIndex(sparseDokument(W.alpha).indices[0]!);
    const idxGamma = sparseIndex(sparseDokument(W.gamma).indices[0]!);
    pruefe("Vorbestand: drei Zeilen und die Wortgewichte stehen in der Datenbank", (await zeilenVon(SKRIPT_QUELLE)).length === 1 && (await dfMeine()).get(idxAlpha) === 2);
    pruefe("Migration: Bestand ohne Angabe ist freigegeben, ohne Quellenart und ohne Wiedervorlage", (await zeilenVon(SKRIPT_QUELLE))[0]!.pruefstatus === "freigegeben" && (await zeilenVon(SKRIPT_QUELLE))[0]!.quellenart === null && (await zeilenVon(SKRIPT_QUELLE))[0]!.pruefen_bis === null);

    // ---- 1. Upload mit dem echten Adapter ------------------------------------------------------------
    const text1 = `Erster Absatz mit ${W.alpha} und ${W.gamma} als Kennung.\n\nZweiter Absatz: ${W.gamma} ${W.eps} Frist dreissig Tage.`;
    const erg = await verarbeiteUpload(eingabe({ text: text1, rollen: ["buchhaltung", "kunde", "ceo"] }), d);
    meineQuellen.push(erg.quelleId);
    const zeilen = await zeilenVon(erg.quelleId);
    pruefe("Upload: alle Abschnitte stehen in wissen_chunks", zeilen.length === erg.chunks && erg.chunks >= 1, `chunks=${erg.chunks}`);
    pruefe("Upload: bereich = legal (Recht), Marker extra.quelle = upload, quelle_id = upload:<32 Hex>", zeilen.every((z) => z.bereich === "legal" && z.extra.quelle === "upload" && /^upload:[0-9a-f]{32}$/.test(z.quelle_id)));
    pruefe("Upload: Rollen nur Buero (kunde verworfen), Admin immer dabei, feste Reihenfolge", zeilen.every((z) => z.rollen.join() === "admin,ceo,buchhaltung"), zeilen[0]?.rollen.join());
    pruefe("Upload: Titel, Hochgeladen von (Name und profiles.id) und Dateiname stehen in extra", zeilen.every((z) => z.titel === "Testkodex Db" && z.extra.hochgeladen_von_name === "Test Admin" && z.extra.hochgeladen_von === ADMIN_ID && z.extra.dateiname === "testkodex.txt"));
    pruefe("Upload: Quellenart Fachliteratur, Textgrundlage original, Stufe 4 (aus der Quellenart)", zeilen.every((z) => z.quellenart === "fachliteratur" && z.textgrundlage === "original" && z.autoritaetsstufe === 4));
    pruefe("Upload: beginnt UNGEPRUEFT, ohne Pruefer und ohne Wiedervorlage", zeilen.every((z) => z.pruefstatus === "ungeprueft" && z.geprueft_von === null && z.geprueft_am === null && z.pruefen_bis === null));
    pruefe("Upload: dichter Vektor hat 1024 Dimensionen, sparsevec ist lesbar", zeilen.every((z) => String(z.dense).split(",").length === DIM && sparsevecIndizes(z.sparse).length > 0));
    const dfNach = await dfMeine();
    const nNach = await speicher.zaehleChunks();
    const mitWort = (idx: number) => zeilen.filter((z) => sparsevecIndizes(z.sparse).includes(idx)).length;
    pruefe("Wortgewichte: df der geteilten Woerter steigt um die Textstellen des Uploads (Vorbestand 2), neue Woerter beginnen bei der Zahl ihrer Textstellen", dfNach.get(idxAlpha) === 2 + mitWort(idxAlpha) && dfNach.get(idxGamma) === mitWort(idxGamma) && mitWort(idxGamma) >= 1, `alpha=${dfNach.get(idxAlpha)} gamma=${dfNach.get(idxGamma)} chunks=${erg.chunks}`);
    const { data: begr } = await dienst.from("wissen_begriffe").select("hash, df, idf").in("hash", [idxAlpha, idxGamma]);
    pruefe("Wortgewichte: idf passt zum neuen N (Zeilen der Tabelle)", ((begr ?? []) as { hash: number; df: number; idf: number }[]).every((b) => Math.abs(b.idf - idf(nNach, b.df)) < 1e-4));

    // ---- 2. Dublette (echte findeQuelle) ---------------------------------------------------------------
    pruefe("Dublette: derselbe Inhalt wird abgelehnt, andere Zeilenenden zaehlen nicht", (await fehlerCode(() => verarbeiteUpload(eingabe({ text: text1.replace(/\n/g, "\r\n") }), d))) === "doppelt");

    // ---- 3. Quarantaene: ein ungeprueftes Dokument sieht niemand ----------------------------------------
    const admin = await alsNutzer("admin");
    const buchhaltung = await alsNutzer("buchhaltung");
    const ceo = await alsNutzer("ceo");
    const sichtbar = async (c: SupabaseClient, quelle: string) => ((await c.from("wissen_chunks").select("id").eq("quelle_id", quelle)).data ?? []).length;
    pruefe("Quarantaene (RLS): ein angemeldeter Admin, die Buchhaltung und der CEO sehen die ungepruefte Zeile NICHT, der Dienst schon", (await sichtbar(admin, erg.quelleId)) === 0 && (await sichtbar(buchhaltung, erg.quelleId)) === 0 && (await sichtbar(ceo, erg.quelleId)) === 0 && (await zeilenVon(erg.quelleId)).length === erg.chunks);
    const frage = `Frist ${W.gamma} ${W.eps} dreissig Tage`;
    const fragen = [{ dense: vektorVon(frage), begriffe: sparseFrage(frage).indices.map(sparseIndex) }];
    const suche = async (c: SupabaseClient) => {
      const r = await c.rpc("wissen_suche", { p_fragen: fragen, p_limit: 8, p_kandidaten: 40 });
      if (r.error) return [] as Array<string | undefined>; // fremde Rollen: Fehler oder leer, beides heisst: nichts gefunden
      return ((r.data ?? []) as Array<{ payload: { titel?: string } }>).map((x) => x.payload.titel);
    };
    pruefe("Quarantaene (Suche): weder der Admin noch die Buchhaltung finden sie, und auch der Dienst-Schluessel (RLS umgangen) nicht: die Funktion filtert selbst", !(await suche(admin)).includes("Testkodex Db") && !(await suche(buchhaltung)).includes("Testkodex Db") && !(await suche(dienst as unknown as SupabaseClient)).includes("Testkodex Db"));

    // ---- 4. Vier-Augen-Prinzip: Anwendung und Waechter der Datenbank -------------------------------------
    pruefe("Vier-Augen (Anwendung): die hochladende Person kann nicht freigeben -> selbstFreigabe, nichts aendert sich", (await fehlerCode(() => entscheideUeberUpload("freigeben", erg.quelleId, { ...zweite, pruefer: { id: ADMIN_ID } }))) === "selbstFreigabe" && (await zeilenVon(erg.quelleId)).every((z) => z.pruefstatus === "ungeprueft"));
    const jetztIso = new Date().toISOString();
    const roh = (aenderung: Record<string, unknown>) => dienst.from("wissen_chunks").update(aenderung).eq("quelle_id", erg.quelleId).select("id");
    const e1 = await roh({ pruefstatus: "freigegeben", geprueft_von: ADMIN_ID, geprueft_am: jetztIso });
    pruefe("Vier-Augen (Waechter): selbst direkt in der Datenbank lehnt der Trigger die Freigabe durch die hochladende Person ab", !!e1.error && /Vier-Augen-Prinzip/.test(e1.error.message) && (await zeilenVon(erg.quelleId)).every((z) => z.pruefstatus === "ungeprueft"), e1.error?.message);
    const e2 = await roh({ pruefstatus: "freigegeben" });
    pruefe("Vier-Augen (Waechter): eine Freigabe ohne geprueft_von und geprueft_am wird abgelehnt", !!e2.error && /geprueft_von/.test(e2.error.message));
    const e3 = await dienst.from("wissen_chunks").insert({ ...vorbestandZeile("00000000-0000-4000-8000-0000000d0004", FALSCH_MARKER_OHNE_PRAEFIX, "Eingeschmuggelt", { quelle: "upload" }, "freigegeben") });
    pruefe("Vier-Augen (Waechter): ein Upload-Marker mit Status freigegeben kann gar nicht angelegt werden (Uploads beginnen ungeprueft)", !!e3.error && /beginnt immer ungeprueft/.test(e3.error.message), e3.error?.message);
    const e4 = await dienst.from("wissen_chunks").update({ pruefstatus: "gibtsnicht" }).eq("quelle_id", erg.quelleId).select("id");
    pruefe("Status ist ein geschlossener Satz (CHECK): unbekannte Werte werden abgelehnt", !!e4.error);

    // Freigabe durch eine zweite Person mit dem echten Adapter
    const frei = await entscheideUeberUpload("freigeben", erg.quelleId, zweite);
    const nachFreigabe = await zeilenVon(erg.quelleId);
    pruefe("Freigabe durch den CEO (zweite Person): alle Abschnitte freigegeben, geprueft_von und geprueft_am gesetzt, Fachliteratur ohne Wiedervorlage", frei.abschnitte === erg.chunks && nachFreigabe.every((z) => z.pruefstatus === "freigegeben" && z.geprueft_von === CEO_ID && !!z.geprueft_am && z.pruefen_bis === null));
    pruefe("Entschieden ist entschieden: eine zweite Freigabe -> nichtPruefbar; der Waechter lehnt jede Rueckkehr zu ungeprueft ab", (await fehlerCode(() => entscheideUeberUpload("freigeben", erg.quelleId, zweite))) === "nichtPruefbar" && !!(await roh({ pruefstatus: "ungeprueft" })).error && !!(await roh({ pruefstatus: "abgelehnt" })).error);

    // ---- 5. Sichtbarkeit nach der Freigabe (echte Sitzungen: RLS und Spaltenalias) -------------------------
    const { data: liste, error: listeFehler } = await dienst.from("wissen_chunks").select(LISTE_SPALTEN).in("quelle_id", meineQuellen).order("id");
    const gruppen = gruppiereWissenDokumente((liste ?? []) as unknown as WissenListeZeile[]);
    const meinUpload = gruppen.find((g) => g.schluessel === erg.quelleId);
    pruefe("Liste: die Abfrage mit den Aliasen (extra->>quelle, extra->>hochgeladen_von) laeuft gegen echtes PostgREST", !listeFehler && gruppen.length === 4, listeFehler?.message ?? `gruppen=${gruppen.length}`);
    pruefe("Liste: der Upload ist herkunft=upload, loeschbar, freigegeben, mit Quellenart, Stufe, Zahl der Abschnitte, Hochladendem (Name und id)", !!meinUpload && meinUpload.herkunft === "upload" && meinUpload.loeschbar && meinUpload.pruefstatus === "freigegeben" && meinUpload.quellenart === "fachliteratur" && meinUpload.stufe === 4 && meinUpload.chunks === erg.chunks && meinUpload.hochgeladenVon === "Test Admin" && meinUpload.hochgeladenVonId === ADMIN_ID);
    const skriptGruppe = gruppen.find((g) => g.schluessel === SKRIPT_QUELLE);
    pruefe("Liste: das Skript-Dokument ist herkunft=skript und NICHT loeschbar", !!skriptGruppe && skriptGruppe.herkunft === "skript" && !skriptGruppe.loeschbar);
    pruefe("Liste: die Falle ohne Marker ist nicht loeschbar, die Falle mit Marker (ungeprueft) ebenfalls nicht", gruppen.find((g) => g.schluessel === FALSCH_UPLOAD_OHNE_MARKER)?.loeschbar === false && gruppen.find((g) => g.schluessel === FALSCH_MARKER_OHNE_PRAEFIX)?.loeschbar === false);
    const sicht = async (kurz: string) => sichtbar(await alsNutzer(kurz), erg.quelleId);
    pruefe("RLS nach der Freigabe: Admin, Buchhaltung und CEO (in rollen) sehen den Upload", (await sicht("admin")) === erg.chunks && (await sicht("buchhaltung")) === erg.chunks && (await sicht("ceo")) === erg.chunks);
    pruefe("RLS nach der Freigabe: Betriebsleitung (nicht in rollen), Kunde und Erzeuger sehen ihn nicht", (await sicht("leitung")) === 0 && (await sicht("kunde")) === 0 && (await sicht("erzeuger")) === 0);
    const { error: direktLoeschen, data: direktDaten } = await admin.from("wissen_chunks").delete().eq("quelle_id", erg.quelleId).select("id");
    pruefe("RLS: ein angemeldeter Admin darf NICHT direkt loeschen (nur der Dienst)", (direktDaten ?? []).length === 0 && (await zeilenVon(erg.quelleId)).length === erg.chunks, direktLoeschen?.message ?? "keine Zeile betroffen");

    // ---- 6. Suche findet den freigegebenen Upload (dicht + Woerter), mit Typisierung im Payload -----------
    pruefe("Suche: der Admin findet den freigegebenen Abschnitt", (await suche(admin)).includes("Testkodex Db"));
    const treffer = await admin.rpc("wissen_suche", { p_fragen: fragen, p_limit: 8, p_kandidaten: 40 });
    const payload = ((treffer.data ?? []) as Array<{ payload: Record<string, unknown> }>).find((x) => x.payload.titel === "Testkodex Db")?.payload;
    pruefe("Suche: der Payload traegt Quellenart, Textgrundlage, Pruefstatus und Stufe (Grundlage fuer die Einordnung des Assistenten)", payload?.quellenart === "fachliteratur" && payload?.textgrundlage === "original" && payload?.pruefstatus === "freigegeben" && payload?.autoritaetsstufe === 4);
    pruefe("Suche: Betriebsleitung und Kunde finden ihn nicht (Rolle nicht in rollen)", !(await suche(await alsNutzer("leitung"))).includes("Testkodex Db") && !(await suche(await alsNutzer("kunde"))).includes("Testkodex Db"));

    // ---- 7. Loeschen: nichts anderes als ein echter Upload ---------------------------------------------
    const nachUpload = await begriffeAbbild();
    const fallen = [
      ["Skript-Dokument (Pfad als quelle_id)", SKRIPT_QUELLE],
      ["Falle ohne Marker (upload:-Kennung)", FALSCH_UPLOAD_OHNE_MARKER],
      ["Falle mit Marker, aber Pfad statt upload:", FALSCH_MARKER_OHNE_PRAEFIX],
    ] as const;
    for (const [name, q] of fallen) {
      const code = await fehlerCode(() => loescheHochgeladenesDokument(q, { speicher, umgebung: {}, schema: "public" }));
      pruefe(`Loeschen: ${name} wird abgelehnt`, code === "nichtLoeschbar", code);
      pruefe(`Loeschen: ${name} ist unveraendert da`, (await zeilenVon(q)).length === 1);
      const fcode = await fehlerCode(() => entscheideUeberUpload("freigeben", q, zweite));
      pruefe(`Freigeben: ${name} wird abgelehnt (nicht freigebbar)`, fcode === "nichtFreigebbar" || fcode === "nichtGefunden", fcode);
    }
    // Der Adapter selbst (DB-Anweisung): auch ohne die Vorpruefung aendert er keine Falle
    const rohA = await speicher.loescheUpload(FALSCH_UPLOAD_OHNE_MARKER);
    const rohB = await speicher.loescheUpload(FALSCH_MARKER_OHNE_PRAEFIX);
    const rohC = await speicher.loescheUpload(SKRIPT_QUELLE);
    pruefe("Loeschen/DB-Filter: die DELETE-Anweisung selbst loescht keine der drei Fallen (LIKE und extra->>quelle greifen)", rohA.length === 0 && rohB.length === 0 && rohC.length === 0 && (await zeilenVon(FALSCH_UPLOAD_OHNE_MARKER)).length === 1 && (await zeilenVon(FALSCH_MARKER_OHNE_PRAEFIX)).length === 1 && (await zeilenVon(SKRIPT_QUELLE)).length === 1);
    const freiA = await speicher.entscheide(FALSCH_UPLOAD_OHNE_MARKER, { status: "freigegeben", pruefer: CEO_ID, zeitpunkt: jetztIso, pruefenBis: null });
    const freiB = await speicher.entscheide(SKRIPT_QUELLE, { status: "abgelehnt", pruefer: CEO_ID, zeitpunkt: jetztIso, pruefenBis: null });
    pruefe("Freigabe/DB-Filter: die UPDATE-Anweisung selbst aendert weder die Falle ohne Marker noch ein Skript-Dokument", freiA === 0 && freiB === 0 && (await zeilenVon(SKRIPT_QUELLE))[0]!.pruefstatus === "freigegeben");
    pruefe("Loeschen: die Wortgewichte blieben bei all diesen Versuchen unberuehrt", (await begriffeAbbild()) === nachUpload);

    // Doppelklick: zwei Loeschungen gleichzeitig
    const [l1, l2] = await Promise.all([
      loescheHochgeladenesDokument(erg.quelleId, { speicher, umgebung: {}, schema: "public" }),
      loescheHochgeladenesDokument(erg.quelleId, { speicher, umgebung: {}, schema: "public" }),
    ]);
    const geloescht = [l1, l2].filter((x) => !x.schonWeg);
    pruefe("Loeschen/Doppelklick: genau EIN Aufruf loescht (RETURNING), der andere meldet schon geloescht", geloescht.length === 1 && geloescht[0]!.geloescht === erg.chunks && [l1, l2].filter((x) => x.schonWeg).length === 1, `geloescht=${[l1, l2].map((x) => x.geloescht).join("/")}`);
    pruefe("Loeschen: die Zeilen des Uploads sind weg, die drei Vorbestandszeilen stehen noch", (await zeilenVon(erg.quelleId)).length === 0 && (await zeilenVon(SKRIPT_QUELLE)).length === 1);
    pruefe("Loeschen/Rundlauf: wissen_begriffe ist wieder GENAU wie vor dem Upload (alle Woerter, df und idf), auch nach dem Doppelklick", (await begriffeAbbild()) === vorher);
    const nochmal = await loescheHochgeladenesDokument(erg.quelleId, { speicher, umgebung: {}, schema: "public" });
    pruefe("Loeschen: ein weiteres Loeschen meldet schon geloescht und aendert nichts", nochmal.schonWeg && (await begriffeAbbild()) === vorher);

    // ---- 8. Fehler beim Schreiben: Aufraeumen gegen die echte Datenbank --------------------------------
    const text2 = `Dritter Text ${W.delta} ${W.eps} Rueckrollen.`;
    const kaputt: WissenSpeicher = { ...speicher, async schreibeBegriffe() { throw new Error("Begriffe nicht schreibbar (Test)"); } };
    const codeFehl = await fehlerCode(() => verarbeiteUpload(eingabe({ text: text2, titel: "Fehlschlag" }), { ...d, speicher: kaputt }));
    const { data: reste } = await dienst.from("wissen_chunks").select("id").eq("titel", "Fehlschlag");
    pruefe("Alles oder nichts: scheitern die Wortgewichte, werden die schon geschriebenen Zeilen wieder entfernt", codeFehl === "speichern" && (reste ?? []).length === 0, `code=${codeFehl} reste=${(reste ?? []).length}`);
    pruefe("Alles oder nichts: danach ist wissen_begriffe unveraendert", (await begriffeAbbild()) === vorher);

    // ---- 9. Zwei Uploads, dann beide loeschen ----------------------------------------------------------
    const a = await verarbeiteUpload(eingabe({ text: `Dokument A ${W.alpha} ${W.eps}`, titel: "Dokument A" }), d);
    meineQuellen.push(a.quelleId);
    const b = await verarbeiteUpload(eingabe({ text: `Dokument B ${W.alpha} ${W.gamma} ${W.eps}`, titel: "Dokument B" }), d);
    meineQuellen.push(b.quelleId);
    await loescheHochgeladenesDokument(a.quelleId, { speicher, umgebung: {}, schema: "public" });
    const dfNachA = await dfMeine();
    pruefe("Gestapelt: nach dem Loeschen von A zaehlt df nur noch B und den Vorbestand", dfNachA.get(idxAlpha) === 2 + 1 && dfNachA.get(idxGamma) === 1, `alpha=${dfNachA.get(idxAlpha)} gamma=${dfNachA.get(idxGamma)}`);
    await loescheHochgeladenesDokument(b.quelleId, { speicher, umgebung: {}, schema: "public" });
    const dfAlle = (s: string) => JSON.parse(s).map(([h, df]: [number, number]) => [h, df]);
    pruefe("Gestapelt: nach dem Loeschen beider ist df ueberall wie vorher (idf darf zum N dazwischen abweichen, bis der ETL laeuft)", JSON.stringify(dfAlle(await begriffeAbbild())) === JSON.stringify(dfAlle(vorher)));

    // ---- 10. Wiedervorlage: Forum im Risikomanagement ----------------------------------------------------
    const alt = () => new Date("2025-01-10T10:00:00.000Z"); // die Freigabe liegt weit zurueck, die Wiedervorlage ist damit schon abgelaufen
    const forum = await verarbeiteUpload(
      eingabe({ text: `Forumsbeitrag ${W.delta} ${W.eps} Methode Pelikan fuer Risikobewertung.`, titel: "Forum Wiedervorlage", bereich: "risiko", quellenart: "forum", url: "https://forum.beispiel.de/t/42", textgrundlage: "maschinell_uebersetzt" }),
      { ...d, jetzt: alt },
    );
    meineQuellen.push(forum.quelleId);
    const fz = await zeilenVon(forum.quelleId);
    pruefe("Forum im Risikomanagement: Stufe 5, Link und maschinelle Uebersetzung stehen in der Zeile, ungeprueft", forum.autoritaetsstufe === 5 && fz.every((z) => z.quellenart === "forum" && z.url === "https://forum.beispiel.de/t/42" && z.textgrundlage === "maschinell_uebersetzt" && z.pruefstatus === "ungeprueft"));
    pruefe("Forum im Bereich Recht wird gar nicht erst angelegt (quellenartGesperrt)", (await fehlerCode(() => verarbeiteUpload(eingabe({ text: "Forum Recht Blogeintrag Mandelbaum.", bereich: "recht", quellenart: "forum", url: "https://x.de/1" }), d))) === "quellenartGesperrt" && (await dienst.from("wissen_chunks").select("id").eq("titel", "Testkodex Db")).data?.length === 0);
    const fFrei = await entscheideUeberUpload("freigeben", forum.quelleId, { ...zweite, jetzt: alt });
    pruefe("Freigabe eines Forumsbeitrags setzt eine Wiedervorlage auf zwoelf Monate", fFrei.pruefenBis === "2026-01-10" && (await zeilenVon(forum.quelleId)).every((z) => z.pruefen_bis === "2026-01-10" && z.pruefstatus === "freigegeben"));
    const frageF = `Methode Pelikan Risikobewertung ${W.delta} ${W.eps}`;
    const fragenF = [{ dense: vektorVon(frageF), begriffe: sparseFrage(frageF).indices.map(sparseIndex) }];
    const sucheF = async (c: SupabaseClient) => ((await c.rpc("wissen_suche", { p_fragen: fragenF, p_limit: 8, p_kandidaten: 40 })).data ?? []) as Array<{ payload: { titel?: string } }>;
    pruefe("Wiedervorlage: ist sie abgelaufen, findet die Suche den Beitrag nicht mehr (auch nicht mit dem Dienst-Schluessel), obwohl er freigegeben ist", !(await sucheF(admin)).some((x) => x.payload.titel === "Forum Wiedervorlage") && !(await sucheF(dienst as unknown as SupabaseClient)).some((x) => x.payload.titel === "Forum Wiedervorlage"));
    const ablauf = gruppiereWissenDokumente(((await dienst.from("wissen_chunks").select(LISTE_SPALTEN).eq("quelle_id", forum.quelleId)).data ?? []) as unknown as WissenListeZeile[]);
    pruefe("Liste: der abgelaufene Beitrag ist als abgelaufen gekennzeichnet und als Hinweis (Forum im Risiko)", ablauf[0]?.abgelaufen === true && ablauf[0]?.nutzung === "hinweis");
    pruefe("Verlaengern durch die hochladende Person -> selbstFreigabe", (await fehlerCode(() => entscheideUeberUpload("verlaengern", forum.quelleId, { ...zweite, pruefer: { id: ADMIN_ID } }))) === "selbstFreigabe");
    const eRueck = await dienst.from("wissen_chunks").update({ pruefen_bis: "2025-06-01", geprueft_von: CEO_ID, geprueft_am: jetztIso }).eq("quelle_id", forum.quelleId).select("id");
    pruefe("Waechter: die Wiedervorlage laesst sich nur nach hinten verschieben, nicht zurueck", !!eRueck.error && /nach hinten/.test(eRueck.error.message));
    const eSelbst = await dienst.from("wissen_chunks").update({ pruefen_bis: "2030-01-01", geprueft_von: ADMIN_ID, geprueft_am: jetztIso }).eq("quelle_id", forum.quelleId).select("id");
    pruefe("Waechter: auch die Verlaengerung durch die hochladende Person lehnt die Datenbank ab", !!eSelbst.error && /Vier-Augen-Prinzip/.test(eSelbst.error.message));
    const verl = await entscheideUeberUpload("verlaengern", forum.quelleId, { ...zweite, jetzt: () => new Date("2026-10-07T10:00:00.000Z") });
    pruefe("Verlaengern durch eine zweite Person: neue Wiedervorlage in zwoelf Monaten, wieder durchsuchbar", verl.pruefenBis === "2027-10-07" && (await sucheF(admin)).some((x) => x.payload.titel === "Forum Wiedervorlage"));
    await loescheHochgeladenesDokument(forum.quelleId, { speicher, umgebung: {}, schema: "public" });
    pruefe("Aufraeumen: nach dem Loeschen der Forumsdatei sind die Wortgewichte wieder wie vorher", (await begriffeAbbild()) === vorher);

    // ---- 11. Ablehnen und Zurueckziehen ---------------------------------------------------------------
    const abg = await verarbeiteUpload(eingabe({ text: `Abzulehnen ${W.beta} Kastanie.`, titel: "Abgelehnt Db" }), d);
    meineQuellen.push(abg.quelleId);
    await entscheideUeberUpload("ablehnen", abg.quelleId, zweite);
    pruefe("Ablehnen: Status abgelehnt, weiter unsichtbar, eine spaetere Freigabe ist ausgeschlossen (Waechter und Anwendung)", (await zeilenVon(abg.quelleId)).every((z) => z.pruefstatus === "abgelehnt" && z.geprueft_von === CEO_ID) && (await sichtbar(admin, abg.quelleId)) === 0 && (await fehlerCode(() => entscheideUeberUpload("freigeben", abg.quelleId, zweite))) === "nichtPruefbar");
    await loescheHochgeladenesDokument(abg.quelleId, { speicher, umgebung: {}, schema: "public" });
    pruefe("Ein abgelehntes Dokument laesst sich loeschen, die Wortgewichte sind danach wieder wie vorher", (await zeilenVon(abg.quelleId)).length === 0 && (await begriffeAbbild()) === vorher);

    // ---- 12. Vorschau-Schutz gegen die echte Datenbank --------------------------------------------------
    const zeilenVorher = await zeilenVon(SKRIPT_QUELLE);
    const codeVorschau = await fehlerCode(() => verarbeiteUpload(eingabe({ text: "Darf nicht ankommen Vorschau" }), { ...d, umgebung: { VERCEL_ENV: "preview" }, schema: "public" }));
    const codeKopie = await fehlerCode(() => verarbeiteUpload(eingabe({ text: `Kopie Vorschau ${W.beta} Schema`, titel: "Kopie" }), { ...d, umgebung: { VERCEL_ENV: "preview" }, schema: "public_preview" }));
    const kopie = (await dienst.from("wissen_chunks").select("quelle_id").eq("titel", "Kopie")).data ?? [];
    if (kopie[0]) meineQuellen.push((kopie[0] as { quelle_id: string }).quelle_id);
    pruefe("Vorschau-Schutz: Vorschau mit Schema public schreibt nichts, mit Schema public_preview ist der Weg frei", codeVorschau === "vorschau" && codeKopie === "kein-fehler" && zeilenVorher.length === 1);
    if (kopie[0]) await loescheHochgeladenesDokument((kopie[0] as { quelle_id: string }).quelle_id, { speicher, umgebung: {}, schema: "public" });
    pruefe("Vorschau-Schutz: der Kopie-Upload liess sich wieder loeschen, die Wortgewichte sind wie vorher", (await begriffeAbbild()) === vorher);
  } finally {
    await aufraeumen();
    // Letzte Sicherung: auch Uploads, die waehrend eines Fehlers entstanden sind (Titel der Tests)
    for (const t of ["Testkodex Db", "Fehlschlag", "Dokument A", "Dokument B", "Kopie", "Forum Wiedervorlage", "Abgelehnt Db"]) {
      await dienst.from("wissen_chunks").delete().eq("titel", t).like("quelle_id", "upload:%").eq("extra->>hochgeladen_von_name", "Test Admin");
    }
  }

  const { data: uebrig } = await dienst.from("wissen_chunks").select("id").in("quelle_id", meineQuellen);
  const { data: uebrigB } = await dienst.from("wissen_begriffe").select("hash").in("hash", MEINE_HASHES);
  pruefe("Aufgeraeumt: keine Testzeilen und keine Testwoerter uebrig", (uebrig ?? []).length === 0 && (uebrigB ?? []).length === 0);

  console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehlerAnzahl}   fehlgeschlagen: ${fehlerAnzahl}`);
  if (fehlerAnzahl > 0) process.exit(1);
  console.log("Alle Pruefungen bestanden.");
}

main().catch(async (e) => {
  console.error(e);
  try {
    await aufraeumen();
  } catch {
    /* beim Aufraeumen nichts mehr tun */
  }
  process.exit(1);
});
