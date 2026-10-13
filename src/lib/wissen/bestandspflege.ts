// Bestandspflege der Wissensbasis: Analysen, die die Administration auf Knopfdruck ausführt, bevor sie Dokumente entfernt.
// Reine Funktionen ohne Datenbank (die Zahlen zur inhaltlichen Nähe liefert wissen_naehe(), die Liste wissen_liste()), damit alles testbar bleibt.
//
// Warum: Am 12.10.2026 wurde der Bestand von Hand gegen die 20 Fachbücher geprüft (docs/bestand-abdeckung-2026-10-12.md). Solche Prüfungen gehören in die
// Oberfläche, mit denselben Kriterien und derselben Prüfansicht, und das Entfernen erst nach der Prüfung (wissenBestandEntfernen).
//
// Die Analyse ENTSCHEIDET NIE. Sie liefert Befunde mit Begründung und Stufe:
//   entfernen  starker Hinweis (zum Beispiel ein Arbeitsdokument der Recherche): als Vorschlag markiert, aber nie vorausgewählt
//   pruefen    braucht den Blick der Administration (Dublette, durch ein Buch abgedeckt, ausdrücklich veraltet, Wiedervorlage fällig)
//   hinweis    gut zu wissen (Herkunft nicht prüfbar, Jahr im Titel alt, teilweise abgedeckt)
// Ähnlichkeit allein beweist keine gleiche Aussage: Am 12.10.2026 waren von 44 inhaltlich berührten Dokumenten nur 10 wirklich vollständig durch Bücher
// abgedeckt. Deshalb steht bei "abgedeckt" und "Dublette" immer die Vergleichsansicht (Abschnitt gegen Abschnitt) dabei.

import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";

export type BefundArt = "arbeitsdokument" | "veraltet" | "dublette" | "abgedeckt" | "wiedervorlage" | "herkunft";
export type BefundStufe = "entfernen" | "pruefen" | "hinweis";
export type BefundGrund =
  | "arbeitsdokument"
  | "rohbefund"
  | "markiertVeraltet"
  | "jahrAlt"
  | "wiedervorlageFaellig"
  | "keinLink"
  | "dublette"
  | "abgedeckt"
  | "teilweiseAbgedeckt";

export interface Befund {
  art: BefundArt;
  stufe: BefundStufe;
  grund: BefundGrund;
  /** Ergänzung zum Grund: das ähnliche Dokument (Titel), das Jahr, das Datum der Wiedervorlage. */
  wert?: string;
  /** Kennung des ähnlichen Dokuments (für die Vergleichsansicht). */
  vergleichMit?: string;
  /** Anteil der geprüften Abschnitte (0 bis 1), die so ähnlich sind, und die kleinste Ähnlichkeit darunter. */
  anteil?: number;
  minimum?: number;
}

/** Schwellen der Ähnlichkeit (Kosinus der Vektoren). Aus der Handprüfung vom 12.10.2026 abgeleitet, nicht aus der Luft gegriffen. */
export const SCHWELLEN = {
  /** Nahezu derselbe Text. */
  gleich: 0.97,
  /** Dasselbe gesagt (Gesetzestext und seine Spiegelseite lagen bei 0,88 bis 0,94). */
  abgedeckt: 0.88,
  /** Gleiches Thema mit viel Überlappung. */
  teilweise: 0.82,
  /** Anteil der geprüften Abschnitte, der die Schwelle erreichen muss. */
  anteilVoll: 0.8,
  anteilTeil: 0.5,
} as const;

// ---- Heuristiken auf der Liste ---------------------------------------------------------------------------------------------

const ARBEIT: RegExp[] = [
  /^index\b/i,
  /^readme\b/i,
  /^auftrag\b/i,
  /gemeinsamer auftrag/i,
  /research-plan/i,
  /^research:/i,
  /suchbegriffe je/i,
  /^quellenkarte$/i,
  /lücken und offene fragen/i,
  /^вопросы к аудитору/i,
  /^wamocon legal (wissensdatenbank|grundlagenwissen)/i,
  /^audit-fachliteratur \d{4}/i,
];
const ARBEIT_PFAD = /(^|\/)(readme|index|_index)[^/]*\.md$/i;
const ROHBEFUND = /rohbefund/i;
const VERALTET = /veraltet|überholt|altkodex|alte fassung|nicht mehr gültig/i;

const jahrVon = (heute: string): number => Number(heute.slice(0, 4));

/** Befunde, die allein aus Titel, Pfad, Link und Wiedervorlage folgen. `heute` (JJJJ-MM-TT) ist ein Parameter, damit Tests ohne Uhr auskommen. */
export function heuristischeBefunde(d: WissenDokumentZeile, heute: string): Befund[] {
  const aus: Befund[] = [];
  const titel = d.titel.replace(/^\*+|\*+$/g, "").trim();
  const bestand = d.herkunft === "skript";

  if (bestand) {
    if (ARBEIT.some((m) => m.test(titel)) || ARBEIT_PFAD.test(d.schluessel)) aus.push({ art: "arbeitsdokument", stufe: "entfernen", grund: "arbeitsdokument" });
    else if (ROHBEFUND.test(titel)) aus.push({ art: "arbeitsdokument", stufe: "pruefen", grund: "rohbefund" });

    if (VERALTET.test(titel) || VERALTET.test(d.rechtsstelle ?? "")) aus.push({ art: "veraltet", stufe: "pruefen", grund: "markiertVeraltet" });
    else {
      const jahre = [...titel.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
      if (jahre.length > 0 && Math.max(...jahre) <= jahrVon(heute) - 3) aus.push({ art: "veraltet", stufe: "hinweis", grund: "jahrAlt", wert: String(Math.max(...jahre)) });
    }

    if (!d.url || !/^https?:\/\/\S+\.\S+/.test(d.url)) aus.push({ art: "herkunft", stufe: "hinweis", grund: "keinLink" });
  }

  if (d.abgelaufen) aus.push({ art: "wiedervorlage", stufe: "pruefen", grund: "wiedervorlageFaellig", wert: d.pruefenBis ?? undefined });
  return aus;
}

// ---- Inhaltliche Nähe ------------------------------------------------------------------------------------------------------

export interface NaeheProbe {
  /** Kosinus der Vektoren (0 bis 1) zum ähnlichsten Abschnitt eines ANDEREN Dokuments. */
  aehnlichkeit: number;
  quelleId: string;
  titel: string | null;
  /** Der ähnlichste Abschnitt gehört zu einem hochgeladenen Dokument (Buch). */
  istUpload: boolean;
}

export interface DokumentNaehe {
  schluessel: string;
  proben: NaeheProbe[];
}

interface Gruppe {
  quelleId: string;
  titel: string | null;
  istUpload: boolean;
  treffer: number;
  minimum: number;
}

/** Wie viele der Proben erreichen `schwelle`, gruppiert nach dem ähnlichsten Dokument; die Gruppe mit den meisten Treffern gewinnt. */
function besteGruppe(proben: readonly NaeheProbe[], schwelle: number, nurUpload: boolean | null): Gruppe | null {
  const gruppen = new Map<string, Gruppe>();
  for (const p of proben) {
    if (p.aehnlichkeit < schwelle) continue;
    if (nurUpload !== null && p.istUpload !== nurUpload) continue;
    const g = gruppen.get(p.quelleId) ?? { quelleId: p.quelleId, titel: p.titel, istUpload: p.istUpload, treffer: 0, minimum: 1 };
    g.treffer++;
    g.minimum = Math.min(g.minimum, p.aehnlichkeit);
    gruppen.set(p.quelleId, g);
  }
  return [...gruppen.values()].sort((a, b) => b.treffer - a.treffer || b.minimum - a.minimum)[0] ?? null;
}

/** Dublette und Abdeckung durch Bücher aus den Proben eines Dokuments. Ein Bestandsdokument kann durch ein Buch abgedeckt sein, ein Buch nur Dublette eines anderen sein. */
export function bewerteNaehe(d: WissenDokumentZeile, naehe: DokumentNaehe | undefined): Befund[] {
  if (!naehe || naehe.proben.length === 0) return [];
  const n = naehe.proben.length;
  const aus: Befund[] = [];
  const bestand = d.herkunft === "skript";

  // 1. Dublette: nahezu derselbe Text in einem anderen Dokument (bei einem Bestandsdokument ist das Gegenüber kein Buch, sonst wäre es "abgedeckt").
  const gleich = besteGruppe(naehe.proben, SCHWELLEN.gleich, bestand ? false : null);
  if (gleich && gleich.treffer / n >= SCHWELLEN.anteilVoll) {
    aus.push({ art: "dublette", stufe: "pruefen", grund: "dublette", wert: gleich.titel ?? gleich.quelleId, vergleichMit: gleich.quelleId, anteil: gleich.treffer / n, minimum: gleich.minimum });
  }

  // 2. Durch Bücher abgedeckt (nur Bestand): Die Proben stehen so ähnlich in einem hochgeladenen Buch.
  if (bestand) {
    const voll = besteGruppe(naehe.proben, SCHWELLEN.abgedeckt, true);
    if (voll && voll.treffer / n >= SCHWELLEN.anteilVoll) {
      aus.push({ art: "abgedeckt", stufe: "pruefen", grund: "abgedeckt", wert: voll.titel ?? voll.quelleId, vergleichMit: voll.quelleId, anteil: voll.treffer / n, minimum: voll.minimum });
    } else {
      const teil = besteGruppe(naehe.proben, SCHWELLEN.teilweise, true);
      if (teil && teil.treffer / n >= SCHWELLEN.anteilTeil) {
        aus.push({ art: "abgedeckt", stufe: "hinweis", grund: "teilweiseAbgedeckt", wert: teil.titel ?? teil.quelleId, vergleichMit: teil.quelleId, anteil: teil.treffer / n, minimum: teil.minimum });
      }
    }
  }
  return aus;
}

// ---- Zusammenfassung -----------------------------------------------------------------------------------------------------

export interface DokumentBefunde {
  dokument: WissenDokumentZeile;
  befunde: Befund[];
  /** Die stärkste Stufe aller Befunde. */
  stufe: BefundStufe;
}

const RANG: Record<BefundStufe, number> = { entfernen: 0, pruefen: 1, hinweis: 2 };

export function staerksteStufe(befunde: readonly Befund[]): BefundStufe {
  return [...befunde].sort((a, b) => RANG[a.stufe] - RANG[b.stufe])[0]?.stufe ?? "hinweis";
}

/** Alle Befunde je Dokument (nur Dokumente mit mindestens einem Befund), stärkste zuerst, innerhalb der Stufe nach Titel. */
export function baueBefunde(dokumente: readonly WissenDokumentZeile[], naehe: ReadonlyMap<string, DokumentNaehe>, heute: string): DokumentBefunde[] {
  const aus: DokumentBefunde[] = [];
  for (const d of dokumente) {
    if (d.chunks === 0) continue;
    const befunde = [...heuristischeBefunde(d, heute), ...bewerteNaehe(d, naehe.get(d.schluessel))];
    if (befunde.length > 0) aus.push({ dokument: d, befunde, stufe: staerksteStufe(befunde) });
  }
  return aus.sort((a, b) => RANG[a.stufe] - RANG[b.stufe] || a.dokument.titel.localeCompare(b.dokument.titel));
}

/** Zählung je Art (ein Dokument zählt je Art einmal) und je stärkster Stufe, für die Filter der Ansicht. */
export function zaehleBefunde(liste: readonly DokumentBefunde[]): { art: Record<BefundArt, number>; stufe: Record<BefundStufe, number> } {
  const art: Record<BefundArt, number> = { arbeitsdokument: 0, veraltet: 0, dublette: 0, abgedeckt: 0, wiedervorlage: 0, herkunft: 0 };
  const stufe: Record<BefundStufe, number> = { entfernen: 0, pruefen: 0, hinweis: 0 };
  for (const d of liste) {
    for (const a of new Set(d.befunde.map((b) => b.art))) art[a]++;
    stufe[d.stufe]++;
  }
  return { art, stufe };
}
