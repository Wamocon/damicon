import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { TeilnahmeErfassenKnopf } from "@/components/db/pflichtschulungen-formulare";
import { ladePflichtschulungen } from "@/lib/data/pflichtschulungen";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

const statusTon: Record<string, Tone> = {
  nie: "danger",
  ueberfaellig: "danger",
  bald_faellig: "warning",
  aktuell: "success",
};

// Jaehrliche Pflichtschulung mit Nachweis und Fristueberwachung (Anforderung
// 4.10). Eine Zeile je Person und Pflichtschulung kommt direkt aus RLS-
// gefiltertem Rohmaterial (siehe ladePflichtschulungen()): eine
// Nicht-Buero-Anmeldung erhaelt ausschliesslich die eigene Zeile, das Buero
// die ganze Belegschaft - "istBuero" wird deshalb aus den tatsaechlich
// zurueckgekommenen Zeilen abgeleitet (sobald eine fremde profilId dabei ist,
// muss RLS eine Buero-Anmeldung durchgelassen haben), nicht aus einer
// zweiten, moeglicherweise abweichenden Berechtigungspruefung.
export async function PflichtschulungenAnsicht() {
  const [uebersicht, profil, t] = await Promise.all([
    ladePflichtschulungen(),
    getSessionProfile(),
    getTranslations("pflichtschulungenAnsicht"),
  ]);
  const format = await getFormatter();

  const darfErfassen =
    uebersicht.quelle === "db" && hasPermission(profil?.role, "schulungen", "complete");
  const istBuero = uebersicht.zeilen.some((z) => z.profilId !== profil?.id);

  const datum = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium" }) : "-";

  return (
    <Section
      title={t("titel")}
      description={t("lead")}
      action={<DatenquelleBadge quelle={uebersicht.quelle} />}
    >
      {uebersicht.zeilen.length === 0 ? (
        <Card className="text-center text-xs text-muted-foreground">{t("keineZeilen")}</Card>
      ) : (
        <DataTable
          head={[
            ...(istBuero ? [t("col.person")] : []),
            t("col.schulung"),
            t("col.letzteTeilnahme"),
            t("col.faelligAm"),
            t("col.status"),
            "",
          ]}
        >
          {uebersicht.zeilen.map((z) => (
            <tr key={`${z.profilId}-${z.schulungsvideoId}`}>
              {istBuero ? (
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-foreground">{z.vollerName}</p>
                  <p className="text-[11px] text-muted-foreground">{z.rolle}</p>
                </td>
              ) : null}
              <td className="px-3 py-2.5 text-foreground">{z.titel}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{datum(z.letzteTeilnahmeAm)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{datum(z.faelligAm)}</td>
              <td className="px-3 py-2.5">
                <StatusPill tone={statusTon[z.status] ?? "neutral"}>
                  {t(`status.${z.status}`)}
                </StatusPill>
              </td>
              <td className="px-3 py-2.5">
                {darfErfassen ? (
                  <TeilnahmeErfassenKnopf
                    schulungsvideoId={z.schulungsvideoId}
                    profilId={istBuero && z.profilId !== profil?.id ? z.profilId : undefined}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </Section>
  );
}
