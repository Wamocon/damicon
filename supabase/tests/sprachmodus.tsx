import {
  abwarten,
  ausloesen,
  beendeUmgebung,
  beobachteKonsole,
  ersetzeModule,
  fireEvent,
  installiereUhr,
  MediaRecorderAttrappe,
  medienAbfragen,
  mikrofon,
  netz,
  protokoll,
  pruefer,
  render,
  rendereMitTexten,
  screen,
  setzeRechteck,
  setzeUmgebungZurueck,
  umgebungsFehler,
  WebSocketAttrappe,
  type Uhr,
} from "./hilfen/dom-umgebung";
import React, { StrictMode, useSyncExternalStore, type DependencyList, type EffectCallback } from "react";
import { NextIntlClientProvider } from "next-intl";
import { texteVon } from "./hilfen/ansicht-probe";
import {
  abonniereSprachBus,
  leseSprachFrage,
  leseStopp,
  meldeChatStand,
  meldeFreigabeAnfrage,
  registriereEntsperren,
  registriereGerade,
  type ChatStand,
} from "@/components/ki/sprachmodus-bus";
import { setzeHervorhebung } from "@/components/ki/hervorhebung";
import type { SprechStand } from "@/components/ki/sprachausgabe-strom";

// Charakterisierung des Sprachmodus (components/ki/sprachmodus.tsx) vor dem Zerlegen, ohne Browser und ohne Netz (seit 14.10.2026).
// Gespielt werden die Abläufe als Folge von Ereignissen in der DOM-Umgebung (hilfen/dom-umgebung.tsx) mit steuerbarer Uhr:
//   1. Start bis zur offenen Live-Sitzung, Teiltranskript, Endpunkt, Antwort mit Sprachausgabe, Gnadenfrist, nächste Frage, Abbau.
//   2. Untertitel (Schalter, Speicher, gesperrter Speicher, Inhalt je Phase).
//   3. Bedienung: Tipp auf Himbi, Leertaste, Escape, Stummschalten und Fortsetzen.
//   4. Wortbefehle: Stopp endgültig und vorläufig (350 ms), Echo, eigene Wörter vor dem Befehl, Tschüss Himbi, Beenden, Nachsatz.
//   5. Dazwischenreden: Lautstärke-Wächter, Verdacht (Rückmeldung, Frist, Unterbrechen, Nachsatz, Verstummen, Karte, Tipp).
//   6. Freigabekarte: Ja, Nein, Füllaut, neue Frage, Stopp und Anrede beim Sprechen, ersetzte Karte, Beenden.
//   7. bis 9. Chat-Fehler und fehlende Einwilligung, Himbi beginnt den Tag, Fehler und Neuversuche (Mikrofon, Verbindung,
//      Schlüssel, lange stille Sitzung, Aufnahme, Stille).
//   10. und 11. Abbau mitten im Gespräch (Verdacht, Zeitgeber, vor dem Mikrofon) und StrictMode an der Wurzel.
//   12. bis 16. Platz von Himbi (Rahmen, Blick, Ausweichen auf dem Handy), Mitlesen, Sprechertrennung, Endpunkte beim Sprechen
//       und Ränder (Sprechpause, Wörter ohne Zeitangaben, Fehler und Text im selben Takt).
//   17. Reihenfolge der Effekte: wie SprachmodusInhalt sie beim ersten Rendern anmeldet und beim Einhängen ausführt.
// Festgehalten werden die Aufruffolgen (Mikrofon, Aufnahme, WebSocket, fetch, Bus zum Chat, Ausgabepegel, Mitlesen), sichtbare Texte,
// Klassen und Attribute sowie die offenen Zeitgeber. Ersetzt sind nur Nachbarn: KI-Pane- und Haustier-Kontext, Himbi (Figur),
// Markdown, Mitlesen (Seitensuche), lib/hoeren und lib/ausgabe-pegel. Live-Sitzung (diktat-live.ts), Bus und Domäne laufen echt.
// Nicht nachstellbar ohne Browser: ein Bild des Wächters zwischen dem Unterbrechen und dem Aufräumen seines Effekts (React räumt
// in der Umgebung sofort auf), Server-Schnappschüsse (useSyncExternalStore), Layout (offsetHeight wird gesetzt), echter Ton.
// Aufruf: npm run test:sprachmodus

const { pruefe, ende } = pruefer();
const json = (wert: unknown) => JSON.stringify(wert);
const gleich = (name: string, ist: unknown, soll: unknown) => pruefe(name, json(ist) === json(soll), json(ist) === json(soll) ? "" : `ist ${json(ist)}`);

// ---- Lage und Ersatzmodule ------------------------------------------------------------------------------------------------------
interface Lage {
  sprachmodus: boolean;
  nutzerId: string | null;
  tagesbeginnAn: boolean;
  lautstaerke: number;
  ausgabePegel: number;
  gerade: SprechStand | null;
  ueberschrift: HTMLElement | null;
}
const LAGE: Lage = { sprachmodus: true, nutzerId: "nutzer-1", tagesbeginnAn: false, lautstaerke: 0, ausgabePegel: 0, gerade: null, ueberschrift: null };
const lage: Lage = { ...LAGE };
const notiere = (quelle: string, text: string) => protokoll.notiere(quelle, text);

const paneHoerer = new Set<() => void>();
const abonnierePane = (h: () => void) => {
  paneHoerer.add(h);
  return () => void paneHoerer.delete(h);
};
const beendeSprachmodus = () => {
  notiere("pane", "beendeSprachmodus");
  lage.sprachmodus = false;
  paneHoerer.forEach((h) => h());
};
function useKiPaneAttrappe() {
  const sprachmodus = useSyncExternalStore(abonnierePane, () => lage.sprachmodus);
  return { sprachmodus, beendeSprachmodus, nutzerId: lage.nutzerId };
}

function HimbiAttrappe({ zustand, groesse, blickziel, links }: { zustand: string; groesse: string; blickziel: { x: number; y: number } | null; links?: boolean }) {
  return <span className="himbi-attrappe" data-zustand={zustand} data-groesse={groesse} data-links={String(links)} data-blick={blickziel ? `${blickziel.x},${blickziel.y}` : ""} />;
}

ersetzeModule({
  "@/components/ki/ki-pane-kontext": { useKiPane: useKiPaneAttrappe },
  "@/components/haustier/haustier-kontext": { useHaustierStatus: () => ({ tagesbeginnAn: lage.tagesbeginnAn }) },
  "@/components/ki/sprach-himbi": { SprachHimbi: HimbiAttrappe },
  "@/components/ki/ki-chat": { Markdown: ({ text }: { text: string }) => <div className="markdown-attrappe">{text}</div> },
  "@/components/ki/sprach-mitlesen": {
    loeseSprechZiel: (g: { el: HTMLElement | null }) => {
      notiere("mitlesen", `loese ${g.el?.id ?? "-"}`);
      return g.el;
    },
    ueberschriftImSatz: (satz: string) => {
      notiere("mitlesen", `ueberschrift ${satz}`);
      return lage.ueberschrift;
    },
    zeigeSprechStelle: (el: HTMLElement) => notiere("mitlesen", `zeige ${el.id}`),
  },
  "@/lib/hoeren": {
    starteHoeren: () => {
      notiere("hoeren", "starte");
      return () => undefined;
    },
    stoppeHoeren: () => notiere("hoeren", "stoppe"),
    leseLautstaerke: () => lage.lautstaerke,
    lesePegel: () => 0,
  },
  "@/lib/ausgabe-pegel": {
    daempfeAusgabe: (faktor: number) => notiere("ausgabe", `daempfe(${faktor})`),
    leseAusgabePegel: () => lage.ausgabePegel,
  },
});

// ---- Bus: was der Sprachmodus an den Chat gibt ---------------------------------------------------------------------------------------
let gesehen = { frage: 0, stopp: 0 };
abonniereSprachBus(() => {
  const frage = leseSprachFrage();
  if (frage && frage.nr !== gesehen.frage) {
    gesehen.frage = frage.nr;
    notiere("bus", `frage ${json({ text: frage.text, sprachen: frage.sprachen, ersetzt: frage.ersetztLetzte, unterbrochen: frage.unterbrochen })}`);
  }
  if (leseStopp() !== gesehen.stopp) {
    gesehen.stopp = leseStopp();
    notiere("bus", "stopp");
  }
});
registriereEntsperren(() => notiere("bus", "entsperre"));
registriereGerade(() => lage.gerade);

const STILL: ChatStand = { beschaeftigt: false, spricht: false, laedt: false, antwort: "", einwilligungFehlt: false, fehler: false, bereit: true };
const chat = (stand: Partial<ChatStand>) => ausloesen(() => meldeChatStand({ ...STILL, ...stand }));
const karte = (text: string | null) =>
  ausloesen(() => meldeFreigabeAnfrage(text, text ? (erlaubt) => notiere("bus", `freigabe ${erlaubt ? "ja" : "nein"} (${text})`) : null));

const SCHLUESSEL = { schluessel: "temp-schluessel", adresse: "wss://soniox.test/live", konfiguration: { model: "stt-rt-v5", audio_format: "auto" } };

/** Zwischen zwei Fällen: Umgebung, Lage und Bus zurück. */
async function neuerFall(): Promise<void> {
  setzeUmgebungZurueck();
  Object.assign(lage, LAGE);
  meldeChatStand({ ...STILL, bereit: false });
  meldeFreigabeAnfrage(null, null);
  gesehen = { frage: leseSprachFrage()?.nr ?? 0, stopp: leseStopp() };
  protokoll.leere();
}

// ---- Gespräch starten und Erkennung nachspielen --------------------------------------------------------------------------------------
type Modul = typeof import("@/components/ki/sprachmodus");
let Sprachmodus: Modul["Sprachmodus"];

interface Lauf {
  uhr: Uhr;
  ansicht: ReturnType<typeof rendereMitTexten>;
  aussen: HTMLButtonElement;
}

/** Rendert den Sprachmodus (der Fokus liegt vorher auf einem Knopf "Gespräch" der Seite), lässt das Mikrofon antworten und die
 *  erste Live-Sitzung verbinden. */
async function starte({ strikt = false, verbinden = true, uhr = installiereUhr({ datum: "2026-10-14T04:30:00Z" }) }: { strikt?: boolean; verbinden?: boolean; uhr?: Uhr } = {}): Promise<Lauf> {
  if (verbinden) netz.antworte("POST /api/ki-spracherkennung", { json: SCHLUESSEL });
  lage.sprachmodus = true;
  const aussen = document.createElement("button");
  aussen.textContent = "Gespräch";
  document.body.append(aussen);
  aussen.focus();
  const container = document.body.appendChild(document.createElement("div"));
  // StrictMode an der Wurzel wie in Next (reactStrictMode): nur dort spielt React das Aus- und Einhängen der Effekte durch.
  const ansicht = strikt
    ? Object.assign(
        render(
          <StrictMode>
            <NextIntlClientProvider locale="de" timeZone="Europe/Berlin" messages={texteVon("de")}>
              <Sprachmodus />
            </NextIntlClientProvider>
          </StrictMode>,
          { container },
        ),
        { textFehler: [] as string[] },
      )
    : rendereMitTexten(<Sprachmodus />, { container });
  await abwarten();
  await abwarten();
  await uhr.vor(0);
  return { uhr, ansicht, aussen };
}

const ws = (nr = WebSocketAttrappe.alle.length) => WebSocketAttrappe.alle[nr - 1]!;
const aufnahme = (nr = MediaRecorderAttrappe.alle.length) => MediaRecorderAttrappe.alle[nr - 1]!;

/** Ein Wort für die Erkennung: Text, Beginn und Ende im Audio (ms), dazu wahlweise der Sprecher. */
type Wort = [text: string, abMs: number, bisMs: number, sprecher?: string];
const token = (w: Wort, final: boolean) => ({
  text: ` ${w[0]}`,
  start_ms: w[1],
  end_ms: w[2],
  is_final: final,
  language: "de",
  ...(w[3] ? { speaker: w[3] } : {}),
});
/** Eine Nachricht von Soniox: neue endgültige Wörter, die aktuellen vorläufigen, auf Wunsch der Endpunkt. */
async function hoere({ endgueltig = [], vorlaeufig = [], ende = false, nr }: { endgueltig?: Wort[]; vorlaeufig?: Wort[]; ende?: boolean; nr?: number }): Promise<void> {
  const tokens = [...endgueltig.map((w) => token(w, true)), ...vorlaeufig.map((w) => token(w, false))];
  if (ende) tokens.push({ text: "<end>", is_final: true } as never);
  await ausloesen(() => ws(nr).empfange({ tokens }));
}
/** Ein ganzer Satz als endgültige Wörter, je Wort 300 ms ab `abMs`. */
const satz = (text: string, abMs: number, sprecher?: string): Wort[] =>
  text.split(" ").map((w, i) => [w, abMs + i * 300, abMs + i * 300 + 250, sprecher] as Wort);

const status = () => screen.getByRole("status").textContent;
const dialog = () => screen.getByRole("dialog");
const figur = () => document.querySelector<HTMLButtonElement>(".ki-sprachmodus__figur-knopf")!;
const himbi = () => {
  const h = document.querySelector<HTMLElement>(".himbi-attrappe")!;
  return `${h.dataset.zustand}/${h.dataset.groesse}/${h.dataset.links}${h.dataset.blick ? `/${h.dataset.blick}` : ""}`;
};
const knopf = (name: string) => screen.getByRole("button", { name });
const untertitel = () => document.querySelector(".ki-sprachmodus__untertitel")?.outerHTML ?? null;
const meldung = () => document.querySelector(".ki-sprachmodus__meldung")?.textContent ?? null;
/** Die Folge seit der letzten Leerung, ohne Nachrichten des Dienstes (die stehen im Test selbst). */
const folge = (...ohne: string[]) => protokoll.eintraege.filter((e) => !/^ws#\d+ message /.test(e) && !ohne.some((o) => e.startsWith(o)));
const zeitgeber = (uhr: Uhr) => uhr.zeitgeber().map((z) => `${z.intervall ? "intervall" : "zeitgeber"} ${z.ms}${z.inMs !== z.ms ? ` in ${z.inMs}` : ""}`);

// ---- 1. Start, Frage, Antwort, Ende --------------------------------------------------------------------------------------------------
async function pruefeStartUndFrage(): Promise<void> {
  localStorage.setItem("damicon-sprachmodus-untertitel", "an");
  const { uhr, ansicht, aussen } = await starte();
  const wurzel = dialog();
  gleich("Start: Folge bis zur offenen Live-Sitzung", folge(), ["mikrofon getUserMedia {\"audio\":{\"echoCancellation\":\"all\",\"noiseSuppression\":false,\"autoGainControl\":true,\"channelCount\":1,\"sampleRate\":16000}}","hoeren starte","aufnahme#1 new audio/webm;codecs=opus","fetch POST /api/ki-spracherkennung","aufnahme#1 start(100)","ws#1 new wss://soniox.test/live","ws#1 open","ws#1 send {\"api_key\":\"temp-schluessel\",\"model\":\"stt-rt-v5\",\"audio_format\":\"auto\"}"]);
  gleich(
    "Start: Dialog, Zustand, Fokus auf Himbi, Seite gesperrt",
    [wurzel.getAttribute("aria-modal"), wurzel.getAttribute("aria-label"), wurzel.dataset.untertitel, wurzel.className, status(), himbi(), document.activeElement === figur(), document.documentElement.style.overflow],
    ["true","Sprachmodus","an","ki-sprachmodus","Ich höre zu","hoert/mitte/false",true,"hidden"],
  );
  gleich("Start: Untertitel beim Zuhören", untertitel(), "<div class=\"ki-sprachmodus__untertitel\" aria-hidden=\"false\"><p class=\"ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer\">Ich höre zu …</p></div>");
  gleich("Start: Zeitgeber (Stille-Prüfung)", zeitgeber(uhr), ["intervall 5000"]);
  protokoll.leere();
  await ausloesen(() => aufnahme().liefere("ton"));
  await abwarten();
  gleich("Audio: jedes Stück geht an die Sitzung", folge(), ["aufnahme#1 dataavailable","ws#1 send <3 Bytes>"]);
  await uhr.vor(100);
  await hoere({ vorlaeufig: [["Wie", 100, 300]] });
  await hoere({ vorlaeufig: [["Wie", 100, 300], ["viele", 400, 600]] });
  gleich("Teiltranskript: steht im Untertitel", untertitel(), "<div class=\"ki-sprachmodus__untertitel\" aria-hidden=\"false\"><p class=\"ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer\">Wie viele</p></div>");
  protokoll.leere();
  await uhr.vor(900);
  await hoere({ endgueltig: satz("Wie viele Kisten?", 100), ende: true });
  gleich("Endpunkt: die Frage geht an den Chat, Himbi denkt", folge(), ["bus frage {\"text\":\"Wie viele Kisten?\",\"sprachen\":[\"de\",\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"]);
  gleich(
    "Endpunkt: angedockt, Zustand, Beschriftung, Untertitel",
    [wurzel.className, document.documentElement.hasAttribute("data-sprach-links"), status(), himbi(), figur().getAttribute("aria-label"), untertitel(), zeitgeber(uhr)],
    ["ki-sprachmodus ki-sprachmodus--angedockt",true,"Ich schaue nach …","denkt/klein/true","Antippen oder einfach dazwischenreden","<div class=\"ki-sprachmodus__untertitel\" aria-hidden=\"true\"><div class=\"ki-sprachmodus__untertitel-zeile\"><div class=\"markdown-attrappe\"></div></div></div>",["intervall 150"]],
  );
  protokoll.leere();
  await chat({ beschaeftigt: true, antwort: "Es sind" });
  gleich("Antwort entsteht: Untertitel zeigt sie", [status(), untertitel()], ["Ich schaue nach …","<div class=\"ki-sprachmodus__untertitel\" aria-hidden=\"true\"><div class=\"ki-sprachmodus__untertitel-zeile\"><div class=\"markdown-attrappe\">Es sind</div></div></div>"]);
  lage.gerade = { index: 0, anzahl: 1, satz: "Es sind 12 Kisten.", vorher: null };
  await chat({ beschaeftigt: true, laedt: true, antwort: "Es sind 12 Kisten." });
  gleich("Sprachausgabe: Himbi spricht", [status(), himbi(), folge()], ["Himbi spricht","spricht/klein/true",["ausgabe daempfe(1)"]]);
  await uhr.vor(150);
  gleich("Mitlesen: der klingende Satz steht am Sprachmodus", [wurzel.dataset.satzJetzt, wurzel.dataset.satzIndex], ["Es sind 12 Kisten.","0"]);
  await chat({ spricht: true, antwort: "Es sind 12 Kisten." });
  protokoll.leere();
  lage.gerade = null;
  await chat({ antwort: "Es sind 12 Kisten." });
  gleich("Antwort verklungen: Gnadenfrist vor dem Zuhören", [status(), zeitgeber(uhr)], ["Himbi spricht",["intervall 150","zeitgeber 300"]]);
  await uhr.vor(299);
  const nochSpricht = status();
  await uhr.vor(1);
  gleich("Nach 300 ms wieder zuhören", [nochSpricht, status(), himbi(), wurzel.className, folge()], ["Himbi spricht","Ich höre zu","hoert/mitte/false","ki-sprachmodus",[]]);
  // Himbis Echo bis 50 ms nach dem Verstummen gehört nicht zur nächsten Frage.
  protokoll.leere();
  const jetzt = uhr.jetzt();
  await hoere({ endgueltig: [["Kisten.", jetzt - 400, jetzt - 100], ["Danke", jetzt + 100, jetzt + 400]], ende: true });
  gleich("Nächste Frage: ohne Himbis Echo und ohne die vorige Frage", folge(), ["bus frage {\"text\":\"Danke\",\"sprachen\":[\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"]);
  protokoll.leere();
  ansicht.unmount();
  gleich("Abbau: Ausgabe normal laut, Sitzung zu, Aufnahme und Mikrofon aus", folge(), ["ausgabe daempfe(1)","ws#1 close()","aufnahme#1 stop","mikrofon spur#1 stop","hoeren stoppe"]);
  const fokusVorher = document.activeElement === aussen;
  await uhr.vor(0);
  gleich(
    "Abbau: Fokus zurück auf den Knopf der Seite, Seite frei, Leiste wieder scharf",
    [fokusVorher, document.activeElement === aussen, document.documentElement.style.overflow, document.documentElement.hasAttribute("data-sprach-links"), zeitgeber(uhr)],
    [false,true,"",false,[]],
  );
}

/** Stellt eine Frage und lässt Himbi antworten: danach spricht er (Phase "spricht"), die Antwort steht im Chat. */
async function bisHimbiSpricht(uhr: Uhr, frage = "Wie viele Kisten?", antwort = "Es sind zwölf Kisten im Lager."): Promise<void> {
  const ab = uhr.jetzt() + 100;
  await uhr.vor(100 + frage.split(" ").length * 300);
  await hoere({ endgueltig: satz(frage, ab), ende: true });
  await chat({ beschaeftigt: true, antwort });
  await chat({ beschaeftigt: true, laedt: true, antwort });
  await chat({ spricht: true, antwort });
}

const leiste = () =>
  [...document.querySelectorAll<HTMLButtonElement>(".ki-sprachmodus__leiste button")].map(
    (b) => `${b.getAttribute("aria-label")}|${b.title}|${b.getAttribute("aria-pressed") ?? "-"}|${b.className}|${b.querySelector("svg")?.getAttribute("class")}`,
  );

// ---- 2. Untertitel ------------------------------------------------------------------------------------------------------------------
async function pruefeUntertitel(): Promise<void> {
  const { uhr } = await starte();
  gleich("Untertitel: standardmäßig aus, kein Untertitel, Knopf nicht gedrückt", [dialog().dataset.untertitel, untertitel(), leiste()], ["aus",null,["Mikrofon stummschalten|Mikrofon stummschalten|false|ki-sprachmodus__knopf|lucide lucide-mic h-5 w-5","Untertitel|Untertitel|false|ki-sprachmodus__knopf ki-sprachmodus__knopf--untertitel|lucide lucide-captions h-5 w-5","Sprachmodus beenden|Sprachmodus beenden|-|ki-sprachmodus__knopf ki-sprachmodus__knopf--beenden|lucide lucide-x h-5 w-5"]]);
  fireEvent.click(knopf("Untertitel"));
  gleich("Untertitel: ein Klick schaltet ein und merkt es im Browser", [dialog().dataset.untertitel, localStorage.getItem("damicon-sprachmodus-untertitel"), untertitel(), leiste()[1]], ["an","an","<div class=\"ki-sprachmodus__untertitel\" aria-hidden=\"false\"><p class=\"ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer\">Ich höre zu …</p></div>","Untertitel|Untertitel|true|ki-sprachmodus__knopf ki-sprachmodus__knopf--untertitel ki-sprachmodus__knopf--aktiv|lucide lucide-captions h-5 w-5"]);
  await bisHimbiSpricht(uhr);
  gleich("Untertitel: beim Sprechen die Antwort, verborgen für Screenreader", untertitel(), "<div class=\"ki-sprachmodus__untertitel\" aria-hidden=\"true\"><div class=\"ki-sprachmodus__untertitel-zeile\"><div class=\"markdown-attrappe\">Es sind zwölf Kisten im Lager.</div></div></div>");
  fireEvent.click(knopf("Mikrofon stummschalten"));
  gleich("Untertitel: im Stumm-Zustand mit Antwort weiter die Antwort", untertitel(), "<div class=\"ki-sprachmodus__untertitel\" aria-hidden=\"true\"><div class=\"ki-sprachmodus__untertitel-zeile\"><div class=\"markdown-attrappe\">Es sind zwölf Kisten im Lager.</div></div></div>");
  await chat({ antwort: "" });
  gleich("Untertitel: im Stumm-Zustand ohne Antwort leer", untertitel(), "<div class=\"ki-sprachmodus__untertitel\" aria-hidden=\"true\"></div>");
  fireEvent.click(knopf("Untertitel"));
  gleich("Untertitel: ein zweiter Klick schaltet aus", [dialog().dataset.untertitel, localStorage.getItem("damicon-sprachmodus-untertitel"), untertitel()], ["aus","aus",null]);
  const proto = Object.getPrototypeOf(localStorage) as Storage;
  const setItem = proto.setItem;
  proto.setItem = () => {
    throw new Error("Speicher gesperrt");
  };
  try {
    fireEvent.click(knopf("Untertitel"));
    gleich("Untertitel: gesperrter Speicher, der Schalter wirkt trotzdem für diese Sitzung", [dialog().dataset.untertitel, localStorage.getItem("damicon-sprachmodus-untertitel")], ["an","aus"]);
  } finally {
    proto.setItem = setItem;
  }
}

async function pruefeUntertitelSpeicherGesperrt(): Promise<void> {
  localStorage.setItem("damicon-sprachmodus-untertitel", "an");
  const proto = Object.getPrototypeOf(localStorage) as Storage;
  const getItem = proto.getItem;
  proto.getItem = () => {
    throw new Error("Speicher gesperrt");
  };
  try {
    const { ansicht } = await starte();
    gleich("Untertitel: ist der Speicher nicht lesbar, bleibt er aus", [dialog().dataset.untertitel, status()], ["aus","Ich höre zu"]);
    ansicht.unmount();
  } finally {
    proto.getItem = getItem;
  }
}

// ---- 3. Bedienung: Tipp, Tasten, Stumm ------------------------------------------------------------------------------------------
async function pruefeTippUndTasten(): Promise<void> {
  const { uhr } = await starte();
  gleich("Leiste beim Zuhören", leiste(), ["Mikrofon stummschalten|Mikrofon stummschalten|false|ki-sprachmodus__knopf|lucide lucide-mic h-5 w-5","Untertitel|Untertitel|false|ki-sprachmodus__knopf ki-sprachmodus__knopf--untertitel|lucide lucide-captions h-5 w-5","Sprachmodus beenden|Sprachmodus beenden|-|ki-sprachmodus__knopf ki-sprachmodus__knopf--beenden|lucide lucide-x h-5 w-5"]);
  protokoll.leere();
  fireEvent.click(figur());
  const leer = fireEvent.keyDown(window, { key: " " });
  fireEvent.keyDown(window, { key: "x" });
  gleich("Tipp und Leertaste beim Zuhören: nur der Ton wird entsperrt, die Leertaste bleibt frei", [folge(), leer, status()], [["bus entsperre"],true,"Ich höre zu"]);
  lage.gerade = { index: 1, anzahl: 2, satz: "Es sind zwölf Kisten im Lager.", vorher: "Ich schaue nach." };
  await bisHimbiSpricht(uhr);
  protokoll.leere();
  const tippBei = uhr.jetzt();
  fireEvent.click(figur());
  gleich("Tipp beim Sprechen: Ton entsperrt, Chat still, Himbi hört zu", [folge(), status(), himbi()], [["bus entsperre","bus stopp"],"Ich höre zu","hoert/mitte/false"]);
  // Alles bis zum Tipp war Himbis Echo, erst danach beginnt die nächste Frage; sie trägt den unterbrochenen Satz.
  protokoll.leere();
  await uhr.vor(1000);
  await hoere({ endgueltig: [["Kisten", tippBei - 300, tippBei - 50], ["Stopp", tippBei + 100, tippBei + 300], ["zeig", tippBei + 400, tippBei + 600], ["mir", tippBei + 700, tippBei + 800], ["Aufgaben", tippBei + 900, tippBei + 990]], ende: true });
  gleich("Nach dem Tipp: die Frage ab dem Tipp, ein Befehlswort am Anfang bleibt stehen", folge(), ["bus frage {\"text\":\"Stopp zeig mir Aufgaben\",\"sprachen\":[\"de\",\"de\",\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":\"Es sind zwölf Kisten im Lager.\"}","ausgabe daempfe(1)"]);
  await chat({ beschaeftigt: true, antwort: "Ich schaue." });
  protokoll.leere();
  const nichtFrei = fireEvent.keyDown(window, { key: " " });
  gleich("Leertaste beim Nachdenken: unterbricht wie ein Tipp und wird abgefangen", [nichtFrei, folge(), status()], [false,["bus entsperre","bus stopp"],"Ich höre zu"]);
  await bisHimbiSpricht(uhr, "Und morgen?");
  protokoll.leere();
  fireEvent.keyDown(window, { key: "Escape" });
  gleich("Escape beim Sprechen: Chat still, Ohr zu, Sprachmodus beendet", [folge(), document.querySelector(".ki-sprachmodus") === null], [["bus stopp","ws#1 close()","aufnahme#1 stop","pane beendeSprachmodus","ausgabe daempfe(1)","mikrofon spur#1 stop","hoeren stoppe"],true]);
  await uhr.vor(0);
}

async function pruefeStumm(): Promise<void> {
  const { uhr } = await starte();
  localStorage.setItem("damicon-sprachmodus-untertitel", "an");
  fireEvent.click(knopf("Untertitel"));
  fireEvent.click(knopf("Untertitel"));
  await bisHimbiSpricht(uhr, "Zeig mir die Lieferungen");
  protokoll.leere();
  fireEvent.click(knopf("Mikrofon stummschalten"));
  gleich("Stumm beim Sprechen: Chat still, Sitzung und Aufnahme zu", folge(), ["bus stopp","ws#1 close()","aufnahme#1 stop"]);
  gleich("Stumm: Zustand, Leiste, Himbi in der Mitte", [status(), himbi(), dialog().className, leiste()[0], zeitgeber(uhr)], ["Mikrofon stummgeschaltet","pausiert/mitte/false","ki-sprachmodus","Mikrofon wieder einschalten|Mikrofon wieder einschalten|true|ki-sprachmodus__knopf|lucide lucide-mic-off h-5 w-5",["zeitgeber 0"]]);
  protokoll.leere();
  fireEvent.click(knopf("Mikrofon wieder einschalten"));
  await abwarten();
  await abwarten();
  await uhr.vor(0);
  gleich("Fortsetzen: neues Ohr ohne neues Mikrofon", [folge(), status(), leiste()[0]], [["aufnahme#2 new audio/webm;codecs=opus","fetch POST /api/ki-spracherkennung","aufnahme#2 start(100)","ws#2 new wss://soniox.test/live","ws#2 open","ws#2 send {\"api_key\":\"temp-schluessel\",\"model\":\"stt-rt-v5\",\"audio_format\":\"auto\"}"],"Ich höre zu","Mikrofon stummschalten|Mikrofon stummschalten|false|ki-sprachmodus__knopf|lucide lucide-mic h-5 w-5"]);
  // Ein Nachsatz zur alten Frage gibt es nach dem Stummschalten nicht mehr.
  protokoll.leere();
  const ab = uhr.jetzt() + 100;
  await uhr.vor(1000);
  await hoere({ endgueltig: satz("und die Reklamationen", ab), ende: true });
  gleich("Nach dem Fortsetzen: eine neue Frage, kein Nachsatz", folge(), ["bus frage {\"text\":\"und die Reklamationen\",\"sprachen\":[\"de\",\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"]);
  protokoll.leere();
  fireEvent.click(knopf("Mikrofon stummschalten"));
  gleich("Stumm beim Nachdenken: Chat still", folge(), ["bus stopp","ws#2 close()","aufnahme#2 stop"]);
}

// ---- 4. Wortbefehle -------------------------------------------------------------------------------------------------------------
const HIMBI_SATZ = "Es sind zwölf Kisten im Lager, halt nur zwei offen.";

async function pruefeWortbefehle(): Promise<void> {
  const { uhr } = await starte();
  lage.gerade = { index: 0, anzahl: 1, satz: HIMBI_SATZ, vorher: null };
  await bisHimbiSpricht(uhr);
  protokoll.leere();
  let t = uhr.jetzt();
  await hoere({ endgueltig: [["Es", t + 100, t + 300], ["sind", t + 400, t + 600], ["zwölf", t + 700, t + 900]] });
  await hoere({ endgueltig: [["halt", t + 1000, t + 1200]] });
  gleich("Echo: Himbis eigenes 'halt' unterbricht ihn nicht", [folge(), status()], [[],"Himbi spricht"]);
  await uhr.vor(1500);
  await hoere({ endgueltig: [["Stopp", t + 1600, t + 1800]] });
  gleich("Stopp, endgültig erkannt: sofort still", [folge(), status()], [["mitlesen ueberschrift Es sind zwölf Kisten im Lager, halt nur zwei offen.","bus stopp"],"Ich höre zu"]);
  protokoll.leere();
  await uhr.vor(1500);
  await hoere({ endgueltig: satz("zeig mir die Aufgaben", t + 1900), ende: true });
  gleich("Nach dem Stopp: die Frage ohne Befehlswort, mit dem unterbrochenen Satz", folge(), ["bus frage {\"text\":\"zeig mir die Aufgaben\",\"sprachen\":[\"de\",\"de\",\"de\",\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":\"Es sind zwölf Kisten im Lager, halt nur zwei offen.\"}","ausgabe daempfe(1)"]);

  // Nur vorläufig erkannt: erst nach 350 ms stabil.
  await chat({ antwort: "" });
  await uhr.vor(300);
  await bisHimbiSpricht(uhr, "Und gestern?");
  protokoll.leere();
  t = uhr.jetzt();
  await hoere({ vorlaeufig: [["Stopp", t + 100, t + 300]] });
  gleich("Stopp, vorläufig: ein Zeitgeber über 350 ms", [zeitgeber(uhr), folge()], [["intervall 150","zeitgeber 350"],[]]);
  await uhr.vor(349);
  const davor = status();
  await uhr.vor(1);
  gleich("Stopp, vorläufig: nach 350 ms still", [davor, status(), folge()], ["Himbi spricht","Ich höre zu",["mitlesen ueberschrift Es sind zwölf Kisten im Lager, halt nur zwei offen.","bus stopp"]]);

  // Vorläufig erkannt und gleich korrigiert: nichts.
  await chat({ antwort: "" });
  await uhr.vor(300);
  await bisHimbiSpricht(uhr, "Und morgen?");
  protokoll.leere();
  t = uhr.jetzt();
  await hoere({ vorlaeufig: [["Stopp", t + 100, t + 300]] });
  await uhr.vor(200);
  await hoere({ vorlaeufig: [["Stoppuhr", t + 100, t + 400]] });
  await uhr.vor(400);
  gleich("Stopp, vorläufig und korrigiert: Himbi spricht weiter", [zeitgeber(uhr), folge(), status()], [["intervall 150"],["mitlesen ueberschrift Es sind zwölf Kisten im Lager, halt nur zwei offen."],"Himbi spricht"]);

  // Eigene Wörter vor dem Befehl gehören zur Frage.
  await hoere({ endgueltig: [["Stoppuhr", t + 100, t + 400]] });
  protokoll.leere();
  t = uhr.jetzt();
  await uhr.vor(1300);
  await hoere({ endgueltig: satz("Wie sagt man Stopp", t + 100) });
  gleich("'Wie sagt man Stopp': unterbricht", [folge(), status()], [["bus stopp"],"Ich höre zu"]);
  protokoll.leere();
  await uhr.vor(700);
  await hoere({ endgueltig: satz("auf Russisch?", t + 1300), ende: true });
  gleich("'Wie sagt man Stopp auf Russisch?': die ganze Frage geht hinaus", folge(), ["bus frage {\"text\":\"Wie sagt man Stopp auf Russisch?\",\"sprachen\":[\"de\",\"de\",\"de\",\"de\",\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":\"Es sind zwölf Kisten im Lager, halt nur zwei offen.\"}","ausgabe daempfe(1)"]);

  // "Sag Tschüss Himbi" mitten in der Antwort: ein Verb in eigenen Worten, kein Beenden und kein Unterbrechen.
  await chat({ antwort: "" });
  await uhr.vor(300);
  await bisHimbiSpricht(uhr, "Was noch?");
  protokoll.leere();
  t = uhr.jetzt();
  await uhr.vor(1000);
  await hoere({ endgueltig: satz("Sag Tschüss Himbi", t + 100) });
  gleich("'Sag Tschüss Himbi' mitten in der Antwort: weder beendet noch unterbrochen", [folge(), status()], [["mitlesen ueberschrift Es sind zwölf Kisten im Lager, halt nur zwei offen."],"Himbi spricht"]);
}

async function pruefeBefehleBeimNachdenkenUndZuhoeren(): Promise<void> {
  localStorage.setItem("damicon-sprachmodus-untertitel", "an");
  const { uhr } = await starte();
  protokoll.leere();
  let t = uhr.jetzt();
  await uhr.vor(1000);
  await hoere({ endgueltig: satz("Stopp", t + 100), ende: true });
  gleich("Zuhören: 'Stopp' allein ist keine Frage", [folge(), status()], [[],"Ich höre zu"]);
  await hoere({ ende: true });
  gleich("Zuhören: ein Endpunkt ohne Worte ist keine Frage", [folge(), status()], [[],"Ich höre zu"]);
  t = uhr.jetzt();
  await uhr.vor(1000);
  await hoere({ endgueltig: satz("Zeig mir die Lieferungen", t + 100), ende: true });
  protokoll.leere();
  t = uhr.jetzt();
  await uhr.vor(500);
  await hoere({ endgueltig: [["Äh", t + 100, t + 300]] });
  gleich("Nachdenken: ein Füllaut ist kein Nachsatz", [folge(), status()], [[],"Ich schaue nach …"]);
  await uhr.vor(1000);
  await hoere({ endgueltig: satz("und die Reklamationen", t + 600) });
  gleich("Nachdenken: weitergesprochen, die Anfrage bricht ab, der Untertitel zeigt die ganze Frage", [folge(), status(), untertitel()], [["bus stopp"],"Ich höre zu","<div class=\"ki-sprachmodus__untertitel\" aria-hidden=\"false\"><p class=\"ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer\">Zeig mir die Lieferungen und die Reklamationen</p></div>"]);
  protokoll.leere();
  await hoere({ ende: true });
  gleich("Nachsatz: am Endpunkt EINE Frage, die die vorige ersetzt", folge(), ["bus frage {\"text\":\"Zeig mir die Lieferungen und die Reklamationen\",\"sprachen\":[\"de\",\"de\",\"de\",\"de\",\"de\",\"de\",\"de\"],\"ersetzt\":true,\"unterbrochen\":null}","ausgabe daempfe(1)"]);
  protokoll.leere();
  t = uhr.jetzt();
  await uhr.vor(1000);
  await hoere({ endgueltig: satz("Ich meine Stopp", t + 100) });
  gleich("Nachdenken: ein Befehlswort hinter eigenen Worten ist ein Nachsatz", [folge(), status()], [["bus stopp"],"Ich höre zu"]);
  await hoere({ ende: true });
  gleich("Nachsatz mit Befehlswort: am Endpunkt EINE Frage", folge(), ["bus stopp","bus frage {\"text\":\"Zeig mir die Lieferungen und die Reklamationen Ich meine Stopp\",\"sprachen\":[\"de\",\"de\",\"de\",\"de\",\"de\",\"de\",\"de\",\"de\",\"de\",\"de\"],\"ersetzt\":true,\"unterbrochen\":null}","ausgabe daempfe(1)"]);
  protokoll.leere();
  t = uhr.jetzt();
  await uhr.vor(400);
  await hoere({ endgueltig: [["Stopp", t + 100, t + 300]] });
  gleich("Nachdenken: 'Stopp' am Anfang unterbricht", [folge(), status()], [["bus stopp"],"Ich höre zu"]);
}

async function pruefeBeendenBeimZuhoeren(): Promise<void> {
  const { uhr } = await starte();
  protokoll.leere();
  const t = uhr.jetzt();
  await uhr.vor(1000);
  await hoere({ endgueltig: satz("Sprachmodus beenden", t + 100), ende: true });
  gleich("Zuhören: 'Sprachmodus beenden' beendet, ohne den Chat anzuhalten", [folge(), document.querySelector(".ki-sprachmodus") === null], [["ws#1 close()","aufnahme#1 stop","pane beendeSprachmodus","ausgabe daempfe(1)","mikrofon spur#1 stop","hoeren stoppe"],true]);
  await uhr.vor(0);
}

async function pruefeTschuessMittenInDerAntwort(): Promise<void> {
  const { uhr } = await starte();
  lage.gerade = { index: 0, anzahl: 1, satz: HIMBI_SATZ, vorher: null };
  await bisHimbiSpricht(uhr);
  protokoll.leere();
  const t = uhr.jetzt();
  await uhr.vor(700);
  await hoere({ endgueltig: [["Tschüss", t + 100, t + 300], ["Himbi", t + 400, t + 600], ["Kisten", t + 650, t + 690]] });
  gleich("'Tschüss Himbi' mitten in der Antwort (Echo dahinter): Chat still, beendet", [folge(), document.querySelector(".ki-sprachmodus") === null], [["mitlesen ueberschrift Es sind zwölf Kisten im Lager, halt nur zwei offen.","bus stopp","ws#1 close()","aufnahme#1 stop","pane beendeSprachmodus","ausgabe daempfe(1)","mikrofon spur#1 stop","hoeren stoppe"],true]);
  await uhr.vor(0);
}

// ---- 5. Dazwischenreden: Lautstärke-Wächter und Verdacht ------------------------------------------------------------------------------
/** Der Nutzer spricht `ms` lang laut (Mikrofon 0,5, Ausgabe still), danach ist es wieder leise. */
async function dazwischen(uhr: Uhr, ms = 450): Promise<void> {
  lage.lautstaerke = 0.5;
  await uhr.vor(ms);
  lage.lautstaerke = 0;
}
/** Wartet, bis die vorige Antwort verklungen ist, und lässt Himbi die nächste sprechen. */
async function naechsteAntwort(uhr: Uhr, frage: string, antwort = HIMBI_SATZ): Promise<void> {
  await chat({ antwort: "" });
  await uhr.vor(300);
  await bisHimbiSpricht(uhr, frage, antwort);
}

async function pruefeDazwischenreden(): Promise<void> {
  const { uhr } = await starte();
  lage.gerade = { index: 0, anzahl: 1, satz: HIMBI_SATZ, vorher: null };
  await bisHimbiSpricht(uhr, "Wie viele Kisten?", HIMBI_SATZ);
  protokoll.leere();
  let t = uhr.jetzt();
  await dazwischen(uhr, 300);
  gleich("Wächter: 300 ms laut reichen nicht", [folge(), zeitgeber(uhr)], [["mitlesen ueberschrift Es sind zwölf Kisten im Lager, halt nur zwei offen."],["intervall 150"]]);
  await uhr.vor(1000);
  t = uhr.jetzt();
  await dazwischen(uhr);
  gleich("Wächter: nach 400 ms Stimme wird Himbi leiser, die Wörter haben 1,8 s", [folge(), zeitgeber(uhr), status()], [["mitlesen ueberschrift Es sind zwölf Kisten im Lager, halt nur zwei offen.","ausgabe daempfe(0.3)"],["intervall 150 in 50","zeitgeber 1800 in 1738"],"Himbi spricht"]);
  protokoll.leere();
  await hoere({ endgueltig: [["Mhm", t + 50, t + 300]] });
  gleich("Verdacht: 'Mhm' ohne Endpunkt wartet", [folge(), status()], [[],"Himbi spricht"]);
  await hoere({ ende: true });
  gleich("Verdacht: 'Mhm' am Endpunkt ist eine Rückmeldung, Himbi wieder normal laut", [folge(), status(), zeitgeber(uhr)], [["ausgabe daempfe(1)"],"Himbi spricht",["intervall 150 in 50"]]);

  protokoll.leere();
  await uhr.vor(1000);
  await dazwischen(uhr);
  const frist = uhr.zeitgeber().find((z) => z.ms === 1800)!.inMs;
  await uhr.vor(frist - 1);
  const vorFrist = folge();
  await uhr.vor(1);
  gleich("Verdacht: ohne Wörter entscheidet die Frist, Himbi wieder normal laut", [vorFrist, folge(), status()], [["ausgabe daempfe(0.3)"],["ausgabe daempfe(0.3)","ausgabe daempfe(1)"],"Himbi spricht"]);

  // Länger als 3 s nach dem Beginn der Antwort: eine neue Frage.
  protokoll.leere();
  await uhr.vor(500);
  t = uhr.jetzt();
  await dazwischen(uhr);
  await hoere({ endgueltig: satz("zeig mir lieber die Aufgaben", t + 50) });
  gleich("Verdacht: Wörter mit Inhalt unterbrechen, Himbi verstummt", [folge(), status(), zeitgeber(uhr)], [["ausgabe daempfe(0.3)","bus stopp"],"Ich höre zu",["intervall 5000"]]);
  protokoll.leere();
  await uhr.vor(1500);
  await hoere({ ende: true });
  gleich("Nach der Unterbrechung per Stimme: die Frage ab dem Einsatz der Stimme", folge(), ["bus frage {\"text\":\"zeig mir lieber die Aufgaben\",\"sprachen\":[\"de\",\"de\",\"de\",\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":\"Es sind zwölf Kisten im Lager, halt nur zwei offen.\"}","ausgabe daempfe(1)"]);

  // In den ersten 3 s der Antwort: ein Nachsatz zur Frage.
  await naechsteAntwort(uhr, "Zeig mir die Lieferungen");
  protokoll.leere();
  t = uhr.jetzt();
  await dazwischen(uhr);
  await hoere({ endgueltig: satz("und die Reklamationen bitte", t + 50) });
  gleich("Verdacht in den ersten Sekunden: Nachsatz, die Antwort bricht ab", [folge(), status()], [["mitlesen ueberschrift Es sind zwölf Kisten im Lager, halt nur zwei offen.","ausgabe daempfe(0.3)","bus stopp"],"Ich höre zu"]);
  protokoll.leere();
  await uhr.vor(1500);
  await hoere({ ende: true });
  gleich("Nachsatz per Stimme: EINE Frage, die die vorige ersetzt", folge(), ["bus frage {\"text\":\"Zeig mir die Lieferungen und die Reklamationen bitte\",\"sprachen\":[\"de\",\"de\",\"de\",\"de\",\"de\",\"de\",\"de\",\"de\"],\"ersetzt\":true,\"unterbrochen\":null}","ausgabe daempfe(1)"]);

  // Himbi verstummt, während der Verdacht läuft: ein Wort mit Inhalt gehört zur nächsten Frage.
  await naechsteAntwort(uhr, "Was ist dringend?");
  await uhr.vor(4000);
  protokoll.leere();
  t = uhr.jetzt();
  await dazwischen(uhr);
  await hoere({ endgueltig: [["Aufgaben", t + 50, t + 400]] });
  await chat({ antwort: HIMBI_SATZ });
  gleich("Verstummt im Verdacht mit Inhalt: Himbi wieder normal laut", [folge(), status()], [["ausgabe daempfe(0.3)","ausgabe daempfe(1)"],"Himbi spricht"]);
  await uhr.vor(300);
  protokoll.leere();
  await uhr.vor(600);
  await hoere({ endgueltig: satz("von heute", t + 500), ende: true });
  gleich("Verstummt im Verdacht mit Inhalt: die Frage beginnt am Einsatz", folge(), ["bus frage {\"text\":\"Aufgaben von heute\",\"sprachen\":[\"de\",\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"]);

  await naechsteAntwort(uhr, "Und morgen?");
  await uhr.vor(4000);
  protokoll.leere();
  t = uhr.jetzt();
  await dazwischen(uhr);
  await hoere({ endgueltig: [["Mhm", t + 50, t + 300]] });
  await chat({ antwort: HIMBI_SATZ });
  await uhr.vor(300);
  protokoll.leere();
  await uhr.vor(600);
  await hoere({ endgueltig: satz("Danke", t + 500), ende: true });
  gleich("Verstummt im Verdacht ohne Inhalt: das 'Mhm' gehört nicht zur Frage", folge(), ["bus frage {\"text\":\"Danke\",\"sprachen\":[\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"]);

  // Eine Freigabekarte erscheint im Verdacht: Sprechen ist die Antwort darauf.
  await naechsteAntwort(uhr, "Leg eine Aufgabe an");
  await uhr.vor(4000);
  protokoll.leere();
  t = uhr.jetzt();
  await dazwischen(uhr);
  await karte("Aufgabe „Kisten zählen“ anlegen?");
  await hoere({ vorlaeufig: [["Ja", t + 50, t + 300]] });
  gleich("Karte im Verdacht: kein Unterbrechen, Himbi wieder normal laut", [folge(), status()], [["ausgabe daempfe(0.3)","ausgabe daempfe(1)"],"Himbi spricht"]);
  protokoll.leere();
  await uhr.vor(500);
  await dazwischen(uhr);
  await uhr.vor(2000);
  gleich("Karte offen: der Wächter schlägt nicht an", [folge(), zeitgeber(uhr)], [[],["intervall 150 in 100"]]);
  await karte(null);

  // Ein Tipp im Verdacht: Himbi bleibt leise bis zum Stopp, die nächste Antwort beginnt normal laut.
  await uhr.vor(500);
  protokoll.leere();
  await dazwischen(uhr);
  fireEvent.click(figur());
  gleich("Tipp im Verdacht: still, ohne wieder laut zu werden, Frist aufgehoben", [folge(), status(), zeitgeber(uhr)], [["ausgabe daempfe(0.3)","bus entsperre","bus stopp"],"Ich höre zu",["intervall 5000"]]);
}

// ---- 6. Freigabekarte: Ja, Nein, neue Frage, Stopp, Beenden ------------------------------------------------------------------------
const KARTE = "Aufgabe Kisten zählen anlegen?";

async function pruefeFreigabe(): Promise<void> {
  const { uhr } = await starte();
  let t = uhr.jetzt();
  await uhr.vor(1500);
  await hoere({ endgueltig: satz("Leg eine Aufgabe an", t + 100), ende: true });
  await chat({ beschaeftigt: true, antwort: "Ich lege sie an." });
  protokoll.leere();
  await karte(KARTE);
  gleich("Karte beim Nachdenken: Himbi wartet auf Ja oder Nein, die Karte steht auch ohne Untertitel", [status(), himbi(), untertitel(), figur().getAttribute("aria-label")], ["Ich warte auf Ihr Ja oder Nein","hoert/klein/true","<div class=\"ki-sprachmodus__untertitel ki-sprachmodus__untertitel--freigabe\" role=\"alertdialog\" aria-live=\"assertive\"><p class=\"ki-sprachmodus__untertitel-zeile\">Aufgabe Kisten zählen anlegen?</p><p class=\"ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer\">Sagen Sie „Ja“ zum Freigeben oder „Nein“ zum Ablehnen.</p></div>","Antippen oder einfach dazwischenreden"]);
  t = uhr.jetzt();
  await uhr.vor(500);
  await hoere({ endgueltig: [["Äh", t + 100, t + 300]], ende: true });
  gleich("Karte: ein Füllaut ist keine Antwort", [folge(), status()], [[],"Ich warte auf Ihr Ja oder Nein"]);
  await uhr.vor(1000);
  lage.gerade = { index: 0, anzahl: 1, satz: "Jetzt klicke ich auf Anlegen.", vorher: null };
  await hoere({ endgueltig: [["Ja,", t + 600, t + 700], ["bitte.", t + 750, t + 900], ["Jetzt", t + 950, t + 1000], ["klicke", t + 1050, t + 1100], ["ich", t + 1150, t + 1200], ["auf", t + 1250, t + 1300], ["Anlegen.", t + 1350, t + 1450]], ende: true });
  gleich("Karte: 'Ja, bitte.' mit Himbis Echo dahinter gibt frei, Himbi denkt weiter", [folge(), status()], [["bus freigabe ja (Aufgabe Kisten zählen anlegen?)"],"Ich warte auf Ihr Ja oder Nein"]);
  lage.gerade = null;
  await karte(null);
  gleich("Karte erledigt: wieder 'Ich schaue nach'", [status(), untertitel()], ["Ich schaue nach …",null]);

  // Karte beim Zuhören: "Nein" lehnt ab, der Chat arbeitet weiter, Himbi denkt.
  await chat({ antwort: "Erledigt." });
  await uhr.vor(300);
  protokoll.leere();
  await karte("Datei löschen?");
  t = uhr.jetzt();
  await uhr.vor(500);
  await hoere({ endgueltig: [["Nein.", t + 100, t + 300]], ende: true });
  gleich("Karte beim Zuhören: 'Nein' lehnt ab, Himbi denkt", [folge(), status()], [["bus freigabe nein (Datei löschen?)","ausgabe daempfe(1)"],"Ich warte auf Ihr Ja oder Nein"]);
  await karte(null);
  await chat({ antwort: "Abgebrochen." });
  await uhr.vor(300);

  // Bei offener Karte: ein Füllaut fragt nichts, eine neue Frage lehnt die Karte erst ab.
  protokoll.leere();
  await karte("Lieferung buchen?");
  t = uhr.jetzt();
  await uhr.vor(500);
  await hoere({ endgueltig: [["Äh", t + 100, t + 300]], ende: true });
  gleich("Karte beim Zuhören: ein Füllaut ist weder Antwort noch Frage", [folge(), status()], [[],"Ich warte auf Ihr Ja oder Nein"]);
  await uhr.vor(1500);
  await hoere({ endgueltig: satz("Zeig mir die Lieferungen", t + 600), ende: true });
  gleich("Karte beim Zuhören: eine neue Frage lehnt die Karte ab und geht hinaus", [folge(), status()], [["bus freigabe nein (Lieferung buchen?)","bus frage {\"text\":\"Zeig mir die Lieferungen\",\"sprachen\":[\"de\",\"de\",\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"],"Ich warte auf Ihr Ja oder Nein"]);
  await karte(null);

  // Während Himbi spricht: "Stopp" lehnt nur die Karte ab, "Himbi" allein nicht.
  await chat({ beschaeftigt: true, laedt: true, antwort: "Ich buche die Lieferung." });
  await chat({ spricht: true, antwort: "Ich buche die Lieferung." });
  await karte("Lieferung wirklich buchen?");
  protokoll.leere();
  t = uhr.jetzt();
  await uhr.vor(500);
  await hoere({ endgueltig: [["Stopp", t + 100, t + 300]] });
  gleich("Karte beim Sprechen: 'Stopp' lehnt nur die Karte ab, Himbi spricht weiter", [folge(), status()], [["bus freigabe nein (Lieferung wirklich buchen?)"],"Himbi spricht"]);
  await karte(null);
  await karte("Lieferung doch buchen?");
  protokoll.leere();
  await uhr.vor(500);
  await hoere({ endgueltig: [["Himbi", t + 600, t + 800]] });
  gleich("Karte beim Sprechen: 'Himbi' allein lehnt nicht ab", [folge(), status()], [[],"Himbi spricht"]);
  await karte(null);

  // Eine Karte ersetzt die andere: die Antwort gilt der neuen.
  await chat({ beschaeftigt: true, antwort: "Noch eine." });
  await karte("Erste Karte?");
  await uhr.vor(200);
  await karte("Zweite Karte?");
  protokoll.leere();
  t = uhr.jetzt();
  await uhr.vor(500);
  await hoere({ endgueltig: [["Ja.", t + 100, t + 300]], ende: true });
  gleich("Zweite Karte: das Ja gilt ihr", folge(), ["bus freigabe ja (Zweite Karte?)"]);
}

async function pruefeBeendenBeiKarte(): Promise<void> {
  const { uhr } = await starte();
  await bisHimbiSpricht(uhr, "Leg eine Aufgabe an", "Soll ich sie anlegen?");
  await chat({ antwort: "Soll ich sie anlegen?" });
  await uhr.vor(300);
  await karte(KARTE);
  protokoll.leere();
  const t = uhr.jetzt();
  await uhr.vor(1000);
  await hoere({ endgueltig: satz("Sprachmodus beenden.", t + 100), ende: true });
  gleich("Karte: 'Sprachmodus beenden' lehnt ab und beendet", [folge(), document.querySelector(".ki-sprachmodus") === null], [["bus freigabe nein (Aufgabe Kisten zählen anlegen?)","ws#1 close()","aufnahme#1 stop","pane beendeSprachmodus","ausgabe daempfe(1)","mikrofon spur#1 stop","hoeren stoppe"],true]);
  await uhr.vor(0);
}

// ---- 7. Kopplung an den Chat: Einwilligung, Fehler -----------------------------------------------------------------------------------
async function frage(uhr: Uhr, text: string): Promise<void> {
  const t = uhr.jetzt();
  await uhr.vor(100 + text.split(" ").length * 300);
  await hoere({ endgueltig: satz(text, t + 100), ende: true });
}

async function pruefeChatFehler(): Promise<void> {
  const { uhr } = await starte();
  await chat({ fehler: true });
  gleich("Chat-Fehler beim Zuhören: keine Meldung", [meldung(), status()], [null,"Ich höre zu"]);
  await chat({});
  await frage(uhr, "Wie viele Kisten?");
  protokoll.leere();
  await chat({ fehler: true });
  gleich("Chat-Fehler beim Nachdenken: Meldung, das Gespräch bleibt offen", [meldung(), status(), folge()], ["Der Vorgang ist fehlgeschlagen. Bitte noch einmal versuchen. Bleibt es dabei, melden Sie ihn mit der Uhrzeit bei der Administration.","Ich höre zu",[]]);
  await uhr.vor(1000);
  await chat({});
  gleich("Chat-Fehler: die Meldung bleibt beim Zuhören stehen", [meldung(), status()], ["Der Vorgang ist fehlgeschlagen. Bitte noch einmal versuchen. Bleibt es dabei, melden Sie ihn mit der Uhrzeit bei der Administration.","Ich höre zu"]);
  await frage(uhr, "Und jetzt?");
  gleich("Chat-Fehler: die nächste Frage räumt die Meldung weg", [meldung(), status()], [null,"Ich schaue nach …"]);
  protokoll.leere();
  await chat({ einwilligungFehlt: true });
  gleich("Einwilligung fehlt: Meldung, Fehlerzustand, Ohr zu", [meldung(), status(), himbi(), figur().getAttribute("aria-label"), leiste()[0], dialog().className, folge()], ["Bitte zuerst im Chat dem Hinweis zur KI-Nutzung zustimmen, dann den Sprachmodus neu starten.","Etwas ist schiefgegangen","fehler/mitte/false","Erneut versuchen","Erneut versuchen|Erneut versuchen|false|ki-sprachmodus__knopf|lucide lucide-mic h-5 w-5","ki-sprachmodus",["ws#1 close()","aufnahme#1 stop"]]);
  await chat({});
  protokoll.leere();
  fireEvent.click(figur());
  await abwarten();
  await abwarten();
  await uhr.vor(0);
  gleich("Erneut versuchen mit offenem Mikrofon: gleich weiter zum Zuhören, Meldung weg", [meldung(), status(), folge()], [null,"Ich höre zu",["bus entsperre","aufnahme#2 new audio/webm;codecs=opus","fetch POST /api/ki-spracherkennung","aufnahme#2 start(100)","ws#2 new wss://soniox.test/live","ws#2 open","ws#2 send {\"api_key\":\"temp-schluessel\",\"model\":\"stt-rt-v5\",\"audio_format\":\"auto\"}"]]);
}

// ---- 8. Himbi beginnt den Tag ------------------------------------------------------------------------------------------------------
async function pruefeTagesbeginn(): Promise<void> {
  lage.tagesbeginnAn = true;
  meldeChatStand({ ...STILL });
  const { uhr, ansicht } = await starte();
  gleich("Tagesbeginn: beim ersten Zuhören fragt Himbi selbst, nachdem das Ohr offen ist", [folge(), status()], [["mikrofon getUserMedia {\"audio\":{\"echoCancellation\":\"all\",\"noiseSuppression\":false,\"autoGainControl\":true,\"channelCount\":1,\"sampleRate\":16000}}","hoeren starte","aufnahme#1 new audio/webm;codecs=opus","fetch POST /api/ki-spracherkennung","aufnahme#1 start(100)","bus frage {\"text\":\"Guten Morgen, Himbi. Was steht heute an und was ist dringend?\",\"sprachen\":[\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)","ws#1 new wss://soniox.test/live","ws#1 open","ws#1 send {\"api_key\":\"temp-schluessel\",\"model\":\"stt-rt-v5\",\"audio_format\":\"auto\"}"],"Ich schaue nach …"]);
  gleich("Tagesbeginn: der Tag ist gemerkt", localStorage.getItem("damicon-himbi-tagesbeginn"), "{\"nutzer\":\"nutzer-1\",\"tag\":\"2026-10-14\",\"arten\":[\"gespraech\"]}");
  await chat({ antwort: "Heute ist wenig los." });
  await uhr.vor(300);
  protokoll.leere();
  fireEvent.click(knopf("Mikrofon stummschalten"));
  fireEvent.click(knopf("Mikrofon wieder einschalten"));
  await abwarten();
  gleich("Tagesbeginn: nach Stumm und Fortsetzen nicht noch einmal", folge("ws#", "aufnahme#", "fetch"), []);
  ansicht.unmount();
  await uhr.vor(0);
  protokoll.leere();
  const zweite = await starte({ uhr });
  gleich("Tagesbeginn: am selben Tag nicht noch einmal", [folge("mikrofon", "hoeren", "ws#", "aufnahme#", "fetch"), status()], [[],"Ich höre zu"]);
  zweite.ansicht.unmount();
}

async function pruefeTagesbeginnEntfaellt(): Promise<void> {
  lage.tagesbeginnAn = true;
  const { uhr, ansicht } = await starte();
  gleich("Tagesbeginn: Chat nicht bereit, keine Frage", [folge("mikrofon", "hoeren", "ws#", "aufnahme#", "fetch"), status(), localStorage.getItem("damicon-himbi-tagesbeginn")], [[],"Ich höre zu",null]);
  await chat({});
  fireEvent.click(knopf("Mikrofon stummschalten"));
  fireEvent.click(knopf("Mikrofon wieder einschalten"));
  await abwarten();
  gleich("Tagesbeginn: entfallen gilt für die Sitzung, auch wenn der Chat später bereit ist", [folge("mikrofon", "hoeren", "ws#", "aufnahme#", "fetch"), status()], [[],"Ich höre zu"]);
  ansicht.unmount();
  await uhr.vor(0);
  protokoll.leere();
  await karte("Offene Karte?");
  const mitKarte = await starte({ uhr });
  gleich("Tagesbeginn: bei offener Freigabe keine Frage", [folge("mikrofon", "hoeren", "ws#", "aufnahme#", "fetch"), status()], [[],"Ich warte auf Ihr Ja oder Nein"]);
  mitKarte.ansicht.unmount();
  await karte(null);
  await uhr.vor(0);
  protokoll.leere();
  lage.nutzerId = null;
  const ohneNutzer = await starte({ uhr });
  gleich("Tagesbeginn: ohne Nutzer keine Frage", [folge("mikrofon", "hoeren", "ws#", "aufnahme#", "fetch"), status()], [[],"Ich höre zu"]);
  ohneNutzer.ansicht.unmount();
  await uhr.vor(0);
  protokoll.leere();
  lage.nutzerId = "nutzer-1";
  lage.tagesbeginnAn = false;
  const aus = await starte({ uhr });
  gleich("Tagesbeginn: Einstellung aus, keine Frage", [folge("mikrofon", "hoeren", "ws#", "aufnahme#", "fetch"), status()], [[],"Ich höre zu"]);
  aus.ansicht.unmount();
}

// ---- 9. Fehler und Neuversuche --------------------------------------------------------------------------------------------------
async function pruefeKeinMikrofon(): Promise<void> {
  mikrofon.verweigerung = "NotAllowedError";
  const { uhr } = await starte();
  gleich(
    "Kein Mikrofon: Meldung, Fehlerzustand, Himbi und Knopf bieten den neuen Versuch",
    [folge(), meldung(), status(), himbi(), figur().getAttribute("aria-label"), figur().title, leiste()[0], dialog().className, zeitgeber(uhr)],
    [["mikrofon getUserMedia {\"audio\":{\"echoCancellation\":\"all\",\"noiseSuppression\":false,\"autoGainControl\":true,\"channelCount\":1,\"sampleRate\":16000}}"],"Kein Mikrofonzugriff. Bitte in den Browsereinstellungen erlauben.","Etwas ist schiefgegangen","fehler/mitte/false","Erneut versuchen","Erneut versuchen","Erneut versuchen|Erneut versuchen|false|ki-sprachmodus__knopf|lucide lucide-mic h-5 w-5","ki-sprachmodus",[]],
  );
  protokoll.leere();
  fireEvent.click(document.querySelector<HTMLButtonElement>(".ki-sprachmodus__leiste button")!);
  gleich("Kein Mikrofon: der Knopf der Leiste versucht es neu, die Meldung verschwindet", [status(), meldung()], ["Mikrofon wird geöffnet …",null]);
  await abwarten();
  gleich("Kein Mikrofon: wieder verweigert", [folge(), status(), meldung()], [["mikrofon getUserMedia {\"audio\":{\"echoCancellation\":\"all\",\"noiseSuppression\":false,\"autoGainControl\":true,\"channelCount\":1,\"sampleRate\":16000}}"],"Etwas ist schiefgegangen","Kein Mikrofonzugriff. Bitte in den Browsereinstellungen erlauben."]);
  mikrofon.verweigerung = null;
  protokoll.leere();
  fireEvent.click(figur());
  await abwarten();
  await abwarten();
  await uhr.vor(0);
  gleich("Kein Mikrofon: ein Tipp auf Himbi versucht es neu, jetzt mit Erfolg", [folge(), status(), meldung()], [["bus entsperre","mikrofon getUserMedia {\"audio\":{\"echoCancellation\":\"all\",\"noiseSuppression\":false,\"autoGainControl\":true,\"channelCount\":1,\"sampleRate\":16000}}","hoeren starte","aufnahme#1 new audio/webm;codecs=opus","fetch POST /api/ki-spracherkennung","aufnahme#1 start(100)","ws#1 new wss://soniox.test/live","ws#1 open","ws#1 send {\"api_key\":\"temp-schluessel\",\"model\":\"stt-rt-v5\",\"audio_format\":\"auto\"}"],"Ich höre zu",null]);
}

async function pruefeVerbindungWeg(): Promise<void> {
  const { uhr } = await starte();
  protokoll.leere();
  await ausloesen(() => ws().scheitere());
  gleich("Verbindung weg: Ohr zu, Neuversuch in 500 ms", [folge(), status(), zeitgeber(uhr)], [["ws#1 error","ws#1 close()","aufnahme#1 stop"],"Ich höre zu",["zeitgeber 0","zeitgeber 500","intervall 5000"]]);
  protokoll.leere();
  await uhr.vor(499);
  const davor = folge();
  await uhr.vor(1);
  await abwarten();
  await uhr.vor(0);
  gleich("Neuversuch: nach 500 ms ein neues Ohr", [davor, folge(), status()], [[],["aufnahme#2 new audio/webm;codecs=opus","fetch POST /api/ki-spracherkennung","aufnahme#2 start(100)","ws#2 new wss://soniox.test/live","ws#2 open","ws#2 send {\"api_key\":\"temp-schluessel\",\"model\":\"stt-rt-v5\",\"audio_format\":\"auto\"}"],"Ich höre zu"]);
  await ausloesen(() => ws().scheitere());
  await uhr.vor(500);
  await abwarten();
  await uhr.vor(0);
  protokoll.leere();
  await ausloesen(() => ws().scheitere());
  gleich("Dritter schneller Abbruch: aufgeben mit Meldung", [folge(), meldung(), status(), zeitgeber(uhr)], [["ws#3 error","ws#3 close()","aufnahme#3 stop"],"Die Verbindung zur Spracherkennung ist abgerissen. Tippen Sie auf Himbi, um es erneut zu versuchen.","Etwas ist schiefgegangen",["zeitgeber 0"]]);
  protokoll.leere();
  fireEvent.click(figur());
  await abwarten();
  await abwarten();
  await uhr.vor(0);
  gleich("Nach dem Aufgeben: Tipp auf Himbi, das Mikrofon ist noch offen, gleich ein neues Ohr", [folge(), status(), meldung()], [["bus entsperre","aufnahme#4 new audio/webm;codecs=opus","fetch POST /api/ki-spracherkennung","aufnahme#4 start(100)","ws#4 new wss://soniox.test/live","ws#4 open","ws#4 send {\"api_key\":\"temp-schluessel\",\"model\":\"stt-rt-v5\",\"audio_format\":\"auto\"}"],"Ich höre zu",null]);
  // Alte Sitzungen melden nichts mehr.
  protokoll.leere();
  await ausloesen(() => ws(1).empfange({ tokens: [token(["Hallo", 100, 200], true), { text: "<end>", is_final: true }] }));
  gleich("Eine alte Sitzung: ihre Wörter zählen nicht", [folge("ws#1 message"), status()], [[],"Ich höre zu"]);
}

async function pruefeSchluessel(): Promise<void> {
  netz.antworte("POST /api/ki-spracherkennung", { status: 404, json: { grund: "aus" } });
  const { uhr } = await starte({ verbinden: false });
  gleich("Schlüssel 404: Live-Erkennung fehlt, Fehlerzustand ohne Neuversuch", [folge(), meldung(), status(), zeitgeber(uhr)], [["mikrofon getUserMedia {\"audio\":{\"echoCancellation\":\"all\",\"noiseSuppression\":false,\"autoGainControl\":true,\"channelCount\":1,\"sampleRate\":16000}}","hoeren starte","aufnahme#1 new audio/webm;codecs=opus","fetch POST /api/ki-spracherkennung","aufnahme#1 start(100)","aufnahme#1 stop"],"Die Live-Spracherkennung steht hier nicht zur Verfügung. Der Sprachmodus braucht sie.","Etwas ist schiefgegangen",[]]);
}

async function pruefeSchluesselNichtErreichbar(): Promise<void> {
  netz.antworte("POST /api/ki-spracherkennung", { json: SCHLUESSEL });
  netz.antworte("POST /api/ki-spracherkennung", { fehler: new TypeError("Netzfehler") }, { einmal: true });
  const { uhr } = await starte({ verbinden: false });
  gleich("Schlüssel nicht erreichbar: Neuversuch", [folge(), status(), zeitgeber(uhr)], [["mikrofon getUserMedia {\"audio\":{\"echoCancellation\":\"all\",\"noiseSuppression\":false,\"autoGainControl\":true,\"channelCount\":1,\"sampleRate\":16000}}","hoeren starte","aufnahme#1 new audio/webm;codecs=opus","fetch POST /api/ki-spracherkennung","aufnahme#1 start(100)","aufnahme#1 stop"],"Ich höre zu",["zeitgeber 500","intervall 5000"]]);
  protokoll.leere();
  await uhr.vor(500);
  await abwarten();
  await uhr.vor(0);
  gleich("Schlüssel nicht erreichbar: der Neuversuch verbindet", [folge(), status()], [["aufnahme#2 new audio/webm;codecs=opus","fetch POST /api/ki-spracherkennung","aufnahme#2 start(100)","ws#1 new wss://soniox.test/live","ws#1 open","ws#1 send {\"api_key\":\"temp-schluessel\",\"model\":\"stt-rt-v5\",\"audio_format\":\"auto\"}"],"Ich höre zu"]);
}

async function pruefeLangeStilleSitzung(): Promise<void> {
  const { uhr } = await starte();
  await uhr.vor(20_000);
  protokoll.leere();
  await ausloesen(() => ws().schliesseVonDrueben(1000));
  gleich("Lange Sitzung ohne Ton, vom Dienst geschlossen: stumm statt neu verbinden", [folge(), status(), zeitgeber(uhr)], [["ws#1 geschlossen von drüben (1000)","aufnahme#1 stop"],"Mikrofon stummgeschaltet",[]]);
  fireEvent.click(knopf("Mikrofon wieder einschalten"));
  await abwarten();
  await uhr.vor(0);
  await bisHimbiSpricht(uhr);
  await uhr.vor(20_000);
  protokoll.leere();
  await ausloesen(() => ws().schliesseVonDrueben(1000));
  gleich("Lange Sitzung, geschlossen, während Himbi spricht: neu verbinden", [folge(), status(), zeitgeber(uhr)], [["ws#2 geschlossen von drüben (1000)","aufnahme#2 stop"],"Himbi spricht",["intervall 150 in 100","zeitgeber 500"]]);
  protokoll.leere();
  fireEvent.click(knopf("Mikrofon stummschalten"));
  await uhr.vor(1000);
  gleich("Stumm während des Neuversuchs: der Neuversuch entfällt", [folge(), status(), zeitgeber(uhr)], [["bus stopp"],"Mikrofon stummgeschaltet",[]]);
}

async function pruefeNeuversuchImFehler(): Promise<void> {
  const { uhr } = await starte();
  await frage(uhr, "Wie viele Kisten?");
  await ausloesen(() => ws().scheitere());
  await chat({ einwilligungFehlt: true });
  protokoll.leere();
  await uhr.vor(500);
  gleich("Neuversuch im Fehlerzustand: kein neues Ohr", [folge(), status()], [[],"Etwas ist schiefgegangen"]);
}

async function pruefeAufnahmeScheitert(): Promise<void> {
  MediaRecorderAttrappe.scheitertBeimErzeugen = "NotSupportedError";
  const { uhr } = await starte();
  gleich("Aufnahme nicht möglich: Meldung und Fehlerzustand, keine Sitzung", [folge(), meldung(), status(), zeitgeber(uhr)], [["mikrofon getUserMedia {\"audio\":{\"echoCancellation\":\"all\",\"noiseSuppression\":false,\"autoGainControl\":true,\"channelCount\":1,\"sampleRate\":16000}}","hoeren starte"],"Kein Mikrofonzugriff. Bitte in den Browsereinstellungen erlauben.","Etwas ist schiefgegangen",[]]);
}

async function pruefeStille(): Promise<void> {
  const { uhr } = await starte();
  protokoll.leere();
  await uhr.vor(60_000);
  const t = uhr.jetzt();
  await hoere({ vorlaeufig: [["Hm", t - 500, t - 300]] });
  await uhr.vor(120_000);
  const nachHm = status();
  await uhr.vor(5_000);
  gleich("Stille: 2 Minuten nach dem letzten Wort stumm, Ohr zu", [nachHm, status(), folge(), zeitgeber(uhr)], ["Ich höre zu","Mikrofon stummgeschaltet",["ws#1 close()","aufnahme#1 stop"],[]]);
}

// ---- 10. Abbau mitten im Gespräch -------------------------------------------------------------------------------------------------
async function pruefeAbbauImVerdacht(): Promise<void> {
  const { uhr, ansicht } = await starte();
  await bisHimbiSpricht(uhr);
  await dazwischen(uhr);
  protokoll.leere();
  ansicht.unmount();
  gleich("Abbau im Verdacht: alle Zeitgeber weg, Ausgabe normal laut, alles zu", [folge(), zeitgeber(uhr), uhr.offen().bilder], [["ausgabe daempfe(1)","ws#1 close()","aufnahme#1 stop","mikrofon spur#1 stop","hoeren stoppe"],["zeitgeber 0","zeitgeber 0"],0]);
  await uhr.vor(0);
}

async function pruefeAbbauMitZeitgebern(): Promise<void> {
  const { uhr, ansicht } = await starte();
  await bisHimbiSpricht(uhr);
  await chat({ antwort: "Fertig." });
  gleich("Gnadenfrist läuft", zeitgeber(uhr), ["intervall 150","zeitgeber 300"]);
  ansicht.unmount();
  gleich("Abbau in der Gnadenfrist: der Zeitgeber ist weg", zeitgeber(uhr), ["zeitgeber 0","zeitgeber 0"]);
  await uhr.vor(1000);
  const zweite = await starte({ uhr });
  await ausloesen(() => ws().scheitere());
  zweite.ansicht.unmount();
  gleich("Abbau vor dem Neuversuch: der Zeitgeber ist weg", zeitgeber(uhr), ["zeitgeber 0","zeitgeber 0"]);
  await uhr.vor(1000);
}

async function pruefeAbbauVorDemMikrofon(): Promise<void> {
  mikrofon.verzoegerungMs = 100;
  const { uhr, ansicht } = await starte();
  ansicht.unmount();
  await uhr.vor(200);
  gleich("Abbau vor dem Mikrofon: der späte Strom wird gleich wieder geschlossen", folge(), ["mikrofon getUserMedia {\"audio\":{\"echoCancellation\":\"all\",\"noiseSuppression\":false,\"autoGainControl\":true,\"channelCount\":1,\"sampleRate\":16000}}","ausgabe daempfe(1)","hoeren stoppe","mikrofon spur#1 stop"]);
  protokoll.leere();
  mikrofon.verweigerung = "NotAllowedError";
  const zweite = await starte({ uhr });
  zweite.ansicht.unmount();
  await uhr.vor(200);
  gleich("Abbau vor dem Mikrofon, dann verweigert: keine Meldung mehr", folge(), ["mikrofon getUserMedia {\"audio\":{\"echoCancellation\":\"all\",\"noiseSuppression\":false,\"autoGainControl\":true,\"channelCount\":1,\"sampleRate\":16000}}","ausgabe daempfe(1)","hoeren stoppe"]);
}

// ---- 11. StrictMode ------------------------------------------------------------------------------------------------------------------
async function pruefeStrictMode(): Promise<void> {
  lage.tagesbeginnAn = true;
  meldeChatStand({ ...STILL });
  const { uhr, ansicht, aussen } = await starte({ strikt: true });
  gleich("StrictMode: zwei Mikrofonanfragen, die erste wird geschlossen, ein Ohr, eine Begrüßung", folge(), ["mikrofon getUserMedia {\"audio\":{\"echoCancellation\":\"all\",\"noiseSuppression\":false,\"autoGainControl\":true,\"channelCount\":1,\"sampleRate\":16000}}","ausgabe daempfe(1)","hoeren stoppe","mikrofon getUserMedia {\"audio\":{\"echoCancellation\":\"all\",\"noiseSuppression\":false,\"autoGainControl\":true,\"channelCount\":1,\"sampleRate\":16000}}","mikrofon spur#1 stop","hoeren starte","aufnahme#1 new audio/webm;codecs=opus","fetch POST /api/ki-spracherkennung","aufnahme#1 start(100)","bus frage {\"text\":\"Guten Morgen, Himbi. Was steht heute an und was ist dringend?\",\"sprachen\":[\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)","ws#1 new wss://soniox.test/live","ws#1 open","ws#1 send {\"api_key\":\"temp-schluessel\",\"model\":\"stt-rt-v5\",\"audio_format\":\"auto\"}"]);
  gleich("StrictMode: Zustand und Fokus", [status(), document.activeElement === figur(), document.documentElement.style.overflow], ["Ich schaue nach …",true,"hidden"]);
  await chat({ antwort: "Guten Morgen." });
  await uhr.vor(300);
  protokoll.leere();
  await frage(uhr, "Wie viele Kisten?");
  gleich("StrictMode: eine Frage geht genau einmal hinaus", folge(), ["bus frage {\"text\":\"Wie viele Kisten?\",\"sprachen\":[\"de\",\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"]);
  protokoll.leere();
  ansicht.unmount();
  await uhr.vor(0);
  gleich("StrictMode: Abbau, Fokus zurück, Seite frei", [folge(), document.activeElement === aussen, document.documentElement.style.overflow], [["ausgabe daempfe(1)","ws#1 close()","aufnahme#1 stop","mikrofon spur#2 stop","hoeren stoppe"],true,""]);
}

// ---- 12. Platz von Himbi: Rahmen, Blick, Ausweichen auf dem Handy ------------------------------------------------------------------
const spalte = () => document.querySelector<HTMLElement>(".ki-sprachmodus__links-spalte, .ki-sprachmodus__mitte")!;
const platz = () => {
  const s = spalte();
  return [s.className, s.getAttribute("data-ausweichen"), s.style.getPropertyValue("--sprach-y"), s.style.getPropertyValue("--sprach-max"), s.style.transition];
};
const ring = () => document.querySelector<HTMLElement>(".ki-sprachmodus__spotlight-ring")?.getAttribute("style") ?? null;

async function pruefePlatz(): Promise<void> {
  const { uhr } = await starte();
  const kopf = document.body.appendChild(document.createElement("header"));
  kopf.setAttribute("data-kopfzeile", "");
  setzeRechteck(kopf, { top: 0, width: 390, height: 56 });
  setzeRechteck(document.querySelector(".ki-sprachmodus__leiste")!, { top: 758, width: 390, height: 86 });
  Object.defineProperty(spalte(), "offsetHeight", { configurable: true, get: () => 110 });
  const ziel = document.body.appendChild(document.createElement("section"));
  ziel.id = "ziel";
  setzeRechteck(ziel, { left: 8, top: 420, width: 374, height: 180 });
  gleich("Platz: ohne Ziel in der Mitte", [platz(), ring(), himbi(), dialog().className], [["ki-sprachmodus__mitte",null,"","",""],null,"hoert/mitte/false","ki-sprachmodus"]);
  await ausloesen(() => setzeHervorhebung(ziel));
  gleich("Ziel: Rahmen darum, Himbi angedockt und mit Blick dorthin, auch beim Zuhören", [platz(), ring(), himbi(), dialog().className, document.documentElement.hasAttribute("data-sprach-links")], [["ki-sprachmodus__links-spalte",null,"","",""],"left: -8px; top: 404px; width: 406px; height: 212px;","hoert/klein/true/195,510","ki-sprachmodus ki-sprachmodus--angedockt",true]);
  await ausloesen(() => medienAbfragen.setze("(max-width: 767.98px)", true));
  const ersteLage = platz();
  await uhr.bild();
  gleich("Handy: Himbi weicht dem Rahmen aus, springt beim ersten Mal ohne Gleiten", [ersteLage, platz()], [["ki-sprachmodus__links-spalte","oben","286px","464px","none"],["ki-sprachmodus__links-spalte","oben","286px","464px",""]]);
  setzeRechteck(ziel, { left: 8, top: 100, width: 374, height: 180 });
  await ausloesen(() => window.dispatchEvent(new Event("scroll")));
  const wechsel = platz();
  await uhr.bild();
  gleich("Handy: der Rahmen wandert nach oben, Himbi springt auf die andere Seite", [wechsel, platz(), ring()], [["ki-sprachmodus__links-spalte","unten","304px","446px","none"],["ki-sprachmodus__links-spalte","unten","304px","446px",""],"left: -8px; top: 84px; width: 406px; height: 212px;"]);
  setzeRechteck(ziel, { left: 8, top: 110, width: 374, height: 180 });
  await ausloesen(() => window.dispatchEvent(new Event("resize")));
  gleich("Handy: auf derselben Seite gleitet Himbi mit", platz(), ["ki-sprachmodus__links-spalte","unten","314px","436px",""]);
  await karte("Lieferung buchen?");
  gleich("Handy: eine Freigabekarte misst neu", platz(), ["ki-sprachmodus__links-spalte","unten","314px","436px",""]);
  await karte(null);
  await ausloesen(() => medienAbfragen.setze("(max-width: 767.98px)", false));
  gleich("Kein Handy mehr: kein Ausweichen", platz(), ["ki-sprachmodus__links-spalte",null,"","",""]);
  setzeRechteck(ziel, { left: 8, top: 110, width: 0, height: 0 });
  await ausloesen(() => window.dispatchEvent(new Event("resize")));
  gleich("Ziel ohne Fläche: kein Rahmen, Himbi wieder in der Mitte", [ring(), himbi(), dialog().className], [null,"hoert/mitte/false","ki-sprachmodus"]);
  setzeRechteck(ziel, { left: 8, top: 110, width: 374, height: 180 });
  await ausloesen(() => window.dispatchEvent(new Event("resize")));
  await ausloesen(() => ziel.remove());
  gleich("Ziel aus dem Dokument genommen: kein Rahmen", [ring(), himbi()], [null,"hoert/mitte/false"]);
  await ausloesen(() => setzeHervorhebung(null));
  gleich("Keine Hervorhebung: Mitte, Leiste wieder scharf", [ring(), himbi(), dialog().className, document.documentElement.hasAttribute("data-sprach-links")], [null,"hoert/mitte/false","ki-sprachmodus",false]);
}

// ---- 13. Mitlesen ----------------------------------------------------------------------------------------------------------------
async function pruefeMitlesen(): Promise<void> {
  const { uhr } = await starte();
  const stelle = document.body.appendChild(document.createElement("p"));
  stelle.id = "stelle";
  const ueberschrift = document.body.appendChild(document.createElement("h2"));
  ueberschrift.id = "lager";
  await bisHimbiSpricht(uhr, "Was steht an?", "Erster Satz. Zweiter Satz mit Lager.");
  protokoll.leere();
  const wurzel = dialog();
  lage.gerade = { index: 0, anzahl: 2, satz: "Erster Satz.", vorher: null, ziel: { el: stelle, ziel: { art: "bereich", schluessel: "lager" } } as never };
  await uhr.vor(150);
  gleich("Mitlesen: ein Satz mit Marke zeigt seine Stelle", [folge(), wurzel.dataset.satzJetzt, wurzel.dataset.satzIndex], [["mitlesen loese stelle","mitlesen zeige stelle"],"Erster Satz.","0"]);
  await uhr.vor(300);
  gleich("Mitlesen: derselbe Satz zeigt sie nicht noch einmal", folge(), ["mitlesen loese stelle","mitlesen zeige stelle"]);
  lage.gerade = { index: 1, anzahl: 2, satz: null, vorher: "Erster Satz." };
  await uhr.vor(150);
  gleich("Mitlesen: in der Sprechpause bleibt alles stehen", [folge(), wurzel.dataset.satzJetzt, wurzel.dataset.satzIndex], [["mitlesen loese stelle","mitlesen zeige stelle"],"Erster Satz.","0"]);
  lage.gerade = { index: 1, anzahl: 2, satz: "Zweiter Satz mit Lager.", vorher: "Erster Satz." };
  await uhr.vor(150);
  gleich("Mitlesen: nach einer Marke sucht ein Satz ohne Marke keine Überschrift", [folge(), wurzel.dataset.satzJetzt, wurzel.dataset.satzIndex], [["mitlesen loese stelle","mitlesen zeige stelle"],"Zweiter Satz mit Lager.","1"]);
  lage.gerade = { index: 2, anzahl: 3, satz: "Dritter Satz.", vorher: "Zweiter Satz mit Lager.", ziel: { el: null, ziel: { art: "bereich", schluessel: "weg" } } as never };
  await uhr.vor(150);
  gleich("Mitlesen: eine Marke ohne Element zeigt nichts", folge(), ["mitlesen loese stelle","mitlesen zeige stelle","mitlesen loese -"]);
  await naechsteAntwort(uhr, "Und das Lager?", "Im Lager stehen Kisten.");
  protokoll.leere();
  lage.ueberschrift = ueberschrift;
  lage.gerade = { index: 0, anzahl: 1, satz: "Im Lager stehen Kisten.", vorher: null };
  await uhr.vor(150);
  gleich("Mitlesen: ohne Marke in der Antwort zeigt eine genannte Überschrift die Stelle", folge(), ["mitlesen ueberschrift Im Lager stehen Kisten.","mitlesen zeige lager"]);
  lage.gerade = null;
  await uhr.vor(150);
  gleich("Mitlesen: ohne Stimme nichts", folge(), ["mitlesen ueberschrift Im Lager stehen Kisten.","mitlesen zeige lager"]);
  await chat({ antwort: "" });
  await uhr.vor(300);
  gleich("Mitlesen: beim Zuhören läuft kein Takt", [zeitgeber(uhr), wurzel.dataset.satzJetzt], [["intervall 5000"],"Im Lager stehen Kisten."]);
}

// ---- 14. Sprechertrennung ----------------------------------------------------------------------------------------------------------
async function pruefeSprechertrennung(): Promise<void> {
  const { uhr } = await starte();
  protokoll.leere();
  let t = uhr.jetzt();
  await uhr.vor(1500);
  await hoere({ endgueltig: [["Zeig", t + 100, t + 300, "1"], ["mir", t + 400, t + 600, "1"], ["Kaffee", t + 700, t + 900, "2"], ["Aufgaben", t + 1000, t + 1200, "1"]], ende: true });
  gleich("Sprecher: nur die Wörter des Hauptsprechers bilden die Frage", folge(), ["bus frage {\"text\":\"Zeig mir Aufgaben\",\"sprachen\":[\"de\",\"de\",\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"]);
  await chat({ antwort: "Hier." });
  await uhr.vor(300);
  protokoll.leere();
  t = uhr.jetzt();
  await uhr.vor(1000);
  await hoere({ endgueltig: [["Mittagspause", t + 100, t + 500, "2"], ["jetzt", t + 600, t + 800, "2"]], ende: true });
  gleich("Sprecher: was nur andere sagen, ist keine Frage", [folge(), status()], [[],"Ich höre zu"]);
  t = uhr.jetzt();
  await uhr.vor(1000);
  await hoere({ endgueltig: [["Danke", t + 100, t + 300, "1"]], ende: true });
  gleich("Sprecher: der Hauptsprecher fragt weiter", folge(), ["bus frage {\"text\":\"Danke\",\"sprachen\":[\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"]);
  await chat({ antwort: "Gern." });
  await uhr.vor(300);
  fireEvent.click(knopf("Mikrofon stummschalten"));
  fireEvent.click(knopf("Mikrofon wieder einschalten"));
  await abwarten();
  await uhr.vor(0);
  protokoll.leere();
  t = uhr.jetzt();
  await uhr.vor(1000);
  await hoere({ endgueltig: [["Hallo", t + 100, t + 300, "2"], ["Himbi", t + 400, t + 600, "2"]], ende: true });
  gleich("Sprecher: eine neue Sitzung beginnt ohne Hauptsprecher", folge(), ["bus frage {\"text\":\"Hallo Himbi\",\"sprachen\":[\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"]);
}

// ---- 15. Endpunkte während Himbi spricht: Echo und Gnadenfrist ------------------------------------------------------------------------
async function pruefeEndpunktBeimSprechen(): Promise<void> {
  const { uhr } = await starte();
  lage.gerade = { index: 0, anzahl: 1, satz: HIMBI_SATZ, vorher: null };
  await bisHimbiSpricht(uhr);
  protokoll.leere();
  let t = uhr.jetzt();
  await uhr.vor(1000);
  await hoere({ endgueltig: satz("Es sind zwölf", t + 100), ende: true });
  gleich("Endpunkt im Echo: keine Frage, Himbi spricht weiter", [folge(), status()], [["mitlesen ueberschrift Es sind zwölf Kisten im Lager, halt nur zwei offen."],"Himbi spricht"]);
  lage.gerade = null;
  await chat({ antwort: HIMBI_SATZ });
  gleich("Gnadenfrist läuft nach dem Echo", zeitgeber(uhr), ["intervall 150 in 50", "zeitgeber 300"]);
  protokoll.leere();
  t = uhr.jetzt();
  await uhr.vor(200);
  await hoere({ endgueltig: [["Danke", t + 100, t + 190]], ende: true });
  gleich("Endpunkt in der Gnadenfrist: das war der Nutzer, sofort zuhören und fragen", [folge(), status(), zeitgeber(uhr)], [["bus frage {\"text\":\"Danke\",\"sprachen\":[\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"],"Ich schaue nach …",["intervall 150"]]);
}

// ---- 16. Ränder: Zeitpunkte und Zweige, die selten zusammenkommen -------------------------------------------------------------------
async function pruefeRaenderBedienung(): Promise<void> {
  const { uhr } = await starte();
  await bisHimbiSpricht(uhr);
  await chat({ antwort: "Es sind zwölf Kisten im Lager." });
  protokoll.leere();
  lage.gerade = { index: 1, anzahl: 2, satz: null, vorher: "Es sind zwölf Kisten im Lager." };
  fireEvent.click(figur());
  await uhr.vor(300);
  gleich("Tipp in der Gnadenfrist: still, die abgelaufene Frist ändert nichts mehr", [folge(), status(), zeitgeber(uhr)], [["bus entsperre","bus stopp"],"Ich höre zu",["intervall 5000 in 4700"]]);
  await frage(uhr, "Und morgen?");
  gleich("Tipp in einer Sprechpause: der vorige Satz gilt als unterbrochen", folge(), ["bus entsperre","bus stopp","bus frage {\"text\":\"Und morgen?\",\"sprachen\":[\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":\"Es sind zwölf Kisten im Lager.\"}","ausgabe daempfe(1)"]);
  aufnahme().stop = () => {
    throw new DOMException("schon gestoppt", "InvalidStateError");
  };
  protokoll.leere();
  fireEvent.click(knopf("Mikrofon stummschalten"));
  gleich("Stumm: wirft die Aufnahme beim Stoppen, geht es trotzdem weiter", [folge(), status()], [["bus stopp","ws#1 close()"],"Mikrofon stummgeschaltet"]);
}

async function pruefeRaenderBefehle(): Promise<void> {
  const { uhr } = await starte();
  await bisHimbiSpricht(uhr);
  protokoll.leere();
  let t = uhr.jetzt();
  await hoere({ vorlaeufig: [["Stopp", t + 100, t + 300]] });
  fireEvent.click(figur());
  await uhr.vor(400);
  gleich("Vorläufiges Stopp, dann ein Tipp: der Zeitgeber läuft ins Leere", [folge(), status()], [["bus entsperre","bus stopp"],"Ich höre zu"]);
  await hoere({ endgueltig: [["Stopp", t + 100, t + 300]], ende: true });
  await naechsteAntwort(uhr, "Was noch?", "Nichts weiter.");
  t = uhr.jetzt();
  await uhr.vor(500);
  await hoere({ endgueltig: [["Stopp", t + 100, t + 300]] });
  await karte("Lieferung buchen?");
  protokoll.leere();
  await uhr.vor(1500);
  await hoere({ endgueltig: satz("zeig mir die Lieferungen", t + 400), ende: true });
  gleich("Nach einem Stopp bei offener Karte: das Befehlswort bleibt, die Frage lehnt die Karte ab", [folge(), status()], [["bus freigabe nein (Lieferung buchen?)","bus frage {\"text\":\"Stopp zeig mir die Lieferungen\",\"sprachen\":[\"de\",\"de\",\"de\",\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"],"Ich schaue nach …"]);
  await karte(null);
  // Fehler im Chat und neuer Text im selben Takt: der Text trifft schon den Fehlerzustand.
  await chat({ beschaeftigt: true, antwort: "" });
  protokoll.leere();
  t = uhr.jetzt();
  await uhr.vor(500);
  await ausloesen(() => {
    meldeChatStand({ ...STILL, einwilligungFehlt: true });
    ws().empfange({ tokens: [token(["und", t + 100, t + 200], true), token(["dann", t + 250, t + 400], true), { text: "<end>", is_final: true }] });
  });
  gleich("Fehler und Text im selben Takt: keine Frage, kein Nachsatz", [folge(), status()], [["ws#1 close()","aufnahme#1 stop"],"Etwas ist schiefgegangen"]);
}

async function pruefeRaenderKarte(): Promise<void> {
  const { uhr } = await starte();
  await bisHimbiSpricht(uhr, "Buch die Lieferung", "Ich buche sie jetzt.");
  await karte(KARTE);
  protokoll.leere();
  let t = uhr.jetzt();
  await uhr.vor(500);
  await hoere({ endgueltig: [["Ja,", t + 100, t + 200], ["bitte.", t + 250, t + 400]], ende: true });
  gleich("Karte beim Sprechen ohne klingenden Satz: Himbis Antwort ist das Echo, das Ja zählt", [folge(), status()], [["bus freigabe ja (Aufgabe Kisten zählen anlegen?)"],"Himbi spricht"]);
  await karte(null);
  await karte("Noch eine Karte?");
  protokoll.leere();
  await ausloesen(() => ws().scheitere());
  await uhr.vor(500);
  await abwarten();
  await uhr.vor(0);
  t = uhr.jetzt();
  await uhr.vor(500);
  await hoere({ endgueltig: [["Nein.", 100, 300]], ende: true });
  gleich("Neue Sitzung bei offener Karte: die Karte gilt ab dem Beginn der neuen Audiozeit", [folge(), status()], [["ws#1 error","ws#1 close()","aufnahme#1 stop","aufnahme#2 new audio/webm;codecs=opus","fetch POST /api/ki-spracherkennung","aufnahme#2 start(100)","ws#2 new wss://soniox.test/live","ws#2 open","ws#2 send {\"api_key\":\"temp-schluessel\",\"model\":\"stt-rt-v5\",\"audio_format\":\"auto\"}","bus freigabe nein (Noch eine Karte?)"],"Himbi spricht"]);
}

async function pruefeRaenderVerdacht(): Promise<void> {
  const { uhr } = await starte();
  lage.gerade = { index: 0, anzahl: 1, satz: HIMBI_SATZ, vorher: null };
  await bisHimbiSpricht(uhr);
  await uhr.vor(4000);
  protokoll.leere();
  let t = uhr.jetzt();
  await dazwischen(uhr);
  await hoere({ endgueltig: [["Aufgaben", t + 50, t + 400]], ende: true });
  gleich("Verdacht: ein Wort mit Inhalt am Endpunkt unterbricht und ist gleich die Frage", [folge(), status()], [["ausgabe daempfe(0.3)","bus stopp","bus frage {\"text\":\"Aufgaben\",\"sprachen\":[\"de\"],\"ersetzt\":false,\"unterbrochen\":\"Es sind zwölf Kisten im Lager, halt nur zwei offen.\"}","ausgabe daempfe(1)"],"Ich schaue nach …"]);
  await naechsteAntwort(uhr, "Und dann?");
  await uhr.vor(4000);
  protokoll.leere();
  t = uhr.jetzt();
  await hoere({ endgueltig: satz("zeig mir die Aufgaben", t + 50) });
  const vorher = [folge(), status()];
  await dazwischen(uhr);
  gleich("Verdacht: liegen die Wörter schon vor, entscheiden sie sofort", [vorher, folge(), status()], [[[],"Himbi spricht"],["ausgabe daempfe(0.3)","bus stopp"],"Ich höre zu"]);
  await uhr.vor(1500);
  await hoere({ ende: true });
  await naechsteAntwort(uhr, "Leg sie an");
  await uhr.vor(4000);
  protokoll.leere();
  await dazwischen(uhr);
  await karte("Aufgabe anlegen?");
  const frist = uhr.zeitgeber().find((z) => z.ms === 1800)!.inMs;
  await uhr.vor(frist);
  gleich("Verdacht: steht bei Fristende eine Karte, endet der Verdacht ohne Urteil", [folge(), status()], [["ausgabe daempfe(0.3)","ausgabe daempfe(1)"],"Himbi spricht"]);
}

async function pruefeRaenderPlatz(): Promise<void> {
  const { uhr } = await starte();
  const kopf = document.body.appendChild(document.createElement("header"));
  kopf.setAttribute("data-kopfzeile", "");
  setzeRechteck(kopf, { top: 0, width: 390, height: 0 });
  setzeRechteck(document.querySelector(".ki-sprachmodus__leiste")!, { top: 758, width: 390, height: 86 });
  Object.defineProperty(spalte(), "offsetHeight", { configurable: true, get: () => 110 });
  const ziel = document.body.appendChild(document.createElement("section"));
  setzeRechteck(ziel, { left: 8, top: 60, width: 374, height: 120 });
  await ausloesen(() => medienAbfragen.setze("(max-width: 767.98px)", true));
  await ausloesen(() => setzeHervorhebung(ziel));
  await uhr.bild();
  gleich("Handy, Kopfzeile ohne Höhe: Himbi darf bis an den oberen Rand", platz(), ["ki-sprachmodus__links-spalte","unten","204px","546px",""]);
  kopf.remove();
  setzeRechteck(ziel, { left: 8, top: 400, width: 374, height: 120 });
  await ausloesen(() => window.dispatchEvent(new Event("scroll")));
  await uhr.bild();
  gleich("Handy, ohne Kopfzeile: über dem Rahmen", platz(), ["ki-sprachmodus__links-spalte","oben","266px","484px",""]);
  await ausloesen(() => setzeHervorhebung(null));
}

async function pruefeRaenderSprechpause(): Promise<void> {
  const { uhr } = await starte();
  lage.gerade = { index: 1, anzahl: 2, satz: null, vorher: HIMBI_SATZ };
  await bisHimbiSpricht(uhr);
  protokoll.leere();
  let t = uhr.jetzt();
  await uhr.vor(500);
  await hoere({ endgueltig: [["halt", t + 100, t + 300]] });
  gleich("Sprechpause: der vorige Satz zählt als Echo", [folge(), status()], [[],"Himbi spricht"]);
  await uhr.vor(500);
  t = uhr.jetzt();
  await dazwischen(uhr);
  await hoere({ endgueltig: [["Mhm", t + 100, t + 300]], ende: true });
  gleich("Sprechpause im Verdacht: 'Mhm' bleibt Rückmeldung", [folge(), status()], [["ausgabe daempfe(0.3)","ausgabe daempfe(1)"],"Himbi spricht"]);
  await karte("Karte in der Pause?");
  protokoll.leere();
  t = uhr.jetzt();
  await uhr.vor(500);
  await hoere({ endgueltig: [["Ja.", t + 100, t + 300]], ende: true });
  gleich("Sprechpause, Karte: 'Ja.' gibt frei", [folge(), status()], [["bus freigabe ja (Karte in der Pause?)"],"Himbi spricht"]);
}

/** Endgültige Wörter ohne Zeitangaben (Soniox lässt sie selten weg): sie zählen immer mit. */
const ohneZeit = (...woerter: string[]) => woerter.map((w) => ({ text: ` ${w}`, is_final: true, language: "de" }));
const ENDE = { text: "<end>", is_final: true };

async function pruefeOhneZeitKarte(): Promise<void> {
  const { uhr } = await starte();
  await bisHimbiSpricht(uhr);
  await karte(KARTE);
  protokoll.leere();
  await uhr.vor(500);
  await ausloesen(() => ws().empfange({ tokens: [...ohneZeit("Stopp"), ENDE] }));
  gleich("Ohne Zeitangabe, Karte beim Sprechen: 'Stopp' lehnt ab, der Endpunkt noch einmal", [folge(), status()], [["bus freigabe nein (Aufgabe Kisten zählen anlegen?)","bus freigabe nein (Aufgabe Kisten zählen anlegen?)"],"Himbi spricht"]);
}

async function pruefeOhneZeitJa(): Promise<void> {
  const { uhr } = await starte();
  await frage(uhr, "Leg sie an");
  await chat({ beschaeftigt: true, antwort: "Gleich." });
  await karte(KARTE);
  protokoll.leere();
  await uhr.vor(500);
  await ausloesen(() => ws().empfange({ tokens: [...ohneZeit("Ja."), ENDE] }));
  gleich("Ohne Zeitangabe, Karte: 'Ja.' gibt frei", [folge(), status()], [["bus freigabe ja (Aufgabe Kisten zählen anlegen?)"],"Ich warte auf Ihr Ja oder Nein"]);
}

async function pruefeOhneZeitStopp(): Promise<void> {
  const { uhr } = await starte();
  await bisHimbiSpricht(uhr);
  protokoll.leere();
  await uhr.vor(500);
  await ausloesen(() => ws().empfange({ tokens: ohneZeit("Stopp") }));
  gleich("Ohne Zeitangabe: 'Stopp' unterbricht", [folge(), status()], [["bus stopp"],"Ich höre zu"]);
  protokoll.leere();
  await ausloesen(() => ws().empfange({ tokens: [...ohneZeit("zeig", "mir", "alles"), ENDE] }));
  gleich("Ohne Zeitangabe: nach dem Stopp die Frage", folge(), ["bus frage {\"text\":\"zeig mir alles\",\"sprachen\":[\"de\",\"de\",\"de\",\"de\"],\"ersetzt\":false,\"unterbrochen\":null}","ausgabe daempfe(1)"]);
}

// ---- 17. Reihenfolge der Effekte ---------------------------------------------------------------------------------------------------
// SprachmodusInhalt ruft seine Hooks in der Reihenfolge auf, in der ihre Effekte laufen müssen (Kopf von sprachmodus.tsx). Die Fälle
// oben bemerken nicht jede Vertauschung: useAbbau vor useTagesbeginn blieb dort grün. Deshalb werden hier React.useEffect und
// React.useLayoutEffect für das erste Einhängen umhüllt. Jede Anmeldung aus SprachmodusInhalt bekommt den Namen des Hooks, den
// SprachmodusInhalt selbst gerufen hat (aus dem Aufrufstapel; so zählt der Effekt von useHervorhebungsRechteck zu usePlatzVonHimbi),
// und jede Ausführung wird mitgeschrieben. Effekte der Teilkomponenten und aus Bibliotheken (node_modules) zählen nicht mit.
type EffektArt = "useEffect" | "useLayoutEffect";
type EffektHook = (anlegen: EffectCallback, abhaengig?: DependencyList) => void;

/** Die Effekte aus SprachmodusInhalt beim ersten Rendern, in der Reihenfolge der Hook-Aufrufe. */
const SOLL_ANMELDUNG = [
  "useMikrofon useEffect",
  "useSprachOhr useEffect",
  "useSprachOhr useEffect",
  "useSprachOhr useEffect",
  "useSprachOhr useEffect",
  "useLautstaerkeWaechter useEffect",
  "useLautstaerkeWaechter useEffect",
  "useChatKopplung useEffect",
  "useTagesbeginn useEffect",
  "useAbbau useEffect",
  "useSprachBedienung useEffect",
  "useSprachBedienung useEffect",
  "useScrollSperre useEffect",
  "useDialogFokus useLayoutEffect",
  "useDialogFokus useEffect",
  "usePlatzVonHimbi useEffect",
  "usePlatzVonHimbi useLayoutEffect",
  "useMitlesen useEffect",
  "useLeisteUnscharf useEffect",
];
/** Beim Einhängen führt React erst alle Layout-Effekte aus, dann die übrigen, jeweils in der Reihenfolge der Anmeldung. */
const SOLL_AUSFUEHRUNG = [...SOLL_ANMELDUNG.filter((e) => e.endsWith(" useLayoutEffect")), ...SOLL_ANMELDUNG.filter((e) => e.endsWith(" useEffect"))];

/** Der Hook, den SprachmodusInhalt gerufen hat und in dem (selbst oder in einem Hook darunter) der Effekt angemeldet wird. null, wenn
 *  SprachmodusInhalt nicht auf dem Stapel steht (Teilkomponenten, Provider) oder der Hook aus einer Bibliothek kommt. */
function hookAusSprachmodus(): string | null {
  const limit = Error.stackTraceLimit;
  const bereiten = Error.prepareStackTrace;
  try {
    Error.stackTraceLimit = 50;
    Error.prepareStackTrace = (_fehler, rahmen) => rahmen;
    const halter: { stack?: unknown } = {};
    Error.captureStackTrace(halter, hookAusSprachmodus);
    const rahmen = halter.stack as NodeJS.CallSite[];
    const inhalt = rahmen.findIndex((r) => r.getFunctionName() === "SprachmodusInhalt");
    if (inhalt < 0) return null;
    // rahmen[0] ist die Hülle um useEffect bzw. useLayoutEffect, rahmen[inhalt - 1] der Hook, den SprachmodusInhalt gerufen hat.
    if (inhalt < 2) return "SprachmodusInhalt";
    const hook = rahmen[inhalt - 1]!;
    if ((hook.getFileName() ?? "").includes("node_modules")) return null;
    return hook.getFunctionName() ?? "(ohne Namen)";
  } finally {
    Error.stackTraceLimit = limit;
    Error.prepareStackTrace = bereiten;
  }
}

async function pruefeEffektReihenfolge(): Promise<void> {
  // Der Standardimport ist das Exportobjekt von react selbst; die Module lesen useEffect bei jedem Aufruf dort ab.
  const react = React as unknown as Record<EffektArt, EffektHook>;
  const echt: Record<EffektArt, EffektHook> = { useEffect: react.useEffect, useLayoutEffect: react.useLayoutEffect };
  const anmeldungen: string[] = [];
  const ausgefuehrt: number[] = [];
  let ersteRunde = -1;
  const huelle = (art: EffektArt): EffektHook =>
    function effektHuelle(anlegen, abhaengig) {
      const hook = hookAusSprachmodus();
      if (hook === null) return echt[art](anlegen, abhaengig);
      const nr = anmeldungen.push(`${hook} ${art}`) - 1;
      echt[art](() => {
        // Die erste Ausführung schließt das erste Rendern ab: alles bis hierher ist dessen Anmeldung.
        if (ersteRunde < 0) ersteRunde = anmeldungen.length;
        ausgefuehrt.push(nr);
        return anlegen();
      }, abhaengig);
    };
  react.useEffect = huelle("useEffect");
  react.useLayoutEffect = huelle("useLayoutEffect");
  try {
    await starte();
  } finally {
    react.useEffect = echt.useEffect;
    react.useLayoutEffect = echt.useLayoutEffect;
  }
  const angemeldet = anmeldungen.slice(0, ersteRunde < 0 ? anmeldungen.length : ersteRunde);
  gleich("Effekte: SprachmodusInhalt meldet sie beim ersten Rendern in dieser Reihenfolge an", angemeldet, SOLL_ANMELDUNG);
  gleich(
    "Effekte: beim Einhängen laufen sie in dieser Reihenfolge (erst die Layout-Effekte)",
    ausgefuehrt.filter((nr) => nr < angemeldet.length).map((nr) => anmeldungen[nr]),
    SOLL_AUSFUEHRUNG,
  );
}

async function main(): Promise<void> {
  const geladen = await import("@/components/ki/sprachmodus");
  Sprachmodus = geladen.Sprachmodus;
  const konsole = beobachteKonsole();
  const faelle: [string, () => Promise<void>][] = [
    ["start", pruefeStartUndFrage],
    ["untertitel", pruefeUntertitel],
    ["untertitel-gesperrt", pruefeUntertitelSpeicherGesperrt],
    ["tipp", pruefeTippUndTasten],
    ["stumm", pruefeStumm],
    ["wortbefehle", pruefeWortbefehle],
    ["befehle-nachdenken", pruefeBefehleBeimNachdenkenUndZuhoeren],
    ["beenden-zuhoeren", pruefeBeendenBeimZuhoeren],
    ["tschuess", pruefeTschuessMittenInDerAntwort],
    ["dazwischen", pruefeDazwischenreden],
    ["freigabe", pruefeFreigabe],
    ["beenden-karte", pruefeBeendenBeiKarte],
    ["chat-fehler", pruefeChatFehler],
    ["tagesbeginn", pruefeTagesbeginn],
    ["tagesbeginn-entfaellt", pruefeTagesbeginnEntfaellt],
    ["kein-mikrofon", pruefeKeinMikrofon],
    ["verbindung-weg", pruefeVerbindungWeg],
    ["schluessel-404", pruefeSchluessel],
    ["schluessel-netz", pruefeSchluesselNichtErreichbar],
    ["lange-stille-sitzung", pruefeLangeStilleSitzung],
    ["neuversuch-im-fehler", pruefeNeuversuchImFehler],
    ["aufnahme-scheitert", pruefeAufnahmeScheitert],
    ["stille", pruefeStille],
    ["abbau-verdacht", pruefeAbbauImVerdacht],
    ["abbau-zeitgeber", pruefeAbbauMitZeitgebern],
    ["abbau-mikrofon", pruefeAbbauVorDemMikrofon],
    ["strictmode", pruefeStrictMode],
    ["platz", pruefePlatz],
    ["mitlesen", pruefeMitlesen],
    ["sprecher", pruefeSprechertrennung],
    ["endpunkt-sprechen", pruefeEndpunktBeimSprechen],
    ["raender-bedienung", pruefeRaenderBedienung],
    ["raender-befehle", pruefeRaenderBefehle],
    ["raender-karte", pruefeRaenderKarte],
    ["raender-verdacht", pruefeRaenderVerdacht],
    ["raender-platz", pruefeRaenderPlatz],
    ["raender-sprechpause", pruefeRaenderSprechpause],
    ["ohne-zeit-karte", pruefeOhneZeitKarte],
    ["ohne-zeit-ja", pruefeOhneZeitJa],
    ["ohne-zeit-stopp", pruefeOhneZeitStopp],
    ["effekt-reihenfolge", pruefeEffektReihenfolge],
  ];
  for (const [name, fall] of faelle) {
    if (process.env.FALL && process.env.FALL !== name) continue;
    await neuerFall();
    await fall();
    pruefe(`${name}: keine Meldung aus jsdom`, umgebungsFehler.length === 0, json(umgebungsFehler));
  }
  konsole.stoppe();
  pruefe("Konsole: keine Fehler und Warnungen von React", konsole.fehler.length === 0 && konsole.warnungen.length === 0, json([...konsole.fehler, ...konsole.warnungen]).slice(0, 1500));
  beendeUmgebung();
  ende();
}

main().catch((e: unknown) => {
  // Die Konsole kann noch abgefangen sein (beobachteKonsole): direkt auf stderr.
  process.stderr.write(`FAIL  Ausnahme ${e instanceof Error ? e.stack : String(e)}
`);
  process.exit(1);
});
