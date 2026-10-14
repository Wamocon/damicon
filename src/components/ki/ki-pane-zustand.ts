"use client";

// Zustand des KI-Panels (ki-pane.tsx): welche Ansicht es zeigt, die vorübergehende
// Breite für die Compliance-Prüfung und das Verhalten als Blatt auf dem Handy
// (Escape schließt, die Seite darunter scrollt nicht mit).

import { useEffect, useState } from "react";
import { HAUPTSPALTE_MINDESTBREITE, MINIMUM as PANE_BREITE_MINIMUM } from "@/components/ki/ki-pane-griff";
import type { Anstoss } from "@/components/ki/ki-pane-kontext";
import { useScrollSperre } from "@/components/ui/scroll-sperre";

export type Ansicht = "chat" | "einstellungen" | "hilfe" | "pruefung" | "mehr";

// Wie breit das Panel fuer die Pruefungsansicht hoechstens wird: enger als das
// per Griff ziehbare Maximum (ki-pane-griff.tsx) - hier soll nur genug Platz fuer
// Spuren und Bericht entstehen, nicht die volle vom Nutzer ziehbare Breite.
const PRUEFUNG_BREITE_MAXIMUM = 600;

/** Welche Ansicht das Panel zeigt. Ein neuer Anstoss holt den Chat nach vorn. */
export function useKiPaneAnsicht(anstoss: Anstoss | null) {
  const [ansicht, setAnsicht] = useState<Ansicht>("chat");
  // Einmal geoeffnet, bleibt die Pruefung eingebunden (nur ausgeblendet): ein laufender Lauf ueberlebt den Wechsel zum Chat.
  const [pruefungGeladen, setPruefungGeladen] = useState(false);

  // Eine Frage zum Prüfergebnis (Knopf im Bericht) gehört in den Chat: dorthin wechseln, die Prüfung bleibt eingebunden.
  // Zustand beim Rendern angleichen (statt in einem Effekt): sobald ein neuer Anstoss da ist, zeigt das Panel den Chat.
  const [gesehenerAnstoss, setGesehenerAnstoss] = useState(anstoss?.nr ?? 0);
  if (anstoss && anstoss.nr !== gesehenerAnstoss) {
    setGesehenerAnstoss(anstoss.nr);
    setAnsicht("chat");
  }

  /** Knopf im Kopf: öffnet die Ansicht, ein zweiter Klick führt zurück zum Chat. */
  function schalteUm(ziel: Ansicht) {
    if (ziel === "pruefung") setPruefungGeladen(true);
    setAnsicht((aktuell) => (aktuell === ziel ? "chat" : ziel));
  }

  /** Zeile der Mehr-Ansicht: öffnet die Ansicht. */
  function zeige(ziel: Ansicht) {
    if (ziel === "pruefung") setPruefungGeladen(true);
    setAnsicht(ziel);
  }

  return { ansicht, pruefungGeladen, schalteUm, zeige };
}

/** Die Breite für die Prüfung: höchstens PRUEFUNG_BREITE_MAXIMUM, und die Hauptspalte behält ihre Mindestbreite. */
function pruefungsBreite(): number {
  const links = document.getElementById("main")?.getBoundingClientRect().left ?? 0;
  return Math.max(PANE_BREITE_MINIMUM, Math.min(PRUEFUNG_BREITE_MAXIMUM, Math.floor(window.innerWidth - links - HAUPTSPALTE_MINDESTBREITE)));
}

// Die Pruefung braucht Platz (Spuren mit Schritten, Bericht): das Panel wird fuer diese Ansicht vorruebergehend
// breiter, ohne die gespeicherte Breite des Nutzers zu ueberschreiben, und geht danach auf den alten Wert zurueck.
// Das Hauptfenster behaelt mindestens 680 px (siehe ki-pane-griff.tsx).
export function usePruefungsBreite(ansicht: Ansicht, offen: boolean) {
  useEffect(() => {
    if (ansicht !== "pruefung" || !offen) return;
    const wurzel = document.documentElement.style;
    const ziel = pruefungsBreite();
    const aktuell = document.querySelector(".ki-pane-huelle")?.getBoundingClientRect().width ?? 0;
    if (aktuell >= ziel - 16) return;
    const vorher = wurzel.getPropertyValue("--ki-pane-breite");
    const gesetzt = `${ziel}px`;
    wurzel.setProperty("--ki-pane-breite", gesetzt);
    return () => {
      // Hat der Nutzer inzwischen selbst gezogen, bleibt seine Breite.
      if (wurzel.getPropertyValue("--ki-pane-breite") !== gesetzt) return;
      if (vorher) wurzel.setProperty("--ki-pane-breite", vorher);
      else wurzel.removeProperty("--ki-pane-breite");
    };
  }, [ansicht, offen]);
}

// Esc schliesst, und solange das Blatt offen ist, scrollt die Seite darunter
// nicht mit. Beides kannte bisher nur ui/sheet.tsx, obwohl Menue-, Konto- und
// KI-Blatt auf dem Handy dieselbe Flaeche sind und gleich aussehen. Die
// Sperre ist dieselbe wie dort (ui/scroll-sperre.ts).
//
// Die Bauweisen bleiben getrennt: ui/sheet.tsx haengt beim Schliessen aus,
// dieses Panel muss gemountet bleiben, sonst reisst eine laufende Antwort
// ab - und seit der Pruefung auch ein laufender Pruefvorgang. Angeglichen
// wird das Verhalten, nicht der Bau.
//
// Nur unter md: ab dort ist das Panel eine angedockte Spalte neben der Seite,
// und die soll weiter scrollen, waehrend man daneben liest.
export function useHandyBlatt(offen: boolean, handy: boolean, setOffen: (offen: boolean) => void) {
  useScrollSperre(offen && handy);
  useEffect(() => {
    if (!offen || !handy) return;
    const beiTaste = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOffen(false);
    };
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, [offen, handy, setOffen]);
}
