import { imMarkup } from "./ansicht-probe";

// Auszüge aus gerendertem Markup für Ansichtstests ohne Browser (seit 14.10.2026): Abschnitte nach Überschrift, Tabellenzeilen als
// Zelltexte mit Spaltenkopf, Pillen und Kennzahlkacheln mit Ton, Leerzustände, Verweise, Formularknöpfe. Gelesen wird das HTML, das
// prerender oder renderToStaticMarkup liefert; die Muster folgen den Bausteinen in components/ui/kit.tsx und components/ui/liste.tsx.

/** Klassen der Pille (StatusPill) je Ton. */
const PILLEN_TON: Record<string, string> = {
  "bg-success/10 text-success border-success/25": "success",
  "bg-primary/10 text-primary border-primary/25": "info",
  "bg-muted text-muted-foreground border-border": "neutral",
  "bg-warning/12 text-warning border-warning/25": "warning",
  "bg-destructive/10 text-destructive border-destructive/25": "danger",
};
/** Farbe der großen Zahl einer Kennzahlkachel (Stat) je Ton. */
const KACHEL_TON: Record<string, string> = {
  "text-success": "success",
  "text-primary": "info",
  "text-foreground": "neutral",
  "text-warning": "warning",
  "text-destructive": "danger",
};

const entschluesseln = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Ohne Trennkommentare, Symbole und Skripte; wiederholt bis nichts mehr wegfällt, damit auch zerteilte Reste verschwinden (CodeQL). */
function ohneBloecke(html: string): string {
  let vorher: string;
  let jetzt = html;
  do {
    vorher = jetzt;
    jetzt = jetzt
      .replace(/<!-- -->/g, "")
      .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, "")
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
  } while (jetzt !== vorher);
  return jetzt;
}

/** Sichtbarer Text: ohne Trennkommentare, Symbole und Skripte; was in eigenen Elementen steht, mit " | " getrennt. */
export function textVon(html: string): string {
  return ohneBloecke(html)
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((teil) => entschluesseln(teil).trim())
    .filter(Boolean)
    .join(" | ");
}

/** Der Abschnitt (Section) mit dieser Überschrift, oder "" wenn es ihn nicht gibt. */
export function abschnitt(html: string, titel: string): string {
  const kopf = html.indexOf(`<h2 class="text-sm font-bold text-card-foreground">${imMarkup(titel)}</h2>`);
  if (kopf === -1) return "";
  return html.slice(html.lastIndexOf("<section", kopf), html.indexOf("</section>", kopf) + "</section>".length);
}

/** Die Überschriften aller Abschnitte in ihrer Reihenfolge. */
export const abschnittTitel = (html: string): string[] =>
  [...html.matchAll(/<h2 class="text-sm font-bold text-card-foreground">([^<]*)<\/h2>/g)].map((m) => entschluesseln(m[1]!));

/** Die Zeilen aller Tabellenkörper: je Zelle "Kopf=Text", Zellen über die ganze Breite als "*Text". */
export function tabellenZeilen(html: string): string[][] {
  const zeilen: string[][] = [];
  for (const koerper of html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)) {
    for (const zeile of koerper[1]!.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      zeilen.push(
        [...zeile[1]!.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map((zelle) => {
          const kopf = zelle[1]!.match(/data-kopf="([^"]*)"/)?.[1];
          return kopf === undefined ? `*${textVon(zelle[2]!)}` : `${entschluesseln(kopf)}=${textVon(zelle[2]!)}`;
        }),
      );
    }
  }
  return zeilen;
}

/** Die Klassen der Tabellenzeilen (<tr> im Körper), leer bei Zeilen ohne Klasse. */
export const zeilenKlassen = (html: string): string[] =>
  [...html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)].flatMap((k) =>
    [...k[1]!.matchAll(/<tr(?: class="([^"]*)")?>/g)].map((m) => m[1] ?? ""),
  );

/** Spaltenköpfe aller Tabellen, je Tabelle mit " | " verbunden. */
export const tabellenKoepfe = (html: string): string[] =>
  [...html.matchAll(/<thead>([\s\S]*?)<\/thead>/g)].map((m) => textVon(m[1]!));

/** Alle Pillen als "Ton:Text", mit Titel als "Ton:Text [Titel]". */
export function pillen(html: string, mitTitel = false): string[] {
  return [
    ...html.matchAll(
      /<span (?:title="([^"]*)" )?class="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0\.5 text-\[11px\] font-semibold leading-4 ([^"]+)">([\s\S]*?)<\/span>/g,
    ),
  ].map((m) => `${PILLEN_TON[m[2]!] ?? m[2]}:${textVon(m[3]!)}${mitTitel && m[1] ? ` [${entschluesseln(m[1])}]` : ""}`);
}

/** Alle Kennzahlkacheln als "Beschriftung=Wert (Hilfstext) [Ton]". */
export function kacheln(html: string): string[] {
  return [
    ...html.matchAll(
      /<p class="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">([^<]*)<\/p><p class="mt-1 text-2xl font-black ([^"]+)">([\s\S]*?)<\/p>(?:<p class="mt-1 schrift-dense text-muted-foreground">([^<]*)<\/p>)?/g,
    ),
  ].map((m) => `${entschluesseln(m[1]!)}=${textVon(m[3]!)}${m[4] ? ` (${entschluesseln(m[4])})` : ""} [${KACHEL_TON[m[2]!] ?? m[2]}]`);
}

/** Leerzustände (LeererZustand mit Modul) als "Titel", mit Text als "Titel / Text", mit Anlegen-Knopf als "Titel -> #ziel". */
export function leerzustaende(html: string): string[] {
  return [
    ...html.matchAll(
      /<div class="px-6 py-8 text-center"><span[^>]*>[\s\S]*?<\/span><p class="mt-4 font-heading text-base font-black text-card-foreground">([^<]*)<\/p>(?:<p class="mx-auto mt-1\.5 max-w-sm schrift-dense text-muted-foreground">([^<]*)<\/p>)?(?:<div class="mt-5 flex flex-wrap justify-center gap-3"><a href="([^"]*)")?/g,
    ),
  ].map((m) => `${entschluesseln(m[1]!)}${m[2] ? ` / ${entschluesseln(m[2])}` : ""}${m[3] ? ` -> ${m[3]}` : ""}`);
}

/** Die Verweise einer Leiste (Reiter oder Pillen) mit dieser Beschriftung als "Text -> Ziel", der aktive mit "*" davor. */
export function leiste(html: string, beschriftung: string): string[] {
  const nav = html.match(new RegExp(`<nav aria-label="${imMarkup(beschriftung).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>([\\s\\S]*?)</nav>`))?.[1];
  if (nav === undefined) return [];
  return [...nav.matchAll(/<a( aria-current="[^"]*")?[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    (m) => `${m[1] ? "*" : ""}${textVon(m[3]!)} -> ${entschluesseln(m[2]!)}`,
  );
}

/** Beschriftungen aller Absendeknöpfe in ihrer Reihenfolge, also welche Formulare dastehen. */
export const knoepfe = (html: string): string[] =>
  [...html.matchAll(/<button type="submit"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => textVon(m[1]!));

/** Versteckte Felder als "name=wert", in ihrer Reihenfolge. */
export const versteckt = (html: string): string[] =>
  [...html.matchAll(/<input type="hidden" name="([^"]*)"(?: value="([^"]*)")?\/>/g)].map((m) => `${m[1]}=${entschluesseln(m[2] ?? "")}`);

/** Die Optionen der Auswahl mit diesem Namen als "wert:Text", die gewählte mit "*" davor; null, wenn es sie nicht gibt. */
export function optionen(html: string, name: string): string[] | null {
  const auswahl = html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)</select>`))?.[1];
  if (auswahl === undefined) return null;
  return [...auswahl.matchAll(/<option value="([^"]*)"( selected="")?>([^<]*)<\/option>/g)].map(
    (m) => `${m[2] ? "*" : ""}${entschluesseln(m[1]!)}:${entschluesseln(m[3]!)}`,
  );
}

/** Ids der Aufklapper (<details>) in ihrer Reihenfolge. */
export const aufklapper = (html: string): string[] => [...html.matchAll(/<details id="([^"]*)"/g)].map((m) => m[1]!);
