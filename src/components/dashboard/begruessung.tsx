"use client";

// Die Uebersicht ist die Startseite der Anwendung. Sie beginnt deshalb mit
// einer Anrede, dem Datum und einem Satz, der auf die Arbeit zeigt - nicht
// mit dem Produktnamen, der in der Seitenleiste und in der Kopfzeile ohnehin
// schon steht.
//
// Seit dem 23.09.2026 zweispaltig: links die Anrede, rechts die eine Zahl, mit der diese
// Rolle den Tag beginnt (startkarte-*.tsx, ausgewaehlt in lib/domain/startkarte.ts). Vorher
// trug die Karte vier Informationseinheiten und keine einzige Zahl - die rechte Haelfte war
// verschenkter Platz.
//
// Die Masse sind dabei enger geworden, der Spruch bleibt: er kam in Runde 3 dazu und gibt der
// Seite ihren Anfang. Am Handy stehen beide Haelften untereinander, Begruessung zuerst -
// dieselbe Lesereihenfolge wie am Schirm.
import type { ReactNode } from "react";
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
  rechts,
  className,
}: {
  tageszeit: Tageszeit;
  /** Im Gebietsschema des Lesers formatiert, serverseitig. */
  datum: string;
  /** Welcher der Saetze heute dran ist, serverseitig bestimmt. */
  spruch: number;
  /**
   * Die rechte Haelfte: eine Zahl, je nach Rolle eine andere. Serverseitig vorgerendert und
   * durchgereicht, weil diese Komponente "use client" ist (usePersona()).
   *
   * Ausgewaehlt wird nach der ECHTEN Profilrolle, nicht nach der umschaltbaren Vorschau -
   * sonst muesste der Server die Daten ALLER Rollen mitschicken, also auch Lohn- und
   * Bestelldaten an jemanden, der gerade Finanzen ansieht. Ein Admin in der Vorschau
   * "als Pfluecker" behaelt deshalb seine Finanzzahl.
   */
  rechts?: ReactNode;
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
    <Card ton="box" className={cn("@container p-4 sm:p-5", className)}>
      {/* Ohne rechte Haelfte bleibt es einspaltig ueber die volle Breite - kein leerer
          Kasten und keine Erklaerung, warum dort nichts steht. */}
      {/* Container-Abfrage und keine Fensterbreite: bei 1024 px Fenster ist die Karte nur
          720 px breit, weil Seitenleiste (304 px) und KI-Panel (bis 27rem) davon abgehen.
          Mit lg: (Fenster) stand die Begruessung dort in einer 238 px schmalen Spalte und
          das Datum brach Zeichen fuer Zeichen um. @3xl misst die Karte selbst: 48rem. */}
      <div className={cn("flex flex-col gap-4", rechts && "@3xl:flex-row @3xl:items-stretch @3xl:gap-6")}>
        <div className={cn("min-w-0", rechts && "@3xl:flex-1")}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">{datum}</p>
            <StatusPill tone="info" className="shrink-0">
              {roleT(role)}
            </StatusPill>
          </div>
          <h1 className="mt-1.5 text-xl font-black text-foreground md:text-2xl">{titel}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t(`spruch.${spruch}`)}
          </p>
        </div>

        {rechts ? (
          // Der Strich trennt die beiden Haelften nur, wo sie nebeneinander stehen. Am Handy
          // sitzt er oben und trennt sie untereinander.
          <div className="border-t border-border pt-4 @3xl:w-[22rem] @3xl:shrink-0 @3xl:border-l @3xl:border-t-0 @3xl:pl-6 @3xl:pt-0">
            {rechts}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
