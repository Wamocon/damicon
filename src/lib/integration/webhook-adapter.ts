import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { ZEITLIMIT_MS, bewerteAntwort, istInternerHost, zielUrlFehler, type Umschlag, type Zustellung } from "@/lib/domain/integration-auslieferung";
import { baueKoerper } from "@/lib/domain/integration-vorlage";

/** Wie lange die Namensaufloesung hoechstens dauert (sie hat von sich aus kein Zeitlimit). */
const AUFLOESEN_ZEITLIMIT_MS = 5_000;

// Der Webhook-Adapter (WMCNL-1627): sendet den Umschlag eines Ereignisses als JSON per POST an die Adresse der Integration und
// signiert ihn mit dem gemeinsamen Geheimnis, damit das Ziel pruefen kann, dass er von Damicon kommt und nicht verfaelscht oder
// wiederholt wurde.
//
// Signatur: HMAC-SHA256 ueber "<Zeitstempel>.<Koerper>", als "sha256=<hex>" im Kopf X-Damicon-Signatur, der Zeitstempel (Unix-
// Sekunden) im Kopf X-Damicon-Zeitstempel. Das Ziel rechnet dasselbe mit seinem Geheimnis, vergleicht zeitkonstant und weist einen zu
// alten Zeitstempel ab. Der Schluessel des Ereignisses geht als Idempotency-Key mit: eine Wiederholung traegt denselben.
//
// Sicherheit: nur https, keine Weiterleitungen (eine Weiterleitung koennte auf ein internes Ziel zeigen), keine Adressen im eigenen
// Netz, auch nicht nach der Namensaufloesung. Das Geheimnis steht in einer Umgebungsvariablen, deren NAME die Integration traegt.

export interface WebhookZiel {
  zielUrl: string;
  geheimnisName: string;
  /** "basic": zusaetzlich HTTP Basic mit "Benutzer:Kennwort" aus der Umgebungsvariable zugangName (zum Beispiel fuer OData von 1C). Sonst nur die Signatur. */
  authArt?: "hmac" | "basic";
  zugangName?: string | null;
  /** Vorlage fuer den Koerper (JSON mit Platzhaltern). Leer: der Umschlag geht unveraendert hinaus. */
  vorlage?: unknown;
}

export interface WebhookAbhaengigkeiten {
  /** Umgebungsvariablen; im Test ein eigenes Objekt. */
  umgebung?: Record<string, string | undefined>;
  jetzt?: () => number;
  abruf?: typeof fetch;
  aufloesen?: (host: string) => Promise<{ address: string }[]>;
}

/** "sha256=<hex>": die Signatur ueber Zeitstempel und Koerper. */
export function signiere(geheimnis: string, zeitstempel: number, koerper: string): string {
  return `sha256=${createHmac("sha256", geheimnis).update(`${zeitstempel}.${koerper}`).digest("hex")}`;
}

/** So weit darf der Zeitstempel einer Rueckmeldung von der Serverzeit abweichen (Sekunden): gegen das Wiederholen einer abgefangenen Nachricht. */
export const SIGNATUR_TOLERANZ_SEKUNDEN = 300;

/**
 * Prueft die Signatur einer Rueckmeldung des Partners (gleiche Form wie die ausgehende: HMAC-SHA256 ueber "<Zeitstempel>.<Koerper>" im Kopf
 * X-Damicon-Signatur, Unix-Sekunden im Kopf X-Damicon-Zeitstempel). Zeitkonstanter Vergleich, Zeitstempel innerhalb der Toleranz.
 */
export function pruefeSignatur(geheimnis: string, zeitstempelRoh: string | null, signatur: string | null, koerper: string, jetztSekunden: number): "ok" | "signatur" | "zeit" {
  const zeitstempel = Number(zeitstempelRoh);
  if (!zeitstempelRoh || !Number.isInteger(zeitstempel) || Math.abs(jetztSekunden - zeitstempel) > SIGNATUR_TOLERANZ_SEKUNDEN) return "zeit";
  const soll = Buffer.from(signiere(geheimnis, zeitstempel, koerper));
  const ist = Buffer.from(signatur ?? "");
  return ist.length === soll.length && timingSafeEqual(ist, soll) ? "ok" : "signatur";
}

export async function sendeWebhook(ziel: WebhookZiel, umschlag: Umschlag, d: WebhookAbhaengigkeiten = {}): Promise<Zustellung> {
  const umgebung = d.umgebung ?? process.env;
  const geheimnis = umgebung[ziel.geheimnisName];
  if (!geheimnis) return { art: "wiederholen", grund: `Geheimnis nicht gesetzt (${ziel.geheimnisName})`, status: null };
  // Zugang per Benutzer und Kennwort (HTTP Basic): der Wert steht in der Umgebung, nie in der Datenbank. Fehlt er, wartet der Eintrag wie bei einem fehlenden Geheimnis.
  let basic: string | null = null;
  if (ziel.authArt === "basic") {
    const zugang = ziel.zugangName ? umgebung[ziel.zugangName] : undefined;
    if (!zugang || !zugang.includes(":")) return { art: "wiederholen", grund: `Zugang nicht gesetzt (${ziel.zugangName ?? "ohne Namen"})`, status: null };
    basic = `Basic ${Buffer.from(zugang, "utf8").toString("base64")}`;
  }

  if (zielUrlFehler(ziel.zielUrl) !== null) return { art: "abgelehnt", grund: "Adresse nicht zulaessig", status: 0 };
  const url = new URL(ziel.zielUrl);

  // Der Name darf nicht auf eine interne Adresse zeigen: aufloesen und jede Adresse pruefen (best effort, ein Wechsel zwischen
  // Pruefung und Aufruf bleibt moeglich).
  try {
    // Mit Zeitlimit: Die Namensaufloesung hat von sich aus keines, und ein haengender Name hielte den ganzen Lauf an.
    const adressen = await Promise.race([
      (d.aufloesen ?? ((h: string) => lookup(h, { all: true })))(url.hostname),
      new Promise<never>((_, nein) => {
        const uhr = setTimeout(() => nein(new Error("Zeitueberschreitung")), AUFLOESEN_ZEITLIMIT_MS);
        uhr.unref?.();
      }),
    ]);
    if (adressen.length === 0 || adressen.some((a) => istInternerHost(a.address))) return { art: "abgelehnt", grund: "Adresse zeigt ins eigene Netz", status: 0 };
  } catch {
    return { art: "wiederholen", grund: "Name nicht aufloesbar", status: null };
  }

  // Mit Vorlage geht das Mapping des Partners hinaus, sonst der Umschlag. Die Signatur gilt dem Koerper, den das Ziel wirklich bekommt.
  const koerper = JSON.stringify(baueKoerper(umschlag, ziel.vorlage));
  const zeitstempel = Math.floor((d.jetzt ?? Date.now)() / 1000);
  try {
    const antwort = await (d.abruf ?? fetch)(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(basic ? { Authorization: basic } : {}),
        "User-Agent": "Damicon-Integration/1",
        "Idempotency-Key": umschlag.idempotenzSchluessel ?? umschlag.id,
        "X-Damicon-Zeitstempel": String(zeitstempel),
        "X-Damicon-Signatur": signiere(geheimnis, zeitstempel, koerper),
      },
      body: koerper,
    });
    // Der Koerper der Antwort interessiert nicht; freigeben, damit die Verbindung nicht offen bleibt.
    await antwort.body?.cancel().catch(() => undefined);
    return bewerteAntwort(antwort.status);
  } catch (fehler) {
    const name = fehler instanceof Error ? fehler.name : "Fehler";
    return bewerteAntwort(null, name === "TimeoutError" || name === "AbortError" ? "Zeitlimit" : `Netzfehler (${name})`);
  }
}
