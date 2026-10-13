// =============================================================================
// Damicon - Bestandspflege gegen ECHTES Postgres (wissen_naehe, Grabstein wissen_entfernt, Entfernen mit Wortgewichten)
// =============================================================================
// Ausfuehren:  npx tsx --env-file=.env.local supabase/tests/wissen-bestandspflege-db.ts   (Teil von npm run test:wissen-db)
// Voraussetzung: laufende LOKALE Supabase-Instanz mit allen Migrationen und Demo-Zugaengen (npm run db:seed-auth).
// Sicherheitsnetz wie die anderen Datenbanktests: nur lokal, nur eigene Zeilen (Praefix test-pflege/), am Ende aufgeraeumt.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { DB_OPTION } from "@/lib/supabase/schema";
import { bewerteNaehe } from "@/lib/wissen/bestandspflege";
import { entferneDokument, PflegeFehler } from "@/lib/wissen/bestandspflege-entfernen";
import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";
import { verarbeiteUpload } from "@/lib/wissen/hochladen";
import { loescheHochgeladenesDokument, rechneGewichteZurueck } from "@/lib/wissen/loeschen";
import { dokumentQualitaet } from "@/lib/wissen/qualitaet";
import { baueWissenVerwaltungWerkzeuge } from "@/lib/ai/wissen-verwaltung-werkzeug";
import { bestandsSpeicher, berechneQualitaetFuer, ladeNaehe } from "@/lib/wissen/speicher-bestandspflege";
import { supabaseSpeicher } from "@/lib/wissen/speicher-supabase";
import { einbettung } from "./hilfe/synthetische-einbettung";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("Fehlende Env-Variablen. Aufruf: npx tsx --env-file=.env.local supabase/tests/wissen-bestandspflege-db.ts");
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
const bytes = (s: string) => new TextEncoder().encode(s);

const T1 =
  "Qzpflege Mehrwertsteuer Einfuhr Befreiung Gesetzestext Artikel Voraussetzung Verwendung Produktion Warenliste Planungsbehoerde Verfahren zustaendige Behoerde Frist Zahlung Erstattung Steuerschuld Entstehung Zeitpunkt Bemessungsgrundlage Zollwert Beschaffung Lieferung Leistung Unternehmer Nachweis Dokumente Aufbewahrung";
const T1_VARIANTE = `${T1} Zusatz Seitenkopf Webseite`;
const T2 =
  "Qzpflege Lebensmittelaudit Zertifizierung Lieferantenbewertung Hygiene Rueckverfolgbarkeit Schulungen Kontrollpunkte Dokumentenlenkung Korrekturmassnahmen Auditbericht Kennzahlen Schaedlingsbekaempfung Reinigungsplan Wareneingang Temperaturkontrolle Allergenmanagement Kalibrierung Wartungsplan Krisenmanagement Rueckrufverfahren Lieferantenaudit Managementbewertung interne Audits Nichtkonformitaeten Verbesserungsprozess Verantwortlichkeiten Notfallplan";
// Eigener Text fuer das Buch mit Luecken: derselbe Inhalt wie B wuerde als Dublette auf B zeigen.
const T_LUECKEN = `${T2} Seitenluecken Scan Fehlbestand Nachscan Kontrolle Vollstaendigkeit`;
const T2_ZWEITE = `${T2} Nachtrag`;

async function main() {
  const { data: profile } = await dienst.from("profiles").select("id, email").eq("email", "admin@damicon.demo");
  const ADMIN = (profile as { id: string }[] | null)?.[0]?.id;
  if (!ADMIN) throw new Error("Demo-Zugaenge fehlen (npm run db:seed-auth)");

  const speicher = supabaseSpeicher(dienst);
  const pflege = bestandsSpeicher(dienst);
  const jetzt = new Date("2026-10-13T10:00:00.000Z");
  const d = { speicher, einbettung, jetzt: () => jetzt, umgebung: {}, schema: "public" };
  const dp = { speicher: pflege, umgebung: {}, schema: "public" };
  const ids: Record<string, string> = {};
  const A = "test-pflege/bestand-a.md";
  const B = "test-pflege/bestand-b.md";
  const C = "test-pflege/bestand-c.md";
  const aufraeumen = async () => {
    // Mit Rueckrechnung der Wortgewichte (wie das Entfernen): ein blosses Loeschen liesse df und idf verschoben zurueck, und der naechste Lauf von wissen-upload-db.ts sah das als Abweichung.
    for (const q of [A, B, C]) {
      const sparse = await pflege.loescheDokument(q);
      if (sparse.length > 0) await rechneGewichteZurueck(sparse, speicher);
    }
    await dienst.from("wissen_entfernt").delete().like("quelle_id", "test-pflege/%");
    await dienst.from("wissen_qualitaet").delete().like("quelle_id", "test-pflege/%");
    for (const q of Object.values(ids)) if (q.startsWith("upload:")) await loescheHochgeladenesDokument(q, { speicher, umgebung: {}, schema: "public" }).catch(() => undefined);
  };
  await aufraeumen();

  // Ein Upload wird nachtraeglich zum "Bestandsdokument" gemacht (kein Upload-Marker, eigene quelle_id), in zwei Schritten wegen des Waechters.
  const alsBestand = async (quelleId: string, neu: string) => {
    const e1 = await dienst.from("wissen_chunks").update({ extra: {}, quelle_id: neu }).eq("quelle_id", quelleId);
    if (e1.error) throw new Error(`Umbau 1: ${e1.error.message}`);
    const e2 = await dienst.from("wissen_chunks").update({ pruefstatus: "freigegeben" }).eq("quelle_id", neu);
    if (e2.error) throw new Error(`Umbau 2: ${e2.error.message}`);
  };

  try {
    const hochladen = async (titel: string, text: string, datei: string) => {
      const r = await verarbeiteUpload(
        { titel, bereich: "recht", quellenart: "fachliteratur", rollen: ["admin"], dateiname: datei, bytes: bytes(text), hochgeladenVon: { id: ADMIN, name: "Test Admin" }, url: "https://beispiel.example/x" },
        d,
      );
      return r.quelleId;
    };
    const buch = await hochladen("Pflege Testbuch Mehrwertsteuer", T1, "pflege-buch.txt");
    ids.buch = buch;
    const a = await hochladen("Pflege Bestand A", T1_VARIANTE, "pflege-a.txt");
    const b = await hochladen("Pflege Bestand B", T2, "pflege-b.txt");
    const c = await hochladen("Pflege Bestand C", T2_ZWEITE, "pflege-c.txt");
    await alsBestand(a, A);
    await alsBestand(b, B);
    await alsBestand(c, C);

    // ---- wissen_naehe ---------------------------------------------------------------------------------------------------------------------
    const nA = await ladeNaehe(dienst, A, 6);
    pruefe("wissen_naehe: ein Abschnitt, ähnlichster Fremdabschnitt ist das Buch (Upload)", nA.naehe.proben.length >= 1 && nA.naehe.proben[0]!.quelleId === buch && nA.naehe.proben[0]!.istUpload === true && nA.naehe.proben[0]!.aehnlichkeit > 0.9, JSON.stringify(nA.naehe.proben[0]));
    const dokA: WissenDokumentZeile = { schluessel: A, schluesselSpalte: "quelle_id", titel: "Pflege Bestand A", herkunft: "skript", chunks: 1 } as WissenDokumentZeile;
    pruefe("Bewertung: Bestand gegen Buch ist abgedeckt", bewerteNaehe(dokA, nA.naehe).some((x) => x.grund === "abgedeckt" && x.vergleichMit === buch));

    const nB = await ladeNaehe(dienst, B, 6);
    pruefe("wissen_naehe: Bestand B findet Bestand C als nächsten (kein Buch)", nB.naehe.proben[0]?.quelleId === C && nB.naehe.proben[0]?.istUpload === false && nB.naehe.proben[0]!.aehnlichkeit > 0.9, JSON.stringify(nB.naehe.proben[0]));
    const dokB: WissenDokumentZeile = { schluessel: B, schluesselSpalte: "quelle_id", titel: "Pflege Bestand B", herkunft: "skript", chunks: 1 } as WissenDokumentZeile;
    pruefe("Bewertung: Bestand B ist Dublette von C (nicht abgedeckt)", bewerteNaehe(dokB, nB.naehe).some((x) => x.grund === "dublette" && x.vergleichMit === C) && !bewerteNaehe(dokB, nB.naehe).some((x) => x.grund === "abgedeckt"));
    pruefe("wissen_naehe: das Dokument vergleicht sich nie mit sich selbst", nA.naehe.proben.every((p) => p.quelleId !== A) && nB.naehe.proben.every((p) => p.quelleId !== B));
    pruefe("wissen_naehe: unbekanntes Dokument liefert nichts", (await ladeNaehe(dienst, "test-pflege/gibt-es-nicht.md", 6)).naehe.proben.length === 0);

    // Schutz: nur der Dienst darf vergleichen und Grabsteine sehen
    const anonNaehe = await anon.rpc("wissen_naehe", { p_quelle_id: A, p_proben: 3 });
    pruefe("wissen_naehe ist für anonyme Aufrufe gesperrt", anonNaehe.error !== null || (anonNaehe.data ?? []).length === 0, anonNaehe.error?.message ?? "keine Daten");
    const anonGrab = await anon.from("wissen_entfernt").select("quelle_id").limit(1);
    pruefe("wissen_entfernt ist für anonyme Aufrufe gesperrt", anonGrab.error !== null || (anonGrab.data ?? []).length === 0, anonGrab.error?.message ?? "keine Daten");

    // ---- Assistent: wissenBestandAnalysieren (nur lesend, gleiche Funde wie die Oberfläche) -----------------------------------------------
    type Ausfuehren = (eingabe: unknown, optionen: unknown) => Promise<Record<string, unknown>>;
    const werkzeug = baueWissenVerwaltungWerkzeuge("admin")!.wissenBestandAnalysieren.execute as unknown as Ausfuehren;
    const aufruf = { toolCallId: "t", messages: [] };
    type Funde = { dokumente: { schluessel: string; stufe: string; befunde: { art: string; mitKennung?: string }[] }[]; vergleich: { naechstesAb: number | null; gesamt: number } | null; zaehlung: { art: Record<string, number> } };
    const schnell = (await werkzeug({}, aufruf)) as unknown as Funde;
    pruefe("Assistent: ohne mitVergleich laufen nur die schnellen Prüfungen (kein Fund bei Dublette oder Abdeckung, vergleich ist null)", schnell.vergleich === null && !schnell.dokumente.some((x) => x.befunde.some((b) => b.art === "dublette" || b.art === "abgedeckt")));
    let ab = 0;
    const alleFunde = new Map<string, { art: string; mitKennung?: string }[]>();
    for (let runde = 0; runde < 20; runde++) {
      const r = (await werkzeug({ mitVergleich: true, ab, limit: 40 }, aufruf)) as unknown as Funde;
      for (const x of r.dokumente) alleFunde.set(x.schluessel, [...(alleFunde.get(x.schluessel) ?? []), ...x.befunde]);
      if (r.vergleich?.naechstesAb === null || r.vergleich === null) break;
      ab = r.vergleich.naechstesAb;
    }
    pruefe("Assistent: mit mitVergleich und ab (Paging) findet er B als Dublette von C", (alleFunde.get(B) ?? []).some((b) => b.art === "dublette" && b.mitKennung === C), JSON.stringify(alleFunde.get(B)));
    pruefe("Assistent: A ist durch das Buch abgedeckt", (alleFunde.get(A) ?? []).some((b) => b.art === "abgedeckt" && b.mitKennung === buch), JSON.stringify(alleFunde.get(A)));
    const nurAbgedeckt = (await werkzeug({ mitVergleich: true, art: "abgedeckt", limit: 40 }, aufruf)) as unknown as Funde;
    pruefe("Assistent: der Filter art zeigt nur diese Befundart", nurAbgedeckt.dokumente.every((x) => x.befunde.every((b) => b.art === "abgedeckt")));
    const wortlaut = (await werkzeug({ vergleich: { dokument: A, mit: buch } }, aufruf)) as unknown as { paare?: { aehnlichkeit: number; bestand: string; gegenueber: string }[]; fehler?: string };
    pruefe("Assistent: der Vergleich liefert Abschnittspaare im Wortlaut", (wortlaut.paare?.length ?? 0) >= 1 && (wortlaut.paare?.[0]?.bestand ?? "").includes("Mehrwertsteuer") && (wortlaut.paare?.[0]?.gegenueber ?? "").includes("Mehrwertsteuer"), JSON.stringify(wortlaut).slice(0, 200));
    const schlecht = (await werkzeug({ vergleich: { dokument: "abcd", mit: buch } }, aufruf)) as unknown as { fehler?: string };
    pruefe("Assistent: eine Kennung mit Steuerzeichen wird beim Vergleich abgelehnt", typeof schlecht.fehler === "string");
    const vorherAnzahl = await speicher.zaehleChunks();
    await werkzeug({ mitVergleich: true, limit: 40 }, aufruf);
    pruefe("Assistent: die Prüfung verändert nichts (Zahl der Abschnitte gleich)", (await speicher.zaehleChunks()) === vorherAnzahl);

    // ---- Qualität in Prozent (wissen_qualitaet, wissen_liste().guete_prozent) -------------------------------------------------------------
    const qB = await berechneQualitaetFuer(dienst, B);
    pruefe("Qualität: für ein Dokument mit Text wird ein Wert von 0 bis 100 berechnet", qB !== null && Number.isInteger(qB.prozent) && qB.prozent >= 0 && qB.prozent <= 100, JSON.stringify(qB));
    const { data: qZeile } = await dienst.from("wissen_qualitaet").select("quelle_id, prozent").eq("quelle_id", B);
    pruefe("Qualität: der Wert liegt in wissen_qualitaet", (qZeile ?? []).length === 1 && (qZeile as { prozent: number }[])[0]!.prozent === qB?.prozent);
    await berechneQualitaetFuer(dienst, A); // wird unten mit dem Dokument entfernt
    const qNochmal = await berechneQualitaetFuer(dienst, B);
    const { data: qZeilen2 } = await dienst.from("wissen_qualitaet").select("quelle_id").eq("quelle_id", B);
    pruefe("Qualität: erneutes Berechnen überschreibt (eine Zeile, gleicher Wert)", qNochmal?.prozent === qB?.prozent && (qZeilen2 ?? []).length === 1);
    pruefe("Qualität: unbekanntes Dokument ergibt keinen Wert und schreibt nichts", (await berechneQualitaetFuer(dienst, "test-pflege/gibt-es-nicht.md")) === null && ((await dienst.from("wissen_qualitaet").select("quelle_id").eq("quelle_id", "test-pflege/gibt-es-nicht.md")).data ?? []).length === 0);
    const liste = await dienst.rpc("wissen_liste");
    const zeilenListe = (liste.data ?? []) as { quelle_id: string | null; guete_prozent: number | null }[];
    pruefe("Liste: wissen_liste() liefert guete_prozent für das berechnete Dokument", zeilenListe.find((z) => z.quelle_id === B)?.guete_prozent === qB?.prozent, JSON.stringify(zeilenListe.find((z) => z.quelle_id === B)));
    pruefe("Liste: ein Dokument ohne berechneten Wert hat null", zeilenListe.find((z) => z.quelle_id === C)?.guete_prozent === null);
    const anonQualitaet = await anon.from("wissen_qualitaet").select("quelle_id").limit(1);
    pruefe("wissen_qualitaet ist für anonyme Aufrufe gesperrt", anonQualitaet.error !== null || (anonQualitaet.data ?? []).length === 0, anonQualitaet.error?.message ?? "keine Daten");
    // Buch mit fehlenden Scanseiten: der Wert sinkt um den Vollständigkeitsfaktor (extra.seiten_pruefung wird beim Hochladen mitgeschrieben)
    const mitLuecken = await verarbeiteUpload(
      { titel: "Pflege Buch mit Lücken", bereich: "recht", quellenart: "fachliteratur", rollen: ["admin"], dateiname: "pflege-luecken.txt", bytes: bytes(T_LUECKEN), hochgeladenVon: { id: ADMIN, name: "Test Admin" }, url: "https://beispiel.example/y" },
      d,
    );
    // Die Seitenprüfung schreibt sonst der Buch-Upload in extra; hier wird sie nachgetragen (extra darf geändert werden, siehe alsBestand).
    const { data: luckenZeilen } = await dienst.from("wissen_chunks").select("id, extra").eq("quelle_id", mitLuecken.quelleId);
    for (const z of (luckenZeilen ?? []) as { id: string; extra: Record<string, unknown> }[]) {
      const u = await dienst.from("wissen_chunks").update({ extra: { ...z.extra, seiten_pruefung: { seiten: 100, fehlend: 10, stellen: "1-10", abdeckung: 90 } } }).eq("id", z.id);
      if (u.error) throw new Error(`Seitenprüfung nachtragen: ${u.error.message}`);
    }
    ids.luecken = mitLuecken.quelleId;
    const qOhneLuecken = dokumentQualitaet([T_LUECKEN]);
    const qLuecken = await berechneQualitaetFuer(dienst, mitLuecken.quelleId);
    pruefe("Qualität: fehlende Scanseiten (10 von 100) mindern den Wert um den Faktor", qOhneLuecken !== null && qLuecken !== null && qLuecken.prozent < qOhneLuecken.prozent && Math.abs(qLuecken.prozent - qOhneLuecken.prozent * 0.5) <= 1, JSON.stringify({ qOhneLuecken, qLuecken }));
    await loescheHochgeladenesDokument(mitLuecken.quelleId, { speicher, umgebung: {}, schema: "public" });
    ids.luecken = "";
    pruefe("Qualität: Löschen eines Uploads entfernt auch seinen Qualitätswert", ((await dienst.from("wissen_qualitaet").select("quelle_id").eq("quelle_id", mitLuecken.quelleId)).data ?? []).length === 0);

    // ---- Entfernen ------------------------------------------------------------------------------------------------------------------------
    const vorher = await speicher.zaehleChunks();
    const infoVorher = await speicher.ladeQuellenInfo(A);
    const e = await entferneDokument(A, "Durch Buch abgedeckt (Test)", ADMIN, dp);
    pruefe("Entfernen: Bestandsdokument ist weg, Ergebnis nennt die Abschnitte", e.geloescht === infoVorher.anzahl && !e.schonWeg && !e.upload && (await speicher.ladeQuellenInfo(A)).anzahl === 0, JSON.stringify(e));
    pruefe("Entfernen: die Gesamtzahl der Abschnitte sinkt genau darum", (await speicher.zaehleChunks()) === vorher - infoVorher.anzahl);
    const { data: grab } = await dienst.from("wissen_entfernt").select("quelle_id, titel, grund, abschnitte, entfernt_von").eq("quelle_id", A);
    const g = (grab ?? [])[0] as { titel: string | null; grund: string; abschnitte: number; entfernt_von: string | null } | undefined;
    pruefe("Grabstein: Titel, Grund, Abschnitte und die entfernende Person stehen drin", g?.grund === "Durch Buch abgedeckt (Test)" && g?.abschnitte === infoVorher.anzahl && g?.entfernt_von === ADMIN && g?.titel === "Pflege Bestand A", JSON.stringify(g));
    const zweites = await entferneDokument(A, "noch einmal", ADMIN, dp);
    pruefe("Wiederholbar: zweites Entfernen meldet 'schon weg'", zweites.schonWeg && zweites.geloescht === 0);
    pruefe("Entfernen: der Qualitätswert des Dokuments verschwindet mit ihm", ((await dienst.from("wissen_qualitaet").select("quelle_id").eq("quelle_id", A)).data ?? []).length === 0);
    pruefe("Andere Dokumente bleiben (B, C und das Buch)", (await speicher.ladeQuellenInfo(B)).anzahl > 0 && (await speicher.ladeQuellenInfo(C)).anzahl > 0 && (await speicher.ladeQuellenInfo(buch)).anzahl > 0);

    const naeheNachA = await ladeNaehe(dienst, B, 6);
    pruefe("Nach dem Entfernen von A findet B weiter C (die Suche ist intakt)", naeheNachA.naehe.proben[0]?.quelleId === C);

    // Entfernen eines Uploads (Buch) geht ebenfalls, mit Kennzeichnung
    const eb = await entferneDokument(buch, "Test: Buch entfernen", ADMIN, dp);
    pruefe("Auch ein Upload lässt sich entfernen (Kennzeichnung upload)", eb.upload && eb.geloescht > 0 && (await speicher.ladeQuellenInfo(buch)).anzahl === 0);
    ids.buch = "";

    // Fehler: ungültige Eingabe, Vorschau-Schutz
    const code = async (f: () => Promise<unknown>) => {
      try {
        await f();
        return "kein-fehler";
      } catch (x) {
        return x instanceof PflegeFehler ? x.code : `andere:${String(x)}`;
      }
    };
    pruefe("Eingabe: leerer Grund wird abgelehnt, nichts passiert", (await code(() => entferneDokument(B, " ", ADMIN, dp))) === "eingabe" && (await speicher.ladeQuellenInfo(B)).anzahl > 0);
    pruefe("Vorschau-Schutz: Vorschau mit Schema public entfernt nichts", (await code(() => entferneDokument(B, "x", ADMIN, { ...dp, umgebung: { VERCEL_ENV: "preview" } }))) === "umgebung" && (await speicher.ladeQuellenInfo(B)).anzahl > 0);
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
