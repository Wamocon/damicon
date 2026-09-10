import { getFormatter, getTranslations } from "next-intl/server";
import { Card, Section, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  ParzelleFormular,
  PlantageFormular,
  ReihenblockFormular,
  ReihengruppeFormular,
  type AuswahlOption,
} from "@/components/db/standort-formulare";
import { ladeSorten, ladeStandortBaum } from "@/lib/data/standort";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// Standort-Hierarchie aus der Datenbank inklusive Verwaltungsoberflaeche
// (Meilenstein B). Ersetzt die reine Anzeige-Demo aus Meilenstein A.
export async function StandortAnsicht() {
  const [baum, sorten, profil, t] = await Promise.all([
    ladeStandortBaum(),
    ladeSorten(),
    getSessionProfile(),
    getTranslations("standortDemo"),
  ]);
  const v = await getTranslations("standortVerwaltung");
  const f = await getFormatter();

  const darfAnlegen =
    baum.quelle === "db" &&
    Boolean(baum.betriebId) &&
    hasPermission(profil?.role, "standort", "create");

  const plantagenOptionen: AuswahlOption[] = baum.plantagen.map((p) => ({
    wert: p.id,
    text: p.name,
  }));
  const parzellenOptionen: AuswahlOption[] = baum.plantagen.flatMap((p) =>
    p.parzellen.map((parzelle) => ({
      wert: parzelle.id,
      text: `${p.name} · ${parzelle.name}`,
    })),
  );
  const gruppenOptionen: AuswahlOption[] = baum.plantagen.flatMap((p) =>
    p.parzellen.flatMap((parzelle) =>
      parzelle.reihengruppen.map((gruppe) => ({
        wert: gruppe.id,
        text: `${parzelle.name} · ${gruppe.name}`,
      })),
    ),
  );
  const sortenOptionen: AuswahlOption[] = sorten.map((sorte) => ({
    wert: sorte.id,
    text: sorte.name,
  }));

  const kennzahlen: [string, string | number][] = [
    ["plantagen", baum.stats.plantagen],
    ["parzellen", baum.stats.parzellen],
    ["reihengruppen", baum.stats.reihengruppen],
    ["reihenbloecke", baum.stats.reihenbloecke],
    [
      "flaeche",
      `${f.number(baum.stats.flaecheHa, { maximumFractionDigits: 1 })} ha`,
    ],
  ];

  return (
    <div className="space-y-6">
      <Section
        title={t("statsTitle")}
        description={t("statsLead")}
        action={<DatenquelleBadge quelle={baum.quelle} />}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {kennzahlen.map(([key, value]) => (
            <Card key={key} className="p-4">
              <p className="text-2xl font-black text-foreground">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`level.${key}`)}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={t("treeTitle")} description={t("treeLead")}>
        <div className="space-y-3">
          {baum.plantagen.map((plantage) => (
            <Card key={plantage.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-card-foreground">
                    {plantage.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{plantage.ort}</p>
                </div>
                <StatusPill tone={plantage.typ === "eigen" ? "success" : "info"}>
                  {t(`typ.${plantage.typ}`)}
                </StatusPill>
              </div>
              <div className="mt-3 space-y-2 border-l-2 border-border pl-3">
                {plantage.parzellen.map((parzelle) => (
                  <div key={parzelle.id}>
                    <p className="text-xs font-semibold text-foreground">
                      {parzelle.name} · {parzelle.flaecheHa} ha
                      {parzelle.sorte ? ` · ${parzelle.sorte}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {parzelle.reihengruppen.map((gruppe) => (
                        <span
                          key={gruppe.id}
                          className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {gruppe.name} · {v(`spalier.${gruppe.spalierrichtung}`)} ·{" "}
                          {gruppe.reihenbloecke} {t("blocksShort")}
                        </span>
                      ))}
                      {parzelle.reihengruppen.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">
                          {v("leer.reihengruppen")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
                {plantage.parzellen.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    {v("leer.parzellen")}
                  </p>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {darfAnlegen ? (
        <Section title={v("titel")} description={v("lead")}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PlantageFormular betriebId={baum.betriebId!} />
            <ParzelleFormular
              plantagen={plantagenOptionen}
              sorten={sortenOptionen}
            />
            <ReihengruppeFormular parzellen={parzellenOptionen} />
            <ReihenblockFormular
              gruppen={gruppenOptionen}
              sorten={sortenOptionen}
            />
          </div>
        </Section>
      ) : baum.quelle === "db" ? (
        <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">
          {v("keinRecht")}
        </Card>
      ) : null}

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">
        {t("note")}
      </Card>
    </div>
  );
}
