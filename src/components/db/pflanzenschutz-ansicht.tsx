import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, Stat, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { ladeBehandlungen } from "@/lib/data/pflanzenschutz";

// Pflanzenschutz-Protokoll (Anforderung 2.4). Bewusst eine reine Nachweis-
// ansicht: erfasst und freigegeben wird eine Behandlung weiterhin am
// Reihenblock (ReihenbloeckeAnsicht), wo der Block samt Sperrzustand vor
// einem steht. Hier steht die Behandlung selbst - auch die laengst
// freigegebene, die in der Blocksicht niemand mehr sieht.
export async function PflanzenschutzAnsicht() {
  const [liste, t, f] = await Promise.all([
    ladeBehandlungen(),
    getTranslations("pflanzenschutzProtokoll"),
    getFormatter(),
  ]);

  const datum = (wert: string) => f.dateTime(new Date(wert), { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={t("stat.gesamt")} value={String(liste.behandlungen.length)} />
        <Stat label={t("stat.gesperrt")} value={String(liste.offen)} />
        <Stat
          label={t("stat.ohneProtokoll")}
          value={String(liste.behandlungen.filter((b) => !b.hatProtokoll).length)}
        />
      </div>

      <Section
        title={t("titel")}
        description={t("lead")}
        action={<DatenquelleBadge quelle={liste.quelle} />}
      >
        <DataTable
          head={[
            t("col.block"),
            t("col.mittel"),
            t("col.behandeltAm"),
            t("col.aufwand"),
            t("col.person"),
            t("col.wartezeit"),
            t("col.zustand"),
          ]}
        >
          {liste.behandlungen.map((b) => (
            <tr key={b.id}>
              <td className="px-3 py-2.5 font-semibold text-foreground">{b.reihenblock}</td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {b.mittel}
                {b.wirkstoff ? (
                  <span className="text-[11px]"> ({b.wirkstoff})</span>
                ) : null}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{datum(b.behandeltAm)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {b.aufwandmenge === null
                  ? "-"
                  : `${b.aufwandmenge} ${b.aufwandmengeEinheit ? t(`einheit.${b.aufwandmengeEinheit}`) : ""}`}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{b.durchgefuehrtVon ?? "-"}</td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {t("wartezeitTage", { tage: b.wartezeitTage })}
                <span className="block text-[11px]">{datum(b.freigabeAm)}</span>
              </td>
              <td className="px-3 py-2.5">
                <StatusPill tone={b.gesperrt ? "danger" : b.freigegeben ? "success" : "warning"}>
                  {t(b.gesperrt ? "zustand.gesperrt" : b.freigegeben ? "zustand.freigegeben" : "zustand.abgelaufen")}
                </StatusPill>
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
