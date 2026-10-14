import { createRequire } from "node:module";
import { join } from "node:path";
import { installiereAttrappen } from "./dom-attrappen";

// Ein Browserfenster aus jsdom als globale Umgebung für DOM-Tests (seit 14.10.2026).
//
// React DOM prüft schon beim Laden, ob es ein document gibt, und die Testing Library baut `screen` beim Laden über document.body.
// Deshalb richtet dieses Modul alles ein, bevor irgendein React-Modul geladen wird: window, document, navigator, localStorage,
// requestAnimationFrame, die DOM-Klassen (HTMLElement, KeyboardEvent, PointerEvent ...) und die Attrappen aus dom-attrappen.ts.
// Es wird von dom-umgebung.tsx als erstes importiert; ein Test importiert dom-umgebung.tsx als erstes.
//
// Was global bleibt, wie Node es hat: Zeitgeber (setTimeout ...), queueMicrotask, URL, TextEncoder, AbortController, crypto,
// performance, Response, Headers und ReadableStream. Event, CustomEvent, EventTarget, Blob, File, FormData und navigator kommen
// aus jsdom, damit dispatchEvent und new FormData(formular) mit den DOM-Knoten zusammenpassen.

interface JsdomFehler {
  type?: string;
  message: string;
}
interface VirtuelleKonsole {
  on(ereignis: "jsdomError", hoerer: (fehler: JsdomFehler) => void): void;
}
interface JsdomInstanz {
  window: Window & typeof globalThis;
  reconfigure(einstellung: { url?: string }): void;
}
interface JsdomModul {
  JSDOM: new (html: string, optionen: { url: string; pretendToBeVisual: boolean; virtualConsole: VirtuelleKonsole }) => JsdomInstanz;
  VirtualConsole: new () => VirtuelleKonsole;
}

// jsdom bringt keine Typen mit. Geladen über require aus dem Projektordner (npm test läuft dort, wie ansicht-probe.tsx voraussetzt),
// mit den wenigen Typen von oben.
const { JSDOM, VirtualConsole } = createRequire(join(process.cwd(), "package.json"))("jsdom") as JsdomModul;

export const ADRESSE = "http://localhost";

/** Was jsdom selbst meldet: nicht umgesetzte Schnittstellen ("not-implemented", etwa window.alert) und Ausnahmen in Ereignis-
 *  Hörern ("unhandled-exception"; jsdom fängt sie ab, statt sie an dispatchEvent weiterzugeben). Ein Test prüft, dass sie leer ist. */
export const umgebungsFehler: { art: string; text: string }[] = [];
const konsole = new VirtualConsole();
konsole.on("jsdomError", (fehler) => {
  umgebungsFehler.push({ art: fehler.type ?? "fehler", text: fehler.message });
  if (fehler.type === "unhandled-exception") console.error(`jsdom: unbehandelte Ausnahme im Fenster: ${fehler.message}`);
});

export const dom = new JSDOM(`<!doctype html><html lang="de"><head></head><body></body></html>`, {
  url: `${ADRESSE}/de`,
  pretendToBeVisual: true,
  virtualConsole: konsole,
});
export const fenster = dom.window;

// ---- Globale Namen ----------------------------------------------------------------------------------------------------------------
type Eintraege = Record<string, unknown>;
const fensterEintraege = fenster as unknown as Eintraege;

/** Klassen, die jsdom statt Node stellt, obwohl Node sie auch kennt. */
const VON_JSDOM = new Set(["Event", "CustomEvent", "EventTarget", "MessageEvent", "CloseEvent", "Blob", "File", "FormData", "Navigator"]);

/** Glieder des Fensters, die auch ohne "window." erreichbar sein sollen. Gelesen wird jedes Mal am Fenster: was ein Test dort ändert
 *  (setzeFenster, Uhr), gilt sofort auch global. */
const FENSTER_GLIEDER = [
  "document",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "screen",
  "innerWidth",
  "innerHeight",
  "devicePixelRatio",
  "scrollX",
  "scrollY",
  "pageXOffset",
  "pageYOffset",
  "getComputedStyle",
  "getSelection",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "scrollTo",
  "scrollBy",
  "customElements",
];

const klassen = new Set<string>();
for (let o: object | null = fenster; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
  for (const name of Object.getOwnPropertyNames(o)) if (/^[A-Z]/.test(name)) klassen.add(name);
}
for (const name of klassen) {
  if (name in globalThis && !VON_JSDOM.has(name)) continue;
  const wert = fensterEintraege[name];
  if (typeof wert === "function") Object.defineProperty(globalThis, name, { value: wert, configurable: true, writable: true });
}
for (const name of FENSTER_GLIEDER) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    get: () => {
      const wert = fensterEintraege[name];
      return typeof wert === "function" ? wert.bind(fenster) : wert;
    },
    set: (wert: unknown) => {
      fensterEintraege[name] = wert;
    },
  });
}
Object.defineProperty(globalThis, "window", { value: fenster, configurable: true, writable: true });

// React meldet Zustandsänderungen außerhalb von act(), wenn diese Marke steht.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

installiereAttrappen(fenster);

// ---- Steuerung des Fensters -------------------------------------------------------------------------------------------------------
/** Setzt die Adresse des Fensters ohne Navigation, etwa "/de/dashboard?x=1". window.location.pathname folgt sofort. */
export function setzeAdresse(pfad: string): void {
  dom.reconfigure({ url: new URL(pfad, ADRESSE).href });
}

/** Fenstergröße und Pixelverhältnis; meldet resize am Fenster, außer `melden` ist false. In ausloesen() rufen, wenn React reagiert. */
export function setzeFenster(groesse: { breite?: number; hoehe?: number; pixelVerhaeltnis?: number }, melden = true): void {
  if (groesse.breite !== undefined) fensterEintraege.innerWidth = groesse.breite;
  if (groesse.hoehe !== undefined) fensterEintraege.innerHeight = groesse.hoehe;
  if (groesse.pixelVerhaeltnis !== undefined) fensterEintraege.devicePixelRatio = groesse.pixelVerhaeltnis;
  if (melden) fenster.dispatchEvent(new fenster.Event("resize"));
}

/** document.visibilityState und document.hidden; meldet visibilitychange, außer `melden` ist false. */
export function setzeSichtbarkeit(zustand: "visible" | "hidden", melden = true): void {
  Object.defineProperty(fenster.document, "visibilityState", { configurable: true, get: () => zustand });
  Object.defineProperty(fenster.document, "hidden", { configurable: true, get: () => zustand === "hidden" });
  if (melden) fenster.document.dispatchEvent(new fenster.Event("visibilitychange"));
}
