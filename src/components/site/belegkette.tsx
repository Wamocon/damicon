import { useTranslations } from "next-intl";
import {
  ArrowRight,
  MapPin,
  Package,
  QrCode,
  ScanLine,
  ShieldCheck,
  Thermometer,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Reveal } from "@/components/site/reveal";
import { knopfKlassen } from "@/components/ui/kit";

// Die Nachweiskette als Kette, nicht als fuenf gleiche Karten: Vom Code auf
// der Schale laeuft eine Linie durch alle Glieder, die nacheinander
// aufleuchten - so, wie eine Reklamation im System zurueckverfolgt wird.
//
// Kein eigenes JavaScript. Reveal setzt data-reveal am Container von
// "vorbereitet" auf "sichtbar"; die Glieder haengen per group-data-Variante
// daran und laufen mit gestaffelter Verzoegerung in ihren Endzustand. Der
// Endzustand ist der Normalfall im Markup: Ohne JavaScript, bei reduzierter
// Bewegung oder wenn der Abschnitt beim Laden schon im Bild ist, steht die
// Kette sofort vollstaendig da.

type Glied = { key: string; icon: LucideIcon; titel: string; text: string; start?: boolean };

export function Belegkette() {
  const s = useTranslations("landing");
  const e = useTranslations("erlebnis.belegkette");

  const glieder: Glied[] = [
    { key: "start", icon: QrCode, titel: e("start"), text: e("startText"), start: true },
    ...(
      [
        ["pfluecker", ScanLine],
        ["charge", Package],
        ["herkunftsblock", MapPin],
        ["kuehlkurve", Thermometer],
        ["behandlung", ShieldCheck],
      ] as const
    ).map(([key, icon]) => ({
      key,
      icon,
      titel: s(`proofSteps.${key}.title`),
      text: s(`proofSteps.${key}.text`),
    })),
  ];

  return (
    <section
      id="belegbarkeit"
      className="scroll-mt-20 border-y border-border bg-secondary/40 py-16 md:py-24"
    >
      <div className="container">
        <Reveal art="wisch">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
            {s("proofEyebrow")}
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
            {s("proofTitle")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {s("proofLead")}
          </p>
        </Reveal>

        <Reveal className="group relative mt-12">
          {/* Kettenlinie: senkrecht auf dem Telefon, waagerecht ab md. Sie
              verlaeuft durch die Mittelpunkte der Symbole (h-12 = 3rem). */}
          <div
            aria-hidden
            className="absolute bottom-6 left-6 top-6 w-0.5 origin-top bg-primary/50 transition-transform duration-[1800ms] ease-out group-data-[reveal=vorbereitet]:scale-y-0 md:hidden"
          />
          <div
            aria-hidden
            className="absolute left-[8.33%] right-[8.33%] top-6 hidden h-0.5 origin-left bg-primary/50 transition-transform duration-[1800ms] ease-out group-data-[reveal=vorbereitet]:scale-x-0 md:block"
          />

          <ol className="relative grid gap-6 md:grid-cols-6 md:gap-4">
            {glieder.map(({ key, icon: Symbol, titel, text, start }, i) => {
              const verzoegerung = { transitionDelay: `${250 + i * 260}ms` };
              return (
                <li key={key} className="flex gap-4 md:flex-col md:items-center md:text-center">
                  <span
                    style={verzoegerung}
                    className={`relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 shadow-lg transition-colors duration-500 group-data-[reveal=vorbereitet]:border-border group-data-[reveal=vorbereitet]:bg-card group-data-[reveal=vorbereitet]:text-muted-foreground group-data-[reveal=vorbereitet]:shadow-none ${
                      start
                        ? "border-himbeere bg-himbeere text-white shadow-himbeere/25"
                        : "border-primary bg-primary text-primary-foreground shadow-primary/20"
                    }`}
                  >
                    <Symbol className="h-5 w-5" />
                  </span>
                  <div
                    style={verzoegerung}
                    className="transition-opacity duration-500 group-data-[reveal=vorbereitet]:opacity-0"
                  >
                    <p className="text-sm font-black text-foreground">{titel}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Reveal>

        <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm font-semibold leading-6 text-foreground">
            {s("proofClosing")}
          </p>
          <Link
            href="/herkunft"
            className={knopfKlassen({
              rundung: "pille",
              // h-auto schlaegt die feste Hoehe aus knopfGroesse: dieser Knopf
              // darf mitwachsen, min-h-11 haelt nur die Mindestflaeche fuer
              // den Daumen.
              className: "h-auto min-h-11 shrink-0 px-5",
            })}
          >
            {e("pruefen")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
