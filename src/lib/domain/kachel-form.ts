import { zielAuswerten } from "@/lib/domain/zielstand";
import type { Kpi } from "@/lib/domain/kpis";

// Welche Darstellung eine Kennzahl bekommt.
//
// Bis September 2026 trugen alle vierzehn Baseline-Kennzahlen dieselbe
// Kachel: Zahl, Trendpfeil, Zielband, Ampelpunkt. Fuer einen Anteil gegen
// ein Ziel passt das. Fuer eine Null-Fehler-Quote nicht - bei Ziel 100 %
// steht der Balken immer auf der Zielmarke und unterscheidet nichts. Fuer
// eine Quote ueber fuenf Personen nicht - "60 %" ist dort Scheingenauigkeit.
// Fuer eine Kennzahl ohne Zielwert erst recht nicht - Band, Ampelpunkt und
// Statuswort bleiben leer.
//
// Diese Datei ist die EINZIGE Stelle, an der die Form gewaehlt wird.
// Uebersicht und Bereichsseite fragen dieselbe Funktion, sonst zeigte
// dieselbe Kennzahl je nach Seite etwas anderes.

export type Kachelform =
  /** Wert gegen eine Zielmarke. Eingefaerbt ist der erlaubte Bereich. */
  | "meter"
  /** Null-Fehler-Quote: gezaehlt wird die Ausnahme, nicht der Anteil. */
  | "zaehler"
  /** Kleine Grundgesamtheit: "3 von 5" statt "60 %". */
  | "punkte"
  /** Verteilung: ein Punkt je Vorgang. Braucht Breite und die Einzelwerte. */
  | "streifen"
  /** Die eine Zahl, die eine Ansicht fuehrt. Hoechstens eine je Ansicht. */
  | "held"
  /** Nur die Zahl - es gibt nichts, wogegen sie sich vergleichen liesse. */
  | "wert";

/**
 * Wie viel Platz die Kachel hat.
 *
 * "schmal" ist die Zonenkarte der Uebersicht: bei drei Spalten rund 145 px
 * breit. Dort ist ein Punktstreifen nicht lesbar und eine Heldenzahl sprengt
 * das Raster. "breit" ist die Bereichsseite, die ueber die volle Seite geht.
 */
export type Kachelplatz = "schmal" | "breit";

/**
 * Die Form fuer diese Kennzahl an diesem Platz.
 *
 * Die Kennzahl darf sich eine Form wuenschen (Kpi.form). Ob sie sie bekommt,
 * entscheidet sich hier: ohne Zielzahl kein Meter, ohne Grundgesamtheit kein
 * Zaehler, ohne Einzelwerte kein Streifen, auf schmalem Platz kein Streifen
 * und keine Heldenzahl. Jede Abstufung endet bei einer Form, die mit den
 * vorhandenen Daten ehrlich ist.
 */
export function kachelform(
  kpi: Kpi,
  platz: Kachelplatz = "schmal",
  hatVerteilung = false,
): Kachelform {
  const { soll } = zielAuswerten(kpi);
  const zaehlbar = (kpi.gerechnet?.datensaetze ?? 0) > 0;

  // Ohne Zielzahl gibt es nichts zu vergleichen - dann steht da die Zahl und
  // sonst nichts. Ein Band ohne Marke waere eine Behauptung ueber ein Ziel,
  // das niemand gesetzt hat.
  const grundform: Kachelform = soll !== null ? "meter" : "wert";
  let form = kpi.form ?? grundform;

  // Zaehler und Punkte brauchen die Grundgesamtheit. Sie steckt in
  // kpi_aktuell().datensaetze - bei esutdAbdeckung die Zahl der Pfluecker,
  // bei behandlungenWartezeit die Zahl der Behandlungen. Fehlt sie, ist die
  // Kennzahl ein Platzhalter und die Form faellt zurueck.
  if ((form === "zaehler" || form === "punkte") && !zaehlbar) {
    form = grundform;
  }

  // Der Streifen zeigt die Werte HINTER der Kennzahl. Wer sie nicht mitgibt,
  // bekommt ihn nicht - eine erfundene Verteilung waere schlimmer als keine.
  if (form === "streifen" && !hatVerteilung) form = grundform;

  if (platz === "schmal" && (form === "streifen" || form === "held")) {
    form = grundform;
  }

  // Letzte Bremse: ein Meter ohne Zielzahl ist keiner.
  if (form === "meter" && soll === null) form = "wert";

  return form;
}

/**
 * Die Grundgesamtheit hinter einer Prozentkennzahl, als "x von y".
 *
 * Der Anteil wurde in kpi_aktuell() aus genau dieser Zahl gerechnet, deshalb
 * laesst er sich ohne zweite Abfrage in die Anzahl zuruecknehmen. Bei
 * esutdAbdeckung mit 60 % ueber fuenf Pflueckern kommen drei heraus - und
 * "3 von 5" sagt mehr als "60 %", weil eine Person zwanzig Punkte sind.
 */
export function grundgesamtheit(
  kpi: Kpi,
): { erfuellt: number; gesamt: number } | null {
  const gesamt = kpi.gerechnet?.datensaetze ?? 0;
  if (!kpi.gerechnet || gesamt <= 0) return null;
  if (kpi.gerechnet.einheit !== "%") return null;
  const erfuellt = Math.round((kpi.gerechnet.zahl / 100) * gesamt);
  return { erfuellt: Math.min(erfuellt, gesamt), gesamt };
}

/**
 * Obergrenze der Skala fuer das Meter.
 *
 * Die Skala endet hinter dem groesseren von Ist und Ziel, damit ein knapp
 * verfehltes Ziel nicht am Rand klebt und der Balken bei einer deutlichen
 * Ueberschreitung nicht anschlaegt. Prozentwerte im oberen Bereich enden bei
 * 100 - dort sind zwei Kacheln nebeneinander dadurch vergleichbar. Bei
 * kleinen Prozentwerten waere dieselbe Skala dagegen verschenkt.
 */
export function meterSkala(ist: number, soll: number, einheit: string): number {
  const groesster = Math.max(ist, soll);
  // Prozent bis 100 nur, wenn die Werte den oberen Bereich ueberhaupt
  // erreichen. Sonst schrumpft eine Verlustquote von 7,7 % gegen ein Ziel
  // von 6 % auf ein Zwoelftel des Balkens, und die Zielmarke klebt am linken
  // Rand - die Skala sagt dann mehr ueber die Einheit als ueber die Zahl.
  if (einheit === "%" && groesster >= 50 && groesster <= 100) return 100;
  // Auf glatte Schritte runden, damit die Achsenbeschriftung eine Zahl nennt,
  // die man auch vorlesen wuerde.
  const roh = groesster * 1.25;
  const stufe = Math.pow(10, Math.floor(Math.log10(roh)));
  return Math.ceil(roh / (stufe / 2)) * (stufe / 2);
}
