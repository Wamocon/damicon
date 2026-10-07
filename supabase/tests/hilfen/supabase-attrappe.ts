// Eine Attrappe des Supabase-Clients fuer Tests der Datenbanklader (Fund 89 der Pruefung
// vom 28.09.2026): die Lader der Tageslage waren nur per Regex auf ihren Quelltext
// festgenagelt. Eine Mutation wie "Brigadefilter aus" oder ".lt" statt ".lte" blieb
// gruen, weil kein Test die Abfragekette je ausfuehrte.
//
// Die Attrappe bildet die Kette nach, die die Lader benutzen (select mit count/head, eq,
// neq, is, in, lt, lte, gt, gte, not ... is null, or im PostgREST-Format, order, limit,
// maybeSingle) und wendet sie WIRKLICH auf Zeilen im Speicher an. Eingebettete
// Beziehungen ("reihenbloecke ( code )") projiziert sie nicht: die Testzeilen tragen sie
// schon in der Form, die PostgREST liefern wuerde.
//
// Zeitpunkte werden als Zeitpunkte verglichen, nicht als Text: "2026-09-28T05:00:00Z"
// und "2026-09-28T05:00:00.000Z" sind derselbe Moment, als Text aber verschieden.

type Zeile = Record<string, unknown>;
type Filter = (zeile: Zeile) => boolean;

export interface AttrappenFehler {
  message: string;
}

export interface AttrappenOptionen {
  /** Tabellen, deren Abfragen mit einem Fehler antworten (wie supabase-js: error statt throw). */
  fehlerIn?: readonly string[];
}

/** Jede ausgefuehrte Abfrage, fuer Pruefungen wie "wurde ueberhaupt gezaehlt". */
export interface AbfrageProtokoll {
  tabelle: string;
  count: boolean;
  head: boolean;
  treffer: number;
}

const ZEITPUNKT = /^\d{4}-\d{2}-\d{2}/;

function vergleiche(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string" && ZEITPUNKT.test(a) && ZEITPUNKT.test(b)) {
    const za = Date.parse(a);
    const zb = Date.parse(b);
    if (Number.isFinite(za) && Number.isFinite(zb)) return za - zb;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

const leer = (wert: unknown) => wert === null || wert === undefined;

/** Ein Glied aus .or("spalte.op.wert,..."), wie PostgREST es liest. */
function orGlied(glied: string): Filter {
  const [spalte, op, ...rest] = glied.split(".");
  const wert = rest.join(".");
  if (!spalte || !op) throw new Error(`Attrappe: unbekanntes or-Glied "${glied}"`);
  switch (op) {
    case "eq":
      return (z) => !leer(z[spalte]) && String(z[spalte]) === wert;
    case "neq":
      return (z) => !leer(z[spalte]) && String(z[spalte]) !== wert;
    case "is":
      if (wert !== "null") throw new Error(`Attrappe: is nur mit null, nicht "${wert}"`);
      return (z) => leer(z[spalte]);
    case "lt":
      return (z) => !leer(z[spalte]) && vergleiche(z[spalte], wert) < 0;
    case "gte":
      return (z) => !leer(z[spalte]) && vergleiche(z[spalte], wert) >= 0;
    default:
      throw new Error(`Attrappe: or-Operator "${op}" nicht nachgebildet`);
  }
}

class Abfrage implements PromiseLike<{ data: unknown; error: AttrappenFehler | null; count: number | null }> {
  private filter: Filter[] = [];
  private sortierung: { spalte: string; aufsteigend: boolean }[] = [];
  private grenze: number | null = null;
  private zaehlen = false;
  private nurKopf = false;
  private einzeln = false;

  constructor(
    private readonly tabelle: string,
    private readonly zeilen: readonly Zeile[],
    private readonly fehler: boolean,
    private readonly protokoll: AbfrageProtokoll[],
  ) {}

  select(_spalten?: string, optionen?: { count?: "exact"; head?: boolean }) {
    this.zaehlen = optionen?.count === "exact";
    this.nurKopf = optionen?.head === true;
    return this;
  }
  eq(spalte: string, wert: unknown) {
    this.filter.push((z) => !leer(z[spalte]) && z[spalte] === wert);
    return this;
  }
  neq(spalte: string, wert: unknown) {
    this.filter.push((z) => !leer(z[spalte]) && z[spalte] !== wert);
    return this;
  }
  is(spalte: string, wert: null) {
    if (wert !== null) throw new Error("Attrappe: is nur mit null");
    this.filter.push((z) => leer(z[spalte]));
    return this;
  }
  in(spalte: string, werte: readonly unknown[]) {
    this.filter.push((z) => werte.includes(z[spalte]));
    return this;
  }
  lt(spalte: string, wert: unknown) {
    this.filter.push((z) => !leer(z[spalte]) && vergleiche(z[spalte], wert) < 0);
    return this;
  }
  lte(spalte: string, wert: unknown) {
    this.filter.push((z) => !leer(z[spalte]) && vergleiche(z[spalte], wert) <= 0);
    return this;
  }
  gt(spalte: string, wert: unknown) {
    this.filter.push((z) => !leer(z[spalte]) && vergleiche(z[spalte], wert) > 0);
    return this;
  }
  gte(spalte: string, wert: unknown) {
    this.filter.push((z) => !leer(z[spalte]) && vergleiche(z[spalte], wert) >= 0);
    return this;
  }
  not(spalte: string, op: string, wert: unknown) {
    if (op !== "is" || wert !== null) throw new Error(`Attrappe: not(${op}) nicht nachgebildet`);
    this.filter.push((z) => !leer(z[spalte]));
    return this;
  }
  or(ausdruck: string) {
    const glieder = ausdruck.split(",").map(orGlied);
    this.filter.push((z) => glieder.some((g) => g(z)));
    return this;
  }
  order(spalte: string, optionen?: { ascending?: boolean }) {
    this.sortierung.push({ spalte, aufsteigend: optionen?.ascending ?? true });
    return this;
  }
  limit(anzahl: number) {
    this.grenze = anzahl;
    return this;
  }
  maybeSingle() {
    this.einzeln = true;
    return this;
  }

  private ausfuehren(): { data: unknown; error: AttrappenFehler | null; count: number | null } {
    if (this.fehler) {
      this.protokoll.push({ tabelle: this.tabelle, count: this.zaehlen, head: this.nurKopf, treffer: 0 });
      return { data: null, error: { message: `Attrappe: ${this.tabelle} nicht erreichbar` }, count: null };
    }
    const passend = this.zeilen.filter((z) => this.filter.every((f) => f(z)));
    const sortiert = [...passend].sort((a, b) => {
      for (const { spalte, aufsteigend } of this.sortierung) {
        const d = vergleiche(a[spalte], b[spalte]);
        if (d !== 0) return aufsteigend ? d : -d;
      }
      return 0;
    });
    const geschnitten = this.grenze === null ? sortiert : sortiert.slice(0, this.grenze);
    this.protokoll.push({ tabelle: this.tabelle, count: this.zaehlen, head: this.nurKopf, treffer: passend.length });
    const count = this.zaehlen ? passend.length : null;
    if (this.nurKopf) return { data: null, error: null, count };
    if (this.einzeln) return { data: geschnitten[0] ?? null, error: null, count };
    return { data: geschnitten.map((z) => ({ ...z })), error: null, count };
  }

  then<A = { data: unknown; error: AttrappenFehler | null; count: number | null }, B = never>(
    erfuellt?: ((wert: { data: unknown; error: AttrappenFehler | null; count: number | null }) => A | PromiseLike<A>) | null,
    abgelehnt?: ((grund: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.ausfuehren()).then(erfuellt, abgelehnt);
  }
}

/**
 * Ein Client mit festen Tabellen. Unbekannte Tabellen sind leer. Die Rueckgabe ist
 * absichtlich ungetypt: der Test castet sie auf den Client-Typ des Laders.
 */
export function supabaseAttrappe(tabellen: Record<string, readonly Zeile[]>, optionen: AttrappenOptionen = {}) {
  const protokoll: AbfrageProtokoll[] = [];
  const client = {
    from(tabelle: string) {
      return new Abfrage(tabelle, tabellen[tabelle] ?? [], (optionen.fehlerIn ?? []).includes(tabelle), protokoll);
    },
  };
  return { client, protokoll };
}
