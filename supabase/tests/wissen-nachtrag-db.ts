// =============================================================================
// Damicon - fehlende Scanseiten nachladen und bestaetigen gegen ECHTES Postgres
// =============================================================================
// Ausfuehren:  npx tsx --env-file=.env.local supabase/tests/wissen-nachtrag-db.ts   (Teil von npm run test:wissen-db)
// Voraussetzung: laufende LOKALE Supabase-Instanz mit allen Migrationen (20261206000000) und Demo-Zugaengen (npm run db:seed-auth).
//
// Geprueft werden gegen echte Zeilen: das Einreihen der nachgeladenen Abschnitte an der Stelle der Luecke (teil und teile im Paket), die Stellen-Auswahl,
// das Merken des Nachtrags, die Freigabe mit Bestaetigung der korrekt fehlenden Seiten, die Qualitaet (offene Seiten mindern sie, bestaetigte und
// nachgeladene nicht), die Liste (wissen_liste), die Rechte (nur service_role) und das Loeschen samt Nebenzeilen.
// Sicherheitsnetz wie die anderen Datenbanktests: nur lokal, nur eigene Zeilen, am Ende aufgeraeumt.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { DB_OPTION } from "@/lib/supabase/schema";
import { sha256Hex, teileInPakete } from "@/lib/wissen/buch-text";
import { ladePaket, starteBuch, type BuchKopf } from "@/lib/wissen/buch-upload";
import { gruppiereWissenDokumente, type WissenListeZeile } from "@/lib/wissen/dokumente-liste";
import { entscheideUeberUpload } from "@/lib/wissen/freigabe";
import { UploadFehler } from "@/lib/wissen/hochladen";
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import { ladeNachtrag } from "@/lib/wissen/nachtrag";
import { dokumentQualitaet } from "@/lib/wissen/qualitaet";
import { berechneQualitaetFuer } from "@/lib/wissen/speicher-bestandspflege";
import { supabaseNachtrag } from "@/lib/wissen/speicher-nachtrag";
import { supabaseSpeicher } from "@/lib/wissen/speicher-supabase";
import { uploadQuelleId } from "@/lib/wissen/upload-quelle";
import { einbettung } from "./hilfe/synthetische-einbettung";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("Fehlende Env-Variablen. Aufruf: npx tsx --env-file=.env.local supabase/tests/wissen-nachtrag-db.ts");
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

// Fantasiewoerter, damit der Test den echten Korpus nicht beruehrt.
const SILBEN = ["qxa", "qxe", "qxi", "qxo", "qxu", "zva", "zve", "zvi", "zvo", "zvu"];
const fantasiewort = (n: number) => "qz" + SILBEN[n % 10]! + SILBEN[Math.floor(n / 10) % 10]! + SILBEN[Math.floor(n / 100) % 10]!;
function buchText(absaetze: number, vorsatz = "Kapitel"): string {
  const teile: string[] = [];
  let z = 0;
  for (let a = 0; a < absaetze; a++) {
    const saetze: string[] = [];
    for (let s = 0; s < 8; s++) {
      const woerter: string[] = [];
      for (let w = 0; w < 14; w++) woerter.push(fantasiewort(z++ % 1000));
      saetze.push(`${woerter.join(" ")}.`);
    }
    teile.push(`${vorsatz} ${a + 1}. ${saetze.join(" ")}`);
  }
  return teile.join("\n\n");
}

interface ChunkKurz {
  id: string;
  chunk_id: string | null;
  pfad: string;
  teil: number | null;
  teile: number | null;
  text: string;
  extra: Record<string, unknown>;
}

async function main() {
  const { data: profile } = await dienst.from("profiles").select("id, email").in("email", ["admin@damicon.demo", "ceo@damicon.demo"]);
  const profile2 = (profile ?? []) as { id: string; email: string }[];
  const ADMIN = profile2.find((p) => p.email === "admin@damicon.demo")?.id;
  const ZWEITE = profile2.find((p) => p.email === "ceo@damicon.demo")?.id;
  if (!ADMIN || !ZWEITE) throw new Error("Demo-Zugaenge fehlen (npm run db:seed-auth)");

  const speicher = supabaseSpeicher(dienst);
  const nachtragSpeicher = supabaseNachtrag(dienst);
  const jetzt = () => new Date("2026-10-13T10:00:00.000Z");
  const d = { speicher, einbettung, jetzt, umgebung: {}, schema: "public" };
  const nd = { ...d, nachtrag: nachtragSpeicher, pruefer: { id: ZWEITE } };
  const ich = { id: ADMIN, name: "Test Admin" };
  const ids: string[] = [];

  const aufraeumen = async () => {
    for (const q of ids) await loescheHochgeladenesDokument(q, { speicher, umgebung: {}, schema: "public" }).catch(() => undefined);
    await dienst.from("wissen_chunks").delete().in("quelle_id", ids);
    await dienst.from("wissen_seiten_vermerk").delete().in("quelle_id", ids);
    await dienst.from("wissen_seiten_nachtrag").delete().in("quelle_id", ids);
    await dienst.from("wissen_qualitaet").delete().in("quelle_id", ids);
  };

  const STELLEN = "48-49 (47), 2@276-278 (PDF 271-273)";
  const buch = async (titel: string, dateiname: string, vorsatz: string, seiten: BuchKopf["seiten"]) => {
    const text = buchText(110, vorsatz);
    const pakete = teileInPakete(text, 30_000);
    const hash = await sha256Hex(text);
    const quelleId = uploadQuelleId(hash);
    ids.push(quelleId);
    await dienst.from("wissen_chunks").delete().eq("quelle_id", quelleId);
    const kopf: BuchKopf = { titel, bereich: "recht", rollen: ["buchhaltung"], dateiname, hash, quellenart: "fachliteratur", cluster: "buecher", pakete: pakete.length, zeichen: text.length, seiten };
    await starteBuch(kopf, ich, d);
    for (let i = 0; i < pakete.length; i++) await ladePaket({ ...kopf, nr: i + 1, text: pakete[i]! }, ich, d);
    return { quelleId, pakete: pakete.length };
  };
  const chunksVon = async (q: string, paket?: number): Promise<ChunkKurz[]> => {
    let abfrage = dienst.from("wissen_chunks").select("id, chunk_id, pfad, teil, teile, text, extra").eq("quelle_id", q);
    if (paket !== undefined) abfrage = abfrage.eq("extra->>paket", String(paket));
    const { data, error } = await abfrage.order("pfad").order("teil").order("id");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ChunkKurz[];
  };
  const fehlerCode = async (f: () => Promise<unknown>) => {
    try {
      await f();
      return "kein-fehler";
    } catch (x) {
      return x instanceof UploadFehler ? x.code : `andere:${String(x)}`;
    }
  };
  const liste = async (q: string) => gruppiereWissenDokumente(((await dienst.rpc("wissen_liste")).data ?? []) as WissenListeZeile[]).find((x) => x.schluessel === q);
  const prozent = async (q: string) => (await dienst.from("wissen_qualitaet").select("prozent").eq("quelle_id", q).single()).data?.prozent as number | undefined;
  const textProzent = async (q: string) => dokumentQualitaet((await chunksVon(q)).map((c) => c.text), null)?.prozent;

  await aufraeumen();
  try {
    // ---- Buch mit zwei Luecken: 48-49 (genau) in Paket 2 bei 50 Prozent, 2 Seiten unscharf in Paket 3 am Ende -----------------------------------
    const { quelleId: Q, pakete } = await buch("Nachtrag Testbuch", "nachtrag-a.txt", "Kapitel", { seiten: 100, fehlend: 4, stellen: STELLEN, abdeckung: 90, orte: "2:500,3:1000" });
    pruefe("Aufbau: das Buch hat mindestens drei Pakete", pakete >= 3, String(pakete));

    const basis = await nachtragSpeicher.ladeBasis(Q);
    pruefe("Basis: Titel, Paketzahl, nächste Nummer und Orte kommen aus der ersten Zeile", basis?.meta.titel === "Nachtrag Testbuch" && basis?.paketeGesamt === pakete && basis?.naechsteNr === 1 && basis?.meta.seiten?.orte === "2:500,3:1000" && basis?.meta.dateiname === "nachtrag-a.txt", JSON.stringify([basis?.meta.titel, basis?.paketeGesamt, basis?.naechsteNr, basis?.meta.dateiname]));
    pruefe("Basis: ein unbekanntes Buch ergibt null", (await nachtragSpeicher.ladeBasis("upload:" + "0".repeat(32))) === null);

    const stelle = await nachtragSpeicher.findeStelle(Q, 2, 500);
    const paket2Vorher = await chunksVon(Q, 2);
    pruefe("Stelle: Pfad des Pakets und ungefähr die Hälfte der Abschnitte vorn", stelle !== null && stelle.pfad === paket2Vorher[0]?.pfad && Math.abs(stelle.davor - paket2Vorher.length / 2) <= 2, JSON.stringify([stelle, paket2Vorher.length]));
    pruefe("Stelle: ein Paket, das es nicht gibt, ergibt null", (await nachtragSpeicher.findeStelle(Q, 99, 500)) === null);

    const q1Vorher = await berechneQualitaetFuer(dienst, Q);
    const text1 = await textProzent(Q);
    pruefe("Qualität: offene fehlende Seiten mindern sie", q1Vorher !== null && text1 !== undefined && q1Vorher.prozent < text1, `${q1Vorher?.prozent} gegen ${text1}`);

    // ---- Nachtrag ---------------------------------------------------------------------------------------------------------------------------
    const nachText = `${buchText(2, "Qznachtrag")}`;
    const info0 = await speicher.ladeFreigabeInfo(Q);
    pruefe("Info vorher: nichts nachgeladen, Orte vorhanden", info0.seitenNachgeladen === null && info0.seitenOrte === "2:500,3:1000" && info0.seitenFehlend === 4);
    const erg = await ladeNachtrag({ quelleId: Q, gruppen: [{ seiten: [48, 49], text: nachText }] }, nd);
    pruefe("Nachtrag: das Ergebnis nennt Seiten, Abschnitte und die 2 noch offenen Seiten", erg.seiten === "48-49" && erg.abschnitte > 0 && erg.offen === 2, JSON.stringify(erg));

    const paket2 = await chunksVon(Q, 2);
    const neue = paket2.filter((c) => c.chunk_id === `${Q}#n1`);
    pruefe("Einreihen: die neuen Abschnitte stehen im Paket 2", neue.length === erg.abschnitte && paket2.length === paket2Vorher.length + neue.length, `${neue.length} neu, ${paket2.length} im Paket`);
    pruefe("Einreihen: teil läuft fortlaufend von 0 (wie im Chunker) bis zur Zahl der Abschnitte minus 1, teile stimmt für alle", paket2.every((c, i) => c.teil === i && c.teile === paket2.length));
    const ersterNeuer = paket2.findIndex((c) => c.chunk_id === `${Q}#n1`);
    const zeichenDavor = paket2.slice(0, ersterNeuer).reduce((s, c) => s + c.text.length, 0);
    const zeichenAlt = paket2Vorher.reduce((s, c) => s + c.text.length, 0);
    pruefe("Einreihen: die neuen Abschnitte liegen in der Mitte des Pakets (Lücke bei 50 Prozent)", Math.abs(zeichenDavor / zeichenAlt - 0.5) < 0.12, `${(zeichenDavor / zeichenAlt).toFixed(2)}`);
    pruefe("Einreihen: die neuen Abschnitte folgen aufeinander", neue.every((c, i) => paket2[ersterNeuer + i]?.id === c.id));
    pruefe("Einreihen: die alten Abschnitte behalten ihre Reihenfolge", paket2.filter((c) => c.chunk_id !== `${Q}#n1`).map((c) => c.id).join() === paket2Vorher.map((c) => c.id).join());
    pruefe("Einreihen: die neuen Abschnitte sind ungeprüft, mit Paketnummer und Herkunft des Buchs", neue.every((c) => c.extra.paket === 2 && c.extra.hochgeladen_von === ADMIN && c.extra.quelle === "upload"));
    const paket3 = await chunksVon(Q, 3);
    pruefe("Einreihen: andere Pakete bleiben unberührt", paket3.every((c, i) => c.teil === i && c.teile === paket3.length));
    const reihenfolge = (await chunksVon(Q)).map((c) => Number(c.extra.paket));
    pruefe("Einreihen: die Pakete stehen in aufsteigender Reihenfolge", reihenfolge.every((p, i) => i === 0 || reihenfolge[i - 1]! <= p));

    const info1 = await speicher.ladeFreigabeInfo(Q);
    pruefe("Info nachher: die nachgeladenen Seiten sind gemerkt", info1.seitenNachgeladen === "48-49");
    const { data: nz } = await dienst.from("wissen_seiten_nachtrag").select("nr, seiten, abschnitte, nachgeladen_von").eq("quelle_id", Q);
    const n = ((nz ?? []) as { nr: number; seiten: string; abschnitte: number; nachgeladen_von: string | null }[])[0];
    pruefe("Nachtrag-Zeile: Nummer, Seiten, Zahl der Abschnitte und nachladende Person", n?.nr === 1 && n?.seiten === "48-49" && n?.abschnitte === neue.length && n?.nachgeladen_von === ZWEITE, JSON.stringify(n));

    const l1 = await liste(Q);
    pruefe("Liste: nachgeladen 48-49, offen sind noch 2 Seiten (unscharf)", l1?.seitenNachgeladen === "48-49" && l1?.seitenOffen === 2 && l1?.seitenFehlend === 4, JSON.stringify([l1?.seitenNachgeladen, l1?.seitenOffen, l1?.seitenFehlend]));
    const q1Nachher = await berechneQualitaetFuer(dienst, Q);
    pruefe("Qualität: nach dem Nachladen weniger Abzug (2 statt 4 offene Seiten)", q1Nachher !== null && q1Vorher !== null && q1Nachher.prozent > q1Vorher.prozent, `${q1Vorher?.prozent} -> ${q1Nachher?.prozent}`);

    // Ein zweiter Nachtrag in dieselbe Lücke ist nicht mehr möglich (nicht mehr offen)
    const anzahlNachNachtrag = (await chunksVon(Q)).length;
    pruefe("Nachtrag: die schon nachgeladenen Seiten sind nicht mehr offen", (await fehlerCode(() => ladeNachtrag({ quelleId: Q, gruppen: [{ seiten: [48], text: nachText }] }, nd))) === "nachtragUngueltig");
    pruefe("Nachtrag: Seiten, die zu keiner Lücke gehören, werden abgelehnt", (await fehlerCode(() => ladeNachtrag({ quelleId: Q, gruppen: [{ seiten: [500], text: nachText }] }, nd))) === "nachtragUngueltig");
    pruefe("Nachtrag: abgelehnte Nachträge schreiben nichts", (await chunksVon(Q)).length === anzahlNachNachtrag);

    // ---- Freigabe mit Bestaetigung ------------------------------------------------------------------------------------------------------------
    const freigabe = (angabe: string | null, grund?: string | null) => entscheideUeberUpload("freigeben", Q, { ...d, pruefer: { id: ZWEITE }, seitenBestaetigt: angabe, seitenVermerk: grund });
    pruefe("Freigabe: ohne Bestätigung der noch offenen Seiten nicht möglich", (await fehlerCode(() => freigabe(null))) === "seitenNichtBestaetigt");
    pruefe("Freigabe: die nachgeladenen Seiten müssen nicht bestätigt werden, die offenen schon (nur 276 reicht nicht)", (await fehlerCode(() => freigabe("276"))) === "seitenNichtAbgedeckt");
    pruefe("Freigabe: die Angabe 48-49 deckt nichts mehr, denn die Seiten sind schon nachgeladen", (await fehlerCode(() => freigabe("48-49"))) === "seitenNichtAbgedeckt");
    pruefe("Freigabe: bis hier ist nichts abgelegt und das Buch wartet weiter", ((await dienst.from("wissen_seiten_vermerk").select("quelle_id").eq("quelle_id", Q)).data ?? []).length === 0 && (await chunksVon(Q)).every((c) => (c.extra as { quelle?: string }).quelle === "upload"));
    const frei = await freigabe("276, 277", "Notizseiten am Ende");
    pruefe("Freigabe: mit den korrekt fehlenden Seiten 276 und 277 wird freigegeben", frei.abschnitte > 0 && frei.seitenBestaetigt === "276-277" && frei.seitenFehlend === 2 && frei.seitenVermerk === "Notizseiten am Ende", JSON.stringify(frei));
    const { data: vz } = await dienst.from("wissen_seiten_vermerk").select("vermerk, bestaetigte_seiten, fehlende_seiten, vermerkt_von").eq("quelle_id", Q);
    const v = ((vz ?? []) as { vermerk: string | null; bestaetigte_seiten: string | null; fehlende_seiten: string | null; vermerkt_von: string | null }[])[0];
    pruefe("Bestätigung abgelegt: bestätigte Seiten, Grund, Stellen und prüfende Person", v?.bestaetigte_seiten === "276-277" && v?.vermerk === "Notizseiten am Ende" && v?.fehlende_seiten === STELLEN && v?.vermerkt_von === ZWEITE, JSON.stringify(v));
    const l2 = await liste(Q);
    pruefe("Liste: bestätigt, nichts mehr offen", l2?.seitenBestaetigt === "276-277" && l2?.seitenOffen === 0 && l2?.seitenVermerkt === true && l2?.seitenVermerk === "Notizseiten am Ende");
    const q2 = await berechneQualitaetFuer(dienst, Q);
    const text2 = await textProzent(Q);
    pruefe("Qualität: bestätigt fehlende Seiten zählen nicht, es bleibt die reine Textqualität", q2 !== null && q2.prozent === text2, `${q2?.prozent} gegen ${text2}`);
    pruefe("Nachtrag: in ein freigegebenes Buch geht nichts mehr", (await fehlerCode(() => ladeNachtrag({ quelleId: Q, gruppen: [{ seiten: [277], text: nachText }] }, nd))) === "nichtPruefbar");

    // ---- Alle Luecken nachgeladen: Freigabe ohne Bestaetigung ------------------------------------------------------------------------------
    const B = await buch("Nachtrag Testbuch B", "nachtrag-b.txt", "Abschnitt", { seiten: 100, fehlend: 2, stellen: "48-49 (47)", abdeckung: 90, orte: "1:0" });
    await ladeNachtrag({ quelleId: B.quelleId, gruppen: [{ seiten: [48, 49], text: buchText(1, "Qznachtragb") }] }, nd);
    const paket1 = await chunksVon(B.quelleId, 1);
    pruefe("Einreihen: Lücke am Anfang des Pakets (Promille 0): die neuen Abschnitte stehen ganz vorn", paket1[0]?.chunk_id === `${B.quelleId}#n1` && paket1.every((c, i) => c.teil === i));
    const lb = await liste(B.quelleId);
    pruefe("Liste: alle Lücken nachgeladen, nichts offen", lb?.seitenOffen === 0 && lb?.seitenNachgeladen === "48-49");
    const qb = await berechneQualitaetFuer(dienst, B.quelleId);
    pruefe("Qualität: alle nachgeladen, kein Abzug", qb?.prozent === (await textProzent(B.quelleId)));
    const fb = await entscheideUeberUpload("freigeben", B.quelleId, { ...d, pruefer: { id: ZWEITE } });
    pruefe("Freigabe: alle Lücken nachgeladen, es braucht keine Bestätigung und es wird nichts abgelegt", fb.seitenFehlend === 0 && fb.seitenBestaetigt === null && ((await dienst.from("wissen_seiten_vermerk").select("quelle_id").eq("quelle_id", B.quelleId)).data ?? []).length === 0);

    // ---- Ablehnen und Loeschen ---------------------------------------------------------------------------------------------------------------
    const C = await buch("Nachtrag Testbuch C", "nachtrag-c.txt", "Teil", { seiten: 100, fehlend: 2, stellen: "48-49 (47)", abdeckung: 90, orte: "1:500" });
    await ladeNachtrag({ quelleId: C.quelleId, gruppen: [{ seiten: [48], text: buchText(1, "Qznachtragc") }] }, nd);
    const abg = await entscheideUeberUpload("ablehnen", C.quelleId, { ...d, pruefer: { id: ZWEITE } });
    pruefe("Ablehnen: geht auch mit offenen Lücken ohne Angabe", abg.abschnitte > 0);
    await loescheHochgeladenesDokument(Q, { speicher, umgebung: {}, schema: "public" });
    await loescheHochgeladenesDokument(C.quelleId, { speicher, umgebung: {}, schema: "public" });
    const uebrig = async (tabelle: string, q: string) => ((await dienst.from(tabelle).select("quelle_id").eq("quelle_id", q)).data ?? []).length;
    pruefe("Löschen: entfernt die Abschnitte samt Nachtrag-Abschnitten", (await chunksVon(Q)).length === 0 && (await chunksVon(C.quelleId)).length === 0);
    pruefe("Löschen: nimmt Nachtrag-Zeilen, Bestätigung und Qualitätswert mit", (await uebrig("wissen_seiten_nachtrag", Q)) === 0 && (await uebrig("wissen_seiten_nachtrag", C.quelleId)) === 0 && (await uebrig("wissen_seiten_vermerk", Q)) === 0 && (await uebrig("wissen_qualitaet", Q)) === 0);

    // ---- Rechte ----------------------------------------------------------------------------------------------------------------------------------
    const a1 = await anon.from("wissen_seiten_nachtrag").select("quelle_id").limit(1);
    pruefe("Rechte: wissen_seiten_nachtrag ist für anonyme Aufrufe gesperrt", a1.error !== null || (a1.data ?? []).length === 0);
    const a2 = await anon.rpc("wissen_nachtrag_einreihen", { p_quelle_id: Q, p_pfad: "x", p_neue: [], p_nach: 0 });
    pruefe("Rechte: wissen_nachtrag_einreihen darf nur der Dienst aufrufen", a2.error !== null, a2.error?.message ?? "kein Fehler");
    const a3 = await anon.rpc("wissen_liste");
    pruefe("Rechte: wissen_liste bleibt für anonyme Aufrufe gesperrt", a3.error !== null);
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
