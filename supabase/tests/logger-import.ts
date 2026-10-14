// Temperaturlogger (WMCNL-1517, Stufe 1): CSV-Dateien lesen und das Zeitfenster der Datenbank einhalten
// (src/lib/domain/logger-import.ts). Die Datenbankseite prueft logger-import-db.mts.
//
// Aufruf: npm run test:logger-import (ueber tsx, damit die @/-Pfade aufloesen).

import {
  FENSTER_VERGANGENHEIT_MS,
  FENSTER_ZUKUNFT_MS,
  LOGGER_MAX_MESSWERTE,
  liesLoggerDatei,
  liesLoggerJson,
  liesTemperatur,
  liesZeitpunkt,
  waehleMesswerte,
  type LoggerMesswert,
} from "@/lib/domain/logger-import";

let fehlgeschlagen = 0;
function pruefe(name: string, ok: boolean, zusatz = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${zusatz ? "  - " + zusatz : ""}`);
  if (!ok) fehlgeschlagen++;
}

// --- 1. Zeitpunkte -------------------------------------------------------------------------------------
const zeit = (roh: string) => liesZeitpunkt(roh);
pruefe("Zeit: ohne Angabe gilt Almaty (UTC+5)", zeit("2026-10-14 08:15:00") === "2026-10-14T03:15:00.000Z", String(zeit("2026-10-14 08:15:00")));
pruefe("Zeit: mit T und ohne Sekunden", zeit("2026-10-14T08:15") === "2026-10-14T03:15:00.000Z");
pruefe("Zeit: mit Z ist es UTC", zeit("2026-10-14T08:15:00Z") === "2026-10-14T08:15:00.000Z");
pruefe("Zeit: mit Versatz +05:00 und -03:00", zeit("2026-10-14T08:15:00+05:00") === "2026-10-14T03:15:00.000Z" && zeit("2026-10-14T08:15:00-03:00") === "2026-10-14T11:15:00.000Z");
pruefe("Zeit: Millisekunden werden verziehen", zeit("2026-10-14 08:15:00.123") === "2026-10-14T03:15:00.000Z");
pruefe("Zeit: tag-zuerst mit Punkt", zeit("14.10.2026 08:15") === "2026-10-14T03:15:00.000Z");
pruefe("Zeit: tag-zuerst mit Schraegstrich und Sekunden", zeit("14/10/2026 08:15:30") === "2026-10-14T03:15:30.000Z");
pruefe("Zeit: einstelliger Tag und Monat", zeit("5.6.2026 7:05") === "2026-06-05T02:05:00.000Z", String(zeit("5.6.2026 7:05")));
pruefe("Zeit: bei beidem moeglich gilt tag-zuerst (05/06 ist der 5. Juni)", zeit("05/06/2026 10:00") === "2026-06-05T05:00:00.000Z");
pruefe("Zeit: Monat-zuerst wird nicht erraten (13. Monat gibt es nicht)", zeit("10/14/2026 08:15") === null);
pruefe("Zeit: Anfuehrungszeichen um das Feld", zeit('"2026-10-14 08:15:00"') === "2026-10-14T03:15:00.000Z");
pruefe("Zeit: ohne Uhrzeit ist ungueltig", zeit("2026-10-14") === null && zeit("14.10.2026") === null);
pruefe("Zeit: unmoegliche Daten sind ungueltig", zeit("2026-13-01 10:00") === null && zeit("2026-02-30 10:00") === null && zeit("32.10.2026 10:00") === null && zeit("2026-10-14 25:00") === null);
pruefe("Zeit: Text und leer sind ungueltig", zeit("gestern") === null && zeit("") === null);

// --- 2. Temperaturen ----------------------------------------------------------------------------------------
const temp = (roh: string) => liesTemperatur(roh);
pruefe("Temperatur: Komma und Punkt", temp("3,5") === 3.5 && temp("3.5") === 3.5);
pruefe("Temperatur: gerundet auf eine Nachkommastelle", temp("3.54") === 3.5 && temp("3.56") === 3.6 && temp("-0.04") === -0);
pruefe("Temperatur: negativ, mit Plus, ganze Zahl", temp("-1,2") === -1.2 && temp("+4") === 4 && temp("7") === 7);
pruefe("Temperatur: mit Einheit", temp("3,5 °C") === 3.5 && temp("3.5°C") === 3.5 && temp("3.5 C") === 3.5 && temp("-2°c") === -2);
pruefe("Temperatur: Text und leer sind ungueltig", temp("n/a") === null && temp("") === null && temp("3,5,1") === null && temp("--") === null);
pruefe("Temperatur: ausserhalb von -50 bis 80 ist ungueltig (Geraetefehler)", temp("81") === null && temp("-51") === null && temp("-50") === -50 && temp("80") === 80 && temp("999") === null);

// --- 3. Dateien -----------------------------------------------------------------------------------------------------
{
  const csv = "Zeit;Temperatur (°C)\r\n14.10.2026 08:00;3,5\r\n14.10.2026 08:01;3,6\r\n14.10.2026 08:02;4,1\r\n";
  const r = liesLoggerDatei(csv);
  pruefe("Datei: Semikolon, Kopfzeile, Dezimalkomma, Windows-Zeilenenden", r.messwerte.length === 3 && r.trennzeichen === ";" && r.ungueltig === 0 && r.messwerte[2].temperaturC === 4.1, JSON.stringify(r.messwerte[2]));
  pruefe("Datei: die Zeit ist UTC", r.messwerte[0].zeitpunkt === "2026-10-14T03:00:00.000Z");
}
{
  const r = liesLoggerDatei("Time,Temperature\n2026-10-14 08:00:00,3.5\n2026-10-14 08:01:00,3.6\n");
  pruefe("Datei: Komma als Trennzeichen mit Punkt als Dezimalzeichen", r.messwerte.length === 2 && r.trennzeichen === "," && r.messwerte[1].temperaturC === 3.6, JSON.stringify(r));
}
{
  const r = liesLoggerDatei("2026-10-14 08:00:00\t3.5\n2026-10-14 08:01:00\t3.6\n");
  pruefe("Datei: Tabulator ohne Kopfzeile, Spalten nach der Form der Werte", r.messwerte.length === 2 && r.trennzeichen === "\t" && r.messwerte[0].temperaturC === 3.5);
}
{
  const csv = "Geraet;Logger 17\nSeriennummer;A-4711\n\nZeit;Temperatur\n14.10.2026 08:00;3,5\n14.10.2026 08:01;3,6\n";
  const r = liesLoggerDatei(csv);
  pruefe("Datei: Vorspann mit Geraetedaten wird uebersprungen", r.messwerte.length === 2 && r.ungueltig === 0, JSON.stringify(r));
}
{
  const csv = "# Export 14.10.2026\nZeit;Temperatur\n14.10.2026 08:00;3,5\n";
  pruefe("Datei: Kommentarzeilen mit # werden uebersprungen", liesLoggerDatei(csv).messwerte.length === 1);
}
{
  const r = liesLoggerDatei("Дата;Температура\n14.10.2026 08:00;3,5\n14.10.2026 08:01;3,7\n");
  pruefe("Datei: kyrillische Spaltennamen", r.messwerte.length === 2 && r.messwerte[1].temperaturC === 3.7);
}
{
  const r = liesLoggerDatei("Zeit;Luftfeuchte;Temperatur\n14.10.2026 08:00;80;3,5\n14.10.2026 08:01;81;3,6\n");
  pruefe("Datei: die Temperaturspalte wird nach dem Namen gefunden, nicht die erste Zahl", r.messwerte.length === 2 && r.messwerte[0].temperaturC === 3.5, JSON.stringify(r.messwerte));
}
{
  const r = liesLoggerDatei("Date/Time,Temp(C),Humidity\n2026-10-14 08:00:00,3.5,80\n");
  pruefe("Datei: Date/Time und Temp(C)", r.messwerte.length === 1 && r.messwerte[0].temperaturC === 3.5);
}
{
  const csv = "﻿Zeit;Temperatur\n14.10.2026 08:00;3,5\n";
  pruefe("Datei: eine Byte-Order-Markierung am Anfang stoert nicht", liesLoggerDatei(csv).messwerte.length === 1);
}
{
  const csv = "Zeit;Temperatur\n14.10.2026 08:00;3,5\n14.10.2026 08:01;n/a\n14.10.2026 08:02;\nkaputt;4\n14.10.2026 08:03;3,6\n";
  const r = liesLoggerDatei(csv);
  pruefe("Datei: unlesbare Zeilen werden gezaehlt, die lesbaren bleiben", r.messwerte.length === 2 && r.ungueltig === 3, `gelesen ${r.messwerte.length}, ungueltig ${r.ungueltig}`);
}
{
  const r = liesLoggerDatei("14.10.2026 08:00;999\n14.10.2026 08:01;3,5\n");
  pruefe("Datei: ein Geraetefehler (999) zaehlt als ungueltig", r.messwerte.length === 1 && r.ungueltig === 1);
}
{
  pruefe("Datei: leer", liesLoggerDatei("").messwerte.length === 0 && liesLoggerDatei("   \n\n").messwerte.length === 0);
  pruefe("Datei: eine einzelne Spalte ohne Trennzeichen", liesLoggerDatei("hallo\nwelt\n").trennzeichen === null);
  pruefe("Datei: ein Text ohne Messwerte liefert nichts", liesLoggerDatei("Dies ist keine Logger-Datei;sondern Text\nmit zwei;Zeilen\n").messwerte.length === 0);
}
{
  const zeilen = ["Zeit;Temperatur"];
  for (let i = 0; i < 1440; i++) zeilen.push(`14.10.2026 ${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")};3,${i % 10}`);
  const r = liesLoggerDatei(zeilen.join("\n"));
  pruefe("Datei: ein ganzer Tag im Minutentakt (1440 Werte)", r.messwerte.length === 1440 && r.ungueltig === 0, `Werte ${r.messwerte.length}`);
}

// --- 3b. JSON (Stufe 2) --------------------------------------------------------------------------------------------------
{
  const objekte = JSON.stringify([{ time: "2026-10-14T08:00:00Z", temperature: 3.5 }, { time: "2026-10-14T08:01:00Z", temperature: "3,6" }, { time: "2026-10-14T08:02:00Z", temperature: 4.14 }]);
  const r = liesLoggerDatei(objekte);
  pruefe("JSON: ein Array von Objekten, Zahl und Text als Temperatur, gerundet", r.messwerte.length === 3 && r.trennzeichen === "json" && r.ungueltig === 0 && r.messwerte[1].temperaturC === 3.6 && r.messwerte[2].temperaturC === 4.1 && r.messwerte[0].zeitpunkt === "2026-10-14T08:00:00.000Z", JSON.stringify(r.messwerte));
  const verpackt = JSON.stringify({ device: "TL-4711", readings: [{ timestamp: "14.10.2026 08:00", value: 2.9 }, { timestamp: "14.10.2026 08:01", value: 3.1 }] });
  const v = liesLoggerDatei(verpackt);
  pruefe("JSON: die Liste steht unter readings, Zeit tag-zuerst gilt als Almaty-Zeit", v.messwerte.length === 2 && v.messwerte[0].zeitpunkt === "2026-10-14T03:00:00.000Z", JSON.stringify(v));
  const tiefer = liesLoggerJson(JSON.stringify({ export: { datenpunkte: 1, data: [{ zeit: "2026-10-14 08:00:00", temperatur: 5 }] } }));
  pruefe("JSON: eine Ebene tiefer wird gefunden", tiefer.messwerte.length === 1 && tiefer.messwerte[0].zeitpunkt === "2026-10-14T03:00:00.000Z");
  const paare = liesLoggerDatei(JSON.stringify([["2026-10-14T08:00:00Z", 3.5], ["2026-10-14T08:01:00Z", 3.7]]));
  pruefe("JSON: Paare aus Zeit und Temperatur", paare.messwerte.length === 2 && paare.messwerte[1].temperaturC === 3.7);
  const unix = liesLoggerDatei(JSON.stringify([{ t: 1_760_428_800, c: 3.5 }, { t: 1_760_428_860_000, c: 3.6 }]));
  pruefe("JSON: Unix-Sekunden und Unix-Millisekunden", unix.messwerte.length === 2 && unix.messwerte[0].zeitpunkt === "2025-10-14T08:00:00.000Z" && unix.messwerte[1].zeitpunkt === "2025-10-14T08:01:00.000Z", JSON.stringify(unix.messwerte));
  const gemischt = liesLoggerDatei(JSON.stringify([{ time: "2026-10-14T08:00:00Z", temperature: 3.5 }, { time: "kein Datum", temperature: 3 }, { time: "2026-10-14T08:02:00Z", temperature: 999 }, { time: "2026-10-14T08:03:00Z" }, 42, null]));
  pruefe("JSON: unlesbare Eintraege werden gezaehlt, nicht uebernommen (kein Datum, Wert ausser Bereich, ohne Temperatur, kein Objekt)", gemischt.messwerte.length === 1 && gemischt.ungueltig === 5, JSON.stringify([gemischt.messwerte.length, gemischt.ungueltig]));
  pruefe("JSON: kein JSON oder keine Liste ergibt nichts, ohne Wurf", liesLoggerJson("{kaputt").messwerte.length === 0 && liesLoggerJson('{"a":1}').messwerte.length === 0 && liesLoggerJson('"text"').messwerte.length === 0 && liesLoggerJson("").trennzeichen === null);
  pruefe("JSON: eine Datei mit Kodierungsmarke wird gelesen", liesLoggerDatei("\uFEFF" + objekte).messwerte.length === 3);
  const csvMitKlammer = liesLoggerDatei("[Geraet];TL-4711\nZeit;Temperatur\n14.10.2026 08:00;3,5\n14.10.2026 08:01;3,6\n");
  pruefe("JSON: eine CSV-Datei, deren Vorspann mit einer Klammer beginnt, bleibt eine CSV-Datei", csvMitKlammer.messwerte.length === 2 && csvMitKlammer.trennzeichen === ";");
  const leereListe = liesLoggerDatei("[]");
  pruefe("JSON: eine leere Liste ergibt keine Messwerte", leereListe.messwerte.length === 0);
}

// --- 4. Zeitfenster der Datenbank ------------------------------------------------------------------------------------
const JETZT = new Date("2026-10-14T10:00:00Z");
const messwert = (minutenVorJetzt: number, t = 3.5): LoggerMesswert => ({ zeitpunkt: new Date(JETZT.getTime() - minutenVorJetzt * 60_000).toISOString(), temperaturC: t });
{
  const a = waehleMesswerte([messwert(10), messwert(60), messwert(600)], JETZT);
  pruefe("Fenster: Werte der letzten Stunden werden uebernommen", a.uebernehmen.length === 3 && a.zuAlt === 0 && a.inDerZukunft === 0);
  pruefe("Fenster: nach Zeit sortiert", a.uebernehmen[0].zeitpunkt < a.uebernehmen[2].zeitpunkt);
}
{
  const a = waehleMesswerte([messwert(24 * 60 + 5), messwert(23 * 60 + 40), messwert(30)], JETZT);
  pruefe("Fenster: aelter als 24 Stunden wird ausgelassen, knapp darunter (mit Sicherheitsabstand) bleibt", a.zuAlt === 1 && a.uebernehmen.length === 2, `zuAlt ${a.zuAlt}, bleibt ${a.uebernehmen.length}`);
}
pruefe("Fenster: die Grenzen sind enger als die der Datenbank (24 Stunden, 5 Minuten)", FENSTER_VERGANGENHEIT_MS < 24 * 3_600_000 && FENSTER_ZUKUNFT_MS < 5 * 60_000);
{
  const a = waehleMesswerte([messwert(-3), messwert(-10), messwert(5)], JETZT);
  pruefe("Fenster: drei Minuten in der Zukunft sind erlaubt (Geraeteuhr), zehn nicht", a.inDerZukunft === 1 && a.uebernehmen.length === 2, `Zukunft ${a.inDerZukunft}`);
}
{
  const a = waehleMesswerte([messwert(10), messwert(10), messwert(20)], JETZT);
  pruefe("Fenster: doppelte Zeitpunkte in der Datei zaehlen einmal", a.uebernehmen.length === 2 && a.doppelt === 1);
}
{
  const vorhanden = new Set([messwert(10).zeitpunkt]);
  const a = waehleMesswerte([messwert(10), messwert(20)], JETZT, vorhanden);
  pruefe("Fenster: ein Wert, der schon in der Datenbank steht, wird nicht doppelt gespeichert (erneuter Import)", a.uebernehmen.length === 1 && a.doppelt === 1);
}
{
  const viele: LoggerMesswert[] = [];
  for (let i = 0; i < LOGGER_MAX_MESSWERTE + 100; i++) viele.push({ zeitpunkt: new Date(JETZT.getTime() - (i + 1) * 1000).toISOString(), temperaturC: 3.5 });
  const a = waehleMesswerte(viele, JETZT);
  pruefe("Obergrenze: hoechstens 5000 Werte, bei mehr bleiben die neuesten", a.uebernehmen.length === LOGGER_MAX_MESSWERTE && a.uebernehmen.at(-1)?.zeitpunkt === viele[0].zeitpunkt);
}
pruefe("Leere Eingabe", waehleMesswerte([], JETZT).uebernehmen.length === 0);

console.log("");
if (fehlgeschlagen > 0) {
  console.error(`${fehlgeschlagen} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle Pruefungen bestanden.");
