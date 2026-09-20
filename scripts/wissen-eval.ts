// Bewertet die Wissenssuche gegen einen Satz Testfragen mit erwarteten Belegen.
//
//   npx tsx scripts/wissen-eval.ts [--datei supabase/tests/wissen-eval.json] [--limit 6]
//
// Je Frage wird geprueft, an welcher Stelle der Trefferliste der ERSTE Beleg steht, der
// alle Bedingungen erfuellt (Muster auf Text, Fundstelle oder Titel). Ausgegeben werden:
//   - Trefferquote in den ersten 1, 3 und 6 Belegen (recall@k)
//   - mittlerer Rang des ersten richtigen Belegs (MRR)
//   - Antwortzeiten (Median und p95)
//   - Sperrfragen: Rollen, die einen Bereich NICHT sehen duerfen, muessen leer ausgehen
// Exit-Code 1, wenn eine Untergrenze unterschritten wird (recall@6 unter 0,85, Sperrfrage verletzt).

import { readFileSync } from "node:fs";
import type { Role } from "../src/lib/rbac";
import { supabaseKlient } from "./wissen-supabase-klient";
import { sucheWissen, type Beleg } from "../src/lib/wissen/suche";

interface Bedingung {
  feld: "text" | "fundstelle" | "titel" | "bereich" | "sprache" | "stufe";
  muster: string;
}
interface Fall {
  id: string;
  frage: string;
  russisch?: string;
  rolle?: Role;
  /** Alle Bedingungen muessen im SELBEN Beleg erfuellt sein. */
  erwartet?: Bedingung[];
  /** Diese Rolle darf nichts finden (Bereichs- oder Rollensperre). */
  sollLeerSein?: boolean;
}

const datei = process.argv.includes("--datei") ? process.argv[process.argv.indexOf("--datei") + 1]! : "supabase/tests/wissen-eval.json";
const limit = process.argv.includes("--limit") ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : 6;
const faelle = JSON.parse(readFileSync(datei, "utf8")) as Fall[];

const erfuellt = (b: Beleg, bed: Bedingung[]) =>
  bed.every((x) => new RegExp(x.muster, "i").test(String((b as unknown as Record<string, unknown>)[x.feld] ?? "")));

async function main() {
  const zeiten: number[] = [];
  let mitErwartung = 0;
  let treffer1 = 0;
  let treffer3 = 0;
  let treffer6 = 0;
  let rangSumme = 0;
  let sperrVerletzt = 0;

  for (const f of faelle) {
    const r = await sucheWissen({ frage: f.frage, frageRussisch: f.russisch }, f.rolle ?? "admin", { limit, supabase: supabaseKlient() });
    zeiten.push(r.dauerMs.gesamt);
    if (f.sollLeerSein) {
      const ok = r.belege.length === 0;
      if (!ok) sperrVerletzt += 1;
      console.log(`${ok ? "PASS" : "FAIL"}  [${f.id}] Sperre (${f.rolle}): ${r.belege.length} Belege`);
      continue;
    }
    if (!f.erwartet) continue;
    mitErwartung += 1;
    const rang = r.belege.findIndex((b) => erfuellt(b, f.erwartet!)) + 1;
    if (rang === 1) treffer1 += 1;
    if (rang >= 1 && rang <= 3) treffer3 += 1;
    if (rang >= 1 && rang <= limit) treffer6 += 1;
    rangSumme += rang > 0 ? 1 / rang : 0;
    console.log(`${rang > 0 ? "PASS" : "FAIL"}  [${f.id}] Rang ${rang || "-"}  ${r.dauerMs.gesamt} ms  ${f.frage.slice(0, 70)}`);
    if (rang === 0) console.log(`        gefunden: ${r.belege.map((b) => b.fundstelle.slice(0, 50)).join(" | ")}`);
  }

  const sortiert = [...zeiten].sort((a, b) => a - b);
  const p = (q: number) => sortiert[Math.min(sortiert.length - 1, Math.floor(q * sortiert.length))]!;
  const anteil = (n: number) => `${((n / Math.max(1, mitErwartung)) * 100).toFixed(0)} %`;
  console.log(`\nFragen mit Erwartung: ${mitErwartung}`);
  console.log(`recall@1 ${anteil(treffer1)} | recall@3 ${anteil(treffer3)} | recall@${limit} ${anteil(treffer6)} | MRR ${(rangSumme / Math.max(1, mitErwartung)).toFixed(2)}`);
  console.log(`Antwortzeit: Median ${p(0.5)} ms | p95 ${p(0.95)} ms | max ${sortiert.at(-1)} ms`);
  console.log(`Sperrfragen verletzt: ${sperrVerletzt}`);
  const zuSchwach = mitErwartung > 0 && treffer6 / mitErwartung < 0.85;
  if (zuSchwach || sperrVerletzt > 0) {
    console.log(`\nUNTERGRENZE VERFEHLT (recall@${limit} >= 85 %, keine Sperre verletzt)`);
    process.exit(1);
  }
  console.log("\nUntergrenzen eingehalten.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
