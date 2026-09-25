"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { usePersona } from "@/components/dashboard/persona";
import { useAktiveZone } from "@/components/dashboard/sidebar-zustand";
import {
  moduleByPath,
  moduleHref,
  sichtbareModule,
  zones,
  type ZoneKey,
} from "@/lib/modules";

// Die Navigationsziele des Menue-Blatts als Listen: oben Uebersicht und die
// vier Bereiche (useNavZiele), darunter die Module eines Bereichs
// (useModulZiele) - beide gefiltert nach dem, was die Rolle sehen darf, samt
// der Frage, welches Ziel gerade offen ist.
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
      icon: "house",
      name: nav("overview"),
      aktuelleSeite: pathname === "/dashboard",
      imZiel: pathname === "/dashboard",
    },
  ];

  for (const zone of zones) {
    // Ein Bereich, in dem die Rolle kein einziges Modul sehen darf, steht auch
    // nicht in der Navigation - sonst fuehrt das Ziel auf eine leere Seite.
    if (sichtbareModule(role, zone.key).length === 0) continue;

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

export interface ModulZiel {
  /** Schluessel aus modules.ts, dient auch als key der Liste. */
  key: string;
  href: string;
  /** Name aus der Symbolablage (components/icon.tsx). */
  icon: string;
  name: string;
  /** Genau diese Seite ist geoeffnet - traegt aria-current="page". */
  aktuelleSeite: boolean;
}

/**
 * Die Module eines Bereichs als fertige Ziele - die zweite Ebene des
 * Menue-Blatts auf dem Handy (dashboard/untere-leiste.tsx).
 *
 * Kurznamen wie in der Seitenleiste: der ausgeschriebene Titel passt in keiner
 * der vier Sprachen in eine Zeile, auf Kasachisch braucht er bis zu 326 px.
 *
 * Die Bereichsseite selbst steht bewusst nicht in dieser Liste, obwohl sie im
 * Blatt als erste Zeile darueber steht. Sie ist kein Modul, holt Symbol und
 * Namen aus zones statt aus modules, und ein Feld "ist der Bereich selbst"
 * haette jede Zeile mitzuschleppen, nur damit eine einzige es setzt.
 */
export function useModulZiele(zone: ZoneKey | null): ModulZiel[] {
  const { role } = usePersona();
  const moduleT = useTranslations("modules");
  const pathname = usePathname();

  if (!zone) return [];

  return sichtbareModule(role, zone).map((module) => {
    const href = moduleHref(module);
    return {
      key: module.key,
      href,
      icon: module.icon,
      name: moduleT(`${module.key}.navTitle`),
      aktuelleSeite: pathname === href,
    };
  });
}

export interface PfadStation {
  /** Fehlt genau bei der geoeffneten Seite - das entscheidet ueber Link oder
   *  aria-current, wie im WAI-ARIA-Muster "breadcrumb". */
  href?: string;
  text: string;
  /** Die Uebersicht steht als Haus statt als Wort. */
  alsHaus?: boolean;
}

/**
 * Der Weg zur geoeffneten Seite, abgeleitet aus dem Adresspfad.
 *
 * Eine einzige Ableitung fuer zwei Anzeigen: die Brotkrumen in der Kopfzeile
 * ab md (topbar-pfad.tsx) und den einstufigen Rueckweg darunter (topbar.tsx).
 * Frueher rechnete jede Seite ihre Brotkrumen selbst und die Kopfzeile ihren
 * Rueckweg noch einmal daneben - zwei Ableitungen derselben Frage, die
 * auseinanderlaufen konnten, ohne dass es auffaellt.
 *
 * Auf Seiten neben den Bereichen, etwa /dashboard/sicherheit, endet die Liste
 * mit einem Link statt mit der geoeffneten Seite: der Rueckweg dorthin ist
 * bekannt, ein Name fuer die Seite selbst nicht.
 */
export function useSeitenPfad(): PfadStation[] {
  const pathname = usePathname();
  const nav = useTranslations("nav");
  const zoneT = useTranslations("zones");
  const moduleT = useTranslations("modules");

  // Ohne Sprachpraefix, das nimmt usePathname aus @/i18n/navigation schon weg:
  // ["dashboard"], ["dashboard", <zone>] oder ["dashboard", <zone>, <modul>].
  const segmente = pathname.split("/").filter(Boolean);
  if (segmente[0] !== "dashboard") return [];

  const haus: PfadStation = {
    href: segmente.length > 1 ? "/dashboard" : undefined,
    text: nav("overview"),
    alsHaus: true,
  };
  if (segmente.length === 1) return [haus];

  const zone = zones.find((z) => z.key === segmente[1]);
  if (!zone) return [haus];

  const modul = segmente[2] ? moduleByPath(zone.key, segmente[2]) : null;
  const stationen: PfadStation[] = [
    haus,
    {
      href: modul ? `/dashboard/${zone.key}` : undefined,
      text: zoneT(`${zone.key}.name`),
    },
  ];
  if (modul) stationen.push({ text: moduleT(`${modul.key}.navTitle`) });
  return stationen;
}

/**
 * Die Seite eine Ebene ueber der geoeffneten, oder null auf der Uebersicht
 * selbst. Auf dem Handy traegt die Kopfzeile sie als Weg zurueck
 * (topbar.tsx), statt Bildmarke und Namen zu wiederholen.
 *
 * Das ist die letzte Station des Pfades, die noch ein Ziel hat - auf einer
 * Modulseite der Bereich, sonst die Uebersicht.
 */
export function useElternSeite(): { href: string; text: string } | null {
  const stationen = useSeitenPfad();
  for (let i = stationen.length - 1; i >= 0; i -= 1) {
    const station = stationen[i]!;
    if (station.href) return { href: station.href, text: station.text };
  }
  return null;
}
