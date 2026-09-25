"use client";

// Mitlesen im Sprachmodus, der DOM-Teil: zu einem gesprochenen Satz die Stelle
// im Hauptbereich finden, deren Text am besten dazu passt. Die Bewertung selbst
// (lib/domain/sprachmodus-mitlesen.ts) kennt kein DOM.
//
// Liegt die Stelle in einem zugeklappten Element (details, Aufklappbereich mit
// aria-expanded), wird es aufgeklappt, damit man sieht, wovon Himbi spricht
// (Rückmeldung vom 25.09.2026).

import { inSichtBringen, klickStufe } from "@/components/ki/ui-steuerung";
import { bestesZiel, type MitleseKandidat } from "@/lib/domain/sprachmodus-mitlesen";

// Überschriften, Bereiche, Listeneinträge, Tabellenzeilen und Kacheln.
const KANDIDATEN = "h1, h2, h3, h4, section, article, li, tr, [class*='rounded']";
const TEXT_MIN = 8;
const TEXT_MAX = 900;
// Der Text hinter einem zugeklappten Element wird mitgelesen, aber gekürzt.
const ZUGEKLAPPT_TEXT_MAX = 1500;
// Menüs, Reiter und Auswahlfelder klappen nichts auf, das man vorlesen würde.
const KEIN_AUFKLAPPER = "[role='tab'], [role='combobox'], [role='menuitem'], [role='switch'], [aria-haspopup]:not([aria-haspopup='false'])";

interface Stelle {
  el: HTMLElement;
  /** Klappt die Stelle auf, falls sie zugeklappt ist. */
  aufklappen?: () => void;
}

export interface MitleseTreffer {
  el: HTMLElement;
  /** Die Stelle war zugeklappt und wurde jetzt aufgeklappt. */
  aufgeklappt: boolean;
}

function textVon(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Zugeklappte Elemente im Hauptbereich samt dem Text dahinter. */
function zugeklappte(wurzel: HTMLElement, elemente: Stelle[], kandidaten: MitleseKandidat[]): void {
  for (const details of wurzel.querySelectorAll<HTMLDetailsElement>("details:not([open])")) {
    const kopf = details.querySelector("summary");
    if (!kopf || kopf.getClientRects().length === 0) continue;
    const r = details.getBoundingClientRect();
    elemente.push({ el: details, aufklappen: () => (details.open = true) });
    kandidaten.push({ text: textVon(details).slice(0, ZUGEKLAPPT_TEXT_MAX), flaeche: r.width * r.height });
  }
  for (const knopf of wurzel.querySelectorAll<HTMLElement>("[aria-expanded='false']")) {
    if (knopf.getClientRects().length === 0 || knopf.matches(KEIN_AUFKLAPPER)) continue;
    // Nur, was die Anwendung auch ohne Rückfrage anklicken würde (kein Absenden, kein Löschen).
    if (klickStufe(knopf).stufe !== "erlaubt") continue;
    const dahinter = knopf.getAttribute("aria-controls");
    const inhalt = dahinter ? document.getElementById(dahinter) : null;
    const huelle = knopf.closest<HTMLElement>("li, section, article, [class*='rounded']") ?? knopf;
    const r = huelle.getBoundingClientRect();
    const mitInhalt = `${textVon(knopf)} ${inhalt ? textVon(inhalt) : ""}`.trim().slice(0, ZUGEKLAPPT_TEXT_MAX);
    // Die Hülle steht meist schon als sichtbare Stelle in der Liste: dieselbe
    // Stelle, nur mit Aufklappen und dem Text dahinter, statt zweimal.
    const schon = elemente.findIndex((e) => e.el === huelle);
    if (schon >= 0) {
      elemente[schon]!.aufklappen = () => knopf.click();
      kandidaten[schon]!.text = `${kandidaten[schon]!.text} ${mitInhalt}`.slice(0, ZUGEKLAPPT_TEXT_MAX);
      continue;
    }
    elemente.push({ el: huelle, aufklappen: () => knopf.click() });
    kandidaten.push({ text: mitInhalt, flaeche: r.width * r.height });
  }
}

/** Die Stelle im Hauptbereich, die zum Satz passt, oder null. War sie zugeklappt,
 *  wird sie aufgeklappt. */
export function findeMitleseZiel(satz: string): MitleseTreffer | null {
  const wurzel = document.getElementById("main");
  if (!wurzel) return null;
  const stellen: Stelle[] = [];
  const kandidaten: MitleseKandidat[] = [];
  for (const el of wurzel.querySelectorAll<HTMLElement>(KANDIDATEN)) {
    if (el.getClientRects().length === 0) continue;
    const text = textVon(el);
    if (text.length < TEXT_MIN || text.length > TEXT_MAX) continue;
    const r = el.getBoundingClientRect();
    // Höher als fast das ganze Bild: kein Punkt, auf den man zeigen kann.
    if (r.width < 24 || r.height < 12 || r.height > window.innerHeight * 0.9) continue;
    stellen.push({ el });
    kandidaten.push({ text, flaeche: r.width * r.height });
  }
  zugeklappte(wurzel, stellen, kandidaten);
  const i = bestesZiel(satz, kandidaten);
  const stelle = i === null ? null : stellen[i];
  if (!stelle) return null;
  if (stelle.aufklappen) {
    stelle.aufklappen();
    return { el: stelle.el, aufgeklappt: true };
  }
  return { el: stelle.el, aufgeklappt: false };
}

/** Bringt die Stelle ins Bild, falls nötig. */
export function zeigeMitleseZiel(el: HTMLElement): void {
  inSichtBringen(el);
}
