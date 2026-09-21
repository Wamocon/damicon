"use client";

// Der Meilensteinblock in derselben Box-Form wie Begruessung und Zonen.
// Inhaltlich unveraendert gegenueber der heutigen Seite - ob er ueberhaupt
// auf der Startseite bleibt, ist eine eigene, offene Entscheidung.
import { useTranslations } from "next-intl";
import { Card, StatusPill } from "@/components/ui/kit";

function Meilenstein({
  name,
  faellig,
  punkte,
  fussnote,
}: {
  name: string;
  faellig: string;
  punkte: string[];
  fussnote?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-card-foreground">{name}</p>
        <StatusPill tone="success">{faellig}</StatusPill>
      </div>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {punkte.map((punkt, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
            {punkt}
          </li>
        ))}
      </ul>
      {fussnote ? (
        <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
          {fussnote}
        </p>
      ) : null}
    </div>
  );
}

export function MeilensteinBox() {
  const t = useTranslations("dashboard");
  return (
    <Card className="p-5 sm:p-6">
      <div>
        <h2 className="text-sm font-bold text-card-foreground">
          {t("home.milestoneTitle")}
        </h2>
        <p className="mt-0.5 schrift-dense text-muted-foreground">
          {t("home.milestoneDescription")}
        </p>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Meilenstein
          name={t("home.milestoneAName")}
          faellig={t("home.milestoneADue")}
          punkte={["tokens", "landing", "zones", "workflows"].map((k) =>
            t(`home.milestoneAItems.${k}`),
          )}
        />
        <Meilenstein
          name={t("home.milestoneBName")}
          faellig={t("home.milestoneBDue")}
          punkte={[
            "rbac",
            "hierarchy",
            "status",
            "tasks",
            "docs",
            "i18n",
            "kpi",
          ].map((k) => t(`home.milestoneBItems.${k}`))}
          fussnote={t("home.milestoneBNote")}
        />
      </div>
    </Card>
  );
}
