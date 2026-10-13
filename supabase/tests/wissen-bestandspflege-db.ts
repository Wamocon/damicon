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
import type { Einbettung } from "@/lib/wissen/embed";
import { verarbeiteUpload } from "@/lib/wissen/hochladen";
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import { tokens } from "@/lib/wissen/sparse";
import { bestandsSpeicher, ladeNaehe } from "@/lib/wissen/speicher-bestandspflege";
import { supabaseSpeicher } from "@/lib/wissen/speicher-supabase";

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

const T1 =
  "Qzpflege Mehrwertsteuer Einfuhr Befreiung Gesetzestext Artikel Voraussetzung Verwendung Produktion Warenliste Planungsbehoerde Verfahren zustaendige Behoerde Frist Zahlung Erstattung Steuerschuld Entstehung Zeitpunkt Bemessungsgrundlage Zollwert Beschaffung Lieferung Leistung Unternehmer Nachweis Dokumente Aufbewahrung";
const T1_VARIANTE = `${T1} Zusatz Seitenkopf Webseite`;
const T2 =
  "Qzpflege Lebensmittelaudit Zertifizierung Lieferantenbewertung Hygiene Rueckverfolgbarkeit Schulungen Kontrollpunkte Dokumentenlenkung Korrekturmassnahmen Auditbericht Kennzahlen Schaedlingsbekaempfung Reinigungsplan Wareneingang Temperaturkontrolle Allergenmanagement Kalibrierung Wartungsplan Krisenmanagement Rueckrufverfahren Lieferantenaudit Managementbewertung interne Audits Nichtkonformitaeten Verbesserungsprozess Verantwortlichkeiten Notfallplan";
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
    for (const q of [A, B, C]) await dienst.from("wissen_chunks").delete().eq("quelle_id", q);
    await dienst.from("wissen_entfernt").delete().like("quelle_id", "test-pflege/%");
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
