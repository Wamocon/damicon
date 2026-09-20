// =============================================================================
// Damicon - Wissensbasis in Postgres (pgvector): Rollen, Suche, Schreibschutz
// =============================================================================
// Ausfuehren:  node --env-file=.env.local supabase/tests/wissen-pgvector.mjs
// Voraussetzung: laufende lokale Supabase-Instanz mit angewendeten Migrationen und Demo-Zugaengen
// (npm run db:seed-auth). PGlite kann pgvector nicht, deshalb laeuft dieser Test gegen echtes Postgres.
//
// Die Testdaten sind kuenstlich (Einheitsvektoren, eigene Wort-Hashes) und werden am Ende entfernt.
// Geprueft wird das, worauf die Sicherheit und die Trefferqualitaet der Wissensbasis beruhen:
//   * Zeilensicherheit: wer eine Stelle sehen darf, entscheidet die Rolle aus der Sitzung
//   * p_rolle kann Ergebnisse nur einschraenken, nie erweitern
//   * Hybridsuche: dichte Aehnlichkeit, lexikalische Treffer, IDF-Gewichtung, Fusion
//   * Filter (Stufe, ueberholt) verlieren auch bei sehr vielen naeheren Zeilen keine Treffer
//   * Schreiben ist fuer Nutzer und anon gesperrt
// =============================================================================

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Fehlende Env-Variablen. Aufruf: node --env-file=.env.local supabase/tests/wissen-pgvector.mjs");
  process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("Dieser Test schreibt Testdaten und laeuft nur gegen eine lokale Datenbank.");
  process.exit(1);
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const dienst = createClient(url, serviceKey, { auth: { persistSession: false } });
async function alsNutzer(kurz) {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: `${kurz}@damicon.demo`, password: "DamiconDemo2026!" });
  if (error) throw new Error(`Anmeldung ${kurz}: ${error.message}`);
  return c;
}

// ---- Testdaten ---------------------------------------------------------------------------
const DIM = 1024;
const SPARSE_DIM = 1_000_000_000;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const einheit = (i) => {
  const v = new Array(DIM).fill(0);
  v[i % DIM] = 1;
  return v;
};
const mischung = (i, j, wi, wj) => {
  const v = new Array(DIM).fill(0);
  v[i] = wi;
  v[j] = wj;
  return v;
};
const dichtText = (v) => `[${v.join(",")}]`;
const sparsevec = (paare) => `{${paare.map(([i, w]) => `${i}:${w}`).join(",")}}/${SPARSE_DIM}`;

// Eigene Wort-Hashes weit weg von echten Woertern (echte liegen gleichmaessig in 1..1e9).
const W = { a: 999_900_001, b: 999_900_002, c: 999_900_003, e: 999_900_005, selten: 999_900_010, haeufig: 999_900_011 };

const zeile = (n, o) => ({
  id: uuid(n),
  chunk_id: `test-${n}`,
  quelle_id: "test-quelle",
  sprache: "de",
  autoritaetsstufe: 1,
  titel: `Testquelle ${o.name}`,
  kontext: `Test ${o.name}`,
  bereich: "test",
  text: `Testtext ${o.name}`,
  rollen: ["admin", "betriebsleitung", "buchhaltung"],
  ist_ueberholt: false,
  dense: dichtText(o.dense),
  sparse: sparsevec(o.sparse ?? [[1, 1]]),
  ...o.rest,
});

const chunks = [
  zeile(1, { name: "A", dense: einheit(0), sparse: [[W.a, 1]] }),
  zeile(2, { name: "B", dense: einheit(1), sparse: [[W.b, 1]], rest: { rollen: ["admin"] } }),
  zeile(3, { name: "C", dense: einheit(2), sparse: [[W.c, 1]], rest: { autoritaetsstufe: 4, rollen: ["admin", "buchhaltung"] } }),
  zeile(4, { name: "D", dense: einheit(3), sparse: [[1, 1]], rest: { ist_ueberholt: true, rollen: ["admin"] } }),
  zeile(5, { name: "E", dense: einheit(5), sparse: [[W.e, 1]], rest: { rollen: ["admin"] } }),
  zeile(6, { name: "Selten", dense: einheit(6), sparse: [[W.selten, 1]], rest: { rollen: ["admin"] } }),
  zeile(7, { name: "Haeufig", dense: einheit(7), sparse: [[W.haeufig, 1]], rest: { rollen: ["admin"] } }),
  // fern von der Anfrage, aber der einzige weitere Treffer der Stufe 1 fuer den Filtertest
  zeile(8, { name: "G", dense: einheit(8), sparse: [[1, 1]], rest: { rollen: ["admin"] } }),
];
// 150 Zeilen der Stufe 5, alle NAEHER an der Anfrage (Richtung 0) als G: ein Filter auf Stufe 1 muss
// den Index weiterlesen, statt nach den ersten Kandidaten aufzuhoeren.
for (let i = 0; i < 150; i++) {
  chunks.push(zeile(100 + i, { name: `Filler${i}`, dense: mischung(0, 20 + i, 0.99, 0.02), sparse: [[1, 1]], rest: { autoritaetsstufe: 5, rollen: ["admin"] } }));
}
const begriffe = [
  { hash: W.a, df: 1, idf: 3 }, { hash: W.b, df: 1, idf: 3 }, { hash: W.c, df: 1, idf: 3 }, { hash: W.e, df: 1, idf: 3 },
  { hash: W.selten, df: 1, idf: 6 }, // selten: hohes Gewicht
  { hash: W.haeufig, df: 4000, idf: 0.05 }, // haeufig: kaum Gewicht
];

async function aufraeumen() {
  await dienst.from("wissen_chunks").delete().eq("quelle_id", "test-quelle");
  await dienst.from("wissen_begriffe").delete().gte("hash", 999_900_000).lte("hash", 999_900_100);
}

const suche = (db, fragen, extra = {}) =>
  db.rpc("wissen_suche", { p_fragen: fragen, p_limit: 8, p_kandidaten: 40, ...extra });
const namen = (r) => (r.data ?? []).map((z) => z.payload.titel.replace("Testquelle ", ""));
// Anfragen: nur dichter Vektor, oder mit Woertern (Hashes wie sie sparseIndex() erzeugt: bereits im Bereich 1..1e9)
const dichtFrage = (v) => [{ dense: v, begriffe: [] }];

try {
  await aufraeumen();
  for (let i = 0; i < chunks.length; i += 50) {
    const { error } = await dienst.from("wissen_chunks").insert(chunks.slice(i, i + 50));
    if (error) throw new Error(`Testdaten (Textstellen): ${error.message}`);
  }
  const { error: bErr } = await dienst.from("wissen_begriffe").insert(begriffe);
  if (bErr) throw new Error(`Testdaten (Woerter): ${bErr.message}`);

  const admin = await alsNutzer("admin");
  const leitung = await alsNutzer("leitung");
  const buchhaltung = await alsNutzer("buchhaltung");
  const kunde = await alsNutzer("kunde");
  const brigade = await alsNutzer("brigade");

  // ---- 1. Zeilensicherheit -------------------------------------------------------------
  const kundeSicht = await suche(kunde, dichtFrage(einheit(0)));
  check("Kunde: Suche liefert nichts (RLS)", !kundeSicht.error && (kundeSicht.data ?? []).length === 0, kundeSicht.error?.message);
  const kundeEskalation = await suche(kunde, dichtFrage(einheit(0)), { p_rolle: "admin" });
  check("Kunde: p_rolle=admin erweitert NICHTS", (kundeEskalation.data ?? []).length === 0);
  const brigadeSicht = await suche(brigade, dichtFrage(einheit(0)));
  check("Brigade: Suche liefert nichts", (brigadeSicht.data ?? []).length === 0);
  const kundeDirekt = await kunde.from("wissen_chunks").select("id").limit(5);
  check("Kunde: direktes Lesen der Tabelle liefert nichts", (kundeDirekt.data ?? []).length === 0);
  const adminDirekt = await admin.from("wissen_chunks").select("id", { count: "exact", head: true }).eq("quelle_id", "test-quelle");
  check("Admin: direktes Lesen sieht alle Testzeilen", adminDirekt.count === chunks.length, `count=${adminDirekt.count}`);

  const leitungA = await suche(leitung, dichtFrage(einheit(1)));
  check("Betriebsleitung: sieht B (nur Admin) nicht", !namen(leitungA).includes("B"), namen(leitungA).join(","));
  const leitungC = await suche(leitung, dichtFrage(einheit(2)));
  check("Betriebsleitung: sieht C (Admin und Buchhaltung) nicht", !namen(leitungC).includes("C"));
  const leitungAe = await suche(leitung, dichtFrage(einheit(0)));
  check("Betriebsleitung: sieht A", namen(leitungAe).includes("A"));
  const buchC = await suche(buchhaltung, dichtFrage(einheit(2)));
  check("Buchhaltung: sieht C", namen(buchC).includes("C"));
  const buchB = await suche(buchhaltung, dichtFrage(einheit(1)));
  check("Buchhaltung: sieht B (nur Admin) nicht", !namen(buchB).includes("B"));
  const adminNarrow = await suche(admin, dichtFrage(einheit(1)), { p_rolle: "buchhaltung" });
  check("Admin mit p_rolle=buchhaltung (Ansicht als Rolle): B verschwindet", !namen(adminNarrow).includes("B"));

  // ---- 2. Dichte Suche ------------------------------------------------------------------
  const adminA = await suche(admin, dichtFrage(einheit(0)));
  check("Dicht: Anfrage in Richtung A liefert A zuerst", namen(adminA)[0] === "A", namen(adminA).join(","));
  const adminB = await suche(admin, dichtFrage(einheit(1)));
  check("Dicht: Anfrage in Richtung B liefert B zuerst", namen(adminB)[0] === "B", namen(adminB).join(","));
  check("Trefferzeile traegt Belegdaten (Fundstelle, Stufe, Rollen)", adminA.data?.[0]?.payload?.kontext === "Test A" && adminA.data?.[0]?.payload?.autoritaetsstufe === 1 && Array.isArray(adminA.data?.[0]?.payload?.rollen));

  // ---- 3. Ueberholte Quellen ------------------------------------------------------------
  const ohneD = await suche(admin, dichtFrage(einheit(3)));
  check("Ueberholte Quelle D ist standardmaessig ausgeblendet", !namen(ohneD).includes("D"));
  const mitD = await suche(admin, dichtFrage(einheit(3)), { p_nur_aktuell: false });
  check("Mit p_nur_aktuell=false ist D da und steht zuerst", namen(mitD)[0] === "D", namen(mitD).join(","));

  // ---- 4. Lexikalische Suche und IDF ----------------------------------------------------
  const lexE = await suche(admin, [{ dense: einheit(900), begriffe: [W.e] }]);
  check("Lexikalisch: ein Wort ohne dichte Naehe findet E", namen(lexE)[0] === "E", namen(lexE).join(","));
  const lexBeide = await suche(admin, [{ dense: einheit(901), begriffe: [W.selten, W.haeufig] }]);
  const rang = (n) => namen(lexBeide).indexOf(n);
  check("IDF: das seltene Wort schlaegt das haeufige", rang("Selten") !== -1 && rang("Selten") < rang("Haeufig"), namen(lexBeide).join(","));
  const lexUnbekannt = await suche(admin, [{ dense: einheit(902), begriffe: [123456789] }]);
  check("Unbekanntes Wort: kein Fehler, nur dichte Treffer", !lexUnbekannt.error, lexUnbekannt.error?.message);

  // ---- 5. Fusion mehrerer Formulierungen ------------------------------------------------
  const zwei = await suche(admin, [{ dense: einheit(0), begriffe: [] }, { dense: einheit(1), begriffe: [] }]);
  check("Zwei Formulierungen: Treffer beider Richtungen (A und B)", namen(zwei).includes("A") && namen(zwei).includes("B"), namen(zwei).join(","));

  // ---- 6. Filter ohne Trefferverlust ----------------------------------------------------
  // Anfrage: fast ganz in Richtung 0 (dort liegen die 150 Fueller, Aehnlichkeit ca. 0,94), mit einem kleinen Anteil
  // in Richtung 8 (G, Aehnlichkeit ca. 0,3). G liegt damit hinter allen Fuellern, aber deutlich vor beliebigen
  // echten Textstellen (Aehnlichkeit nahe 0), egal ob die Datenbank zusaetzlich einen echten Korpus enthaelt.
  const nurStufe1 = await suche(admin, dichtFrage(mischung(0, 8, 0.95, 0.3)), { p_max_stufe: 1, p_limit: 20 });
  const stufe1 = namen(nurStufe1);
  check("Stufenfilter: alle Treffer sind Stufe 1", (nurStufe1.data ?? []).every((z) => z.payload.autoritaetsstufe <= 1), stufe1.join(","));
  check("Stufenfilter: G (Rang > 150 ohne Filter) kommt trotz 150 naeherer Zeilen der Stufe 5", stufe1.includes("G"), stufe1.join(","));

  // ---- 7. Robustheit --------------------------------------------------------------------
  const leer = await suche(admin, []);
  check("Leere Anfrage: leere Liste statt Fehler", !leer.error && (leer.data ?? []).length === 0, leer.error?.message);
  const kaputt = await suche(admin, [{ begriffe: [W.a] }]);
  check("Anfrage ohne dichten Vektor: kein Absturz", !kaputt.error, kaputt.error?.message);

  // ---- 8. Schreibschutz und anon --------------------------------------------------------
  const fremd = zeile(9999, { name: "Fremd", dense: einheit(50) });
  const adminSchreibt = await admin.from("wissen_chunks").insert(fremd);
  check("Admin darf NICHT schreiben (nur der Dienst)", !!adminSchreibt.error, adminSchreibt.error?.message?.slice(0, 80));
  const adminAendert = await admin.from("wissen_chunks").update({ text: "manipuliert" }).eq("id", uuid(1)).select();
  check("Admin darf NICHT aendern", !!adminAendert.error || (adminAendert.data ?? []).length === 0);
  const adminLoescht = await admin.from("wissen_chunks").delete().eq("id", uuid(1)).select();
  check("Admin darf NICHT loeschen", !!adminLoescht.error || (adminLoescht.data ?? []).length === 0);
  const nochDa = await dienst.from("wissen_chunks").select("text").eq("id", uuid(1)).single();
  check("Nach den Angriffen ist die Textstelle unveraendert", nochDa.data?.text === "Testtext A");
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const anonSuche = await suche(anon, dichtFrage(einheit(0)));
  check("anon: Suche verweigert", !!anonSuche.error || (anonSuche.data ?? []).length === 0);
  const anonLesen = await anon.from("wissen_chunks").select("id").limit(1);
  check("anon: Lesen verweigert oder leer", !!anonLesen.error || (anonLesen.data ?? []).length === 0);
  const kundeBegriffe = await kunde.from("wissen_importe").select("id").limit(1);
  check("Importprotokoll: Kunde sieht nichts", (kundeBegriffe.data ?? []).length === 0);
} catch (e) {
  check("Testlauf ohne Ausnahme", false, String(e instanceof Error ? e.message : e));
} finally {
  await aufraeumen();
  const { count } = await dienst.from("wissen_chunks").select("id", { count: "exact", head: true }).eq("quelle_id", "test-quelle");
  check("Aufgeraeumt: keine Testzeilen uebrig", count === 0, `count=${count}`);
}

console.log(failures === 0 ? "\nAlle Pruefungen bestanden." : `\n${failures} Pruefung(en) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
