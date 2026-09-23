"use client";

// Die Diagramme der Wirtschaftlichkeitsseite. Einzige Client-Insel der Seite.
//
// Warum getrennt: recharts rendert ueber ResponsiveContainer, und der misst
// die Breite erst im Browser. Serverseitig kommt ein leeres div heraus, nicht
// ein halbes Diagramm. Jede Zahl steht deshalb serverseitig in ihrer Kachel,
// das Diagramm ist Zugabe - gleiches Verhaeltnis wie MwstMesser im
// Compliance-Cockpit (components/db/mwst-messer.tsx).
//
// Die Container tragen aria-hidden: die Zahl daneben wird ohnehin vorgelesen,
// eine Kurve ohne Textalternative waere fuer Screenreader nur Rauschen.
//
// Farben ausschliesslich ueber --chart-1 bis --chart-5 (DESIGN.md Regel 1).
// Bewusst nur vier der fuenf Tokens: mehr Reihen als noetig einzufaerben
// kostet den 3:1-Kontrast, den DESIGN.md fuer Grafik verlangt.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Monatspunkt } from "@/lib/domain/wirtschaftlichkeit";

/** Alle Beschriftungen kommen als Prop - der Client holt keine Uebersetzungen. */
export interface Diagrammtexte {
  monat: string;
  wert: string;
  jahr: string;
  nulllinie: string;
}

/** Gemeinsame Hoehe. Ohne feste Hoehe kollabiert ResponsiveContainer auf null. */
const HOEHE = "h-44 w-full";

// Achsenbreite ist keine Geschmacksfrage: recharts beschneidet zu schmale
// Beschriftungen links, ohne zu warnen. Bei width 48 wurde aus "-80 Mio."
// ein "80 Mio." und aus "240 Mio." ein "40 Mio." - eine Achse, die das
// Vorzeichen verschluckt, ist schlimmer als gar keine. Die Breiten sind an
// der laengsten vorkommenden Beschriftung gemessen.
/** Reicht fuer "-240 Mio." in allen vier Sprachen. */
const ACHSE_GELD = 72;
/** Reicht fuer "-105 %". */
const ACHSE_PROZENT = 54;

function kompakt(locale: string, wert: number): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(wert);
}

function prozent(locale: string, anteil: number): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(anteil);
}

/**
 * ROI-Kurve. Dieselbe Reihe traegt beide ROI-Kennzahlen; die Jahr-1-Kachel
 * bekommt sie ueber zwoelf Monate, die Drei-Jahres-Kachel ueber
 * sechsunddreissig. Die Marke sagt, welcher Zeitpunkt gemeint ist.
 */
export function RoiKurve({
  punkte,
  markeMonat,
  locale,
  texte,
}: {
  punkte: Monatspunkt[];
  markeMonat: number;
  locale: string;
  texte: Diagrammtexte;
}) {
  const config = { wert: { label: texte.wert, color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <div aria-hidden="true">
      <ChartContainer config={config} className={HOEHE}>
        <LineChart data={punkte} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          {/* Ueber drei Jahre jedes Jahr beschriften, ueber ein Jahr jedes
              Quartal - sonst traegt die Jahr-1-Achse nur zwei Marken. */}
          <XAxis
            dataKey="monat"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            interval={punkte.length > 24 ? 11 : 2}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={ACHSE_PROZENT}
            tickFormatter={(w: number) => prozent(locale, w)}
          />
          <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
          <ReferenceLine x={markeMonat} stroke="var(--chart-3)" strokeDasharray="4 3" />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <Line dataKey="wert" type="monotone" stroke="var(--color-wert)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

/**
 * Kapitalwert je Monat, monatlich diskontiert. Beginnt beim negativen CAPEX
 * und schneidet die Nulllinie spaeter als der reine Zahlungsstrom - das ist
 * der Unterschied, den die Abzinsung ausmacht.
 */
export function Barwert({
  punkte,
  nulldurchgang,
  locale,
  texte,
}: {
  punkte: Monatspunkt[];
  nulldurchgang: number | null;
  locale: string;
  texte: Diagrammtexte;
}) {
  const config = { wert: { label: texte.wert, color: "var(--chart-4)" } } satisfies ChartConfig;
  return (
    <div aria-hidden="true">
      <ChartContainer config={config} className={HOEHE}>
        <AreaChart data={punkte} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="monat" tickLine={false} axisLine={false} tickMargin={6} interval={11} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={ACHSE_GELD}
            tickFormatter={(w: number) => kompakt(locale, w)}
          />
          <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
          {nulldurchgang !== null ? (
            <ReferenceLine
              x={nulldurchgang}
              stroke="var(--chart-3)"
              strokeDasharray="4 3"
              label={{ value: texte.nulllinie, position: "insideTopRight", fontSize: 11 }}
            />
          ) : null}
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <Area
            dataKey="wert"
            type="monotone"
            stroke="var(--color-wert)"
            fill="var(--color-wert)"
            fillOpacity={0.18}
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

export interface StapelTeil {
  name: string;
  wert: number;
  /** true faerbt den Teil in der Betonungsfarbe statt in der Grundfarbe. */
  betont: boolean;
}

/**
 * CAPEX und die drei OPEX-Jahre als Bausteine des TCO. Dieselbe Reihe traegt
 * die CAPEX- und die OPEX-Kachel, betont wird jeweils der eigene Anteil.
 */
export function TcoStapel({
  teile,
  locale,
  texte,
}: {
  teile: StapelTeil[];
  locale: string;
  texte: Diagrammtexte;
}) {
  const config = { wert: { label: texte.wert, color: "var(--chart-2)" } } satisfies ChartConfig;
  return (
    <div aria-hidden="true">
      <ChartContainer config={config} className={HOEHE}>
        <BarChart data={teile} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={6} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={ACHSE_GELD}
            tickFormatter={(w: number) => kompakt(locale, w)}
          />
          <ChartTooltip content={<ChartTooltipContent indicator="dashed" />} />
          <Bar dataKey="wert" radius={4}>
            {teile.map((teil, i) => (
              <Cell key={`${teil.name}-${i}`} fill={teil.betont ? "var(--chart-1)" : "var(--chart-2)"} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/**
 * Vollkosten je Kilogramm, vorher gegen nachher. Beide Werte sind bis auf
 * Weiteres geschaetzt: die vermarktete Menge steht nirgends im System, und
 * die Senkung je Kilogramm ist aus dem angenommenen Jahresnutzen abgeleitet.
 * Die Kachel traegt deshalb die Markierung "geschaetzt".
 */
export function KostenJeKilogramm({
  vorher,
  nachher,
  locale,
  texte,
  beschriftung,
}: {
  vorher: number;
  nachher: number;
  locale: string;
  texte: Diagrammtexte;
  beschriftung: { vorher: string; nachher: string };
}) {
  const daten = [
    { name: beschriftung.vorher, wert: vorher, betont: false },
    { name: beschriftung.nachher, wert: nachher, betont: true },
  ];
  const config = { wert: { label: texte.wert, color: "var(--chart-5)" } } satisfies ChartConfig;
  return (
    <div aria-hidden="true">
      <ChartContainer config={config} className={HOEHE}>
        <BarChart data={daten} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={6} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={ACHSE_GELD}
            tickFormatter={(w: number) => kompakt(locale, w)}
          />
          <ChartTooltip content={<ChartTooltipContent indicator="dashed" />} />
          <Bar dataKey="wert" radius={4}>
            {daten.map((d) => (
              <Cell key={d.name} fill={d.betont ? "var(--chart-3)" : "var(--chart-5)"} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
