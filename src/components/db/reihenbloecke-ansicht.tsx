import { getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, DataTable, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  BehandlungFormular,
  FreigabeKnopf,
  StammdatenBearbeiten,
  StatusWechsel,
} from "@/components/db/reihenblock-formulare";
import { ladePsmMittel, ladeReihenbloecke } from "@/lib/data/reihenbloecke";
import { ladeSorten } from "@/lib/data/standort";
import { heuteIso } from "@/lib/data/util";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { statusMeta, type ReihenblockStatus } from "@/lib/domain/reihenbloecke";

const kachelReihenfolge: ReihenblockStatus[] = [
  "erntereif",
  "bepflanzt",
  "rueckschnitt",
  "ruhend",
  "wartezeitgesperrt",
];

// Reihenblock-Statusverwaltung aus der Datenbank (Meilenstein B).
// Der Filter laeuft ueber die Adresszeile, damit die Ansicht serverseitig
// gerendert bleibt und ein Link auf einen gefilterten Stand teilbar ist.
export async function ReihenbloeckeAnsicht({
  pfad,
  statusFilter,
}: {
  pfad: string;
  statusFilter?: string;
}) {
  const [liste, mittel, sorten, profil, t] = await Promise.all([
    ladeReihenbloecke(),
    ladePsmMittel(),
    ladeSorten(),
    getSessionProfile(),
    getTranslations("reihenbloeckeDemo"),
  ]);
  const sortenOptionen = sorten.map((sorte) => ({ wert: sorte.id, text: sorte.name }));
  const s = await getTranslations("reihenblockStatus");
  const hint = await getTranslations("reihenblockStatusHint");
  const a = await getTranslations("aktionen");

  const aktiverFilter = (kachelReihenfolge as string[]).includes(statusFilter ?? "")
    ? (statusFilter as ReihenblockStatus)
    : null;

  const zeilen = aktiverFilter
    ? liste.bloecke.filter((block) => block.status === aktiverFilter)
    : liste.bloecke;

  const live = liste.quelle === "db";
  const darfStatusAendern = live && hasPermission(profil?.role, "reihenbloecke", "update");
  const darfFreigeben = live && hasPermission(profil?.role, "reihenbloecke", "approve");
  const darfBehandeln = live && hasPermission(profil?.role, "pflanzenschutz", "create");

  return (
    <div className="space-y-6">
      <Section
        title={t("distributionTitle")}
        description={t("distributionLead")}
        action={<DatenquelleBadge quelle={liste.quelle} />}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {kachelReihenfolge.map((status) => {
            const aktiv = aktiverFilter === status;
            return (
              <Link
                key={status}
                href={{
                  pathname: pfad,
                  query: aktiv ? {} : { status },
                }}
                scroll={false}
                className={`rounded-xl border p-3 text-left transition ${
                  aktiv
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <p className="text-2xl font-black text-foreground">
                  {liste.counts[status]}
                </p>
                <p className="mt-1 text-xs font-semibold text-card-foreground">
                  {s(status)}
                </p>
                <p className="mt-1 text-[10px] leading-3 text-muted-foreground">
                  {hint(statusMeta[status].hintKey)}
                </p>
              </Link>
            );
          })}
        </div>
      </Section>

      <div className="rounded-xl border border-destructive/25 bg-destructive/[0.06] p-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-destructive" />
          <p className="text-sm font-black text-destructive">{t("lockTitle")}</p>
        </div>
        <p className="mt-1 text-sm leading-6 text-foreground">{t("lockLead")}</p>
      </div>

      <Section
        title={t("tableTitle")}
        description={aktiverFilter ? t("tableLeadFiltered") : t("tableLeadAll")}
      >
        <DataTable
          head={[
            t("col.id"),
            t("col.parzelle"),
            t("col.sorte"),
            t("col.status"),
            t("col.letzteErnte"),
            t("col.sperre"),
            ...(darfStatusAendern || darfFreigeben ? [a("spalte")] : []),
          ]}
        >
          {zeilen.map((block) => {
            const gesperrt = block.status === "wartezeitgesperrt";
            return (
              <tr key={block.id}>
                <td className="px-3 py-2.5 font-mono text-xs font-semibold text-foreground">
                  {block.code}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {block.parzelle}
                  {block.reihengruppe ? ` - ${block.reihengruppe}` : ""}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{block.sorte}</td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={statusMeta[block.status].tone as Tone}>
                    {s(block.status)}
                  </StatusPill>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {block.letzteErnte ?? "-"}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {block.sperre ? (
                    <span>
                      <span
                        className={
                          block.sperre.faellig
                            ? "font-semibold text-success"
                            : "font-semibold text-destructive"
                        }
                      >
                        {t("freeAt")} {block.sperre.freigabeAm}
                        {block.sperre.faellig
                          ? ` · ${a("faellig")}`
                          : ` · ${a("resttage", { tage: block.sperre.resttage })}`}
                      </span>
                      <br />
                      {block.sperre.mittel} · {block.sperre.wartezeitTage}{" "}
                      {t("days")}
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                {darfStatusAendern || darfFreigeben ? (
                  <td className="px-3 py-2.5">
                    <div className="space-y-1.5">
                      {gesperrt ? (
                        block.sperre?.faellig && darfFreigeben ? (
                          <FreigabeKnopf id={block.id} />
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {a("gesperrtHinweis")}
                          </span>
                        )
                      ) : darfStatusAendern ? (
                        <StatusWechsel
                          id={block.id}
                          code={block.code}
                          status={block.status}
                        />
                      ) : null}
                      {/* Anforderung 2.1: Umbenennung/Sortenkorrektur ist keine
                          Ernteaktion - unabhaengig vom Sperrzustand verfuegbar. */}
                      {darfStatusAendern ? (
                        <StammdatenBearbeiten
                          id={block.id}
                          code={block.code}
                          sorteId={block.sorteId}
                          sorten={sortenOptionen}
                        />
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </DataTable>
      </Section>

      {darfBehandeln && mittel.length > 0 ? (
        <BehandlungFormular
          heute={heuteIso()}
          bloecke={liste.bloecke
            .filter((block) => block.status !== "wartezeitgesperrt")
            .map((block) => ({
              wert: block.id,
              text: `${block.code} - ${block.parzelle}`,
            }))}
          mittel={mittel.map((m) => ({
            wert: m.id,
            text: `${m.name} (${m.wartezeitTage} ${t("days")})`,
          }))}
        />
      ) : null}

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">
        {t("note")}
      </Card>
    </div>
  );
}
