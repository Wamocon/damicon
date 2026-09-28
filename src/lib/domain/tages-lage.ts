// Tageslage fuer Himbi (Werkzeug tagesLageAbrufen, lib/ai/tages-lage.ts):
// die dringendsten Punkte des Tages fuer den angemeldeten Nutzer, nach Rolle
// und Rechten. Rueckmeldung vom 28.09.2026: Himbi soll vorschlagen, was heute
// ansteht, und helfen, den Tag zu organisieren. Bisher konnte er das nur aus
// sechs bis zehn datenLesen-Aufrufen zusammensuchen - im Sprachmodus laeuft
// aber nur ein Werkzeug je Schritt, eine solche Uebersicht brach dort ab.
//
// Diese Datei ist die reine Logik ohne Datenbank: welche Quellen eine Rolle
// bekommt, wie ein Punkt eingestuft, sortiert und gekuerzt wird, und was
// "heute" heisst. Geladen wird in lib/ai/tages-lage.ts. So lassen sich
// Rollenfilter, Sortierung und der Tag um Mitternacht ohne Netz pruefen
// (supabase/tests/tages-lage.ts).
//
// "Heute" ist der Tag auf dem Feld in Asia/Almaty (tagInZone), nicht der
// UTC-Tag: zwischen Mitternacht und fuenf Uhr Ortszeit laege er sonst einen
// Tag zurueck, und eine Frist von heute stuende als "morgen" da.
//
// Keine fertigen Saetze: Titel und Details sind Daten (Codes, Namen,
// Zahlen, Status-Kennungen). Das Modell formuliert in der Antwortsprache.

import { hasPermission, type Role } from "@/lib/rbac";
import { kpisFuerRolle, type Kpi } from "@/lib/domain/kpis";
import { nurAuffaellige, zielAuswerten, type Zielauswertung } from "@/lib/domain/zielstand";
import { darfCeoBerichtLesen } from "@/lib/pruefung/rollen";
import { brigadeBedingung, type BrigadeBedingung } from "@/lib/domain/pflueckaufgaben-liste";
import { betriebsZeitzone, tagInZone } from "@/lib/domain/tageszeit";
import { wandzeitZuUtc } from "@/lib/listen/zeitraum";

// ---- Eingaben ------------------------------------------------------------------------------

export const HORIZONT_MIN = 0;
export const HORIZONT_MAX = 14;
export const HORIZONT_STANDARD = 7;
export const PUNKTE_MIN = 3;
export const PUNKTE_MAX = 10;
export const PUNKTE_STANDARD = 6;

/** Grenzen der Eingaben - das Schema prueft sie, hier stehen sie noch einmal fuer
 *  Aufrufe ohne Schema (Tests, spaetere Aufrufer) und fuer fehlende Werte. */
export function normiereEingaben(eingabe: { horizontTage?: number; maxPunkte?: number }): {
  horizontTage: number;
  maxPunkte: number;
} {
  const ganz = (wert: number | undefined, standard: number, min: number, max: number) =>
    typeof wert === "number" && Number.isFinite(wert) ? Math.min(max, Math.max(min, Math.round(wert))) : standard;
  return {
    horizontTage: ganz(eingabe.horizontTage, HORIZONT_STANDARD, HORIZONT_MIN, HORIZONT_MAX),
    maxPunkte: ganz(eingabe.maxPunkte, PUNKTE_STANDARD, PUNKTE_MIN, PUNKTE_MAX),
  };
}

// ---- Profil --------------------------------------------------------------------------------

/** Was das Werkzeug vom angemeldeten Nutzer wissen muss - Auszug aus SessionProfile (lib/auth.ts). */
export interface TagesLageProfil {
  profilId: string | null;
  brigadeId: string | null;
  pflueckerId: string | null;
  b2bKundeId: string | null;
}

export const LEERES_PROFIL: TagesLageProfil = { profilId: null, brigadeId: null, pflueckerId: null, b2bKundeId: null };

/**
 * Das Profil fuer das Werkzeug. In der Rollenvorschau (ein Administrator sieht
 * als andere Rolle, api/ki-assistent/route.ts) bleiben alle persoenlichen Ids
 * leer: die Brigade, der Kunde oder die Schulung des Administrators gehoeren
 * nicht in die Sicht einer anderen Rolle. Uebrig bleibt die Rollensicht.
 */
export function profilFuerTagesLage(
  sitzung: { id: string; brigadeId: string | null; pflueckerId: string | null; b2bKundeId: string | null } | null | undefined,
  vorschau: boolean,
): TagesLageProfil {
  if (!sitzung || vorschau) return { ...LEERES_PROFIL };
  return {
    profilId: sitzung.id,
    brigadeId: sitzung.brigadeId,
    pflueckerId: sitzung.pflueckerId,
    b2bKundeId: sitzung.b2bKundeId,
  };
}

// ---- Quellen je Rolle ----------------------------------------------------------------------

export const TAGES_QUELLEN = [
  "frist",
  "aufgabe",
  "kuehlkette",
  "reklamation",
  "tour",
  "lieferung",
  "naechsteLieferung",
  "schulung",
  "lohn",
  "pruefbericht",
  "kennzahl",
] as const;
export type TagesQuelle = (typeof TAGES_QUELLEN)[number];

/** Quellen, die nur mit einer persoenlichen Id etwas liefern (sonst stehen sie unter luecken). */
export const PERSOENLICHE_QUELLEN: Partial<Record<TagesQuelle, keyof TagesLageProfil>> = {
  naechsteLieferung: "b2bKundeId",
  schulung: "profilId",
};

/**
 * Welche Quellen eine Rolle bekommt. Dieselben rbac.ts-Rechte wie die
 * Einzelansichten - ueber die Zusammenfassung darf nichts lesbar werden, was
 * die Rolle direkt nicht sehen kann (derselbe Grundsatz wie baueRadar in
 * lib/ai/tools.ts). RLS grenzt beim Lesen zusaetzlich ein.
 *
 *   frist        wie das Risiko-Radar: MwSt, ESUTD oder Datenschutz sichtbar
 *   aufgabe      pflueckaufgaben:update - wer Aufgaben bearbeitet. Die
 *                Buchhaltung sieht sie, arbeitet sie aber nicht ab; fuer ihren
 *                Tag waeren sie Rauschen.
 *   kuehlkette   kuehlkette:view
 *   reklamation  reklamationen:view (der Kunde sieht per RLS nur die eigenen)
 *   tour         logistik:create - wer Touren plant (RLS: nur das Buero)
 *   lieferung    logistik:view - geplante Lieferungen ohne Tour
 *   naechsteLieferung  nur der Kunde: sein naechster zugesagter Termin
 *   schulung     schulungen:complete - die eigene Pflichtschulung
 *   lohn         lohn:approve - Abrechnungen im Entwurf warten auf Freigabe
 *   pruefbericht darfCeoBerichtLesen (Spiegel der SELECT-Policy)
 *   kennzahl     die Rolle sieht betriebsweite Kennzahlen (kpisFuerRolle)
 */
export function quellenFuerRolle(rolle: Role | null | undefined): TagesQuelle[] {
  if (!rolle) return [];
  const darf: Record<TagesQuelle, boolean> = {
    frist:
      hasPermission(rolle, "stammdaten", "view") ||
      hasPermission(rolle, "personal", "view") ||
      hasPermission(rolle, "compliance", "view"),
    aufgabe: hasPermission(rolle, "pflueckaufgaben", "update"),
    kuehlkette: hasPermission(rolle, "kuehlkette", "view"),
    reklamation: hasPermission(rolle, "reklamationen", "view"),
    tour: hasPermission(rolle, "logistik", "create"),
    lieferung: hasPermission(rolle, "logistik", "view"),
    naechsteLieferung: rolle === "kunde",
    schulung: hasPermission(rolle, "schulungen", "complete"),
    lohn: hasPermission(rolle, "lohn", "approve"),
    pruefbericht: darfCeoBerichtLesen(rolle),
    kennzahl: (() => {
      const { kern, erweitert } = kpisFuerRolle(rolle);
      return kern.length + erweitert.length > 0;
    })(),
  };
  return TAGES_QUELLEN.filter((q) => darf[q]);
}

/**
 * Welche Pflueckaufgaben zaehlen: die Brigade sieht ihre eigenen und die ohne
 * Zuordnung (dieselbe Regel wie der Filter "meine", brigadeBedingung), alle
 * anderen Rollen den ganzen Betrieb. Ohne Brigade-Id (Vorschau, keine
 * Zuordnung) bleiben fuer die Brigade nur die Aufgaben ohne Zuordnung.
 */
export function aufgabenBedingung(rolle: Role | null | undefined, profil: TagesLageProfil): BrigadeBedingung {
  return rolle === "brigade" ? brigadeBedingung("meine", rolle, profil.brigadeId) : { art: "alle" };
}

// ---- Punkte --------------------------------------------------------------------------------

export type PunktArt =
  | "frist"
  | "aufgabe"
  | "kuehlkette"
  | "reklamation"
  | "lieferung"
  | "tour"
  | "schulung"
  | "lohn"
  | "pruefbericht"
  | "kennzahl";

/** Fuer wen der Punkt ist - die Grundlage fuer "deine", "eure", "im Betrieb". */
export type PunktWer = "ich" | "meine Brigade" | "meine Rolle" | "Betrieb";

/** 1 ueberfaellig oder Verstoss, 2 heute, 3 bald (im Horizont), 4 Hinweis ohne Termin. */
export type PunktStufe = 1 | 2 | 3 | 4;

export interface TagesPunktRoh {
  id: string;
  art: PunktArt;
  titel: string;
  detail: string | null;
  /** "JJJJ-MM-TT" (ganzer Tag in Almaty) oder ein Zeitpunkt (ISO). null = kein Termin. */
  faelligAm: string | null;
  wer: PunktWer;
  ziel: string | null;
  /** Anzahl hinter einem Sammelpunkt (Lohnabrechnungen im Entwurf). */
  anzahl?: number;
  /** Ein Verstoss ohne Termin (Kuehlmessung ueber der Grenze): immer Stufe 1. */
  verstoss?: boolean;
  /** Ein Hinweis ohne Handlungsdruck (Kennzahl, Prioritaet): Stufe 4, auch mit Termin. */
  hinweis?: boolean;
}

export interface TagesPunkt {
  id: string;
  art: PunktArt;
  titel: string;
  detail: string | null;
  faelligAm: string | null;
  ueberfaellig: boolean;
  stufe: PunktStufe;
  wer: PunktWer;
  ziel: string | null;
  anzahl?: number;
}

const NUR_TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Der Tag eines Termins in Almaty. Ein reines Datum ist schon ein Tag der Betriebszeit. */
export function terminTag(faelligAm: string | null, zeitzone: string = betriebsZeitzone): string | null {
  if (!faelligAm) return null;
  if (NUR_TAG.test(faelligAm)) return faelligAm;
  const zeit = Date.parse(faelligAm);
  return Number.isFinite(zeit) ? tagInZone(new Date(zeit), zeitzone) : null;
}

/** Zeitwert fuer die Sortierung. Ein reines Datum zaehlt ab Tagesbeginn in Almaty. */
export function terminZeit(faelligAm: string | null, zeitzone: string = betriebsZeitzone): number | null {
  if (!faelligAm) return null;
  if (NUR_TAG.test(faelligAm)) return wandzeitZuUtc(faelligAm, zeitzone)?.getTime() ?? null;
  const zeit = Date.parse(faelligAm);
  return Number.isFinite(zeit) ? zeit : null;
}

/** Kalenderrechnung auf "JJJJ-MM-TT", unabhaengig von jeder Zeitzone. */
export function tagPlus(tag: string, tage: number): string {
  const [jahr, monat, t] = tag.split("-").map(Number);
  return new Date(Date.UTC(jahr!, monat! - 1, t! + tage)).toISOString().slice(0, 10);
}

/**
 * Stuft einen Punkt ein. Ueberfaellig ist ein reines Datum erst am Folgetag
 * (eine Frist "heute" gilt den ganzen Tag), ein Zeitpunkt sobald er vorbei ist.
 */
export function bewertePunkt(roh: TagesPunktRoh, jetzt: Date, zeitzone: string = betriebsZeitzone): TagesPunkt {
  const heute = tagInZone(jetzt, zeitzone);
  const tag = terminTag(roh.faelligAm, zeitzone);
  let ueberfaellig = false;
  if (roh.faelligAm && tag) {
    ueberfaellig = NUR_TAG.test(roh.faelligAm)
      ? tag < heute
      : (terminZeit(roh.faelligAm, zeitzone) ?? Infinity) < jetzt.getTime();
  }
  let stufe: PunktStufe;
  if (roh.verstoss || ueberfaellig) stufe = 1;
  else if (roh.hinweis || !tag) stufe = 4;
  else if (tag <= heute) stufe = 2;
  else stufe = 3;

  return {
    id: roh.id,
    art: roh.art,
    titel: roh.titel,
    detail: roh.detail,
    faelligAm: roh.faelligAm,
    ueberfaellig,
    stufe,
    wer: roh.wer,
    ziel: roh.ziel,
    ...(roh.anzahl !== undefined ? { anzahl: roh.anzahl } : {}),
  };
}

/**
 * Reihenfolge wie risikoSortieren (lib/domain/risikoradar.ts): Ueberfaelliges
 * zuerst, nach Alter (aeltester zuerst), dann Heutiges, dann Baldiges nach
 * Naehe - in beiden Faellen aufsteigend nach Zeit. Ein Verstoss ohne Termin
 * gehoert zum Ueberfaelligen, hinter die datierten. Hinweise stehen am Ende.
 * Bei Gleichstand entscheidet die Stufe, danach die Kennung (stabil).
 */
export function sortierePunkte(punkte: TagesPunkt[], zeitzone: string = betriebsZeitzone): TagesPunkt[] {
  const gruppe = (p: TagesPunkt) => (p.stufe === 1 ? 0 : p.stufe === 2 ? 1 : p.stufe === 3 ? 2 : 3);
  return [...punkte].sort((a, b) => {
    const g = gruppe(a) - gruppe(b);
    if (g !== 0) return g;
    const az = terminZeit(a.faelligAm, zeitzone);
    const bz = terminZeit(b.faelligAm, zeitzone);
    if (az !== bz) {
      if (az === null) return 1;
      if (bz === null) return -1;
      return az - bz;
    }
    if (a.stufe !== b.stufe) return a.stufe - b.stufe;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface TagesZaehler {
  ueberfaellig: number;
  heute: number;
  bald: number;
}

export function zaehlePunkte(punkte: TagesPunkt[]): TagesZaehler {
  return {
    ueberfaellig: punkte.filter((p) => p.stufe === 1).length,
    heute: punkte.filter((p) => p.stufe === 2).length,
    bald: punkte.filter((p) => p.stufe === 3).length,
  };
}

export interface TagesAuswahl {
  heute: string;
  zaehler: TagesZaehler;
  punkte: TagesPunkt[];
  /** Wie viele Punkte hinter maxPunkte abgeschnitten wurden. */
  weitere: number;
}

/**
 * Aus allen Rohpunkten die Auswahl: einstufen, alles jenseits des Horizonts
 * weglassen (Hinweise ohne Termin bleiben), sortieren, auf maxPunkte kuerzen.
 * Der Zaehler zaehlt ueber alle Punkte im Horizont, nicht nur ueber die
 * gezeigten - "3 von 11 ueberfaelligen" soll sagbar bleiben.
 */
export function waehlePunkte(
  roh: TagesPunktRoh[],
  optionen: { jetzt: Date; horizontTage: number; maxPunkte: number; zeitzone?: string },
): TagesAuswahl {
  const zeitzone = optionen.zeitzone ?? betriebsZeitzone;
  const heute = tagInZone(optionen.jetzt, zeitzone);
  const ende = tagPlus(heute, optionen.horizontTage);
  // Doppelte Kennungen (dieselbe Frist aus zwei Quellen) nur einmal.
  const gesehen = new Set<string>();
  const bewertet: TagesPunkt[] = [];
  for (const r of roh) {
    if (gesehen.has(r.id)) continue;
    gesehen.add(r.id);
    const punkt = bewertePunkt(r, optionen.jetzt, zeitzone);
    const tag = terminTag(punkt.faelligAm, zeitzone);
    if (tag && tag > ende && punkt.stufe !== 1) continue;
    bewertet.push(punkt);
  }
  const sortiert = sortierePunkte(bewertet, zeitzone);
  const punkte = sortiert.slice(0, optionen.maxPunkte);
  return { heute, zaehler: zaehlePunkte(sortiert), punkte, weitere: sortiert.length - punkte.length };
}

// ---- Laufzeit ------------------------------------------------------------------------------

export const QUELLE_ZEITGRENZE_MS = 4000;

export class Zeitueberschreitung extends Error {
  constructor() {
    super("zeitueberschreitung");
  }
}

/** Wartet hoechstens `ms` auf ein Versprechen. Danach zaehlt die Quelle als ausgefallen, das Werkzeug liefert trotzdem. */
export function mitZeitgrenze<T>(versprechen: Promise<T>, ms: number = QUELLE_ZEITGRENZE_MS): Promise<T> {
  let uhr: ReturnType<typeof setTimeout> | undefined;
  const grenze = new Promise<never>((_, ablehnen) => {
    uhr = setTimeout(() => ablehnen(new Zeitueberschreitung()), ms);
  });
  return Promise.race([versprechen, grenze]).finally(() => clearTimeout(uhr));
}

/** Eintrag unter luecken: Quelle und Grund als Kennung, keine Satzsprache. */
export function lueckeFuer(quelle: TagesQuelle, grund: unknown): string {
  if (grund === "vorschau" || grund === "ohne-profil") return `${quelle}:${grund}`;
  return `${quelle}:${grund instanceof Zeitueberschreitung ? "zeitueberschreitung" : "fehler"}`;
}

/**
 * Laedt alle Quellen gleichzeitig, jede mit Zeitgrenze. Was ausfaellt, steht
 * unter luecken; die uebrigen Punkte kommen trotzdem.
 */
export async function sammleQuellen(
  lader: Partial<Record<TagesQuelle, () => Promise<TagesPunktRoh[]>>>,
  ms: number = QUELLE_ZEITGRENZE_MS,
): Promise<{ roh: TagesPunktRoh[]; luecken: string[] }> {
  const eintraege = Object.entries(lader) as [TagesQuelle, () => Promise<TagesPunktRoh[]>][];
  const ergebnisse = await Promise.allSettled(
    eintraege.map(([, laden]) => mitZeitgrenze(Promise.resolve().then(laden), ms)),
  );
  const roh: TagesPunktRoh[] = [];
  const luecken: string[] = [];
  ergebnisse.forEach((ergebnis, i) => {
    const quelle = eintraege[i]![0];
    if (ergebnis.status === "fulfilled") roh.push(...ergebnis.value);
    else luecken.push(lueckeFuer(quelle, ergebnis.reason));
  });
  return { roh, luecken };
}

// ---- Kuehlkette ----------------------------------------------------------------------------

/** Die 60-Minuten-Regel (initial_schema.sql, kuehlketten_messungen). */
export const KUEHL_GRENZE_MINUTEN = 60;
/** Ab hier gehoert eine wartende Charge in die Tageslage: noch zu retten, aber knapp. */
export const KUEHL_NAH_MINUTEN = 45;

/**
 * Eine Charge ohne Vorkuehlung: wie lange sie schon wartet und wann die
 * Grenze reisst. null, solange sie noch nicht nahe an der Grenze ist.
 */
export function kuehlTermin(
  pflueckZeitpunkt: string,
  jetzt: Date,
): { minuten: number; faelligAm: string } | null {
  const gepflueckt = Date.parse(pflueckZeitpunkt);
  if (!Number.isFinite(gepflueckt)) return null;
  const minuten = Math.floor((jetzt.getTime() - gepflueckt) / 60_000);
  if (minuten < KUEHL_NAH_MINUTEN) return null;
  return { minuten, faelligAm: new Date(gepflueckt + KUEHL_GRENZE_MINUTEN * 60_000).toISOString() };
}

// ---- Kennzahlen ----------------------------------------------------------------------------

export const MAX_KENNZAHLEN = 2;

/**
 * Hoechstens zwei auffaellige Kennzahlen der Rolle: nur gemessene (kein
 * unterschriebener Platzhalter, der ist keine Nachricht fuer heute) und nur
 * verfehlt oder knapp, die am weitesten daneben zuerst (nurAuffaellige).
 */
export function auffaelligeKennzahlen(
  rolle: Role,
  liste: Kpi[],
  max: number = MAX_KENNZAHLEN,
): { kpi: Kpi; auswertung: Zielauswertung }[] {
  const { kern, erweitert } = kpisFuerRolle(rolle, liste);
  return nurAuffaellige([...kern, ...erweitert])
    .map((kpi) => ({ kpi, auswertung: zielAuswerten(kpi) }))
    .filter(({ auswertung }) => !auswertung.platzhalter && (auswertung.stand === "verfehlt" || auswertung.stand === "knapp"))
    .slice(0, max);
}

// ---- Pruefbericht -------------------------------------------------------------------------

/**
 * Termin einer Massnahme aus dem Pruefbericht. "sofort" gilt am Tag des
 * Berichts, "7 Tage" eine Woche danach. Laengere Fristen gehoeren nicht in die
 * Tageslage (null).
 */
export function massnahmeTermin(frist: string, erstelltAm: string, zeitzone: string = betriebsZeitzone): string | null {
  const tag = terminTag(erstelltAm, zeitzone);
  if (!tag) return null;
  if (frist === "sofort") return tag;
  if (frist === "7 Tage") return tagPlus(tag, 7);
  return null;
}

export const MAX_BERICHT_PUNKTE = 3;

/**
 * Bis zu drei Prioritaeten (als Hinweis) und bis zu drei Massnahmen mit Frist
 * "sofort" oder "7 Tage" aus dem juengsten Pruefbericht. Massnahmen der
 * eigenen Rolle zuerst. Der Bericht ist gespeichertes JSON - jedes Feld wird
 * geprueft, bevor es gelesen wird, und alle Texte sind Daten.
 */
export function pruefberichtPunkte(
  zeile: { id: string; erstelltAm: string; bericht: unknown },
  rolle: Role,
  kuerze: (text: string) => string,
  ziel: string,
): TagesPunktRoh[] {
  const bericht = (zeile.bericht ?? {}) as { prioritaeten?: unknown; massnahmen?: unknown };
  const prioritaeten = Array.isArray(bericht.prioritaeten)
    ? bericht.prioritaeten.filter((p): p is string => typeof p === "string" && p.trim() !== "")
    : [];
  const massnahmen = (Array.isArray(bericht.massnahmen) ? bericht.massnahmen : [])
    .filter(
      (m): m is { befundId?: unknown; titel?: unknown; schritt?: unknown; verantwortlich?: unknown; frist: string } =>
        typeof m === "object" && m !== null && typeof (m as { frist?: unknown }).frist === "string",
    )
    .map((m, index) => ({ m, index, termin: massnahmeTermin(m.frist, zeile.erstelltAm) }))
    .filter((x): x is typeof x & { termin: string } => x.termin !== null)
    .sort((a, b) => Number(b.m.verantwortlich === rolle) - Number(a.m.verantwortlich === rolle) || a.index - b.index)
    .slice(0, MAX_BERICHT_PUNKTE);

  return [
    ...prioritaeten.slice(0, MAX_BERICHT_PUNKTE).map((p, i) => ({
      id: `pruefbericht-${zeile.id}-prioritaet-${i}`,
      art: "pruefbericht" as const,
      titel: kuerze(p),
      detail: null,
      faelligAm: null,
      wer: "Betrieb" as const,
      ziel,
      hinweis: true,
    })),
    ...massnahmen.map(({ m, index, termin }) => ({
      id: `pruefbericht-${zeile.id}-massnahme-${index}`,
      art: "pruefbericht" as const,
      titel: kuerze(typeof m.titel === "string" ? m.titel : ""),
      detail: typeof m.schritt === "string" ? kuerze(m.schritt) : null,
      faelligAm: termin,
      wer: m.verantwortlich === rolle ? ("meine Rolle" as const) : ("Betrieb" as const),
      ziel,
    })),
  ];
}
