import Image from "next/image";
import { useTranslations } from "next-intl";
import { Lupe } from "@/components/site/lupe";
import { QualityCompare } from "@/components/site/quality-compare";
import { Reveal } from "@/components/site/reveal";
import { qualitaetsBeeren, qualitaetsSchale } from "@/lib/site-medien";

// Der Qualitätsmaßstab, der im Feld gilt, steht hier ein zweites Mal - kein
// Schmuck: wer den Betrieb beliefert oder für ihn pflückt, sieht auf der
// öffentlichen Seite denselben Maßstab, der im System gilt. Fachliche
// Grundlage ist die UNECE-Norm FFV-32 für Himbeeren.
//
// Auf der öffentlichen Seite stehen dafür Makroaufnahmen statt der Zeichnungen:
// Grauschimmel an einer einzigen Stelle und der weiße Blütenboden in einer zu
// früh gelösten Beere sind Merkmale, die ein Einkäufer am Foto wiedererkennt
// und an einer Zeichnung nur glauben kann. Im Feld bleibt es umgekehrt bei den
// SVG-Zeichnungen (components/db/qualitaets-referenz.tsx): die sind ohne
// Bilddatei offline verfügbar, sobald die Seite einmal geladen wurde.
//
// Drei nebeneinander, die Schale einzeln darunter: die drei Einzelbeeren sind
// gleichrangige Merkmale derselben Prüfung, die Schale ist die Folge für eine
// ganze Lieferung. Vier in einer Reihe würden beides gleichsetzen und jedes
// Bild auf rund 300 px drücken - der graue Belag, um den es geht, wäre dann
// nicht mehr zu sehen.
export function QualityStandard() {
  const t = useTranslations("qualityStandard");
  const e = useTranslations("erlebnis.lupe");

  return (
    <section className="border-b border-border py-16 md:py-24">
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

        {/* Die Lupe ersetzt hier den Hover-Zoom der anderen Fotos: der
            vergroessert das ganze Bild, die Lupe genau die Stelle, an der
            der Belag sitzt. */}
        <Reveal staffel className="mt-10 grid gap-4 sm:grid-cols-3">
          {qualitaetsBeeren.map(({ quelle, textKey, ton, breite, hoehe }) => (
            <figure
              key={textKey}
              className={`overflow-hidden rounded-2xl border bg-card ${
                ton === "ausschuss" ? "border-warning/40" : "border-border"
              }`}
            >
              <div className="relative aspect-3/2 w-full overflow-hidden">
                <Lupe
                  quelle={quelle}
                  breite={breite}
                  hoehe={hoehe}
                  hinweisMaus={e("hinweisMaus")}
                  hinweisTouch={e("hinweisTouch")}
                >
                  <Image
                    src={quelle}
                    alt={t(`${textKey}Title`)}
                    fill
                    sizes="(min-width: 640px) 33vw, 100vw"
                    loading="lazy"
                    className="object-cover"
                  />
                </Lupe>
              </div>
              <figcaption className="p-5">
                <p className="text-sm font-black text-card-foreground">
                  {t(`${textKey}Title`)}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {t(`${textKey}Text`)}
                </p>
              </figcaption>
            </figure>
          ))}
        </Reveal>

        {/* Zwischen Merkmal und Folge steht der Direktvergleich: die drei
            Karten benennen den Maßstab, der Regler macht ihn nachprüfbar. */}
        <Reveal art="wisch">
          <QualityCompare />
        </Reveal>

        {/* Die Schale trägt die Aussage allein und in voller Breite - das Foto
            ist eine Seitenansicht, und genau darum geht es im Text: von oben
            sieht dieselbe Schale einwandfrei aus. */}
        <Reveal className="mt-4">
          <figure className="group overflow-hidden rounded-2xl border border-border bg-card">
            <div className="relative aspect-37/20 w-full overflow-hidden">
              <Image
                src={qualitaetsSchale.quelle}
                alt={t(`${qualitaetsSchale.textKey}Title`)}
                fill
                sizes="(min-width: 1024px) 1024px, 100vw"
                loading="lazy"
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
            </div>
            <figcaption className="p-6">
              <p className="text-sm font-black text-card-foreground">
                {t(`${qualitaetsSchale.textKey}Title`)}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {t(`${qualitaetsSchale.textKey}Text`)}
              </p>
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
