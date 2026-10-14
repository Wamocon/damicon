import {
  abwarten,
  ausloesen,
  beendeUmgebung,
  beobachteKonsole,
  erzeugeNavigation,
  erzeugeStrom,
  ersetzeModule,
  fenster,
  fireEvent,
  installiereUhr,
  medienAbfragen,
  netz,
  NEXT_MODULE,
  protokoll,
  pruefer,
  rendereMitTexten,
  screen,
  setzeAdresse,
  setzeFenster,
  setzeRechteck,
  setzeUmgebungZurueck,
  umgebungsFehler,
  type StromAttrappe,
  type Uhr,
} from "./hilfen/dom-umgebung";
import { StrictMode, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import {
  abonniereSprachBus,
  entscheideFreigabe,
  entsperreTon,
  leseChatStand,
  leseFreigabeAnfrage,
  leseGerade,
  meldeFreigabeAnfrage,
  stelleSprachFrage,
  unterbrichChat,
} from "@/components/ki/sprachmodus-bus";
import type { KiChatNachrichtZeile } from "@/lib/domain/ki-assistent";
import type { Pruefbereich } from "@/lib/pruefung/rollen";
import type { Role } from "@/lib/rbac";

// Charakterisierung von KiChat (components/ki/ki-chat.tsx) und KiPane (components/ki/ki-pane.tsx) vor dem Zerlegen, ohne Browser
// und ohne Netz (seit 14.10.2026). Gespielt wird in der DOM-Umgebung (hilfen/dom-umgebung.tsx) mit steuerbarer Uhr und dem echten
// useChat des AI SDK, das seine Antwort als Strom aus der fetch-Attrappe liest:
//   1. Leerer Verlauf: Begrüßung, Vorschläge je Rolle und Modus, Einwilligung, Stand an den Sprachmodus.
//   2. Geladener Verlauf: Nutzer- und Assistentennachrichten, Markdown mit Zitat, Quellen, Vorlesen-Knopf.
//   3. Senden und Antwortstrom in Stücken: Körper der Anfrage, Text, Werkzeugschritte (läuft, fertig, Fehler), Quellen, Status.
//   4. Agent-Modus: Werkzeugergebnisse öffnen ihre Ansicht (fuehreZu), Aktionen laden die Seite neu.
//   5. und 6. Aktionskarte: Freigabe im Chat und über den Sprachmodus-Bus, Ablehnen mit Grund, automatische Folgeanfrage.
//   7. Klickfreigabe eines Client-Werkzeugs: Karte, Meldung an den Bus, Ergebnis geht automatisch zurück.
//   8. Fehler (Sitzung, Berechtigung, allgemein, Netz, zu lang mit Neubeginn) und eine neue Frage danach.
//   9. Abbruch mit dem Stopp-Knopf.
//   10. Diktat: Mikrofon-Rückrufe, Anhängen an das Getippte, Sprachen der Frage.
//   11. und 12. Fragen von außen: Vorgabe von Himbi, Anstoss mit Prüfbezug, Kacheln des Bezugs.
//   13. Sprachmodus: Frage über den Bus, gekürzter Verlauf, Seitenkarte, Takt der Navigation, Unterbrechen, Nachsatz, Stopp.
//   14. Scrollen: Mitlaufen, Knopf "Zum Neuesten".
//   15. Abbau: Stand, Takt und Bus werden freigegeben.
//   16. bis 21. KiPane: verfügbar, zu und offen, Kopfknöpfe und Ansichten, Agent-Schalter, Bühne, Handy (Mehr, Griff, Escape,
//       Sperre), vorübergehende Breite für die Prüfung, Anstoss holt den Chat, ohne Agent-Anbieter.
//   22. bis 28. (seit der Gegenprüfung vom 14.10.2026, gegen veraltete Closures und vertauschte Effekte): Moduswechsel zwischen
//       Frage und Freigabe per Klick und Bus, Ziel, Aktion und neue Freigabekarte in einem Drosseltakt (Reihenfolge der Effekte),
//       Stopp mit offenem Werkzeug und die Frage danach, Scrollen bei Freigabe und jeder Abhängigkeit, Sprachmodus (Leerzustand,
//       Statuszeile, Ausschnitt des Verlaufs vor und nach einem Neubeginn) und ein Durchlauf unter React.StrictMode.
// Festgehalten werden DOM-Ausschnitte (Klassen, data- und aria-Attribute), Texte, die Aufruffolgen an die Nachbarn (KI-Pane-Kontext,
// Sprache, Takt, Haustier, ui-steuerung, Router) und die Anfragen an /api/ki-assistent in Reihenfolge und Inhalt. Ersetzt sind
// nur Nachbarn: ki-pane-kontext, ki-chat-sprache, sprach-takt, ui-steuerung, sprachausgabe, Haustier, Persona, Mikrofon, Quellen,
// Himbeere und die Formulare. Chat (AI SDK), Segmentierung, Werkzeug-Hook, Composer, Aktionskarte und Sprachmodus-Bus laufen echt.
// Nicht nachstellbar ohne Browser: Layout und Scrollhöhen (gesetzt), echte Server Actions, der Ton.
// Aufruf: npm run test:ki-chat

const { pruefe, ende } = pruefer();
// Eine Funktion würde sonst zu null (im Array) oder verschwände (im Objekt), und ein DOM-Element bräche JSON.stringify mit
// "Converting circular structure" ab: beide erscheinen benannt, so dass ein Vergleich mit null scheitert statt zu bestehen.
const json = (wert: unknown) =>
  JSON.stringify(wert, (_, w: unknown) => {
    if (typeof w === "function") return `[Funktion ${w.name || "ohne Namen"}]`;
    if (w instanceof fenster.Element) return `[Element ${w.tagName.toLowerCase()}]`;
    return w;
  });
const gleich = (name: string, ist: unknown, soll: unknown) => pruefe(name, json(ist) === json(soll), json(ist) === json(soll) ? "" : `ist ${json(ist)}`);
const notiere = (quelle: string, text: string) => protokoll.notiere(quelle, text);
/** Die Folge seit der letzten Leerung, nur aus den genannten Quellen. */
const folge = (...quellen: string[]) => protokoll.eintraege.filter((e) => quellen.some((q) => e.startsWith(`${q} `)));

// ---- Lage der Nachbarn ----------------------------------------------------------------------------------------------------------
interface UiUmgebung {
  agentModus: boolean;
  bestaetigen: (anfrage: { absicht: string; label: string; grund: string }) => Promise<boolean>;
}
interface Lage {
  verfuegbar: boolean;
  offen: boolean;
  modus: "assistent" | "agent";
  darstellung: "seite" | "buehne";
  fuehrung: { ziel: string; label: string } | null;
  pruefBezug: { id: string; kontext: string } | null;
  anstoss: { nr: number; frage: string; zurPruefung: boolean } | null;
  sprachmodus: boolean;
  sprachmodusMoeglich: boolean;
  rolle: Role;
  vorgabe: { id: number; text: string } | null;
  haustierPhase: string;
  phase: "still" | "laedt" | "spricht";
  liest: string | null;
  diktiert: boolean;
  stimme: boolean;
  strom: boolean;
  marke: number | null;
  uiWerkzeug: (name: string, eingabe: Record<string, unknown>, umgebung: UiUmgebung) => Promise<unknown>;
}
const LAGE: Lage = {
  verfuegbar: true,
  offen: true,
  modus: "assistent",
  darstellung: "seite",
  fuehrung: null,
  pruefBezug: null,
  anstoss: null,
  sprachmodus: false,
  sprachmodusMoeglich: true,
  rolle: "admin",
  vorgabe: null,
  haustierPhase: "ruhe",
  phase: "still",
  liest: null,
  diktiert: false,
  stimme: true,
  strom: false,
  marke: 3,
  uiWerkzeug: async () => ({ ok: true }),
};
const lage: Lage = { ...LAGE };
const hoerer = new Set<() => void>();
let fassung = 0;
const abonniere = (h: () => void) => {
  hoerer.add(h);
  return () => void hoerer.delete(h);
};
const useLage = () => useSyncExternalStore(abonniere, () => fassung, () => fassung);
/** Ändert die Lage und lässt alles, was sie liest, neu rendern. */
const setze = (teil: Partial<Lage>) =>
  ausloesen(() => {
    Object.assign(lage, teil);
    fassung += 1;
    hoerer.forEach((h) => h());
  });

// KI-Pane-Kontext: die Werte aus der Lage, jede Handlung ins Protokoll. Die Funktionen sind stabil wie im echten Kontext.
const PANE = {
  setOffen: (an: boolean) => notiere("pane", `setOffen ${an}`),
  setModus: (modus: string) => notiere("pane", `setModus ${modus}`),
  setDarstellung: (darstellung: string) => notiere("pane", `setDarstellung ${darstellung}`),
  oeffneZiel: (ziel: string, label: string) => notiere("pane", `oeffneZiel ${ziel} | ${label}`),
  fuehreZu: (ziel: string, label: string) => notiere("pane", `fuehreZu ${ziel} | ${label}`),
  fuehrungBeenden: () => notiere("pane", "fuehrungBeenden"),
  bewegeZeiger: async (x: number, y: number, klick?: boolean) => notiere("pane", `bewegeZeiger ${x} ${y} ${klick}`),
  entferneBezug: () => notiere("pane", "entferneBezug"),
  starteSprachmodus: () => notiere("pane", "starteSprachmodus"),
};
function useKiPaneAttrappe() {
  useLage();
  const { verfuegbar, offen, modus, darstellung, fuehrung, pruefBezug, anstoss, sprachmodus, sprachmodusMoeglich } = lage;
  return { verfuegbar, offen, modus, darstellung, fuehrung, pruefBezug, anstoss, sprachmodus, sprachmodusMoeglich, ...PANE };
}

// Sprache (ki-chat-sprache.ts): eine Vorlese-Instanz aus der Lage, jede Handlung ins Protokoll. beginneZug gibt die gemerkten
// Diktat-Sprachen nur für eine Frage aus dem Feld heraus, wie das Original.
const sprachSpeicher = { gemerkt: undefined as string[] | undefined };
const LIVE = {
  gerade: () => ({ index: 1, anzahl: 2, satz: "Es sind zwölf.", vorher: null }),
  halte: (an: boolean) => notiere("sprache", `halte ${an}`),
  entsperre: () => notiere("sprache", "entsperre"),
};
const SPRACHE = {
  stoppeAlles: () => notiere("sprache", "stoppeAlles"),
  beiMikrofonAufnahme: (an: boolean) => notiere("sprache", `beiMikrofonAufnahme ${an}`),
  beiMikrofonStart: () => notiere("sprache", "beiMikrofonStart"),
  merkeDiktatSprachen: (sprachen: string[] | undefined) => {
    notiere("sprache", `merkeDiktatSprachen ${json(sprachen)}`);
    sprachSpeicher.gemerkt = sprachen;
  },
  beginneZug: (ausFeld = false, erzwingeVorlesen = false) => {
    notiere("sprache", `beginneZug ausFeld=${ausFeld} erzwinge=${erzwingeVorlesen}`);
    if (!ausFeld) return undefined;
    const sprachen = sprachSpeicher.gemerkt;
    sprachSpeicher.gemerkt = undefined;
    return sprachen;
  },
};
function useKiChatSpracheAttrappe(eingang: { sprache: string; messages: unknown[]; beschaeftigt: boolean; offen: boolean; sprachmodus?: boolean }) {
  useLage();
  const { sprache, offen, sprachmodus, beschaeftigt } = eingang;
  useEffect(
    () => notiere("eingang", `sprache=${sprache} offen=${offen} sprachmodus=${sprachmodus} beschaeftigt=${beschaeftigt}`),
    [sprache, offen, sprachmodus, beschaeftigt],
  );
  const vorlesen = {
    schalterAn: false,
    phase: lage.phase,
    schalte: () => notiere("sprache", "schalte"),
    liest: (id: string) => lage.liest === id,
    knopf: (id: string) => notiere("sprache", `knopf ${id}`),
    hinweis: () => null,
  };
  return { vorlesen, live: LIVE, diktiert: lage.diktiert, ...SPRACHE };
}

// Takt (sprach-takt.ts): Refs wie im Original, Handlungen ins Protokoll; oeffneImTakt hebt die Öffnung für den Test auf.
const taktSpeicher = {
  refs: null as null | Record<"stimme" | "aktiv" | "stand" | "halte", { current: unknown }>,
  offen: [] as (() => void)[],
};
const TAKT = {
  marke: () => {
    notiere("takt", "marke");
    return lage.marke;
  },
  vorAusfuehrung: async (werkzeug: string) => {
    notiere("takt", `vorAusfuehrung ${werkzeug}`);
    return true;
  },
  oeffneImTakt: (oeffne: () => void, ziel: string, vorSaetzen: number | null) => {
    notiere("takt", `oeffneImTakt ${ziel} vor=${vorSaetzen}`);
    taktSpeicher.offen.push(oeffne);
  },
  neuerZug: () => notiere("takt", "neuerZug"),
};
function useSprachTaktAttrappe() {
  const stimme = useRef<unknown>("still");
  const aktiv = useRef<unknown>(false);
  const stand = useRef<unknown>(null);
  const halte = useRef<unknown>(null);
  useEffect(() => {
    taktSpeicher.refs = { stimme, aktiv, stand, halte };
  });
  return { stimme, aktiv, stand, halte, ...TAKT };
}

interface MikrofonEigenschaften {
  className?: string;
  deaktiviert?: boolean;
  beiAufnahme: (an: boolean) => void;
  beiStart: () => void;
  beiZwischentext: (text: string) => void;
  beiText: (text: string, sprachen?: string[]) => void;
}
const mikro = { props: null as MikrofonEigenschaften | null };
const HAUSTIER = { melde: (phase: string, text: string, stimmung: string) => notiere("haustier", `${phase} | ${text} | ${stimmung}`) };

const navigation = erzeugeNavigation("/dashboard");
ersetzeModule({
  ...navigation.module,
  ...NEXT_MODULE,
  "@/components/ki/ki-pane-kontext": { useKiPane: useKiPaneAttrappe },
  "@/components/ki/ki-chat-sprache": {
    useKiChatSprache: useKiChatSpracheAttrappe,
    antwortSpracheAus: (n: { metadata?: { sprache?: unknown } }) => (typeof n.metadata?.sprache === "string" ? n.metadata.sprache : undefined),
  },
  "@/components/ki/sprach-takt": { useSprachTakt: useSprachTaktAttrappe },
  "@/components/ki/ui-steuerung": {
    seitenKarte: () => "S|/dashboard|Übersicht",
    fuehreUiWerkzeugAus: (name: string, eingabe: Record<string, unknown>, umgebung: UiUmgebung) => {
      notiere("ui", `${name} ${json(eingabe)} agentModus=${umgebung.agentModus}`);
      return lage.uiWerkzeug(name, eingabe, umgebung);
    },
  },
  "@/components/ki/sprachausgabe": {
    istVorlesbar: (id: string) => /^[0-9a-f]{8}-/.test(id),
    stimmeVorhanden: () => lage.stimme,
    VorlesenKnopf: ({ id, text, sprache }: { id: string; text: string; sprache?: string }) => (
      <button type="button" className="vorlesen-attrappe" data-id={id} data-sprache={sprache ?? "-"} data-text={text} />
    ),
    VorlesenSchalter: ({ vorlesen }: { vorlesen: { phase: string } }) => <span className="vorlesen-schalter-attrappe" data-phase={vorlesen.phase} />,
  },
  "@/components/ki/sprachausgabe-strom": { stromMoeglich: () => lage.strom },
  "@/components/ki/hervorhebung": { setzeHervorhebung: (el: unknown) => notiere("hervorhebung", String(el)) },
  "@/components/ki/himbeere": {
    Himbeere: ({ groesse, denkt, schweben }: { groesse?: number; denkt?: boolean; schweben?: boolean }) => (
      <i className="himbeere" data-groesse={groesse} data-denkt={denkt ? "ja" : undefined} data-schweben={schweben ? "ja" : undefined} />
    ),
  },
  "@/components/ki/ki-quellen": {
    BelegAnbieter: ({ nachrichtId, belege, children }: { nachrichtId: string; belege: { id: string }[]; children: ReactNode }) => (
      <div className="belege-attrappe" data-nachricht={nachrichtId} data-belege={belege.map((b) => b.id).join(",")}>
        {children}
      </div>
    ),
    QuellenListe: ({ nachrichtId, belege, zitiert }: { nachrichtId: string; belege: { id: string }[]; zitiert: string[] }) => (
      <div className="quellen-attrappe" data-nachricht={nachrichtId} data-belege={belege.map((b) => b.id).join(",")} data-zitiert={zitiert.join(",")} />
    ),
    ZitatMarke: ({ kennung }: { kennung: string }) => <sup className="zitat-attrappe">{kennung}</sup>,
  },
  "@/components/ki/mikrofon": {
    MikrofonKnopf: (p: MikrofonEigenschaften) => {
      mikro.props = p;
      return <button type="button" className={p.className} data-attrappe="mikrofon" disabled={p.deaktiviert} />;
    },
  },
  "@/components/ki/diktat-welle": { DiktatWelle: () => <div className="diktat-welle-attrappe" /> },
  "@/components/dashboard/persona": {
    usePersona: () => {
      useLage();
      return { role: lage.rolle };
    },
  },
  "@/components/haustier/haustier-kontext": {
    useHaustierAktionen: () => HAUSTIER,
    useHaustierVorgabe: () => {
      useLage();
      return lage.vorgabe;
    },
    useHaustierStatus: () => {
      useLage();
      return { phase: lage.haustierPhase };
    },
  },
  "@/components/haustier/haustier-einstellung": { HaustierEinstellung: () => <div className="haustier-einstellung-attrappe" /> },
  "@/components/db/ki-assistent-formulare": {
    EskalationsFormular: () => <form className="eskalation-attrappe" />,
    KiChatFenster: ({ verlauf }: { verlauf: unknown[] }) => <div className="chat-fenster-attrappe" data-nachrichten={verlauf.length} />,
  },
  "@/components/pruefung/pruefung-ansicht": {
    PruefungAnsicht: ({ erlaubt }: { erlaubt: readonly string[] }) => <div className="pruefung-attrappe" data-erlaubt={erlaubt.join(",")} />,
  },
});

// Reihenfolge der Folgen eines Zuges: nur in den Fällen, die sie einschalten, schreiben auch das Neuladen der Seite (Router) und
// jeder Wechsel der offenen Freigabe am Sprachmodus-Bus ins Protokoll, zwischen die Tour (pane) und den Takt.
const reihenfolge = { an: false, freigabe: leseFreigabeAnfrage() };
abonniereSprachBus(() => {
  const jetzt = leseFreigabeAnfrage();
  if (jetzt === reihenfolge.freigabe) return;
  reihenfolge.freigabe = jetzt;
  if (reihenfolge.an) notiere("bus", `freigabe ${jetzt?.text ?? "-"}`);
});
const neuLaden = navigation.router.refresh;
navigation.router.refresh = () => {
  neuLaden();
  if (reihenfolge.an) notiere("router", "refresh");
};

// jsdom kennt scrollTo an Elementen nicht: hier ins Protokoll.
const beschreibe = (el: Element) => `${el.tagName.toLowerCase()}${el.classList[0] ? `.${el.classList[0]}` : ""}`;
fenster.HTMLElement.prototype.scrollTo = function (this: HTMLElement, optionen?: unknown) {
  notiere("dom", `scrollTo ${beschreibe(this)} ${json(optionen)}`);
} as HTMLElement["scrollTo"];

// ---- Hilfen ---------------------------------------------------------------------------------------------------------------------
type ChatModul = typeof import("@/components/ki/ki-chat");
type PaneModul = typeof import("@/components/ki/ki-pane");
let KiChat: ChatModul["KiChat"];
let KiPane: PaneModul["KiPane"];

const ZEIT = "2026-10-14T08:00:00Z";
const zeile = (id: string, rolle: KiChatNachrichtZeile["rolle"], inhalt: string): KiChatNachrichtZeile => ({
  id,
  rolle,
  inhalt,
  anbieterName: null,
  fallback: false,
  eskaliert: false,
  erstelltAm: ZEIT,
  werkzeugaufrufe: null,
});
const id = (nr: number) => `aaaaaaaa-0000-4000-8000-${String(nr).padStart(12, "0")}`;
const KURZ = [zeile("n1", "nutzer", "Hallo"), zeile(id(1), "assistent", "Hallo! Wie kann ich helfen?")];

let uhr: Uhr;
/** `streng`: unter React.StrictMode (Effekte laufen beim Einhängen zweimal, mit Aufräumen dazwischen). */
async function zeigeChat(verlauf: KiChatNachrichtZeile[] = [], streng = false) {
  uhr = installiereUhr({ datum: ZEIT });
  const ansicht = rendereMitTexten(streng ? <StrictMode><KiChat verlauf={verlauf} /></StrictMode> : <KiChat verlauf={verlauf} />);
  await abwarten();
  return ansicht;
}

/** Die nächste Anfrage an den Chat antwortet mit einem Strom, den der Test Stück für Stück füllt. */
function antwortStrom(): StromAttrappe {
  const strom = erzeugeStrom();
  netz.antworte("POST /api/ki-assistent", { strom, kopf: { "content-type": "text/event-stream" } }, { einmal: true });
  return strom;
}
/** Schickt Stücke (je ein SSE-Ereignis) und lässt die Drosselung des Chats (80 ms) ablaufen. */
async function stuecke(strom: StromAttrappe, ...teile: unknown[]) {
  for (const teil of teile) await ausloesen(() => strom.sse(teil));
  await uhr.vor(100);
}
async function schliesse(strom: StromAttrappe) {
  await ausloesen(() => {
    strom.schreibe("data: [DONE]\n\n");
    strom.ende();
  });
  await uhr.vor(100);
}
const text = (tid: string, inhalt: string) => [
  { type: "text-start", id: tid },
  { type: "text-delta", id: tid, delta: inhalt },
  { type: "text-end", id: tid },
];
const ENDE = [{ type: "finish-step" }, { type: "finish" }];
const anfang = (nachricht: string) => [{ type: "start", messageId: nachricht }, { type: "start-step" }];

/** Der Körper der n-ten Anfrage an den Chat; vom SDK erzeugte Kennungen werden zu "<id>". */
function koerper(nr: number): Record<string, unknown> | null {
  const a = netz.aufrufe.filter((x) => x.pfad === "/api/ki-assistent")[nr - 1];
  if (!a) return null;
  return JSON.parse(JSON.stringify(a.json), (_, w: unknown) => (typeof w === "string" && /^[A-Za-z0-9]{16}$/.test(w) ? "<id>" : w)) as Record<string, unknown>;
}
/** Nur Rolle und Text der Nachrichten im Körper. */
const kurzVerlauf = (k: Record<string, unknown> | null) =>
  ((k?.messages ?? []) as { role: string; parts: { type: string; text?: string; state?: string }[] }[]).map(
    (m) => `${m.role}: ${m.parts.map((p) => (p.type === "text" ? p.text : `${p.type}${p.state ? `(${p.state})` : ""}`)).join(" / ")}`,
  );

// Ein Symbol (lucide) nur mit seiner Klasse vergleichen, ohne Pfade. Groß- und Kleinschreibung egal, wiederholt bis nichts mehr
// passt; ein schon gekürztes <svg class="..."/> passt nicht mehr (kein Ende mit "/>").
const SVG_MIT_INHALT = /<svg\b[^>]*?\bclass="([^"]*)"[^>]*(?<!\/)>[\s\S]*?<\/svg\b[^>]*>/gi;
const ohneSvg = (html: string) => {
  let vorher: string;
  let jetzt = html;
  do {
    vorher = jetzt;
    jetzt = vorher.replace(SVG_MIT_INHALT, '<svg class="$1"/>');
  } while (jetzt !== vorher);
  return jetzt;
};
const html = (el: Element | null | undefined) => (el ? ohneSvg(el.outerHTML) : null);
const nachrichten = () => [...document.querySelectorAll(".ki-nachricht")].map((n) => html(n));
const feld = () => document.querySelector("textarea")!;
const knopf = (name: string) => screen.getByRole("button", { name });
const tippe = (wert: string) => fireEvent.change(feld(), { target: { value: wert } });
const enter = () => fireEvent.keyDown(feld(), { key: "Enter" });
const einwilligen = () => fireEvent.click(document.querySelector(".ki-composer__einwilligung input")!);
const status = () => document.querySelector(".ki-status")?.textContent ?? null;
const fehler = () => html(document.querySelector(".ki-fehler"));
const vorschlaege = () => [...document.querySelectorAll<HTMLButtonElement>(".ki-vorschlag")].map((b) => `${b.textContent}|${b.disabled}`);
const ohneEingang = () => protokoll.eintraege.filter((e) => !e.startsWith("eingang "));

/** Tippt eine Frage und schickt sie mit Enter ab. Die Antwort legt der Aufrufer vorher fest (antwortStrom, netz.antworte). */
async function frage(textEingabe: string): Promise<void> {
  tippe(textEingabe);
  enter();
  await abwarten();
}

/** Zwischen zwei Fällen: Umgebung, Lage und Bus zurück. */
async function neuerFall(): Promise<void> {
  setzeUmgebungZurueck();
  setzeAdresse("/de/dashboard");
  Object.assign(lage, LAGE);
  fassung += 1;
  sprachSpeicher.gemerkt = undefined;
  taktSpeicher.offen.length = 0;
  taktSpeicher.refs = null;
  mikro.props = null;
  navigation.verlauf.length = 0;
  meldeFreigabeAnfrage(null, null);
  reihenfolge.an = false;
  protokoll.leere();
}

// ---- 1. Leerer Verlauf ------------------------------------------------------------------------------------------------------------
async function pruefeLeer(): Promise<void> {
  const { textFehler } = await zeigeChat();
  gleich("Leer: Begrüßung, Fähigkeiten, Vorschläge gesperrt, Hinweis", html(document.querySelector(".ki-leer")), "<div class=\"ki-leer\"><span class=\"ki-leer__zeichen\" aria-hidden=\"true\"><i class=\"himbeere\" data-groesse=\"78\" data-schweben=\"ja\"></i></span><h3 class=\"ki-leer__titel\">Wobei kann ich helfen?</h3><p class=\"ki-leer__text\">Fragen Sie zu allem: Betriebsdaten, Funktionen der Anwendung oder allgemeinem Fachwissen. Jede Antwort zeigt ihre Quellen als Schritte – ein Klick springt dorthin.</p><p class=\"ki-leer__faehigkeiten\">27 Bereiche und 9 Aktionen Ihrer Rolle – live aus der Anwendung erkannt</p><div class=\"ki-leer__vorschlaege\"><button type=\"button\" disabled=\"\" class=\"ki-vorschlag\" style=\"animation-delay: 0ms;\">Welche gesetzlichen Fristen sind überfällig?</button><button type=\"button\" disabled=\"\" class=\"ki-vorschlag\" style=\"animation-delay: 70ms;\">Wie ist unser MwSt-Registrierungsstatus?</button><button type=\"button\" disabled=\"\" class=\"ki-vorschlag\" style=\"animation-delay: 140ms;\">Wie steht es um die Kühlkette?</button><button type=\"button\" disabled=\"\" class=\"ki-vorschlag\" style=\"animation-delay: 210ms;\">Welche Pflückaufgaben sind offen?</button></div><p class=\"ki-leer__hinweis\">Diese Antworten stammen von einer KI, nicht von einem Mitarbeiter. Betriebsdaten kommen live aus der Anwendung und erscheinen als Schritte unter der Antwort, alles andere ist Allgemeinwissen und wird so gekennzeichnet.</p></div>");
  gleich("Leer: Composer mit Einwilligung, Sprachmodus-Knopf gesperrt", html(document.querySelector(".ki-composer")), "<form class=\"ki-composer\"><label class=\"ki-composer__einwilligung\"><input type=\"checkbox\">Ich habe den Hinweis gelesen und bin einverstanden, dass meine Frage an den konfigurierten KI-Anbieter übermittelt wird.</label><div class=\"ki-composer__feld\"><textarea rows=\"1\" maxlength=\"2000\" placeholder=\"Frage eingeben ...\"></textarea><button type=\"button\" class=\"ki-composer__knopf ki-composer__knopf--still\" data-attrappe=\"mikrofon\" disabled=\"\"></button><button type=\"button\" disabled=\"\" aria-label=\"Sprachmodus starten\" title=\"Sprachmodus: live mit Himbi sprechen, ohne zu tippen\" class=\"ki-composer__knopf ki-composer__knopf--sprachmodus\"><svg class=\"lucide lucide-audio-lines h-4 w-4\"/></button></div><div class=\"ki-composer__optionen\"><span class=\"vorlesen-schalter-attrappe\" data-phase=\"still\"></span></div></form>");
  gleich("Leer: Stand an den Sprachmodus", leseChatStand(), {"beschaeftigt":false,"spricht":false,"laedt":false,"antwort":"","einwilligungFehlt":true,"fehler":false,"bereit":true});
  gleich("Leer: Folge beim Aufbau", ohneEingang(), ["dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","haustier ruhe |  | neutral"]);
  gleich("Leer: Eingang der Sprache", folge("eingang"), ["eingang sprache=de offen=true sprachmodus=false beschaeftigt=false"]);
  protokoll.leere();
  tippe("Danke, super!");
  enter();
  fireEvent.click(document.querySelector(".ki-vorschlag")!);
  await abwarten();
  gleich("Leer: ohne Einwilligung geht nichts hinaus, der Text bleibt", [netz.aufrufe.length, feld().value, ohneEingang()], [0,"Danke, super!",[]]);
  einwilligen();
  gleich("Leer: mit Einwilligung sind die Vorschläge frei, Senden statt Sprachmodus", [vorschlaege(), html(document.querySelector(".ki-composer__feld")), leseChatStand().einwilligungFehlt], [["Welche gesetzlichen Fristen sind überfällig?|false","Wie ist unser MwSt-Registrierungsstatus?|false","Wie steht es um die Kühlkette?|false","Welche Pflückaufgaben sind offen?|false"],"<div class=\"ki-composer__feld\"><textarea rows=\"1\" maxlength=\"2000\" placeholder=\"Frage eingeben ...\" style=\"height: 0px;\">Danke, super!</textarea><button type=\"button\" class=\"ki-composer__knopf ki-composer__knopf--still\" data-attrappe=\"mikrofon\"></button><button type=\"submit\" aria-label=\"Senden\" class=\"ki-composer__knopf\"><svg class=\"lucide lucide-arrow-up h-4 w-4\"/></button></div>",false]);
  tippe("");
  gleich("Leer: leeres Feld zeigt wieder den Sprachmodus-Knopf, jetzt frei", html(document.querySelector(".ki-composer__knopf--sprachmodus")), "<button type=\"button\" aria-label=\"Sprachmodus starten\" class=\"ki-composer__knopf ki-composer__knopf--sprachmodus\" title=\"Sprachmodus: live mit Himbi sprechen, ohne zu tippen\"><svg class=\"lucide lucide-audio-lines h-4 w-4\"/></button>");
  protokoll.leere();
  fireEvent.click(knopf("Sprachmodus starten"));
  gleich("Leer: Sprachmodus-Knopf macht still und startet", ohneEingang(), ["sprache stoppeAlles","pane starteSprachmodus"]);
  await setze({ modus: "agent", rolle: "kunde" });
  gleich(
    "Leer: Agent-Modus und Rolle Kunde",
    [document.querySelector(".ki-leer__text")?.textContent, document.querySelector(".ki-leer__faehigkeiten")?.textContent, vorschlaege()],
    ["Stellen Sie eine Frage oder geben Sie eine Aufgabe: Der Agent öffnet die passenden Seiten, liest sie, klickt, füllt Felder aus und erklärt unterwegs. Alles, was etwas absendet oder löscht, bestätigen Sie vorher.","4 Bereiche und 2 Aktionen Ihrer Rolle – live aus der Anwendung erkannt",["Ich möchte reklamieren: Die Beeren kamen matschig an|false","Zeig mir, was ich hier öffnen kann|false"]],
  );
  await setze({ sprachmodusMoeglich: false });
  gleich("Leer: ohne Sprachmodus ist der Knopf Senden, gesperrt", html(document.querySelector(".ki-composer__feld button[type=submit]")), "<button type=\"submit\" aria-label=\"Senden\" class=\"ki-composer__knopf\" disabled=\"\"><svg class=\"lucide lucide-arrow-up h-4 w-4\"/></button>");
  pruefe("Leer: keine fehlenden Texte", textFehler.length === 0, json(textFehler));
}

// ---- 2. Geladener Verlauf ---------------------------------------------------------------------------------------------------------
async function pruefeVerlauf(): Promise<void> {
  const verlauf = [
    zeile("s1", "system", "Systemhinweis"),
    zeile("n1", "nutzer", "Wie viele Kisten?"),
    zeile(id(1), "assistent", "Es sind **zwölf** Kisten [S1]."),
    zeile("n2", "nutzer", "Danke"),
    zeile("alt-1", "assistent", "Gern, das freut mich!"),
  ];
  await zeigeChat(verlauf);
  gleich("Verlauf: Nachrichten ohne Systemzeile, Markdown, Zitat, Quellen, Vorlesen nur bei UUID", nachrichten(), ["<div class=\"ki-nachricht ki-nachricht--nutzer\"><div class=\"ki-nachricht__blase\"><p>Wie viele Kisten?</p></div></div>","<div class=\"ki-nachricht ki-nachricht--assistent\"><span class=\"ki-nachricht__zeichen\" aria-hidden=\"true\"><i class=\"himbeere\" data-groesse=\"22\"></i></span><div class=\"ki-nachricht__inhalt\"><div class=\"belege-attrappe\" data-nachricht=\"aaaaaaaa-0000-4000-8000-000000000001\" data-belege=\"\"><div class=\"ki-md\"><p>Es sind <strong>zwölf</strong> Kisten <sup class=\"zitat-attrappe\">S1</sup>.</p></div><div class=\"quellen-attrappe\" data-nachricht=\"aaaaaaaa-0000-4000-8000-000000000001\" data-belege=\"\" data-zitiert=\"S1\"></div></div><button type=\"button\" class=\"vorlesen-attrappe\" data-id=\"aaaaaaaa-0000-4000-8000-000000000001\" data-sprache=\"-\" data-text=\"Es sind **zwölf** Kisten [S1].\"></button></div></div>","<div class=\"ki-nachricht ki-nachricht--nutzer\"><div class=\"ki-nachricht__blase\"><p>Danke</p></div></div>","<div class=\"ki-nachricht ki-nachricht--assistent\"><span class=\"ki-nachricht__zeichen\" aria-hidden=\"true\"><i class=\"himbeere\" data-groesse=\"22\"></i></span><div class=\"ki-nachricht__inhalt\"><div class=\"belege-attrappe\" data-nachricht=\"alt-1\" data-belege=\"\"><div class=\"ki-md\"><p>Gern, das freut mich!</p></div><div class=\"quellen-attrappe\" data-nachricht=\"alt-1\" data-belege=\"\" data-zitiert=\"\"></div></div></div></div>"]);
  gleich("Verlauf: Composer ohne Einwilligung", html(document.querySelector(".ki-composer")), "<form class=\"ki-composer\"><div class=\"ki-composer__feld\"><textarea rows=\"1\" maxlength=\"2000\" placeholder=\"Frage eingeben ...\"></textarea><button type=\"button\" class=\"ki-composer__knopf ki-composer__knopf--still\" data-attrappe=\"mikrofon\"></button><button type=\"button\" aria-label=\"Sprachmodus starten\" title=\"Sprachmodus: live mit Himbi sprechen, ohne zu tippen\" class=\"ki-composer__knopf ki-composer__knopf--sprachmodus\"><svg class=\"lucide lucide-audio-lines h-4 w-4\"/></button></div><div class=\"ki-composer__optionen\"><span class=\"vorlesen-schalter-attrappe\" data-phase=\"still\"></span></div></form>");
  gleich("Verlauf: Stand und Himbi aus der letzten Antwort", [leseChatStand(), folge("haustier")], [{"beschaeftigt":false,"spricht":false,"laedt":false,"antwort":"Gern, das freut mich!","einwilligungFehlt":false,"fehler":false,"bereit":true},["haustier ruhe |  | neutral"]]);
  await setze({ stimme: false });
  gleich("Verlauf: ohne Stimme kein Vorlesen-Knopf", document.querySelectorAll(".vorlesen-attrappe").length, 0);
}

// ---- 3. Senden und Antwortstrom ---------------------------------------------------------------------------------------------------
async function pruefeSendenUndStrom(): Promise<void> {
  await zeigeChat();
  einwilligen();
  const textfeld = feld();
  Object.defineProperty(textfeld, "scrollHeight", { configurable: true, value: 200 });
  tippe("Wie steht es um die Kühlkette?");
  const hoehe = textfeld.style.height;
  const strom = antwortStrom();
  protokoll.leere();
  enter();
  await abwarten();
  gleich("Senden: Folge (Zug, Takt, Anfrage)", ohneEingang(), ["sprache beginneZug ausFeld=true erzwinge=false","takt neuerZug","haustier ruhe |  | neutral","dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","haustier arbeitet | Assistent sucht die reifsten Fakten … | neutral","fetch POST /api/ki-assistent"]);
  gleich("Senden: Körper der Anfrage", koerper(1), {"einwilligung":true,"modus":"assistent","pfad":"/dashboard","rolle":"admin","sprache":"de","vorleseWeg":"abschnitte","id":"damicon-ki-assistent","messages":[{"parts":[{"type":"text","text":"Wie steht es um die Kühlkette?"}],"id":"<id>","role":"user"}],"trigger":"submit-message"});
  gleich("Senden: Methode und Kopf", [netz.aufrufe[0]!.methode, netz.aufrufe[0]!.kopf["content-type"]], ["POST","application/json"]);
  gleich("Senden: Feld leer, Höhe zurück (vorher auf 140 px begrenzt)", [hoehe, textfeld.value, textfeld.style.height], ["140px","",""]);
  gleich("Senden: eigene Frage, Status, Stopp-Knopf", [nachrichten(), html(document.querySelector(".ki-status")), !!screen.queryByRole("button", { name: "Stoppen" })], [["<div class=\"ki-nachricht ki-nachricht--nutzer\"><div class=\"ki-nachricht__blase\"><p>Wie steht es um die Kühlkette?</p></div></div>"],"<div class=\"ki-status\" role=\"status\"><i class=\"himbeere\" data-groesse=\"18\" data-denkt=\"ja\"></i>Assistent sucht die reifsten Fakten …<span class=\"ki-beeren\" aria-hidden=\"true\"><span></span><span></span><span></span></span></div>",true]);
  gleich("Senden: Stand und Himbi während der Anfrage", [leseChatStand(), folge("eingang")], [{"beschaeftigt":true,"spricht":false,"laedt":false,"antwort":"","einwilligungFehlt":false,"fehler":false,"bereit":true},["eingang sprache=de offen=true sprachmodus=false beschaeftigt=true"]]);
  protokoll.leere();
  await stuecke(strom, { type: "start", messageId: id(2), messageMetadata: { sprache: "ru" } }, { type: "start-step" }, { type: "text-start", id: "t1" }, { type: "text-delta", id: "t1", delta: "Ich schaue " });
  gleich("Strom: das erste Stück steht, Himbi denkt an der laufenden Antwort, kein Vorlesen", [nachrichten().at(-1), status()], ["<div class=\"ki-nachricht ki-nachricht--assistent\"><span class=\"ki-nachricht__zeichen\" aria-hidden=\"true\"><i class=\"himbeere\" data-groesse=\"22\" data-denkt=\"ja\"></i></span><div class=\"ki-nachricht__inhalt\"><div class=\"belege-attrappe\" data-nachricht=\"aaaaaaaa-0000-4000-8000-000000000002\" data-belege=\"\"><div class=\"ki-md\"><p>Ich schaue</p></div><div class=\"quellen-attrappe\" data-nachricht=\"aaaaaaaa-0000-4000-8000-000000000002\" data-belege=\"\" data-zitiert=\"\"></div></div></div></div>","Assistent sucht die reifsten Fakten …"]);
  await setze({ liest: id(2) });
  gleich("Strom: wird die laufende Antwort vorgelesen, ist der Knopf ihr Stopp", document.querySelectorAll(".ki-nachricht--assistent .vorlesen-attrappe").length, 1);
  await stuecke(
    strom,
    { type: "text-delta", id: "t1", delta: "nach." },
    { type: "text-end", id: "t1" },
    { type: "tool-input-available", toolCallId: "w1", toolName: "risikoRadarAbrufen", input: { bereich: "kuehlkette" } },
  );
  gleich("Strom: laufender Schritt in der Liste und in der Statuszeile", [html(document.querySelector(".ki-schritte")), status(), folge("haustier")], ["<ol class=\"ki-schritte\"><li><button type=\"button\" disabled=\"\" class=\"ki-schritt ki-schritt--laeuft\"><svg class=\"lucide lucide-radar ki-schritt__icon h-3.5 w-3.5\"/><span class=\"ki-schritt__text\">Durchsuche Risiko-Radar …</span><span class=\"ki-schritt__ende\"><svg class=\"lucide lucide-loader-circle h-3 w-3 animate-spin\"/></span></button></li></ol>","Durchsuche Risiko-Radar …",["haustier arbeitet | Durchsuche Risiko-Radar … | neutral"]]);
  // Wer mitten in der Antwort auf Agent umschaltet, bekommt keine Tour für Schritte, die im Assistent-Modus begannen.
  await setze({ modus: "agent" });
  await stuecke(
    strom,
    { type: "tool-output-available", toolCallId: "w1", output: { ziel: "/dashboard/risiko?bereich=kuehlkette", bereich: "kuehlkette" } },
    { type: "tool-input-available", toolCallId: "w2", toolName: "wissenSuchen", input: { frage: "Kühlkette" } },
    { type: "tool-output-available", toolCallId: "w2", output: { belege: [{ id: "S1", fundstelle: "Handbuch, S. 3", text: "Kühlkette" }] } },
    { type: "tool-input-available", toolCallId: "w3", toolName: "klicke", input: { absicht: "Filter setzen", ref: "e4" }, dynamic: true },
    { type: "tool-output-available", toolCallId: "w3", output: { ok: false, hinweis: "gesperrt" }, dynamic: true },
    { type: "tool-input-available", toolCallId: "w4", toolName: "complianceUebersichtAbrufen", input: {} },
    { type: "tool-output-error", toolCallId: "w4", errorText: "kaputt" },
    { type: "tool-input-available", toolCallId: "w5", toolName: "ohneAnsicht", input: {} },
    { type: "tool-output-available", toolCallId: "w5", output: { ok: true } },
    { type: "finish-step" },
    { type: "start-step" },
    ...text("t2", "Alles im grünen Bereich [S1]."),
    ...ENDE,
  );
  await schliesse(strom);
  gleich("Strom fertig: die ganze Antwort (Text, Schritte, Quellen, Vorlesen)", nachrichten().at(-1), "<div class=\"ki-nachricht ki-nachricht--assistent\"><span class=\"ki-nachricht__zeichen\" aria-hidden=\"true\"><i class=\"himbeere\" data-groesse=\"22\"></i></span><div class=\"ki-nachricht__inhalt\"><div class=\"belege-attrappe\" data-nachricht=\"aaaaaaaa-0000-4000-8000-000000000002\" data-belege=\"S1\"><div class=\"ki-md\"><p>Ich schaue nach.</p></div><ol class=\"ki-schritte\"><li><button type=\"button\" class=\"ki-schritt ki-schritt--klickbar\"><svg class=\"lucide lucide-radar ki-schritt__icon h-3.5 w-3.5\"/><span class=\"ki-schritt__text\">Risiko-Radar geprüft</span><span class=\"ki-schritt__ende\"><svg class=\"lucide lucide-check h-3 w-3\"/></span><svg class=\"lucide lucide-arrow-right ki-schritt__pfeil h-3 w-3\"/></button></li><li><button type=\"button\" disabled=\"\" class=\"ki-schritt\"><svg class=\"lucide lucide-book-open-check ki-schritt__icon h-3.5 w-3.5\"/><span class=\"ki-schritt__text\">Wissensbasis durchsucht</span><span class=\"ki-schritt__ende\"><svg class=\"lucide lucide-check h-3 w-3\"/></span></button></li><li><button type=\"button\" disabled=\"\" class=\"ki-schritt ki-schritt--fehler\"><svg class=\"lucide lucide-mouse-pointer-click ki-schritt__icon h-3.5 w-3.5\"/><span class=\"ki-schritt__text\">Nicht ausgeführt: Filter setzen</span><span class=\"ki-schritt__ende\"><svg class=\"lucide lucide-triangle-alert h-3 w-3\"/></span></button></li><li><button type=\"button\" disabled=\"\" class=\"ki-schritt ki-schritt--fehler\"><svg class=\"lucide lucide-shield-alert ki-schritt__icon h-3.5 w-3.5\"/><span class=\"ki-schritt__text\">Compliance geprüft</span><span class=\"ki-schritt__ende\"><svg class=\"lucide lucide-triangle-alert h-3 w-3\"/></span></button></li></ol><div class=\"ki-md\"><p>Alles im grünen Bereich <sup class=\"zitat-attrappe\">S1</sup>.</p></div><div class=\"quellen-attrappe\" data-nachricht=\"aaaaaaaa-0000-4000-8000-000000000002\" data-belege=\"S1\" data-zitiert=\"S1\"></div></div><button type=\"button\" class=\"vorlesen-attrappe\" data-id=\"aaaaaaaa-0000-4000-8000-000000000002\" data-sprache=\"ru\" data-text=\"\nIch schaue nach.\n\n\n\n\n\n\nAlles im grünen Bereich [S1].\"></button></div></div>");
  gleich("Strom fertig: kein Status, kein Stopp, keine Tour, kein Neuladen, Scrollen folgte jedem Stand", [status(), !!screen.queryByRole("button", { name: "Stoppen" }), folge("pane"), navigation.verlauf, folge("dom").length], [null,false,[],[],5]);
  gleich("Strom fertig: Stand, Himbi und Eingang", [leseChatStand(), folge("haustier"), folge("eingang")], [{"beschaeftigt":false,"spricht":false,"laedt":false,"antwort":"\nIch schaue nach.\n\n\n\n\n\n\nAlles im grünen Bereich [S1].","einwilligungFehlt":false,"fehler":false,"bereit":true},["haustier arbeitet | Durchsuche Risiko-Radar … | neutral","haustier arbeitet | Agent pflückt die Fakten … | neutral","haustier ruhe |  | neutral"],["eingang sprache=de offen=true sprachmodus=false beschaeftigt=false"]]);
  gleich("Strom: eine Anfrage, keine automatische Folge", netz.aufrufe.length, 1);
  protokoll.leere();
  fireEvent.click(document.querySelector(".ki-schritt--klickbar")!);
  fireEvent.click(document.querySelectorAll(".ki-schritt")[1]!);
  gleich("Schritt: ein Klick öffnet das Ziel, ohne Ziel gesperrt", folge("pane"), ["pane oeffneZiel /dashboard/risiko?bereich=kuehlkette | Risiko-Radar"]);
  await setze({ fuehrung: { ziel: "/dashboard/risiko?bereich=kuehlkette", label: "Risiko-Radar" } });
  gleich("Schritt: das Ziel der laufenden Führung ist markiert", document.querySelector(".ki-schritt--klickbar")?.className, "ki-schritt ki-schritt--klickbar ki-schritt--aktiv");
}

// ---- 4. Agent-Modus ---------------------------------------------------------------------------------------------------------------
async function pruefeAgent(): Promise<void> {
  await zeigeChat(KURZ);
  await setze({ modus: "agent" });
  const strom = antwortStrom();
  await frage("Zeig mir die Risiken");
  gleich("Agent: Status und Körper", [status(), koerper(1)?.modus], ["Agent pflückt die Fakten …","agent"]);
  protokoll.leere();
  await stuecke(
    strom,
    ...anfang(id(3)),
    { type: "tool-input-available", toolCallId: "r1", toolName: "risikoRadarAbrufen", input: { bereich: "kuehlkette" } },
    { type: "tool-output-available", toolCallId: "r1", output: { ziel: "/dashboard/risiko", bereich: "kuehlkette" } },
  );
  gleich("Agent: ein Ergebnis mit Ziel öffnet seine Ansicht", folge("pane", "takt"), ["pane fuehreZu /dashboard/risiko | Risiko-Radar"]);
  await stuecke(
    strom,
    { type: "tool-input-available", toolCallId: "d1", toolName: "datenLesen", input: { tabelle: "lieferungen" } },
    { type: "tool-output-available", toolCallId: "d1", output: { ziel: "/dashboard/lieferungen" } },
    { type: "tool-input-available", toolCallId: "x1", toolName: "tagesLageAbrufen", input: {} },
    { type: "tool-output-available", toolCallId: "x1", output: { text: "ohne Ziel" } },
  );
  gleich("Agent: Tabelle im Label, ohne Ziel kein Sprung, nichts doppelt", folge("pane"), ["pane fuehreZu /dashboard/risiko | Risiko-Radar","pane fuehreZu /dashboard/lieferungen | lieferungen"]);
  protokoll.leere();
  await stuecke(
    strom,
    { type: "tool-input-available", toolCallId: "k1", toolName: "aufgabeAnlegen", input: { reihenblockCode: "RB-1" } },
    { type: "tool-output-available", toolCallId: "k1", output: { ok: true, text: "Angelegt.", ziel: "/dashboard/aufgaben" } },
    { type: "tool-input-available", toolCallId: "k2", toolName: "reklamationAnlegen", input: { betreff: "Druck" } },
    { type: "tool-output-available", toolCallId: "k2", output: { ok: false, text: "Nicht erlaubt." } },
    ...text("t9", "Erledigt."),
    ...ENDE,
  );
  await schliesse(strom);
  gleich("Aktion: eine erfolgreiche Aktion lädt die Seite neu, einmal; ihr Ziel öffnet die Tour", [navigation.verlauf, folge("pane")], [["refresh"],["pane fuehreZu /dashboard/aufgaben | Pflückaufgaben"]]);
  gleich("Aktion: Karten erledigt und fehlgeschlagen", [...document.querySelectorAll(".ki-aktion")].map((k) => html(k)), ["<div class=\"ki-aktion ki-aktion--erledigt\"><div class=\"ki-aktion__kopf\"><span class=\"ki-aktion__icon\"><svg class=\"lucide lucide-clipboard-plus h-4 w-4\"/></span><div class=\"min-w-0 flex-1\"><p class=\"ki-aktion__titel\">Pflückaufgabe anlegen</p><p class=\"ki-aktion__status\"><svg class=\"lucide lucide-check h-3 w-3\"/>Erledigt</p></div></div><dl class=\"ki-aktion__felder\"><div><dt>Reihenblock</dt><dd>RB-1</dd></div></dl><p class=\"ki-aktion__ergebnis\">Angelegt.<button type=\"button\" class=\"ki-aktion__zeigen\">Anzeigen<svg class=\"lucide lucide-arrow-right h-3 w-3\"/></button></p></div>","<div class=\"ki-aktion ki-aktion--fehlgeschlagen\"><div class=\"ki-aktion__kopf\"><span class=\"ki-aktion__icon\"><svg class=\"lucide lucide-message-square-warning h-4 w-4\"/></span><div class=\"min-w-0 flex-1\"><p class=\"ki-aktion__titel\">Reklamation melden</p><p class=\"ki-aktion__status\"><svg class=\"lucide lucide-x h-3 w-3\"/>Nicht ausgeführt</p></div></div><dl class=\"ki-aktion__felder\"><div><dt>Betreff</dt><dd>Druck</dd></div></dl><p class=\"ki-aktion__ergebnis\">Nicht erlaubt.</p></div>"]);
  await setze({ haustierPhase: "arbeitet" });
  gleich("Aktion: ein weiterer Render lädt nicht noch einmal", navigation.verlauf, ["refresh"]);
}

// ---- 5. Aktionskarte: Freigabe im Chat --------------------------------------------------------------------------------------------
async function aktionBisFreigabe(): Promise<void> {
  const strom = antwortStrom();
  await frage("Leg eine Aufgabe an");
  await stuecke(
    strom,
    ...anfang(id(4)),
    ...text("t1", "Ich lege sie an."),
    { type: "tool-input-available", toolCallId: "g1", toolName: "aufgabeAnlegen", input: { reihenblockCode: "RB-1", zielmengeKg: 40, faelligkeit: "", grund: null } },
    { type: "tool-approval-request", approvalId: "f1", toolCallId: "g1" },
    ...ENDE,
  );
  await schliesse(strom);
}

async function pruefeAktionFreigabe(): Promise<void> {
  await zeigeChat(KURZ);
  await aktionBisFreigabe();
  gleich("Freigabe: Karte mit Feldern und Knöpfen", html(document.querySelector(".ki-aktion")), "<div class=\"ki-aktion ki-aktion--freigabe\"><div class=\"ki-aktion__kopf\"><span class=\"ki-aktion__icon\"><svg class=\"lucide lucide-clipboard-plus h-4 w-4\"/></span><div class=\"min-w-0 flex-1\"><p class=\"ki-aktion__titel\">Pflückaufgabe anlegen</p><p class=\"ki-aktion__status\">Ihre Freigabe ist erforderlich</p></div></div><dl class=\"ki-aktion__felder\"><div><dt>Reihenblock</dt><dd>RB-1</dd></div><div><dt>Zielmenge (kg)</dt><dd>40</dd></div></dl><div class=\"ki-aktion__knoepfe\"><button type=\"button\" class=\"ki-aktion__ablehnen\">Ablehnen</button><button type=\"button\" class=\"ki-aktion__bestaetigen\"><svg class=\"lucide lucide-check h-3.5 w-3.5\"/>Bestätigen</button></div></div>");
  gleich("Freigabe: Meldung an den Sprachmodus, Himbi wartet, keine Folgeanfrage", [leseFreigabeAnfrage()?.text, folge("haustier").at(-1), netz.aufrufe.length], ["Pflückaufgabe anlegen: Reihenblock: RB-1, Zielmenge (kg): 40","haustier freigabe |  | neutral",1]);
  const strom = antwortStrom();
  protokoll.leere();
  fireEvent.click(knopf("Bestätigen"));
  await abwarten();
  gleich("Freigabe: Bestätigen schickt die Entscheidung automatisch weiter", [folge("fetch"), kurzVerlauf(koerper(2)), koerper(2)?.trigger], [["fetch POST /api/ki-assistent"],["user: Hallo","assistant: Hallo! Wie kann ich helfen?","user: Leg eine Aufgabe an","assistant: step-start / Ich lege sie an. / tool-aufgabeAnlegen(approval-responded)"],"submit-message"]);
  gleich("Freigabe: die Entscheidung im Körper", (koerper(2)?.messages as { parts: unknown[] }[]).at(-1)?.parts.at(-1), {"type":"tool-aufgabeAnlegen","toolCallId":"g1","state":"approval-responded","input":{"reihenblockCode":"RB-1","zielmengeKg":40,"faelligkeit":"","grund":null},"approval":{"id":"f1","approved":true}});
  gleich("Freigabe: während der Folgeanfrage", [html(document.querySelector(".ki-aktion")), leseFreigabeAnfrage(), status()], ["<div class=\"ki-aktion ki-aktion--laeuft\"><div class=\"ki-aktion__kopf\"><span class=\"ki-aktion__icon\"><svg class=\"lucide lucide-clipboard-plus h-4 w-4\"/></span><div class=\"min-w-0 flex-1\"><p class=\"ki-aktion__titel\">Pflückaufgabe anlegen</p><p class=\"ki-aktion__status\"><svg class=\"lucide lucide-loader-circle h-3 w-3 animate-spin\"/>Wird ausgeführt …</p></div></div><dl class=\"ki-aktion__felder\"><div><dt>Reihenblock</dt><dd>RB-1</dd></div><div><dt>Zielmenge (kg)</dt><dd>40</dd></div></dl></div>",null,"Assistent sucht die reifsten Fakten …"]);
  await stuecke(
    strom,
    { type: "start-step" },
    { type: "tool-output-available", toolCallId: "g1", output: { ok: true, meldungSchluessel: null, text: "Aufgabe angelegt.", ziel: "/dashboard/aufgaben" } },
    ...text("t2", "Fertig."),
    ...ENDE,
  );
  await schliesse(strom);
  gleich("Freigabe: Karte erledigt mit Zeigen-Knopf, Seite lädt neu", [html(document.querySelector(".ki-aktion")), navigation.verlauf, netz.aufrufe.length], ["<div class=\"ki-aktion ki-aktion--erledigt\"><div class=\"ki-aktion__kopf\"><span class=\"ki-aktion__icon\"><svg class=\"lucide lucide-clipboard-plus h-4 w-4\"/></span><div class=\"min-w-0 flex-1\"><p class=\"ki-aktion__titel\">Pflückaufgabe anlegen</p><p class=\"ki-aktion__status\"><svg class=\"lucide lucide-check h-3 w-3\"/>Erledigt</p></div></div><dl class=\"ki-aktion__felder\"><div><dt>Reihenblock</dt><dd>RB-1</dd></div><div><dt>Zielmenge (kg)</dt><dd>40</dd></div></dl><p class=\"ki-aktion__ergebnis\">Aufgabe angelegt.<button type=\"button\" class=\"ki-aktion__zeigen\">Anzeigen<svg class=\"lucide lucide-arrow-right h-3 w-3\"/></button></p></div>",["refresh"],2]);
  protokoll.leere();
  fireEvent.click(knopf("Anzeigen"));
  gleich("Freigabe: Zeigen öffnet das Ziel der Aktion", folge("pane"), ["pane oeffneZiel /dashboard/aufgaben | Pflückaufgaben"]);
}

// ---- 6. Aktionskarte: Ablehnen über den Sprachmodus-Bus ---------------------------------------------------------------------------
async function pruefeAktionAbgelehnt(): Promise<void> {
  await zeigeChat(KURZ);
  await setze({ modus: "agent" });
  await aktionBisFreigabe();
  const strom = antwortStrom();
  await ausloesen(() => entscheideFreigabe(false, leseFreigabeAnfrage()!.nr));
  await abwarten();
  gleich("Ablehnen: der Bus entscheidet, die Folgeanfrage trägt den Grund", [(koerper(2)?.messages as { parts: unknown[] }[]).at(-1)?.parts.at(-1), koerper(2)?.modus], [{"type":"tool-aufgabeAnlegen","toolCallId":"g1","state":"approval-responded","input":{"reihenblockCode":"RB-1","zielmengeKg":40,"faelligkeit":"","grund":null},"approval":{"id":"f1","approved":false,"reason":"Der Nutzer hat die Aktion selbst abgelehnt. Es gab keinen Systemfehler."}},"agent"]);
  await stuecke(strom, { type: "start-step" }, { type: "tool-output-denied", toolCallId: "g1" }, ...text("t2", "Gut, dann nicht."), ...ENDE);
  await schliesse(strom);
  gleich("Ablehnen: Karte abgelehnt, keine Tour, kein Neuladen", [html(document.querySelector(".ki-aktion")), folge("pane"), navigation.verlauf], ["<div class=\"ki-aktion ki-aktion--abgelehnt\"><div class=\"ki-aktion__kopf\"><span class=\"ki-aktion__icon\"><svg class=\"lucide lucide-clipboard-plus h-4 w-4\"/></span><div class=\"min-w-0 flex-1\"><p class=\"ki-aktion__titel\">Pflückaufgabe anlegen</p><p class=\"ki-aktion__status\"><svg class=\"lucide lucide-x h-3 w-3\"/>Abgelehnt – es wurde nichts geändert.</p></div></div><dl class=\"ki-aktion__felder\"><div><dt>Reihenblock</dt><dd>RB-1</dd></div><div><dt>Zielmenge (kg)</dt><dd>40</dd></div></dl></div>",[],[]]);
}

// ---- 7. Klickfreigabe eines Client-Werkzeugs ---------------------------------------------------------------------------------------
async function pruefeKlickFreigabe(): Promise<void> {
  await zeigeChat(KURZ);
  await setze({ modus: "agent" });
  lage.uiWerkzeug = async (name, eingabe, umgebung) => {
    const ja = await umgebung.bestaetigen({ absicht: String(eingabe.absicht), label: "Speichern", grund: "senden" });
    return { ok: ja, geklickt: ja ? "e5" : null };
  };
  const strom = antwortStrom();
  await frage("Speicher das Formular");
  protokoll.leere();
  await stuecke(
    strom,
    ...anfang(id(5)),
    { type: "tool-input-available", toolCallId: "c1", toolName: "klicke", input: { ref: "e5", absicht: "Formular absenden" } },
    ...ENDE,
  );
  await schliesse(strom);
  gleich("Klick: Takt, dann die Steuerung mit Agent-Modus", folge("takt", "ui"), ["takt vorAusfuehrung klicke","ui klicke {\"ref\":\"e5\",\"absicht\":\"Formular absenden\"} agentModus=true"]);
  gleich("Klick: Karte im Chat, kein Status darunter", [html(document.querySelector(".ki-aktion--freigabe")), status()], ["<div class=\"ki-aktion ki-aktion--freigabe\"><div class=\"ki-aktion__kopf\"><span class=\"ki-aktion__icon\"><svg class=\"lucide lucide-mouse-pointer-click h-4 w-4\"/></span><div class=\"min-w-0 flex-1\"><p class=\"ki-aktion__titel\">Der Agent möchte klicken</p><p class=\"ki-aktion__status\">Dieser Klick sendet oder ändert Daten.</p></div></div><dl class=\"ki-aktion__felder\"><div><dt>Zweck</dt><dd>Formular absenden</dd></div><div><dt>Element</dt><dd>Speichern</dd></div></dl><div class=\"ki-aktion__knoepfe\"><button type=\"button\" class=\"ki-aktion__ablehnen\">Ablehnen</button><button type=\"button\" class=\"ki-aktion__bestaetigen\"><svg class=\"lucide lucide-check h-3.5 w-3.5\"/>Bestätigen</button></div></div>",null]);
  gleich("Klick: Meldung an den Sprachmodus, Himbi wartet", [leseFreigabeAnfrage()?.text, folge("haustier").at(-1), leseChatStand().beschaeftigt], ["Der Agent möchte klicken: Formular absenden – Speichern","haustier freigabe | Klicke: Formular absenden … | neutral",true]);
  const strom2 = antwortStrom();
  protokoll.leere();
  fireEvent.click(knopf("Bestätigen"));
  await abwarten();
  await uhr.vor(100);
  gleich("Klick: nach dem Bestätigen geht das Ergebnis automatisch zurück", [folge("fetch"), kurzVerlauf(koerper(2)), (koerper(2)?.messages as { parts: unknown[] }[]).at(-1)?.parts.at(-1)], [["fetch POST /api/ki-assistent"],["user: Hallo","assistant: Hallo! Wie kann ich helfen?","user: Speicher das Formular","assistant: step-start / tool-klicke(output-available)"],{"type":"tool-klicke","toolCallId":"c1","state":"output-available","input":{"ref":"e5","absicht":"Formular absenden"},"output":{"ok":true,"geklickt":"e5"}}]);
  gleich("Klick: Karte weg, Meldung zurückgezogen", [!!document.querySelector(".ki-aktion--freigabe"), leseFreigabeAnfrage()], [false,null]);
  await stuecke(strom2, { type: "start-step" }, ...text("t1", "Gespeichert."), ...ENDE);
  await schliesse(strom2);
  gleich("Klick: Schritt fertig in der Antwort", html(document.querySelector(".ki-schritte")), "<ol class=\"ki-schritte\"><li><button type=\"button\" disabled=\"\" class=\"ki-schritt\"><svg class=\"lucide lucide-mouse-pointer-click ki-schritt__icon h-3.5 w-3.5\"/><span class=\"ki-schritt__text\">Geklickt: Formular absenden</span><span class=\"ki-schritt__ende\"><svg class=\"lucide lucide-check h-3 w-3\"/></span></button></li></ol>");

  // Ablehnen über den Bus: die Karte verschwindet, das Ergebnis meldet die Absage.
  const strom3 = antwortStrom();
  await frage("Noch einmal speichern");
  await stuecke(strom3, ...anfang(id(6)), { type: "tool-input-available", toolCallId: "c2", toolName: "klicke", input: { ref: "e5", absicht: "Nochmal" } }, ...ENDE);
  await schliesse(strom3);
  const strom4 = antwortStrom();
  await ausloesen(() => entscheideFreigabe(false));
  await abwarten();
  await uhr.vor(100);
  gleich("Klick: Absage über den Bus", [!!document.querySelector(".ki-aktion--freigabe"), (koerper(4)?.messages as { parts: unknown[] }[]).at(-1)?.parts.at(-1)], [false,{"type":"tool-klicke","toolCallId":"c2","state":"output-available","input":{"ref":"e5","absicht":"Nochmal"},"output":{"ok":false,"geklickt":null}}]);
  await stuecke(strom4, { type: "start-step" }, ...text("t1", "Gut."), ...ENDE);
  await schliesse(strom4);
}

// ---- 8. Fehler -----------------------------------------------------------------------------------------------------------------
/** Die Route antwortet mit einem HTTP-Fehler (Text wie in api/ki-assistent/route.ts); danach die Meldung im Chat. */
async function fehlerNach(statusCode: number, antwort: string, frageText: string): Promise<string | null> {
  netz.antworte("POST /api/ki-assistent", { status: statusCode, text: antwort }, { einmal: true });
  await frage(frageText);
  await uhr.vor(100);
  return fehler();
}

async function pruefeFehler(): Promise<void> {
  await zeigeChat(KURZ);
  gleich("Fehler Sitzung: Meldung mit Anmelde-Link", await fehlerNach(401, "nicht angemeldet", "Frage Sitzung"), "<p class=\"ki-fehler\" role=\"alert\">Ihre Sitzung ist abgelaufen oder wurde beendet. Bitte melden Sie sich erneut an. <a class=\"ki-fehler__link\" href=\"/de/login?weiter=%2Fde%2Fdashboard\">Erneut anmelden</a></p>");
  gleich("Fehler Berechtigung: Meldung", await fehlerNach(403, "keine berechtigung", "Frage Berechtigung"), "<p class=\"ki-fehler\" role=\"alert\">Ihre Rolle darf den KI-Assistenten nicht nutzen.</p>");
  gleich("Fehler allgemein: Meldung", await fehlerNach(500, "kaputt", "Frage allgemein"), "<p class=\"ki-fehler\" role=\"alert\">Der KI-Assistent ist gerade nicht erreichbar. Bitte versuchen Sie es später erneut oder wenden Sie sich an unser Büro.</p>");
  gleich("Fehler: Stand und Himbi", [leseChatStand(), folge("haustier")], [{"beschaeftigt":false,"spricht":false,"laedt":false,"antwort":"","einwilligungFehlt":false,"fehler":true,"bereit":true},["haustier ruhe |  | frage","haustier ruhe |  | neutral","haustier ruhe |  | frage","haustier arbeitet | Assistent sucht die reifsten Fakten … | neutral","haustier fehler |  | neutral","haustier arbeitet | Assistent sucht die reifsten Fakten … | neutral","haustier fehler |  | neutral","haustier arbeitet | Assistent sucht die reifsten Fakten … | neutral","haustier fehler |  | neutral"]]);
  protokoll.leere();
  const strom = antwortStrom();
  await frage("Noch einmal");
  gleich("Fehler: eine neue Frage nimmt die Meldung weg", [fehler(), status()], [null,"Assistent sucht die reifsten Fakten …"]);
  await stuecke(strom, ...anfang(id(7)), ...text("t1", "Jetzt geht es."), ...ENDE);
  await schliesse(strom);
  gleich("Fehler: danach wieder normal", [fehler(), nachrichten().length, leseChatStand().fehler], [null,7,false]);
  await frage("Ohne Netz");
  await uhr.vor(100);
  gleich("Fehler: Netzfehler wie allgemein", fehler(), "<p class=\"ki-fehler\" role=\"alert\">Der KI-Assistent ist gerade nicht erreichbar. Bitte versuchen Sie es später erneut oder wenden Sie sich an unser Büro.</p>");
  netz.antworte("POST /api/ki-assistent", { status: 413, text: "verlauf zu gross" }, { einmal: true });
  await frage("Zu lang");
  await uhr.vor(100);
  gleich("Fehler zu lang: Meldung mit Knopf", fehler(), "<p class=\"ki-fehler\" role=\"alert\">Diese Unterhaltung ist zu lang geworden. <button type=\"button\" class=\"ki-fehler__link\">Neu beginnen</button></p>");
  fireEvent.click(knopf("Neu beginnen"));
  await abwarten();
  gleich("Fehler zu lang: Neu beginnen leert die Ansicht", [fehler(), !!document.querySelector(".ki-leer"), nachrichten().length, leseChatStand()], [null,true,0,{"beschaeftigt":false,"spricht":false,"laedt":false,"antwort":"","einwilligungFehlt":true,"fehler":false,"bereit":true}]);
}

// ---- 9. Abbruch -------------------------------------------------------------------------------------------------------------------
async function pruefeAbbruch(): Promise<void> {
  await zeigeChat(KURZ);
  const strom = antwortStrom();
  await frage("Erzähl mir etwas");
  await stuecke(strom, ...anfang(id(8)), { type: "text-start", id: "t1" }, { type: "text-delta", id: "t1", delta: "Es war einmal" });
  protokoll.leere();
  fireEvent.click(knopf("Stoppen"));
  await abwarten();
  await uhr.vor(100);
  gleich("Abbruch: Folge (Stimme zuerst, Takt, keine Führung ausserhalb des Sprachmodus)", ohneEingang(), ["sprache stoppeAlles","takt neuerZug","dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","haustier ruhe |  | neutral"]);
  gleich(
    "Abbruch: Signal abgebrochen, Strom zu, Antwort bleibt, kein Fehler, frei",
    [netz.aufrufe.at(-1)!.signal?.aborted, strom.abgebrochen, nachrichten().at(-1), fehler(), status(), leseChatStand()],
    [true,false,"<div class=\"ki-nachricht ki-nachricht--assistent\"><span class=\"ki-nachricht__zeichen\" aria-hidden=\"true\"><i class=\"himbeere\" data-groesse=\"22\"></i></span><div class=\"ki-nachricht__inhalt\"><div class=\"belege-attrappe\" data-nachricht=\"aaaaaaaa-0000-4000-8000-000000000008\" data-belege=\"\"><div class=\"ki-md\"><p>Es war einmal</p></div><div class=\"quellen-attrappe\" data-nachricht=\"aaaaaaaa-0000-4000-8000-000000000008\" data-belege=\"\" data-zitiert=\"\"></div></div><button type=\"button\" class=\"vorlesen-attrappe\" data-id=\"aaaaaaaa-0000-4000-8000-000000000008\" data-sprache=\"-\" data-text=\"\nEs war einmal\"></button></div></div>",null,null,{"beschaeftigt":false,"spricht":false,"laedt":false,"antwort":"\nEs war einmal","einwilligungFehlt":false,"fehler":false,"bereit":true}],
  );
}

// ---- 10. Diktat -------------------------------------------------------------------------------------------------------------------
async function pruefeDiktat(): Promise<void> {
  await zeigeChat(KURZ);
  await setze({ phase: "spricht" });
  protokoll.leere();
  tippe("F");
  tippe("Frage:");
  gleich("Diktat: Tippen ab dem zweiten Zeichen macht die Stimme still", ohneEingang(), ["haustier ruhe |  | neutral","sprache stoppeAlles"]);
  await setze({ phase: "still" });
  protokoll.leere();
  await ausloesen(() => mikro.props!.beiStart());
  await ausloesen(() => mikro.props!.beiAufnahme(true));
  await setze({ diktiert: true });
  await ausloesen(() => mikro.props!.beiZwischentext("wie viele"));
  const zwischen = feld().value;
  const welle = !!document.querySelector(".diktat-welle-attrappe");
  await ausloesen(() => mikro.props!.beiAufnahme(false));
  await setze({ diktiert: false });
  await ausloesen(() => mikro.props!.beiText("wie viele Steigen?", ["kk", "kk"]));
  gleich("Diktat: Folge an die Sprache", ohneEingang(), ["sprache beiMikrofonStart","sprache beiMikrofonAufnahme true","sprache beiMikrofonAufnahme false","sprache merkeDiktatSprachen [\"kk\",\"kk\"]","haustier ruhe |  | frage"]);
  gleich("Diktat: angehängt an das Getippte, Welle, Fokus und Cursor am Ende", [zwischen, welle, feld().value, document.activeElement === feld(), feld().selectionStart, feld().selectionEnd], ["Frage: wie viele",true,"Frage: wie viele Steigen?",true,25,25]);
  const strom = antwortStrom();
  protokoll.leere();
  enter();
  await abwarten();
  gleich("Diktat: Enter schickt die Frage mit den gehörten Sprachen", [ohneEingang(), koerper(1)?.diktatSprachen, mikro.props!.deaktiviert], [["sprache beginneZug ausFeld=true erzwinge=false","takt neuerZug","dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","haustier arbeitet | Assistent sucht die reifsten Fakten … | neutral","fetch POST /api/ki-assistent"],["kk","kk"],true]);
  await stuecke(strom, ...anfang(id(9)), ...text("t1", "Zwölf."), ...ENDE);
  await schliesse(strom);
  await ausloesen(() => mikro.props!.beiZwischentext("ohne Start"));
  gleich("Diktat: ohne neuen Start beginnt ein Zwischentext leer", feld().value, "ohne Start");
}

// ---- 11. Vorgabe von Himbi --------------------------------------------------------------------------------------------------------
async function pruefeVorgabe(): Promise<void> {
  await zeigeChat();
  await setze({ vorgabe: { id: 1, text: "Zeig mir die Kühlkette" } });
  gleich("Vorgabe: ohne Einwilligung ins Feld, Fokus dort, nichts gesendet", [feld().value, document.activeElement === feld(), netz.aufrufe.length], ["Zeig mir die Kühlkette",true,0]);
  tippe("");
  await setze({ vorgabe: { id: 1, text: "Zeig mir die Kühlkette" } });
  gleich("Vorgabe: dieselbe Vorgabe zählt nicht zweimal", feld().value, "");
  einwilligen();
  const strom = antwortStrom();
  protokoll.leere();
  await setze({ vorgabe: { id: 2, text: "Was ist heute zu tun?" } });
  await abwarten();
  gleich("Vorgabe: mit Einwilligung sofort gesendet, nicht als Diktat", [ohneEingang(), kurzVerlauf(koerper(1))], [["sprache beginneZug ausFeld=false erzwinge=false","takt neuerZug","dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","haustier arbeitet | Assistent sucht die reifsten Fakten … | neutral","fetch POST /api/ki-assistent"],["user: Was ist heute zu tun?"]]);
  await setze({ vorgabe: { id: 3, text: "Und morgen?" } });
  gleich("Vorgabe: während einer Antwort ins Feld", [feld().value, document.activeElement === feld(), netz.aufrufe.length], ["Und morgen?",true,1]);
  await stuecke(strom, ...anfang(id(10)), ...text("t1", "Pflücken."), ...ENDE);
  await schliesse(strom);
}

// ---- 12. Anstoss mit Prüfbezug ----------------------------------------------------------------------------------------------------
async function pruefeAnstoss(): Promise<void> {
  await zeigeChat(KURZ);
  await setze({ pruefBezug: { id: "1234567890abcdef", kontext: "Prüfbericht: 3 Mängel" } });
  gleich("Bezug: Hinweis und Kacheln im Composer", [html(document.querySelector(".ki-bezug")), html(document.querySelector(".ki-bezug-kacheln"))], ["<div class=\"ki-bezug\" role=\"status\"><svg class=\"lucide lucide-scale h-3.5 w-3.5\"/><span>Bezug: Prüfbericht 12345678</span><button type=\"button\" aria-label=\"Bezug zum Prüfbericht entfernen\" title=\"Bezug zum Prüfbericht entfernen\"><svg class=\"lucide lucide-x h-3.5 w-3.5\"/></button></div>","<div class=\"ki-bezug-kacheln\" role=\"note\" aria-label=\"Direkt zu einer Kachel springen\"><button type=\"button\" class=\"ki-bezug-kacheln__knopf\"><svg class=\"lucide lucide-clipboard-check h-3 w-3\"/>Audit</button><button type=\"button\" class=\"ki-bezug-kacheln__knopf\"><svg class=\"lucide lucide-landmark h-3 w-3\"/>Steuern</button><button type=\"button\" class=\"ki-bezug-kacheln__knopf\"><svg class=\"lucide lucide-scale h-3 w-3\"/>Recht</button><button type=\"button\" class=\"ki-bezug-kacheln__knopf\"><svg class=\"lucide lucide-shield-alert h-3 w-3\"/>Risiko</button><button type=\"button\" class=\"ki-bezug-kacheln__knopf\">Maßnahmenplan</button><button type=\"button\" class=\"ki-bezug-kacheln__knopf\">Einschränkungen</button></div>"]);
  protokoll.leere();
  fireEvent.click(knopf("Bezug zum Prüfbericht entfernen"));
  fireEvent.click(document.querySelectorAll(".ki-bezug-kacheln__knopf")[0]!);
  gleich("Bezug: Entfernen und Kachel öffnen", folge("pane"), ["pane entferneBezug","pane oeffneZiel /dashboard#compliance-kachel-audit | Audit"]);
  const strom = antwortStrom();
  protokoll.leere();
  await setze({ anstoss: { nr: 1, frage: "Was ist offen?", zurPruefung: true } });
  await abwarten();
  gleich("Anstoss: gesendet mit erzwungenem Vorlesen, Bericht im Körper, Fokus im Feld", [ohneEingang(), koerper(1)?.pruefkontext, kurzVerlauf(koerper(1)), document.activeElement === feld()], [["sprache beginneZug ausFeld=false erzwinge=true","takt neuerZug","dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","haustier arbeitet | Assistent sucht die reifsten Fakten … | neutral","fetch POST /api/ki-assistent"],"Prüfbericht: 3 Mängel",["user: Hallo","assistant: Hallo! Wie kann ich helfen?","user: Was ist offen?"],true]);
  await setze({ anstoss: { nr: 2, frage: "Und der Rest?", zurPruefung: false } });
  gleich("Anstoss: während einer Antwort ins Feld", [feld().value, document.activeElement === feld(), netz.aufrufe.length], ["Und der Rest?",true,1]);
  await stuecke(strom, ...anfang(id(11)), ...text("t1", "Drei Mängel."), ...ENDE);
  await schliesse(strom);
  tippe("");
  const strom2 = antwortStrom();
  protokoll.leere();
  await setze({ anstoss: { nr: 3, frage: "Aus der Suche", zurPruefung: false } });
  await abwarten();
  gleich("Anstoss: aus der Suche wie getippt (ohne Vorlese-Zwang)", [ohneEingang(), koerper(2)?.pruefkontext], [["sprache beginneZug ausFeld=false erzwinge=false","takt neuerZug","dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","haustier arbeitet | Assistent sucht die reifsten Fakten … | neutral","fetch POST /api/ki-assistent"],"Prüfbericht: 3 Mängel"]);
  await stuecke(strom2, ...anfang(id(12)), ...text("t1", "Gefunden."), ...ENDE);
  await schliesse(strom2);
}

// ---- 13. Sprachmodus --------------------------------------------------------------------------------------------------------------
async function pruefeSprachmodus(): Promise<void> {
  const verlauf = [
    zeile("u0", "nutzer", "Frage eins"),
    zeile(id(20), "assistent", "Antwort eins"),
    zeile("u2", "nutzer", "Frage zwei"),
    zeile(id(21), "assistent", "Antwort zwei a"),
    zeile(id(22), "assistent", "Antwort zwei b"),
    zeile(id(23), "assistent", "Antwort zwei c"),
  ];
  await zeigeChat(verlauf);
  // Eine Frage über den Bus ausserhalb des Sprachmodus bleibt liegen.
  await ausloesen(() => stelleSprachFrage("Ohne Sprachmodus", ["de"]));
  await abwarten();
  gleich("Sprachmodus aus: eine Frage über den Bus geht nicht hinaus", netz.aufrufe.length, 0);
  await setze({ sprachmodus: true, pruefBezug: { id: "abcdef0123456789", kontext: "Bericht" }, strom: true });
  gleich("Sprachmodus: Takt verdrahtet (Halten, Stimme, Stand, aktiv) und Bus", [taktSpeicher.refs!.halte.current === LIVE.halte, taktSpeicher.refs!.stimme.current, taktSpeicher.refs!.stand.current === LIVE.gerade, taktSpeicher.refs!.aktiv.current, leseGerade()], [true,"still",true,true,{"index":1,"anzahl":2,"satz":"Es sind zwölf.","vorher":null}]);
  protokoll.leere();
  await ausloesen(() => entsperreTon());
  gleich("Sprachmodus: Entsperren kommt bei der Sprache an", folge("sprache"), ["sprache entsperre"]);
  const strom = antwortStrom();
  protokoll.leere();
  await ausloesen(() => stelleSprachFrage("Zeig mir die Lieferungen", ["de", "ru"]));
  await abwarten();
  gleich("Sprachmodus: Folge beim Senden (Diktat-Sprachen, Zug, Führung abgeräumt)", ohneEingang(), ["sprache merkeDiktatSprachen [\"de\",\"ru\"]","sprache beginneZug ausFeld=true erzwinge=false","takt neuerZug","pane fuehrungBeenden","hervorhebung null","dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","haustier arbeitet | Assistent sucht die reifsten Fakten … | neutral","fetch POST /api/ki-assistent"]);
  gleich("Sprachmodus: Körper (Seitenkarte, kein Prüfbezug, Diktat-Sprachen, Vorlese-Weg)", { ...koerper(1), messages: kurzVerlauf(koerper(1)) }, {"einwilligung":false,"modus":"sprache","pfad":"/dashboard","rolle":"admin","sprache":"de","diktatSprachen":["de","ru"],"vorleseWeg":"strom","seitenkarte":"S|/dashboard|Übersicht","id":"damicon-ki-assistent","messages":["user: Frage zwei","assistant: Antwort zwei a","assistant: Antwort zwei b","assistant: Antwort zwei c","user: Zeig mir die Lieferungen"],"trigger":"submit-message"});
  protokoll.leere();
  await stuecke(
    strom,
    ...anfang(id(24)),
    ...text("t1", "Ich öffne die Lieferungen."),
    { type: "data-satz", data: { zug: "z1", nr: 1, text: "Ich öffne die Lieferungen." } },
    { type: "tool-input-available", toolCallId: "o1", toolName: "oeffneBereich", input: { bereich: "lieferungen" } },
    { type: "tool-output-available", toolCallId: "o1", output: { ziel: "/dashboard/lieferungen", bereich: "lieferungen" } },
    { type: "data-satz", data: { zug: "z1", nr: 2, text: "Dort sehen Sie alles." } },
    { type: "tool-input-available", toolCallId: "o2", toolName: "complianceUebersichtAbrufen", input: {} },
    { type: "tool-output-available", toolCallId: "o2", output: { ziel: "/dashboard/compliance" } },
  );
  gleich("Sprachmodus: nur oeffneBereich wechselt, im Takt hinter den Sätzen davor", ohneEingang(), ["dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","takt marke","takt oeffneImTakt /dashboard/lieferungen vor=2"]);
  lage.marke = null;
  await stuecke(
    strom,
    { type: "tool-input-available", toolCallId: "o3", toolName: "oeffneBereich", input: { bereich: "uebersicht" } },
    { type: "tool-output-available", toolCallId: "o3", output: { ziel: "/dashboard", bereich: "uebersicht" } },
  );
  gleich("Sprachmodus: ohne Satzposition öffnet es ohne Marke", folge("takt"), ["takt marke","takt oeffneImTakt /dashboard/lieferungen vor=2","takt marke","takt oeffneImTakt /dashboard vor=null"]);
  protokoll.leere();
  await ausloesen(() => taktSpeicher.offen.forEach((oeffne) => oeffne()));
  gleich("Sprachmodus: die Öffnung im Takt geht über oeffneZiel", folge("pane"), ["pane oeffneZiel /dashboard/lieferungen | den Bereich","pane oeffneZiel /dashboard | Übersicht"]);
  // Unterbrechen: die Frage wartet, bis die laufende Antwort abgebrochen ist.
  const strom2 = antwortStrom();
  protokoll.leere();
  await ausloesen(() => stelleSprachFrage("Und die zweite?", ["de"], { unterbrochen: "Ich öffne die Lieferungen." }));
  await abwarten();
  const wartet = netz.aufrufe.length;
  await ausloesen(() => unterbrichChat());
  await abwarten();
  await uhr.vor(100);
  gleich("Unterbrechen: Folge (Stopp, dann die wartende Frage)", [wartet, ohneEingang()], [1,["sprache stoppeAlles","takt neuerZug","pane fuehrungBeenden","hervorhebung null","dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","haustier ruhe |  | neutral","sprache merkeDiktatSprachen [\"de\"]","sprache beginneZug ausFeld=true erzwinge=false","takt neuerZug","pane fuehrungBeenden","hervorhebung null","dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","haustier arbeitet | Assistent sucht die reifsten Fakten … | neutral","fetch POST /api/ki-assistent","dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}"]]);
  gleich("Unterbrechen: Körper mit dem gehörten Satz, Antwort fürs Modell gekürzt", [koerper(2)?.unterbrochen, kurzVerlauf(koerper(2))], ["Ich öffne die Lieferungen.",["user: Frage zwei","assistant: Antwort zwei a","assistant: Antwort zwei b","assistant: Antwort zwei c","user: Zeig mir die Lieferungen","assistant: step-start / Ich öffne die Lieferungen.\n\n[Unterbrochen: Der Rest dieser Antwort wurde nicht vorgelesen, der Nutzer hat ihn nicht gehört.] / data-satz / tool-oeffneBereich(output-available) / data-satz / tool-complianceUebersichtAbrufen(output-available) / tool-oeffneBereich(output-available)","user: Und die zweite?"]]);
  await stuecke(strom2, ...anfang(id(25)), ...text("t1", "Die zweite kommt morgen."), ...ENDE);
  await schliesse(strom2);
  const strom3 = antwortStrom();
  await ausloesen(() => stelleSprachFrage("Danke", ["de"]));
  await abwarten();
  gleich("Danach: kein Hinweis mehr, die Kürzung bleibt", [koerper(3)?.unterbrochen, kurzVerlauf(koerper(3))], [null,["user: Frage zwei","assistant: Antwort zwei a","assistant: Antwort zwei b","assistant: Antwort zwei c","user: Zeig mir die Lieferungen","assistant: step-start / Ich öffne die Lieferungen.\n\n[Unterbrochen: Der Rest dieser Antwort wurde nicht vorgelesen, der Nutzer hat ihn nicht gehört.] / data-satz / tool-oeffneBereich(output-available) / data-satz / tool-complianceUebersichtAbrufen(output-available) / tool-oeffneBereich(output-available)","user: Und die zweite?","assistant: step-start / Die zweite kommt morgen.","user: Danke"]]);
  await stuecke(strom3, ...anfang(id(26)), ...text("t1", "Gern."), ...ENDE);
  // Nachsatz: noch während der Antwort; die vorige Frage samt angefangener Antwort geht, die zusammengefügte kommt.
  const strom4 = antwortStrom();
  await ausloesen(() => stelleSprachFrage("Danke. Und zeig mir die Kisten", ["de"], { ersetztLetzte: true }));
  await abwarten();
  const vorDemEnde = netz.aufrufe.length;
  await schliesse(strom3);
  await abwarten();
  gleich("Nachsatz: wartet auf das Ende, ersetzt dann die letzte Frage", [vorDemEnde, kurzVerlauf(koerper(4))], [3,["user: Frage zwei","assistant: Antwort zwei a","assistant: Antwort zwei b","assistant: Antwort zwei c","user: Zeig mir die Lieferungen","assistant: step-start / Ich öffne die Lieferungen.\n\n[Unterbrochen: Der Rest dieser Antwort wurde nicht vorgelesen, der Nutzer hat ihn nicht gehört.] / data-satz / tool-oeffneBereich(output-available) / data-satz / tool-complianceUebersichtAbrufen(output-available) / tool-oeffneBereich(output-available)","user: Und die zweite?","assistant: step-start / Die zweite kommt morgen.","user: Danke. Und zeig mir die Kisten"]]);
  await stuecke(strom4, ...anfang(id(27)), ...text("t1", "Hier die Kisten."), ...ENDE);
  await schliesse(strom4);
  gleich("Sprachmodus: Verlauf im Chat danach", nachrichten().length, 12);
  protokoll.leere();
  await setze({ sprachmodus: false });
  gleich("Sprachmodus aus: Takt nicht mehr aktiv", taktSpeicher.refs!.aktiv.current, false);
}

// ---- 14. Scrollen -----------------------------------------------------------------------------------------------------------------
async function pruefeScrollen(): Promise<void> {
  await zeigeChat(KURZ);
  const flaeche = document.querySelector<HTMLElement>(".ki-chat__verlauf")!;
  let oben = 100;
  Object.defineProperty(flaeche, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(flaeche, "clientHeight", { configurable: true, value: 300 });
  Object.defineProperty(flaeche, "scrollTop", { configurable: true, get: () => oben, set: (w: number) => (oben = w) });
  gleich("Scrollen: beim Aufbau ans Ende", folge("dom"), ["dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}"]);
  protokoll.leere();
  fireEvent.scroll(flaeche);
  gleich("Scrollen: weit oben erscheint der Knopf", html(document.querySelector(".ki-nach-unten")), "<button type=\"button\" class=\"ki-nach-unten\" aria-label=\"Zum Neuesten\"><svg class=\"lucide lucide-arrow-down h-4 w-4\"/></button>");
  const strom = antwortStrom();
  await frage("Weiter");
  gleich("Scrollen: eine eigene Frage klebt wieder unten und blendet den Knopf aus", [folge("dom"), !!document.querySelector(".ki-nach-unten")], [["dom scrollTo div.ki-chat__verlauf {\"top\":1000,\"behavior\":\"auto\"}"],false]);
  await stuecke(strom, ...anfang(id(13)), ...text("t1", "Mehr."), ...ENDE);
  await schliesse(strom);
  protokoll.leere();
  fireEvent.scroll(flaeche);
  await setze({ haustierPhase: "arbeitet", offen: false });
  gleich("Scrollen: nach oben gescrollt folgt der Chat nicht mehr", folge("dom"), []);
  fireEvent.click(knopf("Zum Neuesten"));
  gleich("Scrollen: der Knopf scrollt weich ans Ende und verschwindet", [folge("dom"), !!document.querySelector(".ki-nach-unten")], [["dom scrollTo div.ki-chat__verlauf {\"top\":1000,\"behavior\":\"smooth\"}"],false]);
  oben = 650;
  fireEvent.scroll(flaeche);
  gleich("Scrollen: nah am Ende kein Knopf", !!document.querySelector(".ki-nach-unten"), false);
}

// ---- 15. Abbau --------------------------------------------------------------------------------------------------------------------
async function pruefeAbbau(): Promise<void> {
  await setze({ sprachmodus: false });
  const { unmount } = await zeigeChat(KURZ);
  const vorher = [leseChatStand().bereit, taktSpeicher.refs!.halte.current === LIVE.halte, leseGerade() !== null];
  protokoll.leere();
  unmount();
  await ausloesen(() => entsperreTon());
  // Ausdrücklich === null: über JSON sähe eine stehengebliebene Funktion im Array genauso aus wie null.
  gleich(
    "Abbau: Stand nicht mehr bereit, Takt und Bus freigegeben",
    [vorher, leseChatStand(), taktSpeicher.refs!.halte.current === null, taktSpeicher.refs!.stand.current === null, leseGerade() === null, ohneEingang()],
    [[true,true,true],{"beschaeftigt":false,"spricht":false,"laedt":false,"antwort":"","einwilligungFehlt":false,"fehler":false,"bereit":false},true,true,true,[]],
  );
}

// ---- 16. KiPane: verfügbar, zu, offen --------------------------------------------------------------------------------------------
async function zeigePane(eigenschaften: { agentFaehig?: boolean; einstellungenZeigen?: boolean; pruefungBereiche?: readonly Pruefbereich[] } = {}) {
  uhr = installiereUhr({ datum: ZEIT });
  const ansicht = rendereMitTexten(
    <KiPane
      verlauf={[]}
      agentFaehig={eigenschaften.agentFaehig ?? true}
      einstellungenZeigen={eigenschaften.einstellungenZeigen}
      pruefungBereiche={eigenschaften.pruefungBereiche}
    />,
  );
  await abwarten();
  return ansicht;
}
const huelle = () => document.querySelector("aside")!;
/** Die Hülle ohne den Inhalt des Chats (den prüfen die Fälle oben). */
const paneHtml = () => {
  const kopie = huelle().cloneNode(true) as Element;
  kopie.querySelector(".ki-chat")?.replaceWith("[Chat]");
  return ohneSvg(kopie.outerHTML);
};
const hintergrund = () => html(document.querySelector(".ki-pane-hintergrund"));
const ansichten = () =>
  [...document.querySelectorAll(".ki-pane__koerper > .ki-pane__ansicht")].map((a) => `${a.className}|inert=${a.hasAttribute("inert")}|${a.firstElementChild?.className ?? ""}`);
const kopfKnoepfe = () =>
  [...document.querySelectorAll(".ki-pane__werkzeuge button")].map(
    (b) => `${b.getAttribute("aria-label")}|${b.getAttribute("title")}|${b.getAttribute("aria-pressed") ?? "-"}|${b.querySelector("svg")?.getAttribute("class")}`,
  );
const kopfKnopf = (label: string) => document.querySelector<HTMLButtonElement>(`.ki-pane__kopf button[aria-label="${label}"]`)!;
const breite = () => document.documentElement.style.getPropertyValue("--ki-pane-breite");

async function pruefePaneGrundform(): Promise<void> {
  await setze({ verfuegbar: false });
  const leer = await zeigePane();
  gleich("Pane: ohne Verfügbarkeit nichts", leer.container.innerHTML, "");
  leer.unmount();
  uhr.deinstalliere();
  await setze({ verfuegbar: true, offen: false, haustierPhase: "arbeitet" });
  const { textFehler } = await zeigePane({ pruefungBereiche: ["audit", "steuer"] });
  gleich("Pane zu: Hintergrund und Hülle", [hintergrund(), paneHtml()], ["<button type=\"button\" tabindex=\"-1\" aria-label=\"Schließen\" class=\"ki-pane-hintergrund print:hidden\"></button>","<aside aria-label=\"KI-Assistent\" aria-hidden=\"true\" data-phase=\"arbeitet\" inert=\"\" class=\"ki-pane-huelle print:hidden ki-pane-huelle--agentseite\"><div class=\"ki-pane\"><div role=\"separator\" aria-orientation=\"vertical\" aria-label=\"Breite ändern: ziehen oder Pfeiltasten, Doppelklick setzt zurück\" aria-valuemin=\"352\" aria-valuemax=\"960\" tabindex=\"0\" title=\"Breite ändern: ziehen oder Pfeiltasten, Doppelklick setzt zurück\" class=\"ki-griff\"></div><header class=\"ki-pane__kopf\"><div class=\"ki-pane__titel\"><span class=\"ki-pane__zeichen\" aria-hidden=\"true\"><i class=\"himbeere\" data-groesse=\"26\"></i></span>KI-Assistent</div><div class=\"ki-pane__werkzeuge\"><button type=\"button\" aria-label=\"In die Mitte holen\" title=\"In die Mitte holen\" class=\"ki-pane__knopf\"><svg class=\"lucide lucide-maximize2 h-4 w-4\"/></button><button type=\"button\" aria-pressed=\"false\" aria-label=\"Compliance-Prüfung\" title=\"Compliance-Prüfung\" class=\"ki-pane__knopf\"><svg class=\"lucide lucide-scale h-4 w-4\"/></button><button type=\"button\" aria-pressed=\"false\" aria-label=\"Einstellungen\" title=\"Einstellungen\" class=\"ki-pane__knopf\"><svg class=\"lucide lucide-settings2 h-4 w-4\"/></button><button type=\"button\" aria-pressed=\"false\" aria-label=\"Mit einem Mitarbeiter sprechen\" title=\"Mit einem Mitarbeiter sprechen\" class=\"ki-pane__knopf\"><svg class=\"lucide lucide-life-buoy h-4 w-4\"/></button><button type=\"button\" aria-label=\"Schließen\" title=\"Schließen\" class=\"ki-pane__knopf\"><svg class=\"lucide lucide-x h-5 w-5 md:h-4 md:w-4\"/></button></div></header><div class=\"ki-pane__koerper\"><div class=\"ki-pane__ansicht\">[Chat]</div></div></div></aside>"]);
  await setze({ offen: true });
  gleich("Pane offen: Hintergrund, Hülle, Knöpfe, Ansichten", [hintergrund(), huelle().getAttribute("aria-hidden"), huelle().hasAttribute("inert"), huelle().className, kopfKnoepfe(), ansichten()], ["<button type=\"button\" tabindex=\"-1\" aria-label=\"Schließen\" class=\"ki-pane-hintergrund print:hidden ki-pane-hintergrund--offen\"></button>","false",false,"ki-pane-huelle print:hidden ki-pane-huelle--offen ki-pane-huelle--agentseite",["In die Mitte holen|In die Mitte holen|-|lucide lucide-maximize2 h-4 w-4","Compliance-Prüfung|Compliance-Prüfung|false|lucide lucide-scale h-4 w-4","Einstellungen|Einstellungen|false|lucide lucide-settings2 h-4 w-4","Mit einem Mitarbeiter sprechen|Mit einem Mitarbeiter sprechen|false|lucide lucide-life-buoy h-4 w-4","Schließen|Schließen|-|lucide lucide-x h-5 w-5 md:h-4 md:w-4"],["ki-pane__ansicht|inert=false|ki-chat"]]);
  protokoll.leere();
  fireEvent.click(kopfKnopf("Schließen"));
  fireEvent.click(document.querySelector(".ki-pane-hintergrund")!);
  fireEvent.click(kopfKnopf("In die Mitte holen"));
  gleich("Pane: Schließen, Hintergrund, Bühne", folge("pane"), ["pane setOffen false","pane setOffen false","pane setDarstellung buehne"]);
  pruefe("Pane: keine fehlenden Texte", textFehler.length === 0, json(textFehler));
}

// ---- 17. KiPane: Ansichten und Agent-Schalter -----------------------------------------------------------------------------------
async function pruefePaneAnsichten(): Promise<void> {
  await zeigePane({ pruefungBereiche: ["audit"] });
  fireEvent.click(kopfKnopf("Einstellungen"));
  gleich("Einstellungen: Knopf gedrückt, Chat verborgen, Modus und Haustier", [kopfKnoepfe(), ansichten(), html(document.querySelector(".ki-einstellung"))], [["In die Mitte holen|In die Mitte holen|-|lucide lucide-maximize2 h-4 w-4","Compliance-Prüfung|Compliance-Prüfung|false|lucide lucide-scale h-4 w-4","Einstellungen|Einstellungen|true|lucide lucide-settings2 h-4 w-4","Mit einem Mitarbeiter sprechen|Mit einem Mitarbeiter sprechen|false|lucide lucide-life-buoy h-4 w-4","Schließen|Schließen|-|lucide lucide-x h-5 w-5 md:h-4 md:w-4"],["ki-pane__ansicht pointer-events-none invisible|inert=true|ki-chat","ki-pane__ansicht space-y-5 overflow-y-auto p-4|inert=false|ki-einstellung"],"<section class=\"ki-einstellung\"><div class=\"ki-einstellung__kopf\"><div class=\"ki-einstellung__titel\"><svg class=\"lucide lucide-bot h-4 w-4\"/>Agent-Modus<span class=\"ki-info\" tabindex=\"0\" aria-describedby=\"ki-modus-info\" aria-label=\"Was ist der Unterschied?\"><svg class=\"lucide lucide-info h-3.5 w-3.5\"/><span role=\"tooltip\" id=\"ki-modus-info\" class=\"ki-info__blase\"><strong>Was ist der Unterschied?</strong><span class=\"ki-info__zeile\"><svg class=\"lucide lucide-message-square-text h-3.5 w-3.5\"/><span><b>Assistent:</b> Antwortet mit Quellenverweisen – Sie entscheiden, wohin es geht.</span></span><span class=\"ki-info__zeile\"><svg class=\"lucide lucide-bot h-3.5 w-3.5\"/><span><b>Agent:</b> Übernimmt den Bildschirm: navigiert, klickt und füllt aus, während er antwortet.</span></span><span class=\"ki-info__fuss\">In beiden Modi warten Aktionen (z. B. eine Aufgabe anlegen) immer auf Ihre Bestätigung.</span></span></span></div><button type=\"button\" role=\"switch\" aria-checked=\"false\" aria-label=\"Agent-Modus\" class=\"ki-schalter\"><span class=\"ki-schalter__knopf\"></span></button></div><p class=\"ki-einstellung__text\">Die KI führt Sie nicht nur, sondern bedient die Anwendung für Sie: Sie öffnet Seiten, klickt, füllt Formulare aus und hebt Abschnitte hervor. Absenden und Löschen bestätigen Sie immer selbst.</p></section>"]);
  protokoll.leere();
  fireEvent.click(screen.getByRole("switch", { name: "Agent-Modus" }));
  gleich("Modus: der Schalter stellt auf Agent", folge("pane"), ["pane setModus agent"]);
  await setze({ modus: "agent" });
  gleich(
    "Modus Agent: Schalter an, Panel als Agent, Abzeichen, Himbeere schwebt",
    [screen.getByRole("switch", { name: "Agent-Modus" }).getAttribute("aria-checked"), document.querySelector(".ki-pane")!.className, html(document.querySelector(".ki-pane__titel"))],
    ["true","ki-pane ki-pane--agent","<div class=\"ki-pane__titel\"><span class=\"ki-pane__zeichen\" aria-hidden=\"true\"><i class=\"himbeere\" data-groesse=\"26\" data-schweben=\"ja\"></i></span>KI-Assistent<span class=\"ki-pane__abzeichen\" title=\"Übernimmt den Bildschirm: navigiert, klickt und füllt aus, während er antwortet.\">Agent</span></div>"],
  );
  protokoll.leere();
  fireEvent.click(screen.getByRole("switch", { name: "Agent-Modus" }));
  gleich("Modus: und zurück auf Assistent", folge("pane"), ["pane setModus assistent"]);
  fireEvent.click(kopfKnopf("Einstellungen"));
  gleich("Einstellungen: ein zweiter Klick führt zum Chat", ansichten(), ["ki-pane__ansicht|inert=false|ki-chat"]);
  fireEvent.click(kopfKnopf("Mit einem Mitarbeiter sprechen"));
  gleich("Hilfe: Text und Formular", [kopfKnoepfe(), ansichten(), html(document.querySelectorAll(".ki-pane__ansicht")[1])], [["In die Mitte holen|In die Mitte holen|-|lucide lucide-maximize2 h-4 w-4","Compliance-Prüfung|Compliance-Prüfung|false|lucide lucide-scale h-4 w-4","Einstellungen|Einstellungen|false|lucide lucide-settings2 h-4 w-4","Mit einem Mitarbeiter sprechen|Mit einem Mitarbeiter sprechen|true|lucide lucide-life-buoy h-4 w-4","Schließen|Schließen|-|lucide lucide-x h-5 w-5 md:h-4 md:w-4"],["ki-pane__ansicht pointer-events-none invisible|inert=true|ki-chat","ki-pane__ansicht space-y-3 overflow-y-auto p-4|inert=false|text-sm leading-6 text-muted-foreground"],"<div class=\"ki-pane__ansicht space-y-3 overflow-y-auto p-4\"><p class=\"text-sm leading-6 text-muted-foreground\">Nicht die gewünschte Antwort erhalten? Übergeben Sie dieses Gespräch an eine Person im Team.</p><form class=\"eskalation-attrappe\"></form></div>"]);
  fireEvent.click(kopfKnopf("Compliance-Prüfung"));
  await abwarten();
  gleich("Prüfung: geladen, sichtbar, die Hilfe ist weg", [kopfKnoepfe(), ansichten(), html(document.querySelector(".pruefung-attrappe"))], [["In die Mitte holen|In die Mitte holen|-|lucide lucide-maximize2 h-4 w-4","Compliance-Prüfung|Compliance-Prüfung|true|lucide lucide-scale h-4 w-4","Einstellungen|Einstellungen|false|lucide lucide-settings2 h-4 w-4","Mit einem Mitarbeiter sprechen|Mit einem Mitarbeiter sprechen|false|lucide lucide-life-buoy h-4 w-4","Schließen|Schließen|-|lucide lucide-x h-5 w-5 md:h-4 md:w-4"],["ki-pane__ansicht pointer-events-none invisible|inert=true|ki-chat","ki-pane__ansicht overflow-y-auto|inert=false|pruefung-attrappe"],"<div class=\"pruefung-attrappe\" data-erlaubt=\"audit\"></div>"]);
  fireEvent.click(kopfKnopf("Compliance-Prüfung"));
  gleich("Prüfung: zurück zum Chat bleibt die Prüfung eingebunden, verborgen", ansichten(), ["ki-pane__ansicht|inert=false|ki-chat","ki-pane__ansicht overflow-y-auto pointer-events-none invisible|inert=true|pruefung-attrappe"]);
  fireEvent.click(kopfKnopf("Mit einem Mitarbeiter sprechen"));
  await setze({ anstoss: { nr: 5, frage: "Was ist mit Lager 2?", zurPruefung: false } });
  gleich("Anstoss: das Panel wechselt zum Chat, die Frage steht im Feld", [ansichten(), feld().value], [["ki-pane__ansicht|inert=false|ki-chat","ki-pane__ansicht overflow-y-auto pointer-events-none invisible|inert=true|pruefung-attrappe"],"Was ist mit Lager 2?"]);
  fireEvent.click(kopfKnopf("Mit einem Mitarbeiter sprechen"));
  await setze({ anstoss: { nr: 5, frage: "Was ist mit Lager 2?", zurPruefung: false } });
  gleich("Anstoss: derselbe Anstoss zählt nicht noch einmal", ansichten(), ["ki-pane__ansicht pointer-events-none invisible|inert=true|ki-chat","ki-pane__ansicht overflow-y-auto pointer-events-none invisible|inert=true|pruefung-attrappe","ki-pane__ansicht space-y-3 overflow-y-auto p-4|inert=false|text-sm leading-6 text-muted-foreground"]);
}

// ---- 18. KiPane: Bühne ----------------------------------------------------------------------------------------------------------
async function pruefePaneBuehne(): Promise<void> {
  await setze({ darstellung: "buehne", modus: "agent" });
  await zeigePane();
  gleich("Bühne: Dialog, Aura, kein Griff, Knopf zum Andocken", [hintergrund(), paneHtml()], ["<button type=\"button\" tabindex=\"-1\" aria-label=\"Schließen\" class=\"ki-pane-hintergrund print:hidden ki-pane-hintergrund--offen ki-pane-hintergrund--buehne\"></button>","<aside aria-label=\"KI-Assistent\" aria-hidden=\"false\" aria-modal=\"true\" role=\"dialog\" data-phase=\"ruhe\" class=\"ki-pane-huelle print:hidden ki-pane-huelle--offen ki-pane-huelle--buehne\"><span class=\"ki-buehne-aura\" aria-hidden=\"true\"><span class=\"ki-buehne-aura__blob ki-buehne-aura__blob--1\"></span><span class=\"ki-buehne-aura__blob ki-buehne-aura__blob--2\"></span><span class=\"ki-buehne-aura__blob ki-buehne-aura__blob--3\"></span></span><div class=\"ki-pane ki-pane--agent\"><header class=\"ki-pane__kopf\"><div class=\"ki-pane__titel\"><span class=\"ki-pane__zeichen\" aria-hidden=\"true\"><i class=\"himbeere\" data-groesse=\"26\" data-schweben=\"ja\"></i></span>KI-Assistent<span class=\"ki-pane__abzeichen\" title=\"Übernimmt den Bildschirm: navigiert, klickt und füllt aus, während er antwortet.\">Agent</span></div><div class=\"ki-pane__werkzeuge\"><button type=\"button\" aria-label=\"Seitlich andocken\" title=\"Seitlich andocken\" class=\"ki-pane__knopf\"><svg class=\"lucide lucide-panel-right h-4 w-4\"/></button><button type=\"button\" aria-pressed=\"false\" aria-label=\"Einstellungen\" title=\"Einstellungen\" class=\"ki-pane__knopf\"><svg class=\"lucide lucide-settings2 h-4 w-4\"/></button><button type=\"button\" aria-pressed=\"false\" aria-label=\"Mit einem Mitarbeiter sprechen\" title=\"Mit einem Mitarbeiter sprechen\" class=\"ki-pane__knopf\"><svg class=\"lucide lucide-life-buoy h-4 w-4\"/></button><button type=\"button\" aria-label=\"Schließen\" title=\"Schließen\" class=\"ki-pane__knopf\"><svg class=\"lucide lucide-x h-5 w-5 md:h-4 md:w-4\"/></button></div></header><div class=\"ki-pane__koerper\"><div class=\"ki-pane__ansicht\">[Chat]</div></div></div></aside>"]);
  protokoll.leere();
  fireEvent.click(kopfKnopf("Seitlich andocken"));
  gleich("Bühne: Andocken", folge("pane"), ["pane setDarstellung seite"]);
  await setze({ offen: false });
  gleich("Bühne zu: kein Dialog-Modal", [huelle().getAttribute("role"), huelle().getAttribute("aria-modal")], ["dialog",null]);
}

// ---- 19. KiPane: Handy ----------------------------------------------------------------------------------------------------------
async function pruefePaneHandy(): Promise<void> {
  medienAbfragen.setze("(max-width: 767.98px)", true);
  await setze({ modus: "agent" });
  await zeigePane({ pruefungBereiche: ["audit"] });
  gleich("Handy: Griff, ein Mehr-Knopf, kein Agent, Seite gesperrt", [paneHtml(), document.documentElement.style.overflow], ["<aside aria-label=\"KI-Assistent\" aria-hidden=\"false\" data-phase=\"ruhe\" class=\"ki-pane-huelle print:hidden ki-pane-huelle--offen ki-pane-huelle--agentseite\"><div class=\"ki-pane\"><div role=\"separator\" aria-orientation=\"vertical\" aria-label=\"Breite ändern: ziehen oder Pfeiltasten, Doppelklick setzt zurück\" aria-valuemin=\"352\" aria-valuemax=\"960\" tabindex=\"0\" title=\"Breite ändern: ziehen oder Pfeiltasten, Doppelklick setzt zurück\" class=\"ki-griff\"></div><button type=\"button\" aria-label=\"Panel vergrößern\" title=\"Panel vergrößern\" class=\"ki-pane__handygriff\"><span aria-hidden=\"true\"></span></button><header class=\"ki-pane__kopf\"><div class=\"ki-pane__titel\"><span class=\"ki-pane__zeichen\" aria-hidden=\"true\"><i class=\"himbeere\" data-groesse=\"26\"></i></span>KI-Assistent</div><div class=\"ki-pane__werkzeuge\"><button type=\"button\" aria-pressed=\"false\" aria-label=\"Mehr\" title=\"Mehr\" class=\"ki-pane__knopf\"><svg class=\"lucide lucide-ellipsis h-5 w-5\"/></button><button type=\"button\" aria-label=\"Schließen\" title=\"Schließen\" class=\"ki-pane__knopf\"><svg class=\"lucide lucide-x h-5 w-5 md:h-4 md:w-4\"/></button></div></header><div class=\"ki-pane__koerper\"><div class=\"ki-pane__ansicht\">[Chat]</div></div></div></aside>","hidden"]);
  const griff = () => document.querySelector<HTMLButtonElement>(".ki-pane__handygriff")!;
  fireEvent.click(griff());
  gleich("Handy: der Griff macht das Panel groß", [huelle().className, griff().getAttribute("aria-label"), griff().title], ["ki-pane-huelle print:hidden ki-pane-huelle--offen ki-pane-huelle--agentseite ki-pane-huelle--gross","Panel verkleinern","Panel verkleinern"]);
  fireEvent.click(griff());
  gleich("Handy: und wieder klein", [huelle().className, griff().getAttribute("aria-label")], ["ki-pane-huelle print:hidden ki-pane-huelle--offen ki-pane-huelle--agentseite","Panel vergrößern"]);
  protokoll.leere();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.keyDown(document, { key: "Enter" });
  gleich("Handy: Escape schließt, andere Tasten nicht", folge("pane"), ["pane setOffen false"]);
  fireEvent.click(kopfKnopf("Mehr"));
  gleich("Handy: Mehr-Ansicht mit Zeilen", [kopfKnoepfe(), ansichten(), html(document.querySelector(".ki-pane__ansicht.space-y-2"))], [["Mehr|Mehr|true|lucide lucide-chevron-left h-5 w-5","Schließen|Schließen|-|lucide lucide-x h-5 w-5 md:h-4 md:w-4"],["ki-pane__ansicht pointer-events-none invisible|inert=true|ki-chat","ki-pane__ansicht space-y-2 overflow-y-auto p-4|inert=false|flex h-[var(--blatt-zeile-h)] w-full items-center gap-3 rounded-xl border px-3 text-left text-base font-bold transition-colors border-border text-foreground hover:bg-muted"],"<div class=\"ki-pane__ansicht space-y-2 overflow-y-auto p-4\"><button type=\"button\" class=\"flex h-[var(--blatt-zeile-h)] w-full items-center gap-3 rounded-xl border px-3 text-left text-base font-bold transition-colors border-border text-foreground hover:bg-muted\"><span class=\"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground\"><svg class=\"lucide lucide-scale h-5 w-5\"/></span><span class=\"min-w-0 flex-1 truncate\">Compliance-Prüfung</span><svg class=\"lucide lucide-chevron-right h-4 w-4 shrink-0 text-muted-foreground\"/></button><button type=\"button\" class=\"flex h-[var(--blatt-zeile-h)] w-full items-center gap-3 rounded-xl border px-3 text-left text-base font-bold transition-colors border-border text-foreground hover:bg-muted\"><span class=\"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground\"><svg class=\"lucide lucide-settings2 h-5 w-5\"/></span><span class=\"min-w-0 flex-1 truncate\">Einstellungen</span><svg class=\"lucide lucide-chevron-right h-4 w-4 shrink-0 text-muted-foreground\"/></button><button type=\"button\" class=\"flex h-[var(--blatt-zeile-h)] w-full items-center gap-3 rounded-xl border px-3 text-left text-base font-bold transition-colors border-border text-foreground hover:bg-muted\"><span class=\"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground\"><svg class=\"lucide lucide-life-buoy h-5 w-5\"/></span><span class=\"min-w-0 flex-1 truncate\">Mit einem Mitarbeiter sprechen</span><svg class=\"lucide lucide-chevron-right h-4 w-4 shrink-0 text-muted-foreground\"/></button></div>"]);
  fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
  gleich("Handy: Einstellungen ohne Modus-Schalter", [kopfKnoepfe(), ansichten(), !!document.querySelector(".ki-einstellung"), !!document.querySelector(".haustier-einstellung-attrappe")], [["Mehr|Mehr|false|lucide lucide-chevron-left h-5 w-5","Schließen|Schließen|-|lucide lucide-x h-5 w-5 md:h-4 md:w-4"],["ki-pane__ansicht pointer-events-none invisible|inert=true|ki-chat","ki-pane__ansicht space-y-5 overflow-y-auto p-4|inert=false|haustier-einstellung-attrappe"],false,true]);
  fireEvent.click(kopfKnopf("Mehr"));
  fireEvent.click(screen.getByRole("button", { name: "Compliance-Prüfung" }));
  await abwarten();
  gleich("Handy: Prüfung aus der Mehr-Ansicht", ansichten(), ["ki-pane__ansicht pointer-events-none invisible|inert=true|ki-chat","ki-pane__ansicht overflow-y-auto|inert=false|pruefung-attrappe"]);
  fireEvent.click(kopfKnopf("Mehr"));
  fireEvent.click(kopfKnopf("Mehr"));
  fireEvent.click(kopfKnopf("Mehr"));
  gleich("Handy: Mehr aus dem Chat und zurück", [kopfKnoepfe(), ansichten()], [["Mehr|Mehr|true|lucide lucide-chevron-left h-5 w-5","Schließen|Schließen|-|lucide lucide-x h-5 w-5 md:h-4 md:w-4"],["ki-pane__ansicht pointer-events-none invisible|inert=true|ki-chat","ki-pane__ansicht overflow-y-auto pointer-events-none invisible|inert=true|pruefung-attrappe","ki-pane__ansicht space-y-2 overflow-y-auto p-4|inert=false|flex h-[var(--blatt-zeile-h)] w-full items-center gap-3 rounded-xl border px-3 text-left text-base font-bold transition-colors border-border text-foreground hover:bg-muted"]]);
  await ausloesen(() => medienAbfragen.setze("(max-width: 767.98px)", false));
  gleich("Handy zu Schreibtisch: aus der Mehr-Ansicht wird der Chat, Seite frei", [kopfKnoepfe(), ansichten(), document.documentElement.style.overflow, !!document.querySelector(".ki-pane__handygriff")], [["In die Mitte holen|In die Mitte holen|-|lucide lucide-maximize2 h-4 w-4","Compliance-Prüfung|Compliance-Prüfung|false|lucide lucide-scale h-4 w-4","Einstellungen|Einstellungen|false|lucide lucide-settings2 h-4 w-4","Mit einem Mitarbeiter sprechen|Mit einem Mitarbeiter sprechen|false|lucide lucide-life-buoy h-4 w-4","Schließen|Schließen|-|lucide lucide-x h-5 w-5 md:h-4 md:w-4"],["ki-pane__ansicht|inert=false|ki-chat","ki-pane__ansicht overflow-y-auto pointer-events-none invisible|inert=true|pruefung-attrappe"],"",false]);
  await ausloesen(() => medienAbfragen.setze("(max-width: 767.98px)", true));
  await setze({ offen: false });
  protokoll.leere();
  fireEvent.keyDown(document, { key: "Escape" });
  gleich("Handy zu: kein Escape, keine Sperre", [folge("pane"), document.documentElement.style.overflow], [[],""]);
}

// ---- 20. KiPane: Breite für die Prüfung ------------------------------------------------------------------------------------------
async function pruefePaneBreite(): Promise<void> {
  setzeFenster({ breite: 1600 }, false);
  const haupt = document.body.appendChild(document.createElement("main"));
  haupt.id = "main";
  setzeRechteck(haupt, { left: 200, width: 1000 });
  await zeigePane({ pruefungBereiche: ["audit"] });
  setzeRechteck(huelle(), { width: 400 });
  const pruefung = () => fireEvent.click(kopfKnopf("Compliance-Prüfung"));
  const vorher = breite();
  pruefung();
  await abwarten();
  const waehrend = breite();
  pruefung();
  gleich("Breite: die Prüfung verbreitert vorübergehend und gibt die Breite zurück", [vorher, waehrend, breite()], ["","600px",""]);
  document.documentElement.style.setProperty("--ki-pane-breite", "500px");
  pruefung();
  const mit = breite();
  pruefung();
  gleich("Breite: eine gesetzte Breite kommt danach wieder", [mit, breite()], ["600px","500px"]);
  pruefung();
  document.documentElement.style.setProperty("--ki-pane-breite", "650px");
  pruefung();
  gleich("Breite: hat der Nutzer dazwischen gezogen, bleibt seine Breite", breite(), "650px");
  document.documentElement.style.removeProperty("--ki-pane-breite");
  setzeRechteck(huelle(), { width: 590 });
  pruefung();
  const breitGenug = breite();
  pruefung();
  gleich("Breite: ist das Panel schon breit genug, bleibt alles", [breitGenug, breite()], ["",""]);
  setzeRechteck(huelle(), { width: 300 });
  setzeFenster({ breite: 1100 }, false);
  pruefung();
  const schmal = breite();
  pruefung();
  gleich("Breite: im schmalen Fenster höchstens bis zum Minimum", [schmal, breite()], ["352px",""]);
  setzeFenster({ breite: 1600 }, false);
  await setze({ offen: false });
  pruefung();
  const zu = breite();
  pruefung();
  gleich("Breite: bei geschlossenem Panel nichts", zu, "");
}

// ---- 21. KiPane ohne Agent-Anbieter -----------------------------------------------------------------------------------------------
async function pruefePaneOhneAgent(): Promise<void> {
  const ohne = await zeigePane({ agentFaehig: false });
  gleich("Ohne Agent und ohne Einstellungen: nur Bühne und Hilfe", [huelle().className, kopfKnoepfe()], ["ki-pane-huelle print:hidden ki-pane-huelle--offen",["In die Mitte holen|In die Mitte holen|-|lucide lucide-maximize2 h-4 w-4","Mit einem Mitarbeiter sprechen|Mit einem Mitarbeiter sprechen|false|lucide lucide-life-buoy h-4 w-4","Schließen|Schließen|-|lucide lucide-x h-5 w-5 md:h-4 md:w-4"]]);
  ohne.unmount();
  uhr.deinstalliere();
  await zeigePane({ agentFaehig: false, einstellungenZeigen: true });
  gleich("Ohne Agent: altes Chatfenster, Einstellungen da", [huelle().className, kopfKnoepfe(), html(document.querySelector(".chat-fenster-attrappe")?.parentElement)], ["ki-pane-huelle print:hidden ki-pane-huelle--offen",["In die Mitte holen|In die Mitte holen|-|lucide lucide-maximize2 h-4 w-4","Einstellungen|Einstellungen|false|lucide lucide-settings2 h-4 w-4","Mit einem Mitarbeiter sprechen|Mit einem Mitarbeiter sprechen|false|lucide lucide-life-buoy h-4 w-4","Schließen|Schließen|-|lucide lucide-x h-5 w-5 md:h-4 md:w-4"],"<div class=\"h-full overflow-y-auto p-4\"><div class=\"chat-fenster-attrappe\" data-nachrichten=\"0\"></div></div>"]);
  fireEvent.click(kopfKnopf("Einstellungen"));
  gleich("Ohne Agent: Einstellungen nur mit Haustier", [!!document.querySelector(".ki-einstellung"), !!document.querySelector(".haustier-einstellung-attrappe")], [false,true]);
}

// ---- 22. Moduswechsel zwischen Frage und Freigabe --------------------------------------------------------------------------------
/** Eine Antwort mit einem Schritt mit Ziel (r<nr>) und einer Aktionskarte (g<nr>), die auf Freigabe wartet. */
async function schrittUndFreigabe(nachricht: string, frageText: string, nr: number): Promise<void> {
  const strom = antwortStrom();
  await frage(frageText);
  await stuecke(
    strom,
    ...anfang(nachricht),
    { type: "tool-input-available", toolCallId: `r${nr}`, toolName: "risikoRadarAbrufen", input: { bereich: "kuehlkette" } },
    { type: "tool-output-available", toolCallId: `r${nr}`, output: { ziel: "/dashboard/risiko", bereich: "kuehlkette" } },
    ...text("t1", "Ich lege sie an."),
    { type: "tool-input-available", toolCallId: `g${nr}`, toolName: "aufgabeAnlegen", input: { reihenblockCode: "RB-1" } },
    { type: "tool-approval-request", approvalId: `f${nr}`, toolCallId: `g${nr}` },
    ...ENDE,
  );
  await schliesse(strom);
}
/** Die Folgeanfrage nach der Freigabe: die Aktion gelingt und nennt ihr Ziel. */
async function aktionGelingt(strom: StromAttrappe, nr: number): Promise<void> {
  await stuecke(
    strom,
    { type: "start-step" },
    { type: "tool-output-available", toolCallId: `g${nr}`, output: { ok: true, text: "Angelegt.", ziel: "/dashboard/aufgaben" } },
    ...text("t2", "Fertig."),
    ...ENDE,
  );
  await schliesse(strom);
}

async function pruefeModuswechsel(): Promise<void> {
  await zeigeChat(KURZ);
  await schrittUndFreigabe(id(30), "Leg eine Aufgabe an", 1);
  gleich("Moduswechsel: im Assistent-Modus keine Tour, die Karte wartet", [folge("pane"), !!document.querySelector(".ki-aktion--freigabe")], [[],true]);
  // Umschalten zwischen Frage und Freigabe, danach ein weiterer Render, der mit dem Modus nichts zu tun hat.
  await setze({ modus: "agent" });
  await setze({ haustierPhase: "arbeitet" });
  const strom = antwortStrom();
  protokoll.leere();
  fireEvent.click(knopf("Bestätigen"));
  await abwarten();
  // Die Freigabe hält den Modus fest, in dem sie erteilt wird: der Zug läuft als Agent weiter, und die Tour holt auch den
  // Schritt mit Ziel nach, der vor dem Umschalten in derselben Antwort fertig wurde.
  gleich("Moduswechsel per Klick: die Freigabe gilt im neuen Modus, mit Nachtour für den Schritt davor", [folge("pane"), koerper(2)?.modus], [["pane fuehreZu /dashboard/risiko | Risiko-Radar"],"agent"]);
  await aktionGelingt(strom, 1);
  gleich("Moduswechsel per Klick: das Ergebnis der Aktion öffnet seine Ansicht, die Seite lädt neu", [folge("pane"), navigation.verlauf], [["pane fuehreZu /dashboard/risiko | Risiko-Radar","pane fuehreZu /dashboard/aufgaben | Pflückaufgaben"],["refresh"]]);

  // Jetzt umgekehrt und über den Sprachmodus-Bus: gefragt als Agent, freigegeben als Assistent.
  protokoll.leere();
  await schrittUndFreigabe(id(31), "Noch eine Aufgabe", 2);
  gleich("Moduswechsel: im Agent-Modus folgt die Tour sofort", folge("pane"), ["pane fuehreZu /dashboard/risiko | Risiko-Radar"]);
  await setze({ modus: "assistent" });
  await setze({ haustierPhase: "ruhe" });
  const strom2 = antwortStrom();
  protokoll.leere();
  await ausloesen(() => entscheideFreigabe(true, leseFreigabeAnfrage()!.nr));
  await abwarten();
  await aktionGelingt(strom2, 2);
  gleich("Moduswechsel per Bus: als Assistent freigegeben keine Tour, die Seite lädt neu", [folge("pane"), koerper(4)?.modus, navigation.verlauf], [[],"assistent",["refresh","refresh"]]);
}

// ---- 23. Ziel, Aktion und neue Freigabekarte in einem Takt -----------------------------------------------------------------------
async function pruefeDrosseltakt(): Promise<void> {
  await zeigeChat(KURZ);
  await setze({ modus: "agent" });
  reihenfolge.an = true;
  const strom = antwortStrom();
  await frage("Leg an und melde");
  await stuecke(strom, ...anfang(id(32)), { type: "text-start", id: "t1" }, { type: "text-delta", id: "t1", delta: "Ich lege an" });
  protokoll.leere();
  // Alles nach dem ersten Stück fällt in dieselbe Drosselung (80 ms) und damit in denselben Render.
  await stuecke(
    strom,
    { type: "text-delta", id: "t1", delta: " und melde." },
    { type: "text-end", id: "t1" },
    { type: "tool-input-available", toolCallId: "k1", toolName: "aufgabeAnlegen", input: { reihenblockCode: "RB-1" } },
    { type: "tool-output-available", toolCallId: "k1", output: { ok: true, text: "Angelegt.", ziel: "/dashboard/aufgaben" } },
    { type: "tool-input-available", toolCallId: "k2", toolName: "reklamationAnlegen", input: { betreff: "Druck" } },
    { type: "tool-approval-request", approvalId: "f2", toolCallId: "k2" },
  );
  gleich("Drosseltakt: erst Neuladen, dann Tour, dann die neue Karte an den Sprachmodus", folge("router", "pane", "bus"), ["router refresh","pane fuehreZu /dashboard/aufgaben | Pflückaufgaben","bus freigabe Reklamation melden: Betreff: Druck"]);
  await stuecke(strom, ...ENDE);
  await schliesse(strom);
  gleich("Drosseltakt: danach nichts doppelt", folge("router", "pane", "bus"), ["router refresh","pane fuehreZu /dashboard/aufgaben | Pflückaufgaben","bus freigabe Reklamation melden: Betreff: Druck"]);
}

// ---- 24. Stopp mit offenem Werkzeug, danach eine neue Frage ---------------------------------------------------------------------
async function pruefeStoppMitWerkzeug(): Promise<void> {
  await zeigeChat(KURZ);
  await setze({ modus: "agent" });
  let freigeben = () => {};
  const tor = new Promise<void>((weiter) => (freigeben = weiter));
  lage.uiWerkzeug = async (_name, eingabe, umgebung) => {
    await tor;
    const ja = await umgebung.bestaetigen({ absicht: String(eingabe.absicht), label: "Löschen", grund: "senden" });
    return { ok: ja };
  };
  const strom = antwortStrom();
  await frage("Lösch den Eintrag");
  await stuecke(strom, ...anfang(id(33)), { type: "tool-input-available", toolCallId: "c1", toolName: "klicke", input: { ref: "e7", absicht: "Eintrag löschen" } }, ...ENDE);
  await schliesse(strom);
  protokoll.leere();
  await ausloesen(() => freigeben());
  gleich("Stopp: die Klickkarte erscheint, der Chat läuft zu ihr, Stoppen bleibt", [!!document.querySelector(".ki-aktion--freigabe"), folge("dom"), !!screen.queryByRole("button", { name: "Stoppen" })], [true,["dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}"],true]);
  protokoll.leere();
  fireEvent.click(knopf("Stoppen"));
  await abwarten();
  await uhr.vor(100);
  gleich(
    "Stopp mit offenem Werkzeug: die Karte gilt als abgelehnt, nichts geht zurück, der Chat ist frei",
    [!!document.querySelector(".ki-aktion--freigabe"), leseFreigabeAnfrage(), netz.aufrufe.length, !!screen.queryByRole("button", { name: "Stoppen" }), ohneEingang()],
    [false,null,1,false,["sprache stoppeAlles","takt neuerZug","dom scrollTo div.ki-chat__verlauf {\"top\":0,\"behavior\":\"auto\"}","haustier ruhe |  | neutral"]],
  );
  // Eine neue Frage gibt die Werkzeuge wieder frei (Schleifenschutz und Abbruch zurückgesetzt).
  lage.uiWerkzeug = async () => ({ ok: true, text: "Seite gelesen" });
  const strom2 = antwortStrom();
  await frage("Was steht auf der Seite?");
  protokoll.leere();
  await stuecke(strom2, ...anfang(id(34)), { type: "tool-input-available", toolCallId: "s1", toolName: "seiteLesen", input: {} }, ...ENDE);
  const strom3 = antwortStrom();
  await schliesse(strom2);
  await uhr.vor(200);
  gleich(
    "Nach dem Stopp: das Werkzeug der neuen Frage läuft, sein Ergebnis geht zurück",
    [folge("takt", "ui", "fetch"), (koerper(3)?.messages as { parts: unknown[] }[] | undefined)?.at(-1)?.parts.at(-1)],
    [["takt vorAusfuehrung seiteLesen","ui seiteLesen {} agentModus=true","fetch POST /api/ki-assistent"],{"type":"tool-seiteLesen","toolCallId":"s1","state":"output-available","input":{},"output":{"ok":true,"text":"Seite gelesen"}}],
  );
  await stuecke(strom3, { type: "start-step" }, ...text("t1", "Eine Tabelle."), ...ENDE);
  await schliesse(strom3);
}

// ---- 25. Scrollen bei Freigabe und bei jedem Wechsel der Abhängigkeiten -----------------------------------------------------------
async function pruefeScrollAbhaengigkeiten(): Promise<void> {
  await zeigeChat(KURZ);
  const flaeche = document.querySelector<HTMLElement>(".ki-chat__verlauf")!;
  let oben = 700;
  Object.defineProperty(flaeche, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(flaeche, "clientHeight", { configurable: true, value: 300 });
  Object.defineProperty(flaeche, "scrollTop", { configurable: true, get: () => oben, set: (w: number) => (oben = w) });
  protokoll.leere();
  await setze({ offen: false });
  await setze({ offen: true });
  gleich("Scrollen: Panel zu und wieder auf läuft jedes Mal ans Ende", folge("dom"), ["dom scrollTo div.ki-chat__verlauf {\"top\":1000,\"behavior\":\"auto\"}","dom scrollTo div.ki-chat__verlauf {\"top\":1000,\"behavior\":\"auto\"}"]);
  await aktionBisFreigabe();
  oben = 100;
  fireEvent.scroll(flaeche);
  const strom = antwortStrom();
  protokoll.leere();
  fireEvent.click(knopf("Bestätigen"));
  await abwarten();
  gleich("Scrollen: die Freigabe holt den Chat ans Ende zurück (der Knopf bleibt, bis gescrollt wird)", [folge("dom"), !!document.querySelector(".ki-nach-unten")], [["dom scrollTo div.ki-chat__verlauf {\"top\":1000,\"behavior\":\"auto\"}","dom scrollTo div.ki-chat__verlauf {\"top\":1000,\"behavior\":\"auto\"}"],true]);
  await stuecke(strom, { type: "start-step" }, { type: "tool-output-available", toolCallId: "g1", output: { ok: true, text: "Angelegt." } }, ...text("t2", "Fertig."), ...ENDE);
  await schliesse(strom);
  netz.antworte("POST /api/ki-assistent", { status: 500, text: "kaputt" }, { einmal: true });
  oben = 700;
  fireEvent.scroll(flaeche);
  protokoll.leere();
  await frage("Und jetzt?");
  await uhr.vor(100);
  gleich("Scrollen: Senden und jeder Wechsel des Status bis zum Fehler laufen ans Ende", [folge("dom"), !!fehler()], [["dom scrollTo div.ki-chat__verlauf {\"top\":1000,\"behavior\":\"auto\"}","dom scrollTo div.ki-chat__verlauf {\"top\":1000,\"behavior\":\"auto\"}"],true]);
}

// ---- 26. und 27. Sprachmodus: Leerzustand, Statustext, Ausschnitt des Verlaufs ----------------------------------------------------
async function pruefeSprachmodusLeer(): Promise<void> {
  const { textFehler } = await zeigeChat();
  await setze({ modus: "agent", sprachmodus: true });
  gleich("Sprachmodus leer: Text und Vorschläge des eingestellten Modus, nicht des Sprachmodus", [document.querySelector(".ki-leer__text")?.textContent, vorschlaege()], ["Stellen Sie eine Frage oder geben Sie eine Aufgabe: Der Agent öffnet die passenden Seiten, liest sie, klickt, füllt Felder aus und erklärt unterwegs. Alles, was etwas absendet oder löscht, bestätigen Sie vorher.",["Mach einen vollständigen Risiko-Check und zeig mir alles|true","Lege eine Pflückaufgabe für den ersten freien Reihenblock an: 100 kg, morgen fällig|true","Berechne die Löhne für den letzten Monat|true","Ich möchte reklamieren: Die Beeren kamen matschig an|true"]]);
  pruefe("Sprachmodus leer: keine fehlenden Texte", textFehler.length === 0, json(textFehler));
}

async function pruefeSprachmodusAusschnitt(): Promise<void> {
  // Die letzte Frage vor dem Sprachmodus blieb ohne Antwort: so unterscheiden sich eine und zwei Nachrichten "von davor".
  await zeigeChat([zeile("u0", "nutzer", "Frage eins"), zeile(id(40), "assistent", "Antwort eins"), zeile("u2", "nutzer", "Frage zwei")]);
  await setze({ modus: "agent", sprachmodus: true });
  const strom = antwortStrom();
  await ausloesen(() => stelleSprachFrage("Frage A", ["de"]));
  await abwarten();
  gleich("Sprachmodus: Statuszeile wie im Assistent-Modus, auch wenn der Agent eingestellt ist", [status(), folge("haustier").at(-1)], ["Assistent sucht die reifsten Fakten …","haustier arbeitet | Assistent sucht die reifsten Fakten … | neutral"]);
  gleich("Sprachmodus: von vor seinem Beginn gehen zwei Nachrichten mit, ab einer Frage", kurzVerlauf(koerper(1)), ["user: Frage eins","assistant: Antwort eins","user: Frage zwei","user: Frage A"]);
  await stuecke(strom, ...anfang(id(41)), ...text("t1", "Antwort A"), ...ENDE);
  await schliesse(strom);
  // Sprachmodus aus, eine getippte Frage, Sprachmodus wieder an: das neue Gespräch beginnt bei der Zahl der Nachrichten jetzt.
  await setze({ sprachmodus: false });
  const strom2 = antwortStrom();
  await frage("Frage B");
  await stuecke(strom2, ...anfang(id(42)), ...text("t1", "Antwort B"), ...ENDE);
  await schliesse(strom2);
  gleich("Sprachmodus aus: der ganze Verlauf geht mit", kurzVerlauf(koerper(2)), ["user: Frage eins","assistant: Antwort eins","user: Frage zwei","user: Frage A","assistant: step-start / Antwort A","user: Frage B"]);
  await setze({ sprachmodus: true });
  const strom3 = antwortStrom();
  await ausloesen(() => stelleSprachFrage("Frage C", ["de"]));
  await abwarten();
  gleich("Sprachmodus wieder an: der Ausschnitt beginnt neu", kurzVerlauf(koerper(3)), ["user: Frage B","assistant: step-start / Antwort B","user: Frage C"]);
  await stuecke(strom3, ...anfang(id(43)), ...text("t1", "Antwort C"), ...ENDE);
  await schliesse(strom3);
}

// ---- 28. Unter React.StrictMode -------------------------------------------------------------------------------------------------
async function pruefeStrictMode(): Promise<void> {
  const { unmount } = await zeigeChat(KURZ, true);
  await setze({ modus: "agent" });
  reihenfolge.an = true;
  gleich("StrictMode: Stand, Takt und Bus nach dem doppelten Einhängen", [leseChatStand().bereit, taktSpeicher.refs!.halte.current === LIVE.halte, taktSpeicher.refs!.stand.current === LIVE.gerade, leseGerade() !== null], [true,true,true,true]);
  const strom = antwortStrom();
  await frage("Leg an und melde");
  await stuecke(
    strom,
    ...anfang(id(35)),
    { type: "tool-input-available", toolCallId: "k1", toolName: "aufgabeAnlegen", input: { reihenblockCode: "RB-1" } },
    { type: "tool-output-available", toolCallId: "k1", output: { ok: true, text: "Angelegt.", ziel: "/dashboard/aufgaben" } },
    { type: "tool-input-available", toolCallId: "k2", toolName: "reklamationAnlegen", input: { betreff: "Druck" } },
    { type: "tool-approval-request", approvalId: "f2", toolCallId: "k2" },
    ...ENDE,
  );
  await schliesse(strom);
  const strom2 = antwortStrom();
  await ausloesen(() => entscheideFreigabe(true, leseFreigabeAnfrage()!.nr));
  await abwarten();
  await stuecke(strom2, { type: "start-step" }, { type: "tool-output-available", toolCallId: "k2", output: { ok: true, text: "Gemeldet.", ziel: "/dashboard/reklamationen" } }, ...text("t1", "Erledigt."), ...ENDE);
  await schliesse(strom2);
  gleich("StrictMode: jede Folge genau einmal", [folge("router", "pane", "bus", "fetch"), koerper(2)?.modus], [["fetch POST /api/ki-assistent","router refresh","pane fuehreZu /dashboard/aufgaben | Pflückaufgaben","bus freigabe Reklamation melden: Betreff: Druck","bus freigabe -","fetch POST /api/ki-assistent","router refresh","pane fuehreZu /dashboard/reklamationen | Reklamationen"],"agent"]);
  protokoll.leere();
  unmount();
  gleich("StrictMode: Abbau gibt Stand, Takt und Bus frei", [leseChatStand().bereit, taktSpeicher.refs!.halte.current === null, taktSpeicher.refs!.stand.current === null, leseGerade() === null], [false,true,true,true]);
}

async function main(): Promise<void> {
  ({ KiChat } = await import("@/components/ki/ki-chat"));
  ({ KiPane } = await import("@/components/ki/ki-pane"));
  const konsole = beobachteKonsole();
  const faelle: [string, () => Promise<void>][] = [
    ["leer", pruefeLeer],
    ["verlauf", pruefeVerlauf],
    ["senden", pruefeSendenUndStrom],
    ["agent", pruefeAgent],
    ["aktion-freigabe", pruefeAktionFreigabe],
    ["aktion-abgelehnt", pruefeAktionAbgelehnt],
    ["klick", pruefeKlickFreigabe],
    ["fehler", pruefeFehler],
    ["abbruch", pruefeAbbruch],
    ["diktat", pruefeDiktat],
    ["vorgabe", pruefeVorgabe],
    ["anstoss", pruefeAnstoss],
    ["sprachmodus", pruefeSprachmodus],
    ["scrollen", pruefeScrollen],
    ["abbau", pruefeAbbau],
    ["pane-grundform", pruefePaneGrundform],
    ["pane-ansichten", pruefePaneAnsichten],
    ["pane-buehne", pruefePaneBuehne],
    ["pane-handy", pruefePaneHandy],
    ["pane-breite", pruefePaneBreite],
    ["pane-ohne-agent", pruefePaneOhneAgent],
    ["moduswechsel", pruefeModuswechsel],
    ["drosseltakt", pruefeDrosseltakt],
    ["stopp-werkzeug", pruefeStoppMitWerkzeug],
    ["scroll-abhaengigkeiten", pruefeScrollAbhaengigkeiten],
    ["sprachmodus-leer", pruefeSprachmodusLeer],
    ["sprachmodus-ausschnitt", pruefeSprachmodusAusschnitt],
    ["strictmode", pruefeStrictMode],
  ];
  for (const [name, fall] of faelle) {
    if (process.env.FALL && process.env.FALL !== name) continue;
    await neuerFall();
    await fall();
    pruefe(`${name}: keine Meldung aus jsdom`, umgebungsFehler.length === 0, json(umgebungsFehler));
    pruefe(`${name}: keine unbeantwortete Anfrage ausser dem Netzfehler`, netz.unbeantwortet.length === (name === "fehler" ? 1 : 0), json(netz.unbeantwortet.map((a) => a.url)));
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
