import { NextResponse } from "next/server";
import { requireAal2Aktuell } from "@/lib/auth";
import {
  arbeitszeitKern,
  kuehlmessungKern,
  steigeKern,
  type KernErgebnis,
} from "@/lib/actions/nachweiskette";
import { aufgabeStatusKern, belegKern, mengeMeldenKern } from "@/lib/actions/pflueckaufgaben";

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

/** Ein Warteschlangen-Eintrag, aus JSON oder multipart/form-data auf dieselbe Form gebracht. */
interface SyncEintrag extends SyncAnfrage {
  datei: File | null;
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

const eingabeFehler = () => json({ ergebnis: "fehler", meldung: "fehler.eingabe" }, 400);

// Fotobeleg (Phase 6) traegt eine Bilddatei mit - JSON kann das nicht ohne
// Base64-Aufblaehung (~33% groesser, relevant bei Vercels
// Route-Handler-Payloadgrenze). sync-engine.ts sendet einen Eintrag mit
// Datei deshalb als multipart/form-data, alle anderen Aktionstypen weiterhin
// als JSON - hier entsprechend verzweigt, auf dieselbe interne Form gebracht.
// null heisst: der Koerper laesst sich nicht lesen (400).
async function leseEintrag(request: Request): Promise<SyncEintrag | null> {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("multipart/form-data") ? leseFormular(request) : leseJson(request);
}

async function leseFormular(request: Request): Promise<SyncEintrag | null> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return null;
  }
  const nutzlastRoh = form.get("nutzlast");
  let nutzlast: Record<string, unknown>;
  try {
    nutzlast = typeof nutzlastRoh === "string" ? JSON.parse(nutzlastRoh) : {};
  } catch {
    return null;
  }
  const dateiRoh = form.get("datei");
  return {
    aktionId: String(form.get("aktionId") ?? ""),
    aktionTyp: String(form.get("aktionTyp") ?? ""),
    geraetZeitpunkt: (form.get("geraetZeitpunkt") as string | null) || null,
    nutzlast,
    datei: dateiRoh instanceof File ? dateiRoh : null,
  };
}

async function leseJson(request: Request): Promise<SyncEintrag | null> {
  let anfrage: SyncAnfrage;
  try {
    anfrage = await request.json();
  } catch {
    return null;
  }
  // Bewusst ausserhalb des try: ein Koerper "null" wirft hier wie bisher (kein 400).
  return {
    aktionId: anfrage.aktionId,
    aktionTyp: anfrage.aktionTyp,
    geraetZeitpunkt: anfrage.geraetZeitpunkt,
    nutzlast: anfrage.nutzlast,
    datei: null,
  };
}

/** Je Aktionstyp der Aufruf der Kernfunktion mit der umgesetzten Nutzlast. Eine Map, damit nur
 *  eigene Eintraege zaehlen (ein Typ wie "constructor" ist unbekannt, wie zuvor im switch). */
type KernAufruf = (e: SyncEintrag) => Promise<KernErgebnis<unknown>> | Response;
const KERN_AUFRUFE = new Map<string, KernAufruf>([
  [
    "kuehlmessung_erfassen",
    (e) =>
      kuehlmessungKern({
        aufgabeId: antwortText(e.nutzlast, "aufgabe_id"),
        temperaturC: antwortZahl(e.nutzlast, "temperatur_c"),
        geraetZeitpunkt: e.geraetZeitpunkt || null,
        aktionId: e.aktionId,
      }),
  ],
  [
    "steige_erfassen",
    (e) =>
      steigeKern({
        aufgabeId: antwortText(e.nutzlast, "aufgabe_id"),
        pflueckerId: antwortText(e.nutzlast, "pfluecker_id"),
        gewichtKg: antwortZahl(e.nutzlast, "gewicht_kg"),
        geraetZeitpunkt: e.geraetZeitpunkt || null,
        aktionId: e.aktionId,
      }),
  ],
  [
    "arbeitszeit_erfassen",
    (e) =>
      arbeitszeitKern({
        aufgabeId: antwortText(e.nutzlast, "aufgabe_id"),
        pflueckerId: antwortText(e.nutzlast, "pfluecker_id"),
        minuten: antwortZahl(e.nutzlast, "minuten"),
        geraetZeitpunkt: e.geraetZeitpunkt || null,
        aktionId: e.aktionId,
      }),
  ],
  [
    "aufgabe_annehmen",
    (e) =>
      aufgabeStatusKern({
        aufgabeId: antwortText(e.nutzlast, "id"),
        neuerStatus: "angenommen",
        arbeitsbeginnGeraetZeitpunkt: null,
        aktionId: e.aktionId,
      }),
  ],
  [
    "aufgabe_arbeit_starten",
    (e) =>
      aufgabeStatusKern({
        aufgabeId: antwortText(e.nutzlast, "id"),
        neuerStatus: "in_arbeit",
        arbeitsbeginnGeraetZeitpunkt: e.geraetZeitpunkt || null,
        aktionId: e.aktionId,
      }),
  ],
  [
    "menge_melden",
    (e) =>
      mengeMeldenKern({
        aufgabeId: antwortText(e.nutzlast, "id"),
        istMengeKg: antwortZahl(e.nutzlast, "ist_menge_kg"),
        ausschussKg: antwortZahl(e.nutzlast, "ausschuss_kg"),
        pflueckerAnzahl: antwortZahl(e.nutzlast, "pfluecker_anzahl"),
        aktionId: e.aktionId,
      }),
  ],
  [
    "beleg_hochladen",
    (e) =>
      e.datei
        ? belegKern({
            aufgabeId: antwortText(e.nutzlast, "aufgabe_id"),
            art: antwortText(e.nutzlast, "art"),
            hinweis: antwortText(e.nutzlast, "hinweis") || null,
            geraetZeitpunkt: e.geraetZeitpunkt || null,
            datei: e.datei,
            aktionId: e.aktionId,
          })
        : json({ ergebnis: "fehler", meldung: "fehler.keineDatei" }, 400),
  ],
]);

// `erledigt`, nicht `status.stand`, entscheidet ueber "angewendet": eine
// Kuehlmessung mit Kuehlketten-Verstoss wurde erfolgreich geschrieben
// (status.stand ist trotzdem "fehler", weil das ein fachlicher Alarm fuer
// die Oberflaeche ist, kein technischer Fehlschlag) - siehe Kommentar in
// src/lib/actions/nachweiskette.ts bei KernErgebnis.
//
// Bei den drei UPDATE-Workflows (Phase 4) signalisiert die Meldung
// "fehler.zustand" gezielt einen echten Konflikt (CAS-Guard fehlgeschlagen,
// sync_protokoll bestaetigt: kein eigener Retry) - der Client soll diesen
// Eintrag NICHT automatisch erneut senden, sondern als Konflikt anzeigen.
function syncAntwort(kernErgebnis: KernErgebnis<unknown>) {
  const ergebnis: SyncAntwort["ergebnis"] = kernErgebnis.erledigt
    ? "angewendet"
    : kernErgebnis.status.meldung === "fehler.zustand"
      ? "konflikt"
      : "fehler";

  return json(
    {
      ergebnis,
      meldung: kernErgebnis.status.meldung ?? "fehler.unbekannt",
      wert: kernErgebnis.status.wert,
    },
    200,
  );
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

  const eintrag = await leseEintrag(request);
  if (!eintrag) return eingabeFehler();
  const { aktionId, aktionTyp, nutzlast } = eintrag;
  if (!aktionId || !aktionTyp || typeof nutzlast !== "object" || nutzlast === null) {
    return eingabeFehler();
  }

  const kernAufruf = KERN_AUFRUFE.get(aktionTyp);
  if (!kernAufruf) return eingabeFehler();
  const kernErgebnis = await kernAufruf(eintrag);
  // Beleg ohne Datei: die Antwort steht schon fest (fehler.keineDatei).
  if (kernErgebnis instanceof Response) return kernErgebnis;
  return syncAntwort(kernErgebnis);
}
