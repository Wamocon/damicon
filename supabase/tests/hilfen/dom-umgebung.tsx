// Muss vor jedem React-Modul geladen sein: richtet das Fenster aus jsdom global ein (siehe dort).
import { ADRESSE, fenster, setzeAdresse, setzeFenster, setzeSichtbarkeit, umgebungsFehler } from "./dom-globale";
import { act, cleanup, render, renderHook, type RenderHookResult, type RenderResult } from "@testing-library/react";
import { statSync } from "node:fs";
import * as nodeModule from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, lazy, Suspense, useSyncExternalStore, type ComponentType, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { texteVon } from "./ansicht-probe";
import { aktuelleUhr, leereMikrotasks, setzeAktHuelle, zuruecksetzenAttrappen } from "./dom-attrappen";

// DOM-Testumgebung für Charakterisierungstests von React-Client-Komponenten und Hooks (seit 14.10.2026).
//
// Vor dem Zerlegen von Haustier, KI-Chat, KI-Pane, Sprachmodus, Sprachausgabe und ui-steuerung sollen deren Effekte, Ereignisse,
// Zeitgeber und Zustandsübergänge ohne Browser abgesichert sein. Diese Datei bündelt dafür:
//   * das Fenster aus jsdom (dom-globale.ts) und die Attrappen der Browser-Schnittstellen samt steuerbarer Uhr (dom-attrappen.ts),
//   * render, renderHook, act, fireEvent und screen der Testing Library, dazu rendereMitTexten() und rendereHookMitTexten() mit
//     NextIntlClientProvider und den echten Texten aus src/messages,
//   * ersetzeModule(): ganze Module (next/navigation, Server Actions, Datenlader) durch Attrappen ersetzen, Aufrufe aufzeichnen,
//   * erzeugeNavigation() und NEXT_MODULE für die Next-Module, die außerhalb von Next nicht laufen,
//   * ausloesen(), abwarten(), warteBis(), beobachteKonsole(), setzeUmgebungZurueck() und beendeUmgebung().
// Die Anleitung steht am Ende dieser Datei.

export { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
export { pruefer } from "./ansicht-probe";
export { ADRESSE, dom, fenster, setzeAdresse, setzeFenster, setzeSichtbarkeit, umgebungsFehler } from "./dom-globale";
export {
  aktuelleUhr,
  AnalyserAttrappe,
  AudioContextAttrappe,
  erzeugeStrom,
  GainAttrappe,
  installiereUhr,
  IntersectionObserverAttrappe,
  leereMikrotasks,
  leinwand,
  MediaRecorderAttrappe,
  MediaStreamAttrappe,
  MediaStreamTrackAttrappe,
  medienAbfragen,
  medienElemente,
  mikrofon,
  netz,
  objektUrls,
  protokoll,
  PufferAttrappe,
  QuelleAttrappe,
  ResizeObserverAttrappe,
  setzeRechteck,
  WebSocketAttrappe,
  type AntwortVorgabe,
  type AttrappenEreignis,
  type FetchAufruf,
  type Pegel,
  type StromAttrappe,
  type Uhr,
  type UhrOptionen,
} from "./dom-attrappen";

// Jeder Schritt der Uhr läuft in act(): React rendert und führt Effekte aus, bevor der nächste Zeitgeber fällig wird.
setzeAktHuelle((schritt) => act(schritt));

// ---- Auslösen und Abwarten ------------------------------------------------------------------------------------------------------
/** Führt `ausloeser` in act() aus und lässt danach Mikrotasks und React durchlaufen. Für alles, was nicht über fireEvent kommt:
 *  eine Nachricht am WebSocket, ein Stück im fetch-Strom, eine Medienabfrage, ein Rückruf einer Attrappe, ein Aufruf aus einem Hook.
 *  Gibt der Auslöser ein Promise zurück, wartet ausloesen NICHT auf dessen Ende (es könnte auf die Uhr warten): scheitert es schon
 *  beim Durchlaufen, wirft ausloesen den Fehler, scheitert es später, steht er in umgebungsFehler (art "ausloeser"). */
export async function ausloesen(ausloeser: () => unknown): Promise<void> {
  const zustand: { vorbei: boolean; fehler?: unknown } = { vorbei: false };
  await act(async () => {
    const ergebnis = ausloeser();
    if (ergebnis instanceof Promise)
      ergebnis.catch((fehler: unknown) => {
        if (zustand.vorbei) umgebungsFehler.push({ art: "ausloeser", text: fehler instanceof Error ? fehler.message : String(fehler) });
        else zustand.fehler = fehler;
      });
    await leereMikrotasks();
  });
  zustand.vorbei = true;
  if ("fehler" in zustand) throw zustand.fehler;
}

/** Lässt Mikrotasks und React durchlaufen, ohne die Uhr zu bewegen (etwa nach einem Klick, der fetch startet). */
export async function abwarten(): Promise<void> {
  await act(async () => {
    await leereMikrotasks();
  });
}

/** Wartet, bis `bedingung` gilt, höchstens `maxMs`. Mit Uhr: stellt sie in Schritten von `schrittMs` vor. Ohne Uhr: wartet echt.
 *  Gibt zurück, ob die Bedingung erreicht wurde (wirft nicht; das Ergebnis gehört in pruefe()). */
export async function warteBis(bedingung: () => boolean, { maxMs = 1000, schrittMs = 10 } = {}): Promise<boolean> {
  for (let vergangen = 0; ; vergangen += schrittMs) {
    await abwarten();
    if (bedingung()) return true;
    if (vergangen >= maxMs) return false;
    const uhr = aktuelleUhr();
    if (uhr) await uhr.vor(schrittMs);
    else await act(() => new Promise<void>((fertig) => setTimeout(fertig, schrittMs)));
  }
}

/** Fängt console.error und console.warn ab (React meldet dort etwa Updates außerhalb von act()). stoppe() stellt sie wieder her. */
export function beobachteKonsole(): { fehler: string[]; warnungen: string[]; stoppe(): void } {
  const alt = { error: console.error, warn: console.warn };
  const fehler: string[] = [];
  const warnungen: string[] = [];
  const text = (teile: unknown[]) => teile.map((t) => (t instanceof Error ? t.message : String(t))).join(" ");
  console.error = (...teile: unknown[]) => void fehler.push(text(teile));
  console.warn = (...teile: unknown[]) => void warnungen.push(text(teile));
  return {
    fehler,
    warnungen,
    stoppe() {
      console.error = alt.error;
      console.warn = alt.warn;
    },
  };
}

// ---- Rendern mit Texten -----------------------------------------------------------------------------------------------------------
type Rahmen = ComponentType<{ children: ReactNode }>;
interface TextOptionen {
  /** Sprache der Texte (Vorgabe "de"). */
  sprache?: string;
  /** Weitere Provider innerhalb des Textrahmens, etwa KiPaneProvider. */
  wrapper?: Rahmen;
}

function textRahmen(sprache: string, innen: Rahmen | undefined, textFehler: string[]): Rahmen {
  return function TextRahmen({ children }) {
    return (
      <NextIntlClientProvider
        locale={sprache}
        timeZone="Europe/Berlin"
        messages={texteVon(sprache)}
        onError={(e) => {
          if (e.code !== "ENVIRONMENT_FALLBACK") textFehler.push(e.message);
        }}
        getMessageFallback={({ namespace, key }) => `!!${namespace ? `${namespace}.` : ""}${key}!!`}
      >
        {innen ? createElement(innen, null, children) : children}
      </NextIntlClientProvider>
    );
  };
}

/** render() im NextIntlClientProvider mit den echten Texten. `textFehler` sammelt fehlende Schlüssel (im DOM als !!ns.schluessel!!). */
export function rendereMitTexten(element: ReactElement, optionen: TextOptionen & { container?: HTMLElement } = {}): RenderResult & { textFehler: string[] } {
  const textFehler: string[] = [];
  const ergebnis = render(element, { wrapper: textRahmen(optionen.sprache ?? "de", optionen.wrapper, textFehler), container: optionen.container });
  return Object.assign(ergebnis, { textFehler });
}

/** renderHook() im selben Textrahmen. */
export function rendereHookMitTexten<Ergebnis, Eigenschaften>(
  hook: (eigenschaften: Eigenschaften) => Ergebnis,
  optionen: TextOptionen & { initialProps?: Eigenschaften } = {},
): RenderHookResult<Ergebnis, Eigenschaften> & { textFehler: string[] } {
  const textFehler: string[] = [];
  const ergebnis = renderHook(hook, { wrapper: textRahmen(optionen.sprache ?? "de", optionen.wrapper, textFehler), initialProps: optionen.initialProps });
  return Object.assign(ergebnis, { textFehler });
}

// ---- Module ersetzen ------------------------------------------------------------------------------------------------------------
// Über module.registerHooks (Node 22.15 oder neuer), das für import und require greift, wie hilfen/modul-ersatz.ts. Anders als dort:
// Exporte dürfen auch Werte und Klassen sein, "default" geht, jeder Funktionsaufruf landet in `modulAufrufe`, mehrere Aufrufe von
// ersetzeModule() ergänzen einander, und ein "@/..."-Modul wird auch dann ersetzt, wenn jemand es über einen relativen Pfad lädt.
// Dazu werden CSS-Importe (import "./x.css") zu leeren Modulen.

type Exporte = Record<string, unknown>;
export interface ModulAufruf {
  modul: string;
  name: string;
  argumente: unknown[];
}
/** Jeder Aufruf einer ersetzten Funktion, in Reihenfolge. */
export const modulAufrufe: ModulAufruf[] = [];
/** Die Aufrufe eines ersetzten Moduls, auf Wunsch nur einer Funktion. */
export const aufrufeVon = (modul: string, name?: string): unknown[][] =>
  modulAufrufe.filter((a) => a.modul === modul && (name === undefined || a.name === name)).map((a) => a.argumente);

interface Hooks {
  resolve(spezifizierer: string, kontext: unknown, weiter: (spezifizierer: string, kontext?: unknown) => { url: string }): { url: string; shortCircuit?: boolean };
  load(url: string, kontext: unknown, weiter: (url: string, kontext?: unknown) => unknown): unknown;
}
const registerHooks = (nodeModule as unknown as { registerHooks?: (hooks: Hooks) => unknown }).registerHooks;
if (!registerHooks) throw new Error("module.registerHooks fehlt: die DOM-Tests brauchen Node 22.15 oder neuer.");

const SCHEMA = "dom-ersatz:";
const CSS = `${SCHEMA}css`;
const ersatz = new Map<string, Exporte>();
const dateiZuModul = new Map<string, string>();
const huellen = new Map<string, unknown>();

/** Eine Funktion, die bei jedem Aufruf mitschreibt und die Funktion ruft, die in diesem Moment im Ersatz steht (auch mit new). */
function huelle(modul: string, name: string): unknown {
  const schluessel = `${modul}#${name}`;
  let h = huellen.get(schluessel);
  if (!h) {
    h = function (this: unknown, ...argumente: unknown[]) {
      modulAufrufe.push({ modul, name, argumente });
      const ziel = ersatz.get(modul)?.[name];
      if (typeof ziel !== "function") throw new Error(`Ersatz für ${modul}: ${name} ist keine Funktion mehr.`);
      return new.target ? Reflect.construct(ziel, argumente) : ziel.apply(this, argumente);
    };
    Object.defineProperty(h, "name", { value: name });
    huellen.set(schluessel, h);
  }
  return h;
}
(globalThis as { __domErsatz?: unknown }).__domErsatz = {
  export(modul: string, name: string): unknown {
    const wert = ersatz.get(modul)?.[name];
    return typeof wert === "function" ? huelle(modul, name) : wert;
  },
};

const dateiUrl = (pfad: string) => pathToFileURL(pfad).href.toLowerCase();
function dateiFuer(modul: string): string | null {
  if (!modul.startsWith("@/")) return null;
  const basis = join(process.cwd(), "src", modul.slice(2));
  for (const kandidat of [basis, `${basis}.ts`, `${basis}.tsx`, join(basis, "index.ts"), join(basis, "index.tsx")]) {
    if (statSync(kandidat, { throwIfNoEntry: false })?.isFile()) return dateiUrl(kandidat);
  }
  return null;
}

registerHooks({
  resolve(spezifizierer, kontext, weiter) {
    if (/\.css(\?.*)?$/.test(spezifizierer)) return { url: CSS, shortCircuit: true };
    if (ersatz.has(spezifizierer)) return { url: SCHEMA + encodeURIComponent(spezifizierer), shortCircuit: true };
    const ergebnis = weiter(spezifizierer, kontext);
    const modul = dateiZuModul.size > 0 ? dateiZuModul.get(ergebnis.url.split("?")[0]!.toLowerCase()) : undefined;
    return modul ? { url: SCHEMA + encodeURIComponent(modul), shortCircuit: true } : ergebnis;
  },
  load(url, kontext, weiter) {
    if (url === CSS) return { format: "module", source: "", shortCircuit: true };
    if (!url.startsWith(SCHEMA)) return weiter(url, kontext);
    const modul = decodeURIComponent(url.slice(SCHEMA.length));
    const zeilen = Object.keys(ersatz.get(modul) ?? {}).map((name) => {
      const zugriff = `globalThis.__domErsatz.export(${JSON.stringify(modul)}, ${JSON.stringify(name)})`;
      return name === "default" ? `export default ${zugriff};` : `export const ${name} = ${zugriff};`;
    });
    return { format: "module", source: zeilen.join("\n"), shortCircuit: true };
  },
});

/**
 * Ersetzt Module durch Attrappen: { "<wie im import geschrieben>": { exportName: wert } }. Muss laufen, bevor das Modul unter Test
 * (und alles, was das ersetzte Modul lädt) zum ersten Mal geladen wird; das Modul unter Test also danach mit await import() holen.
 * Funktionen werden bei jedem Aufruf in `modulAufrufe` geschrieben und lassen sich später austauschen (dasselbe Objekt ändern oder
 * ersetzeModule erneut rufen); Werte gelten so, wie sie beim Laden standen. Neue Exportnamen nach dem Laden kommen nicht mehr an.
 */
export function ersetzeModule(neu: Record<string, Exporte>): void {
  for (const [modul, exporte] of Object.entries(neu)) {
    for (const name of Object.keys(exporte)) {
      if (name !== "default" && !/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error(`Ersatz für ${modul}: "${name}" ist kein gültiger Exportname.`);
    }
    const bisher = ersatz.get(modul);
    if (bisher) Object.assign(bisher, exporte);
    else ersatz.set(modul, exporte);
    const datei = dateiFuer(modul);
    if (datei) dateiZuModul.set(datei, modul);
  }
}

// ---- Next-Module ------------------------------------------------------------------------------------------------------------------
type Verweis = string | { pathname?: string; query?: Record<string, string> };
const verweisText = (href: Verweis): string =>
  typeof href === "string" ? href : `${href.pathname ?? ""}${href.query ? `?${new URLSearchParams(href.query).toString()}` : ""}`;

export interface Navigation {
  /** Pfad ohne Sprachpräfix, wie usePathname() aus @/i18n/navigation ihn liefert. */
  readonly pfad: string;
  /** Was der Router getan hat: "push /x", "replace /y", "refresh", "back", "prefetch /z", "redirect /w". */
  readonly verlauf: string[];
  readonly router: { push(ziel: string): void; replace(ziel: string): void; refresh(): void; back(): void; forward(): void; prefetch(ziel: string): void };
  /** Wechselt die Seite (Pfad ohne Sprachpräfix): usePathname rendert neu, window.location folgt. In ausloesen() rufen. */
  setzePfad(pfad: string): void;
  /** Für ersetzeModule(): "@/i18n/navigation", "next/navigation" und "next/link". */
  readonly module: Record<string, Exporte>;
}

/**
 * Attrappe für die Navigation von next-intl (@/i18n/navigation) und Next (next/navigation, next/link). router.push und replace
 * schreiben in `verlauf` und wechseln die Seite, Link rendert ein <a> und navigiert beim Klick über den Router.
 */
export function erzeugeNavigation(start = "/", sprache = "de"): Navigation {
  let pfad = start;
  let suche = new URLSearchParams();
  const verlauf: string[] = [];
  const hoerer = new Set<() => void>();
  const abonniere = (h: () => void) => {
    hoerer.add(h);
    return () => void hoerer.delete(h);
  };
  const geheZu = (ziel: string) => {
    const adresse = new URL(ziel, `${ADRESSE}${pfad}`);
    pfad = adresse.pathname;
    suche = adresse.searchParams;
    setzeAdresse(`/${sprache}${pfad === "/" ? "" : pfad}${adresse.search}${adresse.hash}`);
    hoerer.forEach((h) => h());
  };
  const router = {
    push: (ziel: string) => {
      verlauf.push(`push ${ziel}`);
      geheZu(ziel);
    },
    replace: (ziel: string) => {
      verlauf.push(`replace ${ziel}`);
      geheZu(ziel);
    },
    refresh: () => void verlauf.push("refresh"),
    back: () => void verlauf.push("back"),
    forward: () => void verlauf.push("forward"),
    prefetch: (ziel: string) => void verlauf.push(`prefetch ${ziel}`),
  };
  const usePathname = () => useSyncExternalStore(abonniere, () => pfad, () => pfad);
  const useSearchParams = () => useSyncExternalStore(abonniere, () => suche, () => suche);
  const useRouter = () => router;
  const redirect = (ziel: Verweis) => {
    verlauf.push(`redirect ${verweisText(ziel)}`);
    throw new Error(`NEXT_REDIRECT ${verweisText(ziel)}`);
  };
  const notFound = () => {
    throw new Error("NEXT_NOT_FOUND");
  };
  function Link({ href, replace, children, onClick, ...rest }: { href: Verweis; replace?: boolean; children?: ReactNode; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void } & Record<string, unknown>) {
    const ziel = verweisText(href);
    const html = Object.fromEntries(Object.entries(rest).filter(([name]) => !["prefetch", "locale", "scroll", "shallow", "passHref", "legacyBehavior"].includes(name)));
    return createElement(
      "a",
      {
        ...html,
        href: ziel,
        onClick: (e: MouseEvent<HTMLAnchorElement>) => {
          onClick?.(e);
          if (e.defaultPrevented) return;
          e.preventDefault();
          if (replace) router.replace(ziel);
          else router.push(ziel);
        },
      },
      children,
    );
  }
  const useNextPathname = () => {
    const p = usePathname();
    return `/${sprache}${p === "/" ? "" : p}`;
  };
  return {
    get pfad() {
      return pfad;
    },
    verlauf,
    router,
    setzePfad(neu) {
      geheZu(neu);
    },
    module: {
      "@/i18n/navigation": { Link, redirect, usePathname, useRouter, getPathname: ({ href }: { href: Verweis }) => verweisText(href) },
      "next/navigation": {
        useRouter,
        usePathname: useNextPathname,
        useSearchParams,
        useParams: () => ({ locale: sprache }),
        redirect,
        permanentRedirect: redirect,
        notFound,
      },
      "next/link": { default: Link },
    },
  };
}

/** next/dynamic: lädt die Komponente über React.lazy (in Suspense, mit `loading` als Platzhalter). */
function dynamisch(lader: () => Promise<unknown>, optionen: { loading?: ComponentType } = {}): ComponentType<Record<string, unknown>> {
  const Faul = lazy(async () => {
    const m = await lader();
    const komponente = typeof m === "function" ? m : (m as { default: unknown }).default;
    return { default: komponente as ComponentType<Record<string, unknown>> };
  });
  return function Dynamisch(eigenschaften: Record<string, unknown>) {
    return createElement(Suspense, { fallback: optionen.loading ? createElement(optionen.loading) : null }, createElement(Faul, eigenschaften));
  };
}

/** next/image: ein schlichtes <img> ohne die Next-Eigenschaften. */
function Bild({ src, alt, width, height, className, style }: { src: string | { src: string }; alt: string; width?: number; height?: number; className?: string; style?: object }) {
  return createElement("img", { src: typeof src === "string" ? src : src.src, alt, width, height, className, style });
}

/** Ersatz für next/dynamic und next/image (zusammen mit erzeugeNavigation().module an ersetzeModule geben). */
export const NEXT_MODULE: Record<string, Exporte> = {
  "next/dynamic": { default: dynamisch },
  "next/image": { default: Bild },
};

// ---- Zurücksetzen -----------------------------------------------------------------------------------------------------------------
/** Zwischen zwei Testfällen: hängt alles Gerenderte ab (Effekte räumen auf), schaltet eine laufende Uhr ab, leert Protokoll,
 *  Aufzeichnungen, Speicher und Dokument und stellt Adresse, Fenstergröße und Sichtbarkeit zurück. Ersetzte Module bleiben. */
export function setzeUmgebungZurueck(): void {
  cleanup();
  aktuelleUhr()?.deinstalliere();
  zuruecksetzenAttrappen();
  modulAufrufe.length = 0;
  umgebungsFehler.length = 0;
  fenster.localStorage.clear();
  fenster.sessionStorage.clear();
  fenster.document.head.innerHTML = "";
  fenster.document.body.innerHTML = "";
  const wurzel = fenster.document.documentElement;
  for (const attribut of [...wurzel.attributes]) if (attribut.name !== "lang") wurzel.removeAttribute(attribut.name);
  setzeAdresse("/de");
  setzeFenster({ breite: 1024, hoehe: 768, pixelVerhaeltnis: 1 }, false);
  setzeSichtbarkeit("visible", false);
}

/** Am Ende des Tests: setzt zurück und schließt das Fenster (seine Zeitgeber halten den Prozess dann nicht mehr offen). */
export function beendeUmgebung(): void {
  setzeUmgebungZurueck();
  fenster.close();
}

// ---- Anleitung ----------------------------------------------------------------------------------------------------------------------
// Start: eine Datei supabase/tests/<name>.tsx, Skript "test:<name>": "npx --yes tsx supabase/tests/<name>.tsx" in package.json und
// in die Kette von "test". Beispiel mit allen Bausteinen: supabase/tests/dom-umgebung.tsx (npm run test:dom-umgebung). tsx übersetzt
// die Datei als CommonJS: kein await auf oberster Ebene, der Ablauf steht in async function main() mit main().catch(...).
//
// Importreihenfolge: import { ... } from "./hilfen/dom-umgebung" ist der ERSTE Import der Testdatei. Danach dürfen Komponenten statisch
// importiert werden, die keine ersetzten Module brauchen. Wer ersetzeModule() braucht: erst ersetzeModule({...}) aufrufen, dann die
// Komponente mit await import("@/...") holen (statische Importe liefen schon vor dem ersten Befehl, ein einmal geladenes Modul bleibt).
//
// Rendern: rendereMitTexten(<Komponente />, { wrapper }) bzw. rendereHookMitTexten(() => useHook(), { wrapper }); textFehler nennt
// fehlende Schlüssel. Ereignisse: fireEvent.click/keyDown/pointerDown ... (läuft in act). Alles andere, was React aufweckt, in
// await ausloesen(() => ...). Nach einem Klick, der fetch oder Promises startet: await abwarten(). Zwischen Fällen
// setzeUmgebungZurueck(), am Ende beendeUmgebung() und dann ende() aus pruefer(). beobachteKonsole() um die Fälle legen und am Ende
// prüfen, dass React nichts gemeldet hat (ein Update außerhalb von act ist dort sichtbar).
//
// Uhr: const uhr = installiereUhr({ datum? }); await uhr.vor(ms) | uhr.bild() | uhr.laufeAlle(); uhr.offen(), uhr.zeitgeber();
// uhr.deinstalliere(). Unter der Uhr hängen waitFor/findBy*: statt dessen vor() oder warteBis().
//
// Attrappen und Steuerung: siehe Kopf von dom-attrappen.ts. protokoll.von("audio") usw. liefert die Aufruffolgen.
//
// Grenzen: kein Layout (Rechtecke nur über setzeRechteck, CSS wirkt nicht), kein Ton und keine Bilder, keine echte Navigation (Link
// und Router nur über erzeugeNavigation), Server-Komponenten und Server Actions laufen nicht (ersetzen). Der Browser meldet
// ResizeObserver einmal nach observe, die Attrappe nur auf melde(). AbortSignal.timeout und Zeitgeber, die eine Bibliothek beim Laden
// gemerkt hat (React selbst), folgen der Uhr nicht.
