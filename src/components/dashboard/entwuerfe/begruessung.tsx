"use client";

// Die Uebersicht ist die Startseite der Anwendung. Sie beginnt deshalb mit
// einer Anrede und dem Datum, nicht mit dem Produktnamen - der steht in der
// Seitenleiste und in der Kopfzeile ohnehin schon zweimal.
import { useTranslations } from "next-intl";
import { usePersona } from "@/components/dashboard/persona";
import { PageHeader, StatusPill } from "@/components/ui/kit";
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

export function BegruessungsKopf({
  tageszeit,
  datum,
}: {
  tageszeit: Tageszeit;
  /** Im Gebietsschema des Lesers formatiert, serverseitig. */
  datum: string;
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
    <PageHeader eyebrow={datum} title={titel} description={t("beschreibung")}>
      <StatusPill tone="info">{roleT(role)}</StatusPill>
    </PageHeader>
  );
}
