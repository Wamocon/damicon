import { useLocale, useTranslations } from "next-intl";
import { Reveal } from "@/components/site/reveal";
import { WerbefilmSpieler } from "@/components/werbefilm/spieler";
import { werbefilm } from "@/lib/site-medien";

// Der Werbefilm auf der oeffentlichen Seite, direkt hinter dem Hero: wer
// einmal scrollt, sieht ihn.
//
// Er ersetzt das Hero-Video ausdruecklich nicht. Das laeuft als stumme
// Endlosschleife hinter der Schrift, unter einem Verlauf, der ueber der
// Textzone bis zu 88 % deckt - ein Film mit Anfang, Ende, Tonspur und fest
// eingebrannten Einblendungen waere dort weder zu sehen noch zu hoeren.
// Beides sind Videos und sonst nichts Gemeinsames: das eine ist Flaeche, das
// andere ein Stueck.
//
// Die Sektion bleibt hell, obwohl der Hero darueber nachtblau ist. Zwei
// dunkle Bloecke hintereinander lesen sich als einer; so steht der Film als
// Bildschirm auf heller Flaeche und hebt sich von dem ab, was ueber ihm liegt.
export function WerbefilmAbschnitt() {
  const t = useTranslations("werbefilm");
  const locale = useLocale();

  return (
    <section id="film" className="container scroll-mt-20 py-16 md:py-24">
      <Reveal art="wisch">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
          {t("eyebrow")}
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
          {t("titel")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("lead")}
        </p>
      </Reveal>

      <Reveal className="mt-10">
        <WerbefilmSpieler className="rounded-3xl shadow-2xl ring-1 ring-border" />
      </Reveal>

      {/* Wer kein Russisch versteht, soll das vor dem Klick wissen und nicht
          erst nach zehn Sekunden. Untertitel gibt es noch keine - steht eine
          VTT-Datei in site-medien.ts, traegt der Spieler sie nach. */}
      {locale === werbefilm.tonsprache ? null : (
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          {t("sprachHinweis")}
        </p>
      )}
    </section>
  );
}
