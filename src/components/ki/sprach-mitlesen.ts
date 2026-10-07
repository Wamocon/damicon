"use client";

// Mitlesen im Sprachmodus: der Rahmen in der Mitte folgt dem Satz, den die
// Stimme gerade spricht.
//
// Seit dem 25.09.2026 (zweite Fassung) über SPRECHMARKEN (domain/sprechmarken.ts):
// das Modell stellt vor einen Satz "[[a3]]", und genau diese Stelle wird gezeigt,
// wenn die Stimme den Satz erreicht. Die erste Fassung verglich Wörter des Satzes
// mit den Texten der Seite und landete dabei regelmäßig auf fremden Karten (ein
// Satz über Kühlkettenverstöße im Prüfbericht traf die Zonenkarte "Hof").
//
// Ohne Marke gibt es nur noch einen strengen Rückfall: nennt der Satz eine
// sichtbare Überschrift wörtlich ("Im Risiko-Radar …"), wird sie gezeigt. Nie
// über Wortähnlichkeit.

import { setzeHervorhebung } from "@/components/ki/hervorhebung";
import { inSichtBringen, klappeAuf, stelleZu, stelleZuSprechziel } from "@/components/ki/ui-steuerung";
import type { SprechZiel } from "@/lib/domain/sprachausgabe";

/** Ein Ziel, früh an sein Element gebunden (e-/a-Referenz beim Eintreffen des
 *  Satzes, bevor ein späteres seiteLesen die Seite neu liest), oder als Text für
 *  später (Anker, Überschrift, oder eine Referenz, deren Seite noch lädt). */
export type GebundenesZiel = { el: HTMLElement; ziel: SprechZiel } | { el: null; ziel: SprechZiel };

/** Beim Eintreffen eines Satzes: das erste Ziel seiner Marken binden. */
export function bindeSprechZiel(ziele: readonly SprechZiel[] | undefined): GebundenesZiel | null {
  const ziel = ziele?.[0];
  if (!ziel) return null;
  if (/^[ea]\d+$/.test(ziel)) {
    const el = stelleZuSprechziel(ziel);
    if (el) return { el, ziel };
  }
  return { el: null, ziel };
}

/** Beim Sprechen: das Element zum gebundenen Ziel, oder null (nicht mehr da). */
export function loeseSprechZiel(g: GebundenesZiel): HTMLElement | null {
  if (g.el && g.el.isConnected) return g.el;
  return stelleZuSprechziel(g.ziel);
}

/** Zeigt eine Stelle: aufklappen, falls zugeklappt, ins Bild holen, Rahmen. */
export function zeigeSprechStelle(stelle: HTMLElement): void {
  const aufgeklappt = klappeAuf(stelle);
  inSichtBringen(stelle);
  setzeHervorhebung(stelle);
  // Ein aufgeklappter Bereich wächst erst noch: danach noch einmal ins Bild.
  if (aufgeklappt) window.setTimeout(() => stelle.isConnected && inSichtBringen(stelle), 380);
}

function normiert(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Strenger Rückfall ohne Marke: eine sichtbare Überschrift des Hauptbereichs,
 *  deren ganzer Titel (mindestens acht Zeichen oder zwei Wörter) wörtlich im
 *  Satz steht. Bei mehreren gewinnt der längste Titel. */
export function ueberschriftImSatz(satz: string): HTMLElement | null {
  const haupt = document.getElementById("main");
  if (!haupt) return null;
  const s = ` ${normiert(satz)} `;
  let beste: HTMLElement | null = null;
  let laenge = 0;
  for (const kopf of Array.from(haupt.querySelectorAll<HTMLElement>("h2, h3, h4, summary"))) {
    if (kopf.getClientRects().length === 0) continue;
    const titel = normiert(kopf.textContent ?? "");
    if (titel.length < 8 && !titel.includes(" ")) continue;
    if (titel.length > 60 || !s.includes(` ${titel} `)) continue;
    if (titel.length > laenge) {
      beste = kopf;
      laenge = titel.length;
    }
  }
  return beste ? stelleZu(beste) : null;
}
