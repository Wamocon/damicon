"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { usePersona } from "@/components/dashboard/persona";
import { hasPermission } from "@/lib/rbac";
import { modulesForZone, zones, type ZoneKey } from "@/lib/modules";

// Die oberste Navigationsebene: Uebersicht und die vier Bereiche, samt der
// Frage, welches Ziel gerade offen ist.
//
// Herausgeloest aus SidebarRail, als die untere Leiste auf dem Handy dieselben
// fuenf Ziele tragen sollte. Diese Fassung der Leiste ist inzwischen ersetzt
// (sie traegt jetzt Menue, KI und Konto), die Trennung bleibt trotzdem: die
// Zone der geoeffneten Seite braucht auch sidebar.tsx selbst, einmal fuer die
// Symbolleiste und einmal, um die richtige Bereichsgruppe aufzuklappen.

export interface NavZiel {
  /** "overview" oder der Bereichsschluessel. */
  key: "overview" | ZoneKey;
  href: string;
  /** Name aus der Symbolablage (components/icon.tsx). */
  icon: string;
  name: string;
  /** Genau diese Seite ist geoeffnet - traegt aria-current="page". */
  aktuelleSeite: boolean;
  /**
   * Die geoeffnete Seite liegt in diesem Ziel, also auch auf einer Modulseite
   * darunter. Ohne diese Unterscheidung zeigte die Leiste auf einer Modulseite
   * gar nicht an, wo man steht.
   */
  imZiel: boolean;
}

/** Bereich der geoeffneten Seite, gelesen aus /dashboard/<zone>/<modul>. */
export function useAktiveZone(): ZoneKey | null {
  const pathname = usePathname();
  const segment = pathname.split("/")[2];
  return zones.find((zone) => zone.key === segment)?.key ?? null;
}

export function useNavZiele(): NavZiel[] {
  const { role } = usePersona();
  const nav = useTranslations("nav");
  const zoneT = useTranslations("zones");
  const aktiveZone = useAktiveZone();
  // Bewusst der genaue Pfad und nicht der Praefixvergleich aus useIsActive:
  // sonst gaelte auf einer Modulseite auch der Bereich als geoeffnete Seite,
  // obwohl die Bereichsseite selbst gar nicht offen ist.
  const pathname = usePathname();

  const ziele: NavZiel[] = [
    {
      key: "overview",
      href: "/dashboard",
      icon: "layout-dashboard",
      name: nav("overview"),
      aktuelleSeite: pathname === "/dashboard",
      imZiel: pathname === "/dashboard",
    },
  ];

  for (const zone of zones) {
    // Ein Bereich, in dem die Rolle kein einziges Modul sehen darf, steht auch
    // nicht in der Navigation - sonst fuehrt das Ziel auf eine leere Seite.
    const sichtbar = modulesForZone(zone.key).some((module) =>
      hasPermission(role, module.resource, "view"),
    );
    if (!sichtbar) continue;

    const href = `/dashboard/${zone.key}`;
    ziele.push({
      key: zone.key,
      href,
      icon: zone.icon,
      name: zoneT(`${zone.key}.name`),
      aktuelleSeite: pathname === href,
      imZiel: aktiveZone === zone.key,
    });
  }

  return ziele;
}
