// Kalenderdateien im Format iCalendar (RFC 5545), rein und ohne Abhaengigkeiten.
// Gebaut fuer den Lieferplan (domain/lieferplan.ts); wer einen weiteren Kalender
// braucht (zum Beispiel den Pflueckplan), nutzt dieselben Bausteine.
//
// Die Regeln, an denen Kalenderprogramme scheitern, wenn man sie verletzt:
//   * Zeilen enden mit CRLF, auch die letzte.
//   * Eine Zeile hat hoechstens 75 Oktette. Laengere werden gefaltet: Zeilenumbruch,
//     dann ein Leerzeichen am Anfang der Folgezeile. Gezaehlt wird in Bytes, nicht in
//     Zeichen: ein kyrillischer Buchstabe sind zwei Bytes, und ein Zeichen darf beim
//     Falten nicht mitten im Byte geteilt werden.
//   * In Textwerten sind Backslash, Semikolon, Komma und Zeilenumbruch maskiert.

export const ICS_ZEILENENDE = "\r\n";
const MAX_OKTETTE = 75;
const kodiere = new TextEncoder();

/** Maskiert einen Textwert (SUMMARY, DESCRIPTION, ...). Zeilenumbrueche werden zu \n. */
export function icsText(wert: string): string {
  return wert
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Faltet eine Zeile auf hoechstens 75 Oktette je Teil; Folgezeilen beginnen mit einem Leerzeichen. */
export function icsFalten(zeile: string): string {
  if (kodiere.encode(zeile).length <= MAX_OKTETTE) return zeile;
  const teile: string[] = [];
  let aktuell = "";
  let laenge = 0;
  // Die Folgezeilen tragen ein Leerzeichen vorn, das mitzaehlt: dort bleiben 74 Oktette.
  let grenze = MAX_OKTETTE;
  for (const zeichen of zeile) {
    const bytes = kodiere.encode(zeichen).length;
    if (laenge + bytes > grenze) {
      teile.push(aktuell);
      aktuell = "";
      laenge = 0;
      grenze = MAX_OKTETTE - 1;
    }
    aktuell += zeichen;
    laenge += bytes;
  }
  teile.push(aktuell);
  return teile.join(`${ICS_ZEILENENDE} `);
}

/** "2026-10-14" wird "20261014". */
export function icsTag(tag: string): string {
  return tag.replace(/-/g, "");
}

/** "2026-10-14" plus ein Tag, als "2026-10-15": das Ende eines ganztaegigen Termins ist der Folgetag. */
export function folgetag(tag: string): string {
  const [jahr, monat, t] = tag.split("-").map(Number);
  return new Date(Date.UTC(jahr, monat - 1, t + 1)).toISOString().slice(0, 10);
}

/** Zeitstempel in UTC: "20261014T101030Z". */
export function icsZeitstempel(zeitpunkt: Date): string {
  return zeitpunkt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export type IcsZustand = "TENTATIVE" | "CONFIRMED" | "CANCELLED";

export interface IcsTermin {
  /** Stabil ueber alle Abrufe: derselbe Termin behaelt seine Kennung, und ein Import legt ihn nicht doppelt an. */
  uid: string;
  /** Ganztaegiger Termin am Tag "JJJJ-MM-TT". */
  tag: string;
  titel: string;
  beschreibung?: string;
  zustand: IcsZustand;
}

/** Baut die Datei. Die Reihenfolge der Termine bleibt, wie sie uebergeben wird. */
export function icsKalender(
  termine: readonly IcsTermin[],
  optionen: { jetzt: Date; name: string; produkt: string },
): string {
  const stempel = icsZeitstempel(optionen.jetzt);
  const zeilen: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${optionen.produkt}`,
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsText(optionen.name)}`,
  ];
  for (const t of termine) {
    zeilen.push(
      "BEGIN:VEVENT",
      `UID:${t.uid}`,
      `DTSTAMP:${stempel}`,
      `DTSTART;VALUE=DATE:${icsTag(t.tag)}`,
      `DTEND;VALUE=DATE:${icsTag(folgetag(t.tag))}`,
      `SUMMARY:${icsText(t.titel)}`,
      ...(t.beschreibung ? [`DESCRIPTION:${icsText(t.beschreibung)}`] : []),
      `STATUS:${t.zustand}`,
      // Ein Liefertermin blockiert den Kalender nicht: der Tag bleibt "frei" fuer Besprechungen.
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  zeilen.push("END:VCALENDAR");
  return zeilen.map(icsFalten).join(ICS_ZEILENENDE) + ICS_ZEILENENDE;
}
