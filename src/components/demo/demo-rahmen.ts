// Der Rahmen der Vorführung: eine Markierung, die Himbi um die Karte legt, auf die er gerade zeigt.
//
// Warum ein eigener Rahmen statt der CSS-Klasse haustier-fokus: die Klasse setzt einen Rand an das
// Element, das eine allgemeine Regel zur Überschrift fand, und das war mal größer, mal kleiner,
// schmaler oder breiter als die Karte, zu der die Überschrift gehört. Hier wird die Karte selbst
// bestimmt (karteVon) und der Rahmen immer gleich gezeichnet: gleiche Linie, gleicher Abstand.
//
// Er folgt der Karte in jedem Bild (Scrollen, Größenänderung), gleitet beim Wechsel von einer Karte
// zur nächsten und zeigt bei sehr hohen Karten nur den sichtbaren Teil. Er nimmt keine Klicks an.

/** Höhe der festen Kopfzeile: der Rahmen beginnt nie darunter. */
const KOPF = 72;
const RAND_UNTEN = 16;
/** Abstand zwischen Karte und Rahmen. */
const LUFT = 6;
/** So lange gleitet der Rahmen nach einem Wechsel, danach folgt er ohne Verzögerung. */
const GLEITEN_MS = 450;

/** Die Karte, zu der ein Element gehört: der nächste Vorfahre (oder es selbst) mit Rand und Rundung,
 *  mindestens 240 Pixel breit. Findet sich keiner, bleibt es das Element selbst. */
export function karteVon(el: HTMLElement): HTMLElement {
  const haupt = document.getElementById("main");
  let e: HTMLElement | null = el;
  for (let tiefe = 0; e && e !== haupt && tiefe < 8; tiefe++, e = e.parentElement) {
    const stil = getComputedStyle(e);
    const hatRand = parseFloat(stil.borderTopWidth) > 0;
    const rund = parseFloat(stil.borderTopLeftRadius) >= 6;
    if (hatRand && rund && e.getBoundingClientRect().width >= 240) return e;
  }
  return el;
}

/** Wo der Rahmen für eine Karte steht: ihr sichtbarer Teil mit Luft, oder null, wenn kaum etwas sichtbar ist. */
export function rahmenFuer(r: { left: number; right: number; top: number; bottom: number }, fensterHoehe: number) {
  const oben = Math.max(r.top, KOPF);
  const unten = Math.min(r.bottom, fensterHoehe - RAND_UNTEN);
  if (unten - oben < 24) return null;
  return { left: r.left - LUFT, top: oben - LUFT, width: r.right - r.left + 2 * LUFT, height: unten - oben + 2 * LUFT };
}

export class Rahmen {
  private readonly el: HTMLDivElement;
  private ziel: Element | null = null;
  private raf = 0;
  private gleitetBis = 0;

  constructor(private readonly ruhig: boolean) {
    this.el = document.createElement("div");
    this.el.setAttribute("aria-hidden", "true");
    this.el.setAttribute("data-demo-rahmen", "");
    Object.assign(this.el.style, {
      position: "fixed",
      zIndex: "40",
      pointerEvents: "none",
      boxSizing: "border-box",
      border: "2px solid var(--hb-himbeere, #d81b60)",
      borderRadius: "14px",
      boxShadow: "0 0 0 4px color-mix(in srgb, var(--hb-himbeere, #d81b60) 14%, transparent)",
      opacity: "0",
      left: "0px",
      top: "0px",
      width: "0px",
      height: "0px",
    });
    document.body.appendChild(this.el);
  }

  /** Legt den Rahmen um eine Karte. null blendet ihn aus. */
  setze(ziel: Element | null): void {
    this.ziel = ziel;
    this.gleitetBis = ziel && !this.ruhig ? Date.now() + GLEITEN_MS : 0;
    this.el.style.transition = this.gleitetBis
      ? `left ${GLEITEN_MS}ms ease, top ${GLEITEN_MS}ms ease, width ${GLEITEN_MS}ms ease, height ${GLEITEN_MS}ms ease, opacity 250ms ease`
      : "opacity 250ms ease";
    cancelAnimationFrame(this.raf);
    if (!ziel) {
      this.el.style.opacity = "0";
      return;
    }
    this.nachfuehren();
  }

  private readonly nachfuehren = (): void => {
    const ziel = this.ziel;
    if (!ziel) return;
    // Nach dem Gleiten folgt der Rahmen ohne Verzögerung, sonst hinkte er beim Scrollen hinterher.
    if (this.gleitetBis && Date.now() > this.gleitetBis) {
      this.gleitetBis = 0;
      this.el.style.transition = "opacity 250ms ease";
    }
    const stelle = ziel.isConnected ? rahmenFuer(ziel.getBoundingClientRect(), window.innerHeight) : null;
    if (stelle) {
      this.el.style.left = `${stelle.left}px`;
      this.el.style.top = `${stelle.top}px`;
      this.el.style.width = `${stelle.width}px`;
      this.el.style.height = `${stelle.height}px`;
      this.el.style.opacity = "1";
    } else {
      this.el.style.opacity = "0";
    }
    this.raf = requestAnimationFrame(this.nachfuehren);
  };

  entfernen(): void {
    cancelAnimationFrame(this.raf);
    this.ziel = null;
    this.el.remove();
  }
}
