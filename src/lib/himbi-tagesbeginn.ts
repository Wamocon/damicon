import { tagInZone } from "@/lib/domain/tageszeit";
import type { Ablage } from "@/lib/browser-ablage";

// Himbi beginnt den Tag: einmal am Tag je Nutzer von sich aus nach der Tageslage fragen.
// Rueckmeldung vom 28.09.2026: "Himbi soll mit mir interagieren, zum Beispiel mir
// vorschlagen, was ich heute machen kann, was dringende Themen sind, und mir helfen, den Tag
// zu organisieren. Er soll mir Fragen stellen!"
//
// Zwei Wege, ein Merker:
//   - "gespraech": im Sprachmodus stellt Himbi beim ersten Zuhoeren selbst die Frage nach der
//     Tageslage (components/ki/sprachmodus.tsx) und antwortet darauf mit Rueckfrage.
//   - "blase": ausserhalb des Sprachmodus eine Sprechblase mit Gruss und dem Angebot, zu sagen,
//     was heute dringend ist (components/haustier/haustier-dashboard.tsx). Kostet nichts, bis
//     jemand "Ja" sagt.
// Wer heute schon im Gespraech begruesst wurde, bekommt keine Blase mehr; umgekehrt schon, denn
// die Blase stellt noch keine Zahl vor, das Gespraech schon.
//
// Der Tag ist der Kalendertag in Almaty (tagInZone), nicht der des Rechners: sonst begruesste
// Himbi auf einem Laptop mit deutscher Zeit ein zweites Mal um vier Uhr morgens in Almaty.
//
// Gebaut wie die Zuletzt-Liste (lib/suche/zuletzt.ts): eigener Schluessel (nicht der Marker
// des KI-Panels, zwei Leser desselben Markers verpassen sich den Nutzerwechsel), JSON mit dem
// Nutzer, und die Ablage (lib/browser-ablage.ts) wird hereingereicht, damit der Test mit einer
// nachgebauten rechnet und ein privates Fenster, in dem schon der Zugriff wirft, nichts kaputt
// macht. Anders als dort bleibt ein fremder Eintrag stehen, bis der naechste Gruss ihn
// ueberschreibt; ein gemeinsamer Leser braeuchte dafuer einen Schalter und lohnt nicht.

export const TAGESBEGINN_SPEICHER = "damicon-himbi-tagesbeginn";

export type TagesbeginnArt = "gespraech" | "blase";

/** Welche schon gemerkten Arten eine Art fuer heute erledigen. */
const ERLEDIGT_DURCH: Record<TagesbeginnArt, readonly TagesbeginnArt[]> = {
  gespraech: ["gespraech"],
  blase: ["blase", "gespraech"],
};

interface Gespeichert {
  nutzer: string;
  tag: string;
  arten: TagesbeginnArt[];
}

function istGespeichert(wert: unknown): wert is Gespeichert {
  if (typeof wert !== "object" || wert === null) return false;
  const { nutzer, tag, arten } = wert as Record<string, unknown>;
  return (
    typeof nutzer === "string" &&
    typeof tag === "string" &&
    Array.isArray(arten) &&
    arten.every((a) => a === "gespraech" || a === "blase")
  );
}

/** Die heute fuer diesen Nutzer schon gemerkten Arten. Ein Eintrag von gestern oder von
 *  jemand anderem zaehlt nicht (er wird beim naechsten Merken ueberschrieben). */
function heuteGemerkt(ablage: Ablage, nutzerId: string, tag: string): TagesbeginnArt[] {
  const roh = ablage.getItem(TAGESBEGINN_SPEICHER);
  if (!roh) return [];
  let wert: unknown;
  try {
    wert = JSON.parse(roh);
  } catch {
    wert = null;
  }
  if (!istGespeichert(wert) || wert.nutzer !== nutzerId || wert.tag !== tag) return [];
  return wert.arten;
}

/**
 * Soll Himbi heute noch von sich aus beginnen? Ohne Nutzer oder ohne nutzbaren Speicher
 * nein: lieber keine Begruessung als eine bei jedem Seitenaufruf.
 */
export function tagesbeginnFaellig(
  ablage: Ablage | null,
  nutzerId: string | null | undefined,
  art: TagesbeginnArt,
  jetzt: Date = new Date(),
): boolean {
  if (!ablage || !nutzerId) return false;
  try {
    const gemerkt = heuteGemerkt(ablage, nutzerId, tagInZone(jetzt));
    return !ERLEDIGT_DURCH[art].some((a) => gemerkt.includes(a));
  } catch {
    return false;
  }
}

/** Merkt, dass Himbi heute auf diesem Weg begonnen hat. Erst aufrufen, wenn die Frage bzw.
 *  die Blase wirklich da ist, sonst fiele eine gescheiterte Begruessung fuer heute weg. */
export function merkeTagesbeginn(
  ablage: Ablage | null,
  nutzerId: string | null | undefined,
  art: TagesbeginnArt,
  jetzt: Date = new Date(),
): void {
  if (!ablage || !nutzerId) return;
  try {
    const tag = tagInZone(jetzt);
    const bisher = heuteGemerkt(ablage, nutzerId, tag);
    const neu: Gespeichert = { nutzer: nutzerId, tag, arten: bisher.includes(art) ? bisher : [...bisher, art] };
    ablage.setItem(TAGESBEGINN_SPEICHER, JSON.stringify(neu));
  } catch {
    // Gesperrter Speicher: tagesbeginnFaellig sagt dann ohnehin nein.
  }
}

// Die Einstellung "Himbi beginnt den Tag mit mir" (haustier-einstellung.tsx, gespeichert ueber
// tagesbeginnSpeicher in lib/haustier.ts). Voreinstellung AN, der Nutzer hat es ausdruecklich
// gewuenscht: nur ein gespeichertes "aus" schaltet ab. Die Voreinstellung steht nur hier; der
// Speicher, der Serverwert und der Standardkontext lesen sie daraus (Fund 57 vom 28.09.2026:
// vorher stand sie an vier Stellen).
export const TAGESBEGINN_SCHALTER = "damicon-himbi-tagesbeginn-an";
export const TAGESBEGINN_STANDARD = true;
