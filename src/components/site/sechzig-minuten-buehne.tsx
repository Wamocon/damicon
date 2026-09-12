"use client";

import Image from "next/image";
import { useEffect, useRef, type CSSProperties } from "react";
import { bewegungReduziert, medienErlaubt } from "@/lib/bewegung";
import {
  ladeSequenz,
  naechstesGeladenes,
  sequenzPfade,
  zeichneFormatfuellend,
} from "@/lib/bild-sequenz";
import { FrostPartikel } from "@/lib/frost-partikel";
import type { BildSequenz } from "@/lib/site-medien";

// Die Szene bleibt beim Scrollen stehen (sticky), waehrend die Stunde nach
// dem Pfluecken ablaeuft: Uhr, Schritte, Kuehlkurve, das Bild wird kaelter,
// Frostkristalle setzen ein. Ein einziger Scroll-Fortschritt treibt alles.
//
// Warum ein JavaScript-Fortschritt und nicht CSS animation-timeline: Das
// Canvas mit der Bildsequenz braucht den Fortschritt ohnehin als Zahl. Zwei
// Zeitsysteme fuer eine Szene liefen auseinander. So bestimmt ein Wert alles,
// und Firefox, das scroll-getriebene CSS-Animationen noch nicht kann, sieht
// dieselbe Szene. Der Wert landet als --fortschritt und --zeit auf der
// Sektion, die Darstellung selbst bleibt CSS. Pro Bild schreibt die Schleife
// nur, was sich geaendert hat - kein React-State, keine Renderdurchlaeufe.
//
// Ohne JavaScript und bei reduzierter Bewegung steht der Endzustand da: alle
// Schritte lesbar, die Kurve vollstaendig. Bei reduzierter Bewegung wird die
// Szene ausserdem nicht angeheftet (motion-reduce: im Markup).

export type SzenenTexte = {
  eyebrow: string;
  title: string;
  lead: string;
  uhrLabel: string;
  minute: string;
  kurveTitel: string;
  achseWarm: string;
  achseKalt: string;
  grenze: string;
  kuehlraum: string;
};

export type SzenenSchritt = {
  key: string;
  /** Beginn des Schritts auf der Uhr. */
  minute: number;
  /** Sichtbare Zeitangabe, etwa "5–15". */
  marke: string;
  title: string;
  text: string;
};

// Kuehlkurve, schematisch: bis Minute 10 im Feld und auf dem Weg nahe der
// Feldwaerme, im Kuehlraum dann abklingend auf 0 bis 1 Grad (Newtonsches
// Abkuehlen). Keine Messreihe - die Beschriftung sagt das auch.
const X0 = 44;
const X1 = 384;
const Y_WARM = 34;
const Y_KALT = 150;

function kurvenPunkt(minute: number): readonly [number, number] {
  const x = X0 + ((X1 - X0) * minute) / 60;
  const y =
    minute <= 10
      ? Y_WARM - 4 + minute * 0.4
      : Y_KALT - (Y_KALT - Y_WARM) * Math.exp(-(minute - 10) / 11);
  return [x, y];
}

const KURVE = Array.from({ length: 61 }, (_, minute) => kurvenPunkt(minute))
  .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
  .join(" ");

// Jeder Schritt bekommt denselben Scrollweg, auch wenn er in Minuten kuerzer
// ist - sonst waere "Pfluecken" (5 Minuten) nach einem Wischer vorbei.
function minuteBei(p: number, schritte: readonly SzenenSchritt[]): number {
  const n = schritte.length;
  const lage = Math.min(p * n, n - 0.0001);
  const i = Math.floor(lage);
  const von = schritte[i]?.minute ?? 0;
  const bis = schritte[i + 1]?.minute ?? 60;
  return von + (bis - von) * (lage - i);
}

const zweistellig = (zahl: number) => String(zahl).padStart(2, "0");

export function SechzigMinutenBuehne({
  sequenz,
  texte,
  schritte,
}: {
  sequenz: BildSequenz;
  texte: SzenenTexte;
  schritte: readonly SzenenSchritt[];
}) {
  const sektion = useRef<HTMLElement>(null);
  const bildLeinwand = useRef<HTMLCanvasElement>(null);
  const frostLeinwand = useRef<HTMLCanvasElement>(null);
  const uhr = useRef<HTMLSpanElement>(null);
  const punkt = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const el = sektion.current;
    const leinwand = bildLeinwand.current;
    const uhrEl = uhr.current;
    const punktEl = punkt.current;
    if (!el || !leinwand || !uhrEl || !punktEl || bewegungReduziert()) return;

    const medien = medienErlaubt();
    const pfade = sequenzPfade(sequenz.ordner, sequenz.anzahl, window.innerWidth < 768 ? 2 : 1);
    const ctx = leinwand.getContext("2d");
    const frost = medien && frostLeinwand.current ? new FrostPartikel(frostLeinwand.current) : null;
    const eintraege = Array.from(el.querySelectorAll<HTMLElement>("[data-schritt]"));

    let bilder: HTMLImageElement[] = [];
    let neuZeichnen = true;
    let letztesP = -1;
    let letzterSchritt = -1;
    let letzterIndex = -1;
    let raf = 0;
    let zuletzt = 0;
    let sichtbar = false;

    const groesse = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      leinwand.width = Math.round(leinwand.clientWidth * dpr);
      leinwand.height = Math.round(leinwand.clientHeight * dpr);
      frost?.anpassen();
      neuZeichnen = true;
    };

    const aktualisieren = () => {
      const rect = el.getBoundingClientRect();
      const weg = rect.height - window.innerHeight;
      const p = weg > 0 ? Math.min(1, Math.max(0, -rect.top / weg)) : 1;

      if (Math.abs(p - letztesP) > 0.0003) {
        letztesP = p;
        const minute = minuteBei(p, schritte);
        const zeit = minute / 60;
        el.style.setProperty("--fortschritt", p.toFixed(4));
        el.style.setProperty("--zeit", zeit.toFixed(4));

        const sekunden = Math.round(minute * 60);
        uhrEl.textContent = `${zweistellig(Math.floor(sekunden / 60))}:${zweistellig(sekunden % 60)}`;

        const [x, y] = kurvenPunkt(minute);
        punktEl.setAttribute("cx", x.toFixed(1));
        punktEl.setAttribute("cy", y.toFixed(1));

        const schritt = Math.min(schritte.length - 1, Math.floor(p * schritte.length));
        if (schritt !== letzterSchritt) {
          letzterSchritt = schritt;
          eintraege.forEach((eintrag, i) => {
            eintrag.dataset.status = i < schritt ? "vorbei" : i === schritt ? "aktiv" : "kommend";
          });
        }

        // Frost setzt ein, wenn die Beere im Kuehlraum ist, und ist bei der
        // 60. Minute voll da.
        frost?.setzeStaerke((zeit - 0.3) / 0.5);
      }

      if (medien && ctx && bilder.length) {
        const index = Math.round(p * (pfade.length - 1));
        if (index !== letzterIndex || neuZeichnen) {
          const bild = naechstesGeladenes(bilder, index);
          if (bild) {
            zeichneFormatfuellend(ctx, bild, leinwand.width, leinwand.height, 0.72);
            letzterIndex = index;
            neuZeichnen = false;
          }
        }
      }
    };

    const schleife = (jetzt: number) => {
      const dt = zuletzt ? Math.min(0.05, (jetzt - zuletzt) / 1000) : 1 / 60;
      zuletzt = jetzt;
      aktualisieren();
      frost?.schritt(dt);
      raf = sichtbar ? requestAnimationFrame(schleife) : 0;
    };

    // Die Schleife laeuft nur, solange die Szene im Bild ist.
    const sicht = new IntersectionObserver(([eintrag]) => {
      sichtbar = Boolean(eintrag?.isIntersecting);
      if (sichtbar && !raf) {
        zuletzt = 0;
        raf = requestAnimationFrame(schleife);
      }
    });

    // Einzelbilder erst laden, wenn die Szene naeher als eine Bildschirmhoehe
    // ist - wer die Seite nur oben liest, laedt kein Megabyte dafuer.
    const vorlauf = new IntersectionObserver(
      ([eintrag]) => {
        if (!eintrag?.isIntersecting) return;
        vorlauf.disconnect();
        bilder = ladeSequenz(pfade, () => {
          neuZeichnen = true;
        });
      },
      { rootMargin: "100% 0px" },
    );

    const groessenBeobachter = new ResizeObserver(groesse);

    groesse();
    aktualisieren();
    sicht.observe(el);
    if (medien) vorlauf.observe(el);
    groessenBeobachter.observe(leinwand);

    return () => {
      sicht.disconnect();
      vorlauf.disconnect();
      groessenBeobachter.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [sequenz, schritte]);

  // Bild und Canvas werden mit der Zeit entsaettigt und etwas dunkler - die
  // Waerme geht aus dem Bild, wie aus der Frucht.
  const abkuehlen: CSSProperties = {
    filter: "saturate(calc(1 - var(--zeit) * 0.4)) brightness(calc(1 - var(--zeit) * 0.12))",
  };
  const [endX, endY] = kurvenPunkt(60);
  const [kuehlraumX] = kurvenPunkt(10);

  return (
    <section
      ref={sektion}
      id="sechzig-minuten"
      aria-labelledby="sechzig-minuten-titel"
      className="relative h-[260svh] scroll-mt-16 bg-[#04161c] text-white md:h-[320svh] motion-reduce:h-auto"
      style={{ "--fortschritt": 1, "--zeit": 1 } as CSSProperties}
    >
      <div className="sticky top-0 h-svh overflow-hidden motion-reduce:relative motion-reduce:h-auto">
        <div aria-hidden className="absolute inset-0">
          <Image
            src={`${sequenz.ordner}/00.webp`}
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-[72%_50%]"
            style={abkuehlen}
          />
          <canvas ref={bildLeinwand} className="absolute inset-0 h-full w-full" style={abkuehlen} />
          <div
            className="absolute inset-0 bg-[linear-gradient(160deg,rgba(63,208,230,0.34)_0%,rgba(4,22,28,0.2)_60%)]"
            style={{ opacity: "var(--zeit)" }}
          />
          <canvas ref={frostLeinwand} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,22,28,0.84)_0%,rgba(4,22,28,0.72)_50%,rgba(4,22,28,0.9)_100%)] md:bg-[linear-gradient(95deg,rgba(4,22,28,0.92)_0%,rgba(4,22,28,0.8)_36%,rgba(4,22,28,0.3)_62%,rgba(4,22,28,0.12)_100%)]" />
        </div>

        <div className="container relative grid h-full content-center gap-8 pb-10 pt-24 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:items-end md:pb-16 motion-reduce:h-auto motion-reduce:py-20">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#3fd0e6]">
              {texte.eyebrow}
            </p>
            <h2
              id="sechzig-minuten-titel"
              className="mt-2 max-w-xl text-3xl font-black leading-tight md:text-5xl"
            >
              {texte.title}
            </h2>
            <p className="mt-3 hidden max-w-lg text-sm leading-6 text-white/75 sm:block md:text-base">
              {texte.lead}
            </p>

            <div aria-hidden className="mt-5 flex items-end gap-3">
              <span
                ref={uhr}
                className="font-heading text-5xl font-black leading-none tabular-nums md:text-8xl"
              >
                60:00
              </span>
              <span className="pb-1 text-xs font-semibold text-white/65 md:text-sm">
                {texte.uhrLabel}
              </span>
            </div>
            <div aria-hidden className="mt-4 h-1.5 max-w-md overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full origin-left rounded-full bg-himbeere-leuchtend"
                style={{ transform: "scaleX(var(--zeit))" }}
              />
            </div>

            {/* Schrittliste an einer Schiene, die mitwaechst: Die Fuellung
                haengt an --fortschritt, also an derselben Zahl wie Uhr und
                Kurve - kein zweites Zeitsystem. Karten, die noch nicht an der
                Reihe sind, stehen leicht eingerueckt und ruecken nach. Ohne
                JavaScript und bei reduzierter Bewegung steht --fortschritt auf
                1: Schiene voll, alle Karten an ihrem Platz. */}
            <div className="relative mt-5 max-w-lg pl-7">
              <div aria-hidden className="schiene">
                <i style={{ transform: "scaleY(var(--fortschritt))" }} />
              </div>

              <ol className="grid gap-2">
                {schritte.map((schritt) => (
                  <li
                    key={schritt.key}
                    data-schritt
                    className="schritt group/schritt rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 backdrop-blur transition-[opacity,background-color,border-color,transform] duration-300 data-[status=aktiv]:border-himbeere-leuchtend/60 data-[status=aktiv]:bg-white/10 data-[status=kommend]:opacity-45 data-[status=vorbei]:opacity-70"
                  >
                    <span aria-hidden className="schritt__punkt" />
                    <p className="flex items-baseline gap-2 text-sm font-black">
                      <span className="shrink-0 tabular-nums text-himbeere-leuchtend">
                        {schritt.marke} {texte.minute}
                      </span>
                      {schritt.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-white/75 group-data-[status=kommend]/schritt:sr-only group-data-[status=vorbei]/schritt:sr-only">
                      {schritt.text}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <figure className="hidden rounded-3xl border border-white/10 bg-[#04161c]/55 p-5 backdrop-blur-md md:block">
            <figcaption className="text-xs font-bold uppercase tracking-[0.12em] text-white/70">
              {texte.kurveTitel}
            </figcaption>
            <svg viewBox="0 0 400 180" className="mt-3 w-full" aria-hidden>
              <g stroke="white" strokeOpacity="0.08">
                <path d={`M${X0} ${Y_WARM}H${X1}M${X0} 92H${X1}M${X0} ${Y_KALT}H${X1}`} />
              </g>
              <text x={X0} y={Y_WARM - 12} fontSize="10" fill="white" fillOpacity="0.7">
                {texte.achseWarm}
              </text>
              <text x={X0} y={Y_KALT + 20} fontSize="10" fill="white" fillOpacity="0.7">
                {texte.achseKalt}
              </text>
              <line
                x1={kuehlraumX}
                x2={kuehlraumX}
                y1={Y_WARM - 4}
                y2={Y_KALT}
                stroke="#3fd0e6"
                strokeOpacity="0.5"
                strokeDasharray="3 4"
              />
              <text x={kuehlraumX + 5} y={Y_KALT - 6} fontSize="10" fill="#3fd0e6">
                {texte.kuehlraum}
              </text>
              <line
                x1={X1}
                x2={X1}
                y1={Y_WARM - 18}
                y2={Y_KALT + 6}
                strokeWidth="2"
                className="stroke-himbeere-leuchtend"
              />
              <text
                x={X1 - 5}
                y={Y_WARM - 12}
                fontSize="10"
                fontWeight="700"
                textAnchor="end"
                className="fill-himbeere-leuchtend"
              >
                {texte.grenze}
              </text>
              <path d={KURVE} fill="none" stroke="white" strokeOpacity="0.14" strokeWidth="3" />
              <path
                d={KURVE}
                fill="none"
                stroke="#3fd0e6"
                strokeWidth="3"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1"
                style={{ strokeDashoffset: "calc(1 - var(--zeit))" }}
              />
              <circle ref={punkt} cx={endX} cy={endY} r="5.5" fill="white" stroke="#04161c" strokeWidth="2" />
            </svg>
          </figure>
        </div>
      </div>
    </section>
  );
}
