// =============================================================================
// Damicon - Einordnung nachtraeglich aendern gegen ECHTES Postgres (umordnen.ts, Waechter 20261129000000, wissen_liste)
// =============================================================================
// Ausfuehren:  npx tsx --env-file=.env.local supabase/tests/wissen-umordnen-db.ts   (Teil von npm run test:wissen-db)
// Voraussetzung: laufende LOKALE Supabase-Instanz mit allen Migrationen und Demo-Zugaengen (npm run db:seed-auth).
// Sicherheitsnetz wie die anderen Datenbanktests: nur lokal, nur eigene Zeilen, am Ende aufgeraeumt.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { DB_OPTION } from "@/lib/supabase/schema";
import type { Einbettung } from "@/lib/wissen/embed";
import { entscheideUeberUpload } from "@/lib/wissen/freigabe";
import { UploadFehler, verarbeiteUpload } from "@/lib/wissen/hochladen";
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import { tokens } from "@/lib/wissen/sparse";
import { supabaseSpeicher } from "@/lib/wissen/speicher-supabase";
import { ordneUm } from "@/lib/wissen/umordnen";
import { baueWissenVerwaltungWerkzeuge } from "@/lib/ai/wissen-verwaltung-werkzeug";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Fehlende Env-Variablen. Aufruf: npx tsx --env-file=.env.local supabase/tests/wissen-umordnen-db.ts");
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
const code = async (f: () => Promise<unknown>) => {
  try {
    await f();
    return "kein-fehler";
  } catch (e) {
    return e instanceof UploadFehler ? e.code : `andere:${e instanceof Error ? e.message : String(e)}`;
  }
};

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
const bytes = (s: string) => new TextEncoder().encode(s);

async function zeilen(spalte: string, wert: string) {
  const { data, error } = await dienst
    .from("wissen_chunks")
    .select("bereich, quellenart, cluster, textgrundlage, autoritaetsstufe, pruefstatus, pruefen_bis, geprueft_von, geprueft_am")
    .eq(spalte, wert);
  if (error) throw new Error(error.message);
  return (data ?? []) as {
    bereich: string;
    quellenart: string | null;
    cluster: string | null;
    textgrundlage: string | null;
    autoritaetsstufe: number | null;
    pruefstatus: string;
    pruefen_bis: string | null;
    geprueft_von: string | null;
    geprueft_am: string | null;
  }[];
}
const alleGleich = <T>(liste: T[], f: (z: T) => boolean) => liste.length > 0 && liste.every(f);

async function main() {
  const { data: profile } = await dienst.from("profiles").select("id, email").in("email", ["admin@damicon.demo", "ceo@damicon.demo"]);
  if ((profile ?? []).length !== 2) throw new Error("Demo-Zugaenge fehlen (npm run db:seed-auth)");
  const ADMIN = (profile as { id: string; email: string }[]).find((p) => p.email === "admin@damicon.demo")!.id;
  const ZWEITE = (profile as { id: string; email: string }[]).find((p) => p.email === "ceo@damicon.demo")!.id;

  const speicher = supabaseSpeicher(dienst);
  const jetzt = new Date("2026-10-09T10:00:00.000Z");
  // Spaeter als die Freigabe: Der Waechter verlangt bei einer Umordnung ein frisches geprueft_am
  const spaeter = new Date(jetzt.getTime() + 3_600_000);
  const d = { speicher, einbettung, jetzt: () => jetzt, umgebung: {}, schema: "public" };
  const BESTAND = "test-umordnen/bestand.md";
  let quelleId = "";
  const aufraeumen = async () => {
    await dienst.from("wissen_chunks").delete().eq("quelle_id", BESTAND);
    if (quelleId) await loescheHochgeladenesDokument(quelleId, { speicher, umgebung: {}, schema: "public" }).catch(() => undefined);
  };
  await aufraeumen();

  try {
    // ---- Upload als Internetquelle, ungeprueft: die hochladende Person darf alles aendern --------------------------------------------
    const up = await verarbeiteUpload(
      {
        titel: "Umordnen Testdokument",
        bereich: "recht",
        quellenart: "internetquelle",
        rollen: ["buchhaltung"],
        dateiname: "umordnen.txt",
        bytes: bytes("Qzumordnen Testtext Alpha Beta Gamma Delta zur Einordnung eines Dokuments, mit genug Wörtern für einen Abschnitt."),
        hochgeladenVon: { id: ADMIN, name: "Test Admin" },
        url: "https://beispiel.example/artikel",
      },
      d,
    );
    quelleId = up.quelleId;
    const ziel = { schluessel: quelleId, schluesselSpalte: "quelle_id" as const };

    const e1 = await ordneUm(dienst, ziel, { quellenart: "fachliteratur", cluster: "buecher" }, { id: ADMIN }, jetzt);
    pruefe("Ungeprüft: die hochladende Person ordnet um (Art, Cluster, Stufe folgt der Art)", e1.abschnitte > 0 && alleGleich(await zeilen("quelle_id", quelleId), (z) => z.quellenart === "fachliteratur" && z.cluster === "buecher" && z.autoritaetsstufe === 4 && z.pruefstatus === "ungeprueft"));
    const e2 = await ordneUm(dienst, ziel, { bereich: "steuer", textgrundlage: "fachlich_uebersetzt" }, { id: ADMIN }, jetzt);
    pruefe("Ungeprüft: Bereich und Textgrundlage ändern sich, der Bereich wird als gespeicherter Wert geschrieben", e2.abschnitte > 0 && alleGleich(await zeilen("quelle_id", quelleId), (z) => z.bereich === "steuer" && z.textgrundlage === "fachlich_uebersetzt"));
    await ordneUm(dienst, ziel, { bereich: "recht", textgrundlage: "original", quellenart: "internetquelle", cluster: "internet" }, { id: ADMIN }, jetzt);
    pruefe("Bereich Recht wird als legal gespeichert", alleGleich(await zeilen("quelle_id", quelleId), (z) => z.bereich === "legal" && z.quellenart === "internetquelle" && z.autoritaetsstufe === 5));
    pruefe("Keine Änderung: gleiche Angaben ergeben keineAenderung", (await code(() => ordneUm(dienst, ziel, { quellenart: "internetquelle", cluster: "internet" }, { id: ADMIN }, jetzt))) === "keineAenderung");
    pruefe("Unbekannte Quellenart und unbekannter Bereich werden abgelehnt", (await code(() => ordneUm(dienst, ziel, { quellenart: "erfunden" }, { id: ADMIN }, jetzt))) === "eingabe" && (await code(() => ordneUm(dienst, ziel, { bereich: "kochen" }, { id: ADMIN }, jetzt))) === "eingabe");
    pruefe("Cluster muss zur Art passen (Internetquelle nicht im Cluster Bücher)", (await code(() => ordneUm(dienst, ziel, { cluster: "buecher" }, { id: ADMIN }, jetzt))) === "clusterPasstNicht");
    pruefe("Ein unbekanntes Dokument wird gemeldet", (await code(() => ordneUm(dienst, { schluessel: "upload:" + "0".repeat(32), schluesselSpalte: "quelle_id" }, { cluster: "internet" }, { id: ADMIN }, jetzt))) === "nichtGefunden");

    // ---- Freigabe durch die zweite Person, danach gilt das Vier-Augen-Prinzip fuer die Einordnung ----------------------------------------------
    await entscheideUeberUpload("freigeben", quelleId, { speicher, pruefer: { id: ZWEITE }, jetzt: () => jetzt, umgebung: {}, schema: "public" });
    const freigegeben = await zeilen("quelle_id", quelleId);
    pruefe("Freigegeben (Internetquelle): Wiedervorlage ist gesetzt", alleGleich(freigegeben, (z) => z.pruefstatus === "freigegeben" && z.pruefen_bis !== null));

    pruefe("Freigegeben: die hochladende Person darf die Quellenart nicht aufwerten (Anwendung)", (await code(() => ordneUm(dienst, ziel, { quellenart: "rechtsnorm", cluster: "internet" }, { id: ADMIN }, jetzt))) === "selbstUmordnen");
    pruefe("Freigegeben: die hochladende Person darf auch den Bereich nicht ändern", (await code(() => ordneUm(dienst, ziel, { bereich: "steuer" }, { id: ADMIN }, jetzt))) === "selbstUmordnen");
    // Der Waechter der Datenbank haelt dasselbe, auch an der Anwendung vorbei
    const direkt = await dienst
      .from("wissen_chunks")
      .update({ quellenart: "rechtsnorm", autoritaetsstufe: 1, geprueft_von: ADMIN, geprueft_am: jetzt.toISOString() })
      .eq("quelle_id", quelleId)
      .select("id");
    pruefe("Freigegeben: der Wächter der Datenbank lehnt die Aufwertung durch die hochladende Person ab", !!direkt.error && /Vier-Augen|23514/.test(`${direkt.error.code} ${direkt.error.message}`), direkt.error?.message ?? "kein Fehler");
    const ohnePerson = await dienst.from("wissen_chunks").update({ quellenart: "rechtsnorm", autoritaetsstufe: 1 }).eq("quelle_id", quelleId).select("id");
    pruefe("Freigegeben: ohne eintragende Person lehnt der Wächter die Änderung ab", !!ohnePerson.error);
    pruefe("Freigegeben: nach den Fehlversuchen ist nichts geändert", alleGleich(await zeilen("quelle_id", quelleId), (z) => z.quellenart === "internetquelle" && z.autoritaetsstufe === 5));

    await ordneUm(dienst, ziel, { cluster: "internet" }, { id: ADMIN }, jetzt).catch(() => undefined);
    // Der Cluster allein wirkt nicht auf die Suche: Die hochladende Person darf ihn aendern (Art internetquelle erlaubt nur internet, daher Art-neutral pruefen)
    const kraft = await ordneUm(dienst, ziel, { quellenart: "fachliteratur", cluster: "buecher", textgrundlage: "fachlich_uebersetzt" }, { id: ZWEITE }, spaeter);
    const nachZweite = await zeilen("quelle_id", quelleId);
    pruefe("Freigegeben: die zweite Person darf umordnen, Stufe folgt der Art, die Person wird eingetragen", kraft.abschnitte > 0 && alleGleich(nachZweite, (z) => z.quellenart === "fachliteratur" && z.autoritaetsstufe === 4 && z.geprueft_von === ZWEITE && z.textgrundlage === "fachlich_uebersetzt"));
    pruefe("Freigegeben: die Wiedervorlage folgt der neuen Art (Fachliteratur: keine)", alleGleich(nachZweite, (z) => z.pruefen_bis === null && z.pruefstatus === "freigegeben"));
    const clusterNur = await ordneUm(dienst, ziel, { cluster: "publikationen" }, { id: ADMIN }, jetzt);
    pruefe("Freigegeben: der Cluster allein darf auch von der hochladenden Person geändert werden", clusterNur.abschnitte > 0 && alleGleich(await zeilen("quelle_id", quelleId), (z) => z.cluster === "publikationen" && z.quellenart === "fachliteratur"));
    pruefe("Art mit Linkpflicht ohne Link wird abgelehnt (Forum auf einem Dokument ohne gültigen Link)", (await code(async () => {
      await dienst.from("wissen_chunks").update({ url: null }).eq("quelle_id", quelleId);
      await ordneUm(dienst, ziel, { quellenart: "forum", cluster: "internet" }, { id: ZWEITE }, jetzt);
    })) === "urlFehlt");

    // ---- Bestand: jede Administration, kein Pruefstatus, keine Wiedervorlage ------------------------------------------------------------------
    const dense = `[${new Array(DIM).fill(0.01).join(",")}]`;
    const { error: bestandFehler } = await dienst.from("wissen_chunks").insert({
      id: "ef000000-0000-0000-0000-000000000001",
      chunk_id: BESTAND,
      quelle_id: BESTAND,
      sprache: "de",
      titel: "Bestand Umordnen",
      pfad: BESTAND,
      bereich: "fachquellen",
      teil: 1,
      teile: 1,
      text: "Bestandstext fuer den Umordnen-Test.",
      rollen: ["admin"],
      extra: {},
      dense,
      sparse: "{1:1}/1000000000",
      pruefstatus: "freigegeben",
      autoritaetsstufe: 4,
    });
    if (bestandFehler) throw new Error(bestandFehler.message);
    const bz = { schluessel: BESTAND, schluesselSpalte: "quelle_id" as const };
    const b1 = await ordneUm(dienst, bz, { quellenart: "praxisbeitrag", cluster: "internet", bereich: "fachquellen" }, { id: ADMIN }, jetzt);
    const bz1 = await zeilen("quelle_id", BESTAND);
    pruefe("Bestand: Art und Cluster setzen, Korpusbereich bleibt, Stufe folgt der Art, keine Wiedervorlage", b1.abschnitte === 1 && alleGleich(bz1, (z) => z.quellenart === "praxisbeitrag" && z.cluster === "internet" && z.bereich === "fachquellen" && z.autoritaetsstufe === 4 && z.pruefen_bis === null && z.geprueft_von === null));
    pruefe("Bestand: ein anderer Korpusbereich als der vorhandene wird abgelehnt", (await code(() => ordneUm(dienst, bz, { bereich: "kernwissen" }, { id: ADMIN }, jetzt))) === "eingabe");
    await ordneUm(dienst, bz, { bereich: "steuer", quellenart: "rechtsnorm" }, { id: ADMIN }, jetzt);
    pruefe("Bestand: Wechsel in einen der fünf Bereiche und Aufwertung durch dieselbe Person sind erlaubt", alleGleich(await zeilen("quelle_id", BESTAND), (z) => z.bereich === "steuer" && z.quellenart === "rechtsnorm" && z.autoritaetsstufe === 1));

    // ---- Werkzeuge des Assistenten gegen echte Zeilen ----------------------------------------------------------------------------------------
    type Ausfuehren = (eingabe: unknown, optionen: unknown) => Promise<Record<string, unknown>>;
    const werkzeuge = baueWissenVerwaltungWerkzeuge("admin")!;
    const optionen = { toolCallId: "t", messages: [] };
    const uebersicht = (await (werkzeuge.wissensbasisAbrufen.execute as unknown as Ausfuehren)({ suche: "Umordnen" }, optionen)) as { treffer: number; dokumente: { schluessel: string; quellenart: string | null; cluster: string | null; stufe: number | null }[]; gesamt: { dokumente: number }; nachQuellenart: Record<string, number> };
    pruefe("Assistent: wissensbasisAbrufen findet beide Testdokumente mit Einordnung", uebersicht.treffer === 2 && uebersicht.dokumente.some((x) => x.schluessel === quelleId && x.quellenart === "fachliteratur") && uebersicht.dokumente.some((x) => x.schluessel === BESTAND && x.quellenart === "rechtsnorm" && x.stufe === 1));
    pruefe("Assistent: wissensbasisAbrufen liefert Zahlen für die ganze Wissensbasis", uebersicht.gesamt.dokumente >= 2 && (uebersicht.nachQuellenart.fachliteratur ?? 0) >= 1);
    const analyse = (await (werkzeuge.wissenDokumentAnalysieren.execute as unknown as Ausfuehren)({ dokument: quelleId }, optionen)) as { aktuell: { quellenart: string | null }; regelVorschlag: { quellenart: string; bereich: string }; auszuege: { ort: string; text: string }[]; abweichungen: string[] };
    pruefe("Assistent: wissenDokumentAnalysieren liefert Einordnung, Vorschlag und Auszüge", analyse.aktuell.quellenart === "fachliteratur" && typeof analyse.regelVorschlag.bereich === "string" && analyse.auszuege.length >= 1 && analyse.auszuege[0]!.text.length > 0);
    const unbekannt = (await (werkzeuge.wissenDokumentAnalysieren.execute as unknown as Ausfuehren)({ dokument: "gibt es nicht xyz" }, optionen)) as { fehler?: string };
    pruefe("Assistent: ein unbekanntes Dokument wird gemeldet, nicht erfunden", unbekannt.fehler === "nicht-gefunden");

    // ---- Liste ------------------------------------------------------------------------------------------------------------------------------------
    const { data: liste, error: listeFehler } = await dienst.rpc("wissen_liste");
    if (listeFehler) throw new Error(listeFehler.message);
    const eintraege = liste as { quelle_id: string; textgrundlage: string | null; quellenart: string | null }[];
    pruefe("Liste: wissen_liste liefert die Textgrundlage mit", eintraege.some((x) => x.quelle_id === quelleId && x.textgrundlage === "fachlich_uebersetzt") && eintraege.some((x) => x.quelle_id === BESTAND && x.quellenart === "rechtsnorm"));
  } finally {
    await aufraeumen();
  }
  const { count } = await dienst.from("wissen_chunks").select("id", { count: "exact", head: true }).like("titel", "Umordnen%");
  pruefe("Aufgeräumt: keine Testzeilen übrig", count === 0);

  console.log(`\n${gesamt - fehlerAnzahl}/${gesamt} bestanden`);
  if (fehlerAnzahl > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
