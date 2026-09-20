"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { usePathname } from "@/i18n/navigation";
import { zones, type ZoneKey } from "@/lib/modules";

// Zustand der Seitenleiste: ihre Breite und die offenen Bereichsgruppen.
//
// Eigenes Modul, weil daran Bausteine haengen, die einander nicht kennen: die
// Leiste als feste Spalte, dieselbe Leiste als Schublade unter md und der
// Umschalter in der Kopfzeile. Ein Kontext waere schwerer als noetig - es geht
// um ein Ja/Nein und eine Liste aus hoechstens vier Werten, und beides muss den
// Server-Render ueberstehen. Gleiches Muster wie persona.tsx.

// --- Breite: volle Spalte oder schmale Symbolleiste -------------------------
const SPEICHER = "damicon-sidebar-schmal";
const listener = new Set<() => void>();
let cache: boolean | null = null;

export function schmalAbonnieren(callback: () => void) {
  listener.add(callback);
  return () => {
    listener.delete(callback);
  };
}

export function istSchmal(): boolean {
  if (cache !== null) return cache;
  let gelesen = false;
  try {
    gelesen = localStorage.getItem(SPEICHER) === "1";
  } catch {
    // ignore
  }
  cache = gelesen;
  return gelesen;
}

/** Server kennt den Speicher nicht und rendert immer die volle Spalte. */
export function schmalServer(): boolean {
  return false;
}

export function schmalSetzen(wert: boolean) {
  cache = wert;
  try {
    localStorage.setItem(SPEICHER, wert ? "1" : "0");
  } catch {
    // ignore
  }
  listener.forEach((eintrag) => eintrag());
}

// --- Offene Bereichsgruppen -------------------------------------------------
// Gespeichert werden die OFFENEN, Standard ist "keine offen" - aufgeklappt wird
// dann nur der Bereich der gerade geoeffneten Seite.
//
// Grund ist die Hoehe: bei 1000 px Fensterhoehe stehen dem Menue rund 810 px
// zur Verfuegung, vier offene Gruppen brauchen aber gut 1200 px. "Alles offen"
// heisst also zwingend Scrollbalken, und zwar immer. Mit genau einer offenen
// Gruppe passt auch die groesste (Buero, neun Eintraege) ohne Scrollen; wer
// eine zweite aufklappt, bekommt den Balken - dann aber, weil er es so wollte.
const ZONEN_SPEICHER = "damicon-sidebar-bereiche";
const KEINE_ZONEN: readonly ZoneKey[] = [];
const zonenListener = new Set<() => void>();
let zonenCache: readonly ZoneKey[] | null = null;
// Bereich, fuer den das automatische Aufklappen schon gelaufen ist. Bewusst
// auf Modulebene und nicht als useRef: sonst klappt die Schublade beim
// Oeffnen den Bereich erneut auf, den man an der festen Spalte eben
// zugeklappt hat.
let zuletztGeoeffnet: ZoneKey | null = null;

function zonenAbonnieren(callback: () => void) {
  zonenListener.add(callback);
  return () => {
    zonenListener.delete(callback);
  };
}

// useSyncExternalStore verlangt eine stabile Referenz. Bei jedem Aufruf neu zu
// parsen ergaebe jedes Mal ein neues Array und schickt React in eine
// Endlosschleife - deshalb der Cache, der nur beim Schreiben erneuert wird.
function offeneZonen(): readonly ZoneKey[] {
  if (zonenCache) return zonenCache;
  let gelesen: readonly ZoneKey[] = KEINE_ZONEN;
  try {
    const roh = localStorage.getItem(ZONEN_SPEICHER);
    const werte: unknown = roh ? JSON.parse(roh) : null;
    if (Array.isArray(werte)) {
      gelesen = werte.filter((wert): wert is ZoneKey =>
        zones.some((zone) => zone.key === wert),
      );
    }
  } catch {
    // ignore
  }
  zonenCache = gelesen;
  return gelesen;
}

function zonenSetzen(naechste: readonly ZoneKey[]) {
  zonenCache = naechste;
  try {
    localStorage.setItem(ZONEN_SPEICHER, JSON.stringify(naechste));
  } catch {
    // ignore
  }
  zonenListener.forEach((eintrag) => eintrag());
}

/** Bereich der gerade geoeffneten Seite, aus /dashboard/<zone>/<modul>. */
export function useAktiveZone(): ZoneKey | null {
  const pathname = usePathname();
  const segment = pathname.split("/")[2];
  return zones.find((zone) => zone.key === segment)?.key ?? null;
}

export function useZonenGruppen() {
  const aktiveZone = useAktiveZone();
  const offene = useSyncExternalStore(
    zonenAbonnieren,
    offeneZonen,
    () => KEINE_ZONEN,
  );

  // Der Bereich der geoeffneten Seite klappt auf - sonst stuende man auf einer
  // Seite, die in der Navigation nicht zu sehen ist.
  //
  // Nur beim Wechsel des Bereichs, nicht bei jeder Aenderung von "offene":
  // sonst springt der Bereich, in dem man gerade steht, sofort wieder auf und
  // liesse sich ueberhaupt nicht zuklappen.
  useEffect(() => {
    if (!aktiveZone || zuletztGeoeffnet === aktiveZone) return;
    zuletztGeoeffnet = aktiveZone;
    const aktuell = offeneZonen();
    if (!aktuell.includes(aktiveZone)) {
      zonenSetzen([...aktuell, aktiveZone]);
    }
  }, [aktiveZone]);

  const umschalten = useCallback((zone: ZoneKey) => {
    const aktuell = offeneZonen();
    zonenSetzen(
      aktuell.includes(zone)
        ? aktuell.filter((eintrag) => eintrag !== zone)
        : [...aktuell, zone],
    );
  }, []);

  return { offene, umschalten };
}
