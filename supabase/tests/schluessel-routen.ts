// Verhaltenstests der beiden Schluessel-Routen fuer Soniox (Live-Diktat und
// Vorlese-Strom) und der Eingabepruefung der Vorlese-Route.
//
// Warum (Vibecode-Cleanup 28.09.2026, Funde 38/81/86/88): die Schranken dieser
// Routen waren nur als Quelltext festgenagelt. Eine auskommentierte
// Rechtepruefung, ein "&& false" am Nachweis oder eine Eingabepruefung, die
// alles durchliess, blieben in allen Tests gruen. Hier laeuft der echte Ablauf
// (lib/ai/soniox-zugang.ts, domain/vorlese-auswahl.ts) mit Attrappen nur fuer
// Sitzung, Datenbank und Soniox. Rechte (rbac.ts), Schalter, Adresse, Signatur
// und der Zaehler (ratenbegrenzung.ts) sind die echten.
//
// Geprueft wird jede Absage (Status und Grund) und dass dabei KEIN
// Soniox-Schluessel geholt wird, dazu die festen Obergrenzen (Funde 15/79) und
// der zeitlich begrenzte Nachweis ueber eine gespeicherte Antwort (Funde 26/78).
//
// Kein Netzwerk, keine Datenbank. Aufruf: npm run test:schluessel-routen

import type { Role } from "../../src/lib/rbac";
import {
  DIKTAT_SCHLUESSEL_JE_MINUTE,
  GESPRAECH_SCHLUESSEL_JE_MINUTE,
  NACHWEIS_NACHRICHT_FRISCH_MS,
  gibDiktatSchluessel,
  gibVorleseSchluessel,
  type NachweisNachricht,
  type VorleseUmgebung,
} from "../../src/lib/ai/soniox-zugang";
import { holeSonioxSchluessel, sonioxReferenz } from "../../src/lib/ai/soniox-client";
import { ratenlimitUeberschritten } from "../../src/lib/ai/ratenbegrenzung";
import { GESPRAECH_SITZUNG_S, SITZUNG_HOECHSTENS_S } from "../../src/lib/domain/diktat-live";
import { STROM_SCHLUESSEL_JE_MINUTE, STROM_SITZUNG_S } from "../../src/lib/domain/sprachausgabe-strom";
import { signiereAbschnitt } from "../../src/lib/domain/sprachausgabe-signatur";
import { AUSWAHL_HOECHSTENS, leseAuswahl, waehleVorleseTeil } from "../../src/lib/domain/vorlese-auswahl";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

// --- Umgebung ------------------------------------------------------------------------

const GEHEIMNIS = "geheimnis-fuer-den-test-0123456789";
const GRUNDWERTE: Record<string, string | undefined> = {
  KI_DIKTAT_LIVE: "an",
  SONIOX_API_URL: "https://api.eu.soniox.com",
  SONIOX_STT_WS_URL: undefined,
  SONIOX_TTS_WS_URL: undefined,
  KI_SPRACHAUSGABE_ANBIETER: "soniox",
  KI_SPRACHAUSGABE_STROM: undefined,
  KI_SPRACHAUSGABE_SIGNATUR: GEHEIMNIS,
};
const gesichert = Object.fromEntries(Object.keys(GRUNDWERTE).map((k) => [k, process.env[k]]));
function setzeUmgebung(abweichend: Record<string, string | undefined> = {}) {
  for (const [k, v] of Object.entries({ ...GRUNDWERTE, ...abweichend })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// Protokollzeilen der Routen (console.error/warn) gehoeren nicht in die Testausgabe.
const echteKonsole = { error: console.error, warn: console.warn };
console.error = () => {};
console.warn = () => {};

// Jede Pruefung bekommt eine eigene Person: der Zaehler ist echt und zaehlt je ID.
let personNr = 0;
const neueId = () => `00000000-0000-4000-8000-${String(++personNr).padStart(12, "0")}`;

const JETZT = Date.parse("2026-09-28T10:00:00Z");

interface Aufbau {
  angemeldet?: boolean;
  rolle?: Role;
  id?: string;
  adminGrenze?: number | null;
  sonioxOk?: boolean;
  nachricht?: NachweisNachricht | null | "db-fehler";
}

function baue(a: Aufbau = {}) {
  const id = a.id ?? neueId();
  const geholt: Array<{ zweck: string; sitzungS: number; gueltigS: number; referenz?: string }> = [];
  const u: VorleseUmgebung = {
    profil: async () => (a.angemeldet === false ? null : { id, role: a.rolle ?? "kunde" }),
    ratenGrenze: async () => a.adminGrenze ?? null,
    ueberschritten: ratenlimitUeberschritten,
    holeSchluessel: async (zweck, o) => {
      geholt.push({ zweck, ...o });
      return a.sonioxOk === false ? { ok: false, grund: "schluessel-http-500: interne Details" } : { ok: true, schluessel: "temp:kurz" };
    },
    ladeNachricht: async () => (a.nachricht === "db-fehler" ? { ok: false } : { ok: true, nachricht: a.nachricht ?? null }),
    jetzt: () => JETZT,
  };
  return { id, u, geholt };
}

const anfrage = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

async function lies(antwort: Response): Promise<{ status: number; body: Record<string, unknown>; cache: string | null }> {
  return { status: antwort.status, body: (await antwort.json()) as Record<string, unknown>, cache: antwort.headers.get("cache-control") };
}

async function main() {
  // --- 1. Live-Diktat: Absagen -------------------------------------------------------
  {
    const faelle: Array<{ name: string; aufbau: Aufbau; umgebung?: Record<string, string | undefined>; status: number; grund: string }> = [
      { name: "ohne Anmeldung", aufbau: { angemeldet: false }, status: 401, grund: "nicht-angemeldet" },
      { name: "Rolle picker (kein Chat-Recht)", aufbau: { rolle: "picker" }, status: 403, grund: "keine-berechtigung" },
      { name: "Rolle erzeuger (kein Chat-Recht)", aufbau: { rolle: "erzeuger" }, status: 403, grund: "keine-berechtigung" },
      { name: "Schalter KI_DIKTAT_LIVE aus", aufbau: {}, umgebung: { KI_DIKTAT_LIVE: undefined }, status: 404, grund: "nicht-aktiv" },
      { name: "keine Soniox-Adresse", aufbau: {}, umgebung: { SONIOX_API_URL: undefined }, status: 404, grund: "nicht-aktiv" },
      { name: "Adresse ohne wss://", aufbau: {}, umgebung: { SONIOX_STT_WS_URL: "http://falsch" }, status: 404, grund: "nicht-aktiv" },
    ];
    for (const f of faelle) {
      setzeUmgebung(f.umgebung);
      const { u, geholt } = baue(f.aufbau);
      const r = await lies(await gibDiktatSchluessel(anfrage({ sprache: "de" }), u));
      pruefe(`Diktat: ${f.name} -> ${f.status} ${f.grund}, kein Soniox-Schluessel`, r.status === f.status && r.body.grund === f.grund && geholt.length === 0 && r.cache === "no-store", `${r.status} ${JSON.stringify(r.body)} geholt=${geholt.length}`);
    }
    setzeUmgebung();

    // Admin-Grenze: die zweite Anfrage in der Minute ist zu viel.
    const { u, geholt } = baue({ adminGrenze: 1 });
    const erste = await lies(await gibDiktatSchluessel(anfrage({}), u));
    const zweite = await lies(await gibDiktatSchluessel(anfrage({}), u));
    pruefe("Diktat: Admin-Grenze 1/min -> zweite Anfrage 429, kein zweiter Schluessel", erste.status === 200 && zweite.status === 429 && zweite.body.grund === "ratenlimit" && geholt.length === 1, `${erste.status}/${zweite.status} geholt=${geholt.length}`);

    // Soniox gibt keinen Schluessel: 502, der Grund des Dienstes bleibt im Protokoll.
    const kaputt = baue({ sonioxOk: false });
    const r = await lies(await gibDiktatSchluessel(anfrage({}), kaputt.u));
    pruefe("Diktat: Soniox sagt ab -> 502 ohne Details des Dienstes", r.status === 502 && r.body.grund === "dienst-nicht-erreichbar" && !JSON.stringify(r.body).includes("interne"), JSON.stringify(r.body));
  }

  // --- 2. Live-Diktat: Zusage ----------------------------------------------------------
  {
    setzeUmgebung();
    const { id, u, geholt } = baue({ rolle: "kunde" });
    const r = await lies(await gibDiktatSchluessel(anfrage({ sprache: "kk" }), u));
    const k = r.body.konfiguration as { language_hints?: string[] } | undefined;
    pruefe("Diktat: kunde bekommt einen Schluessel, Adresse und Konfiguration", r.status === 200 && r.body.schluessel === "temp:kurz" && r.body.adresse === "wss://stt-rt.eu.soniox.com/transcribe-websocket" && JSON.stringify(k?.language_hints) === '["kk","ru"]' && r.cache === "no-store", JSON.stringify(r.body).slice(0, 200));
    pruefe("Diktat: nur Spracherkennung, zwei Minuten, pseudonym", geholt.length === 1 && geholt[0].zweck === "transcribe_websocket" && geholt[0].sitzungS === SITZUNG_HOECHSTENS_S && geholt[0].referenz === sonioxReferenz("diktat", id) && !geholt[0].referenz?.includes(id), JSON.stringify(geholt));

    const g = baue();
    await gibDiktatSchluessel(anfrage({ zweck: "gespraech" }), g.u);
    pruefe("Diktat: Gespraech haelt GESPRAECH_SITZUNG_S", g.geholt[0]?.sitzungS === GESPRAECH_SITZUNG_S, JSON.stringify(g.geholt));
    const fremd = baue();
    await gibDiktatSchluessel(anfrage({ zweck: "alles" }), fremd.u);
    const kaputt = baue();
    await gibDiktatSchluessel(anfrage("{kein json"), kaputt.u);
    pruefe("Diktat: unbekannter Zweck und kaputter Koerper sind ein Diktat", fremd.geholt[0]?.sitzungS === SITZUNG_HOECHSTENS_S && kaputt.geholt[0]?.sitzungS === SITZUNG_HOECHSTENS_S);
  }

  // --- 3. Live-Diktat: feste Obergrenzen (Funde 15 und 79) -----------------------------
  {
    setzeUmgebung();
    // Ohne jede Admin-Einstellung (Auslieferungszustand) galt bisher gar keine Grenze.
    const { u, geholt } = baue({ adminGrenze: null });
    const status: number[] = [];
    for (let i = 0; i < 20; i++) status.push((await gibDiktatSchluessel(anfrage({}), u)).status);
    const erlaubt = status.filter((s) => s === 200).length;
    // Der Wert als Zahl, nicht als Konstante: gegen die Konstante selbst blieb jede Grenze gruen
    // (Mutation M1 der Gegenpruefung vom 29.09.2026, 12 auf 19).
    pruefe("Diktat: ohne Admin-Grenze gilt trotzdem eine feste Obergrenze von 12 je Minute", DIKTAT_SCHLUESSEL_JE_MINUTE === 12 && erlaubt === 12 && status.at(-1) === 429 && geholt.length === erlaubt, `erlaubt=${erlaubt} von 20, Grenze=${DIKTAT_SCHLUESSEL_JE_MINUTE}`);

    // Das Gespraech (30 Minuten je Schluessel) hat einen eigenen, engeren Zaehler.
    const g = baue({ adminGrenze: null });
    const gStatus: number[] = [];
    for (let i = 0; i < 12; i++) gStatus.push((await gibDiktatSchluessel(anfrage({ zweck: "gespraech" }), g.u)).status);
    const gErlaubt = gStatus.filter((s) => s === 200).length;
    pruefe("Gespraech: eigene, engere Obergrenze von 6 je Minute", GESPRAECH_SCHLUESSEL_JE_MINUTE === 6 && gErlaubt === 6 && gStatus.at(-1) === 429, `erlaubt=${gErlaubt} von 12, Grenze=${GESPRAECH_SCHLUESSEL_JE_MINUTE}`);
    const danach = await gibDiktatSchluessel(anfrage({ zweck: "diktat" }), g.u);
    pruefe("Gespraech: ein ausgeschoepfter Gespraechszaehler sperrt das Diktat nicht", danach.status === 200, String(danach.status));
  }

  // --- 4. Vorlese-Strom: Absagen -------------------------------------------------------
  const zugNachweis = (id: string, o: { nutzer?: string; ablauf?: number; geheimnis?: string; zug?: string } = {}) => {
    const ablauf = o.ablauf ?? JETZT + 5 * 60_000;
    const zug = o.zug ?? "zug-1";
    const sig = signiereAbschnitt({ nutzerId: o.nutzer ?? id, zug, nr: 0, text: "", ablauf }, o.geheimnis ?? GEHEIMNIS);
    return { zug, ablauf, sig };
  };
  const nachricht = (id: string, o: Partial<NachweisNachricht> = {}): NachweisNachricht => ({
    rolle: "assistent",
    profil_id: id,
    erstellt_am: new Date(JETZT - 60_000).toISOString(),
    ...o,
  });
  {
    type Fall = { name: string; aufbau?: Aufbau; umgebung?: Record<string, string | undefined>; body: (id: string) => unknown; status: number; grund: string };
    const faelle: Fall[] = [
      { name: "ohne Anmeldung", aufbau: { angemeldet: false }, body: (id) => zugNachweis(id), status: 401, grund: "nicht-angemeldet" },
      { name: "Rolle picker", aufbau: { rolle: "picker" }, body: (id) => zugNachweis(id), status: 403, grund: "keine-berechtigung" },
      { name: "Strom ausgeschaltet", umgebung: { KI_SPRACHAUSGABE_STROM: "aus" }, body: (id) => zugNachweis(id), status: 404, grund: "nicht-aktiv" },
      { name: "Anbieter nicht Soniox", umgebung: { KI_SPRACHAUSGABE_ANBIETER: "sokrates" }, body: (id) => zugNachweis(id), status: 404, grund: "nicht-aktiv" },
      { name: "keine Soniox-Adresse", umgebung: { SONIOX_API_URL: undefined }, body: (id) => zugNachweis(id), status: 404, grund: "nicht-aktiv" },
      { name: "kaputter Koerper", body: () => "{kein json", status: 400, grund: "ungueltige-eingabe" },
      { name: "ohne jeden Nachweis", body: () => ({}), status: 403, grund: "nicht-erlaubt" },
      { name: "Zug ohne Signatur", body: (id) => ({ ...zugNachweis(id), sig: "" }), status: 403, grund: "nicht-erlaubt" },
      { name: "Zug einer anderen Person", body: (id) => zugNachweis(id, { nutzer: "jemand-anderes" }), status: 403, grund: "nicht-erlaubt" },
      { name: "Zug mit fremdem Geheimnis", body: (id) => zugNachweis(id, { geheimnis: "ein-ganz-anderes-geheimnis-123" }), status: 403, grund: "nicht-erlaubt" },
      { name: "abgelaufener Zug", body: (id) => zugNachweis(id, { ablauf: JETZT - 1 }), status: 403, grund: "nicht-erlaubt" },
      { name: "Zug-Signatur fuer einen anderen Zug", body: (id) => ({ ...zugNachweis(id), zug: "zug-2" }), status: 403, grund: "nicht-erlaubt" },
      { name: "ohne Signatur-Geheimnis auf dem Server", umgebung: { KI_SPRACHAUSGABE_SIGNATUR: undefined }, body: (id) => zugNachweis(id), status: 403, grund: "nicht-erlaubt" },
      { name: "Nachrichten-ID keine UUID", body: () => ({ nachrichtId: "1; drop table" }), status: 400, grund: "ungueltige-eingabe" },
      { name: "Nachricht nicht gefunden (oder fremd per RLS)", aufbau: { nachricht: null }, body: () => ({ nachrichtId: neueId() }), status: 403, grund: "nicht-erlaubt" },
      { name: "Datenbankfehler", aufbau: { nachricht: "db-fehler" }, body: () => ({ nachrichtId: neueId() }), status: 500, grund: "db-fehler" },
    ];
    for (const f of faelle) {
      setzeUmgebung(f.umgebung);
      const b = baue(f.aufbau);
      const r = await lies(await gibVorleseSchluessel(anfrage(f.body(b.id)), b.u));
      pruefe(`Vorlesen: ${f.name} -> ${f.status} ${f.grund}, kein Soniox-Schluessel`, r.status === f.status && r.body.grund === f.grund && b.geholt.length === 0 && r.cache === "no-store", `${r.status} ${JSON.stringify(r.body)} geholt=${b.geholt.length}`);
    }
    setzeUmgebung();

    // Nachweis ueber eine Nachrichten-ID: nur die eigene, frische Antwort (Funde 26/78).
    const nachrichtFaelle: Array<{ name: string; zeile: (id: string) => NachweisNachricht; status: number }> = [
      { name: "eigene Antwort von vor einer Minute", zeile: (id) => nachricht(id), status: 200 },
      { name: "Frage statt Antwort (rolle nutzer)", zeile: (id) => nachricht(id, { rolle: "nutzer" }), status: 403 },
      { name: "Antwort einer anderen Person (Buero sieht sie per RLS)", zeile: () => nachricht(neueId()), status: 403 },
      { name: "alte Antwort (eine Stunde)", zeile: (id) => nachricht(id, { erstellt_am: new Date(JETZT - 60 * 60_000).toISOString() }), status: 403 },
      { name: "Antwort knapp ausserhalb des Fensters", zeile: (id) => nachricht(id, { erstellt_am: new Date(JETZT - (NACHWEIS_NACHRICHT_FRISCH_MS ?? 0) - 1_000).toISOString() }), status: 403 },
      { name: "Antwort knapp innerhalb des Fensters", zeile: (id) => nachricht(id, { erstellt_am: new Date(JETZT - (NACHWEIS_NACHRICHT_FRISCH_MS ?? 0) + 1_000).toISOString() }), status: 200 },
      { name: "Zeitstempel in der Zukunft", zeile: (id) => nachricht(id, { erstellt_am: new Date(JETZT + 60 * 60_000).toISOString() }), status: 403 },
      { name: "unlesbarer Zeitstempel", zeile: (id) => nachricht(id, { erstellt_am: "gestern" }), status: 403 },
    ];
    for (const f of nachrichtFaelle) {
      const id = neueId();
      const b = baue({ id, nachricht: f.zeile(id) });
      const r = await gibVorleseSchluessel(anfrage({ nachrichtId: neueId() }), b.u);
      pruefe(`Vorlesen per Nachrichten-ID: ${f.name} -> ${f.status}`, r.status === f.status && b.geholt.length === (f.status === 200 ? 1 : 0), `${r.status} geholt=${b.geholt.length}`);
    }
  }

  // --- 5. Vorlese-Strom: Zusage und Grenzen --------------------------------------------
  {
    setzeUmgebung();
    const { id, u, geholt } = baue({ rolle: "kunde" });
    const r = await lies(await gibVorleseSchluessel(anfrage(zugNachweis(id)), u));
    const konf = r.body.konfigurationen as Record<string, { language?: string; voice?: string }> | undefined;
    pruefe("Vorlesen: gueltiger Zug-Nachweis -> Schluessel, Adresse, Konfiguration fuer alle vier Sprachen", r.status === 200 && r.body.schluessel === "temp:kurz" && r.body.adresse === "wss://tts-rt.eu.soniox.com/tts-websocket" && ["de", "en", "ru", "kk"].every((s) => konf?.[s]?.language === s && !!konf?.[s]?.voice) && r.body.gueltigMs === 60_000 && r.cache === "no-store", JSON.stringify(r.body).slice(0, 300));
    pruefe("Vorlesen: nur TTS, begrenzte Dauer je Strom, pseudonym", geholt.length === 1 && geholt[0].zweck === "tts_rt" && geholt[0].sitzungS === STROM_SITZUNG_S && geholt[0].referenz === sonioxReferenz("vorlesen", id) && geholt[0].referenz !== sonioxReferenz("diktat", id), JSON.stringify(geholt));

    const fest = baue({ adminGrenze: null });
    const status: number[] = [];
    for (let i = 0; i < STROM_SCHLUESSEL_JE_MINUTE + 3; i++) status.push((await gibVorleseSchluessel(anfrage(zugNachweis(fest.id)), fest.u)).status);
    pruefe("Vorlesen: feste Obergrenze je Minute auch ohne Admin-Einstellung", status.filter((s) => s === 200).length === STROM_SCHLUESSEL_JE_MINUTE && status.at(-1) === 429 && fest.geholt.length === STROM_SCHLUESSEL_JE_MINUTE, status.join(","));

    // Admin-Grenze 1/min, fuers Vorlesen verdreifacht (skaliereFuerSprachausgabe).
    const admin = baue({ adminGrenze: 1 });
    const aStatus: number[] = [];
    for (let i = 0; i < 5; i++) aStatus.push((await gibVorleseSchluessel(anfrage(zugNachweis(admin.id)), admin.u)).status);
    pruefe("Vorlesen: Admin-Grenze gilt zusaetzlich (1/min -> 3 Schluessel)", aStatus.join(",") === "200,200,200,429,429" && admin.geholt.length === 3, aStatus.join(","));

    const kaputt = baue({ sonioxOk: false });
    const k = await lies(await gibVorleseSchluessel(anfrage(zugNachweis(kaputt.id)), kaputt.u));
    pruefe("Vorlesen: Soniox sagt ab -> 502 ohne Details des Dienstes", k.status === 502 && k.body.grund === "dienst-nicht-erreichbar" && !JSON.stringify(k.body).includes("interne"), JSON.stringify(k.body));
  }

  // --- 6. Soniox-Client: Schluessel immer einmalig, Referenz pseudonym ---------------
  {
    const echtesFetch = globalThis.fetch;
    const koerper: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      koerper.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ api_key: "temp:abc", expires_at: "2026-09-28T10:01:00Z" }), { status: 200 });
    }) as typeof fetch;
    const alterKey = process.env.SONIOX_API_KEY;
    process.env.SONIOX_API_KEY = "echter-schluessel";
    try {
      const diktat = await holeSonioxSchluessel("transcribe_websocket", { gueltigS: 60, sitzungS: 120 });
      const vorlesen = await holeSonioxSchluessel("tts_rt", { gueltigS: 60, sitzungS: 150 });
      pruefe("Soniox-Client: Diktat- und Vorlese-Schluessel sind beide einmalig (single_use)", koerper.length === 2 && koerper.every((k) => k.single_use === true), JSON.stringify(koerper));
      pruefe("Soniox-Client: die Antwort traegt nur den kurzlebigen Schluessel", diktat.ok && vorlesen.ok && JSON.stringify(diktat) === '{"ok":true,"schluessel":"temp:abc"}', JSON.stringify(diktat));
    } finally {
      globalThis.fetch = echtesFetch;
      if (alterKey === undefined) delete process.env.SONIOX_API_KEY;
      else process.env.SONIOX_API_KEY = alterKey;
    }
    const r = sonioxReferenz("diktat", "profil-123");
    pruefe("Referenz: 32 Hex-Zeichen, stabil, ohne die Profil-ID", /^[0-9a-f]{32}$/.test(r) && r === sonioxReferenz("diktat", "profil-123") && !r.includes("profil"), r);
    pruefe("Referenz: je Zweck und Person verschieden", r !== sonioxReferenz("vorlesen", "profil-123") && r !== sonioxReferenz("diktat", "profil-124"));
  }

  // --- 7. Vorlese-Route: Eingabepruefung block/rest (Fund 88) --------------------------
  {
    const gut: Array<[unknown, unknown, { rest?: number; block?: number }]> = [
      [null, null, { rest: undefined, block: undefined }],
      ["", "", { rest: undefined, block: undefined }],
      [undefined, "0", { rest: undefined, block: 0 }],
      ["3", "1", { rest: 3, block: 1 }],
      [String(AUSWAHL_HOECHSTENS), "0", { rest: AUSWAHL_HOECHSTENS, block: 0 }],
      [2, 1, { rest: 2, block: 1 }],
    ];
    for (const [rest, block, erwartet] of gut) {
      const a = leseAuswahl(rest, block);
      pruefe(`Auswahl: rest=${JSON.stringify(rest)} block=${JSON.stringify(block)} gilt`, a !== null && a.rest === erwartet.rest && a.block === erwartet.block, JSON.stringify(a));
    }
    const schlecht: Array<[unknown, unknown]> = [
      ["-1", null], [null, "-1"], ["1e3", null], [null, "99999"], ["abc", null], [null, " 1"], ["0x10", null],
      ["1.5", null], [1.5, null], [-1, null], [AUSWAHL_HOECHSTENS + 1, null], [null, Number.NaN], [null, true], [null, { block: 1 }],
    ];
    for (const [rest, block] of schlecht) {
      pruefe(`Auswahl: rest=${JSON.stringify(rest)} block=${JSON.stringify(block)} wird abgelehnt (400)`, leseAuswahl(rest, block) === null);
    }

    const bloecke = [
      { text: "Guten Tag.", sprache: "de", von: 0, bis: 1 },
      { text: "Добрый день.", sprache: "ru", von: 1, bis: 2 },
    ];
    const zwei = { sprache: "de", bloecke };
    const eins = { sprache: "de", bloecke: [bloecke[0]] };
    const ganz = "Guten Tag. Добрый день.";
    const t = (a: { rest?: number; block?: number }, plan: typeof zwei) => waehleVorleseTeil(a, plan, ganz);
    pruefe("Blockwahl: ohne block (alter Tab) die ganze Antwort, ohne Teil", JSON.stringify(t({}, zwei)) === JSON.stringify({ text: ganz, sprache: "de" }));
    pruefe("Blockwahl: Block 0 von zweien ist ein Teil", JSON.stringify(t({ block: 0 }, zwei)) === JSON.stringify({ text: "Guten Tag.", sprache: "de", teil: { von: 0, bis: 1 } }));
    pruefe("Blockwahl: Block 1 bekommt seine eigene Sprache", JSON.stringify(t({ block: 1 }, zwei)) === JSON.stringify({ text: "Добрый день.", sprache: "ru", teil: { von: 1, bis: 2 } }));
    pruefe("Blockwahl: ein Block ausserhalb des Plans wird abgelehnt (422)", t({ block: 2 }, zwei) === null && t({ block: 1 }, eins) === null && t({ block: 1, rest: 2 }, { sprache: "de", bloecke: [] }) === null);
    pruefe("Blockwahl: nur ein Block und kein rest -> ganze Antwort (derselbe Ablagepfad wie bisher)", JSON.stringify(t({ block: 0 }, eins)) === JSON.stringify({ text: ganz, sprache: "de" }));
    pruefe("Blockwahl: nur ein Block, aber mit rest -> ein Teil", t({ block: 0, rest: 1 }, eins)?.teil?.von === 0);
  }

  setzeUmgebung(gesichert);
  console.error = echteKonsole.error;
  console.warn = echteKonsole.warn;

  console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
  if (fehler > 0) process.exit(1);
  console.log("Alle Pruefungen bestanden.");
}

main().catch((e) => {
  console.error = echteKonsole.error;
  console.error(e);
  process.exit(1);
});
