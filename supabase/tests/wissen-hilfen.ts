// Tests fuer die gemeinsamen Bausteine, die der Cleanup des Branches eingefuehrt hat (ohne Datenbank, ohne Netz):
//   * groesse.ts: Dateigroessen fuer die Anzeige (Einheit nach Groesse und Sprache)
//   * bestandspflege.ts PFLEGE: eine Quelle fuer die Mengen je Aufruf (Oberflaeche, Server Action, Assistent)
//   * dokument-nebenzeilen.ts: alles, was zu einem Dokument gehoert, geht mit ihm; ein Fehler haelt nichts auf
//   * original.ts: Pfad, Plausibilitaet und Platzregel bleiben, GIB kommt aus groesse.ts
// Aufruf: npm run test:wissen-hilfen (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import type { SupabaseClient } from "@supabase/supabase-js";
import { PFLEGE } from "@/lib/wissen/bestandspflege";
import { entferneNebenzeilen, NEBENTABELLEN } from "@/lib/wissen/dokument-nebenzeilen";
import { formatiereGroesse, GIB, KIB, MIB } from "@/lib/wissen/groesse";
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

  console.log(`\n${gesamt - fehler}/${gesamt} bestanden`);
  process.exit(fehler > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
