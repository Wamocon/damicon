import { timingSafeEqual } from "node:crypto";
import { liefereFaelligeAus } from "@/lib/integration/speicher";

// Auslieferung der Integrations-Warteschlange durch den Cron-Dienst (WMCNL-1627): GET /api/integrationen/ausliefern.
//
// Ohne Anmeldung erreichbar, aber nicht offen: der Aufruf braucht das Geheimnis CRON_SECRET als "Authorization: Bearer ...". Ist die
// Umgebungsvariable nicht gesetzt, antwortet die Route mit 503, statt jeden durchzulassen. Vercel Cron schickt den Kopf selbst mit, wenn
// CRON_SECRET gesetzt ist. Der Lauf nutzt den Dienstschluessel des Servers und liefert hoechstens 20 Eintraege je Aufruf aus.
// Ob und wie oft der Dienst die Adresse aufruft, stellt der Betreiber ein; ohne Aufruf gibt es den Knopf der Administration.

// Der Lauf beginnt keinen neuen Eintrag mehr nach 40 Sekunden (LAUF_BUDGET_MS); die Route darf ihn bis zum Ende des letzten Versuchs fortsetzen.
export const maxDuration = 60;

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
    return Response.json(await liefereFaelligeAus(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[damicon] Auslieferung (Cron) fehlgeschlagen:", error instanceof Error ? error.message : error);
    return Response.json({ fehler: "Auslieferung fehlgeschlagen" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
