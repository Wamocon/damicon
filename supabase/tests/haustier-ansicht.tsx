import {
  ausloesen,
  beendeUmgebung,
  beobachteKonsole,
  erzeugeNavigation,
  ersetzeModule,
  fenster,
  fireEvent,
  installiereUhr,
  protokoll,
  pruefer,
  render,
  rendereMitTexten,
  setzeFenster,
  setzeRechteck,
  setzeSichtbarkeit,
  setzeUmgebungZurueck,
  umgebungsFehler,
  type Uhr,
} from "./hilfen/dom-umgebung";
import { readFileSync, writeFileSync } from "node:fs";
import { createElement, useSyncExternalStore, type ComponentType } from "react";
import type { HaustierHuelleProps, WegTexte } from "@/components/haustier/haustier-huelle";
import type { AgentPhase, HaustierZustand, Inventar, Stimmung } from "@/lib/haustier";

// Charakterisierung von Himbi im Dashboard vor dem Zerlegen (WMC-Cleanup Phase 3, Paket "Haustier Himbi", seit 14.10.2026), ohne
// Browser und ohne Netz, in der DOM-Umgebung (hilfen/dom-umgebung.tsx) mit steuerbarer Uhr:
//   * HaustierHuelle (components/haustier/haustier-huelle.tsx): gespeicherte und gesperrte Position, Klemmen an den Rand, Seite und
//     Höhe der Blase, Panel auf und zu, Ziehen mit Neigung und Speichern, Doppelklick, Klick und Tasten, Wegschicken durch Halten und
//     mit Entf, Erleichterung, Schlaf nach Leerlauf und Wecken, Augen (Zustand, Zeiger, Blickziel, Eingabefeld im Chat), die Figur
//     folgt dem Blickziel, Hüpfer, Konfetti, Abzeichen, Bühne, Ausblenden und Abbau.
//   * HaustierDashboard (components/haustier/haustier-dashboard.tsx): wann Himbi gar nicht, versteckt oder ganz zu sehen ist,
//     Zurückholen mit Willkommen, Meldungen des Agenten samt ungelesener Antwort, Befinden, Tagesgruß, Anstupser, Modultipp,
//     Live-Lauf-Hinweis, Compliance-Tour, Klick auf Himbi, Abzeichen und Logo, Bühne und Sprachmodus, Hintergrund-Tab, Wegschicken.
// Ersetzt sind nur die Nachbarn: KI-Pane-, Haustier-, Persona-, Tour- und CEO-Kontext, die Handy-Abfrage, die Navigation, die Figur
// (himbi.tsx), die Wellen der Bühne, das Logo und next/image. lib/haustier.ts, lib/himbi-tagesbeginn.ts, lib/modules.ts und
// lib/rbac.ts laufen echt.
// Nach jedem Schritt wird festgehalten: die neuen Zeilen des Protokolls (Aufrufe an die Aktionen der Kontexte, Zeigerfang,
// scrollIntoView, Hörer an window und document samt Optionen), das ganze HTML des Dokuments (wenn es sich geändert hat), localStorage
// und sessionStorage (wenn sie sich geändert haben) und die offenen Zeitgeber und Bilder der Uhr. Die Folge je Fall wird mit der
// Folge des Codes vor dem Zerlegen verglichen (fixtures/haustier-ansicht-golden.json, Stand 1fb29cf1); ein Unterschied meldet die
// erste abweichende Zeile. Dazu prüfen ausgeschriebene Regeln die wichtigsten Stellen. Die Vergleichswerte neu schreiben nur mit
// einem Code, dessen Verhalten gewollt ist:
//   npx --yes tsx supabase/tests/haustier-ansicht.tsx --golden-schreiben
// Nicht nachstellbar ohne Browser: Layout und CSS (Rechtecke werden gesetzt, Animationen laufen nicht), der erste Render vor dem
// Mount-Effekt (in act läuft der Effekt sofort), der Server-Schnappschuss von useSyncExternalStore, echte Zeigergesten.
// Aufruf: npm run test:haustier-ansicht

const { pruefe, ende } = pruefer();
const json = (wert: unknown) => JSON.stringify(wert);
const GOLDEN = "supabase/tests/fixtures/haustier-ansicht-golden.json";
const schreiben = process.argv.includes("--golden-schreiben");
const golden = schreiben ? {} : (JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, string[]>);
const neu: Record<string, string[]> = {};
const notiere = (quelle: string, text: string) => protokoll.notiere(quelle, text);

// ---- Hörer an window und document ---------------------------------------------------------------------------------------------
// Jedes addEventListener und removeEventListener landet mit Typ und Optionen im Protokoll. selectionchange setzt React einmal je
// Dokument, es gehört nicht zu Himbi.
function beobachteHoerer(ziel: EventTarget, name: string): void {
  const hinzu = ziel.addEventListener.bind(ziel);
  const entferne = ziel.removeEventListener.bind(ziel);
  const zeile = (typ: string, optionen: unknown) => `${name} ${typ}${optionen === undefined ? "" : ` ${json(optionen)}`}`;
  Object.defineProperty(ziel, "addEventListener", {
    configurable: true,
    writable: true,
    value: (typ: string, hoerer: EventListenerOrEventListenerObject | null, optionen?: boolean | AddEventListenerOptions) => {
      if (typ !== "selectionchange") notiere("hoerer", `+ ${zeile(typ, optionen)}`);
      hinzu(typ, hoerer, optionen);
    },
  });
  Object.defineProperty(ziel, "removeEventListener", {
    configurable: true,
    writable: true,
    value: (typ: string, hoerer: EventListenerOrEventListenerObject | null, optionen?: boolean | EventListenerOptions) => {
      if (typ !== "selectionchange") notiere("hoerer", `- ${zeile(typ, optionen)}`);
      entferne(typ, hoerer, optionen);
    },
  });
}
beobachteHoerer(window, "fenster");
beobachteHoerer(document, "dokument");

// ---- Lage der Nachbarn und Ersatzmodule -----------------------------------------------------------------------------------------
interface TourLage {
  aktiv: boolean;
  frageBereit: boolean;
  tourZustand: HaustierZustand;
  tourBlase: string | null;
  frageBlase: string | null;
  tourZiel: Element | null;
  huepf: number;
}
interface Lage {
  verfuegbar: boolean;
  offen: boolean;
  darstellung: "seite" | "buehne";
  sprachmodus: boolean;
  nutzerId: string | null;
  phase: AgentPhase;
  text: string;
  an: boolean;
  weg: boolean;
  stimmung: Stimmung;
  inventar: Inventar;
  tagesbeginnAn: boolean;
  role: string;
  name: string | null;
  tour: TourLage;
  ceo: { phase: string } | null;
  handy: boolean;
}
const TOUR_AUS: TourLage = { aktiv: false, frageBereit: false, tourZustand: "ruhe", tourBlase: null, frageBlase: null, tourZiel: null, huepf: 0 };
const LAGE: Lage = {
  verfuegbar: true,
  offen: false,
  darstellung: "seite",
  sprachmodus: false,
  nutzerId: "nutzer-1",
  phase: "ruhe",
  text: "",
  an: true,
  weg: false,
  stimmung: "neutral",
  inventar: { tracht: 1, brille: true },
  tagesbeginnAn: false,
  role: "admin",
  name: "Anna Beispiel",
  tour: TOUR_AUS,
  ceo: null,
  handy: false,
};
let lage: Lage = { ...LAGE };
const lageHoerer = new Set<() => void>();
const abonniereLage = (h: () => void) => {
  lageHoerer.add(h);
  return () => void lageHoerer.delete(h);
};
const useLage = () => useSyncExternalStore(abonniereLage, () => lage, () => lage);
/** Ändert die Lage der Nachbarn, die Hooks rendern neu. Aus dem Test in ausloesen() rufen (lageNeu). */
function setze(teil: Partial<Lage>): void {
  lage = { ...lage, ...teil };
  lageHoerer.forEach((h) => h());
}
const lageNeu = (teil: Partial<Lage>) => ausloesen(() => setze(teil));

const aktionen = {
  setOffen: (offen: boolean) => {
    notiere("pane", `setOffen(${offen})`);
    setze({ offen });
  },
  umschalten: () => {
    notiere("pane", "umschalten");
    setze({ offen: !lage.offen });
  },
  // Wie der echte HaustierProvider: die Frage geht an den Chat, und das Panel geht auf.
  stelleFrage: (text: string) => {
    notiere("haustier", `stelleFrage ${text}`);
    setze({ offen: true });
  },
  schickeWeg: () => {
    notiere("haustier", "schickeWeg");
    setze({ an: false, weg: true });
  },
  holeZurueck: () => {
    notiere("haustier", "holeZurueck");
    setze({ an: true, weg: false });
  },
};

/** Die Figur (himbi.tsx): ihre Eigenschaften stehen in data-props, Sterne und Nadel sind Knöpfe, wenn sie klickbar sind. */
function HimbiAttrappe(props: { aufAbzeichen?: () => void; aufLogo?: () => void } & Record<string, unknown>) {
  const werte = Object.fromEntries(
    Object.entries(props)
      .filter(([, wert]) => typeof wert !== "function")
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return (
    <span className="himbi-attrappe" data-props={json(werte)}>
      {props.aufAbzeichen ? (
        <button type="button" className="himbi-attrappe__sterne" onClick={props.aufAbzeichen}>
          Sterne
        </button>
      ) : null}
      {props.aufLogo ? (
        <button type="button" className="himbi-attrappe__nadel" onClick={props.aufLogo}>
          Nadel
        </button>
      ) : null}
    </span>
  );
}

const navigation = erzeugeNavigation("/dashboard");
ersetzeModule({
  ...navigation.module,
  // next/image als schlichtes <img>; die übrigen Eigenschaften (fill, sizes, priority) stehen in data-props.
  "next/image": {
    default: ({ src, alt, className, ...rest }: { src: string; alt: string; className?: string } & Record<string, unknown>) =>
      createElement("img", { src, alt, className, "data-props": json(rest) }),
  },
  "@/components/ki/ki-pane-kontext": {
    useKiPane: () => {
      const l = useLage();
      return { verfuegbar: l.verfuegbar, offen: l.offen, umschalten: aktionen.umschalten, setOffen: aktionen.setOffen, darstellung: l.darstellung, sprachmodus: l.sprachmodus, nutzerId: l.nutzerId };
    },
  },
  "@/components/haustier/haustier-kontext": {
    useHaustierStatus: () => {
      const l = useLage();
      return { phase: l.phase, text: l.text, an: l.an, weg: l.weg, stimmung: l.stimmung, inventar: l.inventar, tagesbeginnAn: l.tagesbeginnAn, tourAn: true, autoStart: false };
    },
    useHaustierAktionen: () => aktionen,
  },
  "@/components/dashboard/persona": {
    usePersona: () => {
      const l = useLage();
      return { role: l.role, name: l.name };
    },
  },
  "@/components/dashboard/compliance-tour-kontext": {
    useComplianceTourAnzeige: () => {
      const { tour } = useLage();
      return {
        ...tour,
        tourBlase: tour.tourBlase ? <p className="tour-attrappe">{tour.tourBlase}</p> : null,
        frageBlase: tour.frageBlase ? <p className="tour-frage-attrappe">{tour.frageBlase}</p> : null,
        verfuegbar: true,
        tourVerfuegbar: true,
        starten: () => notiere("tour", "starten"),
        zusammenfassen: () => notiere("tour", "zusammenfassen"),
      };
    },
  },
  "@/components/dashboard/ceo-pruefung-kontext": { useCeoPruefung: () => useLage().ceo },
  "@/components/ui/handy": { useIstHandy: () => useLage().handy },
  "@/components/haustier/himbi": { Himbi: HimbiAttrappe },
  "@/components/haustier/wellen": { Wellen: ({ zustand }: { zustand: string }) => <span className="wellen-attrappe" data-zustand={zustand} /> },
  "@/components/brand/damicon-logo": {
    DamiconLogo: ({ title, className }: { title?: string; className?: string }) => <svg className={className} data-attrappe="logo" aria-label={title} />,
  },
});

let HaustierHuelle: ComponentType<HaustierHuelleProps>;
let HaustierDashboard: ComponentType;

// ---- Aufzeichnung je Fall -------------------------------------------------------------------------------------------------------
interface Lauf {
  name: string;
  uhr: Uhr;
  folge: string[];
  gelesen: number;
  html: string;
  speicher: string;
}
let lauf: Lauf;
const DATUM = "2026-10-14T06:30:00Z";
const echtLesen = fenster.Storage.prototype.getItem;

function speicherInhalt(): string {
  const lies = (ablage: Storage) => {
    const schluessel = Array.from({ length: ablage.length }, (_, i) => ablage.key(i) ?? "").sort();
    return Object.fromEntries(schluessel.map((k) => [k, echtLesen.call(ablage, k)]));
  };
  return json({ local: lies(localStorage), session: lies(sessionStorage) });
}

function neuerFall(name: string): Uhr {
  setzeUmgebungZurueck();
  lage = { ...LAGE };
  navigation.setzePfad("/dashboard");
  const uhr = installiereUhr({ datum: DATUM });
  lauf = { name, uhr, folge: [], gelesen: 0, html: "", speicher: speicherInhalt() };
  return uhr;
}

/** Hält den Stand nach einem Schritt fest: neue Zeilen des Protokolls, HTML, Speicher, offene Zeitgeber und Bilder. */
function halte(schritt: string): void {
  const l = lauf;
  l.folge.push(`schritt ${schritt} @${l.uhr.jetzt()}`);
  l.folge.push(...protokoll.eintraege.slice(l.gelesen));
  l.gelesen = protokoll.eintraege.length;
  const html = document.documentElement.outerHTML;
  l.folge.push(html === l.html ? "html gleich" : `html ${html}`);
  l.html = html;
  const speicher = speicherInhalt();
  if (speicher !== l.speicher) l.folge.push(`speicher ${speicher}`);
  l.speicher = speicher;
  l.folge.push(`zeitgeber ${json(l.uhr.zeitgeber())} bilder ${l.uhr.offen().bilder}`);
}

function unterschied(ist: string | undefined, soll: string | undefined): string {
  if (ist === undefined || soll === undefined) return `ist ${ist?.slice(0, 200) ?? "(Ende)"} | soll ${soll?.slice(0, 200) ?? "(Ende)"}`;
  let i = 0;
  while (i < ist.length && ist[i] === soll[i]) i++;
  const von = Math.max(0, i - 100);
  return `ab Zeichen ${i}: ist ...${ist.slice(von, i + 100)}... | soll ...${soll.slice(von, i + 100)}...`;
}

/** Vergleicht die Folge des Falls mit der des Codes vor dem Zerlegen. */
function schliesse(): void {
  const l = lauf;
  neu[l.name] = l.folge;
  pruefe(`${l.name}: keine Meldung aus jsdom`, umgebungsFehler.length === 0, json(umgebungsFehler));
  if (schreiben) return;
  const soll = golden[l.name] ?? [];
  const i = l.folge.findIndex((z, n) => z !== soll[n]);
  const stelle = i < 0 ? l.folge.length : i;
  const gleich = i < 0 && l.folge.length === soll.length;
  pruefe(
    `${l.name}: die ganze Folge (${l.folge.length} Zeilen) gleicht der des Codes vor dem Zerlegen`,
    gleich,
    gleich ? "" : `Zeile ${stelle} (${soll.slice(0, stelle + 1).filter((z) => z.startsWith("schritt ")).at(-1) ?? "-"}): ${unterschied(l.folge[stelle], soll[stelle])}`,
  );
}

const hat = (zeile: string) => protokoll.eintraege.includes(zeile);
/** Sperrt Methoden von localStorage und sessionStorage (privates Fenster, volle Ablage); die Rückgabe gibt sie wieder frei. */
function sperreSpeicher(methoden: ("getItem" | "setItem" | "removeItem")[]): () => void {
  const proto = fenster.Storage.prototype as unknown as Record<string, unknown>;
  const alt = methoden.map((m) => [m, proto[m]] as const);
  for (const m of methoden)
    proto[m] = () => {
      throw new Error(`${m} gesperrt`);
    };
  notiere("test", `speicher gesperrt ${methoden.join(",")}`);
  return () => {
    for (const [m, f] of alt) proto[m] = f;
    notiere("test", "speicher frei");
  };
}

// ---- Zugriff auf das DOM --------------------------------------------------------------------------------------------------------
const RECHTECK = { left: 900, top: 600, width: 100, height: 120 };
const griff = () => document.querySelector<HTMLElement>(".haustier__griff")!;
const wurzel = () => document.querySelector<HTMLElement>(".haustier");
const daten = (name: string) => wurzel()?.getAttribute(`data-${name}`) ?? null;
const blasenText = () => document.querySelector(".hb-blase")?.textContent ?? null;
const versatz = () => {
  const v = document.querySelector<HTMLElement>(".haustier__versatz");
  return `${v?.style.getPropertyValue("--hx")},${v?.style.getPropertyValue("--hy")}`;
};
const augen = () => [Number(griff().style.getPropertyValue("--bx")), Number(griff().style.getPropertyValue("--by"))];
const nahe = (ist: number[], soll: number[]) => ist.every((w, i) => Math.abs(w - soll[i]!) < 0.05);
const himbi = () => JSON.parse(document.querySelector(".himbi-attrappe")?.getAttribute("data-props") ?? "null") as Record<string, unknown> | null;
const knopf = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === text) ?? null;
function klicke(text: string): void {
  const k = knopf(text);
  if (!k) {
    pruefe(`${lauf.name}: Knopf "${text}" ist da`, false);
    return;
  }
  fireEvent.click(k);
}
/** Setzt das Rechteck des Griffs (jsdom hat kein Layout); vor dem ersten Bild nach dem Mount rufen. */
function platziere(rechteck = RECHTECK): void {
  const g = document.querySelector(".haustier__griff");
  if (g) setzeRechteck(g, rechteck);
}
const scrolle = () => ausloesen(() => window.dispatchEvent(new Event("scroll")));
const groesse = () => ausloesen(() => setzeFenster({}));

// ---- Hülle ------------------------------------------------------------------------------------------------------------------------
const WEG: WegTexte = { onWeg: () => notiere("huelle", "onWeg"), halten: "Soll ich gehen?", tschuess: "Tschüss!", hinweis: "Halte mich gedrückt." };
const BASIS: HaustierHuelleProps = { zustand: "ruhe", label: "Himbi", onKlick: () => notiere("huelle", "onKlick") };

function zeigeHuelle(props: Partial<HaustierHuelleProps> = {}) {
  const ansicht = render(<HaustierHuelle {...BASIS} {...props} />);
  platziere();
  return { ansicht, neu: (p: Partial<HaustierHuelleProps>) => ansicht.rerender(<HaustierHuelle {...BASIS} {...p} />) };
}

async function huellePlatz(): Promise<void> {
  const uhr = neuerFall("huelle-platz");
  localStorage.setItem("damicon-haustier-pos", json({ x: -40, y: -30 }));
  const { ansicht, neu: neuProps } = zeigeHuelle();
  halte("gerendert mit gespeicherter Position");
  pruefe("Hülle: die gespeicherte Position steht nach dem Mount am Element", versatz() === "-40,-30" && daten("bereit") === "true", versatz());
  await uhr.bild();
  halte("erstes Bild: klemmen, Seite und Höhe");
  pruefe("Hülle: im Bild bleibt die Position, Seite rechts, Blase oben", versatz() === "-40,-30" && daten("seite") === "rechts" && daten("hoehe") === "oben");
  platziere({ left: -20, top: 600, width: 100, height: 120 });
  await groesse();
  halte("Fenstergröße: links aus dem Bild");
  pruefe("Hülle: links hinaus wird zurückgeklemmt, die Seite wechselt nach links", versatz() === "-12,-30" && daten("seite") === "links", versatz());
  platziere({ left: 900, top: 100, width: 100, height: 120 });
  await groesse();
  halte("nah am oberen Rand");
  pruefe("Hülle: nah am oberen Rand steht die Blase darunter", daten("hoehe") === "unten");
  platziere({ left: 960, top: 700, width: 100, height: 120 });
  await groesse();
  halte("rechts unten hinaus");
  pruefe("Hülle: rechts und unten hinaus wird um den Überstand plus Rand zurückgeklemmt", versatz() === "-56,-90", versatz());
  platziere();
  neuProps({ paneOffen: true });
  halte("Panel auf");
  await uhr.vor(619);
  platziere({ left: 1000, top: 600, width: 100, height: 120 });
  halte("619 ms nach dem Panel");
  await uhr.vor(1);
  halte("620 ms: nach dem Panel neu geprüft");
  pruefe("Hülle: 620 ms nach Panel auf wird neu geklemmt", versatz() === "-140,-90" && daten("pane-offen") === "true", versatz());
  ansicht.unmount();
  halte("abgebaut");
  pruefe("Hülle: beim Abbau bleiben weder Zeitgeber noch Bilder", uhr.offen().zeitgeber === 0 && uhr.offen().intervalle === 0 && uhr.offen().bilder === 0, json(uhr.offen()));
  schliesse();
}

async function huelleSpeicher(): Promise<void> {
  const uhr = neuerFall("huelle-speicher");
  localStorage.setItem("damicon-haustier-pos", "kaputt{");
  let h = zeigeHuelle();
  await uhr.bild();
  halte("kaputter Eintrag: Standardposition");
  const kaputt = versatz();
  h.ansicht.unmount();
  localStorage.setItem("damicon-haustier-pos", json({ x: "1", y: 2 }));
  h = zeigeHuelle();
  await uhr.bild();
  halte("Eintrag ohne Zahlen: Standardposition");
  const ohneZahlen = versatz();
  h.ansicht.unmount();
  localStorage.setItem("damicon-haustier-pos", json({ x: 12, y: 34 }));
  const frei = sperreSpeicher(["getItem"]);
  h = zeigeHuelle();
  frei();
  await uhr.bild();
  halte("gesperrter Speicher: Standardposition");
  pruefe("Hülle: kaputter, unvollständiger oder gesperrter Speicher gibt die Standardposition", kaputt === "0,0" && ohneZahlen === "0,0" && versatz() === "0,0", `${kaputt} ${ohneZahlen} ${versatz()}`);
  h.ansicht.unmount();
  halte("abgebaut");
  schliesse();
}

async function huelleZiehen(): Promise<void> {
  const uhr = neuerFall("huelle-ziehen");
  const { ansicht } = zeigeHuelle({ blase: <p className="probe-blase">Hallo</p>, weg: WEG });
  await uhr.bild();
  halte("bereit mit Blase");
  fireEvent.pointerDown(griff(), { button: 2, pointerId: 1, clientX: 950, clientY: 660 });
  halte("rechte Taste: nichts");
  pruefe("Hülle: die rechte Taste fängt keinen Zeiger", !hat("dom setPointerCapture(1) div.haustier__griff"));
  fireEvent.pointerDown(griff(), { button: 0, pointerId: 1, clientX: 950, clientY: 660 });
  halte("gedrückt: Zeiger gefangen, Halten geplant");
  pruefe("Hülle: Drücken fängt den Zeiger und plant Halten (380 ms) und Abschied (1280 ms)", griff().hasPointerCapture(1) && [380, 1280].every((ms) => uhr.zeitgeber().some((z) => z.ms === ms && z.inMs === ms)));
  fireEvent.pointerMove(griff(), { pointerId: 1, clientX: 953, clientY: 662, movementX: 3 });
  halte("unter der Schwelle");
  fireEvent.pointerMove(griff(), { pointerId: 1, clientX: 990, clientY: 700, movementX: 5 });
  halte("zieht: Halten gestoppt, Blase weg, Neigung");
  pruefe(
    "Hülle: ab 5 px zieht sie, die Blase verschwindet, die Neigung folgt der Bewegung",
    daten("zieht") === "true" && blasenText() === null && versatz() === "40,40" && wurzel()!.style.getPropertyValue("--hb-neigung") === "8.0deg",
  );
  fireEvent.pointerMove(griff(), { pointerId: 1, clientX: 1000, clientY: 690, movementX: 20 });
  halte("Neigung begrenzt");
  pruefe("Hülle: die Neigung bleibt bei 14 Grad", wurzel()!.style.getPropertyValue("--hb-neigung") === "14.0deg");
  await uhr.vor(2000);
  halte("kein Halten während des Ziehens");
  pruefe("Hülle: beim Ziehen beginnt kein Halten", daten("halten") === "false");
  fireEvent.pointerUp(griff(), { pointerId: 1, clientX: 1000, clientY: 690 });
  halte("losgelassen: geklemmt und gespeichert");
  pruefe(
    "Hülle: Loslassen nach dem Ziehen speichert die Position und gibt den Zeiger frei, ohne zu klicken",
    localStorage.getItem("damicon-haustier-pos") === json({ x: 50, y: 30 }) && !griff().hasPointerCapture(1) && !hat("huelle onKlick") && blasenText() === "Hallo",
  );
  fireEvent.doubleClick(griff());
  halte("Doppelklick: zurück in die Ecke");
  pruefe("Hülle: Doppelklick setzt die Position zurück und löscht den Eintrag", versatz() === "0,0" && localStorage.getItem("damicon-haustier-pos") === null);
  fireEvent.pointerDown(griff(), { button: 0, pointerId: 2, clientX: 950, clientY: 660 });
  fireEvent.pointerMove(griff(), { pointerId: 2, clientX: 900, clientY: 640, movementX: -4 });
  fireEvent.pointerCancel(griff(), { pointerId: 2 });
  halte("abgebrochen wie losgelassen");
  const frei = sperreSpeicher(["setItem", "removeItem"]);
  fireEvent.pointerDown(griff(), { button: 0, pointerId: 3, clientX: 950, clientY: 660 });
  fireEvent.pointerMove(griff(), { pointerId: 3, clientX: 940, clientY: 600, movementX: -2 });
  fireEvent.pointerUp(griff(), { pointerId: 3 });
  halte("gesperrter Speicher beim Loslassen");
  fireEvent.doubleClick(griff());
  halte("gesperrter Speicher beim Doppelklick");
  frei();
  fireEvent.pointerMove(griff(), { pointerId: 4, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(griff(), { pointerId: 4 });
  halte("Bewegen und Loslassen ohne Drücken");
  pruefe("Hülle: ohne Drücken bewegt und klickt nichts", !hat("huelle onKlick") && versatz() === "0,0");
  ansicht.unmount();
  halte("abgebaut");
  schliesse();
}

async function huelleKlick(): Promise<void> {
  const uhr = neuerFall("huelle-klick");
  const { ansicht, neu: neuProps } = zeigeHuelle();
  await uhr.bild();
  halte("bereit ohne Wegschicken");
  pruefe("Hülle: ohne weg kein Hinweis", !document.querySelector(".hb-hinweis"));
  fireEvent.pointerDown(griff(), { button: 0, pointerId: 1, clientX: 950, clientY: 660 });
  fireEvent.pointerUp(griff(), { pointerId: 1, clientX: 950, clientY: 660 });
  halte("Klick");
  const enter = fireEvent.keyDown(griff(), { key: "Enter" });
  halte("Enter");
  const leer = fireEvent.keyDown(griff(), { key: " " });
  halte("Leertaste");
  const andere = fireEvent.keyDown(griff(), { key: "a" });
  const entf = fireEvent.keyDown(griff(), { key: "Delete" });
  halte("andere Taste und Entf ohne Wegschicken");
  pruefe(
    "Hülle: Klick, Enter und Leertaste rufen onKlick (Tasten ohne Standardaktion), andere Tasten und Entf ohne weg nicht",
    protokoll.von("huelle onKlick").length === 3 && !enter && !leer && andere && entf,
  );
  neuProps({ weg: WEG });
  halte("mit Wegschicken: Hinweis");
  pruefe("Hülle: mit weg und ohne Blase steht der Hinweis", document.querySelector(".hb-hinweis")?.textContent === "Halte mich gedrückt.");
  fireEvent.pointerDown(griff(), { button: 0, pointerId: 2, clientX: 950, clientY: 660 });
  halte("gedrückt mit Wegschicken");
  fireEvent.pointerUp(griff(), { pointerId: 2, clientX: 950, clientY: 660 });
  halte("kurz losgelassen: Klick");
  pruefe("Hülle: kurzer Druck mit weg ist ein Klick, die Halte-Zeitgeber sind fort", protokoll.von("huelle onKlick").length === 4 && uhr.zeitgeber().every((z) => z.intervall || z.ms === 620));
  neuProps({ weg: WEG, blase: "Blase" });
  halte("mit Blase: kein Hinweis");
  ansicht.unmount();
  halte("abgebaut");
  schliesse();
}

async function huelleWegschicken(): Promise<void> {
  const uhr = neuerFall("huelle-wegschicken");
  const { ansicht } = zeigeHuelle({ weg: WEG });
  await uhr.bild();
  halte("bereit");
  fireEvent.pointerDown(griff(), { button: 0, pointerId: 1, clientX: 950, clientY: 660 });
  await uhr.vor(379);
  halte("379 ms gehalten");
  pruefe("Hülle: vor 380 ms noch kein Halten", daten("halten") === "false" && daten("zustand") === "ruhe");
  await uhr.vor(1);
  halte("380 ms: Halten");
  pruefe(
    "Hülle: nach 380 ms wird Himbi traurig, der Ring läuft, die Blase fragt, der Hinweis geht",
    daten("halten") === "true" && daten("zustand") === "traurig" && !!document.querySelector(".hb-ring") && blasenText() === "Soll ich gehen?" && !document.querySelector(".hb-hinweis"),
  );
  await uhr.vor(899);
  halte("1279 ms gehalten");
  await uhr.vor(1);
  halte("1280 ms: Abschied");
  pruefe("Hülle: nach 1280 ms Abschied, Tschüss-Blase, Ring weg", daten("abschied") === "true" && daten("halten") === "false" && blasenText() === "Tschüss!" && !document.querySelector(".hb-ring"));
  fireEvent.pointerUp(griff(), { pointerId: 1 });
  halte("losgelassen während des Abschieds");
  fireEvent.pointerDown(griff(), { button: 0, pointerId: 2, clientX: 950, clientY: 660 });
  fireEvent.pointerUp(griff(), { pointerId: 2 });
  halte("erneut gedrückt während des Abschieds");
  pruefe("Hülle: während des Abschieds ändert Loslassen nichts und es gibt keinen Klick", !hat("huelle onKlick") && daten("abschied") === "true");
  await uhr.vor(1249);
  halte("1249 ms Abschied");
  await uhr.vor(1);
  halte("1250 ms: onWeg");
  pruefe("Hülle: 1250 ms nach dem Abschied ruft sie onWeg genau einmal", protokoll.von("huelle onWeg").length === 1);
  ansicht.unmount();
  halte("abgebaut");
  schliesse();
}

async function huelleErleichtert(): Promise<void> {
  const uhr = neuerFall("huelle-erleichtert");
  const { ansicht } = zeigeHuelle({ weg: WEG });
  await uhr.bild();
  fireEvent.pointerDown(griff(), { button: 0, pointerId: 1, clientX: 950, clientY: 660 });
  await uhr.vor(400);
  halte("hält");
  fireEvent.pointerUp(griff(), { pointerId: 1 });
  halte("vor dem Ende losgelassen: erleichtert");
  pruefe("Hülle: vor dem Ende losgelassen ist Himbi erleichtert (fertig), ohne Klick und ohne Konfetti", daten("zustand") === "fertig" && daten("halten") === "false" && !hat("huelle onKlick") && !document.querySelector(".hb-konfetti"));
  await uhr.vor(1099);
  halte("1099 ms erleichtert");
  await uhr.vor(1);
  halte("1100 ms: wieder Ruhe");
  pruefe("Hülle: nach 1100 ms wieder Ruhe, kein onWeg", daten("zustand") === "ruhe" && !hat("huelle onWeg"));
  fireEvent.pointerDown(griff(), { button: 0, pointerId: 2, clientX: 950, clientY: 660 });
  await uhr.vor(500);
  fireEvent.pointerMove(griff(), { pointerId: 2, clientX: 900, clientY: 600, movementX: -6 });
  halte("beim Halten gezogen: Halten vorbei");
  pruefe("Hülle: wer beim Halten zieht, schickt nicht weg", daten("halten") === "false" && daten("zieht") === "true");
  await uhr.vor(2000);
  fireEvent.pointerUp(griff(), { pointerId: 2 });
  halte("losgelassen nach dem Ziehen");
  pruefe("Hülle: kein Abschied nach Halten mit Ziehen", daten("abschied") === "false" && !hat("huelle onWeg"));
  ansicht.unmount();
  halte("abgebaut");
  schliesse();
}

async function huelleTasteWeg(): Promise<void> {
  const uhr = neuerFall("huelle-taste-weg");
  let h = zeigeHuelle({ weg: WEG });
  await uhr.bild();
  const entf = fireEvent.keyDown(griff(), { key: "Delete" });
  halte("Entf: Abschied sofort");
  const rueck = fireEvent.keyDown(griff(), { key: "Backspace" });
  halte("Rücktaste während des Abschieds");
  fireEvent.keyDown(griff(), { key: "Enter" });
  halte("Enter während des Abschieds");
  pruefe("Hülle: Entf schickt sofort weg, Rücktaste im Abschied wirkt nicht, Enter klickt weiter", !entf && rueck && daten("abschied") === "true" && protokoll.von("huelle onKlick").length === 1);
  await uhr.vor(1250);
  halte("1250 ms: onWeg");
  h.ansicht.unmount();
  h = zeigeHuelle({ weg: WEG });
  await uhr.bild();
  const zurueck = fireEvent.keyDown(griff(), { key: "Backspace" });
  halte("Rücktaste: Abschied");
  pruefe("Hülle: die Rücktaste schickt ebenso weg", !zurueck && daten("abschied") === "true");
  h.ansicht.unmount();
  halte("abgebaut vor dem Ende: kein onWeg mehr");
  await uhr.vor(2000);
  halte("2 s nach dem Abbau");
  pruefe("Hülle: nach dem Abbau kommt kein zweites onWeg", protokoll.von("huelle onWeg").length === 1);
  schliesse();
}

async function huelleSchlaf(): Promise<void> {
  const uhr = neuerFall("huelle-schlaf");
  const { ansicht, neu: neuProps } = zeigeHuelle();
  await uhr.bild();
  await ausloesen(() => fireEvent.pointerMove(window, { clientX: 100, clientY: 100 }));
  halte("Zeiger weit weg: die Augen folgen");
  await uhr.vor(500);
  halte("Augen angekommen");
  const zumZeiger = augen();
  pruefe("Hülle: in Ruhe folgen die Augen dem Zeiger", nahe(zumZeiger, [-2.82, -1.9]), json(zumZeiger));
  await uhr.vor(41999 - uhr.jetzt());
  halte("noch wach");
  pruefe("Hülle: vor 40 s Leerlauf schläft sie nicht", daten("zustand") === "ruhe");
  await uhr.vor(1);
  halte("eingeschlafen");
  await uhr.vor(500);
  halte("Augen im Schlaf");
  pruefe("Hülle: nach 40 s Leerlauf (Prüfung alle 2 s) schläft sie, zzz und Blick nach unten", daten("zustand") === "schlaeft" && !!document.querySelector(".hb-zzz") && nahe(augen(), [0, 1.5]), json(augen()));
  await ausloesen(() => fireEvent.pointerMove(window, { clientX: 100, clientY: 100 }));
  halte("Zeiger weit weg im Schlaf");
  pruefe("Hülle: ein ferner Zeiger weckt nicht", daten("zustand") === "schlaeft");
  await ausloesen(() => fireEvent.pointerMove(window, { clientX: 960, clientY: 650 }));
  await uhr.vor(500);
  halte("Zeiger nah: geweckt");
  pruefe("Hülle: ein naher Zeiger weckt", daten("zustand") === "ruhe" && nahe(augen(), [0, 0]), json(augen()));
  await ausloesen(() => fireEvent.keyDown(window, { key: "x" }));
  halte("Taste: Aktivität");
  await uhr.vor(44000);
  halte("wieder eingeschlafen");
  fireEvent.pointerDown(griff(), { button: 0, pointerId: 1, clientX: 950, clientY: 660 });
  halte("Drücken weckt");
  fireEvent.pointerUp(griff(), { pointerId: 1 });
  halte("und klickt");
  pruefe("Hülle: Drücken auf die schlafende Figur weckt sie, Loslassen klickt", daten("zustand") === "ruhe" && protokoll.von("huelle onKlick").length === 1);
  await uhr.vor(44000);
  neuProps({ zustand: "fehler" });
  halte("schläft, Zustand Fehler");
  neuProps({ zustand: "ruhe" });
  halte("zurück in Ruhe: schläft weiter");
  pruefe("Hülle: der Schlaf überdauert einen anderen Zustand", daten("zustand") === "schlaeft");
  await ausloesen(() => fireEvent.pointerMove(window, { clientX: 950, clientY: 660 }));
  neuProps({ zustand: "denkt" });
  await uhr.vor(60000);
  halte("denkt: kein Schlaf");
  pruefe("Hülle: außerhalb von Ruhe schläft sie nicht ein", daten("zustand") === "denkt");
  await ausloesen(() => fireEvent.pointerMove(window, { clientX: 100, clientY: 700 }));
  await uhr.vor(500);
  halte("denkt: die Augen bleiben oben links");
  neuProps({ zustand: "spricht" });
  await ausloesen(() => fireEvent.pointerMove(window, { clientX: 100, clientY: 700 }));
  await uhr.vor(500);
  halte("spricht: die Augen folgen dem Zeiger");
  ansicht.unmount();
  halte("abgebaut");
  schliesse();
}

async function huelleBlick(): Promise<void> {
  const uhr = neuerFall("huelle-blick");
  const pane = document.createElement("div");
  pane.className = "ki-pane";
  pane.innerHTML = `<textarea id="frage"></textarea><input id="ohne-typ"><input id="haken" type="checkbox">`;
  const draussen = document.createElement("textarea");
  draussen.id = "draussen";
  document.body.append(pane, draussen);
  const feld = pane.querySelector("textarea")!;
  setzeRechteck(feld, { left: 600, top: 300, width: 300, height: 100 });
  setzeRechteck(pane.querySelector("#ohne-typ")!, { left: 100, top: 700, width: 200, height: 30 });
  const ziel = document.createElement("section");
  ziel.id = "ziel";
  document.body.append(ziel);
  setzeRechteck(ziel, { left: 100, top: 100, width: 200, height: 600 });
  let props: Partial<HaustierHuelleProps> = { zustand: "denkt" };
  const { ansicht, neu: neuProps } = zeigeHuelle(props);
  await uhr.vor(500);
  halte("denkt: Blick oben links");
  pruefe("Hülle: denkt schaut nach oben links", nahe(augen(), [-2.6, -2.8]), json(augen()));
  props = { zustand: "fehler" };
  neuProps(props);
  await uhr.vor(500);
  halte("Fehler: Blick nach unten");
  pruefe("Hülle: Fehler schaut nach unten", nahe(augen(), [0, 2]), json(augen()));
  props = { zustand: "ruhe", blickZiel: ziel };
  neuProps(props);
  halte("Blickziel gesetzt");
  await uhr.vor(500);
  halte("schaut aufs Blickziel");
  const aufsZiel = augen();
  await ausloesen(() => fireEvent.pointerMove(window, { clientX: 1000, clientY: 0 }));
  await uhr.vor(500);
  halte("Zeiger bewegt: das Blickziel gewinnt");
  pruefe("Hülle: mit Blickziel folgen die Augen nicht dem Zeiger", nahe(augen(), aufsZiel), `${json(aufsZiel)} ${json(augen())}`);
  setzeRechteck(ziel, { left: 800, top: 0, width: 100, height: 100 });
  await scrolle();
  await uhr.vor(500);
  halte("gescrollt: neu geschaut");
  setzeRechteck(ziel, { left: 0, top: 700, width: 100, height: 60 });
  await groesse();
  await uhr.vor(500);
  halte("Fenstergröße: neu geschaut");
  await ausloesen(() => feld.focus());
  await uhr.vor(500);
  halte("Fokus im Chat-Feld, Blickziel gewinnt weiter");
  props = { zustand: "ruhe" };
  neuProps(props);
  await uhr.vor(500);
  halte("ohne Blickziel: schaut aufs Chat-Feld");
  pruefe("Hülle: ohne Blickziel schaut sie auf das Feld, in das man tippt", nahe(augen(), [-1.79, -2.89]), json(augen()));
  await ausloesen(() => feld.blur());
  await uhr.vor(500);
  halte("Fokus weg: zurück zur Ruhe");
  pruefe("Hülle: ohne Fokus im Feld wieder geradeaus", nahe(augen(), [0, 0]), json(augen()));
  await ausloesen(() => pane.querySelector<HTMLInputElement>("#haken")!.focus());
  await uhr.vor(500);
  halte("Fokus auf Kästchen: kein Tippziel");
  await ausloesen(() => pane.querySelector<HTMLInputElement>("#ohne-typ")!.focus());
  await uhr.vor(500);
  halte("Fokus auf Eingabe ohne Typ: Tippziel");
  await ausloesen(() => draussen.focus());
  await uhr.vor(500);
  halte("Fokus auf Feld außerhalb des Chats: kein Tippziel");
  pruefe("Hülle: ein Feld außerhalb des Chats zieht den Blick nicht", nahe(augen(), [0, 0]), json(augen()));
  ansicht.unmount();
  halte("abgebaut");
  await ausloesen(() => feld.focus());
  const zweite = zeigeHuelle();
  await uhr.vor(500);
  halte("neu gemountet mit Fokus im Feld");
  pruefe("Hülle: steht der Fokus beim Mount schon im Feld, schaut sie gleich dorthin", nahe(augen(), [-1.79, -2.89]), json(augen()));
  zweite.ansicht.unmount();
  halte("abgebaut");
  schliesse();
}

async function huelleFolgtBlick(): Promise<void> {
  const uhr = neuerFall("huelle-folgt-blick");
  const ziel = document.createElement("section");
  ziel.id = "ziel";
  document.body.append(ziel);
  setzeRechteck(ziel, { left: 100, top: 100, width: 300, height: 200 });
  const { ansicht, neu: neuProps } = zeigeHuelle({ blickZiel: ziel });
  await uhr.vor(100);
  halte("Blickziel ohne positionFolgtBlick: nur die Augen");
  pruefe("Hülle: ohne positionFolgtBlick bleibt die Figur in der Ecke", versatz() === "0,0");
  neuProps({ blickZiel: ziel, positionFolgtBlick: true });
  halte("positionFolgtBlick: geplant");
  await uhr.bild();
  halte("die Figur zieht zum Ziel");
  pruefe("Hülle: die Figur stellt sich knapp unten rechts ans Ziel", versatz() === "-590,-408", versatz());
  platziere({ left: 310, top: 192, width: 100, height: 120 });
  await scrolle();
  await uhr.bild();
  halte("gescrollt, schon am Ziel");
  pruefe("Hülle: steht sie schon am Ziel, bleibt der Versatz", versatz() === "-590,-408", versatz());
  setzeRechteck(ziel, { left: 500, top: 650, width: 600, height: 300 });
  await groesse();
  await uhr.bild();
  halte("Ziel unten rechts: im Bild gehalten");
  ziel.remove();
  await scrolle();
  await uhr.bild();
  halte("Ziel aus dem DOM: bewegt nichts");
  neuProps({ blickZiel: null, positionFolgtBlick: true });
  halte("Führung vorbei: zurück in die Ecke");
  pruefe("Hülle: endet die Führung, geht die Figur zurück in die Ecke", versatz() === "0,0", versatz());
  const lose = document.createElement("div");
  neuProps({ blickZiel: lose, positionFolgtBlick: true });
  await uhr.bild();
  halte("loses Element als Ziel: nichts");
  pruefe("Hülle: ein Ziel außerhalb des DOM zieht die Figur nicht", versatz() === "0,0");
  ansicht.unmount();
  halte("abgebaut");
  schliesse();
}

async function huelleHuepfKonfetti(): Promise<void> {
  const uhr = neuerFall("huelle-huepf-konfetti");
  const { ansicht, neu: neuProps } = zeigeHuelle({ huepf: 0 });
  await uhr.bild();
  halte("ohne Hüpfer");
  const ohne = document.querySelector(".hb")!.classList.contains("hb-huepf");
  neuProps({ huepf: 1 });
  halte("Hüpfer 1");
  neuProps({ huepf: 2 });
  halte("Hüpfer 2");
  pruefe("Hülle: jeder neue Zähler setzt hb-huepf", !ohne && document.querySelector(".hb")!.classList.contains("hb-huepf"));
  neuProps({ huepf: 2, zustand: "fertig" });
  halte("fertig: Konfetti und Haken");
  pruefe("Hülle: beim Eintritt in fertig Konfetti (12 Teile) und Haken", document.querySelectorAll(".hb-konfetti > span").length === 12 && document.querySelector(".hb-abzeichen--fertig")?.textContent === "✓");
  neuProps({ huepf: 2, zustand: "ruhe" });
  halte("Ruhe: kein Konfetti");
  neuProps({ huepf: 2, zustand: "fertig" });
  halte("wieder fertig: neues Konfetti");
  neuProps({ huepf: 2, zustand: "freigabe" });
  halte("Freigabe: Ausrufezeichen");
  pruefe("Hülle: Freigabe zeigt das Ausrufezeichen, ohne Konfetti", document.querySelector(".hb-abzeichen")?.textContent === "!" && !document.querySelector(".hb-konfetti"));
  neuProps({ huepf: 0, zustand: "freigabe" });
  halte("Hüpfer 0");
  ansicht.unmount();
  halte("abgebaut");
  schliesse();
}

async function huelleVarianten(): Promise<void> {
  const uhr = neuerFall("huelle-varianten");
  const props: Partial<HaustierHuelleProps> = {
    zustand: "denkt",
    stimmung: "warnung",
    inventar: { tracht: 2, brille: true },
    blase: "Blase",
    aufAbzeichen: () => notiere("huelle", "aufAbzeichen"),
    aufLogo: () => notiere("huelle", "aufLogo"),
  };
  const { ansicht, neu: neuProps } = zeigeHuelle(props);
  await uhr.bild();
  halte("mit Stimmung, Tracht und Knöpfen");
  pruefe("Hülle: Zustand, Stimmung, Tracht und Brille gehen an die Figur", json(himbi()) === json({ brille: true, stimmung: "warnung", tracht: 2, zustand: "denkt" }), json(himbi()));
  fireEvent.click(document.querySelector(".himbi-attrappe__sterne")!);
  fireEvent.click(document.querySelector(".himbi-attrappe__nadel")!);
  halte("Sterne und Nadel");
  pruefe("Hülle: Sterne und Nadel rufen aufAbzeichen und aufLogo", hat("huelle aufAbzeichen") && hat("huelle aufLogo"));
  neuProps({ ...props, buehne: true });
  halte("Bühne: Aura mit Wellen, keine Blase");
  pruefe("Hülle: auf der Bühne Aura und Wellen, keine Blase", !!document.querySelector(".hb-aura .wellen-attrappe") && blasenText() === null && daten("buehne") === "true");
  neuProps({ ...props, verborgen: true, hoch: true });
  halte("verborgen und hoch");
  pruefe("Hülle: verborgen setzt hidden, hoch setzt data-hoch", wurzel()!.hidden && daten("hoch") === "true");
  neuProps({ zustand: "ruhe" });
  halte("schlicht");
  ansicht.unmount();
  halte("abgebaut");
  schliesse();
}

// ---- Dashboard ----------------------------------------------------------------------------------------------------------------
const BEFINDEN = "damicon-haustier-befinden";
const ANSTUPSER = "damicon-haustier-anstupser";
/** Befinden und Anstupser gelten in dieser Sitzung als gefragt, damit ein Fall bei seinem Thema bleibt. */
function ohneFragen(): void {
  sessionStorage.setItem(BEFINDEN, "1");
  sessionStorage.setItem(ANSTUPSER, "neuHeute,kuehlzeit,fristen");
}

function zeigeDashboard() {
  const ansicht = rendereMitTexten(<HaustierDashboard />);
  platziere();
  return ansicht;
}

/** Am Ende eines Falls: erst die Aufgaben von jsdom mit 0 ms abarbeiten (Speicherereignis, Auswahl beim Fokus), dann abbauen. */
async function abbauen(ansicht: ReturnType<typeof zeigeDashboard>): Promise<void> {
  await lauf.uhr.vor(0);
  ansicht.unmount();
  halte("abgebaut");
  pruefe(`${lauf.name}: alle Texte gefunden`, ansicht.textFehler.length === 0, json(ansicht.textFehler));
  pruefe(`${lauf.name}: beim Abbau bleiben weder Zeitgeber noch Bilder`, lauf.uhr.offen().zeitgeber === 0 && lauf.uhr.offen().intervalle === 0 && lauf.uhr.offen().bilder === 0, json(lauf.uhr.offen()));
  schliesse();
}

async function dashboardSichtbarkeit(): Promise<void> {
  const uhr = neuerFall("dashboard-sichtbarkeit");
  ohneFragen();
  setze({ verfuegbar: false });
  const ansicht = zeigeDashboard();
  halte("nicht verfügbar");
  const leer = [ansicht.container.innerHTML === ""];
  await lageNeu({ verfuegbar: true, handy: true });
  halte("auf dem Handy");
  leer.push(ansicht.container.innerHTML === "");
  await lageNeu({ handy: false, an: false });
  halte("ausgeschaltet");
  leer.push(ansicht.container.innerHTML === "");
  pruefe("Dashboard: nicht verfügbar, auf dem Handy und ausgeschaltet zeichnet Himbi nichts", leer.every(Boolean), json(leer));
  await lageNeu({ weg: true });
  halte("weggeschickt: nur die Spitze");
  const versteck = () => document.querySelector<HTMLButtonElement>(".hb-versteck");
  pruefe("Dashboard: weggeschickt bleibt nur die Spitze mit Beschriftung", versteck()?.getAttribute("aria-label") === "Himbi zurückholen" && versteck()?.getAttribute("data-pane-offen") === "false" && !wurzel());
  await lageNeu({ offen: true });
  halte("Spitze bei offenem Panel");
  await lageNeu({ offen: false });
  fireEvent.click(versteck()!);
  platziere();
  halte("zurückgeholt: Willkommen");
  pruefe(
    "Dashboard: Zurückholen ruft holeZurueck, Himbi jubelt mit Willkommen und Konfetti",
    hat("haustier holeZurueck") && blasenText() === "Da bin ich wieder!" && daten("zustand") === "fertig" && !!document.querySelector(".hb-konfetti"),
  );
  await uhr.vor(3199);
  halte("3199 ms");
  await uhr.vor(1);
  halte("3200 ms: Willkommen vorbei");
  pruefe("Dashboard: nach 3200 ms ist das Willkommen vorbei", blasenText() === null && daten("zustand") === "ruhe");
  await lageNeu({ an: false, weg: true });
  fireEvent.click(versteck()!);
  platziere();
  await uhr.vor(2000);
  halte("2 s nach dem zweiten Zurückholen");
  await lageNeu({ an: false, weg: true });
  fireEvent.click(versteck()!);
  platziere();
  halte("drittes Zurückholen: der Zeitgeber beginnt neu");
  await uhr.vor(3199);
  halte("3199 ms nach dem dritten");
  pruefe("Dashboard: ein neues Zurückholen verlängert das Willkommen", blasenText() === "Da bin ich wieder!");
  await uhr.vor(1);
  halte("3200 ms nach dem dritten");
  await abbauen(ansicht);
}

async function dashboardPhasen(): Promise<void> {
  const uhr = neuerFall("dashboard-phasen");
  ohneFragen();
  const ansicht = zeigeDashboard();
  await uhr.bild();
  halte("Ruhe");
  pruefe("Dashboard: in Ruhe keine Blase, Beschriftung Ruhe, Inventar an der Figur", blasenText() === null && griff().getAttribute("aria-label") === "Himbi, dein Begleiter. Klicken öffnet den Chat." && himbi()?.tracht === 1);
  await lageNeu({ phase: "arbeitet", text: "Prüfe MwSt-Status …" });
  halte("arbeitet mit Text");
  pruefe("Dashboard: arbeitet zeigt den Text und den Hinweis auf den Hintergrund", blasenText() === "Prüfe MwSt-Status …Läuft im Hintergrund, du kannst weiterarbeiten." && daten("zustand") === "denkt");
  await lageNeu({ text: "" });
  halte("arbeitet ohne Text");
  await lageNeu({ phase: "freigabe" });
  halte("Freigabe");
  klicke("Ansehen");
  halte("Ansehen öffnet das Panel");
  pruefe("Dashboard: Ansehen öffnet das Panel, die Blase geht", hat("pane setOffen(true)") && blasenText() === null && daten("pane-offen") === "true");
  await uhr.vor(620);
  halte("Panel offen, Hülle neu geprüft");
  await lageNeu({ offen: false, phase: "fehler" });
  halte("Fehler");
  await lageNeu({ phase: "arbeitet" });
  await lageNeu({ phase: "ruhe" });
  halte("Antwort kam bei geschlossenem Panel");
  pruefe("Dashboard: eine Antwort bei geschlossenem Panel: fertig, Konfetti, Blase mit Ansehen", daten("zustand") === "fertig" && !!document.querySelector(".hb-konfetti") && blasenText() === "Fertig! Deine Antwort ist da.Ansehen");
  await uhr.vor(8999);
  halte("8999 ms");
  await uhr.vor(1);
  halte("9 s: Blase weg, Himbi bleibt fertig");
  pruefe("Dashboard: nach 9 s geht die Blase, die Antwort bleibt ungelesen", blasenText() === null && daten("zustand") === "fertig");
  await lageNeu({ offen: true });
  halte("Panel auf: gelesen");
  pruefe("Dashboard: Panel auf heißt gelesen", daten("zustand") === "ruhe");
  await lageNeu({ phase: "arbeitet" });
  await lageNeu({ phase: "ruhe" });
  halte("Antwort bei offenem Panel");
  await lageNeu({ offen: false });
  halte("Panel zu: nichts Ungelesenes");
  pruefe("Dashboard: eine Antwort bei offenem Panel jubelt nicht", daten("zustand") === "ruhe" && blasenText() === null);
  await lageNeu({ phase: "arbeitet" });
  await lageNeu({ phase: "ruhe" });
  klicke("Ansehen");
  halte("Ansehen in der Fertig-Blase");
  pruefe("Dashboard: Ansehen in der Fertig-Blase öffnet das Panel", protokoll.von("pane setOffen(true)").length === 2 && daten("zustand") === "ruhe");
  await abbauen(ansicht);
}

async function dashboardBefinden(): Promise<void> {
  const uhr = neuerFall("dashboard-befinden");
  sessionStorage.setItem(ANSTUPSER, "neuHeute,kuehlzeit,fristen");
  const ansicht = zeigeDashboard();
  await uhr.vor(24999);
  halte("noch keine Frage");
  await uhr.vor(1);
  halte("25 s: Wie läuft dein Tag?");
  pruefe("Dashboard: nach 25 s fragt Himbi nach dem Tag und merkt es für die Sitzung", blasenText() === "Wie läuft dein Tag bisher?Läuft gutGeht soViel zu tun" && sessionStorage.getItem(BEFINDEN) === "1");
  klicke("Läuft gut");
  halte("Antwort gut");
  pruefe("Dashboard: die Antwort gut färbt die Miene", blasenText() === "Schön. Dann packen wir was weg." && himbi()?.stimmung === "gut");
  await uhr.vor(8000);
  halte("8 s: Antwort weg");
  await uhr.vor(36999);
  halte("Miene noch aus der Antwort");
  pruefe("Dashboard: die Miene aus der Antwort hält 45 s", blasenText() === null && himbi()?.stimmung === "gut");
  await uhr.vor(1);
  halte("45 s: Miene wieder aus dem Chat");
  pruefe("Dashboard: danach gilt wieder die Stimmung aus dem Chat", himbi()?.stimmung === "neutral");
  await abbauen(ansicht);
}

async function dashboardBefindenViel(): Promise<void> {
  const uhr = neuerFall("dashboard-befinden-viel");
  sessionStorage.setItem(ANSTUPSER, "neuHeute,kuehlzeit,fristen");
  const ansicht = zeigeDashboard();
  await uhr.vor(20000);
  await ausloesen(() => setzeSichtbarkeit("hidden"));
  await uhr.vor(5000);
  halte("Frage im Hintergrund-Tab");
  pruefe("Dashboard: im Hintergrund-Tab steht die Frage bereit, gemerkt wird sie nicht", blasenText()?.startsWith("Wie läuft dein Tag") === true && sessionStorage.getItem(BEFINDEN) === null);
  await ausloesen(() => setzeSichtbarkeit("visible"));
  halte("Tab sichtbar: jetzt gemerkt");
  pruefe("Dashboard: erst sichtbar wird die Frage gemerkt", sessionStorage.getItem(BEFINDEN) === "1");
  await lageNeu({ offen: true });
  halte("Panel offen: keine Blase");
  await lageNeu({ offen: false });
  halte("Panel zu: die Frage ist wieder da");
  klicke("Viel zu tun");
  halte("Antwort viel");
  pruefe("Dashboard: viel zu tun bietet Hilfe an, Miene Warnung", blasenText() === "Dann nehme ich dir das Lästige ab. Frag mich einfach.Womit anfangen?" && himbi()?.stimmung === "warnung");
  klicke("Womit anfangen?");
  halte("Womit anfangen");
  pruefe(
    "Dashboard: Womit anfangen stellt die Hilfefrage",
    hat("haustier stelleFrage Was steht heute an? Nenn mir die drei dringendsten Dinge und frag mich, womit ich anfangen soll.") && blasenText() === null,
  );
  await lageNeu({ offen: false });
  halte("Panel zu: Antwort schon geschlossen");
  await uhr.vor(45000);
  halte("45 s: Miene zurück");
  await abbauen(ansicht);
}

async function dashboardBefindenGesperrt(): Promise<void> {
  const uhr = neuerFall("dashboard-befinden-gesperrt");
  const frei = sperreSpeicher(["getItem", "setItem"]);
  let ansicht = zeigeDashboard();
  await uhr.vor(25000);
  halte("gesperrter Speicher: die Frage kommt trotzdem");
  frei();
  pruefe("Dashboard: ohne Speicher kommt die Frage einmal je Seitenaufruf", blasenText()?.startsWith("Wie läuft dein Tag") === true);
  klicke("Geht so");
  halte("Antwort mittel");
  pruefe("Dashboard: geht so lässt die Miene neutral", blasenText() === "Alles klar. Sag Bescheid, wenn ich dir etwas abnehmen soll." && himbi()?.stimmung === "neutral");
  ansicht.unmount();
  halte("abgebaut");
  sessionStorage.setItem(BEFINDEN, "1");
  sessionStorage.setItem(ANSTUPSER, "neuHeute,kuehlzeit,fristen");
  ansicht = zeigeDashboard();
  await uhr.vor(30000);
  halte("schon gefragt: keine Frage");
  pruefe("Dashboard: wer in dieser Sitzung schon gefragt wurde, wird nicht noch einmal gefragt", blasenText() === null);
  await abbauen(ansicht);
}

async function dashboardTagesgruss(): Promise<void> {
  const uhr = neuerFall("dashboard-tagesgruss");
  ohneFragen();
  setze({ tagesbeginnAn: true });
  const ansicht = zeigeDashboard();
  await uhr.vor(2499);
  halte("noch kein Gruß");
  await uhr.vor(1);
  halte("2,5 s: Tagesgruß mit Vornamen");
  pruefe(
    "Dashboard: nach 2,5 s grüßt Himbi mit Vornamen und merkt den Tag",
    blasenText() === "Guten Tag, Anna! Soll ich dir sagen, was heute dringend ist?Ja, bitteHeute nicht" && (localStorage.getItem("damicon-himbi-tagesbeginn") ?? "").includes('"blase"'),
    blasenText() ?? "",
  );
  await uhr.vor(44999);
  halte("44999 ms Gruß");
  await uhr.vor(1);
  halte("45 s: Gruß weg");
  await uhr.vor(10000);
  halte("heute kein zweiter Gruß");
  pruefe("Dashboard: nach 45 s geht der Gruß, heute kommt kein zweiter", blasenText() === null);
  await abbauen(ansicht);
}

async function dashboardTagesgrussJa(): Promise<void> {
  const uhr = neuerFall("dashboard-tagesgruss-ja");
  ohneFragen();
  setze({ tagesbeginnAn: true, name: null });
  const ansicht = zeigeDashboard();
  await uhr.vor(2500);
  halte("Gruß ohne Namen");
  pruefe("Dashboard: ohne Namen grüßt Himbi ohne Anrede", blasenText()?.startsWith("Guten Tag! Soll ich") === true, blasenText() ?? "");
  klicke("Ja, bitte");
  halte("Ja: die Frage geht an den Chat");
  pruefe(
    "Dashboard: Ja stellt die Hilfefrage und schließt den Gruß",
    hat("haustier stelleFrage Was steht heute an? Nenn mir die drei dringendsten Dinge und frag mich, womit ich anfangen soll.") && blasenText() === null,
  );
  await lageNeu({ offen: false });
  await uhr.vor(5000);
  halte("Panel zu: kein neuer Gruß");
  await abbauen(ansicht);
}

async function dashboardTagesgrussWarten(): Promise<void> {
  const uhr = neuerFall("dashboard-tagesgruss-warten");
  ohneFragen();
  setze({ tagesbeginnAn: true });
  const ansicht = zeigeDashboard();
  await ausloesen(() => setzeSichtbarkeit("hidden"));
  await uhr.vor(2500);
  halte("Gruß im Hintergrund-Tab");
  pruefe("Dashboard: im Hintergrund-Tab liegt der Gruß bereit, gemerkt wird er nicht", blasenText()?.startsWith("Guten Tag, Anna!") === true && localStorage.getItem("damicon-himbi-tagesbeginn") === null);
  await lageNeu({ sprachmodus: true });
  halte("Sprachmodus: der wartende Gruß fällt weg, Himbi verborgen");
  pruefe("Dashboard: im Sprachmodus ist die Figur verborgen und der Gruß weg", wurzel()?.hidden === true && blasenText() === null);
  await lageNeu({ sprachmodus: false });
  halte("Sprachmodus aus: der Gruß ist noch fällig");
  await ausloesen(() => setzeSichtbarkeit("visible"));
  await uhr.vor(2500);
  halte("neuer Gruß, sichtbar: gemerkt");
  pruefe("Dashboard: nach dem Sprachmodus kommt der Gruß wieder und wird sichtbar gemerkt", blasenText()?.startsWith("Guten Tag, Anna!") === true && localStorage.getItem("damicon-himbi-tagesbeginn") !== null);
  klicke("Heute nicht");
  halte("Heute nicht");
  pruefe("Dashboard: Heute nicht schließt den Gruß ohne Frage", blasenText() === null && !protokoll.eintraege.some((z) => z.startsWith("haustier stelleFrage")));
  await uhr.vor(5000);
  halte("kein neuer Gruß");
  ansicht.unmount();
  halte("abgebaut");
  localStorage.clear();
  setze({ handy: true });
  let zweite = zeigeDashboard();
  await uhr.vor(5000);
  halte("auf dem Handy: kein Gruß");
  zweite.unmount();
  setze({ handy: false, nutzerId: null });
  zweite = zeigeDashboard();
  platziere();
  await uhr.vor(5000);
  halte("ohne Nutzer: kein Gruß");
  pruefe("Dashboard: ohne Nutzer und auf dem Handy kein Gruß", blasenText() === null && localStorage.getItem("damicon-himbi-tagesbeginn") === null);
  zweite.unmount();
  setze({ nutzerId: "nutzer-1", tagesbeginnAn: false });
  zweite = zeigeDashboard();
  await uhr.vor(5000);
  halte("Einstellung aus: kein Gruß");
  await abbauen(zweite);
}

async function dashboardAnstupser(): Promise<void> {
  const uhr = neuerFall("dashboard-anstupser");
  sessionStorage.setItem(BEFINDEN, "1");
  const ansicht = zeigeDashboard();
  await uhr.vor(89999);
  halte("noch kein Anstupser");
  await uhr.vor(1);
  halte("90 s: erster Anstupser");
  pruefe("Dashboard: nach 90 s Ruhe der erste Anstupser, gemerkt als gestellt", blasenText() === "Soll ich dir zeigen, was sich heute geändert hat?Zeig mir dasSpäter" && sessionStorage.getItem(ANSTUPSER) === "neuHeute");
  await uhr.vor(17999);
  halte("17999 ms");
  await uhr.vor(1);
  halte("18 s: als Absage gezählt");
  await lageNeu({ offen: true });
  await lageNeu({ offen: false });
  halte("Panel auf und zu: neue Wartezeit");
  await uhr.vor(90000);
  halte("zweiter Anstupser");
  pruefe("Dashboard: der nächste Anstupser ist der nächste ungefragte", blasenText()?.startsWith("Soll ich nachsehen, wie die Kühlzeiten") === true && sessionStorage.getItem(ANSTUPSER) === "neuHeute,kuehlzeit");
  klicke("Später");
  halte("Später: zweite Absage");
  await lageNeu({ offen: true });
  await lageNeu({ offen: false });
  halte("nach zwei Absagen keine Wartezeit mehr");
  await uhr.vor(100000);
  halte("kein dritter Anstupser");
  pruefe("Dashboard: nach zwei Absagen fragt Himbi nicht mehr", blasenText() === null && !uhr.zeitgeber().some((z) => z.ms === 90000));
  await abbauen(ansicht);
}

async function dashboardAnstupserJa(): Promise<void> {
  const uhr = neuerFall("dashboard-anstupser-ja");
  sessionStorage.setItem(BEFINDEN, "1");
  sessionStorage.setItem(ANSTUPSER, "neuHeute,kuehlzeit");
  let ansicht = zeigeDashboard();
  await uhr.vor(90000);
  halte("dritter Anstupser aus der Sitzung");
  klicke("Zeig mir das");
  halte("Ja: Frage an den Chat");
  pruefe("Dashboard: Ja zum Anstupser stellt seine Frage", hat("haustier stelleFrage Welche Fristen stehen demnächst an? Sortiere nach Dringlichkeit.") && blasenText() === null);
  await lageNeu({ offen: false });
  halte("alle gefragt: keine Wartezeit");
  ansicht.unmount();
  halte("abgebaut");
  const frei = sperreSpeicher(["getItem", "setItem"]);
  ansicht = zeigeDashboard();
  frei();
  await uhr.vor(25000);
  klicke("Läuft gut");
  await uhr.vor(8000);
  halte("Befinden beantwortet");
  const zweiteFrei = sperreSpeicher(["setItem"]);
  await uhr.vor(60000);
  halte("gesperrter Speicher: der erste Anstupser kommt wieder");
  zweiteFrei();
  pruefe("Dashboard: ohne lesbaren Speicher beginnen die Anstupser von vorn", blasenText()?.startsWith("Soll ich dir zeigen, was sich heute") === true);
  await abbauen(ansicht);
}

async function dashboardTipp(): Promise<void> {
  const uhr = neuerFall("dashboard-tipp");
  ohneFragen();
  navigation.setzePfad("/dashboard/feld/standort");
  const ansicht = zeigeDashboard();
  await uhr.vor(6999);
  halte("noch kein Tipp");
  await uhr.vor(1);
  halte("7 s: Tipp zum Modul");
  pruefe(
    "Dashboard: nach 7 s Ruhe der Tipp zum Modul, gemerkt für die Sitzung",
    blasenText() === "Du bist bei „Standort-Hierarchie“. Soll ich dir zeigen, was du hier tun kannst?Zeig mir dasSpäter" && sessionStorage.getItem("damicon-haustier-tipp:standort") === "1",
    blasenText() ?? "",
  );
  await uhr.vor(15000);
  halte("15 s: Tipp weg, kein zweiter");
  await uhr.vor(10000);
  halte("kein zweiter Tipp für dieses Modul");
  await ausloesen(() => navigation.setzePfad("/dashboard/feld/reihenbloecke"));
  await uhr.vor(7000);
  halte("anderes Modul: neuer Tipp");
  klicke("Zeig mir das");
  halte("Zeig mir das");
  pruefe("Dashboard: Ja zum Tipp fragt nach dem Bereich", protokoll.eintraege.some((z) => z.startsWith("haustier stelleFrage Erkläre mir den Bereich")) && blasenText() === null);
  await lageNeu({ offen: false });
  await ausloesen(() => navigation.setzePfad("/dashboard/feld/pflueckaufgaben"));
  await uhr.vor(3000);
  await ausloesen(() => navigation.setzePfad("/dashboard/feld/pflanzenschutz"));
  halte("Wechsel vor dem Tipp: Wartezeit beginnt neu");
  await uhr.vor(7000);
  halte("Tipp zum zweiten Modul");
  await ausloesen(() => navigation.setzePfad("/dashboard"));
  halte("Seite gewechselt: der Tipp gilt nicht mehr");
  pruefe("Dashboard: ein Tipp gilt nur auf seiner Seite", blasenText() === null);
  await ausloesen(() => navigation.setzePfad("/dashboard/feld/pflanzenschutz"));
  halte("zurück: der Tipp ist wieder da");
  klicke("Später");
  halte("Später");
  await ausloesen(() => navigation.setzePfad("/dashboard/hof/lieferschein-esf"));
  await uhr.vor(8000);
  halte("Modul in Entwicklung: kein Tipp");
  await lageNeu({ role: "picker" });
  await ausloesen(() => navigation.setzePfad("/dashboard/hof/kuehlkette"));
  await uhr.vor(8000);
  halte("Rolle ohne Recht: kein Tipp");
  pruefe("Dashboard: kein Tipp auf Platzhalterseiten und ohne Leserecht", blasenText() === null && sessionStorage.getItem("damicon-haustier-tipp:esf") === null && sessionStorage.getItem("damicon-haustier-tipp:kuehlkette") === null);
  await lageNeu({ role: "admin" });
  await ausloesen(() => setzeSichtbarkeit("hidden"));
  await uhr.vor(7000);
  halte("Tipp im Hintergrund-Tab: nicht gemerkt");
  pruefe("Dashboard: im Hintergrund-Tab wird der Tipp nicht gemerkt", sessionStorage.getItem("damicon-haustier-tipp:kuehlkette") === null);
  await ausloesen(() => setzeSichtbarkeit("visible"));
  halte("sichtbar: gemerkt");
  await abbauen(ansicht);
}

async function dashboardLiveHinweis(): Promise<void> {
  const uhr = neuerFall("dashboard-live-hinweis");
  ohneFragen();
  setze({ ceo: { phase: "laeuft" } });
  const ansicht = zeigeDashboard();
  await uhr.vor(0);
  halte("Prüfung läuft, Anker fehlt");
  const anker = document.createElement("div");
  anker.id = "compliance-live-lauf";
  document.body.append(anker);
  setzeRechteck(anker, { left: 100, top: 100, width: 300, height: 200 });
  await uhr.vor(100);
  halte("Anker da, ohne Seitenwechsel kein neuer Versuch");
  await ausloesen(() => navigation.setzePfad("/dashboard/uebersicht"));
  halte("Seitenwechsel: neuer Versuch geplant");
  await uhr.vor(0);
  halte("Live-Hinweis: Sprung zum Anker");
  pruefe(
    "Dashboard: der Live-Hinweis springt zum Anker, Himbi denkt, hüpft und erklärt",
    hat("dom scrollIntoView div#compliance-live-lauf") && daten("zustand") === "denkt" && blasenText()?.startsWith("Die Compliance-Prüfung läuft gerade live") === true && document.querySelector(".hb")!.classList.contains("hb-huepf"),
  );
  await uhr.bild();
  halte("die Figur zieht zum Anker");
  await uhr.vor(500);
  halte("500 ms: Anker hervorgehoben");
  pruefe("Dashboard: nach 500 ms ist der Anker hervorgehoben", anker.classList.contains("haustier-fokus"));
  await lageNeu({ phase: "fehler" });
  await uhr.bild();
  halte("Fehler verdrängt den Hinweis, die Figur geht zurück");
  pruefe("Dashboard: eine Fehlermeldung geht vor dem Live-Hinweis", blasenText()?.startsWith("Da ist etwas schiefgelaufen") === true && versatz() === "0,0");
  await lageNeu({ phase: "ruhe" });
  await uhr.bild();
  halte("Fehler vorbei: der Hinweis ist wieder da");
  await uhr.vor(2800);
  halte("3300 ms: Hervorhebung vorbei");
  klicke("Alles klar");
  halte("Alles klar");
  pruefe("Dashboard: Alles klar beendet den Hinweis", blasenText() === null && daten("zustand") === "ruhe");
  await ausloesen(() => navigation.setzePfad("/dashboard"));
  await uhr.vor(100);
  halte("einmal je Sitzung: kein zweiter Sprung");
  pruefe("Dashboard: der Hinweis kommt nur einmal", protokoll.von("dom scrollIntoView").length === 1);
  await abbauen(ansicht);
}

async function dashboardLiveHinweisWeg(): Promise<void> {
  const uhr = neuerFall("dashboard-live-hinweis-weg");
  ohneFragen();
  const anker = document.createElement("div");
  anker.id = "compliance-live-lauf";
  document.body.append(anker);
  setzeRechteck(anker, { left: 100, top: 100, width: 300, height: 200 });
  setze({ ceo: { phase: "laeuft" }, an: false, weg: true });
  const ansicht = zeigeDashboard();
  await uhr.vor(100);
  halte("weggeschickt: kein Sprung");
  pruefe("Dashboard: ist Himbi weg, springt die Seite nicht", protokoll.von("dom scrollIntoView").length === 0);
  await lageNeu({ weg: false });
  await uhr.vor(100);
  halte("ausgeschaltet: kein Sprung");
  await lageNeu({ an: true });
  platziere();
  halte("an: neuer Versuch geplant");
  await uhr.vor(0);
  halte("an: Sprung");
  await uhr.vor(14000);
  halte("14 s: Hinweis vorbei");
  pruefe("Dashboard: nach 14 s endet der Live-Hinweis von selbst", blasenText() === null && protokoll.von("dom scrollIntoView").length === 1);
  await lageNeu({ ceo: { phase: "fertig" } });
  halte("Prüfung fertig");
  await abbauen(ansicht);
}

async function dashboardTour(): Promise<void> {
  const uhr = neuerFall("dashboard-tour");
  ohneFragen();
  const station = document.createElement("section");
  station.id = "station";
  document.body.append(station);
  setzeRechteck(station, { left: 200, top: 300, width: 400, height: 200 });
  setze({ tagesbeginnAn: true, tour: { ...TOUR_AUS, frageBereit: true, frageBlase: "Tour starten?" } });
  const ansicht = zeigeDashboard();
  await uhr.vor(2500);
  halte("Tour-Frage vor dem Tagesgruß");
  pruefe("Dashboard: die Tour-Frage geht vor dem Tagesgruß, der Gruß wird nicht gemerkt", blasenText() === "Tour starten?" && localStorage.getItem("damicon-himbi-tagesbeginn") === null);
  await lageNeu({ tour: { ...TOUR_AUS, aktiv: true, tourBlase: "Station 1", tourZustand: "spricht", tourZiel: station, huepf: 1 } });
  halte("Tour läuft");
  await uhr.bild();
  halte("die Figur zieht zur Station");
  pruefe(
    "Dashboard: die laufende Tour bestimmt Zustand, Blase, Blickziel und Hüpfer",
    daten("zustand") === "spricht" && blasenText() === "Station 1" && griff().getAttribute("aria-label") === "Himbi spricht." && versatz() !== "0,0" && document.querySelector(".hb")!.classList.contains("hb-huepf"),
    versatz(),
  );
  await lageNeu({ phase: "freigabe" });
  await uhr.bild();
  halte("Freigabe geht vor der Tour");
  pruefe("Dashboard: eine Freigabe geht vor der Tour", daten("zustand") === "freigabe" && blasenText()?.startsWith("Ich brauche deine Freigabe.") === true);
  await lageNeu({ phase: "ruhe" });
  await lageNeu({ tour: { ...TOUR_AUS, aktiv: true, tourBlase: "Station 2", tourZustand: "spricht", tourZiel: station, huepf: 2 } });
  await uhr.bild();
  halte("nächste Station");
  await lageNeu({ tour: TOUR_AUS });
  await uhr.bild();
  halte("Tour vorbei: der Tagesgruß kommt dran");
  pruefe("Dashboard: nach der Tour kommt der Gruß und wird gemerkt", blasenText()?.startsWith("Guten Tag, Anna!") === true && localStorage.getItem("damicon-himbi-tagesbeginn") !== null);
  await abbauen(ansicht);
}

async function dashboardKlick(): Promise<void> {
  const uhr = neuerFall("dashboard-klick");
  sessionStorage.setItem(ANSTUPSER, "neuHeute,kuehlzeit,fristen");
  setze({ tagesbeginnAn: true });
  navigation.setzePfad("/dashboard/feld/standort");
  const ansicht = zeigeDashboard();
  await lageNeu({ phase: "arbeitet" });
  await lageNeu({ phase: "ruhe" });
  halte("die Antwort ist da");
  const enter = fireEvent.keyDown(griff(), { key: "Enter" });
  halte("Enter auf Himbi: alles zu, Panel auf");
  pruefe("Dashboard: ein Klick auf Himbi räumt alle Blasen und öffnet das Panel", !enter && hat("pane setOffen(true)") && blasenText() === null && daten("zustand") === "ruhe");
  fireEvent.pointerDown(griff(), { button: 0, pointerId: 1, clientX: 950, clientY: 660 });
  fireEvent.pointerUp(griff(), { pointerId: 1, clientX: 950, clientY: 660 });
  halte("Klick bei offenem Panel: umschalten");
  pruefe("Dashboard: bei offenem Panel schaltet der Klick um", hat("pane umschalten") && daten("pane-offen") === "false");
  await uhr.vor(2500);
  halte("Gruß nach dem Schließen");
  await uhr.vor(4500);
  halte("Tipp liegt hinter dem Gruß");
  fireEvent.keyDown(griff(), { key: " " });
  halte("Leertaste: Panel auf, Gruß und Tipp zu");
  await lageNeu({ offen: false });
  await uhr.vor(30000);
  halte("Tipp und Befinden nach dem Klick");
  fireEvent.keyDown(griff(), { key: "Enter" });
  halte("Klick schließt alles");
  await abbauen(ansicht);
}

async function dashboardAbzeichen(): Promise<void> {
  const uhr = neuerFall("dashboard-abzeichen");
  ohneFragen();
  const ansicht = zeigeDashboard();
  await uhr.bild();
  fireEvent.click(document.querySelector(".himbi-attrappe__sterne")!);
  halte("Abzeichen offen");
  const fenster1 = document.querySelector('[role="dialog"]');
  pruefe(
    "Dashboard: die Sterne öffnen das Abzeichen mit Bild, die Seite ist gesperrt",
    fenster1?.getAttribute("aria-label") === "Auszeichnung" && !!fenster1.querySelector('img[src="/abzeichen/ki-innovator.png"]') && document.documentElement.style.overflow === "hidden",
  );
  await ausloesen(() => fireEvent.keyDown(window, { key: "Escape" }));
  halte("Escape schließt");
  fireEvent.click(document.querySelector(".himbi-attrappe__nadel")!);
  halte("Logo offen");
  fireEvent.click(document.querySelector(".hb-abzeichen-schliessen")!);
  halte("Knopf schließt");
  pruefe("Dashboard: Escape und der Knopf schließen, die Sperre geht", !document.querySelector('[role="dialog"]') && document.documentElement.style.overflow === "");
  fireEvent.click(document.querySelector(".himbi-attrappe__sterne")!);
  await lageNeu({ an: false, weg: true });
  halte("weggeschickt: das Abzeichen ist fort");
  fireEvent.click(document.querySelector(".hb-versteck")!);
  platziere();
  halte("zurückgeholt: das Abzeichen ist wieder offen");
  pruefe("Dashboard: das offene Abzeichen überdauert Wegschicken und Zurückholen", !!document.querySelector('[role="dialog"]'));
  fireEvent.mouseDown(document.querySelector(".hb-abzeichen-blende")!);
  halte("Klick daneben schließt");
  await abbauen(ansicht);
}

async function dashboardBuehne(): Promise<void> {
  const uhr = neuerFall("dashboard-buehne");
  ohneFragen();
  setze({ phase: "freigabe" });
  const ansicht = zeigeDashboard();
  await uhr.bild();
  await lageNeu({ darstellung: "buehne" });
  halte("Bühne gewählt, Panel zu");
  pruefe("Dashboard: bei geschlossenem Panel keine Bühne", daten("buehne") === "false" && blasenText() !== null);
  await lageNeu({ offen: true });
  halte("Panel auf der Bühne");
  pruefe("Dashboard: offen auf der Bühne fliegt Himbi in die Mitte, ohne Blase", daten("buehne") === "true" && !!document.querySelector(".wellen-attrappe") && blasenText() === null);
  await lageNeu({ darstellung: "seite" });
  halte("Panel am Rand");
  await lageNeu({ offen: false, sprachmodus: true });
  halte("Sprachmodus: verborgen");
  pruefe("Dashboard: im Sprachmodus ist die Figur verborgen, aber da", wurzel()?.hidden === true && daten("zustand") === "freigabe");
  await lageNeu({ sprachmodus: false });
  halte("Sprachmodus aus");
  await abbauen(ansicht);
}

async function dashboardWegschicken(): Promise<void> {
  const uhr = neuerFall("dashboard-wegschicken");
  ohneFragen();
  const ansicht = zeigeDashboard();
  await uhr.bild();
  halte("Hinweis zum Wegschicken");
  pruefe("Dashboard: der Hinweis zum Wegschicken steht an Himbi", document.querySelector(".hb-hinweis")?.textContent === "Halte mich gedrückt, um mich wegzuschicken.");
  fireEvent.pointerDown(griff(), { button: 0, pointerId: 1, clientX: 950, clientY: 660 });
  await uhr.vor(380);
  halte("gehalten: soll ich gehen?");
  await uhr.vor(900);
  halte("Abschied");
  await uhr.vor(1250);
  halte("weggeschickt");
  pruefe("Dashboard: Halten schickt Himbi weg, die Spitze bleibt", hat("haustier schickeWeg") && !!document.querySelector(".hb-versteck") && !wurzel());
  await abbauen(ansicht);
}

const FAELLE = [
  huellePlatz,
  huelleSpeicher,
  huelleZiehen,
  huelleKlick,
  huelleWegschicken,
  huelleErleichtert,
  huelleTasteWeg,
  huelleSchlaf,
  huelleBlick,
  huelleFolgtBlick,
  huelleHuepfKonfetti,
  huelleVarianten,
  dashboardSichtbarkeit,
  dashboardPhasen,
  dashboardBefinden,
  dashboardBefindenViel,
  dashboardBefindenGesperrt,
  dashboardTagesgruss,
  dashboardTagesgrussJa,
  dashboardTagesgrussWarten,
  dashboardAnstupser,
  dashboardAnstupserJa,
  dashboardTipp,
  dashboardLiveHinweis,
  dashboardLiveHinweisWeg,
  dashboardTour,
  dashboardKlick,
  dashboardAbzeichen,
  dashboardBuehne,
  dashboardWegschicken,
];

async function main(): Promise<void> {
  ({ HaustierHuelle } = await import("@/components/haustier/haustier-huelle"));
  ({ HaustierDashboard } = await import("@/components/haustier/haustier-dashboard"));
  const konsole = beobachteKonsole();
  for (const fall of FAELLE) await fall();
  konsole.stoppe();
  pruefe("Konsole: keine Fehler und Warnungen von React (etwa Updates außerhalb von act)", konsole.fehler.length === 0 && konsole.warnungen.length === 0, json([...konsole.fehler, ...konsole.warnungen]).slice(0, 600));
  if (schreiben) {
    writeFileSync(GOLDEN, `${JSON.stringify({ stand: "Code vor dem Zerlegen (1fb29cf1)", ...neu }, null, 1)}\n`);
    console.log(`Vergleichswerte geschrieben: ${GOLDEN}`);
  } else {
    const fehlend = Object.keys(golden).filter((k) => k !== "stand" && !(k in neu));
    pruefe("Vergleichswerte: jeder Fall der Datei ist gelaufen", fehlend.length === 0, fehlend.join(", "));
  }
  beendeUmgebung();
  ende();
}

main().catch((e) => {
  console.error("FAIL  Ausnahme", e);
  process.exit(1);
});
