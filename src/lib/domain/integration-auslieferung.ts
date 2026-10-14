// Auslieferung der Integrations-Warteschlange (WMCNL-1627, WMCNL-2290). Reine Regeln ohne Netzwerk und Datenbank: wann ein Eintrag
// wieder versucht wird, was eine Antwort des Ziels bedeutet, welche Adressen zulaessig sind und wie der Umschlag aussieht.
//
// Das Zusammenspiel: ein Ereignis steht mit dem Status "pending" in integration_outbox (Migration 20261207110000). Die Auslieferung
// (lib/integration/auslieferung.ts) holt die faelligen Eintraege, sendet sie ueber den Adapter der Integration und haelt das Ergebnis
// fest: "sent" (das Ziel hat angenommen), wieder "pending" mit spaeterem naechsten Versuch (vorlaeufiger Fehler) oder "failed"
// (endgueltig, entweder abgelehnt oder zu oft versucht). Ein gescheiterter Eintrag geht nur durch eine Person zurueck auf "pending".

export const OUTBOX_STATUS = ["pending", "sent", "acked", "failed"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUS)[number];

export const ADAPTER = ["manuell", "webhook"] as const;
export type Adapter = (typeof ADAPTER)[number];

/** Nach so vielen Fehlversuchen gibt die Auslieferung auf (Status failed). */
export const MAX_VERSUCHE = 6;

/** Wartezeit nach dem n-ten Fehlversuch in Minuten (Index 0: nach dem ersten). Danach noch einmal die letzte, bis MAX_VERSUCHE erreicht ist. */
export const WIEDERHOLUNG_MINUTEN = [1, 5, 15, 60, 240] as const;

/** So lange gilt ein Versuch als laufend: der Eintrag ist in dieser Zeit fuer andere Laeufe gesperrt. */
export const SPERRE_MINUTEN = 5;

/** Zeitlimit eines Versuchs. */
export const ZEITLIMIT_MS = 10_000;

export const GEHEIMNIS_MUSTER = /^[A-Z][A-Z0-9_]{2,63}$/;

export const istOutboxStatus = (w: string): w is OutboxStatus => (OUTBOX_STATUS as readonly string[]).includes(w);
export const istAdapter = (w: string): w is Adapter => (ADAPTER as readonly string[]).includes(w);

/**
 * Wann der naechste Versuch faellig ist, nachdem der `versuche`-te gescheitert ist. null: die Versuche sind aufgebraucht,
 * der Eintrag scheitert endgueltig.
 */
export function naechsterVersuch(versuche: number, jetzt: Date): Date | null {
  if (versuche >= MAX_VERSUCHE) return null;
  const minuten = WIEDERHOLUNG_MINUTEN[Math.min(Math.max(versuche, 1), WIEDERHOLUNG_MINUTEN.length) - 1];
  return new Date(jetzt.getTime() + minuten * 60_000);
}

export type Zustellung =
  | { art: "zugestellt"; status: number }
  /** Vorlaeufiger Fehler: Netz, Zeitlimit, Fehler beim Ziel. Spaeter noch einmal versuchen. */
  | { art: "wiederholen"; grund: string; status: number | null }
  /** Das Ziel lehnt das Ereignis ab. Eine Wiederholung aendert daran nichts. */
  | { art: "abgelehnt"; grund: string; status: number };

/**
 * Was eine Antwort des Ziels bedeutet. 2xx: angenommen. 408 und 429 sowie jeder 5xx: vorlaeufig. Jeder andere Status (auch eine
 * Weiterleitung, denen der Adapter nicht folgt): das Ziel hat entschieden, abgelehnt. Keine Antwort (null) ist ein Netzfehler.
 */
export function bewerteAntwort(status: number | null, fehler = ""): Zustellung {
  if (status === null) return { art: "wiederholen", grund: fehler || "keine Antwort", status: null };
  if (status >= 200 && status < 300) return { art: "zugestellt", status };
  if (status === 408 || status === 429 || status >= 500) return { art: "wiederholen", grund: `HTTP ${status}`, status };
  return { art: "abgelehnt", grund: `HTTP ${status}`, status };
}

/** Das Ergebnis eines Versuchs fuer die Warteschlange: neuer Status, Versuche, naechster Versuch, Fehlertext. */
export interface Fortschritt {
  status: OutboxStatus;
  versuche: number;
  naechsterVersuchAm: Date | null;
  letzterFehler: string | null;
  antwortStatus: number | null;
}

export function fortschritt(vorher: { versuche: number }, z: Zustellung, jetzt: Date): Fortschritt {
  const versuche = vorher.versuche + 1;
  if (z.art === "zugestellt") return { status: "sent", versuche, naechsterVersuchAm: null, letzterFehler: null, antwortStatus: z.status };
  if (z.art === "abgelehnt") return { status: "failed", versuche, naechsterVersuchAm: null, letzterFehler: z.grund.slice(0, 500), antwortStatus: z.status };
  const naechster = naechsterVersuch(versuche, jetzt);
  return naechster === null
    ? { status: "failed", versuche, naechsterVersuchAm: null, letzterFehler: `${z.grund} (nach ${versuche} Versuchen aufgegeben)`.slice(0, 500), antwortStatus: z.status }
    : { status: "pending", versuche, naechsterVersuchAm: naechster, letzterFehler: z.grund.slice(0, 500), antwortStatus: z.status };
}

// --- Adressen -----------------------------------------------------------------------------------------------------------------------

const PRIVATE_IPV4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/** Ist die Adresse ein Rechner im eigenen Netz oder auf der eigenen Maschine (kein Ziel fuer eine Auslieferung)? Gilt fuer Namen wie fuer IP-Adressen. */
export function istInternerHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h === "") return true;
  if (PRIVATE_IPV4.some((r) => r.test(h))) return true;
  // IPv6: Loopback, unspezifiziert, Link-Local (fe80::/10), Unique-Local (fc00::/7), auf IPv4 abgebildete Adressen
  if (h.includes(":")) return h === "::1" || h === "::" || /^fe[89ab]/.test(h) || /^f[cd]/.test(h) || h.startsWith("::ffff:");
  return false;
}

/** null, wenn die Adresse als Ziel zulaessig ist; sonst der Schluessel des Fehlers (aktionen.fehler.<schluessel>). */
export function zielUrlFehler(roh: string): "integrationUrl" | "integrationUrlIntern" | null {
  let url: URL;
  try {
    url = new URL(roh.trim());
  } catch {
    return "integrationUrl";
  }
  if (url.protocol !== "https:" || roh.trim().length > 500 || url.username !== "" || url.password !== "" || url.hostname === "") return "integrationUrl";
  return istInternerHost(url.hostname) ? "integrationUrlIntern" : null;
}

export const geheimnisNameGueltig = (w: string): boolean => GEHEIMNIS_MUSTER.test(w);

export type KonfigurationsFehler = "integrationAdapter" | "integrationUrl" | "integrationUrlIntern" | "integrationGeheimnis" | "integrationUnvollstaendig";

/** Prueft die Konfiguration einer Integration. Aktiv gibt es nur als Webhook mit Adresse und dem Namen des Geheimnisses. */
export function konfigurationFehler(e: { adapter: string; zielUrl: string; geheimnisName: string; aktiv: boolean }): KonfigurationsFehler | null {
  if (!istAdapter(e.adapter)) return "integrationAdapter";
  if (e.adapter === "manuell") return e.aktiv ? "integrationUnvollstaendig" : null;
  const url = e.zielUrl.trim();
  const geheimnis = e.geheimnisName.trim();
  if (url !== "") {
    const f = zielUrlFehler(url);
    if (f) return f;
  }
  if (geheimnis !== "" && !geheimnisNameGueltig(geheimnis)) return "integrationGeheimnis";
  if (e.aktiv && (url === "" || geheimnis === "")) return "integrationUnvollstaendig";
  return null;
}

// --- Umschlag -----------------------------------------------------------------------------------------------------------------------

export interface Umschlag {
  id: string;
  ereignis: string | null;
  idempotenzSchluessel: string | null;
  erstelltAm: string;
  versuch: number;
  daten: unknown;
}

/** Der Koerper des Webhooks. Feste Schluessel, damit das Ziel sich darauf verlassen kann; die Nutzdaten stehen unter "daten". */
export function baueUmschlag(e: { id: string; ereignis: string | null; idempotenzSchluessel: string | null; erstelltAm: string; versuche: number; payload: unknown }): Umschlag {
  return { id: e.id, ereignis: e.ereignis, idempotenzSchluessel: e.idempotenzSchluessel, erstelltAm: e.erstelltAm, versuch: e.versuche + 1, daten: e.payload };
}
