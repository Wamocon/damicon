import Image from "next/image";
import { useTranslations } from "next-intl";
import { Reveal } from "@/components/site/reveal";
import { bestandsFotos } from "@/lib/site-medien";

// Zeigt, dass der Betrieb nicht bei null anfaengt: eigene Technik,
// Bewaesserung und ein bereits vermarktetes eigenes Erzeugnis. Fuer einen
// Einkaeufer ist das die wichtigere Aussage als jede Softwarefunktion - er
// liefert seinen Ruf nicht an ein Vorhaben aus, sondern an einen Betrieb, der
// bereits produziert. Fotos übernommen aus dem parallelen Projekt
// "Digitalisierung-Himbeerenbetrieb".
//
// Welche Datei an welcher Stelle steht, entscheidet lib/site-medien.ts.
export function ExistingAssets() {
  const t = useTranslations("existingAssets");

  return (
    <section className="border-b border-border bg-secondary/40 py-16 md:py-24">
      <div className="container">
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

        <Reveal staffel className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bestandsFotos.map(({ quelle, textKey, marke }) => (
            <figure
              key={textKey}
              className={`group overflow-hidden rounded-2xl border ${
                marke ? "border-primary/40 bg-primary/5" : "border-border bg-card"
              }`}
            >
              <div className="relative aspect-4/5 w-full overflow-hidden">
                <Image
                  src={quelle}
                  alt={t(`${textKey}Title`)}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  loading="lazy"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />
              </div>
              <figcaption className="p-4">
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
