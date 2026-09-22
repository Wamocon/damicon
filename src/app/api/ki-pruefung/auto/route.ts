// Automatischer CEO-Compliance-Lauf, live gestreamt (eine JSON-Zeile je Ereignis,
// application/x-ndjson - derselbe Ereignis-Strom und dieselbe Ablauf-Ansicht wie die
// manuelle Pruefung unter /api/ki-pruefung). Der Client (components/dashboard/
// ceo-auto-pruefung.tsx) haelt die Verbindung, solange er den Fortschritt zeigen will,
// genau wie beim manuellen Lauf - bewusst kein after()/Hintergrundlauf mehr: wer den
// Fortschritt sehen soll, muss ihn auch live zugestellt bekommen.
//
// Die eigentliche Arbeit - erst die guenstige Aenderungspruefung, nur bei Bedarf der
// volle, mehrere Modellaufrufe teure Lauf - steckt in lib/pruefung/ceo-auto.ts und ist
// mit der manuellen Server Action (actions/compliance-ceo.ts) geteilt.

import { getSessionProfile } from "@/lib/auth";
import { aktualisiereCeoBericht } from "@/lib/pruefung/ceo-auto";
import type { Ereignis } from "@/lib/pruefung/typen";

export const maxDuration = 300;

export async function POST(req: Request) {
  const profil = await getSessionProfile();
  if (!profil) return new Response("nicht angemeldet", { status: 401 });
  if (profil.role !== "ceo") return new Response("keine berechtigung", { status: 403 });

  let body: { sprache?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const sprache = typeof body.sprache === "string" ? body.sprache : "de";

  const encoder = new TextEncoder();
  const strom = new ReadableStream<Uint8Array>({
    async start(controller) {
      const senden = (e: Ereignis) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          /* Client ist weg */
        }
      };
      try {
        const ergebnis = await aktualisiereCeoBericht({ profil, erzwungen: false, sprache, emit: senden });
        if (ergebnis.status === "erzeugt") {
          senden({ t: "bericht", bericht: ergebnis.bericht, protokolliert: true, aenderungen: ergebnis.aenderungen });
        } else if (ergebnis.status === "uebersprungen" && ergebnis.bericht) {
          // Nichts hat sich geaendert: derselbe Bericht wie zuletzt gilt weiterhin, leere Aenderungsliste.
          senden({ t: "bericht", bericht: ergebnis.bericht, protokolliert: true, aenderungen: [] });
        } else {
          senden({ t: "fehler", text: "Die Pruefung konnte nicht abgeschlossen werden." });
        }
      } catch (e) {
        console.error("[damicon] CEO-Auto-Pruefung (Strom) fehlgeschlagen:", e);
        senden({ t: "fehler", text: "Die Pruefung konnte nicht abgeschlossen werden." });
      } finally {
        try {
          controller.close();
        } catch {
          /* schon geschlossen */
        }
      }
    },
  });

  return new Response(strom, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" },
  });
}
