import { useTranslations } from "next-intl";
import { Beere, Schale } from "@/components/site/beere-schale";

// Der Qualitätsmaßstab, der im Feld gilt, steht hier ein zweites Mal - kein
// Schmuck: wer den Betrieb beliefert oder für ihn pflückt, sieht auf der
// öffentlichen Seite denselben Maßstab, der im System gilt. Übernommen aus
// dem parallelen Projekt "Digitalisierung-Himbeerenbetrieb", fachliche
// Grundlage ist die UNECE-Norm FFV-32 für Himbeeren.
export function QualityStandard() {
  const t = useTranslations("qualityStandard");

  const merkmale = [
    { variante: "ok", key: "q1" },
    { variante: "receptacle", key: "q2" },
    { variante: "mould", key: "q3" },
  ] as const;

  return (
    <section className="border-b border-border py-16 md:py-24">
      <div className="container">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
          {t("eyebrow")}
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("lead")}
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {merkmale.map(({ variante, key }) => (
            <div
              key={key}
              className="rounded-2xl border border-border bg-card p-5 text-center"
            >
              {/* Die Zeichnung ist auf dunklem Grund kalibriert (Glanzlicht,
                  Schattierung) - eine feste dunkle Kachel statt des
                  themenabhaengigen Kartenhintergrunds haelt sie in beiden
                  Farbschemata lesbar. */}
              <div className="mx-auto flex w-fit items-center justify-center rounded-xl bg-[#04161c] p-4">
                <Beere variante={variante} groesse={92} titel={t(`${key}Title`)} />
              </div>
              <p className="mt-4 text-sm font-black text-card-foreground">
                {t(`${key}Title`)}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {t(`${key}Text`)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col items-center gap-5 rounded-2xl border border-border bg-card p-6 sm:flex-row">
          <div className="flex w-fit shrink-0 items-center justify-center rounded-xl bg-[#04161c] p-4">
            <Schale variante="overfilled" groesse={160} titel={t("trayTitle")} />
          </div>
          <div>
            <p className="text-sm font-black text-card-foreground">{t("trayTitle")}</p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {t("trayText")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
