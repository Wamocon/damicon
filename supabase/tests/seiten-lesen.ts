// Seitenweises Lesen (src/lib/data/util.ts, leseAlleZeilen): PostgREST kappt jede Antwort bei max_rows (Supabase: 1000) OHNE Fehler.
// Pruefung PR #156 (15.10.2026): ЕСУТД-Liste, Bewertung der Abholstopps und die Dublettenpruefung des Logger-Imports lasen ohne Seiten und verloren
// ab der 1001. Zeile still Zeilen. Reine Funktion, kein Netz, keine Datenbank.
//
// Aufruf: npm run test:seiten-lesen

import { readFileSync } from "node:fs";
import { leseAlleZeilen, SEITE_ZEILEN } from "@/lib/data/util";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

/** Eine Abfrage, die wie PostgREST antwortet: die Zeilen von bis bis, hoechstens so viele wie im Bereich. */
function quelle(n: number, fehlerBeiSeite?: number) {
  const aufrufe: [number, number][] = [];
  const seite = async (von: number, bis: number) => {
    aufrufe.push([von, bis]);
    if (fehlerBeiSeite !== undefined && aufrufe.length === fehlerBeiSeite) return { data: null, error: { message: "timeout" } };
    return { data: Array.from({ length: Math.max(0, Math.min(bis + 1, n) - von) }, (_, i) => von + i), error: null };
  };
  return { seite, aufrufe };
}

async function main() {
  pruefe("Seitengroesse: 1000 wie max_rows von Supabase", SEITE_ZEILEN === 1000);

  const klein = quelle(7);
  const r1 = await leseAlleZeilen(klein.seite, { seitenGroesse: 3 });
  pruefe("Sieben Zeilen in Seiten zu drei: alle da, in Reihenfolge, drei Anfragen", r1.zeilen.join() === "0,1,2,3,4,5,6" && klein.aufrufe.length === 3 && !r1.abgeschnitten, JSON.stringify(klein.aufrufe));
  pruefe("Die Bereiche schliessen aneinander an (von, bis einschliesslich)", JSON.stringify(klein.aufrufe) === JSON.stringify([[0, 2], [3, 5], [6, 8]]));

  const genau = quelle(6);
  const r2 = await leseAlleZeilen(genau.seite, { seitenGroesse: 3 });
  pruefe("Genau zwei volle Seiten: eine dritte, leere Anfrage beendet das Lesen, nichts doppelt", r2.zeilen.length === 6 && genau.aufrufe.length === 3 && !r2.abgeschnitten);

  const keine = quelle(0);
  const r3 = await leseAlleZeilen(keine.seite);
  pruefe("Keine Zeilen: leere Liste nach einer Anfrage", r3.zeilen.length === 0 && keine.aufrufe.length === 1 && !r3.abgeschnitten);

  const gross = quelle(1440);
  const r4 = await leseAlleZeilen(gross.seite);
  pruefe("1440 Zeilen (ein Logger-Tag) mit der Standardgroesse: alle 1440, zwei Anfragen (ohne Seiten blieben 1000)", r4.zeilen.length === 1440 && gross.aufrufe.length === 2 && new Set(r4.zeilen).size === 1440);

  const viel = quelle(100);
  const r5 = await leseAlleZeilen(viel.seite, { seitenGroesse: 10, maxSeiten: 4 });
  pruefe("Obergrenze der Seiten: gekuerzt und als abgeschnitten gekennzeichnet", r5.zeilen.length === 40 && r5.abgeschnitten && viel.aufrufe.length === 4);

  const kaputt = quelle(50, 2);
  const wurf = await leseAlleZeilen(kaputt.seite, { seitenGroesse: 20 }).then(() => "kein Fehler", (e) => String(e));
  pruefe("Ein Fehler mitten im Lesen wirft (kein halbes Ergebnis, das wie vollstaendig aussieht)", wurf.includes("timeout"), wurf);

  // Die Lesepfade benutzen es wirklich (Quelltextpruefung: ein Rueckfall auf das Lesen ohne Seiten faellt auf)
  const lies = (pfad: string) => readFileSync(pfad, "utf8").replace(/\r\n/g, "\n");
  const esutd = lies("src/lib/data/esutd.ts");
  pruefe("ЕСУТД-Liste: seitenweise, nur offene und erfasste, feste Reihenfolge", esutd.includes("leseAlleZeilen(") && esutd.includes('.in("status", ["offen", "erfasst"])') && esutd.includes('.order("quelle").order("id").range(von, bis)'));
  pruefe("ЕСУТД-Liste: die Ansichten bekommen bei einem Fehler eine leere Liste mit Protokoll, der Export wirft", esutd.includes("export async function ladeEsutdMeldungenStreng") && /ladeEsutdMeldungen\(\)[\s\S]{0,200}try \{[\s\S]{0,120}ladeEsutdMeldungenStreng/.test(esutd));
  const route = lies("src/app/api/esutd/export/route.ts");
  pruefe("ЕСУТД-Export: ein Lesefehler ergibt 500 statt einer leeren Datei mit 200", route.includes("ladeEsutdMeldungenStreng") && route.includes("textAntwort(") && route.includes(", 500)"));
  const runden = lies("src/lib/data/abholrunden.ts");
  pruefe("Abholrunden: die Bewertung wird nur zu den gelesenen Runden gelesen (nicht alle Stopps, bei 1000 gekappt)", runden.includes('.in("runde_id", rundenIds)') && !/from\("v_abholstopps_kuehlkette"\)\.select\([^)]*\)\s*\n?\s*\]/.test(runden));
  pruefe("Abholrunden: Nachbarbetriebe kommen aus der Funktion, nicht aus der Tabelle (ИИН/БИН bleiben der Brigade verborgen)", runden.includes('rpc("abholrunde_nachbarbetriebe")') && !/abholstopps \([^`]*nachbarbetriebe \(/.test(runden));
  const logger = lies("src/lib/actions/logger-import.ts");
  pruefe("Logger-Import: die vorhandenen Messungen werden seitenweise gelesen (1440 Werte sind der Normalfall)", logger.includes("leseAlleZeilen(") && logger.includes('.order("gemessen_am").order("id").range(von, bis)'));

  console.log(`\n${gesamt - fehler}/${gesamt} bestanden`);
  if (fehler > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
