"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { usePersona } from "@/components/dashboard/persona";
import { useAktiveZone } from "@/components/dashboard/sidebar-zustand";
import { hasPermission } from "@/lib/rbac";
import { modulesForZone, zones, type ZoneKey } from "@/lib/modules";

// Die oberste Navigationsebene als Liste: Uebersicht und die vier Bereiche,
// gefiltert nach dem, was die Rolle sehen darf, samt der Frage, welches Ziel
// gerade offen ist.
//
// Herausgeloest aus SidebarRail, als die untere Leiste auf dem Handy dieselben
// fuenf Ziele tragen sollte. Diese Fassung der Leiste ist inzwischen ersetzt
// (sie traegt jetzt Menue, KI und Konto), die Liste bleibt trotzdem eigen:
// SidebarRail mischte vorher drei Dinge in einer Funktion - die Auswahl der
// Ziele, die Frage nach dem aktiven Ziel und die Darstellung als Spalte.
//
// Nicht zu verwechseln mit useAktiveZone aus sidebar-zustand.ts: das ist die
// nackte Zone der offenen Seite, die auch die Bereichsgruppen brauchen. Hier
// wird sie zu fertigen Zielen samt Namen, Symbol und Rechtepruefung verarbeitet.

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
