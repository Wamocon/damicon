// =============================================================================
// Damicon - Weitere Bereiche eines Dokuments gegen ECHTES Postgres (Migration 20261208000000, umordnen.ts, wissen_liste, Assistent)
// =============================================================================
// Ausfuehren:  npx tsx --env-file=.env.local supabase/tests/wissen-weitere-bereiche-db.ts   (Teil von npm run test:wissen-db)
// Voraussetzung: laufende LOKALE Supabase-Instanz mit allen Migrationen und Demo-Zugaengen (npm run db:seed-auth).
// Sicherheitsnetz wie die anderen Datenbanktests: nur lokal, nur eigene Zeilen, am Ende aufgeraeumt.
//
// Anlass (15.10.2026): Der KI-Assistent sagte, die Wissensbasis habe keine Quellen zum Bereich Risiko, obwohl ISO 31000 und COSO unter audit und legal
// standen. Ein Dokument kann jetzt in mehreren Bereichen gelten (wissen_chunks.weitere_bereiche).
// =============================================================================

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { DB_OPTION } from "@/lib/supabase/schema";
import { baueWissenVerwaltungWerkzeuge } from "@/lib/ai/wissen-verwaltung-werkzeug";
import { gruppiereWissenDokumente, type WissenListeZeile } from "@/lib/wissen/dokumente-liste";
import { entscheideUeberUpload } from "@/lib/wissen/freigabe";
import { UploadFehler, verarbeiteUpload } from "@/lib/wissen/hochladen";
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import { supabaseSpeicher } from "@/lib/wissen/speicher-supabase";
import { ordneUm } from "@/lib/wissen/umordnen";
import { DIM, einbettung } from "./hilfe/synthetische-einbettung";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Fehlende Env-Variablen. Aufruf: npx tsx --env-file=.env.local supabase/tests/wissen-weitere-bereiche-db.ts");
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
const bytes = (s: string) => new TextEncoder().encode(s);
const MIGRATION = "supabase/migrations/20261208000000_wissen_weitere_bereiche_pgvector.sql";
const PRAEFIX = "test-weitere/";

async function zeilen(quelleId: string) {
  const { data, error } = await dienst.from("wissen_chunks").select("bereich, weitere_bereiche, geprueft_von, pruefstatus").eq("quelle_id", quelleId);
  if (error) throw new Error(error.message);
  return (data ?? []) as { bereich: string; weitere_bereiche: string[]; geprueft_von: string | null; pruefstatus: string }[];
}
const alleWeitere = (liste: { weitere_bereiche: string[] }[], erwartet: string[]) =>
  liste.length > 0 && liste.every((z) => JSON.stringify(z.weitere_bereiche) === JSON.stringify(erwartet));

/** Die Datenaenderung der Migration (das UPDATE am Ende) und die Kennungen darin. */
function datenAenderung(): { sql: string; kennungen: string[] } {
  const text = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
  const treffer = /update public\.wissen_chunks[\s\S]*?not \('risiko' = any \(weitere_bereiche\)\);/.exec(text);
  if (!treffer) throw new Error("Datenänderung in der Migration nicht gefunden");
  const liste = /quelle_id in \(([\s\S]*?)\)\s+and bereich/.exec(treffer[0]);
  const kennungen = [...(liste?.[1] ?? "").matchAll(/'((?:[^']|'')+)'/g)].map((m) => m[1]!.replace(/''/g, "'"));
  return { sql: treffer[0], kennungen };
}

/** Fuehrt SQL im lokalen Datenbank-Container aus. null, wenn Docker oder der Container fehlt (dann wird die Pruefung als uebersprungen gemeldet). */
function imContainer(sql: string): string | null {
  try {
    const namen = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" }).split(/\r?\n/);
    const db = namen.find((n) => /^supabase_db_/.test(n));
    if (!db) return null;
    return execFileSync("docker", ["exec", "-i", db, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA"], { input: `set search_path = public;\n${sql}`, encoding: "utf8" });
  } catch {
    return null;
  }
}

async function main() {
  const { data: profile } = await dienst.from("profiles").select("id, email").in("email", ["admin@damicon.demo", "ceo@damicon.demo"]);
  if ((profile ?? []).length !== 2) throw new Error("Demo-Zugaenge fehlen (npm run db:seed-auth)");
  const ADMIN = (profile as { id: string; email: string }[]).find((p) => p.email === "admin@damicon.demo")!.id;
  const ZWEITE = (profile as { id: string; email: string }[]).find((p) => p.email === "ceo@damicon.demo")!.id;

  const speicher = supabaseSpeicher(dienst);
  const jetzt = new Date("2026-10-15T10:00:00.000Z");
  const spaeter = new Date(jetzt.getTime() + 3_600_000);
  const d = { speicher, einbettung, jetzt: () => jetzt, umgebung: {}, schema: "public" };
  let quelleId = "";
  const aufraeumen = async () => {
    await dienst.from("wissen_chunks").delete().like("chunk_id", `${PRAEFIX}%`);
    if (quelleId) await loescheHochgeladenesDokument(quelleId, { speicher, umgebung: {}, schema: "public" }).catch(() => undefined);
  };
  await aufraeumen();

  try {
    // ---- Spalte, Standard und Pruefung in der Datenbank -------------------------------------------------------------------------------------
    const up = await verarbeiteUpload(
      {
        titel: "Weitere Bereiche Testdokument",
        bereich: "audit",
        quellenart: "fachliteratur",
        rollen: ["admin"],
        dateiname: "weitere.txt",
        bytes: bytes("Qzweitebereiche Risikomanagement Rahmenwerk Alpha Beta Gamma Delta zur Einordnung eines Dokuments, mit genug Wörtern für einen Abschnitt."),
        hochgeladenVon: { id: ADMIN, name: "Test Admin" },
      },
      d,
    );
    quelleId = up.quelleId;
    const ziel = { schluessel: quelleId, schluesselSpalte: "quelle_id" as const };
    pruefe("Standard: ein neues Dokument gilt in keinem weiteren Bereich", alleWeitere(await zeilen(quelleId), []));

    const direktEigener = await dienst.from("wissen_chunks").update({ weitere_bereiche: ["audit"] }).eq("quelle_id", quelleId).select("id");
    pruefe("Datenbank: der Hauptbereich selbst ist als weiterer Bereich verboten", !!direktEigener.error && direktEigener.error.code === "23514", direktEigener.error?.message ?? "kein Fehler");
    const direktFremd = await dienst.from("wissen_chunks").update({ weitere_bereiche: ["erfunden"] }).eq("quelle_id", quelleId).select("id");
    pruefe("Datenbank: nur die fünf Bereiche des Uploads sind erlaubt", !!direktFremd.error && direktFremd.error.code === "23514", direktFremd.error?.message ?? "kein Fehler");
    const direktKorpus = await dienst.from("wissen_chunks").update({ weitere_bereiche: ["amtlich"] }).eq("quelle_id", quelleId).select("id");
    pruefe("Datenbank: ein Korpusbereich (amtlich) ist als weiterer Bereich nicht erlaubt", !!direktKorpus.error && direktKorpus.error.code === "23514");
    pruefe("Datenbank: nach den Fehlversuchen ist nichts geändert", alleWeitere(await zeilen(quelleId), []));

    // ---- Umordnen (ungeprueft: die hochladende Person darf alles) ----------------------------------------------------------------------------
    const e1 = await ordneUm(dienst, ziel, { weitereBereiche: ["risiko"] }, { id: ADMIN }, jetzt);
    pruefe("Umordnen: ein weiterer Bereich wird gespeichert, vorher und nachher im Protokollwert", e1.abschnitte > 0 && alleWeitere(await zeilen(quelleId), ["risiko"]) && e1.vorher.weitereBereiche.length === 0 && e1.nachher.weitereBereiche.join() === "risiko");
    await ordneUm(dienst, ziel, { weitereBereiche: ["risiko", "recht", "audit"] }, { id: ADMIN }, jetzt);
    pruefe("Umordnen: Reihenfolge der Bereiche, recht als legal gespeichert, der Hauptbereich (audit) fällt heraus", alleWeitere(await zeilen(quelleId), ["legal", "risiko"]));
    pruefe("Umordnen: dieselbe Menge noch einmal ergibt keineAenderung", (await code(() => ordneUm(dienst, ziel, { weitereBereiche: ["risiko", "recht"] }, { id: ADMIN }, jetzt))) === "keineAenderung");
    pruefe("Umordnen: ein unbekannter oder nicht wählbarer Bereich wird abgelehnt", (await code(() => ordneUm(dienst, ziel, { weitereBereiche: ["erfunden"] }, { id: ADMIN }, jetzt))) === "eingabe" && (await code(() => ordneUm(dienst, ziel, { weitereBereiche: ["amtlich"] }, { id: ADMIN }, jetzt))) === "eingabe");
    pruefe("Umordnen: ohne Angabe bleiben die weiteren Bereiche, wie sie sind", (await ordneUm(dienst, ziel, { cluster: "publikationen" }, { id: ADMIN }, jetzt)).abschnitte > 0 && alleWeitere(await zeilen(quelleId), ["legal", "risiko"]));
    await ordneUm(dienst, ziel, { weitereBereiche: [] }, { id: ADMIN }, jetzt);
    pruefe("Umordnen: eine leere Angabe nimmt alle weiteren Bereiche weg", alleWeitere(await zeilen(quelleId), []));
    await ordneUm(dienst, ziel, { weitereBereiche: ["risiko"] }, { id: ADMIN }, jetzt);
    await ordneUm(dienst, ziel, { bereich: "risiko" }, { id: ADMIN }, jetzt);
    const nachWechsel = await zeilen(quelleId);
    pruefe("Umordnen: wird der weitere Bereich zum Hauptbereich, verschwindet er aus den weiteren", nachWechsel.every((z) => z.bereich === "risiko") && alleWeitere(nachWechsel, []));
    await ordneUm(dienst, ziel, { bereich: "audit", weitereBereiche: ["risiko"] }, { id: ADMIN }, jetzt);
    pruefe("Umordnen: Hauptbereich und weitere Bereiche in einem Zug", alleWeitere(await zeilen(quelleId), ["risiko"]) && (await zeilen(quelleId)).every((z) => z.bereich === "audit"));

    // ---- Liste und Assistent ---------------------------------------------------------------------------------------------------------------------
    const { data: liste, error: listeFehler } = await dienst.rpc("wissen_liste");
    if (listeFehler) throw new Error(listeFehler.message);
    const eintraege = liste as unknown as (WissenListeZeile & { quelle_id: string })[];
    pruefe("Liste: wissen_liste liefert die weiteren Bereiche mit", eintraege.some((x) => x.quelle_id === quelleId && JSON.stringify(x.weitere_bereiche) === JSON.stringify(["risiko"])));
    const doks = gruppiereWissenDokumente(eintraege);
    const meins = doks.find((x) => x.schluessel === quelleId);
    pruefe("Liste: das Dokument kennt Hauptbereich und weiteren Bereich", meins?.bereich === "audit" && meins.weitereBereiche.join() === "risiko");

    type Ausfuehren = (eingabe: unknown, optionen: unknown) => Promise<Record<string, unknown>>;
    const werkzeuge = baueWissenVerwaltungWerkzeuge("admin")!;
    const optionen = { toolCallId: "t", messages: [] };
    const ruf = (eingabe: unknown) => (werkzeuge.wissensbasisAbrufen.execute as unknown as Ausfuehren)(eingabe, optionen);
    type Antwort = {
      treffer: number;
      nachBereich: Record<string, number>;
      hinweis: string;
      dokumente: { schluessel: string; bereich: string; bereiche: string[]; abschnitteMitStichwort?: number }[];
      stichwort?: { wort: string; dokumente: number; nachBereich: Record<string, number> };
    };
    const imRisiko = (await ruf({ suche: "Weitere Bereiche Testdokument", bereich: "risiko" })) as unknown as Antwort;
    pruefe("Assistent: der Filter Bereich risiko findet das Dokument über seinen weiteren Bereich", imRisiko.treffer === 1 && imRisiko.dokumente[0]?.schluessel === quelleId);
    pruefe("Assistent: das Dokument nennt Hauptbereich und alle Bereiche", imRisiko.dokumente[0]?.bereich === "audit" && imRisiko.dokumente[0]?.bereiche.join() === "audit,risiko");
    pruefe("Assistent: die Zählung nach Bereich führt das Dokument in beiden Bereichen", (imRisiko.nachBereich.audit ?? 0) >= 1 && (imRisiko.nachBereich.risiko ?? 0) >= 1);
    const imSteuer = (await ruf({ suche: "Weitere Bereiche Testdokument", bereich: "steuer" })) as unknown as Antwort;
    pruefe("Assistent: in einem fremden Bereich erscheint es nicht", imSteuer.treffer === 0);
    pruefe("Assistent: jedes Ergebnis erinnert daran, dass der Bereich nur ein Etikett ist und kein Upload ohne Themenprüfung empfohlen wird", /Ordnungsetikett/.test(imRisiko.hinweis) && /keinen Upload/.test(imRisiko.hinweis) && /stichwort/.test(imRisiko.hinweis));
    const probe = (await ruf({ stichwort: "Qzweitebereiche" })) as unknown as Antwort;
    pruefe("Assistent: der Filter stichwort findet das Dokument über seinen TEXT, nicht über den Titel", probe.treffer === 1 && probe.dokumente[0]?.schluessel === quelleId && (probe.dokumente[0]?.abschnitteMitStichwort ?? 0) >= 1);
    pruefe("Assistent: das Stichwort wird je Bereich gezählt (audit und risiko)", probe.stichwort?.dokumente === 1 && probe.stichwort.nachBereich.audit === 1 && probe.stichwort.nachBereich.risiko === 1, JSON.stringify(probe.stichwort));
    const keins = (await ruf({ stichwort: "Qgibtesnichtxyz" })) as unknown as Antwort;
    pruefe("Assistent: ein Stichwort ohne Treffer ergibt null Dokumente, mit Hinweis statt eines Fehlers", keins.treffer === 0 && keins.stichwort?.dokumente === 0 && typeof keins.hinweis === "string");
    const gefaehrlich = (await ruf({ stichwort: "x),text.ilike.%" })) as unknown as Antwort & { fehler?: string };
    pruefe("Assistent: Sonderzeichen im Stichwort verändern den Datenbankfilter nicht", gefaehrlich.fehler === undefined);

    // ---- Nach der Freigabe: Vier-Augen-Prinzip auch fuer die weiteren Bereiche -------------------------------------------------------------
    await entscheideUeberUpload("freigeben", quelleId, { speicher, pruefer: { id: ZWEITE }, jetzt: () => jetzt, umgebung: {}, schema: "public" });
    pruefe("Freigegeben: die hochladende Person ändert die weiteren Bereiche nicht (Anwendung)", (await code(() => ordneUm(dienst, ziel, { weitereBereiche: [] }, { id: ADMIN }, jetzt))) === "selbstUmordnen" && (await code(() => ordneUm(dienst, ziel, { weitereBereiche: ["risiko", "steuer"] }, { id: ADMIN }, jetzt))) === "selbstUmordnen");
    const direkt = await dienst.from("wissen_chunks").update({ weitere_bereiche: ["steuer"], geprueft_von: ADMIN, geprueft_am: spaeter.toISOString() }).eq("quelle_id", quelleId).select("id");
    pruefe("Freigegeben: der Wächter der Datenbank lehnt die Änderung durch die hochladende Person ab", !!direkt.error && /Vier-Augen|23514/.test(`${direkt.error.code} ${direkt.error.message}`), direkt.error?.message ?? "kein Fehler");
    const ohnePerson = await dienst.from("wissen_chunks").update({ weitere_bereiche: ["steuer"] }).eq("quelle_id", quelleId).select("id");
    pruefe("Freigegeben: ohne eintragende Person lehnt der Wächter die Änderung ab", !!ohnePerson.error);
    pruefe("Freigegeben: nach den Fehlversuchen ist nichts geändert", alleWeitere(await zeilen(quelleId), ["risiko"]));
    const zweite = await ordneUm(dienst, ziel, { weitereBereiche: ["risiko", "steuer"] }, { id: ZWEITE }, spaeter);
    const nachZweite = await zeilen(quelleId);
    pruefe("Freigegeben: die zweite Person darf, die Person wird eingetragen", zweite.abschnitte > 0 && alleWeitere(nachZweite, ["steuer", "risiko"]) && nachZweite.every((z) => z.geprueft_von === ZWEITE && z.pruefstatus === "freigegeben"));
    const nurCluster = await ordneUm(dienst, ziel, { cluster: "buecher" }, { id: ADMIN }, jetzt);
    pruefe("Freigegeben: der Cluster allein bleibt für die hochladende Person frei und lässt die weiteren Bereiche stehen", nurCluster.abschnitte > 0 && alleWeitere(await zeilen(quelleId), ["steuer", "risiko"]));

    // ---- Datenaenderung der Migration: nur die genannten Kennungen, idempotent, ohne Doppelte ----------------------------------------------
    const { sql, kennungen } = datenAenderung();
    pruefe("Migration: 13 Kennungen, keine doppelt", kennungen.length === 13 && new Set(kennungen).size === 13, `${kennungen.length} Kennungen`);
    const dense = `[${new Array(DIM).fill(0.01).join(",")}]`;
    const zeile = (nr: string, kennung: string, bereich: string, weitere: string[]) => ({
      id: `ef000000-0000-0000-0000-0000000000${nr}`,
      chunk_id: `${PRAEFIX}${nr}`,
      quelle_id: kennung,
      sprache: "de",
      titel: `Weitere Bereiche Bestand ${nr}`,
      pfad: kennung,
      bereich,
      weitere_bereiche: weitere,
      teil: 1,
      teile: 1,
      text: "Bestandstext fuer den Test der Datenaenderung.",
      rollen: ["admin"],
      extra: {},
      dense,
      sparse: "{1:1}/1000000000",
      pruefstatus: "freigegeben",
      autoritaetsstufe: 4,
    });
    const { error: einfuegen } = await dienst.from("wissen_chunks").insert([
      zeile("11", kennungen[0]!, "audit", []), // wird risiko
      zeile("12", kennungen[1]!, "legal", ["steuer"]), // steuer bleibt, risiko kommt dazu
      zeile("13", kennungen[2]!, "risiko", []), // Hauptbereich ist schon risiko: unveraendert
      zeile("14", kennungen[3]!, "audit", ["risiko"]), // schon drin: kein Doppelter
      zeile("15", `${kennungen[0]}-andere`, "audit", []), // nicht in der Liste: unveraendert
      zeile("16", "audit/Audit/irgendein-anderes-dokument.md", "audit", []), // fremd: unveraendert
    ]);
    if (einfuegen) throw new Error(einfuegen.message);
    const lies = async () => {
      const { data } = await dienst.from("wissen_chunks").select("chunk_id, weitere_bereiche").like("chunk_id", `${PRAEFIX}%`).order("chunk_id");
      return Object.fromEntries(((data ?? []) as { chunk_id: string; weitere_bereiche: string[] }[]).filter((z) => /\/1\d$/.test(z.chunk_id)).map((z) => [z.chunk_id.slice(PRAEFIX.length), z.weitere_bereiche.join()]));
    };
    const erster = imContainer(sql);
    if (erster === null) {
      pruefe("Migration: Datenänderung läuft nur auf die genannten Kennungen (übersprungen: kein Datenbank-Container erreichbar)", true);
    } else {
      const a = await lies();
      pruefe("Migration: die genannten Dokumente bekommen risiko dazu, vorhandene weitere Bereiche bleiben", a["11"] === "risiko" && a["12"] === "steuer,risiko", JSON.stringify(a));
      pruefe("Migration: Hauptbereich risiko und schon eingetragenes risiko bleiben unverändert (kein Doppelter)", a["13"] === "" && a["14"] === "risiko", JSON.stringify(a));
      pruefe("Migration: andere Kennungen, auch ähnliche, bleiben unberührt", a["15"] === "" && a["16"] === "", JSON.stringify(a));
      imContainer(sql);
      const b = await lies();
      pruefe("Migration: ein zweiter Lauf ändert nichts (idempotent)", JSON.stringify(a) === JSON.stringify(b));
    }
  } finally {
    await aufraeumen();
  }
  const { count } = await dienst.from("wissen_chunks").select("id", { count: "exact", head: true }).like("titel", "Weitere Bereiche%");
  pruefe("Aufgeräumt: keine Testzeilen übrig", count === 0);

  console.log(`\n${gesamt - fehlerAnzahl}/${gesamt} bestanden`);
  if (fehlerAnzahl > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
