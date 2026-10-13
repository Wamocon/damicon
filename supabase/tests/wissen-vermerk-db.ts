// =============================================================================
// Damicon - Vermerk zu fehlenden Scanseiten gegen ECHTES Postgres (Tabelle wissen_seiten_vermerk, wissen_liste, Freigabe)
// =============================================================================
// Ausfuehren:  npx tsx --env-file=.env.local supabase/tests/wissen-vermerk-db.ts   (Teil von npm run test:wissen-db)
// Voraussetzung: laufende LOKALE Supabase-Instanz mit allen Migrationen (20261205000000) und Demo-Zugaengen (npm run db:seed-auth).
// Sicherheitsnetz wie die anderen Datenbanktests: nur lokal, nur eigene Zeilen, am Ende aufgeraeumt.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { DB_OPTION } from "@/lib/supabase/schema";
import { gruppiereWissenDokumente, type WissenListeZeile } from "@/lib/wissen/dokumente-liste";
import { entscheideUeberUpload } from "@/lib/wissen/freigabe";
import { UploadFehler, verarbeiteUpload } from "@/lib/wissen/hochladen";
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import { supabaseSpeicher } from "@/lib/wissen/speicher-supabase";
import { einbettung } from "./hilfe/synthetische-einbettung";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("Fehlende Env-Variablen. Aufruf: npx tsx --env-file=.env.local supabase/tests/wissen-vermerk-db.ts");
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
const TEXT_A =
  "Qzvermerk Buch Seitenluecken Scan Nachpruefung Original Seitenzahl Kapitel Abschnitt Verzeichnis Anhang Fussnote Quellenangabe Kommentar Auslegung Rechtsprechung Gesetzgeber Begruendung Vorschrift Anwendungsbereich Ausnahme Voraussetzung Rechtsfolge";
const TEXT_B = `${TEXT_A} ohne Luecken Gegenprobe Vollstaendig Lueckenlos`;
const STELLEN = "48-49 (47), 2@276-278 (271)";

async function main() {
  const { data: profile } = await dienst.from("profiles").select("id, email").in("email", ["admin@damicon.demo", "ceo@damicon.demo"]);
  const profile2 = (profile ?? []) as { id: string; email: string }[];
  const ADMIN = profile2.find((p) => p.email === "admin@damicon.demo")?.id;
  const ZWEITE = profile2.find((p) => p.email === "ceo@damicon.demo")?.id;
  if (!ADMIN || !ZWEITE) throw new Error("Demo-Zugaenge fehlen (npm run db:seed-auth)");

  const speicher = supabaseSpeicher(dienst);
  const d = { speicher, einbettung, jetzt: () => new Date("2026-10-13T10:00:00.000Z"), umgebung: {}, schema: "public" };
  const ids: string[] = [];
  const aufraeumen = async () => {
    for (const q of ids) await loescheHochgeladenesDokument(q, { speicher, umgebung: {}, schema: "public" }).catch(() => undefined);
    await dienst.from("wissen_seiten_vermerk").delete().in("quelle_id", ids);
  };
  await aufraeumen();

  const hochladen = async (titel: string, text: string, datei: string) => {
    const r = await verarbeiteUpload({ titel, bereich: "recht", quellenart: "fachliteratur", rollen: ["admin"], dateiname: datei, bytes: new TextEncoder().encode(text), hochgeladenVon: { id: ADMIN, name: "Test Admin" }, url: "https://beispiel.example/v" }, d);
    ids.push(r.quelleId);
    return r.quelleId;
  };
  // Die Seitenpruefung schreibt sonst der Buch-Upload in extra; hier wird sie nachgetragen (extra darf geaendert werden, solange das Dokument wartet).
  const seitenpruefung = async (quelleId: string, fehlend: number, stellen: string) => {
    const { data: zeilen } = await dienst.from("wissen_chunks").select("id, extra").eq("quelle_id", quelleId);
    for (const z of (zeilen ?? []) as { id: string; extra: Record<string, unknown> }[]) {
      const u = await dienst.from("wissen_chunks").update({ extra: { ...z.extra, seiten_pruefung: { seiten: 100, fehlend, stellen, abdeckung: 90 } } }).eq("id", z.id);
      if (u.error) throw new Error(`Seitenpruefung nachtragen: ${u.error.message}`);
    }
  };
  const fehlerCode = async (f: () => Promise<unknown>) => {
    try {
      await f();
      return "kein-fehler";
    } catch (x) {
      return x instanceof UploadFehler ? x.code : `andere:${String(x)}`;
    }
  };
  const status = async (q: string) => [...new Set(((await dienst.from("wissen_chunks").select("pruefstatus").eq("quelle_id", q)).data ?? []).map((z) => (z as { pruefstatus: string }).pruefstatus))];
  const liste = async (q: string) => gruppiereWissenDokumente(((await dienst.rpc("wissen_liste")).data ?? []) as WissenListeZeile[]).find((x) => x.schluessel === q);

  try {
    const mit = await hochladen("Vermerk Buch mit Luecken", TEXT_A, "vermerk-a.txt");
    await seitenpruefung(mit, 3, STELLEN);

    const zeile = await liste(mit);
    pruefe("Liste: fehlende Seiten und ihre Stellen kommen aus der Datenbank (wissen_liste)", zeile?.seitenFehlend === 3 && zeile?.seitenStellen === STELLEN && zeile?.seitenVermerk === null, JSON.stringify([zeile?.seitenFehlend, zeile?.seitenStellen, zeile?.seitenVermerk]));

    const ohne = await fehlerCode(() => entscheideUeberUpload("freigeben", mit, { ...d, pruefer: { id: ZWEITE } }));
    pruefe("Freigabe ohne Vermerk wird abgelehnt (vermerkFehlt)", ohne === "vermerkFehlt", String(ohne));
    const kurz = await fehlerCode(() => entscheideUeberUpload("freigeben", mit, { ...d, pruefer: { id: ZWEITE }, seitenVermerk: "  ab " }));
    pruefe("Ein zu kurzer Vermerk zählt nicht", kurz === "vermerkFehlt");
    pruefe("Ohne gültigen Vermerk bleibt das Dokument ungeprüft und es gibt keine Vermerkzeile", (await status(mit)).join() === "ungeprueft" && ((await dienst.from("wissen_seiten_vermerk").select("quelle_id").eq("quelle_id", mit)).data ?? []).length === 0);

    const erg = await entscheideUeberUpload("freigeben", mit, { ...d, pruefer: { id: ZWEITE }, seitenVermerk: "Leere Seiten im Buch" });
    pruefe("Mit Vermerk wird freigegeben", erg.abschnitte > 0 && (await status(mit)).join() === "freigegeben" && erg.seitenVermerk === "Leere Seiten im Buch" && erg.seitenFehlend === 3);
    const { data: vz } = await dienst.from("wissen_seiten_vermerk").select("quelle_id, vermerk, fehlende_seiten, vermerkt_von").eq("quelle_id", mit);
    const v = ((vz ?? []) as { vermerk: string; fehlende_seiten: string | null; vermerkt_von: string | null }[])[0];
    pruefe("Der Vermerk liegt mit den fehlenden Seiten und der prüfenden Person in wissen_seiten_vermerk", v?.vermerk === "Leere Seiten im Buch" && v?.fehlende_seiten === STELLEN && v?.vermerkt_von === ZWEITE, JSON.stringify(v));
    const nachher = await liste(mit);
    pruefe("Liste: der Vermerk steht am Dokument (seitenVermerk)", nachher?.seitenVermerk === "Leere Seiten im Buch" && nachher?.seitenFehlend === 3);

    const anonLesen = await anon.from("wissen_seiten_vermerk").select("quelle_id").limit(1);
    pruefe("wissen_seiten_vermerk ist für anonyme Aufrufe gesperrt", anonLesen.error !== null || (anonLesen.data ?? []).length === 0, anonLesen.error?.message ?? "keine Daten");

    // Ablehnen braucht keinen Vermerk, und ein Buch ohne Luecken auch nicht
    const abg = await hochladen("Vermerk Buch zum Ablehnen", `${TEXT_A} abgelehnt`, "vermerk-abg.txt");
    await seitenpruefung(abg, 2, "10-11 (9)");
    const abgErg = await entscheideUeberUpload("ablehnen", abg, { ...d, pruefer: { id: ZWEITE } });
    pruefe("Ablehnen geht ohne Vermerk, auch bei Seitenlücken", abgErg.abschnitte > 0 && (await status(abg)).join() === "abgelehnt" && ((await dienst.from("wissen_seiten_vermerk").select("quelle_id").eq("quelle_id", abg)).data ?? []).length === 0);

    const sauber = await hochladen("Vermerk Buch ohne Luecken", TEXT_B, "vermerk-b.txt");
    await seitenpruefung(sauber, 0, "");
    const saubErg = await entscheideUeberUpload("freigeben", sauber, { ...d, pruefer: { id: ZWEITE } });
    pruefe("Ein Buch ohne Seitenlücken braucht keinen Vermerk und legt keinen ab", saubErg.seitenFehlend === 0 && (await status(sauber)).join() === "freigegeben" && ((await dienst.from("wissen_seiten_vermerk").select("quelle_id").eq("quelle_id", sauber)).data ?? []).length === 0);

    // Loeschen nimmt den Vermerk mit
    await loescheHochgeladenesDokument(mit, { speicher, umgebung: {}, schema: "public" });
    pruefe("Löschen des Dokuments entfernt auch den Vermerk", ((await dienst.from("wissen_seiten_vermerk").select("quelle_id").eq("quelle_id", mit)).data ?? []).length === 0);
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
