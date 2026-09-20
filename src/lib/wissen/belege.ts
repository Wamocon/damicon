import type { Beleg } from "@/lib/wissen/suche";

// Reine Hilfen fuer die Darstellung von Belegen im Chat: was hat das Werkzeug
// geliefert, was hat die Antwort davon zitiert, welche Zitate haben KEINEN
// Beleg. Keine React-Abhaengigkeit, damit sie testbar bleiben.

const KENNUNG = /\[(S\d{1,3})\]/g;

/** Kennungen, die der Text zitiert ([S1], [S3] ...), in der Reihenfolge des ersten Auftretens. */
export function zitierteKennungen(text: string): string[] {
  const gefunden: string[] = [];
  for (const m of text.matchAll(KENNUNG)) {
    if (!gefunden.includes(m[1]!)) gefunden.push(m[1]!);
  }
  return gefunden;
}

/** Macht aus "[S1]" einen Markdown-Link "quelle:S1", den der Chat als Zitat-Marke zeichnet. */
export function verlinkeZitate(text: string): string {
  return text.replace(/\[(S\d{1,3})\](?!\()/g, "[$1](quelle:$1)");
}

const zeichenkette = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Liest die Belege aus dem Ergebnis von wissenSuchen. Prueft die Form, weil die Daten
 *  aus dem Verlauf kommen (Client) und nie blind angezeigt werden sollen. */
export function belegeAusErgebnis(ausgabe: unknown): Beleg[] {
  const liste = (ausgabe as { belege?: unknown } | null | undefined)?.belege;
  if (!Array.isArray(liste)) return [];
  const belege: Beleg[] = [];
  for (const roh of liste) {
    const b = roh as Record<string, unknown> | null;
    const id = zeichenkette(b?.id);
    if (!b || !id || !/^S\d{1,3}$/.test(id)) continue;
    belege.push({
      id,
      fundstelle: zeichenkette(b.fundstelle) ?? "Quelle",
      titel: zeichenkette(b.titel),
      sprache: zeichenkette(b.sprache),
      stufe: typeof b.stufe === "number" ? b.stufe : null,
      gueltigAb: zeichenkette(b.gueltigAb),
      gueltigBis: zeichenkette(b.gueltigBis),
      ueberholt: b.ueberholt === true,
      konfidenz: zeichenkette(b.konfidenz),
      abgerufenAm: zeichenkette(b.abgerufenAm),
      url: zeichenkette(b.url) && /^https?:\/\//.test(b.url as string) ? (b.url as string) : null,
      bereich: zeichenkette(b.bereich) ?? "",
      text: zeichenkette(b.text) ?? "",
      punktzahl: typeof b.punktzahl === "number" ? b.punktzahl : 0,
    });
  }
  return belege;
}

/** Die Autoritaetsstufe als Schluessel fuer die Beschriftung. */
export function stufeSchluessel(stufe: number | null): "recht" | "untergesetzlich" | "erlaeuterung" | "fachquelle" | "presse" | "unbekannt" {
  switch (stufe) {
    case 1:
      return "recht";
    case 2:
      return "untergesetzlich";
    case 3:
      return "erlaeuterung";
    case 4:
      return "fachquelle";
    case 5:
      return "presse";
    default:
      return "unbekannt";
  }
}

/** Hoechste bereits vergebene Kennungsnummer in einer Liste von Belegen. */
export function hoechsteNummer(belege: Array<{ id: string }>): number {
  return belege.reduce((m, b) => Math.max(m, Number(b.id.slice(1)) || 0), 0);
}

/** Naechste freie Kennungsnummer fuer die laufende Antwort. Eine Antwort kann aus mehreren
 *  Anfragen bestehen (der Client schickt nach jedem Browser-Werkzeug eine Folgeanfrage);
 *  ohne diese Fortzaehlung wuerde jede Anfrage wieder bei S1 beginnen, und zwei
 *  verschiedene Quellen hiessen gleich. Gezaehlt wird ab der letzten Nutzernachricht. */
export function naechsteBelegNummer(nachrichten: Array<{ role: string; parts?: unknown[] }>): number {
  const letzterNutzer = nachrichten.map((n) => n.role).lastIndexOf("user");
  let hoechste = 0;
  for (const nachricht of nachrichten.slice(letzterNutzer + 1)) {
    for (const teil of nachricht.parts ?? []) {
      const t = teil as { type?: string; output?: unknown };
      if (t.type === "tool-wissenSuchen") hoechste = Math.max(hoechste, hoechsteNummer(belegeAusErgebnis(t.output)));
    }
  }
  return hoechste + 1;
}
