// ETL: Wissensbasis aus Qdrant nach Supabase (pgvector) uebertragen.
//
//   Lokal (Docker):   npx tsx scripts/wissen-nach-supabase.ts
//   Gehostet:         NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/wissen-nach-supabase.ts --ja
//
// Optionen:  --bereinigen   Zeilen loeschen, die es in Qdrant nicht (mehr) gibt (Spiegel statt Zusatz)
//            --trocken      nur zaehlen und pruefen, nichts schreiben
//            --ja           erlaubt ein gehostetes Ziel (ohne diese Option verweigert das Skript es)
//
// Was passiert: alle Punkte (Payload, dichter und sparser Vektor) werden aus Qdrant gelesen, die
// Dokumenthaeufigkeit je Wort wird berechnet (IDF fuer die lexikalische Suche, siehe Migration
// 20261102000000_wissen_pgvector.sql) und alles wird idempotent per Upsert geschrieben. Ein zweiter
// Lauf aendert nichts. Die Vektoren werden 1:1 uebernommen, es wird NICHT neu eingebettet: das
// Einbettungsmodell steht im Payload (embed_modell) und im Importprotokoll.

import { createClient } from "@supabase/supabase-js";
import { qdrantAusUmgebung } from "../src/lib/wissen/qdrant";
import { alsSparsevec, sparseIndex } from "../src/lib/wissen/sparse";

interface QdrantPunkt {
  id: string;
  payload: Record<string, unknown>;
  vector: { dense: number[]; text: { indices: number[]; values: number[] } };
}

const BEKANNT = new Set([
  "chunk_id", "quelle_id", "norm_id", "sprache", "autoritaetsstufe", "rechtsstelle", "titel", "gueltig_ab",
  "gueltig_bis", "ist_ueberholt", "ersetzt_durch", "abgerufen_am", "url", "konfidenz", "pfad", "bereich", "teil",
  "teile", "kontext", "text", "rollen", "eingelesen_am", "embed_modell",
]);

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const zahl = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function lesePunkte(): Promise<QdrantPunkt[]> {
  const q = qdrantAusUmgebung();
  const punkte: QdrantPunkt[] = [];
  let offset: string | number | null = null;
  do {
    const antwort = await fetch(`${q.url}/collections/${q.sammlung}/points/scroll`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(q.apiKey ? { "api-key": q.apiKey } : {}) },
      body: JSON.stringify({ limit: 256, offset, with_payload: true, with_vector: true }),
    });
    if (!antwort.ok) throw new Error(`Qdrant scroll: ${antwort.status} ${(await antwort.text()).slice(0, 200)}`);
    const daten = (await antwort.json()) as { result: { points: QdrantPunkt[]; next_page_offset: string | number | null } };
    punkte.push(...daten.result.points);
    offset = daten.result.next_page_offset;
    process.stdout.write(`\r  aus Qdrant gelesen: ${punkte.length}`);
  } while (offset !== null);
  process.stdout.write("\n");
  return punkte;
}

function zeile(p: QdrantPunkt) {
  const pl = p.payload;
  const extra = Object.fromEntries(Object.entries(pl).filter(([k]) => !BEKANNT.has(k)));
  return {
    id: String(p.id),
    chunk_id: str(pl.chunk_id),
    quelle_id: str(pl.quelle_id),
    norm_id: str(pl.norm_id),
    sprache: str(pl.sprache) ?? "de",
    autoritaetsstufe: zahl(pl.autoritaetsstufe),
    rechtsstelle: str(pl.rechtsstelle),
    titel: str(pl.titel),
    gueltig_ab: str(pl.gueltig_ab),
    gueltig_bis: str(pl.gueltig_bis),
    ist_ueberholt: pl.ist_ueberholt === true,
    ersetzt_durch: str(pl.ersetzt_durch),
    abgerufen_am: str(pl.abgerufen_am),
    url: str(pl.url),
    konfidenz: str(pl.konfidenz),
    pfad: str(pl.pfad),
    bereich: str(pl.bereich) ?? "unbekannt",
    teil: zahl(pl.teil),
    teile: zahl(pl.teile),
    kontext: str(pl.kontext),
    text: str(pl.text) ?? "",
    rollen: Array.isArray(pl.rollen) ? (pl.rollen as unknown[]).filter((r): r is string => typeof r === "string") : [],
    eingelesen_am: str(pl.eingelesen_am),
    embed_modell: str(pl.embed_modell),
    extra,
    dense: `[${p.vector.dense.join(",")}]`,
    sparse: alsSparsevec(p.vector.text),
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dienstSchluessel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !dienstSchluessel) throw new Error("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen (lokal: node --env-file=.env.local.docker ...).");
  const lokal = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);
  if (!lokal && !args.has("--ja")) {
    throw new Error(`Ziel ${new URL(url).host} ist nicht lokal. Zum Schreiben in eine gehostete Datenbank ausdruecklich --ja angeben.`);
  }
  console.log(`Ziel: ${new URL(url).host} (${lokal ? "lokal" : "GEHOSTET"})${args.has("--trocken") ? " [trocken]" : ""}`);

  const punkte = await lesePunkte();
  if (punkte.length === 0) throw new Error("Qdrant liefert keine Punkte.");
  const modelle = [...new Set(punkte.map((p) => str(p.payload.embed_modell) ?? "?"))];
  const dimensionen = [...new Set(punkte.map((p) => p.vector.dense.length))];
  if (dimensionen.length !== 1 || dimensionen[0] !== 1024) throw new Error(`Unerwartete Vektorgroesse: ${dimensionen.join(", ")} (erwartet 1024).`);
  console.log(`  ${punkte.length} Punkte, Modell ${modelle.join(", ")}, Dimension ${dimensionen[0]}`);

  // Dokumenthaeufigkeit je Wort (ein Wort zaehlt je Textstelle einmal)
  const df = new Map<number, number>();
  for (const p of punkte) {
    for (const idx of new Set(p.vector.text.indices.map(sparseIndex))) df.set(idx, (df.get(idx) ?? 0) + 1);
  }
  const n = punkte.length;
  const begriffe = [...df].map(([hash, d]) => ({ hash, df: d, idf: Number(Math.log(1 + (n - d + 0.5) / (d + 0.5)).toFixed(6)) }));
  console.log(`  ${begriffe.length} verschiedene Woerter`);
  if (args.has("--trocken")) return;

  const db = createClient(url, dienstSchluessel, { auth: { persistSession: false, autoRefreshToken: false } });
  const zeilen = punkte.map(zeile);
  for (let i = 0; i < zeilen.length; i += 100) {
    const { error } = await db.from("wissen_chunks").upsert(zeilen.slice(i, i + 100), { onConflict: "id" });
    if (error) throw new Error(`wissen_chunks (ab ${i}): ${error.message}`);
    process.stdout.write(`\r  Textstellen geschrieben: ${Math.min(i + 100, zeilen.length)}/${zeilen.length}`);
  }
  process.stdout.write("\n");
  for (let i = 0; i < begriffe.length; i += 2000) {
    const { error } = await db.from("wissen_begriffe").upsert(begriffe.slice(i, i + 2000), { onConflict: "hash" });
    if (error) throw new Error(`wissen_begriffe (ab ${i}): ${error.message}`);
    process.stdout.write(`\r  Woerter geschrieben: ${Math.min(i + 2000, begriffe.length)}/${begriffe.length}`);
  }
  process.stdout.write("\n");

  if (args.has("--bereinigen")) {
    const soll = new Set(zeilen.map((z) => z.id));
    const veraltet: string[] = [];
    for (let von = 0; ; von += 1000) {
      const { data, error } = await db.from("wissen_chunks").select("id").order("id").range(von, von + 999);
      if (error) throw new Error(`Bereinigen (lesen): ${error.message}`);
      veraltet.push(...(data ?? []).map((r) => r.id as string).filter((id) => !soll.has(id)));
      if (!data || data.length < 1000) break;
    }
    for (let i = 0; i < veraltet.length; i += 200) {
      const { error } = await db.from("wissen_chunks").delete().in("id", veraltet.slice(i, i + 200));
      if (error) throw new Error(`Bereinigen (loeschen): ${error.message}`);
    }
    console.log(`  bereinigt: ${veraltet.length} veraltete Textstellen entfernt`);
    const alteWoerter = new Set(begriffe.map((b) => b.hash));
    const { count } = await db.from("wissen_begriffe").select("hash", { count: "exact", head: true });
    if ((count ?? 0) > alteWoerter.size) console.log(`  Hinweis: ${(count ?? 0) - alteWoerter.size} Woerter ohne Textstelle bleiben stehen (unschaedlich, IDF-Basis)`);
  }

  const { count, error: zaehlFehler } = await db.from("wissen_chunks").select("id", { count: "exact", head: true });
  if (zaehlFehler) throw new Error(`Nachpruefung: ${zaehlFehler.message}`);
  if ((count ?? 0) < zeilen.length) throw new Error(`Nachpruefung fehlgeschlagen: ${count} Zeilen in der Datenbank, ${zeilen.length} erwartet.`);
  const { error: protokollFehler } = await db.from("wissen_importe").insert({
    quelle: `qdrant:${qdrantAusUmgebung().sammlung}`,
    embed_modell: modelle.join(","),
    dimension: dimensionen[0],
    chunks: zeilen.length,
    begriffe: begriffe.length,
  });
  if (protokollFehler) throw new Error(`Importprotokoll: ${protokollFehler.message}`);
  console.log(`Fertig: ${count} Textstellen und ${begriffe.length} Woerter in ${new URL(url).host}.`);
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
