// Tests fuer den Supabase-Suchweg der Wissensbasis (ohne Datenbank, ohne Netz ausser einem lokalen Mock):
//   * Abbildung der Wort-Hashes und des sparsevec-Textes
//   * Aufruf und Rueckgabe von wissen_suche (Argumente, Fehler, kaputte Zeilen)
//   * Einbettung ueber eine OpenAI-kompatible Schnittstelle (Reihenfolge, Fehler, Dimension, Schluessel)
//   * Wahl des Backends und Verfuegbarkeit je Umgebung (Produktion ohne Index = aus)
//   * sucheWissen() Ende zu Ende mit falscher Datenbank und falscher Einbettung
//   * Fehlerpfad (15.10.2026): Wiederholung bei Zeitueberschreitung, Ursache des Fehlers, Hinweis an das Modell (kein Upload nach einem Fehler)
// Aufruf: npm run test:wissen-backend (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { einbettungsKonfig, openaiEinbettung } from "@/lib/wissen/embed";
import { alsSparsevec, sparseFrage, sparseIndex, SPARSE_DIMENSION } from "@/lib/wissen/sparse";
import { baueWissenWerkzeug, hinweisFuerLage, hinweisNachSuchfehler, suchfehlerUrsache } from "@/lib/ai/wissen-werkzeug";
import { hybridSucheSupabase, istZeitueberschreitung, type RpcKlient } from "@/lib/wissen/supabase-suche";
import { pruefeWissenGesundheit, setzeGesundheitZurueck, sucheWissen, wissenBackend, wissenVerfuegbar } from "@/lib/wissen/suche";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const env = process.env as Record<string, string | undefined>;
async function mitUmgebung<T>(werte: Record<string, string | undefined>, f: () => Promise<T> | T): Promise<T> {
  const alt: Record<string, string | undefined> = {};
  for (const k of Object.keys(werte)) alt[k] = env[k];
  for (const [k, v] of Object.entries(werte)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  try {
    return await f();
  } finally {
    for (const [k, v] of Object.entries(alt)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  }
}

const ENV_LEER = { WISSEN_BACKEND: undefined, QDRANT_URL: undefined, WISSEN_EMBED_ANBIETER: undefined, WISSEN_EMBED_URL: undefined, WISSEN_EMBED_MODELL: undefined, WISSEN_EMBED_KEY: undefined, KI_SOKRATES_API_SCHLUESSEL: undefined };

// ---- Sparse-Abbildung ------------------------------------------------------------------------
pruefe("sparseIndex liegt immer in 1..1e9", [0, 1, 999_999_999, 1_000_000_000, 4_294_967_295].every((h) => sparseIndex(h) >= 1 && sparseIndex(h) <= SPARSE_DIMENSION));
pruefe("alsSparsevec: aufsteigend, mit Dimension", alsSparsevec({ indices: [1_000_000_005, 3], values: [2, 1.5] }) === `{4:1.5,6:2}/${SPARSE_DIMENSION}`, alsSparsevec({ indices: [1_000_000_005, 3], values: [2, 1.5] }));
pruefe("alsSparsevec: kollidierende Indizes werden addiert", alsSparsevec({ indices: [10, 1_000_000_010], values: [1, 2] }) === `{11:3}/${SPARSE_DIMENSION}`);
pruefe("alsSparsevec: leerer Vektor ist gueltig geformt", alsSparsevec({ indices: [], values: [] }) === `{}/${SPARSE_DIMENSION}`);

// ---- RPC-Adapter -----------------------------------------------------------------------------
interface Aufruf {
  fn: string;
  args: Record<string, unknown>;
}
function falscheDatenbank(antwort: { data: unknown; error: { message: string } | null }): { db: RpcKlient; aufrufe: Aufruf[] } {
  const aufrufe: Aufruf[] = [];
  return {
    aufrufe,
    db: {
      rpc: (fn, args) => {
        aufrufe.push({ fn, args });
        return Promise.resolve(antwort);
      },
    },
  };
}
const zeile = (id: string, punkt: number, payload: Record<string, unknown> = {}) => ({ id, punktzahl: punkt, payload: { kontext: `Fundstelle ${id}`, text: "Text", autoritaetsstufe: 1, ...payload } });

async function adapter() {
  const frage = { dense: [[0.1, 0.2], [0.3, 0.4]], sparse: [sparseFrage("Mehrwertsteuer 2026"), sparseFrage("НДС порог")] };
  const { db, aufrufe } = falscheDatenbank({ data: [zeile("a", 0.5), zeile("b", 0.3)], error: null });
  const t = await hybridSucheSupabase(db, frage, { rolle: "buchhaltung", nurAktuell: true, maxStufe: 3 }, { limit: 5 });
  const a = aufrufe[0]!;
  const fragen = a.args.p_fragen as Array<{ dense: number[]; begriffe: number[] }>;
  pruefe("Adapter: ruft wissen_suche genau einmal auf", aufrufe.length === 1 && a.fn === "wissen_suche");
  pruefe("Adapter: eine Formulierung je Eintrag, Hashes im pgvector-Bereich", fragen.length === 2 && fragen[0]!.dense[0] === 0.1 && fragen[1]!.begriffe.length > 0 && fragen.every((f) => f.begriffe.every((h) => h >= 1 && h <= SPARSE_DIMENSION)));
  pruefe("Adapter: Rolle, Stufe, Aktualitaet und Limit werden uebergeben", a.args.p_rolle === "buchhaltung" && a.args.p_max_stufe === 3 && a.args.p_nur_aktuell === true && a.args.p_limit === 5, JSON.stringify({ ...a.args, p_fragen: "..." }));
  pruefe("Adapter: Treffer werden auf id/score/payload abgebildet", t.length === 2 && t[0]!.id === "a" && t[0]!.score === 0.5 && (t[0]!.payload as { kontext?: string }).kontext === "Fundstelle a");

  const ohneFilter = falscheDatenbank({ data: [], error: null });
  await hybridSucheSupabase(ohneFilter.db, frage, {}, {});
  const o = ohneFilter.aufrufe[0]!.args;
  pruefe("Adapter: ohne Filter gelten die Standardwerte (aktuell, ohne Rolle, ohne Stufe)", o.p_rolle === null && o.p_max_stufe === null && o.p_nur_aktuell === true && o.p_limit === 8 && o.p_kandidaten === 40);
  const alles = falscheDatenbank({ data: [], error: null });
  await hybridSucheSupabase(alles.db, frage, { nurAktuell: false }, {});
  pruefe("Adapter: nurAktuell=false wird weitergegeben", alles.aufrufe[0]!.args.p_nur_aktuell === false);

  let geworfen = "";
  try {
    await hybridSucheSupabase(falscheDatenbank({ data: null, error: { message: "permission denied" } }).db, frage, {}, {});
  } catch (e) {
    geworfen = String(e);
  }
  pruefe("Adapter: Datenbankfehler werden zum Fehler mit Meldung", geworfen.includes("permission denied"), geworfen);
  const kaputt = await hybridSucheSupabase(falscheDatenbank({ data: [zeile("ok", 1), { id: 5 }, null, "x", { id: "n", punktzahl: "viel", payload: {} }], error: null }).db, frage, {}, {});
  pruefe("Adapter: kaputte Zeilen werden verworfen, gute bleiben", kaputt.length === 1 && kaputt[0]!.id === "ok");
  const keinArray = await hybridSucheSupabase(falscheDatenbank({ data: { foo: 1 }, error: null }).db, frage, {}, {});
  pruefe("Adapter: unerwartete Antwortform ergibt eine leere Liste", keinArray.length === 0);
}

// ---- Einbettung ueber OpenAI-kompatible Schnittstelle ----------------------------------------
async function einbettung() {
  let letzteAnfrage: { auth?: string; body?: { model?: string; input?: string[]; encoding_format?: string } } = {};
  let modus: "ok" | "fehler" | "kurz" | "leer" = "ok";
  const server = createServer((req, res) => {
    let roh = "";
    req.on("data", (d) => (roh += d));
    req.on("end", () => {
      letzteAnfrage = { auth: req.headers.authorization, body: JSON.parse(roh || "{}") };
      if (modus === "fehler") return void res.writeHead(401).end("kein Zugriff");
      const n = letzteAnfrage.body?.input?.length ?? 0;
      const dim = modus === "kurz" ? 3 : 1024;
      if (modus === "leer") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [] }));
      // absichtlich in umgekehrter Reihenfolge: die Zuordnung muss ueber "index" laufen
      const daten = Array.from({ length: n }, (_, i) => ({ index: i, embedding: new Array(dim).fill(i + 1) })).reverse();
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: daten }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`;
  try {
    const e = openaiEinbettung({ url, modell: "BAAI/bge-m3", schluessel: "geheim" });
    const v = await e.einbetten(["eins", "zwei", "drei"]);
    pruefe("Einbettung: Reihenfolge folgt dem index, nicht der Lieferreihenfolge", v.length === 3 && v[0]![0] === 1 && v[1]![0] === 2 && v[2]![0] === 3);
    pruefe("Einbettung: Modell, Eingabe und Bearer-Schluessel werden gesendet", letzteAnfrage.body?.model === "BAAI/bge-m3" && letzteAnfrage.body?.input?.length === 3 && letzteAnfrage.auth === "Bearer geheim" && letzteAnfrage.body?.encoding_format === "float");
    pruefe("Einbettung: leere Eingabe braucht keinen Aufruf", (await e.einbetten([])).length === 0);
    const ohneSchluessel = openaiEinbettung({ url, modell: "bge-m3" });
    await ohneSchluessel.einbetten(["x"]);
    pruefe("Einbettung: ohne Schluessel kein Authorization-Kopf (lokal, Ollama)", letzteAnfrage.auth === undefined);
    modus = "fehler";
    let msg = "";
    try {
      await e.einbetten(["x"]);
    } catch (x) {
      msg = String(x);
    }
    pruefe("Einbettung: HTTP-Fehler wird mit Status gemeldet", msg.includes("401"), msg);
    modus = "kurz";
    msg = "";
    try {
      await e.einbetten(["x"]);
    } catch (x) {
      msg = String(x);
    }
    pruefe("Einbettung: falsche Dimension wird abgelehnt (anderes Modell im Index)", msg.includes("1024"), msg);
    modus = "leer";
    msg = "";
    try {
      await e.einbetten(["x"]);
    } catch (x) {
      msg = String(x);
    }
    pruefe("Einbettung: unerwartete Antwort wird abgelehnt", msg.includes("unerwartete"), msg);
  } finally {
    server.close();
  }
}

// ---- Backendwahl und Verfuegbarkeit ------------------------------------------------------------
async function backendwahl() {
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "production" }, () => {
    pruefe("Produktion ohne Index: kein Backend, Werkzeug aus", wissenBackend() === null && !wissenVerfuegbar());
  });
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "production", QDRANT_URL: "http://q:6333" }, () => {
    pruefe("Produktion mit QDRANT_URL: Qdrant", wissenBackend() === "qdrant" && wissenVerfuegbar());
  });
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "production", WISSEN_BACKEND: "supabase" }, () => {
    pruefe("Produktion, Supabase OHNE erreichbare Einbettung: aus (sonst waere jede Suche ein Fehler)", wissenBackend() === "supabase" && !wissenVerfuegbar());
  });
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "production", WISSEN_BACKEND: "supabase", WISSEN_EMBED_ANBIETER: "openai", WISSEN_EMBED_URL: "https://api.example.com/v1" }, () => {
    pruefe("Produktion, Supabase mit Anbieter, aber noch nicht geprueft: erst nach gelungener Probe verfuegbar", !wissenVerfuegbar());
  });
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "production", WISSEN_BACKEND: "supabase", WISSEN_EMBED_ANBIETER: "openai" }, () => {
    pruefe("Produktion, Supabase, Anbieter ohne URL: aus", !wissenVerfuegbar());
  });
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "development" }, () => {
    pruefe("Entwicklung ohne Angaben: Qdrant lokal", wissenBackend() === "qdrant" && wissenVerfuegbar());
  });
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "development", WISSEN_BACKEND: "supabase" }, () => {
    pruefe("Entwicklung mit WISSEN_BACKEND=supabase: Supabase", wissenBackend() === "supabase" && wissenVerfuegbar());
  });
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "production", WISSEN_BACKEND: "quatsch" }, () => {
    pruefe("Unbekannter Backendname wird ignoriert", wissenBackend() === null);
  });
}

// ---- Gesundheit der Einbettung und Sokrates-Vorgabe ---------------------------------------------
async function gesundheit() {
  let modus: "ok" | "403" | "kurz" | "haengt" = "ok";
  let anfragen = 0;
  const server = createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      anfragen++;
      if (modus === "haengt") return; // antwortet nie
      if (modus === "403") return void res.writeHead(403, { "content-type": "application/json" }).end('{"detail":"You do not have permission to access this resource."}');
      const dim = modus === "kurz" ? 8 : 1024;
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ index: 0, embedding: new Array(dim).fill(0.1) }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const prod = { ...ENV_LEER, NODE_ENV: "production", WISSEN_EMBED_URL: url };
  try {
    setzeGesundheitZurueck();
    await mitUmgebung(prod, async () => {
      pruefe("Gesundheit: vor der Probe ist die Wissensbasis in Produktion aus", !wissenVerfuegbar());
      pruefe("Gesundheit: gelungene Probe macht sie verfuegbar", (await pruefeWissenGesundheit()) === true && wissenVerfuegbar());
      const n = anfragen;
      await pruefeWissenGesundheit();
      await pruefeWissenGesundheit();
      pruefe("Gesundheit: das Ergebnis wird gemerkt (keine weitere Anfrage an den Anbieter)", anfragen === n);
    });
    setzeGesundheitZurueck();
    modus = "403";
    await mitUmgebung(prod, async () => {
      pruefe("Gesundheit: 403 (Schluessel ohne Recht fuer Einbettungen) macht sie NICHT verfuegbar", (await pruefeWissenGesundheit()) === false && !wissenVerfuegbar());
      const n = anfragen;
      await pruefeWissenGesundheit();
      pruefe("Gesundheit: auch der Fehlschlag wird kurz gemerkt (kein Dauerfeuer auf einen kaputten Anbieter)", anfragen === n);
      modus = "ok";
      setzeGesundheitZurueck();
      pruefe("Gesundheit: nach Behebung und Zuruecksetzen ist sie wieder verfuegbar", (await pruefeWissenGesundheit()) === true && wissenVerfuegbar());
    });
    setzeGesundheitZurueck();
    modus = "kurz";
    await mitUmgebung(prod, async () => {
      pruefe("Gesundheit: falsche Dimension (anderes Modell) macht sie NICHT verfuegbar", (await pruefeWissenGesundheit()) === false && !wissenVerfuegbar());
    });
  } finally {
    setzeGesundheitZurueck();
    server.close();
  }
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "production", KI_SOKRATES_API_SCHLUESSEL: "geheim" }, () => {
    const k = einbettungsKonfig();
    pruefe("Sokrates-Vorgabe: in Produktion mit vorhandenem Zugang ohne weitere Einstellung", k?.quelle === "sokrates" && k.url.includes("sokrates") && k.schluessel === "geheim" && k.modell === "bge-m3:latest" && wissenBackend() === "supabase");
  });
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "development", KI_SOKRATES_API_SCHLUESSEL: "geheim" }, () => {
    pruefe("Sokrates-Vorgabe: lokal nicht (dort gilt Ollama)", einbettungsKonfig() === null);
  });
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "production", KI_SOKRATES_API_SCHLUESSEL: "geheim", WISSEN_EMBED_URL: "https://api.deepinfra.com/v1/openai", WISSEN_EMBED_MODELL: "BAAI/bge-m3", WISSEN_EMBED_KEY: "anderer" }, () => {
    const k = einbettungsKonfig();
    pruefe("Sokrates-Vorgabe: ausdrueckliche Angaben haben Vorrang", k?.quelle === "umgebung" && k.url.includes("deepinfra") && k.modell === "BAAI/bge-m3" && k.schluessel === "anderer");
  });
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "production" }, () => {
    pruefe("Ohne jede Angabe in Produktion: keine Einbettung, kein Backend", einbettungsKonfig() === null && wissenBackend() === null);
  });
}

// ---- sucheWissen Ende zu Ende ------------------------------------------------------------------
async function ende() {
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "production", WISSEN_BACKEND: "supabase" }, async () => {
    const { db, aufrufe } = falscheDatenbank({
      data: [
        zeile("p1", 0.9, { autoritaetsstufe: 1, kontext: "НК РК ст. 101", url: "https://adilet.zan.kz/x" }),
        zeile("p2", 0.8, { autoritaetsstufe: 2 }),
        zeile("f1", 0.7, { autoritaetsstufe: 4, kontext: "mybuh.kz" }),
      ],
      error: null,
    });
    let eingebettet: string[] = [];
    const r = await sucheWissen({ frage: "Ab welchem Umsatz?", frageRussisch: "порог НДС" }, "admin", {
      supabase: db,
      einbettung: {
        modell: "test",
        dimension: 2,
        einbetten: async (t) => {
          eingebettet = t;
          return t.map(() => [0, 1]);
        },
      },
    });
    pruefe("Ende zu Ende: beide Formulierungen werden eingebettet", eingebettet.length === 2);
    pruefe("Ende zu Ende: zwei Datenbankaufrufe, einer nur Recht (Stufe <= 3), einer alle", aufrufe.length === 2 && aufrufe.some((a) => a.args.p_max_stufe === 3) && aufrufe.some((a) => a.args.p_max_stufe === null), aufrufe.map((a) => a.args.p_max_stufe).join(","));
    pruefe("Ende zu Ende: Rolle aus der Sitzung geht in beide Aufrufe", aufrufe.every((a) => a.args.p_rolle === "admin"));
    pruefe("Ende zu Ende: Belege haben Kennung, Fundstelle, Stufe und Link", r.belege.length > 0 && r.belege[0]!.id === "S1" && r.belege[0]!.fundstelle === "НК РК ст. 101" && r.belege[0]!.stufe === 1 && r.belege[0]!.url === "https://adilet.zan.kz/x");
    pruefe("Ende zu Ende: Kennungen sind eindeutig, keine doppelten Treffer", new Set(r.belege.map((b) => b.id)).size === r.belege.length && new Set(r.belege.map((b) => b.fundstelle + b.punktzahl)).size === r.belege.length);
  });
}

// ---- Fehlerpfad: Zeitueberschreitung, Ursache, Hinweis ----------------------------------------------
// Am 15.10.2026 scheiterte die erste Suche nach einer Ruhepause an der Laufzeitgrenze der Datenbank (8,4 s), der zweite Aufruf derselben Frage
// brauchte 1,4 s. Der Assistent meldete "nicht erreichbar", folgerte, es gebe keine Quellen zum Risikomanagement, und empfahl, ISO 31000 hochzuladen.
async function fehlerpfad() {
  const frage = { dense: [[0.1, 0.2]], sparse: [sparseFrage("Risikomanagement ISO 31000")] };
  const zeitgrenze = { data: null, error: { message: "canceling statement due to statement timeout" } };
  const folge = (antworten: Array<{ data: unknown; error: { message: string } | null }>) => {
    const aufrufe: Aufruf[] = [];
    const db: RpcKlient = {
      rpc: (fn, args) => {
        aufrufe.push({ fn, args });
        return Promise.resolve(antworten[Math.min(aufrufe.length - 1, antworten.length - 1)]!);
      },
    };
    return { db, aufrufe };
  };

  pruefe("Zeitueberschreitung wird erkannt", istZeitueberschreitung("canceling statement due to statement timeout") && istZeitueberschreitung("Request Timeout") && !istZeitueberschreitung("permission denied"));

  const erstTimeout = folge([zeitgrenze, { data: [zeile("a", 0.5)], error: null }]);
  const t = await hybridSucheSupabase(erstTimeout.db, frage, {}, {}).catch(() => []);
  pruefe("Adapter: nach einer Zeitueberschreitung wird einmal wiederholt und das Ergebnis geliefert", erstTimeout.aufrufe.length === 2 && t.length === 1 && t[0]!.id === "a", `${erstTimeout.aufrufe.length} Aufrufe`);
  pruefe("Adapter: die Wiederholung traegt dieselben Argumente", JSON.stringify(erstTimeout.aufrufe[0]!.args) === JSON.stringify(erstTimeout.aufrufe[1]!.args));

  const andererFehler = folge([{ data: null, error: { message: "permission denied for table wissen_chunks" } }]);
  let geworfen = "";
  try {
    await hybridSucheSupabase(andererFehler.db, frage, {}, {});
  } catch (e) {
    geworfen = String(e);
  }
  pruefe("Adapter: ein anderer Fehler wird nicht wiederholt", andererFehler.aufrufe.length === 1 && geworfen.includes("permission denied"), `${andererFehler.aufrufe.length} Aufrufe`);

  const immerTimeout = folge([zeitgrenze]);
  geworfen = "";
  try {
    await hybridSucheSupabase(immerTimeout.db, frage, {}, {});
  } catch (e) {
    geworfen = String(e);
  }
  pruefe("Adapter: zwei Zeitueberschreitungen hintereinander werfen den Fehler (genau zwei Versuche)", immerTimeout.aufrufe.length === 2 && geworfen.includes("statement timeout"), `${immerTimeout.aufrufe.length} Aufrufe`);

  pruefe("Ursache: Zeitueberschreitung der Datenbank", suchfehlerUrsache(new Error("Wissenssuche (Supabase): canceling statement due to statement timeout")) === "zeitueberschreitung");
  pruefe("Ursache: anderer Datenbankfehler", suchfehlerUrsache(new Error("Wissenssuche (Supabase): permission denied")) === "datenbank");
  pruefe(
    "Ursache: Einbettung (Antwort, Zeitlimit, Verbindung)",
    suchfehlerUrsache(new Error("Einbettung fehlgeschlagen (401): kein Zugriff")) === "einbettung" &&
      suchfehlerUrsache(new DOMException("The operation was aborted due to timeout", "TimeoutError")) === "einbettung" &&
      suchfehlerUrsache(new TypeError("fetch failed")) === "einbettung",
  );
  pruefe("Ursache: sonst unbekannt", suchfehlerUrsache(new Error("irgendwas")) === "unbekannt" && suchfehlerUrsache("text") === "unbekannt");

  const hinweis = hinweisNachSuchfehler("zeitueberschreitung");
  pruefe(
    "Hinweis nach einem Suchfehler: Ursache genannt, kein Schluss auf den Bestand, kein Upload, erneut versuchen",
    hinweis.includes("zeitueberschreitung") && /NICHTS über den Inhalt/.test(hinweis) && /keinen Upload/.test(hinweis) && /erneut auf/.test(hinweis) && /Allgemeinwissen/.test(hinweis),
  );
  pruefe("Hinweis bei leerer Suche: erst anders formulieren (Risk, риск), dann erst 'nichts gefunden'", /anderen Fachbegriff/.test(hinweisFuerLage("keine", false)) && /Risk/.test(hinweisFuerLage("keine", false)));

  // Das Werkzeug selbst: Beschreibung nennt Risikomanagement, Eingabe kennt frageEnglisch, ein Fehler wird zu Ursache und Hinweis (nicht zu "keine Quellen").
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "test", WISSEN_BACKEND: "supabase", WISSEN_EMBED_URL: "http://127.0.0.1:1" }, async () => {
    const werkzeug = baueWissenWerkzeug("admin") as unknown as {
      description: string;
      inputSchema: { safeParse(x: unknown): { success: boolean } };
      execute(x: unknown, o: unknown): Promise<Record<string, unknown>>;
    } | null;
    pruefe("Werkzeug: wird fuer die Administration angeboten", werkzeug !== null);
    if (!werkzeug) return;
    pruefe("Werkzeug: Beschreibung nennt Risikomanagement, ISO 31000 und COSO", /Risikomanagement/.test(werkzeug.description) && /ISO 31000/.test(werkzeug.description) && /COSO/.test(werkzeug.description));
    pruefe("Werkzeug: Beschreibung sagt, dass die ganze Wissensbasis durchsucht wird und der Bereich nur ein Etikett ist", /GESAMTE Wissensbasis/.test(werkzeug.description) && /Ordnungsetikett/.test(werkzeug.description));
    pruefe("Werkzeug: frageEnglisch ist eine zulaessige Eingabe", werkzeug.inputSchema.safeParse({ frage: "Risiko", frageEnglisch: "risk management ISO 31000" }).success);
    const fehlerAlt = console.error;
    const protokoll: unknown[][] = [];
    console.error = (...a: unknown[]) => void protokoll.push(a);
    let r: Record<string, unknown>;
    try {
      r = await werkzeug.execute({ frage: "Welche Quellen gibt es zum Risikomanagement?", frageEnglisch: "risk management sources" }, { toolCallId: "t", messages: [] });
    } finally {
      console.error = fehlerAlt;
    }
    pruefe("Werkzeug: bei einem Fehler kommt fehler, Ursache und Hinweis statt einer leeren Antwort", r.fehler === "wissensbasis-nicht-erreichbar" && r.ursache === "einbettung" && r.anzahl === 0 && /keinen Upload/.test(String(r.hinweis)), JSON.stringify(r).slice(0, 200));
    pruefe("Werkzeug: der Fehler steht im Protokoll (bis 15.10.2026 wurde er verschluckt)", protokoll.length === 1 && String(protokoll[0]![0]).includes("Wissenssuche fehlgeschlagen") && JSON.stringify(protokoll[0]![1]).includes("einbettung"));
  });

  // Drei Formulierungen: Deutsch, Russisch, Englisch (Standards und Fachliteratur liegen oft auf Englisch vor).
  await mitUmgebung({ ...ENV_LEER, NODE_ENV: "production", WISSEN_BACKEND: "supabase" }, async () => {
    const { db, aufrufe } = falscheDatenbank({ data: [zeile("p1", 0.9, { autoritaetsstufe: 4 })], error: null });
    let eingebettet: string[] = [];
    await sucheWissen({ frage: "Risikomanagement", frageRussisch: "управление рисками", frageEnglisch: "enterprise risk management" }, "admin", {
      supabase: db,
      einbettung: {
        modell: "test-risk",
        dimension: 2,
        einbetten: async (x) => {
          eingebettet = x;
          return x.map(() => [0, 1]);
        },
      },
    });
    const fragen = aufrufe[0]!.args.p_fragen as unknown[];
    pruefe("Suche: bis zu drei Formulierungen (de, ru, en) werden eingebettet und gesucht", eingebettet.length === 3 && fragen.length === 3 && eingebettet[2] === "enterprise risk management");
  });
}

async function main() {
  await adapter();
  await einbettung();
  await backendwahl();
  await gesundheit();
  await ende();
  await fehlerpfad();
  console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
  if (fehler > 0) process.exit(1);
  console.log("Alle Pruefungen bestanden.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
