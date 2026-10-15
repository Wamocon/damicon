import { timingSafeEqual } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Erzeugung der Benachrichtigungen durch den Cron-Dienst (WMCNL-2486): GET /api/benachrichtigungen/erzeugen.
//
// Wie die Auslieferung der Integrationen (api/integrationen/ausliefern): ohne Anmeldung erreichbar, aber nicht offen. Der Aufruf braucht das Geheimnis CRON_SECRET
// als "Authorization: Bearer ...", ohne gesetzte Umgebungsvariable antwortet die Route mit 503. Der Lauf ruft die Funktion benachrichtigungen_erzeugen() mit dem
// Dienstschluessel auf; sie ist idempotent (derselbe Zustand meldet sich nur einmal), also schadet ein doppelter Aufruf nicht. Wie oft der Dienst die Adresse
// aufruft, stellt der Betreiber ein (Workflow benachrichtigungen-erzeugen.yml).

export const maxDuration = 30;

export async function GET(request: Request) {
  const erwartet = process.env.CRON_SECRET;
  if (!erwartet) return Response.json({ fehler: "nicht eingerichtet" }, { status: 503, headers: { "Cache-Control": "no-store" } });

  const roh = request.headers.get("authorization") ?? "";
  const erhalten = Buffer.from(roh.startsWith("Bearer ") ? roh.slice(7) : "");
  const soll = Buffer.from(erwartet);
  // Zeitkonstant vergleichen; bei ungleicher Laenge gleich ablehnen (timingSafeEqual wirft dann).
  if (erhalten.length !== soll.length || !timingSafeEqual(erhalten, soll)) {
    return Response.json({ fehler: "nicht berechtigt" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { data, error } = await createServiceRoleClient().rpc("benachrichtigungen_erzeugen");
    if (error) throw new Error(error.message);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[damicon] Benachrichtigungen erzeugen (Cron) fehlgeschlagen:", error instanceof Error ? error.message : error);
    return Response.json({ fehler: "Erzeugung fehlgeschlagen" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
