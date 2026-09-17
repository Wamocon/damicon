import { Download } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  DossierAktualisierenFormular,
  DossierAnlegenFormular,
} from "@/components/db/foerdermittel-formulare";
import { istFristUeberfaellig, ladeFoerdermittel } from "@/lib/data/foerdermittel";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

const statusTon: Record<string, Tone> = {
  entwurf: "neutral",
  eingereicht: "neutral",
  in_pruefung: "warning",
  bewilligt: "success",
  abgelehnt: "danger",
  ausgezahlt: "success",
};

// Foerdermitteldossier als eigenstaendiges Buero-Modul (Anforderung 4.12):
// Status/Frist pflegen, angehaengte Nachweisdokumente sehen. Echte
// Antragsvorlagen fuer gosagro.kz/qoldau.kz sind bewusst nicht Teil dieser
// Ansicht (siehe Migrationskopf 20260925000000).
export async function FoerdermittelAnsicht() {
  const [uebersicht, profil, t] = await Promise.all([
    ladeFoerdermittel(),
    getSessionProfile(),
    getTranslations("foerdermittelAnsicht"),
  ]);
  const statusT = await getTranslations("foerdermittelAnsicht.status");
  const format = await getFormatter();

  const live = uebersicht.quelle === "db";
  const darfAnlegen = live && hasPermission(profil?.role, "foerdermittel", "create");
  const darfAktualisieren = live && hasPermission(profil?.role, "foerdermittel", "update");

  const datum = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium" }) : "-";

  return (
    <div className="space-y-6">
      <Section
        title={t("titel")}
        description={t("lead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        <DataTable
          head={[
            t("col.titel"),
            t("col.portal"),
            t("col.status"),
            t("col.eingereichtAm"),
            t("col.fristAm"),
            t("col.dokumente"),
          ]}
        >
          {uebersicht.dossiers.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t("keineDossiers")}
              </td>
            </tr>
          ) : (
            uebersicht.dossiers.map((d) => {
              const ueberfaellig = istFristUeberfaellig(d);
              return (
                <tr key={d.id}>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-foreground">{d.titel}</p>
                    {d.antragsnummer ? (
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {d.antragsnummer}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{d.portal}</td>
                  <td className="px-3 py-2.5">
                    <StatusPill tone={statusTon[d.status] ?? "neutral"}>
                      {statusT(d.status)}
                    </StatusPill>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{datum(d.eingereichtAm)}</td>
                  <td className="px-3 py-2.5">
                    {d.fristAm ? (
                      <StatusPill tone={ueberfaellig ? "danger" : "neutral"}>
                        {datum(d.fristAm)}
                      </StatusPill>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {d.dokumente.length === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {d.dokumente.map((doc) =>
                          // Mit hinterlegter Datei ein signierter Link, sonst
                          // wie bisher nur der Name - ein toter Link waere
                          // schlechter als gar keiner.
                          doc.dateiUrl ? (
                            <a
                              key={doc.id}
                              href={doc.dateiUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-primary hover:underline"
                            >
                              <Download className="h-3 w-3" />
                              {doc.name}
                            </a>
                          ) : (
                            <span
                              key={doc.id}
                              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground"
                            >
                              {doc.name}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </DataTable>
      </Section>

      {darfAnlegen ? <DossierAnlegenFormular /> : null}
      {darfAktualisieren && uebersicht.dossiers.length > 0 ? (
        <DossierAktualisierenFormular dossiers={uebersicht.dossiers} />
      ) : null}

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
