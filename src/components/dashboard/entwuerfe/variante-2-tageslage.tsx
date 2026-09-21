"use client";

// Variante 2: eine Zeile Tageslage ueber den Kennzahlen.
//
// Die Uebersicht zeigt heute nur Zustaende: Kennzahlen, Zonen, Meilensteine.
// Keine davon beantwortet die Frage, mit der jemand morgens das Portal
// oeffnet - was liegt heute an. Diese Variante stellt vier Zahlen mit
// Handlungsbezug nach oben, jede ein Verweis in das Modul, in dem die Arbeit
// stattfindet. Sie zaehlen aus denselben Tabellen, aus denen die Module
// lesen, nicht aus einer eigenen Quelle.
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { kachelVerweis, Section, StatusPill } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import { hasPermission, type Resource, type Role } from "@/lib/rbac";

/** Was die Entwurfsroute serverseitig zaehlt. */
export interface Tageslage {
  /** Pflueckaufgaben, die weder abgeschlossen noch in Belegpruefung sind. */
  aufgabenOffen: number;
  /** Reihenbloecke mit laufender Wartezeit nach Pflanzenschutz. */
  bloeckeGesperrt: number;
  /** Davon solche, deren Wartezeit abgelaufen ist - sie warten auf Freigabe. */
  bloeckeFaellig: number;
  /** Reklamationen mit Status offen oder in Pruefung. */
  reklamationenOffen: number;
  /** Dokumente mit Status abgelaufen. */
  dokumenteAbgelaufen: number;
}

interface Posten {
  key: string;
  resource: Resource;
  pfad: string;
  icon: string;
  wert: number;
  /** Zusatz unter der Zahl, wenn es etwas zu sagen gibt. */
  hinweis?: string;
  ton: "danger" | "warning" | "info" | "neutral";
}

function LagePosten({ posten }: { posten: Posten }) {
  const t = useTranslations("dashboard.entwurf");
  const akzent =
    posten.wert === 0
      ? "text-muted-foreground"
      : posten.ton === "danger"
        ? "text-destructive"
        : posten.ton === "warning"
          ? "text-warning"
          : "text-foreground";

  return (
    <Link href={posten.pfad} className={cn(kachelVerweis, "p-4")}>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name={posten.icon} className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 text-[11px] font-medium leading-4 text-muted-foreground">
          {t(`lage.${posten.key}`)}
        </p>
        <ArrowRight
          aria-hidden
          className="h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-0.5"
        />
      </div>
      <p className={cn("mt-3 text-3xl font-black tabular-nums", akzent)}>
        {posten.wert}
      </p>
      {posten.hinweis ? (
        <p className="mt-auto pt-2 text-[10px] leading-4 text-muted-foreground">
          {posten.hinweis}
        </p>
      ) : null}
    </Link>
  );
}

export function TageslageAbschnitt({
  role,
  lage,
  stand,
}: {
  role: Role;
  lage: Tageslage;
  /** Zeitpunkt der Zaehlung, im Gebietsschema des Lesers formatiert. */
  stand: string;
}) {
  const t = useTranslations("dashboard.entwurf");

  const alle: Posten[] = [
    {
      key: "aufgabenOffen",
      resource: "pflueckaufgaben",
      pfad: "/dashboard/feld/pflueckaufgaben",
      icon: "clipboard-check",
      wert: lage.aufgabenOffen,
      ton: lage.aufgabenOffen > 0 ? "info" : "neutral",
    },
    {
      key: "bloeckeGesperrt",
      resource: "reihenbloecke",
      pfad: "/dashboard/feld/reihenbloecke",
      icon: "grid-3x3",
      wert: lage.bloeckeGesperrt,
      hinweis:
        lage.bloeckeFaellig > 0
          ? t("lage.bloeckeFaellig", { anzahl: lage.bloeckeFaellig })
          : undefined,
      ton: lage.bloeckeFaellig > 0 ? "warning" : "neutral",
    },
    {
      key: "reklamationenOffen",
      resource: "reklamationen",
      pfad: "/dashboard/markt/reklamationen",
      icon: "message-square-warning",
      wert: lage.reklamationenOffen,
      ton: lage.reklamationenOffen > 0 ? "warning" : "neutral",
    },
    {
      key: "dokumenteAbgelaufen",
      resource: "dokumente",
      pfad: "/dashboard/buero/dokumente",
      icon: "file-check-2",
      wert: lage.dokumenteAbgelaufen,
      ton: lage.dokumenteAbgelaufen > 0 ? "danger" : "neutral",
    },
  ];

  // Dieselbe Rechtepruefung wie in der Seitenleiste: wer das Modul nicht
  // oeffnen darf, bekommt auch seine Zahl nicht zu sehen.
  const sichtbar = alle.filter((posten) =>
    hasPermission(role, posten.resource, "view"),
  );
  if (sichtbar.length === 0) return null;

  return (
    <Section
      title={t("lage.titel")}
      description={t("lage.beschreibung")}
      action={<StatusPill tone="neutral">{t("lage.stand", { stand })}</StatusPill>}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sichtbar.map((posten) => (
          <LagePosten key={posten.key} posten={posten} />
        ))}
      </div>
    </Section>
  );
}
