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

export interface Schnappschuss {
  url: string;
  titel: string;
  ueberschriften: string[];
  text: string;
  elemente: ElementInfo[];
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
const MAX_TEXT = 3200;
const FOKUS_KLASSE = "ki-fokus";
const REF_ATTRIBUT = "data-ki-ref";

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

// Die Adresse samt Query: eine Liste mit Detailansicht (DESIGN.md Abschnitt 14)
// haelt Filter, Seite und gewaehlten Eintrag dort. Ohne sie saehe der Agent
// nicht, dass sich die Ansicht geaendert hat, und zwei Aufgaben derselben
// Seite waeren fuer ihn eine.
const adresse = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

export async function schnappschuss(fokus?: string): Promise<Schnappschuss> {
  await warteBisRuhig(1800, 250);
  const haupt = wurzel();
  const url = adresse();
  if (!haupt) return { url, titel: document.title, ueberschriften: [], text: "", elemente: [], hinweis: "Kein Inhaltsbereich gefunden." };

  document.querySelectorAll(`[${REF_ATTRIBUT}]`).forEach((e) => e.removeAttribute(REF_ATTRIBUT));
  const stichwort = fokus?.trim().toLowerCase();
  const elemente: ElementInfo[] = [];
  let zaehler = 0;
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
    zaehler += 1;
    const ref = `e${zaehler}`;
    el.setAttribute(REF_ATTRIBUT, ref);
    const info: ElementInfo = { ref, typ: typVon(el), label: label || "(ohne Beschriftung)", gruppe };
    if (el instanceof HTMLAnchorElement) info.ziel = el.pathname + el.search + el.hash;
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
    hinweis: abgeschnitten
      ? `Mehr als ${MAX_ELEMENTE} Elemente - nutze 'fokus', um die Liste einzugrenzen.`
      : undefined,
  };
}

function elementFuerRef(ref: string): HTMLElement {
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
  el.classList.remove(FOKUS_KLASSE);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(FOKUS_KLASSE);
  window.setTimeout(() => el.classList.remove(FOKUS_KLASSE), 2800);
}

async function hinFahren(el: HTMLElement, zeiger: ZeigerSteuerung, klick: boolean): Promise<void> {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  await warte(420);
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
  `${adresse()}|${el.closest("form")?.getAttribute("action") ?? ""}|${label}`;

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
  const vorher = adresse();
  let abgeschickt = false;
  const merke = () => {
    abgeschickt = true;
  };
  formular?.addEventListener("submit", merke, { capture: true, once: true });
  await umgebung.zeiger.bewegen(el.getBoundingClientRect().left + 8, el.getBoundingClientRect().top + 8, true);
  el.click();
  await warteBisRuhig();
  formular?.removeEventListener("submit", merke, true);
  const nachher = adresse();
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
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    await warte(500);
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
  await hinFahren(el, umgebung.zeiger, false);
  hebeHervor(el);
  await warte(500);
  return { ok: true, gezeigt: labelVon(el) };
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
      return { ok: false, hinweis: "Die Seite bedienen kann ich nur im Agent-Modus (Zahnrad im Panel). Lesen ist in beiden Modi möglich." };
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
