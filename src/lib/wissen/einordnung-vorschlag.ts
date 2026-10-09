import { type Cluster, type Quellenart } from "@/lib/wissen/quellenart";

// Vorschlag fuer die Einordnung von Bestand, der vor der Typisierung eingelesen wurde (Quellenart und Cluster leer).
// Reine Funktion ohne Datenbank und ohne Sprachmodell. Sie liest nur, was der Bestand schon traegt: den Link, die bisherige
// Autoritaetsstufe und die Rechtsstelle. Der urspruengliche Quelltyp des Einlese-Skripts steht nicht in der Datenbank.
//
// Ein Vorschlag ist nie eine Einordnung. Die Administration sieht ihn mit Begruendung, aendert ihn oder stimmt zu, und erst ihre
// Bestaetigung schreibt etwas (wissenBestandEinordnen). Deshalb traegt jeder Vorschlag eine Sicherheit:
//   hoch     mehrere Hinweise stimmen ueberein (zum Beispiel amtliche Seite und eine Stufe von 1 bis 3)
//   mittel   ein Hinweis (Seite oder Stufe), der aber plausibel ist
//   niedrig  Hinweise widersprechen sich oder fehlen: die Administration entscheidet
//
// Unterscheidung, auf die die Regeln aufbauen: Die Art richtet sich nach der Herkunft des TEXTES, der Cluster nach dem WEG.
// Ein Gesetz von einer Regierungsseite ist eine Rechtsnorm (Art) aus dem Internet (Cluster).

export type Sicherheit = "hoch" | "mittel" | "niedrig";
export type VorschlagGrund = "rechtsstelle" | "amtlicheSeite" | "wikipedia" | "forum" | "blog" | "stufe" | "keinLink";

export interface VorschlagEingabe {
  url: string | null;
  stufe: number | null;
  rechtsstelle: string | null;
}

export interface Vorschlag {
  quellenart: Quellenart | null;
  cluster: Cluster | null;
  sicherheit: Sicherheit;
  grund: VorschlagGrund;
  /** Der Rechnername des Links ohne www, oder null. */
  host: string | null;
}

/** Die bisherige Skala der Autoritaetsstufe als Quellenart: Das Einlese-Skript hat die Stufe aus dem Quelltyp abgeleitet. */
const ART_NACH_STUFE: Record<number, Quellenart> = {
  1: "rechtsnorm",
  2: "verwaltungsanweisung",
  3: "behoerdeninfo",
  4: "fachliteratur",
  5: "internetquelle",
};

/** Amtliche Seiten und Seiten zwischenstaatlicher Organisationen. Ein Anfang, kein vollstaendiges Verzeichnis: Was hier fehlt,
 *  bekommt keinen Treffer und wird nach der bisherigen Stufe vorgeschlagen, mit geringerer Sicherheit. */
const AMTLICH: readonly RegExp[] = [
  /(^|\.)gov$/,
  /(^|\.)gov\.[a-z]{2}$/, // gov.kz, gov.uk, nalog.gov.ru; nicht gov.com
  /(^|\.)gv\.at$/,
  /(^|\.)admin\.ch$/,
  /(^|\.)europa\.eu$/,
  /(^|\.)zan\.kz$/, // adilet.zan.kz, das amtliche Rechtsportal Kasachstans
  /(^|\.)egov\.kz$/,
  /(^|\.)aifc\.kz$/, // Astana International Financial Centre und seine Aufsicht
  /(^|\.)gesetze-im-internet\.de$/,
  /(^|\.)bundesfinanzministerium\.de$/,
  /(^|\.)bundesgesetzblatt\.de$/,
  /(^|\.)bundestag\.de$/,
  /(^|\.)bundesregierung\.de$/,
  /(^|\.)oecd\.org$/,
  /(^|\.)un\.org$/,
  /(^|\.)worldbank\.org$/,
  /(^|\.)imf\.org$/,
];
const WIKIPEDIA = /(^|\.)wikipedia\.org$/;
const FORUM = /(^|\.)(reddit\.com|stackexchange\.com|stackoverflow\.com|quora\.com)$|(^|\.)forum\./;
const BLOG = /(^|\.)(medium\.com|substack\.com|habr\.com|vc\.ru|dzen\.ru|blogspot\.com|wordpress\.com)$|(^|\.)blog\.|blog/;

export function hostVon(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return h || null;
  } catch {
    return null;
  }
}

export const istAmtlicheSeite = (host: string): boolean => AMTLICH.some((m) => m.test(host));

const stufeOk = (stufe: number | null): stufe is number => stufe !== null && stufe >= 1 && stufe <= 5;

export function schlageVor(e: VorschlagEingabe): Vorschlag {
  const host = hostVon(e.url);
  const ausStufe = stufeOk(e.stufe) ? ART_NACH_STUFE[e.stufe]! : null;

  // Ohne Link ist nur die bisherige Stufe da, und der Weg bleibt offen: die Administration waehlt den Cluster.
  if (!host) return { quellenart: ausStufe, cluster: null, sicherheit: "niedrig", grund: "keinLink", host: null };

  if (istAmtlicheSeite(host)) {
    const rechtsquelle = !!e.rechtsstelle?.trim() && (!stufeOk(e.stufe) || e.stufe <= 2);
    const art: Quellenart = rechtsquelle || e.stufe === 1 ? "rechtsnorm" : e.stufe === 2 ? "verwaltungsanweisung" : "behoerdeninfo";
    // Amtliche Seite und eine Stufe von 1 bis 3 (oder eine Rechtsstelle) stimmen ueberein: hoch. Sonst bleibt es ein plausibler Hinweis.
    const sicherheit: Sicherheit = rechtsquelle || (stufeOk(e.stufe) && e.stufe <= 3) ? "hoch" : "mittel";
    return { quellenart: art, cluster: "internet", sicherheit, grund: rechtsquelle ? "rechtsstelle" : "amtlicheSeite", host };
  }
  if (WIKIPEDIA.test(host)) return { quellenart: "internetquelle", cluster: "internet", sicherheit: "mittel", grund: "wikipedia", host };
  if (FORUM.test(host)) return { quellenart: "forum", cluster: "internet", sicherheit: "hoch", grund: "forum", host };
  if (BLOG.test(host)) return { quellenart: "internetquelle", cluster: "internet", sicherheit: "mittel", grund: "blog", host };

  // Unbekannte Seite: die bisherige Stufe entscheidet. Nennt sie Recht oder amtlich (1 bis 3), die Seite aber nicht als amtlich bekannt
  // ist, widersprechen sich die Hinweise: niedrig.
  const sicherheit: Sicherheit = stufeOk(e.stufe) && e.stufe <= 3 ? "niedrig" : stufeOk(e.stufe) ? "mittel" : "niedrig";
  return { quellenart: ausStufe, cluster: "internet", sicherheit, grund: "stufe", host };
}
