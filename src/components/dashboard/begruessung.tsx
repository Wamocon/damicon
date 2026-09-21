"use client";

// Die Uebersicht ist die Startseite der Anwendung. Sie beginnt deshalb mit
// einer Anrede, dem Datum und einem Satz, der auf die Arbeit zeigt - nicht
// mit dem Produktnamen, der in der Seitenleiste und in der Kopfzeile ohnehin
// schon steht.
import { useTranslations } from "next-intl";
import { usePersona } from "@/components/dashboard/persona";
import { Card, StatusPill } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import type { Tageszeit } from "@/lib/domain/tageszeit";

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

export function BegruessungsBox({
  tageszeit,
  datum,
  spruch,
  className,
}: {
  tageszeit: Tageszeit;
  /** Im Gebietsschema des Lesers formatiert, serverseitig. */
  datum: string;
  /** Welcher der Saetze heute dran ist, serverseitig bestimmt. */
  spruch: number;
  className?: string;
}) {
  const { name, role } = usePersona();
  const t = useTranslations("dashboard.begruessung");
  const roleT = useTranslations("roles");

  // Ohne Namen wird ohne Namen gegruesst. Die Mailadresse taugt nicht als
  // Anrede, auch wenn benutzer-fuss.tsx sie als Bezeichnung einsetzt.
  const titel = name
    ? t(tageszeit, { name: anredeName(name) })
    : t(`${tageszeit}OhneNamen`);

  return (
    <Card className={cn("p-5 sm:p-6", className)}>
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
        <StatusPill tone="info" className="shrink-0">
          {roleT(role)}
        </StatusPill>
      </div>
    </Card>
  );
}
