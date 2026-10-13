// =============================================================================
// Damicon - Bestaetigung fehlender Scanseiten gegen ECHTES Postgres (Tabelle wissen_seiten_vermerk, wissen_liste, Freigabe, Qualitaet)
// =============================================================================
// Ausfuehren:  npx tsx --env-file=.env.local supabase/tests/wissen-vermerk-db.ts   (Teil von npm run test:wissen-db)
// Voraussetzung: laufende LOKALE Supabase-Instanz mit allen Migrationen (20261206000000) und Demo-Zugaengen (npm run db:seed-auth).
// Sicherheitsnetz wie die anderen Datenbanktests: nur lokal, nur eigene Zeilen, am Ende aufgeraeumt.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { DB_OPTION } from "@/lib/supabase/schema";
import { gruppiereWissenDokumente, type WissenListeZeile } from "@/lib/wissen/dokumente-liste";
import { entscheideUeberUpload } from "@/lib/wissen/freigabe";
import { UploadFehler, verarbeiteUpload } from "@/lib/wissen/hochladen";
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import { dokumentQualitaet } from "@/lib/wissen/qualitaet";
import { berechneQualitaetFuer } from "@/lib/wissen/speicher-bestandspflege";
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
const STELLEN = "48-49 (47), 2@276-278 (PDF 271-273)";

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
    await dienst.from("wissen_qualitaet").delete().in("quelle_id", ids);
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
  const textProzent = async (q: string) =>
    dokumentQualitaet((((await dienst.from("wissen_chunks").select("text").eq("quelle_id", q).order("pfad").order("teil")).data ?? []) as { text: string }[]).map((z) => z.text), null)?.prozent;
  const vermerkZeilen = async (q: string) => ((await dienst.from("wissen_seiten_vermerk").select("quelle_id").eq("quelle_id", q)).data ?? []).length;

  try {
    const mit = await hochladen("Vermerk Buch mit Luecken", TEXT_A, "vermerk-a.txt");
    await seitenpruefung(mit, 4, STELLEN);

    const zeile = await liste(mit);
    pruefe(
      "Liste: fehlende Seiten, Stellen und offene Seiten kommen aus der Datenbank (wissen_liste)",
      zeile?.seitenFehlend === 4 && zeile?.seitenStellen === STELLEN && zeile?.seitenVermerk === null && zeile?.seitenBestaetigt === null && zeile?.seitenVermerkt === false && zeile?.seitenOffen === 4,
      JSON.stringify([zeile?.seitenFehlend, zeile?.seitenStellen, zeile?.seitenVermerk, zeile?.seitenOffen]),
    );
    const qVorher = await berechneQualitaetFuer(dienst, mit);

    const ohne = await fehlerCode(() => entscheideUeberUpload("freigeben", mit, { ...d, pruefer: { id: ZWEITE } }));
    pruefe("Freigabe ohne Angabe der korrekt fehlenden Seiten wird abgelehnt (seitenNichtBestaetigt)", ohne === "seitenNichtBestaetigt", String(ohne));
    const ungueltig = await fehlerCode(() => entscheideUeberUpload("freigeben", mit, { ...d, pruefer: { id: ZWEITE }, seitenBestaetigt: "abc" }));
    pruefe("Eine ungültige Angabe zählt nicht", ungueltig === "seitenNichtBestaetigt");
    const teil = await fehlerCode(() => entscheideUeberUpload("freigeben", mit, { ...d, pruefer: { id: ZWEITE }, seitenBestaetigt: "48-49" }));
    pruefe("Deckt die Angabe nicht alle Lücken ab (die unscharfe fehlt), gibt es keine Freigabe (seitenNichtAbgedeckt)", teil === "seitenNichtAbgedeckt", String(teil));
    pruefe("Ohne gültige Angabe bleibt das Dokument ungeprüft und es gibt keine Zeile in wissen_seiten_vermerk", (await status(mit)).join() === "ungeprueft" && (await vermerkZeilen(mit)) === 0);

    const erg = await entscheideUeberUpload("freigeben", mit, { ...d, pruefer: { id: ZWEITE }, seitenBestaetigt: "48-49, 276, 278", seitenVermerk: "Leere Seiten im Buch" });
    pruefe("Mit allen korrekt fehlenden Seiten wird freigegeben", erg.abschnitte > 0 && (await status(mit)).join() === "freigegeben" && erg.seitenBestaetigt === "48-49, 276, 278" && erg.seitenFehlend === 4);
    const { data: vz } = await dienst.from("wissen_seiten_vermerk").select("quelle_id, vermerk, bestaetigte_seiten, fehlende_seiten, vermerkt_von").eq("quelle_id", mit);
    const v = ((vz ?? []) as { vermerk: string | null; bestaetigte_seiten: string | null; fehlende_seiten: string | null; vermerkt_von: string | null }[])[0];
    pruefe(
      "Die Bestätigung liegt mit bestätigten Seiten, Grund, fehlenden Seiten und prüfender Person in wissen_seiten_vermerk",
      v?.vermerk === "Leere Seiten im Buch" && v?.bestaetigte_seiten === "48-49, 276, 278" && v?.fehlende_seiten === STELLEN && v?.vermerkt_von === ZWEITE,
      JSON.stringify(v),
    );
    const nachher = await liste(mit);
    pruefe(
      "Liste: bestätigte Seiten, Grund und keine offenen Seiten mehr",
      nachher?.seitenBestaetigt === "48-49, 276, 278" && nachher?.seitenVermerk === "Leere Seiten im Buch" && nachher?.seitenVermerkt === true && nachher?.seitenOffen === 0 && nachher?.seitenFehlend === 4,
    );
    const qNachher = await berechneQualitaetFuer(dienst, mit);
    pruefe(
      "Qualität: vorher mit Abzug für 4 offene Seiten, nach der Bestätigung ohne (die reine Textqualität)",
      qVorher !== null && qNachher !== null && qNachher.prozent > qVorher.prozent && qNachher.prozent === (await textProzent(mit)),
      `${qVorher?.prozent} -> ${qNachher?.prozent}`,
    );

    // Zeilen aus der Zeit des Freitext-Vermerks (ohne bestaetigte_seiten) gelten weiter als bestätigt
    const alt = await hochladen("Vermerk Buch alter Vermerk", `${TEXT_A} alter Vermerk`, "vermerk-alt.txt");
    await seitenpruefung(alt, 2, "10-11 (9)");
    await dienst.from("wissen_seiten_vermerk").upsert({ quelle_id: alt, vermerk: "Leere Seiten im Buch", fehlende_seiten: "10-11 (9)", vermerkt_von: ZWEITE });
    const altZeile = await liste(alt);
    const qAlt = await berechneQualitaetFuer(dienst, alt);
    pruefe(
      "Ein früherer Freitext-Vermerk gilt als bestätigt: nichts offen, kein Abzug in der Qualität",
      altZeile?.seitenOffen === 0 && altZeile?.seitenBestaetigt === null && altZeile?.seitenVermerkt === true && qAlt?.prozent === (await textProzent(alt)),
    );

    const anonLesen = await anon.from("wissen_seiten_vermerk").select("quelle_id").limit(1);
    pruefe("wissen_seiten_vermerk ist für anonyme Aufrufe gesperrt", anonLesen.error !== null || (anonLesen.data ?? []).length === 0, anonLesen.error?.message ?? "keine Daten");

    // Ablehnen braucht keine Angabe, und ein Buch ohne Luecken auch nicht
    const abg = await hochladen("Vermerk Buch zum Ablehnen", `${TEXT_A} abgelehnt`, "vermerk-abg.txt");
    await seitenpruefung(abg, 2, "10-11 (9)");
    const abgErg = await entscheideUeberUpload("ablehnen", abg, { ...d, pruefer: { id: ZWEITE } });
    pruefe("Ablehnen geht ohne Angabe, auch bei Seitenlücken", abgErg.abschnitte > 0 && (await status(abg)).join() === "abgelehnt" && (await vermerkZeilen(abg)) === 0);

    const sauber = await hochladen("Vermerk Buch ohne Luecken", TEXT_B, "vermerk-b.txt");
    await seitenpruefung(sauber, 0, "");
    const saubErg = await entscheideUeberUpload("freigeben", sauber, { ...d, pruefer: { id: ZWEITE } });
    pruefe("Ein Buch ohne Seitenlücken braucht keine Angabe und legt keine ab", saubErg.seitenFehlend === 0 && (await status(sauber)).join() === "freigegeben" && (await vermerkZeilen(sauber)) === 0);

    // Loeschen nimmt die Bestaetigung mit
    await loescheHochgeladenesDokument(mit, { speicher, umgebung: {}, schema: "public" });
    pruefe("Löschen des Dokuments entfernt auch die Bestätigung", (await vermerkZeilen(mit)) === 0);
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
