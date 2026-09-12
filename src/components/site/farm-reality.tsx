import Image from "next/image";
import { useTranslations } from "next-intl";
import { Reveal } from "@/components/site/reveal";
import { betriebsBand, betriebsFotos } from "@/lib/site-medien";

// Echte Aufnahmen von der Plantage statt eines Bildarchivs - übernommen aus
// dem parallelen Projekt "Digitalisierung-Himbeerenbetrieb", das dafür bereits
// vor Ort fotografiert hat. Das dritte Bild der Reihe zeigt bewusst einen
// Mangel (Kühlraum bei +16 °C statt nahe 0 °C): ein Auftritt, der nur das
// Gelungene zeigt, liest sich für einen Einkäufer als Werbung; einer, der den
// offenen Punkt selbst benennt, als Bestandsaufnahme.
//
// Welche Datei an welcher Stelle steht, entscheidet lib/site-medien.ts.
export function FarmReality() {
  const t = useTranslations("farmReality");

  return (
    <section className="border-b border-border pb-16 md:pb-24">
      {/* Kapitelbild ueber die volle Breite: Die Groesse der Anlage vor dem
          Gebirge ging in einer Spalte verloren. Die langsame Kamerafahrt beim
          Scrollen ist reines CSS (.kapitel-fahrt in globals.css). Die Datei
          ist 1280 px breit; eine breitere Panoramaaufnahme steht auf der
          Liste fuer das Shooting (docs/aufnahmeplan.md). */}
      <figure className="relative h-[52svh] min-h-80 overflow-hidden bg-[#04161c] md:h-[68svh]">
        <div className="kapitel-fahrt absolute inset-0">
          <Image
            src={betriebsBand.quelle}
            alt={t("bandCaption")}
            fill
            sizes="100vw"
            loading="lazy"
            className="object-cover"
          />
        </div>
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(4,22,28,0.78)_100%)]"
        />
        <figcaption className="container absolute inset-x-0 bottom-0 pb-5 text-sm font-semibold text-white/90 md:pb-8 md:text-base">
          {t("bandCaption")}
        </figcaption>
      </figure>

      <div className="container pt-16 md:pt-20">
        <Reveal art="wisch">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
            {t("eyebrow")}
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("lead")}
          </p>
        </Reveal>

        <Reveal staffel className="mt-10 grid gap-4 sm:grid-cols-3">
          {betriebsFotos.map(({ quelle, textKey, offen }) => (
            <figure
              key={textKey}
              className={`group overflow-hidden rounded-2xl border ${
                offen ? "border-warning/40" : "border-border"
              }`}
            >
              <div className="relative aspect-4/5 w-full overflow-hidden">
                <Image
                  src={quelle}
                  alt={t(`${textKey}Title`)}
                  fill
                  sizes="(min-width: 640px) 33vw, 100vw"
                  loading="lazy"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />
              </div>
              <figcaption className="bg-card p-4">
                <p className="text-sm font-bold text-card-foreground">
                  {t(`${textKey}Title`)}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t(`${textKey}Text`)}
                </p>
              </figcaption>
            </figure>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
