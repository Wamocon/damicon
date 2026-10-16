// Auslieferung der Integrations-Warteschlange (WMCNL-1627, WMCNL-2290): Wiederholungen und Fristen, Bedeutung der Antworten, zulaessige
// Adressen, Signatur und Ablauf des Webhooks gegen einen echten lokalen HTTP-Server, Sperre gegen doppeltes Senden und die Texte in vier
// Sprachen. Kein Netz nach aussen, keine Datenbank (die Tabellenseite prueft test:integration-auslieferung-db).
//
// Aufruf: npm run test:integration-auslieferung

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import {
  MAX_VERSUCHE,
  SPERRE_MINUTEN,
  baueUmschlag,
  bewerteAntwort,
  fortschritt,
  istInternerHost,
  konfigurationFehler,
  naechsterVersuch,
  zielUrlFehler,
  type Fortschritt,
} from "@/lib/domain/integration-auslieferung";
import { SIGNATUR_TOLERANZ_SEKUNDEN, pruefeSignatur, sendeWebhook, signiere } from "@/lib/integration/webhook-adapter";
import { VORLAGE_BEISPIEL_1C, VORSCHAU_UMSCHLAG, baueKoerper, pruefeVorlage, schlageNach, wendeVorlageAn } from "@/lib/domain/integration-vorlage";
import { liefereAus, type AuslieferungSpeicher, type IntegrationsZiel, type OutboxEintrag, type Sender } from "@/lib/integration/auslieferung";

let fehler = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}
const JETZT = new Date("2026-10-14T10:00:00Z");
const minuten = (d: Date | null) => (d === null ? null : Math.round((d.getTime() - JETZT.getTime()) / 60_000));

// --- 1. Wiederholungen ----------------------------------------------------------------------------------------------------------
check("Frist: nach dem 1., 2., 3., 4., 5. Fehlversuch 1, 5, 15, 60, 240 Minuten", [1, 2, 3, 4, 5].map((v) => minuten(naechsterVersuch(v, JETZT))).join(",") === "1,5,15,60,240");
check(`Frist: nach ${MAX_VERSUCHE} Versuchen ist Schluss`, naechsterVersuch(MAX_VERSUCHE, JETZT) === null && naechsterVersuch(MAX_VERSUCHE + 3, JETZT) === null && minuten(naechsterVersuch(0, JETZT)) === 1);

// --- 2. Antworten ----------------------------------------------------------------------------------------------------------------
check("Antwort: 2xx angenommen", [200, 201, 202, 204, 299].every((s) => bewerteAntwort(s).art === "zugestellt"));
check("Antwort: 408, 429 und 5xx sind vorlaeufig, ohne Antwort ein Netzfehler", [408, 429, 500, 502, 503, 504].every((s) => bewerteAntwort(s).art === "wiederholen") && bewerteAntwort(null, "Zeitlimit").art === "wiederholen");
check("Antwort: andere 4xx und Weiterleitungen sind eine Ablehnung", [301, 302, 400, 401, 403, 404, 409, 422].every((s) => bewerteAntwort(s).art === "abgelehnt"));
{
  const v0 = { versuche: 0 };
  const ok = fortschritt(v0, bewerteAntwort(200), JETZT);
  check("Fortschritt: zugestellt wird sent und nicht wieder faellig", ok.status === "sent" && ok.versuche === 1 && ok.naechsterVersuchAm === null && ok.letzterFehler === null && ok.antwortStatus === 200);
  const abgelehnt = fortschritt(v0, bewerteAntwort(422), JETZT);
  check("Fortschritt: eine Ablehnung scheitert sofort", abgelehnt.status === "failed" && abgelehnt.letzterFehler === "HTTP 422" && abgelehnt.naechsterVersuchAm === null);
  const wartet = fortschritt({ versuche: 2 }, bewerteAntwort(503), JETZT);
  check("Fortschritt: ein vorlaeufiger Fehler wartet auf die naechste Frist", wartet.status === "pending" && wartet.versuche === 3 && minuten(wartet.naechsterVersuchAm) === 15 && wartet.letzterFehler === "HTTP 503");
  const aufgegeben = fortschritt({ versuche: MAX_VERSUCHE - 1 }, bewerteAntwort(503), JETZT);
  check("Fortschritt: der letzte Versuch scheitert endgueltig und sagt es", aufgegeben.status === "failed" && aufgegeben.versuche === MAX_VERSUCHE && (aufgegeben.letzterFehler ?? "").includes("aufgegeben"));
}

// --- 3. Adressen -----------------------------------------------------------------------------------------------------------------
check("Adresse: eine oeffentliche https-Adresse ist zulaessig", zielUrlFehler("https://hooks.example.kz/damicon/esf") === null && zielUrlFehler("  https://partner.example.com:8443/x?a=1  ") === null);
check("Adresse: nur https, ohne Zugangsdaten, kein Muell", zielUrlFehler("http://hooks.example.kz/x") === "integrationUrl" && zielUrlFehler("https://user:pw@hooks.example.kz/x") === "integrationUrl" && zielUrlFehler("ftp://hooks.example.kz") === "integrationUrl" && zielUrlFehler("kein url") === "integrationUrl" && zielUrlFehler("") === "integrationUrl" && zielUrlFehler(`https://example.kz/${"x".repeat(500)}`) === "integrationUrl");
{
  const intern = ["localhost", "app.localhost", "127.0.0.1", "127.8.8.8", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.10", "169.254.169.254", "0.0.0.0", "100.64.0.1", "printer.local", "db.internal", "nas.lan", "::1", "[::1]", "fd00::1", "fe80::1", "::ffff:127.0.0.1"];
  const oeffentlich = ["hooks.example.kz", "8.8.8.8", "172.32.0.1", "172.15.0.1", "100.128.0.1", "2001:4860:4860::8888"];
  check("Host: Rechner im eigenen Netz und auf der eigenen Maschine werden erkannt", intern.every((h) => istInternerHost(h)), intern.filter((h) => !istInternerHost(h)).join(","));
  check("Host: oeffentliche Namen und Adressen nicht", oeffentlich.every((h) => !istInternerHost(h)), oeffentlich.filter((h) => istInternerHost(h)).join(","));
  check("Adresse: ein interner Host wird als solcher gemeldet", zielUrlFehler("https://localhost/x") === "integrationUrlIntern" && zielUrlFehler("https://169.254.169.254/latest/meta-data") === "integrationUrlIntern" && zielUrlFehler("https://[::1]/x") === "integrationUrlIntern");
}
{
  const ok = { adapter: "webhook", zielUrl: "https://hooks.example.kz/x", geheimnisName: "DAMICON_HOOK_ESF", aktiv: true };
  check("Konfiguration: ein vollstaendiger Webhook ist in Ordnung, auch inaktiv ohne Angaben", konfigurationFehler(ok) === null && konfigurationFehler({ ...ok, aktiv: false, zielUrl: "", geheimnisName: "" }) === null && konfigurationFehler({ adapter: "manuell", zielUrl: "", geheimnisName: "", aktiv: false }) === null);
  check("Konfiguration: aktiv braucht Adresse und Geheimnis, manuell kann nicht aktiv sein", konfigurationFehler({ ...ok, zielUrl: "" }) === "integrationUnvollstaendig" && konfigurationFehler({ ...ok, geheimnisName: "" }) === "integrationUnvollstaendig" && konfigurationFehler({ ...ok, adapter: "manuell" }) === "integrationUnvollstaendig");
  check("Konfiguration: unbekannter Adapter, schlechte Adresse, Geheimnisname nur als Name", konfigurationFehler({ ...ok, adapter: "ftp" }) === "integrationAdapter" && konfigurationFehler({ ...ok, zielUrl: "http://x.kz" }) === "integrationUrl" && konfigurationFehler({ ...ok, zielUrl: "https://10.0.0.1/x" }) === "integrationUrlIntern" && konfigurationFehler({ ...ok, geheimnisName: "klein" }) === "integrationGeheimnis" && konfigurationFehler({ ...ok, geheimnisName: "geheimnis-wert-123" }) === "integrationGeheimnis");
}

// --- 4. Signatur und Ablauf gegen einen echten HTTP-Server -------------------------------------------------------------------------------
const umschlag = baueUmschlag({ id: "o-1", ereignis: "esf.beleg_ausgestellt", idempotenzSchluessel: "esf:b1:ausgestellt", erstelltAm: "2026-10-14T09:00:00Z", versuche: 0, payload: { belegId: "b1", betrag: 168000 } });
check("Umschlag: feste Schluessel, Nutzdaten unter daten, der Versuch zaehlt ab 1", umschlag.id === "o-1" && umschlag.versuch === 1 && umschlag.idempotenzSchluessel === "esf:b1:ausgestellt" && JSON.stringify(Object.keys(umschlag)) === JSON.stringify(["id", "ereignis", "idempotenzSchluessel", "erstelltAm", "versuch", "daten"]) && baueUmschlag({ ...{ id: "x", ereignis: null, idempotenzSchluessel: null, erstelltAm: "t", versuche: 3, payload: 1 } }).versuch === 4);
check("Signatur: HMAC-SHA256 ueber Zeitstempel und Koerper, wie ein Partner sie nachrechnet", signiere("geheim", 1_700_000_000, '{"a":1}') === `sha256=${createHmac("sha256", "geheim").update('1700000000.{"a":1}').digest("hex")}` && signiere("geheim", 1, "x") !== signiere("geheim", 2, "x") && signiere("geheim", 1, "x") !== signiere("anderes", 1, "x"));

type Empfang = { methode: string | undefined; kopf: IncomingHttpHeaders; koerper: string };
const empfangen: Empfang[] = [];
let antwortStatus = 200;
let antwortKopf: Record<string, string> = {};
const server = createServer((anfrage, antwort) => {
  let koerper = "";
  anfrage.on("data", (c) => (koerper += c));
  anfrage.on("end", () => {
    empfangen.push({ methode: anfrage.method, kopf: anfrage.headers, koerper });
    antwort.writeHead(antwortStatus, antwortKopf);
    antwort.end("ok");
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as AddressInfo).port;

const GEHEIMNIS = "ein-langes-geheimnis";
const umgebung = { DAMICON_HOOK_ESF: GEHEIMNIS };
const ziel = { zielUrl: "https://hooks.example.kz/damicon/esf", geheimnisName: "DAMICON_HOOK_ESF" };
const oeffentlich = async () => [{ address: "93.184.216.34" }];
// Der Abruf geht an den lokalen Server statt an die Adresse im Ziel; alles andere (Kopf, Koerper, Methode, Weiterleitungen) ist der echte Weg.
const lokal: typeof fetch = (url, init) => fetch(`http://127.0.0.1:${port}/hook`, init);
const sende = (extra: Parameters<typeof sendeWebhook>[2] = {}) => sendeWebhook(ziel, umschlag, { umgebung, jetzt: () => 1_760_000_000_000, abruf: lokal, aufloesen: oeffentlich, ...extra });

{
  empfangen.length = 0;
  antwortStatus = 202;
  const z = await sende();
  const e = empfangen[0];
  check("Webhook: 202 gilt als zugestellt", z.art === "zugestellt" && empfangen.length === 1);
  check("Webhook: ein POST mit JSON, Idempotency-Key, Zeitstempel und Signatur", e.methode === "POST" && e.kopf["content-type"] === "application/json" && e.kopf["idempotency-key"] === "esf:b1:ausgestellt" && e.kopf["x-damicon-zeitstempel"] === "1760000000" && String(e.kopf["user-agent"]).startsWith("Damicon-Integration"));
  const erwartet = createHmac("sha256", GEHEIMNIS).update(`${e.kopf["x-damicon-zeitstempel"]}.${e.koerper}`).digest();
  const erhalten = Buffer.from(String(e.kopf["x-damicon-signatur"]).replace("sha256=", ""), "hex");
  check("Webhook: der Partner kann die Signatur mit seinem Geheimnis nachrechnen und Verfaelschung erkennen", erhalten.length === erwartet.length && timingSafeEqual(erhalten, erwartet) && JSON.parse(e.koerper).daten.belegId === "b1");
  const verfaelscht = createHmac("sha256", GEHEIMNIS).update(`${e.kopf["x-damicon-zeitstempel"]}.${e.koerper.replace("168000", "1")}`).digest("hex");
  check("Webhook: ein veraenderter Koerper ergibt eine andere Signatur", `sha256=${verfaelscht}` !== e.kopf["x-damicon-signatur"]);
  check("Webhook: das Geheimnis selbst geht nicht mit", !JSON.stringify(e.kopf).includes(GEHEIMNIS) && !e.koerper.includes(GEHEIMNIS));
}
{
  antwortStatus = 503;
  const z503 = await sende();
  antwortStatus = 422;
  const z422 = await sende();
  antwortStatus = 302;
  antwortKopf = { Location: "http://127.0.0.1:1/intern" };
  empfangen.length = 0;
  const z302 = await sende();
  antwortKopf = {};
  check("Webhook: 503 wird wiederholt, 422 abgelehnt, eine Weiterleitung nicht verfolgt", z503.art === "wiederholen" && z422.art === "abgelehnt" && z302.art === "abgelehnt" && empfangen.length === 1);
}
{
  const ohneGeheimnis = await sende({ umgebung: {} });
  const intern = await sende({ aufloesen: async () => [{ address: "10.0.0.7" }] });
  const gemischt = await sende({ aufloesen: async () => [{ address: "93.184.216.34" }, { address: "169.254.169.254" }] });
  const unaufloesbar = await sende({ aufloesen: async () => { throw new Error("ENOTFOUND"); } });
  const falscheUrl = await sendeWebhook({ zielUrl: "http://hooks.example.kz/x", geheimnisName: "DAMICON_HOOK_ESF" }, umschlag, { umgebung, abruf: lokal, aufloesen: oeffentlich });
  check("Webhook: ohne Geheimnis wartet der Eintrag, damit er nach der Korrektur ausgeliefert wird", ohneGeheimnis.art === "wiederholen" && ohneGeheimnis.grund.includes("DAMICON_HOOK_ESF"));
  check("Webhook: ein Name, der ins eigene Netz zeigt, wird nicht angerufen (auch nicht bei einer gemischten Antwort)", intern.art === "abgelehnt" && gemischt.art === "abgelehnt");
  check("Webhook: ein nicht aufloesbarer Name ist ein vorlaeufiger Fehler, eine http-Adresse eine Ablehnung", unaufloesbar.art === "wiederholen" && falscheUrl.art === "abgelehnt");
  const zeitlimit = await sende({ abruf: async () => { throw Object.assign(new Error("x"), { name: "TimeoutError" }); } });
  const netz = await sende({ abruf: async () => { throw new TypeError("fetch failed"); } });
  check("Webhook: Zeitlimit und Netzfehler sind vorlaeufig", zeitlimit.art === "wiederholen" && zeitlimit.grund === "Zeitlimit" && netz.art === "wiederholen" && netz.grund.includes("Netzfehler"));
}

// --- 5. Auslieferung mit Speicher im Arbeitsspeicher --------------------------------------------------------------------------------------
interface Zeile extends OutboxEintrag {
  status: "pending" | "sent" | "failed";
  fehler: string | null;
  integration: IntegrationsZiel;
}
const INTEGRATION: IntegrationsZiel = { id: "i1", key: "esf", adapter: "webhook", zielUrl: "https://hooks.example.kz/x", geheimnisName: "DAMICON_HOOK_ESF" };
function speicher(zeilen: Zeile[]): AuslieferungSpeicher {
  return {
    async faellige(jetzt, limit) {
      return zeilen
        .filter((z) => z.status === "pending" && Date.parse(z.naechsterVersuchAm) <= jetzt.getTime())
        .slice(0, limit)
        .map((z) => ({ eintrag: { ...z }, integration: z.integration }));
    },
    async beanspruche(id, erwartet, bis) {
      const z = zeilen.find((x) => x.id === id);
      if (!z || z.status !== "pending" || z.naechsterVersuchAm !== erwartet) return false;
      z.naechsterVersuchAm = bis.toISOString();
      return true;
    },
    async speichere(id, f: Fortschritt, jetzt) {
      const z = zeilen.find((x) => x.id === id)!;
      z.status = f.status === "acked" ? "sent" : f.status;
      z.versuche = f.versuche;
      z.fehler = f.letzterFehler;
      z.naechsterVersuchAm = (f.naechsterVersuchAm ?? jetzt).toISOString();
    },
  };
}
const zeile = (id: string, extra: Partial<Zeile> = {}): Zeile => ({
  id, ereignis: "esf.beleg_ausgestellt", idempotenzSchluessel: `esf:${id}`, payload: { id }, versuche: 0, erstelltAm: "2026-10-14T09:00:00Z",
  naechsterVersuchAm: "2026-10-14T09:00:00.000Z", status: "pending", fehler: null, integration: INTEGRATION, ...extra,
});
{
  const zeilen = [zeile("a"), zeile("b"), zeile("c")];
  const aufrufe: string[] = [];
  const sender: Sender = async (_i, u) => {
    aufrufe.push(u.id);
    return bewerteAntwort(u.id === "a" ? 200 : u.id === "b" ? 503 : 422);
  };
  const erg = await liefereAus(speicher(zeilen), sender, JETZT);
  check("Lauf: eine Annahme, ein vorlaeufiger Fehler, eine Ablehnung", erg.versucht === 3 && erg.zugestellt === 1 && erg.wiederholen === 1 && erg.gescheitert === 1 && zeilen.map((z) => z.status).join(",") === "sent,pending,failed");
  check("Lauf: der vorlaeufige Eintrag wartet eine Minute und zaehlt den Versuch", zeilen[1].versuche === 1 && minuten(new Date(zeilen[1].naechsterVersuchAm)) === 1 && zeilen[1].fehler === "HTTP 503");
  const nochmal = await liefereAus(speicher(zeilen), sender, JETZT);
  check("Lauf: sofort danach ist nichts faellig, ein gesendeter oder gescheiterter Eintrag kommt nie wieder", nochmal.versucht === 0 && aufrufe.length === 3);
  const spaeter = await liefereAus(speicher(zeilen), async (_i, u) => { aufrufe.push(u.id); return bewerteAntwort(200); }, new Date(JETZT.getTime() + 2 * 60_000));
  check("Lauf: nach der Frist wird der wartende Eintrag erneut versucht und angenommen, mit hochgezaehltem Versuch im Umschlag", spaeter.zugestellt === 1 && zeilen[1].status === "sent" && zeilen[1].versuche === 2);
}
{
  // Zwei Laeufe gleichzeitig: jeder Eintrag geht genau einmal hinaus.
  const zeilen = Array.from({ length: 6 }, (_, i) => zeile(`p${i}`));
  const gesendet: string[] = [];
  const sender: Sender = async (_i, u) => {
    gesendet.push(u.id);
    await new Promise((r) => setTimeout(r, 5));
    return bewerteAntwort(200);
  };
  const s = speicher(zeilen);
  const [x, y] = await Promise.all([liefereAus(s, sender, JETZT), liefereAus(s, sender, JETZT)]);
  check("Sperre: zwei gleichzeitige Laeufe senden jeden Eintrag genau einmal", gesendet.length === 6 && new Set(gesendet).size === 6 && x.zugestellt + y.zugestellt === 6 && x.uebersprungen + y.uebersprungen >= 1, `${gesendet.length} gesendet, ${x.uebersprungen + y.uebersprungen} uebersprungen`);
}
{
  // Ein Lauf, der mitten im Versuch stirbt, laesst den Eintrag nach der Sperre wieder faellig werden.
  const zeilen = [zeile("t")];
  const s = speicher(zeilen);
  const faellig = await s.faellige(JETZT, 5);
  await s.beanspruche("t", faellig[0].eintrag.naechsterVersuchAm, new Date(JETZT.getTime() + SPERRE_MINUTEN * 60_000));
  const waehrend = await liefereAus(s, async () => bewerteAntwort(200), new Date(JETZT.getTime() + 60_000));
  const danach = await liefereAus(s, async () => bewerteAntwort(200), new Date(JETZT.getTime() + (SPERRE_MINUTEN + 1) * 60_000));
  check("Sperre: waehrend des Versuchs nicht faellig, danach wieder", waehrend.versucht === 0 && danach.zugestellt === 1);
}
{
  const zeilen = [zeile("x")];
  const erg = await liefereAus(speicher(zeilen), async () => { throw new Error("Adapter kaputt"); }, JETZT);
  check("Lauf: ein Fehler im Adapter beendet den Lauf nicht, der Eintrag wartet", erg.wiederholen === 1 && zeilen[0].status === "pending" && (zeilen[0].fehler ?? "").includes("Adapter kaputt"));
  // Bis zum Aufgeben
  let jetzt = JETZT;
  for (let i = 0; i < MAX_VERSUCHE; i++) {
    jetzt = new Date(jetzt.getTime() + 24 * 3_600_000);
    await liefereAus(speicher(zeilen), async () => bewerteAntwort(500), jetzt);
  }
  check(`Lauf: nach ${MAX_VERSUCHE} Fehlversuchen steht der Eintrag auf failed und wird nicht mehr versucht`, zeilen[0].status === "failed" && zeilen[0].versuche === MAX_VERSUCHE && (await liefereAus(speicher(zeilen), async () => bewerteAntwort(200), new Date(jetzt.getTime() + 24 * 3_600_000))).versucht === 0);
}
{
  const stapel = Array.from({ length: 30 }, (_, i) => zeile(`n${i}`));
  const erg = await liefereAus(speicher(stapel), async () => bewerteAntwort(200), JETZT, 20);
  check("Lauf: hoechstens so viele Eintraege wie das Limit je Lauf", erg.versucht === 20 && stapel.filter((z) => z.status === "sent").length === 20);
}

// --- Zeitbudget (Pruefung PR #156, 15.10.2026) ------------------------------------------------------------------------------------------
{
  const stapel = Array.from({ length: 20 }, (_, i) => zeile(`b${i}`));
  let jetztMs = 0;
  // Jeder Versuch kostet 12 Sekunden Uhrzeit: nach 40 Sekunden beginnt der Lauf keinen neuen Eintrag mehr.
  const sender: Sender = async () => {
    jetztMs += 12_000;
    return bewerteAntwort(200);
  };
  const erg = await liefereAus(speicher(stapel), sender, JETZT, 20, 40_000, () => jetztMs);
  check("Zeitbudget: nach 40 Sekunden beginnt der Lauf keinen neuen Eintrag, die uebrigen bleiben zurueckgestellt", erg.versucht === 4 && erg.zugestellt === 4 && erg.zurueckgestellt === 16, JSON.stringify(erg));
  check("Zeitbudget: zurueckgestellte Eintraege bleiben unberuehrt faellig (kein Versuch gezaehlt, nicht gesperrt)", stapel.filter((z) => z.status === "pending" && z.versuche === 0).length === 16);
  const weiter = await liefereAus(speicher(stapel), async () => bewerteAntwort(200), JETZT, 20);
  check("Zeitbudget: der naechste Lauf liefert den Rest aus", weiter.zugestellt === 16 && stapel.every((z) => z.status === "sent"));
  const unbegrenzt = await liefereAus(speicher([zeile("x1"), zeile("x2")]), async () => bewerteAntwort(200), JETZT);
  check("Zeitbudget: bei wenigen Eintraegen aendert sich nichts (zurueckgestellt 0)", unbegrenzt.zugestellt === 2 && unbegrenzt.zurueckgestellt === 0);
}

// --- 6. Texte -----------------------------------------------------------------------------------------------------------------------------------
{
  const holen = (objekt: unknown, pfad: string): unknown => pfad.split(".").reduce<unknown>((o, teil) => (o as Record<string, unknown> | undefined)?.[teil], objekt);
  const kataloge = ["de", "en", "kk", "ru"].map((sprache) => ({ sprache, katalog: JSON.parse(readFileSync(`src/messages/${sprache}.json`, "utf8")) }));
  const fehlend = (namensraum: string, menge: string[]) => kataloge.flatMap(({ sprache, katalog }) => menge.filter((k) => typeof holen(holen(katalog, namensraum), k) !== "string").map((k) => `${sprache}:${namensraum}.${k}`));
  const fehlerSchluessel = ["integrationAdapter", "integrationUrl", "integrationUrlIntern", "integrationGeheimnis", "integrationUnvollstaendig"];
  check("Texte: die Fehlermeldungen der Konfiguration stehen in vier Sprachen", fehlend("aktionen.fehler", fehlerSchluessel).length === 0, fehlend("aktionen.fehler", fehlerSchluessel).slice(0, 4).join(", "));
}

// --- Ausbau (15.10.2026): Vorlage, Zugang per Basic, Rueckmeldung des Partners ---------------------------------------------------------------------------
{
  const kontext = { umschlag: { id: "u1", idempotenzSchluessel: "esf:1:x" }, daten: { esfNummer: "E-7", entwurf: { kunde: { name: "Handelskette A" }, ware: { mengeKg: 80, positionen: [{ sorte: "Tulameen" }] } }, leer: null } };
  check("Vorlage: ein ganzer Platzhalter behaelt den Typ, ein Platzhalter im Text wird Text", JSON.stringify(wendeVorlageAn({ menge: "{{daten.entwurf.ware.mengeKg}}", text: "Menge {{daten.entwurf.ware.mengeKg}} kg" }, kontext)) === JSON.stringify({ menge: 80, text: "Menge 80 kg" }));
  check("Vorlage: Listen werden durchlaufen, Eintraege einer Liste mit [0] erreicht", JSON.stringify(wendeVorlageAn({ liste: [{ s: "{{daten.entwurf.ware.positionen[0].sorte}}" }] }, kontext)) === JSON.stringify({ liste: [{ s: "Tulameen" }] }));
  check("Vorlage: ein fehlender Wert wird null (ganzer Platzhalter) oder leer (im Text), nie das Wort undefined", JSON.stringify(wendeVorlageAn({ a: "{{daten.gibt.es.nicht}}", b: "x{{daten.gibt}}y", c: "{{daten.leer}}" }, kontext)) === JSON.stringify({ a: null, b: "xy", c: null }));
  check("Vorlage: Zahlen, Wahrheitswerte und feste Texte bleiben, ein Platzhalter im Schluessel wird eingesetzt", JSON.stringify(wendeVorlageAn({ n: 1, w: true, t: "fest", "{{umschlag.id}}": "x" }, kontext)) === JSON.stringify({ n: 1, w: true, t: "fest", u1: "x" }));
  check("Vorlage: nachgeschlagen wird nur, was eigen ist (__proto__, constructor, toString)", schlageNach(kontext, "daten.__proto__") === undefined && schlageNach(kontext, "daten.constructor") === undefined && schlageNach({ daten: {} }, "daten.toString") === undefined);
  check("Vorlage: Umgebungsvariablen und fremde Wurzeln sind nicht erreichbar", schlageNach(kontext, "process.env.CRON_SECRET") === undefined && schlageNach(kontext, "env.X") === undefined && pruefeVorlage('{"a":"{{process.env.CRON_SECRET}}"}').ok === false);
  check("Vorlage: Eingabe leer heisst keine Vorlage", JSON.stringify(pruefeVorlage("  ")) === JSON.stringify({ ok: true, vorlage: null }));
  check("Vorlage: kein JSON, kein Objekt, zu gross und zu tief werden abgelehnt", (pruefeVorlage("{kaputt") as { fehler: string }).fehler === "kein_json" && (pruefeVorlage("[1]") as { fehler: string }).fehler === "kein_objekt" && (pruefeVorlage("3") as { fehler: string }).fehler === "kein_objekt" && (pruefeVorlage(JSON.stringify({ a: "x".repeat(21_000) })) as { fehler: string }).fehler === "zu_gross" && (pruefeVorlage('{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":1}}}}}}}}}') as { fehler: string }).fehler === "zu_tief");
  check("Vorlage: ein unbekannter Pfad und zu viele Platzhalter werden abgelehnt, der Pfad steht im Fehler", (() => { const p = pruefeVorlage('{"a":"{{daten..x}}"}'); return !p.ok && p.fehler === "pfad" && p.detail === "daten..x"; })() && (pruefeVorlage(JSON.stringify({ a: Array.from({ length: 201 }, () => "{{daten.a}}") })) as { fehler: string }).fehler === "zu_viele_platzhalter");
  check("Vorlage: ein einzelnes Klammerzeichen oder unvollstaendiger Platzhalter ist Text und stoert nicht", pruefeVorlage('{"a":"{ x }","b":"{{daten.x"}').ok === true);
  const beispiel = pruefeVorlage(VORLAGE_BEISPIEL_1C);
  const koerper = beispiel.ok ? (baueKoerper(VORSCHAU_UMSCHLAG, beispiel.vorlage) as Record<string, unknown>) : null;
  check("Vorlage: das Beispiel fuer 1C ist gueltig und fuellt sich aus dem Beispiel-Umschlag (Summe als Zahl, Nummer, Kunde, Position)", koerper !== null && koerper["СуммаДокумента"] === 296960 && koerper["НомерЭСФ"] === "ESF-2026-000123" && koerper["ИННКонтрагента"] === "123456789012" && (koerper["Товары"] as { Количество: number }[])[0].Количество === 80, JSON.stringify(koerper).slice(0, 160));
  check("Vorlage: ohne Vorlage geht der Umschlag unveraendert hinaus", baueKoerper(VORSCHAU_UMSCHLAG, null) === VORSCHAU_UMSCHLAG && baueKoerper(VORSCHAU_UMSCHLAG, undefined) === VORSCHAU_UMSCHLAG);

  // Webhook mit Vorlage und mit HTTP Basic gegen den lokalen Server.
  empfangen.length = 0;
  antwortStatus = 200;
  const mitVorlage = await sendeWebhook(
    { ...ziel, authArt: "basic", zugangName: "DAMICON_HOOK_ESF_ZUGANG", vorlage: { id: "{{umschlag.id}}", daten: "{{daten.belegId}}" } },
    umschlag,
    { umgebung: { ...umgebung, DAMICON_HOOK_ESF_ZUGANG: "1c-dienst:geheim:mit:doppelpunkt" }, jetzt: () => 1_760_000_000_000, abruf: lokal, aufloesen: oeffentlich },
  );
  const e = empfangen[0];
  check("Webhook: mit Vorlage geht das Mapping hinaus, nicht der Umschlag", mitVorlage.art === "zugestellt" && JSON.parse(e.koerper).id === umschlag.id && JSON.parse(e.koerper).daten === "b1" && !("idempotenzSchluessel" in JSON.parse(e.koerper)));
  check("Webhook: HTTP Basic traegt Benutzer und Kennwort (das Kennwort darf Doppelpunkte enthalten), die Signatur gilt dem Koerper, der wirklich hinausgeht",
    e.kopf["authorization"] === `Basic ${Buffer.from("1c-dienst:geheim:mit:doppelpunkt").toString("base64")}` && e.kopf["x-damicon-signatur"] === signiere(GEHEIMNIS, 1_760_000_000, e.koerper) && e.kopf["accept"] === "application/json");
  check("Webhook: ohne Basic gibt es keinen Authorization-Kopf", (await sende(), !("authorization" in empfangen.at(-1)!.kopf)));
  const ohneZugang = await sendeWebhook({ ...ziel, authArt: "basic", zugangName: "DAMICON_HOOK_ESF_ZUGANG" }, umschlag, { umgebung, abruf: lokal, aufloesen: oeffentlich });
  const ohneDoppelpunkt = await sendeWebhook({ ...ziel, authArt: "basic", zugangName: "DAMICON_HOOK_ESF_ZUGANG" }, umschlag, { umgebung: { ...umgebung, DAMICON_HOOK_ESF_ZUGANG: "nurbenutzer" }, abruf: lokal, aufloesen: oeffentlich });
  check("Webhook: fehlt der Zugang oder hat er nicht die Form Benutzer:Kennwort, wartet der Eintrag", ohneZugang.art === "wiederholen" && ohneZugang.grund.includes("DAMICON_HOOK_ESF_ZUGANG") && ohneDoppelpunkt.art === "wiederholen");
  const vorlageMitGeheimnis = await sendeWebhook({ ...ziel, vorlage: { x: "{{process.env.DAMICON_HOOK_ESF}}" } }, umschlag, { umgebung, jetzt: () => 1_760_000_000_000, abruf: lokal, aufloesen: oeffentlich });
  check("Webhook: eine Vorlage kann die Umgebung nicht lesen (das Geheimnis geht nicht hinaus)", vorlageMitGeheimnis.art === "zugestellt" && !empfangen.at(-1)!.koerper.includes(GEHEIMNIS) && JSON.parse(empfangen.at(-1)!.koerper).x === null);

  // Rueckmeldung des Partners: Signatur und Zeitstempel.
  const jetzt = 1_760_000_000;
  const rueck = JSON.stringify({ idempotenzSchluessel: "esf:b1:ausgestellt", ok: true });
  check("Rueckmeldung: eine richtig signierte Nachricht mit frischem Zeitstempel ist in Ordnung", pruefeSignatur(GEHEIMNIS, String(jetzt - 10), signiere(GEHEIMNIS, jetzt - 10, rueck), rueck, jetzt) === "ok");
  check("Rueckmeldung: ein veraenderter Koerper, ein falsches Geheimnis oder eine fehlende Signatur werden abgewiesen", pruefeSignatur(GEHEIMNIS, String(jetzt), signiere(GEHEIMNIS, jetzt, rueck), rueck.replace("true", "false"), jetzt) === "signatur" && pruefeSignatur("anderes", String(jetzt), signiere(GEHEIMNIS, jetzt, rueck), rueck, jetzt) === "signatur" && pruefeSignatur(GEHEIMNIS, String(jetzt), null, rueck, jetzt) === "signatur" && pruefeSignatur(GEHEIMNIS, String(jetzt), "sha256=00", rueck, jetzt) === "signatur");
  check("Rueckmeldung: ein zu alter oder zu junger Zeitstempel wird abgewiesen (Wiederholung einer abgefangenen Nachricht)", pruefeSignatur(GEHEIMNIS, String(jetzt - SIGNATUR_TOLERANZ_SEKUNDEN - 1), signiere(GEHEIMNIS, jetzt - SIGNATUR_TOLERANZ_SEKUNDEN - 1, rueck), rueck, jetzt) === "zeit" && pruefeSignatur(GEHEIMNIS, String(jetzt + SIGNATUR_TOLERANZ_SEKUNDEN + 1), signiere(GEHEIMNIS, jetzt + SIGNATUR_TOLERANZ_SEKUNDEN + 1, rueck), rueck, jetzt) === "zeit" && pruefeSignatur(GEHEIMNIS, SIGNATUR_TOLERANZ_SEKUNDEN > 0 ? "abc" : null, "x", rueck, jetzt) === "zeit" && pruefeSignatur(GEHEIMNIS, null, "x", rueck, jetzt) === "zeit");
  check("Rueckmeldung: die Toleranz selbst ist noch in Ordnung", pruefeSignatur(GEHEIMNIS, String(jetzt - SIGNATUR_TOLERANZ_SEKUNDEN), signiere(GEHEIMNIS, jetzt - SIGNATUR_TOLERANZ_SEKUNDEN, rueck), rueck, jetzt) === "ok");

  // Konfiguration: Authentifizierung und Zugang.
  const ok = { adapter: "webhook", zielUrl: "https://hooks.example.kz/x", geheimnisName: "DAMICON_HOOK_ESF", aktiv: true };
  check("Konfiguration: Basic aktiv braucht den Namen des Zugangs, hmac nicht", konfigurationFehler({ ...ok, authArt: "basic", zugangName: "" }) === "integrationZugang" && konfigurationFehler({ ...ok, authArt: "basic", zugangName: "DAMICON_HOOK_ESF_ZUGANG" }) === null && konfigurationFehler({ ...ok, authArt: "hmac" }) === null && konfigurationFehler(ok) === null);
  check("Konfiguration: eine unbekannte Authentifizierung und ein Zugangsname ausserhalb des Praefixes werden abgelehnt", konfigurationFehler({ ...ok, authArt: "bearer" }) === "integrationAuth" && konfigurationFehler({ ...ok, authArt: "basic", zugangName: "CRON_SECRET" }) === "integrationZugang" && konfigurationFehler({ ...ok, geheimnisName: "CRON_SECRET" }) === "integrationGeheimnis");
  check("Konfiguration: inaktiv und manuell ohne Zugang ist in Ordnung", konfigurationFehler({ adapter: "manuell", zielUrl: "", geheimnisName: "", aktiv: false, authArt: "hmac" }) === null);
}

server.close();

if (fehler > 0) {
  console.log(`\n${fehler} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("\nAlle Tests der Auslieferung gruen.");
