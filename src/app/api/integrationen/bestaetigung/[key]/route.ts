import { createServiceRoleClient } from "@/lib/supabase/server";
import { pruefeSignatur } from "@/lib/integration/webhook-adapter";

// Rückmeldung des Partners (WMCNL-1627, 15.10.2026): POST /api/integrationen/bestaetigung/<integration>.
//
// Der Partner meldet, dass er einen ausgelieferten Eintrag verarbeitet hat (oder abgelehnt). Der Körper ist JSON:
//   { "idempotenzSchluessel": "<Schlüssel des Umschlags>", "ok": true | false, "hinweis": "<Text bei Ablehnung, optional>" }
// und trägt dieselbe Signatur wie der ausgehende Webhook: X-Damicon-Zeitstempel (Unix-Sekunden) und X-Damicon-Signatur (sha256=<hex> über
// "<Zeitstempel>.<Körper>", mit dem Geheimnis der Integration). Der Zeitstempel darf höchstens fünf Minuten abweichen.
//
// Ohne Anmeldung erreichbar, aber nicht offen: Ohne gültige Signatur antwortet die Route mit 401, und zwar gleich, ob die Integration unbekannt, aus
// oder ohne Geheimnis ist (kein Hinweis, welche Schlüssel es gibt). Der Dienstschlüssel schreibt nur über integration_bestaetigen().

export const maxDuration = 15;

const KOPF = { "Cache-Control": "no-store" } as const;
const antwort = (inhalt: Record<string, unknown>, status: number) => Response.json(inhalt, { status, headers: KOPF });

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const koerper = await request.text();
  if (koerper.length > 10_000) return antwort({ fehler: "zu gross" }, 413);

  const supabase = createServiceRoleClient();
  const { data: integration, error } = await supabase.from("integrationen").select("geheimnis_name, aktiv").eq("key", key).maybeSingle();
  if (error) {
    console.error("[damicon] Rueckmeldung: Integration lesen fehlgeschlagen:", error.message);
    return antwort({ fehler: "nicht verfuegbar" }, 503);
  }
  const geheimnis = integration?.aktiv && integration.geheimnis_name ? process.env[integration.geheimnis_name] : undefined;
  const signatur = geheimnis
    ? pruefeSignatur(geheimnis, request.headers.get("x-damicon-zeitstempel"), request.headers.get("x-damicon-signatur"), koerper, Math.floor(Date.now() / 1000))
    : "signatur";
  if (signatur !== "ok") return antwort({ fehler: "nicht berechtigt" }, 401);

  let eingabe: { idempotenzSchluessel?: unknown; ok?: unknown; hinweis?: unknown };
  try {
    eingabe = JSON.parse(koerper);
  } catch {
    return antwort({ fehler: "kein JSON" }, 400);
  }
  // Gueltiges JSON, aber kein Objekt (null, eine Zahl, eine Liste): keine Pflichtangaben.
  if (typeof eingabe !== "object" || eingabe === null || Array.isArray(eingabe)) return antwort({ fehler: "idempotenzSchluessel (Text) und ok (wahr oder falsch) fehlen" }, 400);
  if (typeof eingabe.idempotenzSchluessel !== "string" || eingabe.idempotenzSchluessel === "" || eingabe.idempotenzSchluessel.length > 200 || typeof eingabe.ok !== "boolean") {
    return antwort({ fehler: "idempotenzSchluessel (Text) und ok (wahr oder falsch) fehlen" }, 400);
  }
  const hinweis = typeof eingabe.hinweis === "string" ? eingabe.hinweis.slice(0, 300) : null;

  const { data: ergebnis, error: rpcFehler } = await supabase.rpc("integration_bestaetigen", {
    p_key: key,
    p_idempotenz: eingabe.idempotenzSchluessel,
    p_ok: eingabe.ok,
    p_hinweis: hinweis,
  });
  if (rpcFehler) {
    console.error("[damicon] Rueckmeldung speichern fehlgeschlagen:", rpcFehler.message);
    return antwort({ fehler: "nicht gespeichert" }, 500);
  }
  if (ergebnis === "unbekannt") return antwort({ fehler: "unbekannter Eintrag" }, 404);
  if (ergebnis === "noch_nicht") return antwort({ fehler: "der Eintrag ist noch nicht gesendet" }, 409);
  return antwort({ ergebnis }, 200);
}
