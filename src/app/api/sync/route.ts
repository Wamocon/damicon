import { NextResponse } from "next/server";
import { requireAal2Aktuell } from "@/lib/auth";
import {
  arbeitszeitKern,
  kuehlmessungKern,
  type KernErgebnis,
} from "@/lib/actions/nachweiskette";

// Anforderung 2.5: fester HTTP-Endpunkt fuer die Offline-Warteschlange
// (src/lib/offline/sync-engine.ts). Ruft dieselben Kernfunktionen auf wie
// die zugehoerigen Formulare (Server Actions) - identische
// Berechtigungspruefung, kein Sicherheits-Downgrade durch eine Hintertuer.
// Server-Action-Referenzen selbst sind dafuer ungeeignet: sie sind nicht
// stabil ueber Deployments hinweg, ein Warteschlangen-Eintrag von vor Stunden
// oder Tagen koennte nach einem zwischenzeitlichen Deployment ins Leere
// laufen. Ein regulaerer, versionsloser HTTP-Pfad hat dieses Problem nicht.
//
// src/proxy.ts schuetzt den gesamten /dashboard-Baum inklusive
// AAL2-Weiterleitung, aber sein config.matcher schliesst /api ausdruecklich
// aus - die AAL2-Pruefung wird deshalb hier eigens nachgebaut
// (requireAal2Aktuell()) statt sich auf die Middleware zu verlassen.

interface SyncAnfrage {
  aktionId: string;
  aktionTyp: string;
  geraetZeitpunkt: string | null;
  nutzlast: Record<string, unknown>;
}

interface SyncAntwort {
  ergebnis: "angewendet" | "konflikt" | "fehler";
  meldung: string;
  wert?: string;
}

function antwortText(nutzlast: Record<string, unknown>, feld: string): string {
  const wert = nutzlast[feld];
  return typeof wert === "string" ? wert.trim() : "";
}

function antwortZahl(nutzlast: Record<string, unknown>, feld: string): number | null {
  const wert = nutzlast[feld];
  if (typeof wert === "number") return Number.isFinite(wert) ? wert : null;
  if (typeof wert !== "string") return null;
  const roh = wert.trim().replace(",", ".");
  if (!roh) return null;
  const zahl = Number(roh);
  return Number.isFinite(zahl) ? zahl : null;
}

function json(antwort: SyncAntwort, status: number) {
  return NextResponse.json(antwort, { status });
}

export async function POST(request: Request) {
  try {
    await requireAal2Aktuell();
  } catch {
    // Kein Redirect wie in proxy.ts moeglich/sinnvoll fuer einen
    // JSON-Endpunkt - stattdessen 403, die Warteschlange bleibt bestehen und
    // der naechste Sync-Versuch (nach abgeschlossener MFA-Bestaetigung im
    // normalen Dashboard) greift erneut.
    return json({ ergebnis: "fehler", meldung: "fehler.angemeldet" }, 403);
  }

  let anfrage: SyncAnfrage;
  try {
    anfrage = await request.json();
  } catch {
    return json({ ergebnis: "fehler", meldung: "fehler.eingabe" }, 400);
  }

  const { aktionId, aktionTyp, geraetZeitpunkt, nutzlast } = anfrage;
  if (!aktionId || !aktionTyp || typeof nutzlast !== "object" || nutzlast === null) {
    return json({ ergebnis: "fehler", meldung: "fehler.eingabe" }, 400);
  }

  let kernErgebnis: KernErgebnis<unknown>;

  switch (aktionTyp) {
    case "kuehlmessung_erfassen":
      kernErgebnis = await kuehlmessungKern({
        aufgabeId: antwortText(nutzlast, "aufgabe_id"),
        temperaturC: antwortZahl(nutzlast, "temperatur_c"),
        geraetZeitpunkt: geraetZeitpunkt || null,
        aktionId,
      });
      break;
    case "arbeitszeit_erfassen":
      kernErgebnis = await arbeitszeitKern({
        aufgabeId: antwortText(nutzlast, "aufgabe_id"),
        pflueckerId: antwortText(nutzlast, "pfluecker_id"),
        minuten: antwortZahl(nutzlast, "minuten"),
        geraetZeitpunkt: geraetZeitpunkt || null,
        aktionId,
      });
      break;
    default:
      // Weitere Aktionstypen (Steige, die drei Update-Workflows, Fotobeleg)
      // kommen mit den jeweiligen Phasen 4-6 hinzu.
      return json({ ergebnis: "fehler", meldung: "fehler.eingabe" }, 400);
  }

  // `erledigt`, nicht `status.stand`, entscheidet ueber "angewendet": eine
  // Kuehlmessung mit Kuehlketten-Verstoss wurde erfolgreich geschrieben
  // (status.stand ist trotzdem "fehler", weil das ein fachlicher Alarm fuer
  // die Oberflaeche ist, kein technischer Fehlschlag) - siehe Kommentar in
  // src/lib/actions/nachweiskette.ts bei KernErgebnis.
  const ergebnis: SyncAntwort["ergebnis"] = kernErgebnis.erledigt ? "angewendet" : "fehler";

  return json(
    {
      ergebnis,
      meldung: kernErgebnis.status.meldung ?? "fehler.unbekannt",
      wert: kernErgebnis.status.wert,
    },
    200,
  );
}
