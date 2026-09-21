"use client";

// Die Uebersicht ist die Startseite der Anwendung. Sie beginnt deshalb mit
// einer Anrede, dem Datum und einem Satz, der auf die Arbeit zeigt - nicht
// mit dem Produktnamen, der in der Seitenleiste und in der Kopfzeile ohnehin
// schon steht.
import { useTranslations } from "next-intl";
import { usePersona } from "@/components/dashboard/persona";
import { Card, StatusPill } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import type { Kpi } from "@/lib/domain/kpis";
import { zielAuswerten } from "./zielstand";
import type { Tageszeit } from "./tageszeit";

/**
 * Der Teil des Namens, mit dem man jemanden anspricht.
 *
 * "Daniyar Omarov" wird zu "Daniyar". "D. Sarsenbaj" behaelt beide Teile:
 * ein abgekuerzter Vorname ist keine Anrede. Dieselbe Ueberlegung wie bei
 * initialen() in benutzer-fuss.tsx, nur in die andere Richtung.
 */
export function anredeName(name: string): string {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return name;
  const erster = teile[0];
  if (erster.length <= 2 || erster.endsWith(".")) return name;
  return erster;
}

/** Die Lage in einem Satz: wie viele Kennzahlen ihr Ziel nicht halten. */
function LageKopf({ kpis }: { kpis: Kpi[] }) {
  const t = useTranslations("dashboard.entwurf.lageKopf");

  // Gezaehlt wird nur, was gemessen ist. Ein Platzhalter ist ein
  // unterschriebener Ausgangswert, sein Abstand zum Ziel sagt nichts.
  const gemessen = kpis
    .map((kpi) => zielAuswerten(kpi))
    .filter((a) => !a.platzhalter && a.stand !== "offen");
  const daneben = gemessen.filter(
    (a) => a.stand === "verfehlt" || a.stand === "knapp",
  ).length;
  const verfehlt = gemessen.filter((a) => a.stand === "verfehlt").length;

  const ton = gemessen.length === 0 ? "neutral" : daneben === 0 ? "success" : verfehlt > 0 ? "danger" : "warning";
  const text =
    gemessen.length === 0
      ? t("ohneMessung")
      : daneben === 0
        ? t("alleImZiel")
        : t("ausserhalb", { anzahl: daneben });

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <p className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
        {t("titel")}
      </p>
      <StatusPill tone={ton}>{text}</StatusPill>
    </div>
  );
}

export interface BegruessungProps {
  tageszeit: Tageszeit;
  /** Im Gebietsschema des Lesers formatiert, serverseitig. */
  datum: string;
  /** Welcher der acht Saetze heute dran ist, serverseitig bestimmt. */
  spruch: number;
  kpis: Kpi[];
  /** Variante C: die Lage des Betriebs neben der Anrede. */
  mitLage?: boolean;
}

/** Der Inhalt ohne eigene Box - Variante C setzt ihn in die Zonenbox. */
export function BegruessungsInhalt({
  tageszeit,
  datum,
  spruch,
  kpis,
  mitLage = false,
}: BegruessungProps) {
  const { name, role } = usePersona();
  const t = useTranslations("dashboard.begruessung");
  const roleT = useTranslations("roles");

  // Ohne Namen wird ohne Namen gegruesst. Die Mailadresse taugt nicht als
  // Anrede, auch wenn benutzer-fuss.tsx sie als Bezeichnung einsetzt.
  const titel = name
    ? t(tageszeit, { name: anredeName(name) })
    : t(`${tageszeit}OhneNamen`);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
          {datum}
        </p>
        <h1 className="mt-1 text-2xl font-black text-foreground md:text-3xl">
          {titel}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t(`spruch.${spruch}`)}
        </p>
      </div>
      <div className="flex shrink-0 items-start gap-4">
        {mitLage ? <LageKopf kpis={kpis} /> : null}
        <StatusPill tone="info">{roleT(role)}</StatusPill>
      </div>
    </div>
  );
}

export function BegruessungsBox({
  className,
  ...props
}: BegruessungProps & { className?: string }) {
  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <BegruessungsInhalt {...props} />
    </Card>
  );
}
