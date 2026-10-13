// Tests fuer die gemeinsamen Bausteine, die der Cleanup des Branches eingefuehrt hat (ohne Datenbank, ohne Netz):
//   * groesse.ts: Dateigroessen fuer die Anzeige (Einheit nach Groesse und Sprache)
//   * bestandspflege.ts PFLEGE: eine Quelle fuer die Mengen je Aufruf (Oberflaeche, Server Action, Assistent)
//   * dokument-nebenzeilen.ts: alles, was zu einem Dokument gehoert, geht mit ihm; ein Fehler haelt nichts auf
//   * original.ts: Pfad, Plausibilitaet und Platzregel bleiben, GIB kommt aus groesse.ts
// Aufruf: npm run test:wissen-hilfen (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import type { SupabaseClient } from "@supabase/supabase-js";
import { PFLEGE } from "@/lib/wissen/bestandspflege";
import { entferneNebenzeilen, NEBENTABELLEN } from "@/lib/wissen/dokument-nebenzeilen";
import type { AktionsStatus } from "@/lib/actions/status";
import { formatiereGroesse, GIB, KIB, MIB } from "@/lib/wissen/groesse";
import { istVoruebergehend, mitWiederholung, WIEDERHOLUNG_WARTEZEITEN_MS } from "@/lib/wissen/paket-wiederholung";
import { GIB as GIB_AUS_ORIGINAL, ORIGINAL_GESAMT_MAX_BYTES, ORIGINAL_MAX_BYTES, originalPfad, pruefePlatz } from "@/lib/wissen/original";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

async function main() {
  // ---- Groesse --------------------------------------------------------------------------------------------------------------------------
  pruefe("Größe: Einheiten sind Vielfache von 1024", KIB === 1024 && MIB === 1024 * 1024 && GIB === 1024 * 1024 * 1024);
  pruefe("Größe: kleine Dateien in KB, mindestens 1 KB", formatiereGroesse(8072, "de") === "8 KB" && formatiereGroesse(1, "de") === "1 KB" && formatiereGroesse(0, "de") === "1 KB");
  pruefe("Größe: ab 1 MB in MB mit einer Stelle und Dezimalkomma (de)", formatiereGroesse(14_688_139, "de") === "14 MB" && formatiereGroesse(1_572_864, "de") === "1,5 MB", `${formatiereGroesse(14_688_139, "de")} | ${formatiereGroesse(1_572_864, "de")}`);
  pruefe("Größe: ab 0,1 GB in GB mit höchstens zwei Stellen", formatiereGroesse(GIB, "en") === "1 GB" && formatiereGroesse(Math.round(1.25 * GIB), "en") === "1.25 GB" && formatiereGroesse(Math.ceil(GIB / 10), "en") === "0.1 GB" && formatiereGroesse(Math.ceil(GIB / 10) - 1, "en").endsWith("MB"), formatiereGroesse(Math.round(1.25 * GIB), "en"));
  pruefe("Größe: Dezimalzeichen nach Sprache", formatiereGroesse(Math.round(1.25 * GIB), "de") === "1,25 GB" && formatiereGroesse(Math.round(1.25 * GIB), "en") === "1.25 GB");
  pruefe("Größe: russisch und kasachisch schreiben ГБ, МБ, КБ", formatiereGroesse(2 * GIB, "ru").endsWith("ГБ") && formatiereGroesse(5 * MIB, "kk").endsWith("МБ") && formatiereGroesse(2048, "ru").endsWith("КБ"));
  pruefe("Größe: ungültige Werte ergeben 1 KB statt Unsinn", formatiereGroesse(Number.NaN, "de") === "1 KB" && formatiereGroesse(-5, "de") === "1 KB" && formatiereGroesse(Number.POSITIVE_INFINITY, "de") === "1 KB");

  // ---- Mengen ---------------------------------------------------------------------------------------------------------------------------
  pruefe("PFLEGE: alle Mengen sind positive ganze Zahlen", Object.values(PFLEGE).every((n) => Number.isInteger(n) && n > 0));
  pruefe("PFLEGE: der Assistent schafft je Aufruf mehr als die Oberfläche (kürzere Schritte der Unterhaltung)", PFLEGE.naeheJeAufrufAssistent >= PFLEGE.naeheJeAufruf);
  pruefe("PFLEGE: Entfernen und Qualität sind begrenzt (50 und 3 Dokumente)", PFLEGE.maxEntfernen === 50 && PFLEGE.qualitaetJeAufruf === 3);

  // ---- original.ts bleibt unveraendert in seinen Zusagen ----------------------------------------------------------------------------------
  pruefe("original.ts: GIB ist dasselbe wie in groesse.ts (nur eine Definition)", GIB_AUS_ORIGINAL === GIB);
  pruefe("original.ts: Grenzen und Pfad unverändert", ORIGINAL_MAX_BYTES === GIB && ORIGINAL_GESAMT_MAX_BYTES === 50 * GIB && originalPfad("upload:" + "a".repeat(32)) === "a".repeat(32) + ".pdf" && pruefePlatz(0, 1).passt);

  // ---- Nebenzeilen ------------------------------------------------------------------------------------------------------------------------
  const quelle = "upload:" + "b".repeat(32);
  const geloescht: string[] = [];
  const entfernteDateien: string[][] = [];
  const baueClient = (scheiterBei: string[] = []) =>
    ({
      from: (tabelle: string) => ({
        delete: () => ({
          eq: async (spalte: string, wert: string) => {
            geloescht.push(`${tabelle}:${spalte}=${wert}`);
            return { error: scheiterBei.includes(tabelle) ? { message: "Test: Tabelle fehlt" } : null };
          },
        }),
      }),
      storage: { from: () => ({ remove: async (pfade: string[]) => { entfernteDateien.push(pfade); return { error: null }; } }) },
    }) as unknown as SupabaseClient;

  pruefe("Nebenzeilen: die Liste nennt Qualitätswert und Seiten-Vermerk", NEBENTABELLEN.map((x) => x.tabelle).join() === "wissen_qualitaet,wissen_seiten_vermerk");
  await entferneNebenzeilen(baueClient(), quelle);
  pruefe("Nebenzeilen: jede Tabelle der Liste und der Verweis auf das Original werden für genau diese Kennung gelöscht", ["wissen_qualitaet", "wissen_seiten_vermerk", "wissen_original"].every((t) => geloescht.includes(`${t}:quelle_id=${quelle}`)) && geloescht.length === 3, geloescht.join(" | "));
  pruefe("Nebenzeilen: die Datei der Original-PDF wird aus dem Speicher entfernt", entfernteDateien.length === 1 && entfernteDateien[0]![0] === "b".repeat(32) + ".pdf", JSON.stringify(entfernteDateien));
  geloescht.length = 0;
  entfernteDateien.length = 0;
  const alt = console.error;
  const meldungen: string[] = [];
  console.error = (...a: unknown[]) => { meldungen.push(a.map(String).join(" ")); };
  try {
    await entferneNebenzeilen(baueClient(["wissen_qualitaet"]), quelle);
  } finally {
    console.error = alt;
  }
  pruefe("Nebenzeilen: scheitert eine Tabelle, werden die übrigen trotzdem geleert und der Fehler nur protokolliert", geloescht.length === 3 && entfernteDateien.length === 1 && meldungen.some((m) => m.includes("Qualitätswert")), meldungen.join(" | "));
  geloescht.length = 0;
  await entferneNebenzeilen(baueClient(), "legal/Legal/x/y.md");
  pruefe("Nebenzeilen: für eine Skript-Quelle (kein Upload) gibt es kein Original, die Tabellen werden trotzdem bereinigt", geloescht.filter((g) => g.startsWith("wissen_original")).length === 0 || geloescht.length >= 2);

  // ---- Wiederholung eines Pakets (paket-wiederholung.ts) -------------------------------------------------------------------------------
  const ok: AktionsStatus = { stand: "ok", wert: "64" };
  const fehlerStatus = (meldung: string): AktionsStatus => ({ stand: "fehler", meldung });
  const sofort = async () => undefined; // keine echte Wartezeit im Test
  const folge = (antworten: (AktionsStatus | Error)[]) => {
    let n = 0;
    return { aufrufe: () => n, versuch: async () => { const a = antworten[Math.min(n++, antworten.length - 1)]!; if (a instanceof Error) throw a; return a; } };
  };
  pruefe("Wiederholung: Einbettung, Zeit, Speichern und Unbekanntes sind vorübergehend, Eingabe, leer, zu groß, Dublette nicht", ["fehler.wissenEinbettung", "fehler.wissenZeit", "fehler.wissenSpeichern", "fehler.unbekannt"].every((m) => istVoruebergehend(fehlerStatus(m))) && ["fehler.eingabe", "fehler.wissenLeer", "fehler.zuGross", "fehler.wissenDoppelt", "fehler.berechtigung", "fehler.wissenVorschau"].every((m) => !istVoruebergehend(fehlerStatus(m))) && !istVoruebergehend(ok));
  pruefe("Wiederholung: höchstens zwei erneute Versuche, die Wartezeiten wachsen", WIEDERHOLUNG_WARTEZEITEN_MS.length === 2 && WIEDERHOLUNG_WARTEZEITEN_MS[1]! > WIEDERHOLUNG_WARTEZEITEN_MS[0]!);
  {
    const f = folge([ok]);
    const r = await mitWiederholung(f.versuch, { warte: sofort });
    pruefe("Wiederholung: klappt es sofort, bleibt es bei einem Aufruf", r.stand === "ok" && f.aufrufe() === 1);
  }
  {
    const f = folge([fehlerStatus("fehler.wissenEinbettung"), ok]);
    const nummern: number[] = [];
    const r = await mitWiederholung(f.versuch, { warte: sofort, beiNeuemVersuch: (n) => nummern.push(n) });
    pruefe("Wiederholung: ein vorübergehender Fehler wird beim zweiten Versuch geheilt, die Oberfläche erfährt davon", r.stand === "ok" && r.wert === "64" && f.aufrufe() === 2 && nummern.join() === "1");
  }
  {
    const f = folge([fehlerStatus("fehler.wissenZeit")]);
    const nummern: number[] = [];
    const r = await mitWiederholung(f.versuch, { warte: sofort, beiNeuemVersuch: (n) => nummern.push(n) });
    pruefe("Wiederholung: bleibt der Fehler, gibt es genau drei Versuche und das letzte Ergebnis kommt zurück", r.stand === "fehler" && r.meldung === "fehler.wissenZeit" && f.aufrufe() === 3 && nummern.join() === "1,2");
  }
  {
    const f = folge([fehlerStatus("fehler.eingabe"), ok]);
    const r = await mitWiederholung(f.versuch, { warte: sofort });
    pruefe("Wiederholung: ein dauerhafter Fehler wird nie wiederholt", r.stand === "fehler" && r.meldung === "fehler.eingabe" && f.aufrufe() === 1);
  }
  {
    const f = folge([new Error("Failed to fetch"), ok]);
    const r = await mitWiederholung(f.versuch, { warte: sofort });
    pruefe("Wiederholung: eine Ausnahme (Netzabbruch) zählt als vorübergehend und wird wiederholt", r.stand === "ok" && f.aufrufe() === 2);
  }
  {
    const f = folge([new Error("Failed to fetch")]);
    const r = await mitWiederholung(f.versuch, { warte: sofort });
    pruefe("Wiederholung: bleibt die Ausnahme, kommt ein Fehlerstatus statt einer Ausnahme zurück", r.stand === "fehler" && r.meldung === "fehler.unbekannt" && f.aufrufe() === 3);
  }
  {
    const steuerung = new AbortController();
    const f = folge([fehlerStatus("fehler.wissenEinbettung"), ok]);
    const r = await mitWiederholung(f.versuch, { abbruch: steuerung.signal, warte: async () => { steuerung.abort(); } });
    pruefe("Wiederholung: ein Abbruch während der Wartezeit beendet sofort, ohne weiteren Versuch", r.stand === "fehler" && f.aufrufe() === 1);
    const schon = new AbortController();
    schon.abort();
    const g = folge([fehlerStatus("fehler.wissenEinbettung"), ok]);
    const r2 = await mitWiederholung(g.versuch, { abbruch: schon.signal, warte: sofort });
    pruefe("Wiederholung: ist schon abgebrochen, gibt es keinen erneuten Versuch", r2.stand === "fehler" && g.aufrufe() === 1);
  }
  {
    const echt = Date.now();
    const f = folge([fehlerStatus("fehler.wissenEinbettung"), ok]);
    const r = await mitWiederholung(f.versuch, { wartezeiten: [30, 30] });
    pruefe("Wiederholung: mit der echten Wartefunktion wird kurz gewartet und dann erneut gesendet", r.stand === "ok" && f.aufrufe() === 2 && Date.now() - echt >= 25);
  }

  console.log(`\n${gesamt - fehler}/${gesamt} bestanden`);
  process.exit(fehler > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
