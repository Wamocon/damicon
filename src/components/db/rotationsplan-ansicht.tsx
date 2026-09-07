import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, Stat, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  RotationsplanGenerierenFormular,
  RotationsplanReaktivierenFormular,
  RotationsplanUeberspringenFormular,
} from "@/components/db/rotationsplan-formulare";
import { ladeRotationsplan } from "@/lib/data/rotationsplan";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { rotationsplanStatusMeta } from "@/lib/domain/rotationsplan";

// Rotationsplan (Anforderung 2.2, P1). Cockpit-Aufbau wie lohn-ansicht.tsx:
// Kennzahlen oben, Erzeuger-Formular fuer berechtigte Rollen, eine Tabelle mit
// den naechsten Terminen je Reihenblock.
export async function RotationsplanAnsicht() {
  const [uebersicht, profil, t] = await Promise.all([
    ladeRotationsplan(),
    getSessionProfile(),
    getTranslations("rotationsplanAnsicht"),
  ]);
  const st = await getTranslations("rotationsplanStatus");
  const format = await getFormatter();

  const live = uebersicht.quelle === "db";
  const darfPlanen = live && hasPermission(profil?.role, "rotationsplan", "create");
  const darfPflegen = live && hasPermission(profil?.role, "rotationsplan", "update");

  const datum = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00`), { dateStyle: "medium" });

  const { eintraege } = uebersicht;
  const geplant = eintraege.filter((e) => e.status === "geplant" && !e.ueberfaellig).length;
  const ueberfaellig = eintraege.filter((e) => e.ueberfaellig).length;
  const gesperrt = eintraege.filter((e) => e.status === "gesperrt").length;
  const erledigt = eintraege.filter((e) => e.status === "erledigt").length;

  return (
    <div className="space-y-6">
      <Section
        title={t("uebersichtTitel")}
        description={t("uebersichtLead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t("stat.geplant")} value={String(geplant)} />
          <Stat
            label={t("stat.ueberfaellig")}
            value={String(ueberfaellig)}
            helper={ueberfaellig > 0 ? t("stat.ueberfaelligHinweis") : undefined}
          />
          <Stat label={t("stat.gesperrt")} value={String(gesperrt)} helper={t("stat.gesperrtHinweis")} />
          <Stat label={t("stat.erledigt")} value={String(erledigt)} />
        </div>
      </Section>

      {darfPlanen ? <RotationsplanGenerierenFormular /> : null}

      <Section title={t("tabelleTitel")} description={t("tabelleLead")}>
        <DataTable
          head={[
            t("col.reihenblock"),
            t("col.sorte"),
            t("col.brigade"),
            t("col.termin"),
            t("col.intervall"),
            t("col.status"),
            t("col.aufgabe"),
            t("col.aktion"),
          ]}
        >
          {eintraege.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t("keineEintraege")}
              </td>
            </tr>
          ) : (
            eintraege.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2.5 font-mono text-xs font-semibold text-foreground">
                  {e.reihenblockCode}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{e.sorteName ?? "–"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{e.brigadeName ?? "–"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{datum(e.geplantFuer)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{e.intervallTage} {t("tage")}</td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={e.ueberfaellig ? "warning" : rotationsplanStatusMeta[e.status].tone}>
                    {e.ueberfaellig ? t("ueberfaelligLabel") : st(e.status)}
                  </StatusPill>
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                  {e.pflueckaufgabeCode ?? "–"}
                </td>
                <td className="px-3 py-2.5">
                  {darfPflegen && (e.status === "geplant" || e.ueberfaellig) ? (
                    <RotationsplanUeberspringenFormular id={e.id} />
                  ) : darfPflegen && e.status === "uebersprungen" ? (
                    <RotationsplanReaktivierenFormular id={e.id} />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">–</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </DataTable>
      </Section>

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
