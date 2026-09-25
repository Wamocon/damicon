// Ausfuehrung der Client-Werkzeuge des Agenten (lib/ai/ui-werkzeuge.ts) im
// Browser: die Seite lesen und bedienen. Reines DOM, keine React-Abhaengigkeit.
//
// Grundsaetze:
//   * Bedient wird nur der Inhaltsbereich (#main), nie das KI-Panel, die
//     Seitenleiste oder die Kopfzeile - Navigation macht oeffneBereich.
//   * Ein Klick, der etwas absendet, aendert oder loescht, geht erst nach
//     ausdruecklicher Zustimmung des Nutzers durch (bestaetigen()).
//   * Gesperrt: Abmelden, Passwortfelder, Links aus der Anwendung heraus.
//   * Der Agent sieht nur, was auch der Nutzer sieht (sichtbare Elemente).

import { setzeHervorhebung } from "@/components/ki/hervorhebung";

export interface ElementInfo {
  ref: string;
  typ: string;
  label: string;
  gruppe: string | null;
  wert?: string;
  optionen?: string[];
  angehakt?: boolean;
  /** Pflichtfeld: ohne Wert laesst der Browser das Absenden nicht zu. */
  pflicht?: boolean;
  /** Erwartetes Format bei Datums- und Zeitfeldern. */
  format?: string;
  deaktiviert?: boolean;
  ziel?: string;
}

/** Eine Stelle der Seite, auf die der Sprachmodus mit einer Sprechmarke
 *  ("[[a3]]", domain/sprechmarken.ts) zeigen kann: Abschnitt, Karte, Kachel,
 *  Aufklappbereich. Anders als die Elemente auch ohne Bedienung. */
export interface AbschnittInfo {
  ref: string;
  titel: string;
  /** Zugeklappt: beim Zeigen klappt der Sprachmodus die Stelle auf. */
  zugeklappt?: true;
}

export interface Schnappschuss {
  url: string;
  titel: string;
  ueberschriften: string[];
  text: string;
  elemente: ElementInfo[];
  abschnitte: AbschnittInfo[];
  hinweis?: string;
}

export interface KlickAnfrage {
  absicht: string;
  label: string;
  grund: "senden" | "loeschen" | "extern" | "doppelt";
}

export interface ZeigerSteuerung {
  bewegen: (x: number, y: number, klick?: boolean) => Promise<void>;
}

export interface Umgebung {
  zeiger: ZeigerSteuerung;
  bestaetigen: (anfrage: KlickAnfrage) => Promise<boolean>;
  agentModus: boolean;
}

const MAX_ELEMENTE = 140;
const MAX_ABSCHNITTE = 60;
const MAX_TEXT = 3200;
const FOKUS_KLASSE = "ki-fokus";
const REF_ATTRIBUT = "data-ki-ref";
const ABSCHNITT_ATTRIBUT = "data-ki-abschnitt";

// Referenzen werden je Seitenaufruf nie wiederverwendet: ein Element behaelt
// seine Nummer ueber jedes seiteLesen hinweg, ein neues bekommt eine neue. Bis
// zum 25.09.2026 wurde bei jedem seiteLesen ab e1 neu gezaehlt - eine Sprechmarke
// oder ein zeigeAuf, das auf das Lesen davor zurueckging, traf dann still ein
// ganz anderes Element.
let letzteElementNr = 0;
let letzteAbschnittNr = 0;

function refFuer(el: HTMLElement): string {
  const alt = el.getAttribute(REF_ATTRIBUT);
  if (alt) return alt;
  const ref = `e${++letzteElementNr}`;
  el.setAttribute(REF_ATTRIBUT, ref);
  return ref;
}

function abschnittRefFuer(el: HTMLElement): string {
  const alt = el.getAttribute(ABSCHNITT_ATTRIBUT);
  if (alt) return alt;
  const ref = `a${++letzteAbschnittNr}`;
  el.setAttribute(ABSCHNITT_ATTRIBUT, ref);
  return ref;
}

const INTERAKTIV =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"]';

const warte = (ms: number) => new Promise<void>((weiter) => window.setTimeout(weiter, ms));

function wurzel(): HTMLElement | null {
  return document.getElementById("main");
}

function sichtbar(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest(".ki-pane-huelle, [inert], [aria-hidden='true'], [hidden]")) return false;
  const stil = window.getComputedStyle(el);
  if (stil.display === "none" || stil.visibility === "hidden" || Number(stil.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function bereinigt(text: string | null | undefined, max = 70): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function labelVon(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return bereinigt(aria);
  const durch = el.getAttribute("aria-labelledby");
  if (durch) {
    const text = durch
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (bereinigt(text)) return bereinigt(text);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const beschriftung =
      (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : null) ??
      el.closest("label")?.textContent ??
      el.getAttribute("placeholder") ??
      el.getAttribute("title") ??
      el.name;
    if (el instanceof HTMLInputElement && (el.type === "submit" || el.type === "button") && el.value) {
      return bereinigt(el.value);
    }
    return bereinigt(beschriftung);
  }
  return bereinigt(el.innerText || el.getAttribute("title") || el.getAttribute("href"));
}

function gruppeVon(el: HTMLElement): string | null {
  const bereich = el.closest("section, form, article, [role='dialog']");
  const kopf = bereich?.querySelector("h1, h2, h3, legend");
  const text = bereinigt(kopf?.textContent, 50);
  return text || null;
}

function typVon(el: HTMLElement): string {
  if (el instanceof HTMLAnchorElement) return "link";
  if (el instanceof HTMLSelectElement) return "auswahl";
  if (el instanceof HTMLTextAreaElement) return "text";
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return el.type === "radio" ? "option" : "kontrollkasten";
    if (el.type === "submit" || el.type === "button") return "schaltflaeche";
    return `eingabe:${el.type}`;
  }
  const rolle = el.getAttribute("role");
  if (rolle === "tab") return "reiter";
  if (rolle === "switch") return "schalter";
  if (el instanceof HTMLElement && el.tagName === "SUMMARY") return "aufklappbereich";
  return "schaltflaeche";
}

function ausserhalbDerAnwendung(el: HTMLAnchorElement): boolean {
  try {
    return new URL(el.href, window.location.href).origin !== window.location.origin;
  } catch {
    return true;
  }
}

/** Kurz warten, bis die Seite aufhoert, sich zu veraendern (Navigation, Nachladen). */
export async function warteBisRuhig(maxMs = 3200, ruheMs = 380): Promise<void> {
  await new Promise<void>((fertig) => {
    let timer = window.setTimeout(ende, ruheMs);
    const start = Date.now();
    const beobachter = new MutationObserver(() => {
      window.clearTimeout(timer);
      if (Date.now() - start > maxMs) return ende();
      timer = window.setTimeout(ende, ruheMs);
    });
    function ende() {
      beobachter.disconnect();
      fertig();
    }
    beobachter.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.setTimeout(ende, maxMs);
  });
}

export async function schnappschuss(fokus?: string): Promise<Schnappschuss> {
  await warteBisRuhig(1800, 250);
  const haupt = wurzel();
  const url = `${window.location.pathname}${window.location.hash}`;
  if (!haupt) return { url, titel: document.title, ueberschriften: [], text: "", elemente: [], abschnitte: [], hinweis: "Kein Inhaltsbereich gefunden." };

  const stichwort = fokus?.trim().toLowerCase();
  const elemente: ElementInfo[] = [];
  let abgeschnitten = false;

  for (const el of Array.from(haupt.querySelectorAll<HTMLElement>(INTERAKTIV))) {
    if (!sichtbar(el)) continue;
    if (el instanceof HTMLInputElement && el.type === "password") continue;
    const label = labelVon(el);
    const gruppe = gruppeVon(el);
    if (stichwort && !`${label} ${gruppe ?? ""}`.toLowerCase().includes(stichwort)) continue;
    if (elemente.length >= MAX_ELEMENTE) {
      abgeschnitten = true;
      break;
    }
    const ref = refFuer(el);
    const info: ElementInfo = { ref, typ: typVon(el), label: label || "(ohne Beschriftung)", gruppe };
    if (el instanceof HTMLAnchorElement) info.ziel = el.pathname + el.hash;
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) info.angehakt = el.checked;
    else if (el instanceof HTMLSelectElement) {
      info.wert = bereinigt(el.selectedOptions[0]?.textContent);
      info.optionen = Array.from(el.options).slice(0, 25).map((o) => bereinigt(o.textContent, 40));
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) info.wert = bereinigt(el.value, 60);
    if ((el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && el.required) info.pflicht = true;
    if (el instanceof HTMLInputElement) {
      const formate: Record<string, string> = { "datetime-local": "JJJJ-MM-TTTHH:MM (z. B. 2026-09-19T08:30)", date: "JJJJ-MM-TT", time: "HH:MM", month: "JJJJ-MM" };
      if (formate[el.type]) info.format = formate[el.type];
    }
    if ("disabled" in el && (el as HTMLButtonElement).disabled) info.deaktiviert = true;
    elemente.push(info);
  }

  const text = bereinigt(haupt.innerText, MAX_TEXT + 1);
  return {
    url,
    titel: bereinigt(haupt.querySelector("h1")?.textContent ?? document.title, 90),
    ueberschriften: Array.from(haupt.querySelectorAll("h1, h2, h3"))
      .filter(sichtbar)
      .map((h) => bereinigt(h.textContent, 70))
      .filter(Boolean)
      .slice(0, 30),
    text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text,
    elemente,
    abschnitte: abschnitteDer(haupt),
    hinweis: abgeschnitten
      ? `Mehr als ${MAX_ELEMENTE} Elemente - nutze 'fokus', um die Liste einzugrenzen.`
      : undefined,
  };
}

// --- Abschnitte und Seitenkarte (Sprechmarken im Sprachmodus) -------------------

// Was eine Stelle umschliesst, auf die man zeigt: Aufklappbereich, Karte,
// Listeneintrag. Nie #main selbst und nie hoeher als fast das ganze Bild - ein
// Rahmen um eine halbe Seite zeigt nichts.
const HUELLEN = "details, .pr-aufklappbar, [data-offen], article, li, section, [class*='rounded']";
const KOEPFE = "h1, h2, h3, h4, summary, [aria-expanded], [role='heading']";

function passendeHoehe(el: HTMLElement): boolean {
  const h = el.getBoundingClientRect().height;
  return h > 0 && h <= window.innerHeight * 0.85;
}

/** Die Stelle, die zu einer Ueberschrift oder einem Aufklapp-Knopf gehoert:
 *  die naechste passende Huelle, sonst das Element selbst. */
export function stelleZu(el: HTMLElement): HTMLElement {
  const haupt = wurzel();
  let huelle = el.parentElement?.closest<HTMLElement>(HUELLEN) ?? null;
  // Eine Ueberschrift, die selbst schon eine Huelle ist (summary in details):
  if (el.matches("summary")) huelle = el.closest<HTMLElement>("details");
  for (let tiefe = 0; huelle && tiefe < 4; tiefe++) {
    if (huelle === haupt || !haupt?.contains(huelle)) break;
    if (passendeHoehe(huelle)) return huelle;
    huelle = huelle.parentElement?.closest<HTMLElement>(HUELLEN) ?? null;
  }
  return el;
}

function titelVon(el: HTMLElement): string {
  const kopf = el.matches(KOEPFE) ? el : el.querySelector<HTMLElement>(KOEPFE);
  const roh = kopf ? (kopf.getAttribute("aria-label") ?? kopf.textContent) : (el.getAttribute("aria-label") ?? el.textContent);
  return bereinigt(roh, 60);
}

function istZugeklappt(stelle: HTMLElement): boolean {
  if (stelle instanceof HTMLDetailsElement) return !stelle.open;
  if (stelle.getAttribute("data-offen") === "false") return true;
  return stelle.matches("[aria-expanded='false']") || stelle.querySelector(":scope > [aria-expanded='false'], :scope > * > [aria-expanded='false']") !== null;
}

/** Alle Stellen der Seite mit stabiler Referenz: Ueberschriften (samt ihrer
 *  Karte), Aufklappbereiche und Elemente mit sprechendem Anker (id). */
function abschnitteDer(haupt: HTMLElement): AbschnittInfo[] {
  const gesehen = new Set<HTMLElement>();
  const liste: AbschnittInfo[] = [];
  const kandidaten = haupt.querySelectorAll<HTMLElement>(`${KOEPFE}, [id]`);
  for (const k of Array.from(kandidaten)) {
    if (liste.length >= MAX_ABSCHNITTE) break;
    if (!sichtbar(k)) continue;
    if (k.matches("input, select, textarea, button:not([aria-expanded]), label, option")) continue;
    if (k.hasAttribute("id") && !/^[a-z][a-z0-9-]{2,}$/.test(k.id)) continue;
    if (k.matches("[aria-expanded]") && (k.matches("[role='tab'], [role='combobox'], [aria-haspopup]:not([aria-haspopup='false'])") || klickStufe(k).stufe !== "erlaubt")) continue;
    const stelle = k.hasAttribute("id") && !k.matches(KOEPFE) && passendeHoehe(k) ? k : stelleZu(k);
    if (gesehen.has(stelle)) continue;
    const titel = titelVon(k);
    if (!titel || titel.length < 2) continue;
    gesehen.add(stelle);
    const info: AbschnittInfo = { ref: abschnittRefFuer(stelle), titel };
    if (istZugeklappt(stelle)) info.zugeklappt = true;
    liste.push(info);
  }
  return liste;
}

/** Die Seitenkarte fuer den Sprachmodus: jede Stelle der aktuellen Seite mit
 *  Referenz, kompakt als Text. Geht mit jeder Anfrage mit (ki-chat.tsx), damit
 *  das Modell auf der Seite, die der Nutzer gerade sieht, ohne vorheriges
 *  seiteLesen Sprechmarken setzen kann. */
export function seitenKarte(): string {
  const haupt = wurzel();
  if (!haupt) return "";
  const titel = bereinigt(haupt.querySelector("h1")?.textContent ?? document.title, 80);
  const zeilen = abschnitteDer(haupt).map((a) => `${a.ref} ${a.titel}${a.zugeklappt ? " (zugeklappt)" : ""}`);
  return [`Seite: ${window.location.pathname} - ${titel}`, ...zeilen].join("\n");
}

/** Die Stelle zu einem Sprechziel (domain/sprechmarken.ts) oder null. */
export function stelleZuSprechziel(ziel: string): HTMLElement | null {
  const haupt = wurzel();
  if (!haupt) return null;
  let el: HTMLElement | null = null;
  if (/^e\d+$/.test(ziel)) el = document.querySelector<HTMLElement>(`[${REF_ATTRIBUT}="${CSS.escape(ziel)}"]`);
  else if (/^a\d+$/.test(ziel)) el = document.querySelector<HTMLElement>(`[${ABSCHNITT_ATTRIBUT}="${CSS.escape(ziel)}"]`);
  else if (ziel.startsWith("#")) {
    const anker = document.getElementById(ziel.slice(1));
    el = anker && haupt.contains(anker) ? (passendeHoehe(anker) ? anker : stelleZu(anker)) : null;
  } else if (ziel.startsWith("t:")) {
    const gesucht = normiert(ziel.slice(2));
    const koepfe = Array.from(haupt.querySelectorAll<HTMLElement>(`${KOEPFE}, a[id], [class*='titel']`)).filter(sichtbar);
    const treffer =
      koepfe.find((k) => normiert(k.textContent ?? "") === gesucht) ??
      koepfe.find((k) => normiert(k.textContent ?? "").startsWith(gesucht) && gesucht.length >= 4);
    el = treffer ? stelleZu(treffer) : null;
  }
  if (!el || !el.isConnected || !haupt.contains(el)) return null;
  return el;
}

function normiert(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Klappt eine Stelle auf, wenn sie oder ein Behaelter um sie zugeklappt ist -
 *  nur, was die Anwendung auch ohne Rueckfrage anklicken wuerde. Liefert, ob
 *  etwas aufgeklappt wurde (dann waechst die Stelle noch). */
export function klappeAuf(stelle: HTMLElement): boolean {
  let geaendert = false;
  for (let d = stelle.closest<HTMLDetailsElement>("details:not([open])"); d; d = d.parentElement?.closest<HTMLDetailsElement>("details:not([open])") ?? null) {
    d.open = true;
    geaendert = true;
  }
  if (stelle instanceof HTMLDetailsElement && !stelle.open) {
    stelle.open = true;
    geaendert = true;
  }
  const knopf = stelle.matches("[aria-expanded='false']")
    ? stelle
    : stelle.querySelector<HTMLElement>(":scope > [aria-expanded='false'], :scope > * > [aria-expanded='false']");
  if (knopf && sichtbar(knopf) && !knopf.matches("[role='tab'], [role='combobox'], [aria-haspopup]:not([aria-haspopup='false'])") && klickStufe(knopf).stufe === "erlaubt") {
    knopf.click();
    geaendert = true;
  }
  return geaendert;
}

function elementFuerRef(ref: string): HTMLElement {
  if (/^a\d+$/.test(ref)) {
    const abschnitt = document.querySelector<HTMLElement>(`[${ABSCHNITT_ATTRIBUT}="${CSS.escape(ref)}"]`);
    if (!abschnitt || !abschnitt.isConnected || !sichtbar(abschnitt)) {
      throw new Error(`Die Referenz ${ref} ist veraltet oder nicht mehr sichtbar. Rufe seiteLesen erneut auf.`);
    }
    return abschnitt;
  }
  const el = document.querySelector<HTMLElement>(`[${REF_ATTRIBUT}="${CSS.escape(ref)}"]`);
  if (!el || !el.isConnected || !sichtbar(el)) {
    throw new Error(`Die Referenz ${ref} ist veraltet oder nicht mehr sichtbar. Rufe seiteLesen erneut auf.`);
  }
  return el;
}

export type Klickstufe = { stufe: "erlaubt" } | { stufe: "gesperrt"; grund: string } | { stufe: "bestaetigen"; grund: KlickAnfrage["grund"] };

const ABMELDEN = /(abmelden|sign.?out|log.?out|выйти|шығу|çıkış)/i;
const LOESCHEN = /(löschen|loeschen|delete|entfernen|remove|stornier|storno|cancel order|удал|отмен|жою|өшіру|\bsil\b|iptal)/i;

/** Wie gefaehrlich ist ein Klick? Entscheidet, ob er direkt laeuft, der Nutzer
 *  zustimmen muss oder er gar nicht erst ausgefuehrt wird. */
export function klickStufe(el: HTMLElement): Klickstufe {
  const label = labelVon(el);
  if (ABMELDEN.test(label)) return { stufe: "gesperrt", grund: "Abmelden kann der Agent nicht auslösen." };
  if (el instanceof HTMLInputElement && el.type === "password") return { stufe: "gesperrt", grund: "Passwortfelder sind gesperrt." };
  if (el instanceof HTMLAnchorElement) {
    if (/\/login|\/auth/i.test(el.pathname)) return { stufe: "gesperrt", grund: "Anmeldeseiten sind gesperrt." };
    if (ausserhalbDerAnwendung(el)) return { stufe: "bestaetigen", grund: "extern" };
    return LOESCHEN.test(label) ? { stufe: "bestaetigen", grund: "loeschen" } : { stufe: "erlaubt" };
  }
  if (LOESCHEN.test(label)) return { stufe: "bestaetigen", grund: "loeschen" };
  const sendet =
    (el instanceof HTMLInputElement && el.type === "submit") ||
    (el instanceof HTMLButtonElement &&
      (el.type === "submit" || el.hasAttribute("formaction")) &&
      (el.form !== null || el.hasAttribute("formaction")));
  return sendet ? { stufe: "bestaetigen", grund: "senden" } : { stufe: "erlaubt" };
}

function hebeHervor(el: Element): void {
  // Der Sprachmodus legt einen Lichtkegel um genau dieses Element (hervorhebung.ts).
  setzeHervorhebung(el);
  el.classList.remove(FOKUS_KLASSE);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(FOKUS_KLASSE);
  window.setTimeout(() => el.classList.remove(FOKUS_KLASSE), 2800);
}

/** Bringt ein Element ins Bild - aber nur, wenn es nicht schon ganz zu sehen ist.
 *  Ein Element der Navigationsleiste liegt fast immer im Bild; scrollIntoView
 *  verschob dort die (overflow-hidden) Leiste selbst nach oben, und sie blieb
 *  verrutscht (Rueckmeldung vom 25.09.2026). Innerhalb von Leiste und Kopf wird
 *  nur das Noetigste gescrollt. Liefert, ob gescrollt wurde. */
export function inSichtBringen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const inRahmen = el.closest("aside, nav, header") !== null;
  // Im Inhalt zaehlt der Streifen unter der festen Kopfzeile nicht als sichtbar.
  const ganzSichtbar = r.top >= (inRahmen ? 0 : 72) && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
  if (ganzSichtbar) return false;
  if (!inRahmen && r.height > window.innerHeight - 160) {
    // Hoeher als das Bild: der Anfang gehoert unter die Kopfzeile, nicht die Mitte.
    window.scrollTo({ top: window.scrollY + r.top - 88, behavior: "smooth" });
    return true;
  }
  el.scrollIntoView({ behavior: "smooth", block: inRahmen ? "nearest" : "center" });
  return true;
}

async function hinFahren(el: HTMLElement, zeiger: ZeigerSteuerung, klick: boolean): Promise<void> {
  const gescrollt = inSichtBringen(el);
  await warte(gescrollt ? 420 : 80);
  const r = el.getBoundingClientRect();
  await zeiger.bewegen(r.left + Math.min(r.width / 2, 120), r.top + r.height / 2, klick);
}

/** Text der zuletzt eingeblendeten Rueckmeldung (Erfolg/Fehler nach einem Absenden). */
function rueckmeldung(): string | null {
  const meldungen = Array.from(document.querySelectorAll<HTMLElement>("#main [role='status'], #main [role='alert']"))
    .filter(sichtbar)
    .map((m) => bereinigt(m.textContent, 160))
    .filter(Boolean);
  return meldungen.at(-1) ?? null;
}

function ungueltigeFelder(form: HTMLFormElement): { feld: string; problem: string }[] {
  return Array.from(form.elements)
    .filter((e): e is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => "checkValidity" in e && !(e as HTMLInputElement).checkValidity())
    .map((e) => ({ feld: labelVon(e), problem: bereinigt(e.validationMessage, 80) }));
}

// Zuletzt abgeschickte Formulare. Schickt der Agent dasselbe Formular kurz danach noch einmal ab (weil
// keine Rueckmeldung zu sehen war), ist das fast immer ein Doppeleintrag: die Freigabekarte sagt es
// dem Nutzer ausdruecklich. Gemessen im Faehigkeitstest: ein Datenschutzvorfall wurde so zweimal angelegt.
const zuletztGesendet = new Map<string, number>();
const DOPPELT_FENSTER_MS = 120_000;
const sendeSchluessel = (el: HTMLElement, label: string): string =>
  `${window.location.pathname}|${el.closest("form")?.getAttribute("action") ?? ""}|${label}`;

async function klicken(ref: string, absicht: string, umgebung: Umgebung) {
  const el = elementFuerRef(ref);
  const stufe = klickStufe(el);
  const label = labelVon(el);
  if (stufe.stufe === "gesperrt") return { ok: false, gesperrt: true, hinweis: stufe.grund };
  if ((el as HTMLButtonElement).disabled) return { ok: false, hinweis: `'${label}' ist deaktiviert.` };

  // Ein unvollstaendiges Formular laesst der Browser gar nicht erst abschicken
  // (Pflichtfeld leer, falsches Format). Das melden wir zurueck, BEVOR der
  // Nutzer um eine Bestaetigung gebeten wird - sonst wuerde er einem Klick
  // zustimmen, der ohnehin nichts bewirkt.
  const formular = el.closest("form");
  if (stufe.stufe === "bestaetigen" && stufe.grund === "senden" && formular && !formular.checkValidity()) {
    return {
      ok: false,
      abgeschickt: false,
      unvollstaendig: true,
      fehlendeFelder: ungueltigeFelder(formular),
      hinweis: "Das Formular ist nicht vollständig oder ein Wert hat das falsche Format. Fülle die genannten Felder mit fuelleFeld aus und klicke dann erneut.",
    };
  }

  const sendetFormular = stufe.stufe === "bestaetigen" && stufe.grund === "senden";
  const schluessel = sendetFormular ? sendeSchluessel(el, label) : "";
  const kuerzlichGesendet = sendetFormular && Date.now() - (zuletztGesendet.get(schluessel) ?? 0) < DOPPELT_FENSTER_MS;

  await hinFahren(el, umgebung.zeiger, false);
  if (stufe.stufe === "bestaetigen") {
    const erlaubt = await umgebung.bestaetigen({ absicht, label, grund: kuerzlichGesendet ? "doppelt" : stufe.grund });
    if (!erlaubt) return { ok: false, abgelehnt: true, hinweis: "Der Nutzer hat diesen Klick abgelehnt. Nichts wurde ausgeführt." };
  }
  const vorher = `${window.location.pathname}${window.location.hash}`;
  let abgeschickt = false;
  const merke = () => {
    abgeschickt = true;
  };
  formular?.addEventListener("submit", merke, { capture: true, once: true });
  await umgebung.zeiger.bewegen(el.getBoundingClientRect().left + 8, el.getBoundingClientRect().top + 8, true);
  el.click();
  await warteBisRuhig();
  formular?.removeEventListener("submit", merke, true);
  const nachher = `${window.location.pathname}${window.location.hash}`;
  if (sendetFormular && !abgeschickt) {
    return { ok: false, abgeschickt: false, hinweis: "Der Klick hat das Formular NICHT abgeschickt. Lies die Seite erneut und prüfe die Felder." };
  }
  if (sendetFormular) zuletztGesendet.set(schluessel, Date.now());
  const meldung = rueckmeldung();
  return {
    ok: true,
    geklickt: label,
    ...(sendetFormular ? { abgeschickt: true } : {}),
    url: nachher,
    seiteGewechselt: nachher !== vorher,
    rueckmeldung: meldung,
    hinweis: sendetFormular && !meldung
      ? "Abgeschickt, aber keine Rückmeldung sichtbar. Schicke das Formular NICHT noch einmal ab. Lies die Seite oder Liste erneut und belege das Ergebnis, bevor du Erfolg meldest."
      : "Die Referenzen sind jetzt veraltet - rufe seiteLesen erneut auf, bevor du weitermachst.",
  };
}

function setzeWert(el: HTMLInputElement | HTMLTextAreaElement, wert: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, wert);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function ausfuellen(ref: string, wert: string, umgebung: Umgebung) {
  const el = elementFuerRef(ref);
  const label = labelVon(el);
  if (el instanceof HTMLInputElement && (el.type === "password" || el.type === "file" || el.type === "hidden")) {
    return { ok: false, gesperrt: true, hinweis: "Dieses Feld kann der Agent nicht ausfüllen." };
  }
  if ((el as HTMLInputElement).disabled) return { ok: false, hinweis: `'${label}' ist deaktiviert.` };

  await hinFahren(el, umgebung.zeiger, true);
  if (el instanceof HTMLSelectElement) {
    const gesucht = wert.trim().toLowerCase();
    const option = Array.from(el.options).find(
      (o) => o.value.toLowerCase() === gesucht || (o.textContent ?? "").trim().toLowerCase() === gesucht,
    ) ?? Array.from(el.options).find((o) => (o.textContent ?? "").toLowerCase().includes(gesucht));
    if (!option) {
      return { ok: false, hinweis: `Option '${wert}' nicht gefunden. Verfuegbar: ${Array.from(el.options).map((o) => (o.textContent ?? "").trim()).slice(0, 25).join(", ")}` };
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(el, option.value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, feld: label, gewaehlt: (option.textContent ?? "").trim() };
  }
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    const soll = el.type === "radio" ? true : /^(true|ja|yes|an|1)$/i.test(wert.trim());
    if (el.checked !== soll) el.click();
    return { ok: true, feld: label, angehakt: el.checked };
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    setzeWert(el, wert);
    return { ok: true, feld: label, wert: bereinigt(el.value, 80) };
  }
  return { ok: false, hinweis: `'${label}' ist kein Eingabefeld.` };
}

async function scrollen(ref: string | undefined, richtung: string | undefined) {
  if (ref) {
    const el = elementFuerRef(ref);
    const gescrollt = inSichtBringen(el);
    await warte(gescrollt ? 500 : 80);
    return { ok: true };
  }
  const schritt = window.innerHeight * 0.8;
  if (richtung === "oben") window.scrollTo({ top: 0, behavior: "smooth" });
  else if (richtung === "unten") window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  else window.scrollBy({ top: schritt, behavior: "smooth" });
  await warte(600);
  return { ok: true, scrollPosition: Math.round(window.scrollY) };
}

async function zeigen(ref: string, umgebung: Umgebung) {
  const el = elementFuerRef(ref);
  const abschnitt = /^a\d+$/.test(ref);
  // Ein zugeklappter Abschnitt zeigt nichts: erst aufklappen, dann hinzeigen.
  const aufgeklappt = abschnitt && klappeAuf(el);
  if (aufgeklappt) await warte(320);
  await hinFahren(el, umgebung.zeiger, false);
  hebeHervor(el);
  await warte(500);
  return { ok: true, gezeigt: abschnitt ? titelVon(el) : labelVon(el), ...(aufgeklappt ? { aufgeklappt: true } : {}) };
}

/** Fuehrt ein Client-Werkzeug aus. Wirft nur bei Programmfehlern - erwartbare
 *  Fehlschlaege (veraltete Referenz, gesperrt, abgelehnt) sind normale Ergebnisse,
 *  mit denen das Modell weiterarbeiten kann. */
export async function fuehreUiWerkzeugAus(name: string, eingabe: unknown, umgebung: Umgebung): Promise<unknown> {
  const e = (eingabe ?? {}) as Record<string, unknown>;
  const text = (k: string) => (typeof e[k] === "string" ? (e[k] as string) : "");
  try {
    if (name === "seiteLesen") return await schnappschuss(text("fokus") || undefined);
    if (!umgebung.agentModus) {
      return { ok: false, hinweis: "Die Seite bedienen kann ich nur im Agent-Modus (Zahnrad im Panel) oder im Sprachmodus. Lesen ist in jedem Modus möglich." };
    }
    if (name === "klicke") return await klicken(text("ref"), text("absicht"), umgebung);
    if (name === "fuelleFeld") return await ausfuellen(text("ref"), text("wert"), umgebung);
    if (name === "scrolleZu") return await scrollen(text("ref") || undefined, text("richtung") || undefined);
    if (name === "zeigeAuf") return await zeigen(text("ref"), umgebung);
    return { ok: false, hinweis: `Unbekanntes Werkzeug ${name}.` };
  } catch (fehler) {
    return { ok: false, hinweis: fehler instanceof Error ? fehler.message : "Unbekannter Fehler." };
  }
}
