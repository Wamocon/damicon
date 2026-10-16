"use client";

// Die Kurve der Wärmesumme seit Jahresbeginn. Einzige Client-Insel der Wetterseite: recharts misst die Breite erst im Browser, serverseitig käme ein leeres div
// heraus. Jede Zahl steht deshalb auch als Text auf der Seite (Kachel und Tabelle), die Kurve ist Zugabe und trägt aria-hidden, wie die Diagramme der
// Wirtschaftlichkeit (wirtschaftlichkeit-diagramme.tsx). Farben nur über --chart-1 bis --chart-5.

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface WaermePunkt {
  /** "JJJJ-MM-TT". */
  datum: string;
  summe: number;
}

export interface WaermeDiagrammtexte {
  /** Reihenname im Tooltip. */
  wert: string;
  /** Beschriftung der Marke an der ersten Ernte. */
  ersteErnte: string;
}

const monat = (locale: string, datum: string) => new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${datum}T00:00:00Z`));
const tag = (locale: string, datum: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${datum}T00:00:00Z`));

export function WaermeVerlauf({ punkte, ersteErnte, locale, texte }: { punkte: WaermePunkt[]; ersteErnte: string | null; locale: string; texte: WaermeDiagrammtexte }) {
  const config = { summe: { label: texte.wert, color: "var(--chart-1)" } } satisfies ChartConfig;
  // Eine Marke je Monatsanfang, sonst steht jeder der rund dreihundert Tage als Beschriftung da.
  const monatsanfaenge = punkte.filter((p) => p.datum.endsWith("-01")).map((p) => p.datum);
  return (
    <div aria-hidden="true">
      <ChartContainer config={config} className="h-56 w-full">
        <AreaChart data={punkte} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="datum" ticks={monatsanfaenge} tickFormatter={(d: string) => monat(locale, d)} tickLine={false} axisLine={false} tickMargin={6} />
          <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(w: number) => new Intl.NumberFormat(locale).format(w)} />
          {ersteErnte ? <ReferenceLine x={ersteErnte} stroke="var(--chart-3)" strokeDasharray="4 3" label={{ value: texte.ersteErnte, position: "insideTopRight", fontSize: 11 }} /> : null}
          <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(d) => tag(locale, String(d))} />} />
          <Area dataKey="summe" type="monotone" stroke="var(--color-summe)" fill="var(--color-summe)" fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
