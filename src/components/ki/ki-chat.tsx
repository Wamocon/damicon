"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isDynamicToolUIPart,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { useLocale, useTranslations } from "next-intl";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Calculator,
  Crosshair,
  Eye,
  MousePointerClick,
  PencilLine,
  ChevronsDown,
  Check,
  ClipboardPlus,
  Compass,
  Database,
  Landmark,
  LifeBuoy,
  ListChecks,
  Loader2,
  MessageSquareWarning,
  Radar,
  ShieldAlert,
  Snowflake,
  Square,
  Table2,
  Thermometer,
  TriangleAlert,
  UserRound,
  X, BookOpenCheck, Scale } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { usePersona } from "@/components/dashboard/persona";
import { useHaustierAktionen, useHaustierVorgabe } from "@/components/haustier/haustier-kontext";
import { agentPhase, stimmungAusAntwort } from "@/lib/haustier";
import { Himbeere } from "@/components/ki/himbeere";
import { useKiPane, type KiModus } from "@/components/ki/ki-pane-kontext";
import { AKTIONS_NAMEN, AKTIONS_RECHTE, istAktion, type AktionsName } from "@/lib/ai/aktionen-meta";
import { istClientWerkzeug } from "@/lib/ai/client-werkzeuge-meta";
import { fuehreUiWerkzeugAus, type KlickAnfrage } from "@/components/ki/ui-steuerung";
import { istVorlesbar, stimmeVorhanden, useSprachausgabe, VorlesenKnopf, VorlesenSchalter } from "@/components/ki/sprachausgabe";
import { useLiveSprachausgabe, type LiveAbschnitt } from "@/components/ki/sprachausgabe-live";
import { MikrofonKnopf } from "@/components/ki/mikrofon";
import { DiktatWelle } from "@/components/ki/diktat-welle";
import { mitUmlauten } from "@/lib/text/umlaute";
import { MAX_NACHRICHT_LAENGE, type KiChatNachrichtZeile } from "@/lib/domain/ki-assistent";
import { modules } from "@/lib/modules";
import { hasPermission, type Role } from "@/lib/rbac";
import { BelegAnbieter, QuellenListe, ZitatMarke } from "@/components/ki/ki-quellen";
import { chatFehlerArt } from "@/lib/ai/chat-fehler";
import { zerlege } from "@/lib/markdown-bloecke";
import { belegeAusErgebnis, verlinkeZitate, zitierteKennungen } from "@/lib/wissen/belege";
import { cn } from "@/lib/utils";

// Werkzeugfaehiger Agentenchat im Seitenpanel (ki-pane.tsx) - Vercel AI SDK
// useChat gegen src/app/api/ki-assistent/route.ts. Zwei Modi (siehe
// ki-pane-kontext.tsx), die sich nur darin unterscheiden, WER das Hauptfenster
// bewegt:
//   Assistent - jedes abgerufene Werkzeug erscheint als anklickbarer Schritt;
//               der Nutzer entscheidet, ob er hinspringt.
//   Agent     - sobald ein Werkzeug sein Ergebnis liefert, oeffnet der Chat
//               dessen Ansicht selbst im Hauptfenster (Tour, nacheinander).
// Beide Wege nutzen dasselbe "ziel", das jedes Werkzeug mitliefert.
//
// Aktionen (aktionen.ts) erscheinen nie als stiller Schritt, sondern als
// Freigabekarte: das Modell schlaegt vor, der Nutzer entscheidet.

const werkzeugIcon: Record<string, ComponentType<{ className?: string }>> = {
  mwstStatusAbrufen: Landmark,
  esutdOffeneFristenAbrufen: UserRound,
  complianceUebersichtAbrufen: ShieldAlert,
  kuehlketteAbrufen: Snowflake,
  risikoRadarAbrufen: Radar,
  oeffneBereich: Compass,
  wissenSuchen: BookOpenCheck,
  datenmodellErkunden: Database,
  datenLesen: Table2,
  seiteLesen: Eye,
  klicke: MousePointerClick,
  fuelleFeld: PencilLine,
  scrolleZu: ChevronsDown,
  zeigeAuf: Crosshair,
};

const aktionsIcon: Record<AktionsName, ComponentType<{ className?: string }>> = {
  mwstSchwellePruefen: Landmark,
  aufgabeAnlegen: ClipboardPlus,
  aufgabeStatusSetzen: ListChecks,
  kuehlmessungErfassen: Thermometer,
  reklamationAnlegen: MessageSquareWarning,
  lohnPeriodeBerechnen: Calculator,
  mitarbeiterEinschalten: LifeBuoy,
};

const bekannteBereiche = new Set(modules.map((m) => m.key));
// Obergrenze fuer automatische Folgerunden je Nutzerfrage (Endlosschleifen-Schutz;
// der Server begrenzt die Schritte je Anfrage zusaetzlich).
// Mindestabstand zwischen zwei Aktualisierungen des Chats waehrend des Streamens.
const STREAM_DROSSEL_MS = 80;
const MAX_CLIENT_SCHRITTE = 40;

/** Wahr, wenn der letzte Schritt der Assistentenantwort Client-Werkzeuge enthaelt
 *  und ALLE Werkzeugaufrufe dieses Schritts ein Ergebnis haben - dann muss der
 *  Browser die naechste Runde selbst anstossen. Bewusst enger als
 *  lastAssistantMessageIsCompleteWithToolCalls: ein Schritt mit nur serverseitig
 *  ausgefuehrten Werkzeugen (z. B. nach Erreichen der Schrittgrenze) darf keine
 *  Endlosschleife ausloesen. */
function clientErgebnisseBereit(nachrichten: UIMessage[]): boolean {
  const letzte = nachrichten.at(-1);
  if (!letzte || letzte.role !== "assistant") return false;
  const ab = letzte.parts.map((teil, i) => (teil.type === "step-start" ? i : -1)).filter((i) => i >= 0).at(-1) ?? -1;
  const teile = letzte.parts.slice(ab + 1).filter((teil) => isToolUIPart(teil) || isDynamicToolUIPart(teil));
  if (teile.length === 0) return false;
  if (!teile.some((teil) => (isToolUIPart(teil) || isDynamicToolUIPart(teil)) && istClientWerkzeug(getToolName(teil)))) return false;
  return teile.every(
    (teil) =>
      (isToolUIPart(teil) || isDynamicToolUIPart(teil)) &&
      (teil.state === "output-available" || teil.state === "output-error" || teil.state === "output-denied"),
  );
}
const NAH_AM_ENDE_PX = 96;

interface Schritt {
  id: string;
  name: string;
  zustand: "laeuft" | "fertig" | "fehler";
  ziel: string | null;
  bereich: string | null;
  tabelle: string | null;
  absicht: string | null;
}

interface AktionsErgebnis {
  ok: boolean;
  meldungSchluessel: string | null;
  wert: string | null;
  text: string;
  ziel: string | null;
}

interface AktionsKarte {
  id: string;
  name: AktionsName;
  zustand: "vorbereiten" | "freigabe" | "laeuft" | "erledigt" | "fehlgeschlagen" | "abgelehnt";
  eingabe: Record<string, unknown>;
  approvalId: string | null;
  ergebnis: AktionsErgebnis | null;
}

type Segment =
  | { art: "text"; text: string }
  | { art: "schritte"; schritte: Schritt[] }
  | { art: "aktion"; karte: AktionsKarte };

function verlaufZuNachrichten(verlauf: KiChatNachrichtZeile[]): UIMessage[] {
  return verlauf
    .filter((n) => n.rolle !== "system")
    .map((n) => ({
      id: n.id,
      role: n.rolle === "nutzer" ? ("user" as const) : ("assistant" as const),
      parts: [{ type: "text" as const, text: n.inhalt }],
    }));
}

/** Jedes Werkzeug traegt ein "ziel" (ziele.ts) - nur diese Eigenschaften sind
 *  hier typisiert, die Fachdaten stehen bereits im Antworttext. */
function eigenschaftAusAusgabe(ausgabe: unknown, name: "ziel" | "bereich"): string | null {
  if (typeof ausgabe === "object" && ausgabe !== null && name in ausgabe) {
    const wert = (ausgabe as Record<string, unknown>)[name];
    return typeof wert === "string" ? wert : null;
  }
  return null;
}

/** Ein Client-Werkzeug meldet Erwartbares (abgelehnt, gesperrt, veraltet) als
 *  Ergebnis mit ok: false - im Chat soll das nicht wie ein Erfolg aussehen. */
function ausgabeAbgelehnt(ausgabe: unknown): boolean {
  return typeof ausgabe === "object" && ausgabe !== null && "ok" in ausgabe && (ausgabe as { ok: unknown }).ok === false;
}

function alsAktionsErgebnis(ausgabe: unknown): AktionsErgebnis | null {
  if (typeof ausgabe !== "object" || ausgabe === null || !("ok" in ausgabe)) return null;
  const a = ausgabe as Record<string, unknown>;
  return {
    ok: a.ok === true,
    meldungSchluessel: typeof a.meldungSchluessel === "string" ? a.meldungSchluessel : null,
    wert: typeof a.wert === "string" ? a.wert : null,
    text: typeof a.text === "string" ? a.text : "",
    ziel: typeof a.ziel === "string" ? a.ziel : null,
  };
}

function alsKarte(teil: Parameters<typeof getToolName>[0], name: AktionsName): AktionsKarte {
  const eingabe =
    typeof teil.input === "object" && teil.input !== null ? (teil.input as Record<string, unknown>) : {};
  const basis = { id: teil.toolCallId, name, eingabe, approvalId: null as string | null, ergebnis: null as AktionsErgebnis | null };
  switch (teil.state) {
    case "approval-requested":
      return { ...basis, zustand: "freigabe", approvalId: teil.approval.id };
    case "approval-responded":
      return { ...basis, zustand: teil.approval.approved ? "laeuft" : "abgelehnt", approvalId: teil.approval.id };
    case "output-denied":
      return { ...basis, zustand: "abgelehnt" };
    case "output-error":
      return { ...basis, zustand: "fehlgeschlagen" };
    case "output-available": {
      const ergebnis = alsAktionsErgebnis(teil.output);
      return { ...basis, zustand: ergebnis?.ok ? "erledigt" : "fehlgeschlagen", ergebnis };
    }
    default:
      return { ...basis, zustand: "vorbereiten" };
  }
}

/** Ordnet die Teile einer Assistentennachricht in Textbloecke, Schrittlisten
 *  und Aktionskarten in ihrer Reihenfolge - aufeinanderfolgende Werkzeuge
 *  bilden EINE Liste, aufeinanderfolgender Text EINEN Markdown-Block, damit die
 *  Darstellung unabhaengig davon gleich aussieht, wie das Modell seine Schritte
 *  stueckelt. */
/** Alle Belege, die Wissenssuchen dieser Nachricht geliefert haben (Kennungen sind pro Antwort eindeutig). */
function belegeVonNachricht(nachricht: UIMessage) {
  return nachricht.parts.flatMap((teil) =>
    (isToolUIPart(teil) || isDynamicToolUIPart(teil)) && getToolName(teil) === "wissenSuchen" && teil.state === "output-available"
      ? belegeAusErgebnis(teil.output)
      : [],
  );
}

function textVonNachricht(nachricht: UIMessage): string {
  return nachricht.parts.map((teil) => (teil.type === "text" ? teil.text : "")).join("\n");
}

function segmentiere(nachricht: UIMessage): Segment[] {
  const segmente: Segment[] = [];
  for (const teil of nachricht.parts) {
    if (teil.type === "text") {
      if (!teil.text.trim()) continue;
      const letztes = segmente.at(-1);
      if (letztes?.art === "text") letztes.text += `\n\n${teil.text}`;
      else segmente.push({ art: "text", text: teil.text });
      continue;
    }
    if (!isToolUIPart(teil) && !isDynamicToolUIPart(teil)) continue;
    const name = getToolName(teil);
    if (name === "ohneAnsicht") continue;
    if (istAktion(name)) {
      segmente.push({ art: "aktion", karte: alsKarte(teil, name) });
      continue;
    }
    const eingabe = teil.input as { bereich?: unknown; tabelle?: unknown; absicht?: unknown } | undefined;
    const ausgabe = teil.state === "output-available" ? teil.output : undefined;
    const schritt: Schritt = {
      id: teil.toolCallId,
      name,
      zustand:
        teil.state === "output-available"
          ? istClientWerkzeug(name) && ausgabeAbgelehnt(teil.output)
            ? "fehler"
            : "fertig"
          : teil.state === "output-error"
            ? "fehler"
            : "laeuft",
      ziel: eigenschaftAusAusgabe(ausgabe, "ziel"),
      bereich:
        eigenschaftAusAusgabe(ausgabe, "bereich") ??
        (typeof eingabe?.bereich === "string" ? eingabe.bereich : null),
      tabelle: typeof eingabe?.tabelle === "string" ? eingabe.tabelle : null,
      absicht: typeof eingabe?.absicht === "string" ? eingabe.absicht : null,
    };
    const letztes = segmente.at(-1);
    if (letztes?.art === "schritte") letztes.schritte.push(schritt);
    else segmente.push({ art: "schritte", schritte: [schritt] });
  }
  return segmente;
}

// Vorschlaege je Rolle und Modus: nur, was diese Rolle auch tatsaechlich
// kann - ein Kunde sieht keine Lohn-Vorschlaege. Die Rechte kommen direkt aus
// rbac.ts, dieselbe Quelle wie die Werkzeuge auf dem Server.
function waehleVorschlaege(rolle: Role, modus: KiModus): string[] {
  const darf = (resource: Parameters<typeof hasPermission>[1], verb: Parameters<typeof hasPermission>[2]) =>
    hasPermission(rolle, resource, verb);
  const aktion = (name: AktionsName) => darf(AKTIONS_RECHTE[name].resource, AKTIONS_RECHTE[name].verb);
  const pool: [string, boolean][] =
    modus === "agent"
      ? [
          ["risiko", darf("stammdaten", "view") || darf("personal", "view") || darf("compliance", "view")],
          ["aufgabeAnlegen", aktion("aufgabeAnlegen")],
          ["lohnBerechnen", aktion("lohnPeriodeBerechnen")],
          ["reklamationMelden", aktion("reklamationAnlegen")],
          ["kuehlkette", darf("kuehlkette", "view")],
          ["mwst", darf("stammdaten", "view")],
          ["bereiche", true],
        ]
      : [
          ["risiko", darf("stammdaten", "view") || darf("personal", "view") || darf("compliance", "view")],
          ["mwst", darf("stammdaten", "view")],
          ["kuehlkette", darf("kuehlkette", "view")],
          ["aufgaben", darf("pflueckaufgaben", "view")],
          ["reklamationen", darf("reklamationen", "view")],
          ["bereiche", true],
        ];
  return pool
    .filter(([, erlaubt]) => erlaubt)
    .map(([id]) => `vorschlaege.${modus}.${id}`)
    .slice(0, 4);
}

// Plugins und Komponenten ausserhalb der Komponente: Wuerden sie bei jedem
// Rendern neu angelegt, sieht React fuer jede Tabelle und jeden Link einen
// neuen Komponententyp und baut sie samt DOM jedes Mal neu auf.
const MARKDOWN_PLUGINS = [remarkGfm];
const MARKDOWN_KOMPONENTEN: Components = {
  table: ({ children }) => (
    <div className="ki-md__tabelle">
      <table>{children}</table>
    </div>
  ),
  a: ({ children, href }) =>
    href?.startsWith("quelle:") ? (
      <ZitatMarke kennung={href.slice("quelle:".length)} />
    ) : (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ),
};

// Das Schema "quelle:" (Zitat-Marke, siehe lib/wissen/belege.ts) darf react-markdown
// nicht als unsicheren Link verwerfen; alles andere behaelt die uebliche Pruefung.
const linkPruefung = (url: string) => (url.startsWith("quelle:S") ? url : defaultUrlTransform(url));

// Zwei Ebenen von memo, weil beim Streamen fast alles gleich bleibt:
// - Markdown: fertige Antworten behalten ihren Text und werden gar nicht neu
//   verarbeitet. Vorher wurde bei jedem Wort der GESAMTE Verlauf neu in Markdown
//   gewandelt, der Hauptthread war Sekunden lang blockiert (Vercel meldete
//   INP-Probleme von ueber 4 s auf Klicks im Chat).
// - MarkdownBlock: innerhalb der laufenden Antwort aendert sich nur der letzte,
//   noch offene Block; alles darueber wird nicht erneut geparst oder abgeglichen.
// - Deutsche Schreibweise: liefert ein Modell (oder eine Datenquelle) Ersatzschreibung (ae, oe, ue), zeigt der Chat Umlaute
//   (lib/text/umlaute.ts; Code, Adressen und Kennungen bleiben unberuehrt). Die Anweisung im Prompt bleibt der erste Weg.
const MarkdownBlock = memo(function MarkdownBlock({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_KOMPONENTEN} urlTransform={linkPruefung}>
      {verlinkeZitate(mitUmlauten(text))}
    </ReactMarkdown>
  );
});

const Markdown = memo(function Markdown({ text }: { text: string }) {
  // Zerlegung des vorigen Renders mitfuehren (React-Muster "Werte aus dem
  // vorigen Render ableiten"), damit zerlege() nur den Zuwachs verarbeitet.
  const [zerlegung, setZerlegung] = useState(() => zerlege(text, null));
  let aktuell = zerlegung;
  if (zerlegung.text !== text) {
    aktuell = zerlege(text, zerlegung);
    setZerlegung(aktuell);
  }
  return (
    <div className="ki-md">
      {aktuell.bloecke.map((block, index) => (
        <MarkdownBlock key={index} text={block} />
      ))}
    </div>
  );
});

export function KiChat({ verlauf }: { verlauf: KiChatNachrichtZeile[] }) {
  // Alle Texte dieses Fensters kommen aus der Systemsprache - so wie ueberall
  // sonst in der Anwendung. Bis zum 21.09.2026 wechselte das Fenster je Zug
  // in die erkannte Sprache der Frage; das haengt an einer Erkennung, die bei
  // diktierten Fragen danebenliegt (siehe api/ki-assistent/route.ts).
  const t = useTranslations("kiAssistentAnsicht");
  const aktionenT = useTranslations("aktionen");
  const moduleT = useTranslations("modules");
  const navT = useTranslations("nav");
  const authT = useTranslations("auth");
  const sprache = useLocale();
  const pfad = usePathname();
  const router = useRouter();
  const { role: rolle } = usePersona();
  const { modus, offen, fuehrung, oeffneZiel, fuehreZu, bewegeZeiger, pruefBezug, entferneBezug, anstoss } = useKiPane();

  const [eingabe, setEingabe] = useState("");
  const [diktiert, setDiktiert] = useState(false);
  const [einwilligung, setEinwilligung] = useState(false);
  const [nachUntenKnopf, setNachUntenKnopf] = useState(false);
  const [clientAktiv, setClientAktiv] = useState<string | null>(null);
  const [klickAnfrage, setKlickAnfrage] = useState<(KlickAnfrage & { entscheide: (erlaubt: boolean) => void }) | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const eingabeRef = useRef<HTMLTextAreaElement>(null);
  const klebtUnten = useRef(true);
  const zugModus = useRef<KiModus | null>(null);
  const gefolgt = useRef(new Set<string>());
  const aktualisiert = useRef(new Set<string>());
  const abgebrochen = useRef(false);
  const zugSchritte = useRef(0);
  const chatRef = useRef<{ addToolOutput: (a: never) => unknown; status: string } | null>(null);

  // Was bei JEDER Anfrage mitgeht - auch bei der automatischen Folgeanfrage
  // nach einer Freigabe, die nicht ueber sendMessage() laeuft. Ueber Refs
  // gelesen, damit der einmal angelegte Transport stets den aktuellen Stand
  // sieht.
  // pruefkontext: der Prüfbericht, auf dem das Gespräch aufsetzt (nach einer Compliance-Prüfung), sonst undefined.
  const pruefkontext = pruefBezug?.kontext;
  // Die Sprachen, die beim Diktat gehoert wurden. Sie gehen mit der naechsten
  // Frage an den Server und entscheiden dort ueber die Antwortsprache. Nur
  // fuer den NAECHSTEN Zug: danach wird wieder getippt, und dann zaehlt der
  // Text.
  const diktatSprachen = useRef<string[] | undefined>(undefined);
  const anfrageDaten = useRef<Record<string, unknown>>({ einwilligung, modus, pfad, rolle, sprache, pruefkontext });
  useEffect(() => {
    anfrageDaten.current = { ...anfrageDaten.current, einwilligung, modus, pfad, rolle, sprache, pruefkontext };
  }, [einwilligung, modus, pfad, rolle, sprache, pruefkontext]);

  const initialMessages = useMemo(() => verlaufZuNachrichten(verlauf), [verlauf]);
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ki-assistent", body: () => anfrageDaten.current }),
    [],
  );
  const chat = useChat({
    id: "damicon-ki-assistent",
    messages: initialMessages,
    transport,
    // Ein Wort je 12 ms (smoothStream) waeren ~80 Renderpassagen pro Sekunde;
    // gebuendelt in 80-ms-Schritten sieht der Text genauso fluessig aus, der
    // Hauptthread bleibt aber frei fuer Klicks.
    throttle: STREAM_DROSSEL_MS,
    // Zwei Gruende, ohne Zutun des Nutzers weiterzumachen: er hat eine Aktion
    // freigegeben/abgelehnt, oder der Browser hat ein Client-Werkzeug (Seite
    // lesen, klicken ...) fertig ausgefuehrt und das Ergebnis geht zurueck.
    sendAutomaticallyWhen: (optionen) =>
      lastAssistantMessageIsCompleteWithApprovalResponses(optionen) ||
      (zugSchritte.current <= MAX_CLIENT_SCHRITTE && clientErgebnisseBereit(optionen.messages)),
    onToolCall: ({ toolCall }) => starteClientWerkzeug(toolCall),
  });
  const { messages, sendMessage, addToolApprovalResponse, status, stop, error, setMessages, clearError } = chat;
  chatRef.current = chat as unknown as NonNullable<typeof chatRef.current>;


  const sprachausgabe = useSprachausgabe(sprache);

  // Vorgelesen wird live, wenn der Schalter an ist ODER die Frage diktiert
  // wurde: wer spricht, will hoeren - auch ohne den Schalter je gefunden zu
  // haben. Der Server entscheidet ueber KI_SPRACHAUSGABE_LIVE, ob ueberhaupt
  // Abschnitte kommen; hier steht nur, ob sie gesprochen werden sollen.
  // Gilt fuer GENAU EINEN Zug: wer einmal diktiert hat, bekommt nicht fuer
  // den Rest der Sitzung alles vorgelesen. Beim naechsten Absenden wird neu
  // entschieden.
  const [zugDiktiert, setZugDiktiert] = useState(false);
  const zuletztDiktiert = useRef(false);
  const live = useLiveSprachausgabe(sprachausgabe.vorlesen || zugDiktiert);
  const gesehenerAbschnitt = useRef(new Set<string>());

  const beschaeftigt = status === "submitted" || status === "streaming" || clientAktiv !== null;

  // "Antworten vorlesen" an: die neue Antwort nach Streamende einmal vorlesen -
  // nur beim Wechsel von "laeuft" zu "fertig", nie fuer den geladenen Verlauf
  // und nie zweimal dieselbe Antwort.
  const warBeschaeftigt = useRef(false);
  const vorgelesen = useRef(new Set<string>());
  useEffect(() => {
    const jetztFertig = warBeschaeftigt.current && !beschaeftigt;
    warBeschaeftigt.current = beschaeftigt;
    if (!jetztFertig || !sprachausgabe.vorlesen) return;
    const letzte = messages.at(-1);
    if (!letzte || letzte.role !== "assistant" || !istVorlesbar(letzte.id) || vorgelesen.current.has(letzte.id)) return;
    vorgelesen.current.add(letzte.id);
    void sprachausgabe.spiele(letzte.id);
  }, [beschaeftigt, messages, sprachausgabe]);
  const istErsteNachricht = messages.length === 0;

  function bereichTitel(bereich: string | null): string {
    if (bereich === "uebersicht") return navT("overview");
    if (bereich === "sicherheit") return authT("security");
    return bereich && bekannteBereiche.has(bereich) ? moduleT(`${bereich}.title`) : t("bereichAllgemein");
  }

  function beschriftung(
    gruppe: "werkzeug" | "laeuft" | "ziel",
    name: string,
    teile: { bereich?: string | null; tabelle?: string | null; absicht?: string | null } = {},
  ): string {
    const schluessel = `${gruppe}.${name}`;
    return t.has(schluessel)
      ? t(schluessel, { bereich: bereichTitel(teile.bereich ?? null), tabelle: teile.tabelle ?? "", absicht: teile.absicht ?? "" })
      : t(`${gruppe}.unbekannt`);
  }

  // Automatisches Nachscrollen: folgt dem Text, solange der Nutzer nicht
  // selbst nach oben gescrollt hat. Bewusst OHNE Scroll-Animation: eine
  // animierte Bewegung laeuft ueber mehrere Frames und wuerde von beiScroll()
  // als "Nutzer scrollt nach oben" gelesen - der Chat hoerte mitten in der
  // Antwort auf, mitzulaufen.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !klebtUnten.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [messages, status, offen, klickAnfrage]);

  function beiScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const nah = el.scrollHeight - el.scrollTop - el.clientHeight < NAH_AM_ENDE_PX;
    klebtUnten.current = nah;
    setNachUntenKnopf(!nah);
  }

  function nachUnten() {
    klebtUnten.current = true;
    setNachUntenKnopf(false);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }

  // Nach einer erfolgreichen Aktion die Seite neu laden lassen: die Aktion lief
  // serverseitig, die aktuell offene Ansicht zeigt sonst noch den alten Stand.
  useEffect(() => {
    for (const nachricht of messages) {
      if (nachricht.role !== "assistant") continue;
      for (const teil of nachricht.parts) {
        if (!isToolUIPart(teil) && !isDynamicToolUIPart(teil)) continue;
        if (!istAktion(getToolName(teil)) || teil.state !== "output-available") continue;
        if (aktualisiert.current.has(teil.toolCallId)) continue;
        aktualisiert.current.add(teil.toolCallId);
        if (alsAktionsErgebnis(teil.output)?.ok) router.refresh();
      }
    }
  }, [messages, router]);

  // Panel zu heisst still. Es bleibt gemountet, damit eine laufende
  // Antwort nicht abreisst - gesprochen wird trotzdem nicht weiter.
  useEffect(() => {
    if (!offen) live.stoppeAlles();
  }, [offen, live]);

  // Abschnitte aus dem Stream ans Vorlesen weiterreichen. Jeder nur einmal:
  // useChat liefert die Nachricht bei jedem Render erneut, samt aller schon
  // gesehenen Teile.
  useEffect(() => {
    const letzte = messages.at(-1);
    if (!letzte || letzte.role !== "assistant") return;
    for (const teil of letzte.parts as Array<{ type: string; data?: unknown }>) {
      if (teil.type !== "data-satz" || !teil.data) continue;
      const a = teil.data as LiveAbschnitt & { sprache?: string };
      const schluessel = `${a.zug}#${a.nr}`;
      if (gesehenerAbschnitt.current.has(schluessel)) continue;
      gesehenerAbschnitt.current.add(schluessel);
      // Die Sprache kommt vom Zug, nicht aus der Oberflaeche: der Text
      // antwortet in der Sprache der Frage, und die Stimme folgt ihm.
      live.nimmAbschnitt(a, a.sprache ?? sprache);
    }
  }, [messages, live, sprache]);

  // Agent-Modus: jedes Werkzeugergebnis des LAUFENDEN Zuges oeffnet seine
  // Ansicht im Hauptfenster. zugModus wird beim Absenden festgehalten - wer
  // mitten in einer Antwort auf Agent umschaltet, bekommt keine Nachtour fuer
  // Schritte, die im Assistent-Modus begonnen wurden.
  useEffect(() => {
    if (zugModus.current !== "agent") return;
    const letzte = messages.at(-1);
    if (!letzte || letzte.role !== "assistant") return;
    for (const teil of letzte.parts) {
      if (!isToolUIPart(teil) && !isDynamicToolUIPart(teil)) continue;
      if (teil.state !== "output-available" || gefolgt.current.has(teil.toolCallId)) continue;
      gefolgt.current.add(teil.toolCallId);
      const ziel = eigenschaftAusAusgabe(teil.output, "ziel");
      if (!ziel) continue;
      const name = getToolName(teil);
      const eingabeTeil = teil.input as { tabelle?: unknown } | undefined;
      const label = beschriftung("ziel", name, {
        bereich: eigenschaftAusAusgabe(teil.output, "bereich"),
        tabelle: typeof eingabeTeil?.tabelle === "string" ? eingabeTeil.tabelle : null,
      });
      fuehreZu(ziel, label);
    }
    // beschriftung/t sind pro Render neue Funktionen; relevant ist nur der Nachrichtenstand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, fuehreZu]);

  // Fragt den Nutzer, ob ein riskanter Klick ausgefuehrt werden darf. Die Zusage
  // wird von den Knoepfen der Karte aufgeloest (oder mit "nein", wenn der Nutzer
  // stoppt oder etwas Neues schreibt).
  function frageNutzer(anfrage: KlickAnfrage): Promise<boolean> {
    return new Promise<boolean>((fertig) => {
      setKlickAnfrage({
        ...anfrage,
        entscheide: (erlaubt) => {
          setKlickAnfrage(null);
          fertig(erlaubt);
        },
      });
    });
  }

  async function warteBisBereit(): Promise<void> {
    for (let i = 0; i < 80 && chatRef.current && chatRef.current.status !== "ready" && chatRef.current.status !== "error"; i++) {
      await new Promise((weiter) => window.setTimeout(weiter, 100));
    }
  }

  // Client-Werkzeug (laeuft im Browser): NICHT im onToolCall selbst warten - das
  // Warten dort blockiert die Stream-Verarbeitung des SDK. Stattdessen anstossen,
  // den Stream zu Ende laufen lassen und das Ergebnis danach mit addToolOutput
  // melden; das loest ueber sendAutomaticallyWhen die naechste Runde aus.
  function starteClientWerkzeug(aufruf: { toolName: string; toolCallId: string; input: unknown; dynamic?: boolean }) {
    if (aufruf.dynamic || !istClientWerkzeug(aufruf.toolName)) return;
    void (async () => {
      setClientAktiv(aufruf.toolName);
      zugSchritte.current += 1;
      const ergebnis = await fuehreUiWerkzeugAus(aufruf.toolName, aufruf.input, {
        zeiger: { bewegen: bewegeZeiger },
        bestaetigen: frageNutzer,
        agentModus: anfrageDaten.current.modus === "agent",
      });
      await warteBisBereit();
      setClientAktiv(null);
      if (abgebrochen.current) return;
      void (chatRef.current?.addToolOutput as (a: unknown) => unknown)({
        tool: aufruf.toolName,
        toolCallId: aufruf.toolCallId,
        output: ergebnis,
      });
    })();
  }

  function stopp() {
    // Zuerst die Stimme: wer auf Stopp drueckt, will sofort Ruhe, nicht erst
    // nach dem laufenden Abschnitt.
    live.stoppeAlles();
    abgebrochen.current = true;
    klickAnfrage?.entscheide(false);
    void stop();
    setClientAktiv(null);
  }

  function sende(text: string) {
    const bereinigt = text.trim();
    if (!bereinigt || beschaeftigt) return;
    if (istErsteNachricht && !einwilligung) return;
    // Die vorige Antwort verstummt, bevor die neue beginnt.
    live.stoppeAlles();
    // Auf dem iPhone darf Ton nur aus einer Geste heraus starten - dieser
    // Klick ist die Geste. Spaeter, beim ersten Abschnitt, waere es zu
    // spaet: der Browser bliebe stumm, ohne einen Fehler zu melden.
    live.entsperre();
    zugModus.current = modus;
    abgebrochen.current = false;
    zugSchritte.current = 0;
    klebtUnten.current = true;
    setNachUntenKnopf(false);
    // Die gehoerten Sprachen gelten genau fuer diese eine Frage.
    anfrageDaten.current = { ...anfrageDaten.current, diktatSprachen: diktatSprachen.current };
    diktatSprachen.current = undefined;
    // Und ebenso, ob dieser Zug diktiert wurde: eine getippte Frage danach
    // wird nicht mehr von selbst vorgelesen.
    setZugDiktiert(zuletztDiktiert.current);
    zuletztDiktiert.current = false;
    // Die gesehenen Abschnitte gehoeren zum vorigen Zug - sonst waechst die
    // Liste ueber eine lange Sitzung immer weiter.
    gesehenerAbschnitt.current.clear();
    sendMessage({ text: bereinigt });
    setEingabe("");
    if (eingabeRef.current) eingabeRef.current.style.height = "";
  }

  function absenden(e: FormEvent) {
    e.preventDefault();
    sende(eingabe);
  }

  function beiTaste(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sende(eingabe);
    }
  }

  function beiEingabe(wert: string) {
    // Wer zu tippen beginnt, hoert nicht mehr zu. Erst ab dem zweiten
    // Zeichen: ein einzelner Tastendruck ist oft ein Versehen, und der
    // erkannte Diktattext landet ebenfalls ueber diesen Weg im Feld.
    if (wert.length > 1 && live.spricht) live.stoppeAlles();
    setEingabe(wert);
    const el = eingabeRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }
  }

  function freigabe(karte: AktionsKarte, erlaubt: boolean) {
    if (!karte.approvalId) return;
    zugModus.current = modus;
    klebtUnten.current = true;
    void addToolApprovalResponse({
      id: karte.approvalId,
      approved: erlaubt,
      // Ohne Grund erfindet das Modell gern einen ("das System hat abgelehnt") -
      // dabei hat der Nutzer schlicht nein gesagt.
      reason: erlaubt ? undefined : "Der Nutzer hat die Aktion selbst abgelehnt. Es gab keinen Systemfehler.",
    });
  }

  // Waehrend eines laufenden Zugs: der zuletzt begonnene Werkzeugaufruf, fuer
  // die Statuszeile ("Agent prueft ..."); ohne laufendes Werkzeug "denkt nach".
  const laufenderSchritt = useMemo(() => {
    const letzte = messages.at(-1);
    if (!letzte || letzte.role !== "assistant") return null;
    return (
      segmentiere(letzte)
        .flatMap((s) => (s.art === "schritte" ? s.schritte : []))
        .filter((s) => s.zustand === "laeuft")
        .at(-1) ?? null
    );
  }, [messages]);

  const vorschlaege = useMemo(() => waehleVorschlaege(rolle, modus), [rolle, modus]);
  const zaehler = useMemo(
    () => ({
      bereiche: modules.filter((m) => hasPermission(rolle, m.resource, "view")).length,
      aktionen: AKTIONS_NAMEN.filter((n) => hasPermission(rolle, AKTIONS_RECHTE[n].resource, AKTIONS_RECHTE[n].verb)).length,
    }),
    [rolle],
  );
  const einwilligungFehlt = istErsteNachricht && !einwilligung;
  const letzteId = messages.at(-1)?.id;

  // Himbi (components/haustier) zeigt den Zustand des Agenten auch bei geschlossenem Panel:
  // hier wird nur gemeldet, das Zeichnen uebernimmt Himbi.
  const { melde } = useHaustierAktionen();
  const freigabeOffen =
    klickAnfrage !== null ||
    !!messages.at(-1)?.parts.some((teil) => (isToolUIPart(teil) || isDynamicToolUIPart(teil)) && teil.state === "approval-requested");
  const haustierPhase = agentPhase({ beschaeftigt, freigabeOffen, fehler: !!error });
  const haustierText = !beschaeftigt
    ? ""
    : laufenderSchritt
      ? beschriftung("laeuft", laufenderSchritt.name, {
          bereich: laufenderSchritt.bereich,
          tabelle: laufenderSchritt.tabelle,
          absicht: laufenderSchritt.absicht,
        })
      : t(modus === "agent" ? "agentDenkt" : "assistentDenkt");
  // Wie die fertige Antwort geklungen hat, entscheidet Himbis Gesicht. Bewusst hier und
  // nicht im Modell: kein zweiter Aufruf, keine Wartezeit, und es funktioniert in jeder
  // der fuenf Sprachen der Oberflaeche.
  //
  // Waehrend getippt wird, geht die eigene Nachricht vor: DamiAI reagiert direkt auf das,
  // was gerade im Feld steht, statt erst auf die Antwort zu warten - dieselbe Erkennung,
  // nur auf den eigenen statt den fertigen Text angewendet.
  const eingabeStimmung = useMemo(() => {
    if (beschaeftigt || !eingabe.trim()) return null;
    return stimmungAusAntwort(eingabe);
  }, [eingabe, beschaeftigt]);
  const haustierStimmung = useMemo(() => {
    if (eingabeStimmung) return eingabeStimmung;
    if (beschaeftigt) return "neutral" as const;
    const letzte = messages.at(-1);
    if (!letzte || letzte.role !== "assistant") return "neutral" as const;
    return stimmungAusAntwort(textVonNachricht(letzte));
  }, [eingabeStimmung, messages, beschaeftigt]);
  useEffect(() => {
    melde(haustierPhase, haustierText, haustierStimmung);
  }, [melde, haustierPhase, haustierText, haustierStimmung]);

  // Eine Frage, die Himbi stellen moechte ("Zeig mir das" im Tipp): abschicken, sobald es geht;
  // fehlt noch die Einwilligung oder laeuft gerade eine Antwort, landet sie im Eingabefeld.
  const vorgabe = useHaustierVorgabe();
  const letzteVorgabe = useRef(0);
  useEffect(() => {
    if (!vorgabe || vorgabe.id === letzteVorgabe.current) return;
    letzteVorgabe.current = vorgabe.id;
    if (beschaeftigt || (istErsteNachricht && !einwilligung)) {
      setEingabe(vorgabe.text);
      eingabeRef.current?.focus();
    } else {
      sende(vorgabe.text);
    }
    // sende() und die Zustandswerte sind pro Render neu; ausgeloest wird nur durch eine neue Vorgabe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vorgabe]);

  // Eine Frage zum Ergebnis einer Prüfung (Knopf im Prüfbericht): wie die Vorgabe von Himbi, aber mit dem Bericht als Grundlage.
  // Der Bezug steht zu diesem Zeitpunkt schon im Kontext; die Anfrage liest ihn ueber anfrageDaten.
  const letzterAnstoss = useRef(0);
  useEffect(() => {
    if (!anstoss || anstoss.nr === letzterAnstoss.current) return;
    letzterAnstoss.current = anstoss.nr;
    if (beschaeftigt || (istErsteNachricht && !einwilligung)) {
      setEingabe(anstoss.frage);
      eingabeRef.current?.focus();
    } else {
      // Der Effekt oben hat anfrageDaten noch nicht aktualisiert, wenn Bezug und Anstoss im selben Zug gesetzt werden.
      anfrageDaten.current = { ...anfrageDaten.current, pruefkontext };
      sende(anstoss.frage);
    }
    // sende() und die Zustandswerte sind pro Render neu; ausgeloest wird nur durch einen neuen Anstoss.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anstoss]);

  function aktionsWert(wert: unknown): string {
    const text = String(wert);
    return typeof wert === "string" && t.has(`aktion.werte.${wert}`) ? t(`aktion.werte.${wert}`) : text;
  }

  function aktionsStatusText(karte: AktionsKarte): string {
    switch (karte.zustand) {
      case "vorbereiten": return t("aktion.vorbereiten");
      case "freigabe": return t("aktion.freigabeNoetig");
      case "laeuft": return t("aktion.laeuft");
      case "erledigt": return t("aktion.erledigt");
      case "abgelehnt": return t("aktion.abgelehnt");
      default: return t("aktion.fehlgeschlagen");
    }
  }

  function ergebnisText(ergebnis: AktionsErgebnis): string {
    if (ergebnis.meldungSchluessel && aktionenT.has(ergebnis.meldungSchluessel)) {
      return aktionenT(ergebnis.meldungSchluessel, { wert: ergebnis.wert ?? "" });
    }
    return ergebnis.text;
  }

  function renderAktionskarte(karte: AktionsKarte) {
    const Icon = aktionsIcon[karte.name];
    const felder = Object.entries(karte.eingabe).filter(([, v]) => v !== undefined && v !== null && v !== "");
    const ziel = karte.ergebnis?.ziel ?? null;
    return (
      <div key={karte.id} className={cn("ki-aktion", `ki-aktion--${karte.zustand}`)}>
        <div className="ki-aktion__kopf">
          <span className="ki-aktion__icon">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="ki-aktion__titel">{t(`aktion.titel.${karte.name}`)}</p>
            <p className="ki-aktion__status">
              {karte.zustand === "laeuft" || karte.zustand === "vorbereiten" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : karte.zustand === "erledigt" ? (
                <Check className="h-3 w-3" />
              ) : karte.zustand === "freigabe" ? null : (
                <X className="h-3 w-3" />
              )}
              {aktionsStatusText(karte)}
            </p>
          </div>
        </div>
        {felder.length > 0 ? (
          <dl className="ki-aktion__felder">
            {felder.map(([schluessel, wert]) => (
              <div key={schluessel}>
                <dt>{t.has(`aktion.felder.${schluessel}`) ? t(`aktion.felder.${schluessel}`) : schluessel}</dt>
                <dd>{aktionsWert(wert)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {karte.zustand === "freigabe" ? (
          <div className="ki-aktion__knoepfe">
            <button type="button" onClick={() => freigabe(karte, false)} className="ki-aktion__ablehnen">
              {t("aktion.ablehnen")}
            </button>
            <button type="button" onClick={() => freigabe(karte, true)} className="ki-aktion__bestaetigen">
              <Check className="h-3.5 w-3.5" />
              {t("aktion.bestaetigen")}
            </button>
          </div>
        ) : null}
        {karte.ergebnis ? (
          <p className="ki-aktion__ergebnis">
            {ergebnisText(karte.ergebnis)}
            {karte.zustand === "erledigt" && ziel ? (
              <button
                type="button"
                onClick={() => oeffneZiel(ziel, beschriftung("ziel", karte.name))}
                className="ki-aktion__zeigen"
              >
                {t("aktion.zeigen")}
                <ArrowRight className="h-3 w-3" />
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    );
  }

  // Das ganze Chatfenster spricht die Sprache dieses Gespraechs: der Anbieter
  // legt die Texte der erkannten Sprache ueber die der Oberflaeche, damit auch
  // die Kindkomponenten (Mikrofon, Vorlesen, Quellen) mitziehen und nicht
  // deutsche Knopftexte um eine russische Antwort stehen.
  return (
    <div className="ki-chat">
      <div className="ki-chat__flaeche">
        <div ref={scrollRef} onScroll={beiScroll} className="ki-chat__verlauf">
          {istErsteNachricht ? (
            <div className="ki-leer">
              <span className="ki-leer__zeichen" aria-hidden>
                <Himbeere groesse={78} schweben />
              </span>
              <h3 className="ki-leer__titel">{t("leerTitel")}</h3>
              <p className="ki-leer__text">{t(`modus.${modus}.beschreibung`)}</p>
              <p className="ki-leer__faehigkeiten">{t("leerBereiche", zaehler)}</p>
              <div className="ki-leer__vorschlaege">
                {vorschlaege.map((schluessel, index) => {
                  const vorschlag = t(schluessel);
                  return (
                    <button
                      key={schluessel}
                      type="button"
                      disabled={einwilligungFehlt || beschaeftigt}
                      onClick={() => sende(vorschlag)}
                      className="ki-vorschlag"
                      style={{ animationDelay: `${index * 70}ms` }}
                    >
                      {vorschlag}
                    </button>
                  );
                })}
              </div>
              <p className="ki-leer__hinweis">{t("transparenzHinweisAgent")}</p>
            </div>
          ) : (
            messages.map((nachricht) =>
              nachricht.role === "user" ? (
                <div key={nachricht.id} className="ki-nachricht ki-nachricht--nutzer">
                  <div className="ki-nachricht__blase">
                    {nachricht.parts.map((teil, index) =>
                      teil.type === "text" ? <p key={index}>{teil.text}</p> : null,
                    )}
                  </div>
                </div>
              ) : (
                <div key={nachricht.id} className="ki-nachricht ki-nachricht--assistent">
                  <span className="ki-nachricht__zeichen" aria-hidden>
                    <Himbeere groesse={22} denkt={beschaeftigt && nachricht.id === letzteId} />
                  </span>
                  <div className="ki-nachricht__inhalt">
                    <BelegAnbieter nachrichtId={nachricht.id} belege={belegeVonNachricht(nachricht)}>
                    {segmentiere(nachricht).map((segment, index) => {
                      if (segment.art === "text") return <Markdown key={index} text={segment.text} />;
                      if (segment.art === "aktion") return renderAktionskarte(segment.karte);
                      return (
                        <ol key={index} className="ki-schritte">
                          {segment.schritte.map((schritt) => {
                            const Icon = werkzeugIcon[schritt.name] ?? Radar;
                            const klickbar = schritt.zustand === "fertig" && schritt.ziel !== null;
                            const teile = { bereich: schritt.bereich, tabelle: schritt.tabelle, absicht: schritt.absicht };
                            const label =
                              schritt.zustand === "fehler" && istClientWerkzeug(schritt.name)
                                ? t("klick.nicht", { absicht: schritt.absicht ?? "" })
                                : beschriftung(schritt.zustand === "laeuft" ? "laeuft" : "werkzeug", schritt.name, teile);
                            return (
                              <li key={schritt.id}>
                                <button
                                  type="button"
                                  disabled={!klickbar}
                                  onClick={() =>
                                    schritt.ziel && oeffneZiel(schritt.ziel, beschriftung("ziel", schritt.name, teile))
                                  }
                                  className={cn(
                                    "ki-schritt",
                                    schritt.zustand === "laeuft" && "ki-schritt--laeuft",
                                    schritt.zustand === "fehler" && "ki-schritt--fehler",
                                    klickbar && "ki-schritt--klickbar",
                                    klickbar && fuehrung?.ziel === schritt.ziel && "ki-schritt--aktiv",
                                  )}
                                >
                                  <Icon className="ki-schritt__icon h-3.5 w-3.5" />
                                  <span className="ki-schritt__text">{label}</span>
                                  <span className="ki-schritt__ende">
                                    {schritt.zustand === "laeuft" ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : schritt.zustand === "fehler" ? (
                                      <TriangleAlert className="h-3 w-3" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                  </span>
                                  {klickbar ? <ArrowRight className="ki-schritt__pfeil h-3 w-3" /> : null}
                                </button>
                              </li>
                            );
                          })}
                        </ol>
                      );
                    })}
                    <QuellenListe
                      nachrichtId={nachricht.id}
                      belege={belegeVonNachricht(nachricht)}
                      zitiert={zitierteKennungen(textVonNachricht(nachricht))}
                    />
                    </BelegAnbieter>
                    {/* Vorlesen nur, wenn die Antwort schon gespeichert ist UND es fuer
                        ihre Sprache eine Stimme gibt - fehlt eine, so
                        erscheint deshalb gar kein Knopf statt eines Fehlers nach dem Klick. */}
                    {istVorlesbar(nachricht.id) &&
                    !(beschaeftigt && nachricht.id === letzteId) &&
                    stimmeVorhanden(sprache) ? (
                      <VorlesenKnopf id={nachricht.id} zustand={sprachausgabe} />
                    ) : null}
                  </div>
                </div>
              ),
            )
          )}

          {klickAnfrage ? (
            <div className="ki-aktion ki-aktion--freigabe">
              <div className="ki-aktion__kopf">
                <span className="ki-aktion__icon">
                  <MousePointerClick className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="ki-aktion__titel">{t("klick.titel")}</p>
                  <p className="ki-aktion__status">{t(`klick.grund.${klickAnfrage.grund}`)}</p>
                </div>
              </div>
              <dl className="ki-aktion__felder">
                <div>
                  <dt>{t("klick.absicht")}</dt>
                  <dd>{klickAnfrage.absicht}</dd>
                </div>
                <div>
                  <dt>{t("klick.element")}</dt>
                  <dd>{klickAnfrage.label}</dd>
                </div>
              </dl>
              <div className="ki-aktion__knoepfe">
                <button type="button" onClick={() => klickAnfrage.entscheide(false)} className="ki-aktion__ablehnen">
                  {t("aktion.ablehnen")}
                </button>
                <button type="button" onClick={() => klickAnfrage.entscheide(true)} className="ki-aktion__bestaetigen">
                  <Check className="h-3.5 w-3.5" />
                  {t("aktion.bestaetigen")}
                </button>
              </div>
            </div>
          ) : null}

          {beschaeftigt && !klickAnfrage ? (
            <div className="ki-status" role="status">
              <Himbeere groesse={18} denkt />
              {laufenderSchritt
                ? beschriftung("laeuft", laufenderSchritt.name, {
                    bereich: laufenderSchritt.bereich,
                    tabelle: laufenderSchritt.tabelle,
                    absicht: laufenderSchritt.absicht,
                  })
                : t(modus === "agent" ? "agentDenkt" : "assistentDenkt")}
            </div>
          ) : null}

          {error ? (
            <p className="ki-fehler" role="alert">
              {chatFehlerArt(error) === "sitzung" ? (
                <>
                  {t("fehler.sitzung")}{" "}
                  <a
                    className="ki-fehler__link"
                    href={`/${sprache}/login?weiter=${encodeURIComponent(window.location.pathname)}`}
                  >
                    {t("fehler.anmelden")}
                  </a>
                </>
              ) : chatFehlerArt(error) === "berechtigung" ? (
                t("fehler.berechtigung")
              ) : chatFehlerArt(error) === "zulang" ? (
                <>
                  {t("fehler.zuLang")}{" "}
                  <button
                    type="button"
                    className="ki-fehler__link"
                    onClick={() => {
                      // Nur die Ansicht und der Kontext dieser Sitzung beginnen neu; der gespeicherte Verlauf bleibt.
                      clearError();
                      setMessages([]);
                    }}
                  >
                    {t("fehler.neuBeginnen")}
                  </button>
                </>
              ) : (
                t("fallback.antwort")
              )}
            </p>
          ) : null}
        </div>

        {nachUntenKnopf ? (
          <button type="button" onClick={nachUnten} className="ki-nach-unten" aria-label={t("nachUnten")}>
            <ArrowDown className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <form onSubmit={absenden} className="ki-composer">
        {pruefBezug ? (
          <div className="ki-bezug" role="status">
            <Scale className="h-3.5 w-3.5" aria-hidden />
            <span>{t("pruefBezug", { id: pruefBezug.id.slice(0, 8) })}</span>
            <button type="button" onClick={entferneBezug} aria-label={t("pruefBezugEntfernen")} title={t("pruefBezugEntfernen")}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        {istErsteNachricht ? (
          <label className="ki-composer__einwilligung">
            <input
              type="checkbox"
              checked={einwilligung}
              onChange={(e) => setEinwilligung(e.target.checked)}
            />
            {t("einwilligungText")}
          </label>
        ) : null}
        <div className="ki-composer__feld">
          <textarea
            ref={eingabeRef}
            value={eingabe}
            rows={1}
            maxLength={MAX_NACHRICHT_LAENGE}
            placeholder={t("inputPlaceholder")}
            onChange={(e) => beiEingabe(e.target.value)}
            onKeyDown={beiTaste}
          />
          {/* Diktat: die Aufnahme endet von selbst, sobald jemand aufhoert zu
              sprechen. Der erkannte Text landet NUR im Eingabefeld - seit dem
              22.09.2026 wird er nicht mehr automatisch abgeschickt: was die
              Erkennung verhoert hat, ginge sonst ungeprueft an die Kundschaft,
              und gerade auf Kasachisch passiert das. Abgeschickt wird von Hand. */}
          <MikrofonKnopf
            className="ki-composer__knopf ki-composer__knopf--still"
            deaktiviert={beschaeftigt || einwilligungFehlt}
            beiAufnahme={(an) => {
              setDiktiert(an);
              // Mikrofon an: sofort still, sonst nimmt das Mikrofon die
              // eigene Stimme des Assistenten mit auf.
              if (an) live.stoppeAlles();
              // Mikrofon aus ist eine Geste - der richtige Moment, den
              // AudioContext zu entsperren (iPhone), und dieser Zug wird
              // vorgelesen, auch wenn der Schalter aus ist.
              else { live.entsperre(); zuletztDiktiert.current = true; }
            }}
            beiText={(text, sprachen) => {
              // Merken, solange der Text im Feld steht: abgeschickt wird von
              // Hand, und erst dann zaehlt es.
              diktatSprachen.current = sprachen;
              beiEingabe(text);
              const feld = eingabeRef.current;
              feld?.focus();
              // Cursor ans Ende: von dort wird korrigiert oder weitergeschrieben.
              feld?.setSelectionRange(text.length, text.length);
            }}
          />
          {beschaeftigt ? (
            <button type="button" onClick={stopp} aria-label={t("stopp")} className="ki-composer__knopf">
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label={t("senden")}
              disabled={!eingabe.trim() || einwilligungFehlt}
              className="ki-composer__knopf"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
        {diktiert ? <DiktatWelle /> : null}
        <div className="ki-composer__optionen">
          <VorlesenSchalter zustand={sprachausgabe} laedt={live.laedtErsten} spricht={live.spricht} />
        </div>
      </form>
    </div>
  );
}
