import { seitenZahlKandidaten, type SeitenRand } from "@/lib/wissen/seitenverlauf";
import { type OffeneLuecke } from "@/lib/wissen/seiten-bestaetigung";

// Ordnet die Seiten einer Nachlade-PDF den offenen Lücken eines Buchs zu (Browser, vor dem Senden). Jede PDF-Seite bekommt ihre gedruckte Seitenzahl aus Kopf
// oder Fuß der Textebene (wie die Seitenverlauf-Prüfung beim Hochladen). Nur Zahlen, die in eine offene Lücke fallen, zählen: Eine Seite, deren Zahl zu keiner
// Lücke passt, wird gemeldet, statt irgendwo eingereiht zu werden. Ist keine Zahl lesbar, kann die Person die Seitenzahlen von Hand angeben (in der
// Reihenfolge der Datei).

export interface ZugeordneteGruppe {
  /** Gedruckte Seitenzahlen dieser Gruppe, aufsteigend. */
  seiten: number[];
  /** PDF-Seiten der Nachlade-Datei (1-basiert) in derselben Reihenfolge. */
  pdfSeiten: number[];
}

export interface Zuordnung {
  gruppen: ZugeordneteGruppe[];
  /** PDF-Seiten, auf denen keine Seitenzahl lesbar war. */
  unklar: number[];
  /** PDF-Seiten mit lesbarer Zahl, die in keine offene Lücke fällt (oder die schon vergeben ist). */
  ausserhalb: number[];
}

const passt = (l: OffeneLuecke, n: number) => n >= l.vonGedruckt && n <= l.bisGedruckt;

/**
 * `raender` sind Kopf und Fuß jeder Seite der Nachlade-Datei, `offen` die offenen Lücken des Buchs. `manuell` (optional) sind die gedruckten Seitenzahlen in der
 * Reihenfolge der Datei, wenn die Zahlen nicht lesbar sind; sie gelten nur, wenn ihre Zahl der Seiten der Datei entspricht.
 */
export function ordneSeitenZu(raender: readonly SeitenRand[], offen: readonly OffeneLuecke[], manuell?: readonly number[]): Zuordnung {
  const nummern: (number | null)[] = [];
  const unklar: number[] = [];
  const ausserhalb: number[] = [];
  const vergeben = new Set<number>();
  const nutzeManuell = manuell !== undefined && manuell.length > 0 && manuell.length === raender.length;

  raender.forEach((rand, i) => {
    const seite = i + 1;
    if (nutzeManuell) {
      const n = manuell[i]!;
      if (offen.some((l) => passt(l, n)) && !vergeben.has(n)) {
        vergeben.add(n);
        nummern.push(n);
      } else {
        ausserhalb.push(seite);
        nummern.push(null);
      }
      return;
    }
    const kandidaten = [...seitenZahlKandidaten([...rand.fuss, ...rand.kopf])].sort((a, b) => a - b);
    if (kandidaten.length === 0) {
      unklar.push(seite);
      nummern.push(null);
      return;
    }
    const treffer = kandidaten.find((n) => offen.some((l) => passt(l, n)) && !vergeben.has(n));
    if (treffer === undefined) {
      ausserhalb.push(seite);
      nummern.push(null);
      return;
    }
    vergeben.add(treffer);
    nummern.push(treffer);
  });

  // Je Lücke eine Gruppe: Die Seiten, die in den Bereich der Lücke fallen (die erste passende gewinnt), nach gedruckter Zahl geordnet.
  const gruppen: ZugeordneteGruppe[] = [];
  const belegt = new Set<number>();
  for (const l of offen) {
    const paare = nummern
      .map((n, i) => ({ n, seite: i + 1 }))
      .filter((p): p is { n: number; seite: number } => p.n !== null && !belegt.has(p.seite) && passt(l, p.n))
      .sort((a, b) => a.n - b.n);
    // Bei einer unscharfen Lücke nicht mehr Seiten, als dort fehlen; die übrigen bleiben "außerhalb" (der Server würde sie ablehnen).
    const nimm = l.genau ? paare : paare.slice(0, l.anzahl);
    for (const p of paare.slice(nimm.length)) ausserhalb.push(p.seite);
    for (const p of nimm) belegt.add(p.seite);
    if (nimm.length > 0) gruppen.push({ seiten: nimm.map((p) => p.n), pdfSeiten: nimm.map((p) => p.seite) });
  }
  return { gruppen, unklar, ausserhalb: [...new Set(ausserhalb)].sort((a, b) => a - b) };
}
