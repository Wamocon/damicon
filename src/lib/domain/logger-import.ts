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
//   * Auch gelesen (Exporte von Elpro, LogTag, Testo, Tinytag und aus Excel): zweistelliges Jahr ("14.10.26 08:15"), Bindestrich ("14-10-2026 08:15"),
//     12-Stunden-Zeit mit AM oder PM ("14/10/2026 8:15:00 PM"), Excel-Zeitwerte in der Zeitspalte (46310,34375) und eine Zeitzone im Spaltenkopf
//     ("Time (UTC+6)", "Zeit [UTC]"), die dann fuer die Spalte gilt.
//   * Temperatur mit Punkt oder Komma, mit oder ohne "°C".
// Vorspann (Geraetename, Seriennummer, Einstellungen) vor den Messwerten wird uebersprungen.
//
// Stufe 2: dieselben Werte als JSON (WMCNL-1517). Viele Logger und Cloud-Dienste exportieren so. Gelesen werden:
//   * ein Array von Objekten mit Zeit- und Temperaturfeld ("time", "timestamp", "zeit", "datetime", "t" und Verwandte;
//     "temperature", "temperatur", "temp", "value", "wert", "c"),
//   * ein Objekt, das so ein Array unter "readings", "data", "messwerte", "samples", "records" oder aehnlich traegt,
//   * ein Array von Paaren [Zeit, Temperatur].
// Die Zeit darf Text (wie oben) oder eine Zahl sein: Unix-Sekunden oder Unix-Millisekunden. Die Temperatur darf Zahl oder Text sein.
// Ohne Zeitzonenangabe im Text gilt auch hier die Betriebszeit. Die Pruefung des Zeitfensters ist dieselbe.
//
// Weitere Eigenheiten (15.10.2026, docs/ENTSCHEIDUNGSGRUNDLAGEN.md Kapitel 7):
//   * Kodierung: UTF-8, UTF-16 (mit Byte-Reihenfolge-Marke), Windows-1251 (kyrillische Kopfzeile) und Windows-1252 (Umlaute, "°") werden erkannt
//     (dekodiereLoggerDatei). Der Import dekodiert, bevor er liest.
//   * Zeitzone des Geraets: die Person waehlt sie beim Import (LOGGER_ZEITZONEN); Zeiten mit eigenem Versatz und Spaltenkoepfe mit "UTC+x" gehen vor.
//   * Einheit: Kelvin und Fahrenheit werden in Grad Celsius umgerechnet, aus dem Spaltenkopf ("Temperatur [K]") oder aus einem Feld "unit" im JSON.
//   * elproCLOUD: Eintraege mit sensorId oder deviceId (Felder value, timeStamp, unit) tragen ihre Zeit in UTC, auch ohne Angabe der Zone.
//
// Die Pruefung des Zeitfensters folgt der Regel der Datenbank (geraet_zeitpunkt_pruefen):
// ein Messzeitpunkt darf hoechstens fuenf Minuten in der Zukunft und hoechstens 24 Stunden
// in der Vergangenheit liegen. Aeltere Werte lehnt die Datenbank ab, weil sie eine falsch
// gestellte Geraeteuhr nicht von einer echten Messung unterscheiden kann. Hier werden sie
// vorab aussortiert und gemeldet, damit eine einzige alte Zeile nicht den ganzen Import kippt.

export const LOGGER_MAX_BYTES = 2 * 1024 * 1024;

/** Zeitzonen, die die Person fuer die Uhr des Geraets waehlen kann. Die erste ist die Betriebszeit. */
export const LOGGER_ZEITZONEN = [betriebsZeitzone, "UTC", "Europe/Berlin", "Europe/Moscow"] as const;
export type LoggerZeitzone = (typeof LOGGER_ZEITZONEN)[number];

export function istLoggerZeitzone(wert: string): wert is LoggerZeitzone {
  return (LOGGER_ZEITZONEN as readonly string[]).includes(wert);
}

/**
 * Den Text einer Loggerdatei aus ihren Bytes. UTF-16 erkennt man an der Byte-Reihenfolge-Marke, UTF-8 daran, dass die Bytes gueltiges UTF-8 sind (eine Datei
 * in einer 8-Bit-Kodierung ist es fast nie). Sonst Windows-1251, wenn die Kopfzeile kyrillische Woerter fuer Zeit oder Temperatur traegt, und sonst Windows-1252.
 */
export function dekodiereLoggerDatei(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // keine UTF-8-Datei
  }
  const kyrillisch = new TextDecoder("windows-1251").decode(bytes);
  return /(дата|время|температур)/i.test(kyrillisch) ? kyrillisch : new TextDecoder("windows-1252").decode(bytes);
}
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
const TAG_ZUERST = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AaPp])\.?[Mm]\.?)?$/;
const KOPF_ZONE = /\b(?:UTC|GMT)\s*(?:([+-])\s*(\d{1,2})(?::?(\d{2}))?)?/i;
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
    const [, t, m, jahr, h, min, s = "0", halbtag] = europaeisch;
    // Zweistelliges Jahr: 2000 bis 2099 (Logger gibt es erst seit diesem Jahrhundert).
    const j = jahr.length === 2 ? `20${jahr}` : jahr;
    let stunde = Number(h);
    if (halbtag) {
      // 12-Stunden-Zeit: 12 AM ist Mitternacht, 12 PM Mittag; ausserhalb von 1 bis 12 ist die Angabe unsinnig.
      if (stunde < 1 || stunde > 12) return null;
      stunde = (stunde % 12) + (halbtag.toLowerCase() === "p" ? 12 : 0);
    }
    const wandzeit = `${j}-${zweistellig(m)}-${zweistellig(t)}T${zweistellig(stunde)}:${min}:${zweistellig(s)}`;
    return wandzeitZuUtc(wandzeit, zeitzone)?.toISOString() ?? null;
  }
  return null;
}

/**
 * Ein Excel-Zeitwert (Tage seit dem 30.12.1899, der Bruchteil ist die Uhrzeit) als UTC-ISO, oder null. Nur fuer eine Spalte, die der Kopf als Zeit ausweist:
 * eine nackte Zahl ist sonst auch ein Zaehler. Gueltig sind die Jahre 2000 bis 2099, auf die Sekunde gerundet (die Fliesskommazahl traegt sonst Rauschen).
 */
export function liesExcelZeitpunkt(roh: string, zeitzone: string = betriebsZeitzone): string | null {
  const text = roh.trim().replace(/^"|"$/g, "");
  if (!ZAHL.test(text)) return null;
  const tage = Number(text.replace(",", "."));
  if (!Number.isFinite(tage) || tage < 36526 || tage >= 73051) return null;
  const sekunden = Math.round((tage - 25569) * 86400);
  const wand = new Date(sekunden * 1000).toISOString().slice(0, 19);
  return wandzeitZuUtc(wand, zeitzone)?.toISOString() ?? null;
}

/** Die Zeitzone, die ein Spaltenkopf nennt ("Time (UTC+6)"), sonst die Vorgabe. Nur ganze Stunden von UTC-12 bis UTC+12. */
export function zeitzoneAusKopf(kopf: string, vorgabe: string = betriebsZeitzone): string {
  const treffer = KOPF_ZONE.exec(kopf);
  if (!treffer) return vorgabe;
  const [, vorzeichen, h, min] = treffer;
  if (!vorzeichen) return "UTC";
  const stunden = Number(h);
  if (Number(min ?? 0) !== 0 || stunden > 12) return vorgabe;
  if (stunden === 0) return "UTC";
  // Etc/GMT kehrt das Vorzeichen um: UTC+6 heisst Etc/GMT-6.
  return `Etc/GMT${vorzeichen === "+" ? "-" : "+"}${stunden}`;
}

export type TemperaturEinheit = "C" | "K" | "F";

/** Rechnet in Grad Celsius um; die Pruefung des Bereichs und die Rundung folgen danach. */
const inCelsius = (wert: number, einheit: TemperaturEinheit): number => (einheit === "K" ? wert - 273.15 : einheit === "F" ? ((wert - 32) * 5) / 9 : wert);

function celsiusImBereich(wert: number): number | null {
  if (!Number.isFinite(wert) || wert < TEMPERATUR_MIN || wert > TEMPERATUR_MAX) return null;
  return Math.round(wert * 10) / 10;
}

/** Eine Temperatur mit einer Nachkommastelle, oder null. Punkt oder Komma, "°C" und Leerraum werden verziehen. Kelvin und Fahrenheit werden umgerechnet. */
export function liesTemperatur(roh: string, einheit: TemperaturEinheit = "C"): number | null {
  const text = roh.trim().replace(/^"|"$/g, "").replace(/\s*°?\s*[cC]$/, "").trim();
  if (!ZAHL.test(text)) return null;
  return celsiusImBereich(inCelsius(Number(text.replace(",", ".")), einheit));
}

/** Die Einheit, die ein Spaltenkopf nennt ("Temperatur [K]", "Temp. (°F)"), sonst Celsius. */
export function einheitAusKopf(kopf: string): TemperaturEinheit {
  const treffer = /[[(]\s*°?\s*([CFK])\s*[\])]/i.exec(kopf) ?? /°\s*([CF])\b/i.exec(kopf);
  const e = treffer?.[1]?.toUpperCase();
  return e === "K" || e === "F" ? e : "C";
}

/** Die Einheit aus einem JSON-Feld ("K", "°C", "degF", "Kelvin"), oder null bei einer unbekannten Angabe. Fehlt sie, gilt Celsius. */
function einheitAusJson(roh: unknown): TemperaturEinheit | null {
  if (roh === undefined || roh === null || roh === "") return "C";
  if (typeof roh !== "string") return null;
  const e = roh.trim().replace(/^°/, "").toUpperCase();
  if (e === "C" || e === "CELSIUS" || e === "DEGC") return "C";
  if (e === "K" || e === "KELVIN") return "K";
  if (e === "F" || e === "FAHRENHEIT" || e === "DEGF") return "F";
  return null;
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

// elproCLOUD und Verwandte tragen die Kennung des Geraets oder Sensors im Eintrag; ihre Zeit ist UTC.
const JSON_GERAET = /^(sensorid|deviceid|sensor_id|device_id)$/i;
const JSON_EINHEIT = /^(unit|einheit|units)$/i;

// --- JSON ------------------------------------------------------------------------------------------------------------------------

const JSON_ZEIT = /^(zeit|zeitpunkt|time|timestamp|ts|date|datetime|datum|t|at|gemessen_am|measured_at|recorded_at|created_at)$/i;
const JSON_TEMP = /^(temperatur|temperature|temp|value|wert|c|celsius|temperature_c|temperatur_c|temp_c|degc)$/i;
const JSON_LISTEN = /^(messwerte|messungen|readings|data|samples|records|measurements|points|werte|items|results)$/i;

/** Ein Zeitpunkt aus JSON: Text wie in der CSV-Datei, oder eine Zahl als Unix-Sekunden oder Unix-Millisekunden. */
function jsonZeit(wert: unknown, zeitzone: string): string | null {
  if (typeof wert === "string") return liesZeitpunkt(wert, zeitzone);
  if (typeof wert === "number" && Number.isFinite(wert) && wert > 0) {
    // Ab 10^11 sind es Millisekunden (Sekunden erreichen das erst im Jahr 5138).
    const ms = wert >= 1e11 ? wert : wert * 1000;
    const datum = new Date(ms);
    return Number.isNaN(datum.getTime()) ? null : datum.toISOString();
  }
  return null;
}

function jsonTemperatur(wert: unknown, einheit: TemperaturEinheit = "C"): number | null {
  if (typeof wert === "number") return celsiusImBereich(inCelsius(wert, einheit));
  return typeof wert === "string" ? liesTemperatur(wert, einheit) : null;
}

/** Das Array der Messwerte in einem JSON-Wert: er selbst, oder das erste passende Feld eines Objekts (auch eine Ebene tiefer). */
function messwerteListe(wert: unknown, tiefe = 0): unknown[] | null {
  if (Array.isArray(wert)) return wert;
  if (typeof wert !== "object" || wert === null || tiefe > 1) return null;
  const objekt = wert as Record<string, unknown>;
  for (const [schluessel, inhalt] of Object.entries(objekt)) {
    if (JSON_LISTEN.test(schluessel) && Array.isArray(inhalt)) return inhalt;
  }
  for (const inhalt of Object.values(objekt)) {
    const tiefer = messwerteListe(inhalt, tiefe + 1);
    if (tiefer) return tiefer;
  }
  return null;
}

/** Liest Messwerte aus einem JSON-Text. Kein JSON oder keine Liste: leeres Ergebnis. */
export function liesLoggerJson(inhalt: string, zeitzone: string = betriebsZeitzone): LoggerGelesen {
  const leer: LoggerGelesen = { messwerte: [], ungueltig: 0, trennzeichen: null };
  let wert: unknown;
  try {
    wert = JSON.parse(inhalt.replace(/^﻿/, ""));
  } catch {
    return leer;
  }
  const liste = messwerteListe(wert);
  if (!liste) return leer;
  // Eine Einheit am Objekt um die Liste (zum Beispiel {"unit": "K", "readings": [...]}) gilt fuer alle Eintraege ohne eigene.
  const einheitAmObjekt =
    typeof wert === "object" && wert !== null && !Array.isArray(wert) ? Object.entries(wert as Record<string, unknown>).find(([k, v]) => JSON_EINHEIT.test(k) && typeof v === "string")?.[1] : undefined;

  const messwerte: LoggerMesswert[] = [];
  let ungueltig = 0;
  for (const eintrag of liste) {
    let zeitRoh: unknown;
    let tempRoh: unknown;
    let einheitRoh: unknown = einheitAmObjekt;
    let eintragZone = zeitzone;
    if (Array.isArray(eintrag)) {
      [zeitRoh, tempRoh] = eintrag;
    } else if (typeof eintrag === "object" && eintrag !== null) {
      const felder = Object.entries(eintrag as Record<string, unknown>);
      zeitRoh = felder.find(([k]) => JSON_ZEIT.test(k))?.[1];
      tempRoh = felder.find(([k]) => JSON_TEMP.test(k))?.[1];
      einheitRoh = felder.find(([k]) => JSON_EINHEIT.test(k))?.[1] ?? einheitAmObjekt;
      if (felder.some(([k]) => JSON_GERAET.test(k))) eintragZone = "UTC";
    }
    const einheit = einheitAusJson(einheitRoh);
    const zeitpunkt = jsonZeit(zeitRoh, eintragZone);
    // Eine unbekannte Einheit wird nicht erraten: der Eintrag zaehlt als unlesbar.
    const temperatur = einheit === null ? null : jsonTemperatur(tempRoh, einheit);
    if (zeitpunkt !== null && temperatur !== null) messwerte.push({ zeitpunkt, temperaturC: temperatur });
    else ungueltig += 1;
  }
  return { messwerte, ungueltig, trennzeichen: "json" };
}

export function liesLoggerDatei(inhalt: string, zeitzone: string = betriebsZeitzone): LoggerGelesen {
  // JSON erkennt man am ersten Zeichen; ein JSON-Text, der keine Messwerte traegt, faellt auf die Zeilenlesart zurueck.
  if (/^[﻿\s]*[[{]/.test(inhalt)) {
    const json = liesLoggerJson(inhalt, zeitzone);
    if (json.trennzeichen !== null && (json.messwerte.length > 0 || json.ungueltig > 0)) return json;
  }
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
  // Nennt der Kopf der Zeitspalte eine Zeitzone, gilt sie fuer die ganze Spalte (Zeiten mit eigenem Versatz behalten ihren).
  const kopfFelder = festeSpalten ? felderVon(zeilen[kopfIndex], trenner) : [];
  const zone = festeSpalten ? zeitzoneAusKopf(kopfFelder[festeSpalten.zeit] ?? "", zeitzone) : zeitzone;
  const einheit = festeSpalten ? einheitAusKopf(kopfFelder[festeSpalten.temperatur] ?? "") : "C";
  for (let i = kopfIndex + 1; i < zeilen.length; i++) {
    const felder = felderVon(zeilen[i], trenner);
    const zeitFeld = festeSpalten ? felder[festeSpalten.zeit] : felder.find((f) => liesZeitpunkt(f, zone) !== null);
    // Excel-Zeitwerte nur in einer Spalte, die der Kopf als Zeit ausweist.
    const zeitpunkt = zeitFeld === undefined ? null : (liesZeitpunkt(zeitFeld, zone) ?? (festeSpalten ? liesExcelZeitpunkt(zeitFeld, zone) : null));
    let temperatur: number | null = null;
    if (zeitpunkt !== null) {
      if (festeSpalten) {
        temperatur = liesTemperatur(felder[festeSpalten.temperatur] ?? "", einheit);
      } else {
        // Ohne Kopfzeile: die erste Zahl hinter dem Zeitfeld.
        const nach = felder.slice(felder.indexOf(zeitFeld as string) + 1);
        temperatur = nach.map((f) => liesTemperatur(f)).find((t) => t !== null) ?? null;
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
