import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { ZEITLIMIT_MS, bewerteAntwort, istInternerHost, zielUrlFehler, type Umschlag, type Zustellung } from "@/lib/domain/integration-auslieferung";

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

export async function sendeWebhook(ziel: WebhookZiel, umschlag: Umschlag, d: WebhookAbhaengigkeiten = {}): Promise<Zustellung> {
  const umgebung = d.umgebung ?? process.env;
  const geheimnis = umgebung[ziel.geheimnisName];
  if (!geheimnis) return { art: "wiederholen", grund: `Geheimnis nicht gesetzt (${ziel.geheimnisName})`, status: null };

  if (zielUrlFehler(ziel.zielUrl) !== null) return { art: "abgelehnt", grund: "Adresse nicht zulaessig", status: 0 };
  const url = new URL(ziel.zielUrl);

  // Der Name darf nicht auf eine interne Adresse zeigen: aufloesen und jede Adresse pruefen (best effort, ein Wechsel zwischen
  // Pruefung und Aufruf bleibt moeglich).
  try {
    const adressen = await (d.aufloesen ?? ((h: string) => lookup(h, { all: true })))(url.hostname);
    if (adressen.length === 0 || adressen.some((a) => istInternerHost(a.address))) return { art: "abgelehnt", grund: "Adresse zeigt ins eigene Netz", status: 0 };
  } catch {
    return { art: "wiederholen", grund: "Name nicht aufloesbar", status: null };
  }

  const koerper = JSON.stringify(umschlag);
  const zeitstempel = Math.floor((d.jetzt ?? Date.now)() / 1000);
  try {
    const antwort = await (d.abruf ?? fetch)(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
      headers: {
        "Content-Type": "application/json",
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
