import type { SeitenZiel, ZielSchluessel } from "./seiten-ziele";

// "Zuletzt geoeffnet" bei leerem Suchfeld: die Seiten, die jemand zuletzt
// selbst aufgerufen hat, ueber Seitenleiste, Link oder Suche.
//
// Gespeichert werden Schluessel, keine Namen. Aufgeloest wird bei jedem
// Oeffnen gegen die aktuelle Zielliste - so stimmt nach einem Sprachwechsel
// die Beschriftung, und was die Rolle nicht mehr sehen darf, faellt heraus.
//
// Die Ablage wird hereingereicht statt window.localStorage direkt zu lesen:
// der Test rechnet mit einer nachgebauten, und im privaten Fenster kann
// schon der Zugriff auf localStorage werfen.

export const ZULETZT_SPEICHER = "damicon-suche-zuletzt";
const HOECHSTENS_GEMERKT = 10;
export const HOECHSTENS_ZULETZT = 5;

export interface Ablage {
  getItem(schluessel: string): string | null;
  setItem(schluessel: string, wert: string): void;
  removeItem(schluessel: string): void;
}

interface Gespeichert {
  nutzer: string | null;
  ziele: string[];
}

function istGespeichert(wert: unknown): wert is Gespeichert {
  if (typeof wert !== "object" || wert === null) return false;
  const { nutzer, ziele } = wert as Record<string, unknown>;
  return (
    (nutzer === null || typeof nutzer === "string") &&
    Array.isArray(ziele) &&
    ziele.every((z) => typeof z === "string")
  );
}

// Die Liste gehoert einer Person. Meldet sich an diesem Rechner jemand
// anderes an, beginnt sie leer. Ein eigener Eintrag statt des Markers, den
// das KI-Panel fuehrt (damicon-ki-nutzer): zwei Leser desselben Markers
// verpassen sich gegenseitig den Wechsel - wer zuerst liest, setzt ihn um.
function lies(ablage: Ablage, nutzerId: string | null): string[] {
  const roh = ablage.getItem(ZULETZT_SPEICHER);
  if (!roh) return [];
  let wert: unknown;
  try {
    wert = JSON.parse(roh);
  } catch {
    wert = null;
  }
  if (!istGespeichert(wert) || wert.nutzer !== nutzerId) {
    ablage.removeItem(ZULETZT_SPEICHER);
    return [];
  }
  return wert.ziele;
}

export function liesZuletzt(
  ablage: Ablage | null,
  nutzerId: string | null,
): string[] {
  if (!ablage) return [];
  try {
    return lies(ablage, nutzerId);
  } catch {
    // Gesperrter Speicher: dann eben ohne Verlauf.
    return [];
  }
}

export function merkeZuletzt(
  ablage: Ablage | null,
  nutzerId: string | null,
  schluessel: ZielSchluessel,
): void {
  if (!ablage) return;
  try {
    const ziele = [
      schluessel,
      ...lies(ablage, nutzerId).filter((s) => s !== schluessel),
    ].slice(0, HOECHSTENS_GEMERKT);
    const neu: Gespeichert = { nutzer: nutzerId, ziele };
    ablage.setItem(ZULETZT_SPEICHER, JSON.stringify(neu));
  } catch {
    // siehe liesZuletzt
  }
}

/**
 * Die gemerkten Schluessel als Ziele, neueste zuerst. Was die Rolle nicht
 * sehen darf, was es nicht mehr gibt und die gerade offene Seite fallen weg.
 */
export function zuletztAufloesen(
  liste: readonly string[],
  ziele: readonly SeitenZiel[],
  offeneSeite: ZielSchluessel | null,
  max = HOECHSTENS_ZULETZT,
): SeitenZiel[] {
  const nachSchluessel = new Map<string, SeitenZiel>(
    ziele.map((ziel) => [ziel.schluessel, ziel]),
  );
  const ergebnis: SeitenZiel[] = [];
  for (const schluessel of liste) {
    if (ergebnis.length === max) break;
    if (schluessel === offeneSeite) continue;
    const ziel = nachSchluessel.get(schluessel);
    if (ziel) ergebnis.push(ziel);
  }
  return ergebnis;
}

/** localStorage, oder null, wo schon der Zugriff wirft (privates Fenster). */
export function browserAblage(): Ablage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
