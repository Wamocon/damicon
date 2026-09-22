"use client";

// Alternative Darstellungsformen fuer Kennzahlen, zum Vergleich im
// Kachel-Labor (/dashboard/kachel-labor).
//
// Warum ueberhaupt andere Formen: die KennzahlBox zeigt jede der vierzehn
// Baseline-Kennzahlen gleich - Zahl, Trendpfeil, Zielband, Ampelpunkt. Fuer
// einen Anteil gegen ein Ziel passt das. Fuer ein Verhaeltnis, eine
// Dauerverteilung, eine Null-Fehler-Quote oder eine Kennzahl ganz ohne
// Zielwert passt es nicht.
//
// Regeln, die hier durchgehalten werden:
//   * Eine Skala setzt Marken, Striche und Beschriftung. Jede Beschriftung
//     nennt einen Wert, den die Zeichnung auch erreicht.
//   * Duenne Marken, keine gestrichelten Linien, 2px Abstand zwischen
//     Flaechen statt eines Rahmens darum.
//   * Statusfarbe kommt nie allein - immer mit Wort oder Symbol daneben.
//   * Grosse freistehende Zahlen tragen proportionale Ziffern. tabular-nums
//     gehoert in Spalten, in denen Zahlen untereinander fluchten.
//
// Keine dieser Formen braucht eine Diagrammbibliothek: es ist je eine Skala
// und ein paar Marken. Erst eine echte Zeitreihe mit Achsen, Zoom und
// Mehrfachauswahl waere ein Grund, eine dazuzunehmen.

import { useFormatter } from "next-intl";
import { cn } from "@/lib/utils";
import type { Zielstand } from "@/lib/domain/zielstand";

const flaeche: Record<Zielstand, string> = {
  verfehlt: "bg-destructive",
  knapp: "bg-warning",
  erfuellt: "bg-success",
  offen: "bg-muted-foreground/50",
};

const schrift: Record<Zielstand, string> = {
  verfehlt: "text-destructive",
  knapp: "text-warning",
  erfuellt: "text-success",
  offen: "text-muted-foreground",
};

/** Anteil eines Werts auf der Skala, in Prozent, nie ausserhalb. */
function anteil(wert: number, von: number, bis: number): number {
  if (bis <= von) return 0;
  return Math.min(100, Math.max(0, ((wert - von) / (bis - von)) * 100));
}

/**
 * Meter mit Zielmarke.
 *
 * Der Unterschied zum heutigen Zielband: eingefaerbt ist der ERLAUBTE
 * Bereich, nicht der Wert. Beim heutigen Band waechst die Fuellung mit dem
 * Istwert - bei "je kleiner, desto besser" liest sich das wie Fortschritt und
 * meint das Gegenteil. Die Verlustquote bei 8,4 % zeigte einen laengeren
 * Balken als bei 5 %.
 */
export function Meter({
  ist,
  ziel,
  skalaVon = 0,
  skalaBis,
  gutUnterhalb,
  stand,
  beschriftungVon,
  beschriftungZiel,
  beschriftungBis,
}: {
  ist: number;
  ziel: number;
  skalaVon?: number;
  skalaBis: number;
  /** true = kleiner ist besser, der erlaubte Bereich liegt links vom Ziel. */
  gutUnterhalb: boolean;
  stand: Zielstand;
  beschriftungVon: string;
  beschriftungZiel: string;
  beschriftungBis: string;
}) {
  const istAnteil = anteil(ist, skalaVon, skalaBis);
  const zielAnteil = anteil(ziel, skalaVon, skalaBis);

  return (
    <div className="mt-2">
      <div className="relative h-3.5 rounded bg-primary/10">
        <span
          aria-hidden
          className="absolute top-0 h-full rounded bg-success/15"
          style={
            gutUnterhalb
              ? { left: 0, width: `${zielAnteil}%` }
              : { left: `${zielAnteil}%`, right: 0 }
          }
        />
        <span
          aria-hidden
          className={cn("absolute top-[3px] h-2 rounded", flaeche[stand])}
          style={{ left: 0, width: `${istAnteil}%` }}
        />
        <span
          aria-hidden
          className="absolute -top-[3px] h-5 w-0.5 rounded bg-foreground"
          style={{ left: `${zielAnteil}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{beschriftungVon}</span>
        <span>{beschriftungZiel}</span>
        <span>{beschriftungBis}</span>
      </div>
    </div>
  );
}

/**
 * Punktstreifen: ein Punkt je Vorgang auf einer Skala, dazu die Schwelle.
 *
 * Fuer alles, was die Kachel heute zu einem Mittelwert verdichtet. Die Zeit
 * bis zur Vorkuehlung steht im Schnitt bei 47 min und damit im Ziel - eine
 * Charge lag aber bei 72 min. Bei der Kuehlkette ist genau die einzelne
 * Ueberschreitung der Schaden, und der Mittelwert verschluckt sie.
 */
export function Punktstreifen({
  werte,
  schwelle,
  skalaVon,
  skalaBis,
  gutUnterhalb,
  beschriftungVon,
  beschriftungBis,
  beschriftungSchwelle,
  ausreisserName,
}: {
  werte: { name: string; wert: number }[];
  schwelle: number;
  skalaVon: number;
  skalaBis: number;
  gutUnterhalb: boolean;
  beschriftungVon: string;
  beschriftungBis: string;
  beschriftungSchwelle: string;
  /** Name des auffaelligsten Werts, wird unter seinem Punkt genannt. */
  ausreisserName?: string;
}) {
  const schwellAnteil = anteil(schwelle, skalaVon, skalaBis);
  const ausreisser = gutUnterhalb
    ? werte.reduce((a, b) => (b.wert > a.wert ? b : a), werte[0]!)
    : werte.reduce((a, b) => (b.wert < a.wert ? b : a), werte[0]!);

  return (
    <div className="mt-2">
      <div className="relative h-12">
        <span
          aria-hidden
          className="absolute inset-x-0 top-7 h-px bg-border"
        />
        <span
          aria-hidden
          className="absolute top-5 h-4 rounded bg-success/15"
          style={
            gutUnterhalb
              ? { left: 0, width: `${schwellAnteil}%` }
              : { left: `${schwellAnteil}%`, right: 0 }
          }
        />
        <span
          aria-hidden
          className="absolute top-3 h-8 w-0.5 rounded bg-foreground"
          style={{ left: `${schwellAnteil}%` }}
        />
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground"
          style={{ left: `${schwellAnteil}%` }}
        >
          {beschriftungSchwelle}
        </span>

        {werte.map((eintrag) => {
          const drueber = gutUnterhalb
            ? eintrag.wert > schwelle
            : eintrag.wert < schwelle;
          return (
            <span
              key={eintrag.name}
              title={`${eintrag.name}: ${eintrag.wert}`}
              // 2px Ring in der Kartenfarbe statt eines Rahmens: ueberlappende
              // Punkte bleiben dadurch einzeln erkennbar.
              className={cn(
                "absolute top-[21px] h-3 w-3 -translate-x-1/2 rounded-full ring-2 ring-card",
                drueber ? "bg-destructive" : "bg-primary",
              )}
              style={{ left: `${anteil(eintrag.wert, skalaVon, skalaBis)}%` }}
            />
          );
        })}

        {ausreisserName && ausreisser ? (
          <span
            className="absolute top-9 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground"
            style={{
              left: `${anteil(ausreisser.wert, skalaVon, skalaBis)}%`,
            }}
          >
            {ausreisserName}
          </span>
        ) : null}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{beschriftungVon}</span>
        <span>{beschriftungBis}</span>
      </div>
    </div>
  );
}

/**
 * Rangliste: Name, Balken, Wert.
 *
 * Bei drei bis acht Eintraegen die ehrlichste Form. Sie beantwortet die
 * Frage, die eine Streuungszahl offen laesst - naemlich WER abfaellt.
 */
export function Rangliste({
  zeilen,
  schwelle,
  gutUnterhalb = false,
}: {
  zeilen: { name: string; wert: number }[];
  schwelle: number;
  gutUnterhalb?: boolean;
}) {
  const format = useFormatter();
  const groesster = Math.max(...zeilen.map((z) => z.wert), schwelle);

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {zeilen.map((zeile) => {
        const schwach = gutUnterhalb
          ? zeile.wert > schwelle
          : zeile.wert < schwelle;
        return (
          <div
            key={zeile.name}
            className="grid grid-cols-[minmax(0,1fr)_2fr_auto] items-center gap-2 text-[11px]"
          >
            <span className="truncate text-muted-foreground">{zeile.name}</span>
            <span className="h-2 rounded bg-muted">
              <span
                aria-hidden
                className={cn(
                  "block h-full rounded",
                  schwach ? "bg-warning" : "bg-primary",
                )}
                style={{ width: `${anteil(zeile.wert, 0, groesster)}%` }}
              />
            </span>
            <span className="tabular-nums text-muted-foreground">
              {format.number(zeile.wert, { maximumFractionDigits: 2 })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Zaehler fuer Null-Fehler-Kennzahlen.
 *
 * Ist das Ziel 100 %, steht ein Prozentbalken immer fast voll und
 * unterscheidet nichts: 97 % und 100 % sehen gleich aus, obwohl der
 * Unterschied eine gesperrte Ernte ist. Gefragt ist nicht "wie viel Prozent",
 * sondern "gab es einen Verstoss".
 */
export function Zaehler({
  zahl,
  zeile,
  stand,
}: {
  zahl: number;
  zeile: string;
  stand: Zielstand;
}) {
  return (
    <div className="mt-2 flex flex-1 flex-col justify-center">
      {/* Proportionale Ziffern, kein tabular-nums: gleich breite Ziffern sind
          fuer Spalten gedacht, auf einer freistehenden Zahl wirken sie
          auseinandergezogen. */}
      <p className={cn("text-3xl font-black leading-none", schrift[stand])}>
        {zahl}
      </p>
      <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
        {zeile}
      </p>
    </div>
  );
}

/**
 * Ein Segment je Vorgang.
 *
 * Bis etwa dreissig Vorgaengen lesbar und sagt zusaetzlich, WANN es eng
 * wurde. 2px Abstand zwischen den Flaechen statt eines Rahmens darum.
 */
export function Segmente({
  zustaende,
  beschriftungVon,
  beschriftungBis,
}: {
  zustaende: Zielstand[];
  beschriftungVon: string;
  beschriftungBis: string;
}) {
  return (
    <div className="mt-2">
      <div className="flex gap-0.5">
        {zustaende.map((stand, i) => (
          <span
            // Die Vorgaenge haben keine eigene Kennung in dieser Ansicht, die
            // Reihenfolge ist ihre Identitaet.
            key={i}
            className={cn("h-4 flex-1 rounded-sm", flaeche[stand])}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{beschriftungVon}</span>
        <span>{beschriftungBis}</span>
      </div>
    </div>
  );
}

/**
 * Gefuellte Punkte fuer eine kleine Grundgesamtheit.
 *
 * "60 %" bei fuenf Saisonkraeften ist Scheingenauigkeit - eine Person mehr
 * sind zwanzig Prozentpunkte. Die Punkte machen die Grundgesamtheit sichtbar,
 * man zaehlt, was fehlt, statt es auszurechnen.
 */
export function AnteilPunkte({
  erfuellt,
  gesamt,
  zeile,
}: {
  erfuellt: number;
  gesamt: number;
  zeile: string;
}) {
  const vollstaendig = erfuellt >= gesamt;
  return (
    <div className="mt-2">
      <p className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black leading-none">{erfuellt}</span>
        <span className="text-[11px] font-medium text-muted-foreground">
          {zeile}
        </span>
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {Array.from({ length: gesamt }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-4 w-4 rounded-full border-2",
              i < erfuellt
                ? vollstaendig
                  ? "border-success bg-success"
                  : "border-success bg-success"
                : "border-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Verlaufslinie ohne Achsen, Endpunkt betont.
 *
 * Fuer Kennzahlen ohne Zielwert ist die Bewegung die einzige Aussage, die es
 * ueberhaupt gibt. Braucht mindestens zwei Messpunkte aus kpi_verlauf - mit
 * einem einzigen gibt es keine Linie und die Form faellt aus.
 */
export function Verlaufslinie({
  punkte,
  beschriftungVon,
  beschriftungBis,
  leer,
}: {
  punkte: { tag: string; wert: number }[];
  beschriftungVon: string;
  beschriftungBis: string;
  /** Text, wenn es weniger als zwei Messpunkte gibt. */
  leer: string;
}) {
  if (punkte.length < 2) {
    return (
      <p className="mt-2 flex flex-1 items-center rounded-lg border border-dashed border-border px-2 py-3 text-[10px] leading-4 text-muted-foreground">
        {leer}
      </p>
    );
  }

  const werte = punkte.map((p) => p.wert);
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const breite = 200;
  const hoehe = 40;
  const rand = 5;

  const punkteText = punkte
    .map((p, i) => {
      const x = rand + (i / (punkte.length - 1)) * (breite - rand * 2);
      const y =
        max === min
          ? hoehe / 2
          : hoehe - rand - ((p.wert - min) / (max - min)) * (hoehe - rand * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const letzter = punkteText.split(" ").at(-1)!.split(",");

  return (
    <div className="mt-2">
      <svg
        viewBox={`0 0 ${breite} ${hoehe}`}
        className="block h-10 w-full"
        role="img"
        aria-label={`${punkte.length} Messpunkte, zuletzt ${punkte.at(-1)!.wert}`}
      >
        <polyline
          points={punkteText}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground/45"
        />
        <circle
          cx={letzter[0]}
          cy={letzter[1]}
          r="4"
          className="fill-primary stroke-card"
          strokeWidth="2"
        />
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{beschriftungVon}</span>
        <span>{beschriftungBis}</span>
      </div>
    </div>
  );
}

/**
 * Die eine Zahl, die eine Ansicht fuehrt.
 *
 * Genau eine je Ansicht - sonst ist keine mehr hervorgehoben. Die uebrigen
 * Kennzahlen der Zone bleiben daneben in gewohnter Groesse.
 */
export function Heldenzahl({
  zahl,
  einheit,
  unterzeile,
  stand,
  meter,
}: {
  zahl: string;
  einheit: string;
  unterzeile: string;
  stand: Zielstand;
  meter?: React.ReactNode;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-3">
      <div className="min-w-0">
        <p className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-5xl font-black leading-none tracking-tight",
              schrift[stand],
            )}
          >
            {zahl}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {einheit}
          </span>
        </p>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{unterzeile}</p>
      </div>
      {meter ? <div className="min-w-40 flex-1 pb-1">{meter}</div> : null}
    </div>
  );
}
