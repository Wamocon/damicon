import { betriebsZeitzone } from "@/lib/domain/tageszeit";
import { wandzeitZuUtc } from "@/lib/listen/zeitraum";

// Temperaturlogger im Transport (WMCNL-1517, Stufe 1): die Messwerte eines
// Loggers aus seiner CSV-Datei lesen. Rein, ohne Datenbank; die Aktion
// (lib/actions/logger-import.ts) schreibt, was hier gelesen und geprueft wurde.
//
// Warum eine Datei und keine Geraeteanbindung: Loggerhersteller liefern ihre
// Werte als CSV, die man am Fahrzeug oder im Buero ausliest. Das geht heute, mit
// jedem Geraet, ohne Schnittstelle. Eine direkte Anbindung (Bluetooth, Cloud
// des Herstellers) braucht ein bestimmtes Geraet und gehoert in Stufe 2.
//
// Gelesen wird tolerant, geprueft streng:
//   * Trennzeichen Semikolon, Tab, Komma oder senkrechter Strich, erkannt am Inhalt.
//   * Kopfzeile optional; Spalten nach Namen (Zeit, Time, Datum, Temperatur, Temp,
//     °C, Дата, Время, Температура) oder, ohne Kopfzeile, nach der Form der Werte.
//   * Zeit als ISO ("2026-10-14 08:15:00", mit T, mit Z oder Versatz) oder
//     tag-zuerst ("14.10.2026 08:15", "14/10/2026 08:15:00"). Ohne Angabe gilt die
//     Betriebszeit Almaty. Monat-zuerst ("10/14/2026") wird nicht erraten: bei einer
//     Schreibweise, die beides sein koennte, gilt tag-zuerst, wie in Kasachstan.
//   * Temperatur mit Punkt oder Komma, mit oder ohne "°C".
// Vorspann (Geraetename, Seriennummer, Einstellungen) vor den Messwerten wird uebersprungen.
//
// Die Pruefung des Zeitfensters folgt der Regel der Datenbank (geraet_zeitpunkt_pruefen):
// ein Messzeitpunkt darf hoechstens fuenf Minuten in der Zukunft und hoechstens 24 Stunden
// in der Vergangenheit liegen. Aeltere Werte lehnt die Datenbank ab, weil sie eine falsch
// gestellte Geraeteuhr nicht von einer echten Messung unterscheiden kann. Hier werden sie
// vorab aussortiert und gemeldet, damit eine einzige alte Zeile nicht den ganzen Import kippt.

export const LOGGER_MAX_BYTES = 2 * 1024 * 1024;
/** So viele Messwerte nimmt ein Import hoechstens an (eine Minute Takt ueber 24 Stunden sind 1440). */
export const LOGGER_MAX_MESSWERTE = 5000;
export const TEMPERATUR_MIN = -50;
export const TEMPERATUR_MAX = 80;

// Etwas enger als die Grenzen der Datenbank (24 Stunden, 5 Minuten): zwischen Lesen und
// Schreiben vergeht Zeit, und ein Wert genau an der Grenze wuerde sonst im Insert abgelehnt.
export const FENSTER_VERGANGENHEIT_MS = 23 * 3_600_000 + 50 * 60_000;
export const FENSTER_ZUKUNFT_MS = 4 * 60_000;

export interface LoggerMesswert {
  /** Messzeitpunkt, UTC, ISO 8601. */
  zeitpunkt: string;
  /** Eine Nachkommastelle, wie numeric(4,1) in der Datenbank. */
  temperaturC: number;
}

export interface LoggerGelesen {
  messwerte: LoggerMesswert[];
  /** Zeilen mit Daten, die sich nicht lesen liessen (kein Zeitpunkt, keine Zahl, Wert ausserhalb des Bereichs). */
  ungueltig: number;
  trennzeichen: string | null;
}

const TRENNER = [";", "\t", ",", "|"] as const;
const ZEIT_NAMEN = /^(zeit|zeitpunkt|time|timestamp|date|datum|datetime|date\/time|дата|время|дата\/время)/i;
const TEMP_NAMEN = /(temp|°c|\bt\b|температур)/i;

// Datum mit Uhrzeit. Die Uhrzeit ist Pflicht: ein Logger misst mehrmals am Tag.
const ISO = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const TAG_ZUERST = /^(\d{1,2})[./](\d{1,2})[./](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const ZAHL = /^[-+]?\d+(?:[.,]\d+)?$/;

const zweistellig = (n: number | string) => String(n).padStart(2, "0");

/** Ein Zeitpunkt als UTC-ISO, oder null. Ohne Zeitzonenangabe gilt die Betriebszeit. */
export function liesZeitpunkt(roh: string, zeitzone: string = betriebsZeitzone): string | null {
  const text = roh.trim().replace(/^"|"$/g, "");
  const iso = ISO.exec(text);
  if (iso) {
    const [, j, m, t, h, min, s = "00", versatz] = iso;
    const wandzeit = `${j}-${m}-${t}T${h}:${min}:${s}`;
    if (!versatz) return wandzeitZuUtc(wandzeit, zeitzone)?.toISOString() ?? null;
    // Mit Angabe: als UTC lesen und den Versatz abziehen.
    const utc = wandzeitZuUtc(wandzeit, "UTC");
    if (!utc) return null;
    if (versatz.toUpperCase() === "Z") return utc.toISOString();
    const vorzeichen = versatz.startsWith("-") ? -1 : 1;
    const ziffern = versatz.replace(/[+-]|:/g, "");
    const minutenVersatz = vorzeichen * (Number(ziffern.slice(0, 2)) * 60 + Number(ziffern.slice(2, 4)));
    return new Date(utc.getTime() - minutenVersatz * 60_000).toISOString();
  }
  const europaeisch = TAG_ZUERST.exec(text);
  if (europaeisch) {
    const [, t, m, j, h, min, s = "0"] = europaeisch;
    const wandzeit = `${j}-${zweistellig(m)}-${zweistellig(t)}T${zweistellig(h)}:${min}:${zweistellig(s)}`;
    return wandzeitZuUtc(wandzeit, zeitzone)?.toISOString() ?? null;
  }
  return null;
}

/** Eine Temperatur mit einer Nachkommastelle, oder null. Punkt oder Komma, "°C" und Leerraum werden verziehen. */
export function liesTemperatur(roh: string): number | null {
  const text = roh.trim().replace(/^"|"$/g, "").replace(/\s*°?\s*[cC]$/, "").trim();
  if (!ZAHL.test(text)) return null;
  const wert = Number(text.replace(",", "."));
  if (!Number.isFinite(wert) || wert < TEMPERATUR_MIN || wert > TEMPERATUR_MAX) return null;
  return Math.round(wert * 10) / 10;
}

/** Das Trennzeichen, bei dem die meisten Zeilen dieselbe Spaltenzahl (mindestens zwei) haben. */
function erkenneTrennzeichen(zeilen: readonly string[]): string | null {
  const probe = zeilen.slice(0, 40);
  let bestes: { zeichen: string; punkte: number } | null = null;
  for (const zeichen of TRENNER) {
    const zaehler = new Map<number, number>();
    for (const z of probe) {
      const n = z.split(zeichen).length;
      if (n >= 2) zaehler.set(n, (zaehler.get(n) ?? 0) + 1);
    }
    const punkte = Math.max(0, ...zaehler.values());
    // Bei Gleichstand gewinnt das, was zuerst in der Liste steht: Semikolon und Tab vor Komma,
    // denn ein Komma steckt auch in jeder Dezimalzahl.
    if (punkte > 0 && (!bestes || punkte > bestes.punkte)) bestes = { zeichen, punkte };
  }
  return bestes?.zeichen ?? null;
}

/** Zeile in Felder zerlegen; Anfuehrungszeichen um ein Feld werden entfernt. */
function felderVon(zeile: string, trenner: string): string[] {
  return zeile.split(trenner).map((f) => f.trim().replace(/^"(.*)"$/, "$1"));
}

function spalten(felder: readonly string[]): { zeit: number; temperatur: number } | null {
  const zeit = felder.findIndex((f) => ZEIT_NAMEN.test(f.trim()));
  const temperatur = felder.findIndex((f, i) => i !== zeit && TEMP_NAMEN.test(f.trim()));
  return zeit >= 0 && temperatur >= 0 ? { zeit, temperatur } : null;
}

export function liesLoggerDatei(inhalt: string, zeitzone: string = betriebsZeitzone): LoggerGelesen {
  const zeilen = inhalt
    .replace(/^﻿/, "")
    .split(/\r\n|\n|\r/)
    .map((z) => z.trim())
    .filter((z) => z !== "" && !z.startsWith("#"));
  const trenner = erkenneTrennzeichen(zeilen);
  if (!trenner) return { messwerte: [], ungueltig: 0, trennzeichen: null };

  // Spalten aus der Kopfzeile, falls es eine gibt: die erste Zeile, in der beide Namen vorkommen.
  let festeSpalten: { zeit: number; temperatur: number } | null = null;
  let kopfIndex = -1;
  for (let i = 0; i < Math.min(zeilen.length, 40); i++) {
    festeSpalten = spalten(felderVon(zeilen[i], trenner));
    if (festeSpalten) {
      kopfIndex = i;
      break;
    }
  }

  const messwerte: LoggerMesswert[] = [];
  let ungueltig = 0;
  let datenBegonnen = false;
  for (let i = kopfIndex + 1; i < zeilen.length; i++) {
    const felder = felderVon(zeilen[i], trenner);
    const zeitFeld = festeSpalten ? felder[festeSpalten.zeit] : felder.find((f) => liesZeitpunkt(f, zeitzone) !== null);
    const zeitpunkt = zeitFeld === undefined ? null : liesZeitpunkt(zeitFeld, zeitzone);
    let temperatur: number | null = null;
    if (zeitpunkt !== null) {
      if (festeSpalten) {
        temperatur = liesTemperatur(felder[festeSpalten.temperatur] ?? "");
      } else {
        // Ohne Kopfzeile: die erste Zahl hinter dem Zeitfeld.
        const nach = felder.slice(felder.indexOf(zeitFeld as string) + 1);
        temperatur = nach.map(liesTemperatur).find((t) => t !== null) ?? null;
      }
    }
    if (zeitpunkt !== null && temperatur !== null) {
      messwerte.push({ zeitpunkt, temperaturC: temperatur });
      datenBegonnen = true;
    } else if (datenBegonnen || (zeitpunkt !== null && temperatur === null)) {
      // Vorspann vor den ersten Messwerten ist kein Fehler; ab dem ersten gelesenen Wert zaehlt jede
      // unlesbare Zeile mit, und eine Zeile mit Zeitpunkt, aber ohne Temperatur ebenfalls.
      ungueltig += 1;
    }
  }
  return { messwerte, ungueltig, trennzeichen: trenner };
}

export interface LoggerAuswahl {
  /** Zu uebernehmen, nach Zeit sortiert, ohne Doppelte. */
  uebernehmen: LoggerMesswert[];
  zuAlt: number;
  inDerZukunft: number;
  /** Schon in der Datei doppelt oder schon in der Datenbank vorhanden. */
  doppelt: number;
}

/**
 * Welche gelesenen Werte in die Datenbank duerfen: im Zeitfenster der Datenbank, nicht schon
 * vorhanden, hoechstens LOGGER_MAX_MESSWERTE. Bei mehr Werten bleiben die neuesten.
 */
export function waehleMesswerte(
  messwerte: readonly LoggerMesswert[],
  jetzt: Date,
  vorhandene: ReadonlySet<string> = new Set(),
): LoggerAuswahl {
  const alt = jetzt.getTime() - FENSTER_VERGANGENHEIT_MS;
  const neu = jetzt.getTime() + FENSTER_ZUKUNFT_MS;
  let zuAlt = 0;
  let inDerZukunft = 0;
  let doppelt = 0;
  const gesehen = new Set(vorhandene);
  const bleibt: LoggerMesswert[] = [];
  for (const m of [...messwerte].sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt))) {
    const t = Date.parse(m.zeitpunkt);
    if (t < alt) zuAlt += 1;
    else if (t > neu) inDerZukunft += 1;
    else if (gesehen.has(m.zeitpunkt)) doppelt += 1;
    else {
      gesehen.add(m.zeitpunkt);
      bleibt.push(m);
    }
  }
  return { uebernehmen: bleibt.slice(-LOGGER_MAX_MESSWERTE), zuAlt, inDerZukunft, doppelt };
}
