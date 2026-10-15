import { ersetzeModule } from "./hilfen/modul-ersatz";
import { pruefer } from "./hilfen/ansicht-probe";
import { signiere } from "@/lib/integration/webhook-adapter";

// Die Rückmeldung des Partners POST /api/integrationen/bestaetigung/<integration> (src/app/api/integrationen/bestaetigung/[key]/route.ts, 15.10.2026).
//
// Die Route wird mit echten Request-Objekten aufgerufen. Ersetzt ist nur der Dienstschlüssel-Client (lib/supabase/server): ein Zwischenspeicher für die Zeile der
// Integration und die Antwort der Funktion integration_bestaetigen(). Die Signaturprüfung ist echt. Festgehalten wird jede Verzweigung: zu großer Körper,
// Integration unbekannt, aus oder ohne Geheimnis (immer 401, ohne Hinweis), falsche oder fehlende Signatur, zu alter Zeitstempel, kaputtes JSON, fehlende
// Pflichtangaben, die vier Ergebnisse der Funktion (bestätigt, schon, abgelehnt, noch nicht, unbekannt), ein Fehler der Funktion und der Lesefehler.
// Aufruf: npm run test:bestaetigung-route

const { pruefe, ende } = pruefer();
const json = (wert: unknown) => JSON.stringify(wert);

let integration: { geheimnis_name: string | null; aktiv: boolean } | null = { geheimnis_name: "DAMICON_HOOK_ESF", aktiv: true };
let leseFehler: { message: string } | null = null;
let rpcErgebnis: { data: string | null; error: { message: string } | null } = { data: "bestaetigt", error: null };
let rpcAufrufe: { name: string; args: Record<string, unknown> }[] = [];
let gelesenVon: string[] = [];

ersetzeModule({
  "@/lib/supabase/server": {
    createServiceRoleClient: () => ({
      from: (tabelle: string) => ({
        select: () => ({
          eq: (_spalte: string, wert: string) => ({
            maybeSingle: async () => {
              gelesenVon.push(`${tabelle}:${wert}`);
              return { data: integration, error: leseFehler };
            },
          }),
        }),
      }),
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcAufrufe.push({ name, args });
        return rpcErgebnis;
      },
    }),
  },
});

const GEHEIMNIS = "ein-langes-geheimnis";
process.env.DAMICON_HOOK_ESF = GEHEIMNIS;

const KOERPER = json({ idempotenzSchluessel: "esf:b1:ausgestellt:1", ok: true });
const jetzt = () => Math.floor(Date.now() / 1000);
function anfrage(koerper: string, opts: { zeit?: number; signatur?: string | null; mitKopf?: boolean; geheimnis?: string } = {}): Request {
  const zeit = opts.zeit ?? jetzt();
  const kopf: Record<string, string> = { "content-type": "application/json" };
  if (opts.mitKopf !== false) {
    kopf["x-damicon-zeitstempel"] = String(zeit);
    if (opts.signatur !== null) kopf["x-damicon-signatur"] = opts.signatur ?? signiere(opts.geheimnis ?? GEHEIMNIS, zeit, koerper);
  }
  return new Request("http://localhost/api/integrationen/bestaetigung/esf", { method: "POST", headers: kopf, body: koerper });
}

type Post = (req: Request, ctx: { params: Promise<{ key: string }> }) => Promise<Response>;

async function main() {
  const { POST } = (await import("../../src/app/api/integrationen/bestaetigung/[key]/route")) as { POST: Post };
  const rufe = async (req: Request, key = "esf") => {
    rpcAufrufe = [];
    gelesenVon = [];
    const res = await POST(req, { params: Promise.resolve({ key }) });
    return { status: res.status, koerper: (await res.json()) as Record<string, unknown>, cache: res.headers.get("cache-control"), rpc: rpcAufrufe };
  };

  // 1. Der Normalfall
  let a = await rufe(anfrage(KOERPER));
  pruefe(
    "Gültig: 200 mit dem Ergebnis, die Funktion bekommt Integration, Schlüssel und ok",
    a.status === 200 && a.koerper.ergebnis === "bestaetigt" && a.rpc.length === 1 && a.rpc[0].name === "integration_bestaetigen" && json(a.rpc[0].args) === json({ p_key: "esf", p_idempotenz: "esf:b1:ausgestellt:1", p_ok: true, p_hinweis: null }),
    json(a),
  );
  pruefe("Gültig: die Antwort wird nicht zwischengespeichert", a.cache === "no-store");

  // 2. Signatur und Zeit: immer 401, der Dienstschlüssel schreibt nichts
  for (const [name, req] of [
    ["falsche Signatur", anfrage(KOERPER, { signatur: "sha256=" + "0".repeat(64) })],
    ["Signatur mit anderem Geheimnis", anfrage(KOERPER, { geheimnis: "anderes" })],
    ["ohne Signatur", anfrage(KOERPER, { signatur: null })],
    ["ohne beide Köpfe", anfrage(KOERPER, { mitKopf: false })],
    ["Zeitstempel zu alt", anfrage(KOERPER, { zeit: jetzt() - 3600 })],
    ["Zeitstempel in der Zukunft", anfrage(KOERPER, { zeit: jetzt() + 3600 })],
    ["Körper verändert", anfrage(KOERPER.replace("true", "false"), { signatur: signiere(GEHEIMNIS, jetzt(), KOERPER) })],
  ] as [string, Request][]) {
    a = await rufe(req);
    pruefe(`401 bei ${name}, keine Schreibfunktion`, a.status === 401 && a.koerper.fehler === "nicht berechtigt" && a.rpc.length === 0, json(a));
  }

  // 3. Integration: unbekannt, aus, ohne Geheimnis, Geheimnis nicht gesetzt: dieselbe Antwort, kein Hinweis
  const faelle: [string, { geheimnis_name: string | null; aktiv: boolean } | null][] = [
    ["unbekannte Integration", null],
    ["inaktive Integration", { geheimnis_name: "DAMICON_HOOK_ESF", aktiv: false }],
    ["Integration ohne Geheimnisnamen", { geheimnis_name: null, aktiv: true }],
    ["Geheimnis in der Umgebung nicht gesetzt", { geheimnis_name: "DAMICON_HOOK_NICHT_DA", aktiv: true }],
  ];
  for (const [name, zeile] of faelle) {
    integration = zeile;
    a = await rufe(anfrage(KOERPER));
    pruefe(`${name}: 401 wie bei einer falschen Signatur (kein Hinweis, welche Schlüssel es gibt)`, a.status === 401 && a.koerper.fehler === "nicht berechtigt" && a.rpc.length === 0, json(a));
  }
  integration = { geheimnis_name: "DAMICON_HOOK_ESF", aktiv: true };
  leseFehler = { message: "kaputt" };
  a = await rufe(anfrage(KOERPER));
  pruefe("Lesefehler der Integration: 503, nichts geschrieben", a.status === 503 && a.rpc.length === 0, json(a));
  leseFehler = null;

  // 4. Körper
  const gross = json({ idempotenzSchluessel: "x", ok: true, hinweis: "y".repeat(11_000) });
  a = await rufe(anfrage(gross));
  pruefe("Körper über 10000 Zeichen: 413 vor jeder Prüfung", a.status === 413 && gelesenVon.length === 0, json(a));
  const kaputt = "{kaputt";
  a = await rufe(anfrage(kaputt));
  pruefe("Kein JSON (aber richtig signiert): 400", a.status === 400 && a.koerper.fehler === "kein JSON" && a.rpc.length === 0, json(a));
  for (const [name, inhalt] of [
    ["ohne Schlüssel", { ok: true }],
    ["leerer Schlüssel", { idempotenzSchluessel: "", ok: true }],
    ["Schlüssel keine Zeichenkette", { idempotenzSchluessel: 5, ok: true }],
    ["Schlüssel zu lang", { idempotenzSchluessel: "x".repeat(201), ok: true }],
    ["ok fehlt", { idempotenzSchluessel: "k" }],
    ["ok keine Wahrheitswert", { idempotenzSchluessel: "k", ok: "ja" }],
  ] as [string, unknown][]) {
    a = await rufe(anfrage(json(inhalt)));
    pruefe(`Pflichtangaben: ${name} ergibt 400`, a.status === 400 && a.rpc.length === 0, json(a));
  }
  a = await rufe(anfrage("null"));
  pruefe("Körper null (gültiges JSON): 400 statt Ausnahme", a.status === 400 && a.rpc.length === 0, json(a));

  // 5. Ergebnisse der Funktion
  for (const [roh, status, erwartetes] of [
    ["bestaetigt", 200, "bestaetigt"],
    ["schon", 200, "schon"],
    ["abgelehnt", 200, "abgelehnt"],
  ] as [string, number, string][]) {
    rpcErgebnis = { data: roh, error: null };
    a = await rufe(anfrage(json({ idempotenzSchluessel: "k", ok: roh !== "abgelehnt", hinweis: "z".repeat(400) })));
    pruefe(`Funktion meldet ${roh}: ${status}, Hinweis auf 300 Zeichen gekürzt weitergegeben`, a.status === status && a.koerper.ergebnis === erwartetes && String(a.rpc[0].args.p_hinweis).length === 300, json(a));
  }
  rpcErgebnis = { data: "noch_nicht", error: null };
  a = await rufe(anfrage(KOERPER));
  pruefe("Funktion meldet noch_nicht: 409", a.status === 409, json(a));
  rpcErgebnis = { data: "unbekannt", error: null };
  a = await rufe(anfrage(KOERPER));
  pruefe("Funktion meldet unbekannt: 404", a.status === 404, json(a));
  rpcErgebnis = { data: null, error: { message: "boom" } };
  a = await rufe(anfrage(KOERPER));
  pruefe("Fehler der Funktion: 500 ohne Einzelheiten nach außen", a.status === 500 && a.koerper.fehler === "nicht gespeichert" && !json(a.koerper).includes("boom"), json(a));
  rpcErgebnis = { data: "bestaetigt", error: null };

  // 6. Der Schlüssel der Integration kommt aus dem Pfad, nicht aus dem Körper
  a = await rufe(anfrage(KOERPER), "andere-integration");
  pruefe("Der Schlüssel der Integration kommt aus dem Pfad: gelesen und bestätigt wird genau diese", a.status === 200 && gelesenVon.join() === "integrationen:andere-integration" && a.rpc[0].args.p_key === "andere-integration", json(a));

  ende();
}

main().catch((e) => {
  console.log("FAIL  Ausnahme", e instanceof Error ? e.stack : e);
  process.exit(1);
});
