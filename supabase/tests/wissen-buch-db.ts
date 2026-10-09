// =============================================================================
// Damicon - Buch-Upload gegen ECHTES Postgres (lange Buecher, Seitengrenze von PostgREST, Unvollstaendig-Schutz, Loeschen)
// =============================================================================
// Ausfuehren:  npx tsx --env-file=.env.local supabase/tests/wissen-buch-db.ts   (npm run test:wissen-buch-db)
// Voraussetzung: laufende LOKALE Supabase-Instanz mit allen Migrationen und Demo-Zugaengen (npm run db:seed-auth).
//
// Warum: PostgREST liefert hoechstens 1000 Zeilen je Antwort. Ein Buch hat leicht mehr Abschnitte; Zaehlen, Pruefen,
// Freigeben und Loeschen duerfen daran nicht still scheitern. Der Test laedt ein Buch mit mehr als 1000 Abschnitten in
// Paketen und prueft Zaehlung, Unvollstaendigkeit, Freigabe, Vorschau und das Loeschen samt Wortgewichten gegen echte Zeilen.
// Sicherheitsnetz wie wissen-upload-db.ts: nur gegen eine lokale Datenbank, nur eigene Zeilen, am Ende aufgeraeumt.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { DB_OPTION } from "@/lib/supabase/schema";
import { gruppiereWissenDokumente, type WissenListeZeile } from "@/lib/wissen/dokumente-liste";
import { sha256Hex, teileInPakete } from "@/lib/wissen/buch-text";
import { ladePaket, starteBuch, type BuchKopf } from "@/lib/wissen/buch-upload";
import type { Einbettung } from "@/lib/wissen/embed";
import { entscheideUeberUpload } from "@/lib/wissen/freigabe";
import { UploadFehler } from "@/lib/wissen/hochladen";
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import { tokens } from "@/lib/wissen/sparse";
import { supabaseSpeicher } from "@/lib/wissen/speicher-supabase";
import { uploadQuelleId } from "@/lib/wissen/upload-quelle";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Fehlende Env-Variablen. Aufruf: npx tsx --env-file=.env.local supabase/tests/wissen-buch-db.ts");
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

async function begriffeAbbild(): Promise<string> {
  const aus: Array<[number, number, number]> = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await dienst.from("wissen_begriffe").select("hash, df, idf").order("hash").range(von, von + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { hash: number; df: number; idf: number }[]) aus.push([r.hash, r.df, r.idf]);
    if (!data || data.length < 1000) break;
  }
  return JSON.stringify(aus);
}

// Fantasiewoerter (sechs Buchstaben, Silbenbaukasten), damit der Test den echten Korpus nicht beruehrt.
const SILBEN = ["qxa", "qxe", "qxi", "qxo", "qxu", "zva", "zve", "zvi", "zvo", "zvu"];
function fantasiewort(n: number): string {
  return "qz" + SILBEN[n % 10]! + SILBEN[Math.floor(n / 10) % 10]! + SILBEN[Math.floor(n / 100) % 10]!;
}
function buchText(absaetze: number): string {
  const teile: string[] = [];
  let z = 0;
  for (let a = 0; a < absaetze; a++) {
    const saetze: string[] = [];
    for (let s = 0; s < 8; s++) {
      const woerter: string[] = [];
      for (let w = 0; w < 14; w++) woerter.push(fantasiewort(z++ % 1000));
      saetze.push(`${woerter.join(" ")}.`);
    }
    teile.push(`Kapitel ${a + 1}. ${saetze.join(" ")}`);
  }
  return teile.join("\n\n");
}

async function main() {
  const { data: profile, error: profilFehler } = await dienst.from("profiles").select("id, email").in("email", ["admin@damicon.demo", "ceo@damicon.demo"]);
  if (profilFehler || (profile ?? []).length !== 2) throw new Error("Demo-Zugaenge fehlen (npm run db:seed-auth)");
  const ADMIN_ID = (profile as { id: string; email: string }[]).find((p) => p.email === "admin@damicon.demo")!.id;
  const ZWEITE_ID = (profile as { id: string; email: string }[]).find((p) => p.email === "ceo@damicon.demo")!.id;

  const speicher = supabaseSpeicher(dienst);
  const d = { speicher, einbettung, jetzt: () => new Date("2026-10-09T10:00:00.000Z"), umgebung: {}, schema: "public" };
  const ich = { id: ADMIN_ID, name: "Test Admin" };

  // Ein Buch mit deutlich mehr als 1000 Abschnitten
  const text = buchText(1500);
  const pakete = teileInPakete(text, 80_000);
  const hash = await sha256Hex(text);
  const quelleId = uploadQuelleId(hash);
  const kopf: BuchKopf = { titel: "Testbuch Db", bereich: "recht", rollen: ["buchhaltung"], dateiname: "testbuch.txt", hash, quellenart: "fachliteratur", cluster: "buecher", pakete: pakete.length, zeichen: text.length };

  const aufraeumen = async () => {
    const { error } = await dienst.from("wissen_chunks").delete().eq("quelle_id", quelleId);
    if (error) throw new Error(`Aufraeumen: ${error.message}`);
  };
  await aufraeumen();
  const vorher = await begriffeAbbild();
  console.log(`Buch: ${text.length.toLocaleString("de-DE")} Zeichen in ${pakete.length} Paketen`);

  try {
    await starteBuch(kopf, ich, d);
    pruefe("Start: schreibt nichts", (await speicher.findeQuelle(quelleId)) === null);

    // Pakete 1 bis n-1: unvollstaendig
    let abschnitte = 0;
    for (let i = 0; i < pakete.length - 1; i++) abschnitte += (await ladePaket({ ...kopf, nr: i + 1, text: pakete[i]! }, ich, d)).chunks;
    const teilInfo = await speicher.ladeFreigabeInfo(quelleId);
    pruefe("Teilweise geladen: Zeilen gezaehlt (auch ueber 1000)", teilInfo.anzahl === abschnitte, `${teilInfo.anzahl} von ${abschnitte}`);
    pruefe("Teilweise geladen: unvollstaendig", teilInfo.unvollstaendig === true);
    const refused = await entscheideUeberUpload("freigeben", quelleId, { speicher, pruefer: { id: ZWEITE_ID }, umgebung: {}, schema: "public" }).then(
      () => "kein-fehler",
      (e) => (e instanceof UploadFehler ? e.code : "andere"),
    );
    pruefe("Teilweise geladen: Freigabe wird abgelehnt", refused === "unvollstaendig", refused);

    // Letztes Paket
    abschnitte += (await ladePaket({ ...kopf, nr: pakete.length, text: pakete[pakete.length - 1]! }, ich, d)).chunks;
    pruefe("Mehr als 1000 Abschnitte im Buch", abschnitte > 1000, String(abschnitte));
    const info = await speicher.ladeFreigabeInfo(quelleId);
    pruefe("Vollstaendig: alle Abschnitte gezaehlt, nicht mehr unvollstaendig", info.anzahl === abschnitte && info.unvollstaendig === false, `${info.anzahl}`);
    const qInfo = await speicher.ladeQuellenInfo(quelleId);
    pruefe("Quelleninfo zaehlt alle Zeilen und keine fremden", qInfo.anzahl === abschnitte && qInfo.fremd === 0);

    // Liste: ein Dokument mit Paketen
    const { data: gesamtListe, error: listenFehler } = await dienst.rpc("wissen_liste");
    if (listenFehler) throw new Error(listenFehler.message);
    const alle = gruppiereWissenDokumente(gesamtListe as unknown as WissenListeZeile[]);
    pruefe("Liste (wissen_liste): fasst serverseitig zusammen, weit weniger Zeilen als Abschnitte", (gesamtListe as unknown[]).length < 3000);
    const dok = alle.filter((x) => x.schluessel === quelleId);
    const { count: alleZeilen } = await dienst.from("wissen_chunks").select("id", { count: "exact", head: true });
    pruefe("Liste (wissen_liste): Summe der Abschnitte = Zahl der Zeilen der Tabelle", alle.reduce((n, x) => n + x.chunks, 0) === alleZeilen, `${alle.reduce((n, x) => n + x.chunks, 0)} / ${alleZeilen}`);
    pruefe("Liste: Abschnitte des Buchs stimmen", dok[0]?.chunks === abschnitte, String(dok[0]?.chunks));
    pruefe("Liste: ein Dokument mit vollstaendigen Paketen und Gütenote", dok.length === 1 && dok[0]!.paketeGesamt === pakete.length && dok[0]!.paketeDa === pakete.length && !dok[0]!.unvollstaendig && dok[0]!.guete === "gut", JSON.stringify({ g: dok[0]?.paketeGesamt, da: dok[0]?.paketeDa, guete: dok[0]?.guete }));

    // Vorschau: Anfang, Mitte, Ende
    const vorschau = await speicher.ladeVorschau(quelleId, 6000);
    pruefe("Vorschau: Anfang und Ende des Buchs", vorschau.includes("Kapitel 1.") && vorschau.includes("Kapitel 1500."), vorschau.slice(0, 40));

    // Freigabe durch die zweite Person: alle Zeilen, auch ueber 1000
    const erg = await entscheideUeberUpload("freigeben", quelleId, { speicher, pruefer: { id: ZWEITE_ID }, umgebung: {}, schema: "public" });
    pruefe("Freigabe: alle Abschnitte freigegeben", erg.abschnitte === abschnitte, String(erg.abschnitte));
    const { count: freigegeben } = await dienst.from("wissen_chunks").select("id", { count: "exact", head: true }).eq("quelle_id", quelleId).eq("pruefstatus", "freigegeben");
    pruefe("Freigabe: in der Datenbank alle freigegeben", freigegeben === abschnitte, String(freigegeben));
    const selbst = await entscheideUeberUpload("ablehnen", quelleId, { speicher, pruefer: { id: ZWEITE_ID }, umgebung: {}, schema: "public" }).then(
      () => "kein-fehler",
      (e) => (e instanceof UploadFehler ? e.code : "andere"),
    );
    pruefe("Entschieden ist entschieden", selbst === "nichtPruefbar", selbst);

    // Loeschen: alles weg, Wortgewichte zurueck
    const weg = await loescheHochgeladenesDokument(quelleId, { speicher, umgebung: {}, schema: "public" });
    pruefe("Loeschen: alle Abschnitte entfernt (in Stapeln)", weg.geloescht === abschnitte, String(weg.geloescht));
    const { count: rest } = await dienst.from("wissen_chunks").select("id", { count: "exact", head: true }).eq("quelle_id", quelleId);
    pruefe("Loeschen: nichts bleibt zurueck", rest === 0);
    const nachher = await begriffeAbbild();
    let diff = "";
    if (nachher !== vorher) {
      const v = new Map((JSON.parse(vorher) as Array<[number, number, number]>).map((x) => [x[0], x]));
      const n = new Map((JSON.parse(nachher) as Array<[number, number, number]>).map((x) => [x[0], x]));
      const abw = [...new Set([...v.keys(), ...n.keys()])].filter((k) => JSON.stringify(v.get(k)) !== JSON.stringify(n.get(k)));
      diff = `${abw.length} abweichend, z. B. ${abw.slice(0, 4).map((k) => `${k}: ${JSON.stringify(v.get(k))} -> ${JSON.stringify(n.get(k))}`).join(" | ")}`;
    }
    pruefe("Loeschen: Wortgewichte sind wie vorher", nachher === vorher, diff);
  } finally {
    await aufraeumen();
  }

  console.log(`\n${gesamt - fehlerAnzahl}/${gesamt} bestanden`);
  if (fehlerAnzahl > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
