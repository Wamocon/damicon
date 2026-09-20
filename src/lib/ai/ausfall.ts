// Ausfallsicherheit fuer die Sprachmodelle: was ist schiefgegangen, lohnt sich der Wechsel zu einem anderen
// Anbieter, und wie lange sollen wir den ausgefallenen in Ruhe lassen?
//
// Reine Funktionen und ein kleiner Schalter mit einstellbarer Uhr, ohne Netzwerk und ohne SDK-Aufruf, damit sich
// jede Entscheidung testen laesst. Der Wechsel selbst steht in ausfall-modell.ts.
//
// Grundsatz: nur wechseln, wenn ein ANDERER Anbieter die Anfrage besser bedienen kann. Ein Guthaben, das aufgebraucht
// ist, ein Ratenlimit, eine Ueberlastung oder ein Netzfehler gehoert dazu. Eine fehlerhafte Anfrage (400) nicht: sie
// scheitert beim naechsten Anbieter genauso, und der Wechsel wuerde nur den Fehler verstecken.

export type AusfallArt = "guthaben" | "ratenlimit" | "ueberlast" | "netz" | "auth" | "anfrage" | "unbekannt";

interface FehlerAehnlich {
  name?: string;
  message?: string;
  statusCode?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  data?: unknown;
  cause?: unknown;
  code?: string;
}

const ALS = (e: unknown): FehlerAehnlich => (e && typeof e === "object" ? (e as FehlerAehnlich) : { message: String(e) });

/** Text aus Meldung und Antwortkoerper, kleingeschrieben, fuer die Suche nach Merkmalen. */
function text(e: FehlerAehnlich): string {
  const daten = typeof e.data === "object" && e.data ? JSON.stringify(e.data) : "";
  return `${e.message ?? ""} ${e.responseBody ?? ""} ${daten}`.toLowerCase();
}

export function klassifiziere(fehler: unknown): AusfallArt {
  const e = ALS(fehler);
  const t = text(e);
  const status = e.statusCode;

  if (/credit balance is too low|insufficient[_ ](?:quota|funds|credits?)|quota (?:exceeded|exhausted)|billing|payment required|exceeded your current quota/.test(t) || status === 402) return "guthaben";
  if (status === 429 || /rate[_ ]limit|too many requests|tokens per minute|requests per minute/.test(t)) return "ratenlimit";
  if (status === 529 || status === 503 || status === 502 || status === 504 || (status !== undefined && status >= 500) || /overloaded|temporarily unavailable|service unavailable|bad gateway|gateway time-?out/.test(t)) return "ueberlast";
  if (status === 401 || status === 403 || /invalid x-api-key|authentication|unauthor|permission|forbidden|not authenticated/.test(t)) return "auth";
  if (status === 400 || status === 404 || status === 413 || status === 422) return "anfrage";

  // Netzwerk: fetch failed, Zeitueberschreitung, Verbindungsabbruch (auch als Ursache eines anderen Fehlers)
  const kette = [e, ALS(e.cause)];
  for (const k of kette) {
    const s = `${k.name ?? ""} ${k.message ?? ""} ${k.code ?? ""}`.toLowerCase();
    if (/fetch failed|econnreset|econnrefused|enotfound|etimedout|socket hang up|network|timeout|timed out|aborterror|terminated|und_err/.test(s)) return "netz";
  }
  return "unbekannt";
}

/** Lohnt sich der Wechsel zu einem anderen Anbieter? Bei "auth" ja: ein falscher Schluessel des einen darf den anderen nicht mitreissen. */
export function darfAusweichen(art: AusfallArt): boolean {
  return art === "guthaben" || art === "ratenlimit" || art === "ueberlast" || art === "netz" || art === "auth";
}

const MIN = 60_000;
/** Wie lange der ausgefallene Anbieter uebersprungen wird. Bei einem Ratenlimit gilt der Hinweis des Anbieters (retry-after). */
export function sperrdauerMs(art: AusfallArt, retryAfterSekunden?: number): number {
  if (art === "ratenlimit") return Math.min(5 * MIN, Math.max(10_000, (retryAfterSekunden ?? 30) * 1000));
  if (art === "guthaben") return 5 * MIN;
  if (art === "auth") return 5 * MIN;
  if (art === "ueberlast") return 30_000;
  if (art === "netz") return 20_000;
  return 0;
}

export function retryAfterSekunden(fehler: unknown): number | undefined {
  const kopf = ALS(fehler).responseHeaders;
  const roh = kopf?.["retry-after"] ?? kopf?.["Retry-After"];
  const n = roh === undefined ? NaN : Number(roh);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export interface Sperre {
  bis: number;
  art: AusfallArt;
}

/** Schutzschalter je Anbieter: ein ausgefallener Anbieter wird fuer eine Weile uebersprungen, damit nicht jede Anfrage
 *  erst auf den Fehler wartet. Nach Ablauf darf die naechste Anfrage ihn wieder versuchen (halb offen); gelingt sie,
 *  ist er wieder im Dienst, sonst gilt die Sperre erneut. */
export class Schalter {
  private readonly sperren = new Map<string, Sperre>();
  constructor(private readonly jetzt: () => number = () => Date.now()) {}

  offen(name: string): boolean {
    const s = this.sperren.get(name);
    return !!s && s.bis > this.jetzt();
  }
  oeffnen(name: string, art: AusfallArt, retryAfter?: number): void {
    const dauer = sperrdauerMs(art, retryAfter);
    if (dauer > 0) this.sperren.set(name, { bis: this.jetzt() + dauer, art });
  }
  schliessen(name: string): void {
    this.sperren.delete(name);
  }
  /** Fuer den Notfall (alle gesperrt): der Anbieter, dessen Sperre zuerst endet. */
  fruehesteFreigabe(namen: string[]): string | undefined {
    return [...namen].sort((a, b) => (this.sperren.get(a)?.bis ?? 0) - (this.sperren.get(b)?.bis ?? 0))[0];
  }
  zustand(): Record<string, Sperre> {
    const jetzt = this.jetzt();
    return Object.fromEntries([...this.sperren].filter(([, s]) => s.bis > jetzt));
  }
}
