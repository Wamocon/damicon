import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, Check, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { Beere, type BeerenVariante } from "@/components/site/beere-schale";
import { LoopClip } from "@/components/site/loop-clip";
import { Reveal } from "@/components/site/reveal";
import { beerenNahaufnahme } from "@/lib/site-medien";

// "Warum die Himbeere anders ist" als Bento in zwei Gruppen. Oben die Frucht
// selbst, auf nachtblauem Grund: keine schützende Haut, 60 Minuten bis zur
// Kühlung, eine Beere entwertet die ganze Verkaufsschale. Darunter, auf
// hellem Grund, was daraus für den Ablauf folgt: in die Verkaufsschale
// pflücken, die Qualität im Feld entscheiden, die Pflückdurchgänge als
// Fließband planen.
//
// Jede Kachel zeigt ihr Argument als Bild. Die drei hellen Kacheln haben eine
// gleich hohe Bühne, damit Titel und Text auf einer Linie beginnen und keine
// Kachel unten leer bleibt.
//
// Fotos stehen hier bewusst nicht. Die vorhandenen Aufnahmen tragen bereits
// die Abschnitte Betrieb, Qualität und Bestand, und dasselbe Foto zweimal auf
// einer Seite liest sich als Mangel an Material. Nach dem Makro-Shooting
// (docs/aufnahmeplan.md) können einzelne Kacheln echte Nahaufnahmen bekommen.

// Nachtblau wie in der Qualitätsreferenz. Der feine Rand trennt die Kachel im
// dunklen Farbschema vom gleich dunklen Seitengrund.
const DUNKLE_KACHEL = "rounded-3xl bg-[#04161c] p-6 text-white ring-1 ring-white/10 md:p-8";

function Textblock({ titel, text, hell = false }: { titel: string; text: string; hell?: boolean }) {
  return (
    <>
      <h3 className={`text-lg font-black ${hell ? "text-white" : "text-card-foreground"}`}>
        {titel}
      </h3>
      <p className={`mt-1.5 text-sm leading-6 ${hell ? "text-white/80" : "text-muted-foreground"}`}>
        {text}
      </p>
    </>
  );
}

// Helle Kachel mit Bühne. Die Bühne ist in allen hellen Kacheln gleich hoch,
// die Zeichnungen füllen sie mit festem Seitenverhältnis. Linien und
// Beschriftungen nehmen die Textfarbe der Bühne (currentColor) und tragen
// damit in beiden Farbschemata.
function HelleKachel({
  buehne,
  buehneFarbe = "text-foreground",
  titel,
  text,
  className,
}: {
  buehne: ReactNode;
  buehneFarbe?: string;
  titel: string;
  text: string;
  className: string;
}) {
  return (
    <article className={`flex flex-col rounded-3xl border border-border bg-card p-5 ${className}`}>
      <div
        aria-hidden
        className={`flex h-40 items-center justify-center rounded-2xl bg-secondary/60 p-4 ${buehneFarbe}`}
      >
        {buehne}
      </div>
      <div className="mt-5">
        <Textblock titel={titel} text={text} />
      </div>
    </article>
  );
}

// Verkaufsschale von oben, vier Reihen zu fünf Beeren. Eine läuft aus, und
// der Rand der ganzen Schale ist markiert: Verkauft wird die Schale, nicht
// die einzelne Beere.
const REIHEN = 4;
const SPALTEN = 5;
const RASTER = 26;
const SCHADHAFT = 8; // zweite Reihe, vierte Beere

// Steinfrüchtchen im Kranz um den hohlen Kern, so wie die Beere von oben in
// der Schale liegt.
const KRANZ = Array.from({ length: 7 }, (_, i) => {
  const winkel = (i / 7) * 2 * Math.PI;
  return [Math.cos(winkel) * 6.4, Math.sin(winkel) * 6.4] as const;
});

function SchaleVonOben() {
  const breite = SPALTEN * RASTER + 16;
  const hoehe = REIHEN * RASTER + 16;
  return (
    <svg viewBox={`0 0 ${breite} ${hoehe}`} className="w-full overflow-visible">
      <defs>
        <radialGradient id="svo-beere" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0%" stopColor="#d43a63" />
          <stop offset="100%" stopColor="#b11742" />
        </radialGradient>
      </defs>
      <rect
        x="1.5"
        y="1.5"
        width={breite - 3}
        height={hoehe - 3}
        rx="12"
        fill="#ffffff"
        fillOpacity="0.05"
        stroke="#e8b34a"
        strokeOpacity="0.85"
        strokeWidth="1.5"
        strokeDasharray="6 4"
      />
      {Array.from({ length: REIHEN * SPALTEN }, (_, n) => {
        const cx = 8 + RASTER / 2 + (n % SPALTEN) * RASTER;
        const cy = 8 + RASTER / 2 + Math.floor(n / SPALTEN) * RASTER;
        const schadhaft = n === SCHADHAFT;
        return (
          <g key={n}>
            {schadhaft ? (
              <ellipse cx={cx + 2} cy={cy + 5} rx="14" ry="10" fill="#6d1030" fillOpacity="0.6" />
            ) : null}
            <circle cx={cx} cy={cy} r="10.5" fill={schadhaft ? "#6d1030" : "url(#svo-beere)"} />
            {KRANZ.map(([dx, dy], i) => (
              <circle
                key={i}
                cx={cx + dx}
                cy={cy + dy}
                r="3.3"
                fill={schadhaft ? "#8f1c42" : "url(#svo-beere)"}
                stroke={schadhaft ? "#5a0a24" : "#b11742"}
                strokeWidth="0.6"
              />
            ))}
            <circle cx={cx} cy={cy} r="2.6" fill="#101010" fillOpacity="0.55" />
            {schadhaft ? (
              <>
                <g fill="#7ec8f0" fillOpacity="0.85">
                  <path d={`M${cx - 10} ${cy + 5} q2.5 5 0 7.5 q-2.5 -2.5 0 -7.5 Z`} />
                  <path d={`M${cx + 9} ${cy + 7} q2.5 5 0 7.5 q-2.5 -2.5 0 -7.5 Z`} />
                </g>
                <circle cx={cx} cy={cy} r="13.5" fill="none" stroke="#e8b34a" strokeWidth="1.5" />
                <circle
                  cx={cx}
                  cy={cy}
                  r="13.5"
                  fill="none"
                  stroke="#e8b34a"
                  strokeWidth="1.5"
                  className="motion-safe:animate-[schale-warnung_2.4s_ease-out_infinite]"
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                />
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

// Querschnitt der Verkaufsschale mit derselben Geometrie wie Schale in
// beere-schale.tsx. Drei Beeren liegen, die vierte legt der Pflücker direkt
// in die Lücke, ohne Umweg über Steige und Sortiertisch. Sie senkt sich ab,
// statt zu fallen: Einen Fall verträgt keine Himbeere. Bei reduzierter
// Bewegung liegt sie schlicht in der Schale.
const LIEGEND: ReadonlyArray<readonly [number, number]> = [
  [62, 76],
  [90, 74],
  [118, 76],
];

function SchaleFuellen() {
  return (
    <svg viewBox="0 0 208 120" className="h-full w-full overflow-visible">
      <defs>
        <radialGradient id="sf-beere" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0%" stopColor="#d43a63" />
          <stop offset="100%" stopColor="#b11742" />
        </radialGradient>
      </defs>
      <line
        x1="16"
        y1="44"
        x2="192"
        y2="44"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeDasharray="5 5"
      />
      {LIEGEND.map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r="14" fill="url(#sf-beere)" stroke="#b11742" strokeWidth="1.5" />
      ))}
      <circle
        cx="146"
        cy="74"
        r="14"
        fill="url(#sf-beere)"
        stroke="#b11742"
        strokeWidth="1.5"
        className="motion-safe:animate-[beere-einlegen_4s_cubic-bezier(0.22,1,0.36,1)_infinite]"
      />
      <path
        d="M34 44 L54 100 L154 100 L174 44"
        fill="currentColor"
        fillOpacity="0.06"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M28 44 L180 44" stroke="currentColor" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// Die drei Merkmale, über die der Pflücker am Strauch entscheidet, mit dem
// Urteil als Zeichen daneben.
const FELD_MERKMALE: ReadonlyArray<{
  variante: BeerenVariante;
  textKey: string;
  Zeichen: LucideIcon;
  ton: string;
}> = [
  { variante: "ok", textKey: "q1Title", Zeichen: Check, ton: "bg-success" },
  { variante: "receptacle", textKey: "q2Title", Zeichen: TriangleAlert, ton: "bg-warning" },
  { variante: "mould", textKey: "q3Title", Zeichen: X, ton: "bg-destructive" },
];

// Drei Reihenbloecke, jeder Punkt ein Pflueckdurchgang alle zwei bis drei
// Tage. Tage gezaehlt ab dem 1. August; die Bloecke beginnen versetzt und
// laufen drei bis acht Wochen, wie im Text beschrieben.
const BLOECKE = [
  { beginn: 4, ende: 50 },
  { beginn: 19, ende: 70 },
  { beginn: 35, ende: 88 },
] as const;
const TAGE = 92;

function Fliessband({ monate, frost }: { monate: readonly string[]; frost: string }) {
  const x = (tag: number) => 20 + (tag / TAGE) * 290;
  return (
    <svg viewBox="0 0 320 100" className="h-full w-full">
      {BLOECKE.map((block, reihe) => {
        const y = 18 + reihe * 22;
        const durchgaenge: number[] = [];
        for (let tag = block.beginn + reihe * 0.8; tag <= block.ende; tag += 2.5) {
          durchgaenge.push(tag);
        }
        return (
          <g key={block.beginn}>
            <line
              x1={x(block.beginn)}
              x2={x(block.ende)}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.22"
              strokeWidth="7"
              strokeLinecap="round"
            />
            {durchgaenge.map((tag) => (
              <circle key={tag} cx={x(tag)} cy={y} r="2.4" className="fill-himbeere" />
            ))}
          </g>
        );
      })}
      {[0, 31, 61].map((tag, i) => (
        <text key={tag} x={x(tag)} y="94" fontSize="10" fill="currentColor" fillOpacity="0.8">
          {monate[i]}
        </text>
      ))}
      <text x={x(TAGE)} y="94" fontSize="10" textAnchor="end" fontWeight="700" className="fill-himbeere">
        {frost}
      </text>
    </svg>
  );
}

export function BeereBento() {
  const s = useTranslations("landing");
  const q = useTranslations("qualityStandard");
  const e = useTranslations("erlebnis.bento");
  const locale = useLocale();

  // August, September, Oktober in der Sprache der Seite. UTC, damit die
  // Monatsmitte nicht ueber eine Zeitzone in den Nachbarmonat rutscht.
  const monatsname = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const monate = [7, 8, 9].map((monat) => monatsname.format(new Date(Date.UTC(2026, monat, 15))));

  const punkt = (key: string) => ({
    titel: s(`berryPoints.${key}.title`),
    text: s(`berryPoints.${key}.text`),
  });

  return (
    <section id="himbeere" className="scroll-mt-20 border-b border-border py-16 md:py-24">
      <div className="container">
        <Reveal art="wisch">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
            {s("berryEyebrow")}
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
            {s("berryTitle")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {s("berryLead")}
          </p>
        </Reveal>

        <Reveal staffel className="mt-10 grid gap-3 md:grid-cols-6 lg:grid-cols-12">
          <article
            className={`relative flex min-h-[24rem] flex-col justify-end overflow-hidden md:col-span-6 md:min-h-[26rem] lg:col-span-7 lg:row-span-2 lg:min-h-[32rem] ${DUNKLE_KACHEL}`}
          >
            <LoopClip
              clip={beerenNahaufnahme}
              sizes="(min-width: 1024px) 58vw, 100vw"
              className="absolute inset-0"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(4,22,28,0.92)_100%)]"
            />
            <div className="relative max-w-lg">
              <Textblock hell {...punkt("schale")} />
            </div>
          </article>

          <article className={`flex flex-col justify-between gap-6 md:col-span-3 lg:col-span-5 ${DUNKLE_KACHEL}`}>
            <p className="font-heading text-7xl font-black leading-none text-himbeere-leuchtend md:text-8xl">
              60
              <span className="ml-2 align-top text-xl font-bold text-white/70 md:text-2xl">
                {e("minuten")}
              </span>
            </p>
            <div>
              <Textblock hell {...punkt("kuehlung")} />
              <a
                href="#sechzig-minuten"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#3fd0e6] underline-offset-4 hover:underline"
              >
                {e("sechzigLink")}
                <ArrowDown className="h-4 w-4" />
              </a>
            </div>
          </article>

          <article
            className={`flex flex-col gap-6 md:col-span-3 lg:col-span-5 lg:flex-row lg:items-center ${DUNKLE_KACHEL}`}
          >
            <div aria-hidden className="mx-auto w-full max-w-52 shrink-0 lg:mx-0 lg:w-44">
              <SchaleVonOben />
            </div>
            <div>
              <Textblock hell {...punkt("schaden")} />
            </div>
          </article>

          <HelleKachel className="md:col-span-3 lg:col-span-4" buehne={<SchaleFuellen />} {...punkt("umpacken")} />

          <HelleKachel
            className="md:col-span-3 lg:col-span-4"
            buehne={
              <div className="grid w-full grid-cols-3 items-start gap-3">
                {FELD_MERKMALE.map(({ variante, textKey, Zeichen, ton }) => (
                  <figure key={variante} className="flex flex-col items-center gap-2">
                    <div className="relative">
                      <Beere variante={variante} groesse={46} />
                      <span
                        className={`absolute -top-1 -right-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-background shadow-sm ${ton}`}
                      >
                        <Zeichen className="h-3 w-3" strokeWidth={3} />
                      </span>
                    </div>
                    <figcaption className="text-center text-xs font-semibold leading-tight text-muted-foreground hyphens-auto [hyphenate-limit-chars:auto_3_5]">
                      {q(textKey)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            }
            {...punkt("feld")}
          />

          <HelleKachel
            className="md:col-span-6 lg:col-span-4"
            buehneFarbe="text-muted-foreground"
            buehne={<Fliessband monate={monate} frost={e("frost")} />}
            {...punkt("rhythmus")}
          />
        </Reveal>

        <p className="mt-8 max-w-3xl border-l-4 border-himbeere pl-5 font-heading text-xl font-black leading-snug text-foreground md:text-2xl">
          {s("berryQuote")}
        </p>
      </div>
    </section>
  );
}
