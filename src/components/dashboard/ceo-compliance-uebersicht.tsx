import { getFormatter, getTranslations } from "next-intl/server";
import { PruefungBericht } from "@/components/pruefung/pruefung-bericht";
import { Section, StatusPill } from "@/components/ui/kit";
import { CeoAktualisierenKnopf } from "@/components/dashboard/ceo-aktualisieren-knopf";
import { CeoAutoTrigger } from "@/components/dashboard/ceo-auto-trigger";
import { letzterCeoBericht } from "@/lib/data/compliance-ceo";
import { betriebsZeitzone } from "@/lib/domain/tageszeit";

// Nur fuer die Rolle ceo auf der Startseite eingebunden (siehe home.tsx). Zeigt
// den letzten automatischen oder manuellen Bericht (lib/data/compliance-ceo.ts)
// mit der bereits vorhandenen Berichtsansicht (components/pruefung/
// pruefung-bericht.tsx) und, sofern vorhanden, was sich seit dem vorigen
// Bericht veraendert hat. CeoAutoTrigger loest im Hintergrund den naechsten
// Lauf aus, falls sich die Betriebsdaten seit diesem Bericht geaendert haben.
export async function CeoComplianceUebersicht() {
  const [t, tp, format, zeile] = await Promise.all([
    getTranslations("ceoUebersicht"),
    getTranslations("pruefung"),
    getFormatter(),
    letzterCeoBericht(),
  ]);

  return (
    <Section
      title={t("titel")}
      description={t("untertitel")}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {zeile ? (
            <StatusPill tone="neutral">
              {t("zuletztGeprueft", {
                datum: format.dateTime(new Date(zeile.erstelltAm), {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: betriebsZeitzone,
                }),
              })}
            </StatusPill>
          ) : null}
          <CeoAktualisierenKnopf />
        </div>
      }
    >
      <CeoAutoTrigger />
      {!zeile ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-xs leading-5 text-muted-foreground">
          {t("nochKeinBericht")}
        </p>
      ) : (
        <div className="space-y-4">
          {zeile.aenderungen.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("keineAenderung")}</p>
          ) : (
            <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold text-foreground">
                {t("aenderungenAnzahl", { anzahl: zeile.aenderungen.length })}
              </p>
              <ul className="space-y-1 text-[11px] leading-5 text-muted-foreground">
                {zeile.aenderungen.map((a) => (
                  <li key={a.befundId}>
                    <span className="font-medium text-foreground">{a.titel}</span>:{" "}
                    {a.art === "neu"
                      ? t("aenderungArt.neu")
                      : a.art === "status_veraendert"
                        ? t("aenderungArt.statusVeraendert", {
                            vorher: tp(`status.${a.vorherStatus}`),
                            jetzt: tp(`status.${a.status}`),
                          })
                        : t("aenderungArt.schwereVeraendert", {
                            vorher: tp(`schwere.${a.vorherSchwere}`),
                            jetzt: tp(`schwere.${a.schwere}`),
                          })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <PruefungBericht bericht={zeile.bericht} />
        </div>
      )}
    </Section>
  );
}
