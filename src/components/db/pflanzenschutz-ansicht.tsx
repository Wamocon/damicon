import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, DataTable, Section, Stat, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { ladeBehandlungen } from "@/lib/data/pflanzenschutz";
import { parseBehandlungFilter, type BehandlungFilter } from "@/lib/domain/pflanzenschutz";

const filterWerte: BehandlungFilter[] = ["alle", "offen", "freigegeben"];

// Pflanzenschutz-Protokoll (Anforderung 2.4). Bewusst eine reine Nachweis-
// ansicht: erfasst und freigegeben wird eine Behandlung weiterhin am
// Reihenblock (ReihenbloeckeAnsicht), wo der Block samt Sperrzustand vor
// einem steht. Hier steht die Behandlung selbst, auch die laengst
// freigegebene, die in der Blocksicht niemand mehr sieht. Der Filter laeuft
// wie dort ueber die Adresszeile, damit ein Link auf einen Stand teilbar bleibt.
export async function PflanzenschutzAnsicht({
  pfad,
  statusFilter,
}: {
  pfad: string;
  statusFilter?: string;
}) {
  const filter = parseBehandlungFilter(statusFilter);
  const [liste, t, f] = await Promise.all([
    ladeBehandlungen(filter),
    getTranslations("pflanzenschutzProtokoll"),
    getFormatter(),
  ]);

  const datum = (wert: string) => f.dateTime(new Date(wert), { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={t("stat.gesamt")} value={String(liste.gesamt)} />
        <Stat label={t("stat.laeuft")} value={String(liste.laufend)} />
        <Stat label={t("stat.ohneProtokoll")} value={String(liste.ohneProtokoll)} />
      </div>

      <Section
        title={t("titel")}
        description={t("lead")}
        action={<DatenquelleBadge quelle={liste.quelle} />}
      >
        <nav aria-label={t("filter.label")} className="mb-3 flex flex-wrap gap-2">
          {filterWerte.map((wert) => {
            const aktiv = filter === wert;
            return (
              <Link
                key={wert}
                href={{ pathname: pfad, query: wert === "alle" ? {} : { status: wert } }}
                scroll={false}
                aria-current={aktiv ? "true" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  aktiv
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40"
                }`}
              >
                {t(`filter.${wert}`)}
              </Link>
            );
          })}
        </nav>

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
              <td className="px-3 py-2.5 text-muted-foreground">
                {b.personVerborgen ? (
                  <span title={t("personVerborgenHinweis")} className="text-[11px]">
                    {t("personVerborgen")}
                  </span>
                ) : (
                  (b.durchgefuehrtVon ?? "-")
                )}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {t("wartezeitTage", { tage: b.wartezeitTage })}
                <span className="block text-[11px]">{datum(b.freigabeAm)}</span>
              </td>
              <td className="px-3 py-2.5">
                <StatusPill
                  tone={b.wartezeitLaeuft ? "danger" : b.freigegeben ? "success" : "warning"}
                >
                  {t(
                    b.wartezeitLaeuft
                      ? "zustand.laeuft"
                      : b.freigegeben
                        ? "zustand.freigegeben"
                        : "zustand.abgelaufen",
                  )}
                </StatusPill>
              </td>
            </tr>
          ))}
        </DataTable>
        {liste.gekuerzt ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("gekuerzt", { anzahl: liste.behandlungen.length })}
          </p>
        ) : null}
      </Section>

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
