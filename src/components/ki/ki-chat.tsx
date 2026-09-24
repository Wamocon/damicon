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
} from "ai";
import { useLocale, useTranslations } from "next-intl";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronsDown,
  Compass,
  Crosshair,
  Database,
  Eye,
  Landmark,
  Loader2,
  MousePointerClick,
  PencilLine,
  Radar,
  ShieldAlert,
  Snowflake,
  Table2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { usePersona } from "@/components/dashboard/persona";
import { useHaustierAktionen, useHaustierVorgabe } from "@/components/haustier/haustier-kontext";
import { agentPhase, stimmungAusAntwort } from "@/lib/haustier";
import { Himbeere } from "@/components/ki/himbeere";
import { useKiPane, type KiModus } from "@/components/ki/ki-pane-kontext";
import { AKTIONS_NAMEN, AKTIONS_RECHTE, istAktion } from "@/lib/ai/aktionen-meta";
import { istClientWerkzeug } from "@/lib/ai/client-werkzeuge-meta";
import { istVorlesbar, stimmeVorhanden, VorlesenKnopf } from "@/components/ki/sprachausgabe";
import { mitUmlauten } from "@/lib/text/umlaute";
import { haengeDiktatAn } from "@/lib/domain/diktat-live";
import { type KiChatNachrichtZeile } from "@/lib/domain/ki-assistent";
import { modules } from "@/lib/modules";
import { hasPermission } from "@/lib/rbac";
import { BelegAnbieter, QuellenListe, ZitatMarke } from "@/components/ki/ki-quellen";
import { chatFehlerArt } from "@/lib/ai/chat-fehler";
import { zerlege } from "@/lib/markdown-bloecke";
import { verlinkeZitate, zitierteKennungen } from "@/lib/wissen/belege";
import { cn } from "@/lib/utils";
import {
  alsAktionsErgebnis,
  belegeVonNachricht,
  eigenschaftAusAusgabe,
  erstelleBeschriftungen,
  segmentiere,
  textVonNachricht,
  verlaufZuNachrichten,
  waehleVorschlaege,
  type AktionsKarte,
} from "@/components/ki/ki-chat-segmente";
import { clientErgebnisseBereit, useKlientWerkzeuge, type WerkzeugChat } from "@/components/ki/ki-chat-werkzeuge";
import { antwortSpracheAus, useKiChatSprache } from "@/components/ki/ki-chat-sprache";
import { KiChatAktionskarte } from "@/components/ki/ki-chat-aktionskarte";
import { KiChatComposer } from "@/components/ki/ki-chat-composer";

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
//
// Die Komponente buendelt nur noch das Rendern und die Verdrahtung der
// Hooks - Client-Werkzeug-Ausfuehrung/Klickfreigabe (ki-chat-werkzeuge.ts),
// Sprachein-/ausgabe (ki-chat-sprache.ts), die Aktionskarte
// (ki-chat-aktionskarte.tsx) und der Composer (ki-chat-composer.tsx) stehen in
// eigenen Modulen; ebenso die reinen Segmentierungs-/Beschriftungsfunktionen
// (ki-chat-segmente.ts).

const werkzeugIcon: Record<string, ComponentType<{ className?: string }>> = {
  mwstStatusAbrufen: Landmark,
  esutdOffeneFristenAbrufen: UserRound,
  complianceUebersichtAbrufen: ShieldAlert,
  kuehlketteAbrufen: Snowflake,
  risikoRadarAbrufen: Radar,
  oeffneBereich: Compass,
  oeffnePruefBereich: Compass,
  wissenSuchen: BookOpenCheck,
  datenmodellErkunden: Database,
  datenLesen: Table2,
  seiteLesen: Eye,
  klicke: MousePointerClick,
  fuelleFeld: PencilLine,
  scrolleZu: ChevronsDown,
  zeigeAuf: Crosshair,
};

// Mindestabstand zwischen zwei Aktualisierungen des Chats waehrend des Streamens.
const STREAM_DROSSEL_MS = 80;
const NAH_AM_ENDE_PX = 96;

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
  const moduleT = useTranslations("modules");
  const navT = useTranslations("nav");
  const authT = useTranslations("auth");
  const { bereichTitel, beschriftung } = erstelleBeschriftungen({ t, navT, authT, moduleT });
  const sprache = useLocale();
  const pfad = usePathname();
  const router = useRouter();
  const { role: rolle } = usePersona();
  const { modus, offen, fuehrung, oeffneZiel, fuehreZu, bewegeZeiger, pruefBezug, entferneBezug, anstoss } = useKiPane();

  const [eingabe, setEingabe] = useState("");
  const [einwilligung, setEinwilligung] = useState(false);
  const [nachUntenKnopf, setNachUntenKnopf] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const eingabeRef = useRef<HTMLTextAreaElement>(null);
  const klebtUnten = useRef(true);
  const zugModus = useRef<KiModus | null>(null);
  const gefolgt = useRef(new Set<string>());
  const aktualisiert = useRef(new Set<string>());

  // Was bei JEDER Anfrage mitgeht - auch bei der automatischen Folgeanfrage
  // nach einer Freigabe, die nicht ueber sendMessage() laeuft. Ueber Refs
  // gelesen, damit der einmal angelegte Transport stets den aktuellen Stand
  // sieht.
  // pruefkontext: der Prüfbericht, auf dem das Gespräch aufsetzt (nach einer Compliance-Prüfung), sonst undefined.
  const pruefkontext = pruefBezug?.kontext;
  const anfrageDaten = useRef<Record<string, unknown>>({ einwilligung, modus, pfad, rolle, sprache, pruefkontext });
  useEffect(() => {
    anfrageDaten.current = { ...anfrageDaten.current, einwilligung, modus, pfad, rolle, sprache, pruefkontext };
  }, [einwilligung, modus, pfad, rolle, sprache, pruefkontext]);

  // Client-Werkzeuge (Klick/Feld/Scroll/Zeigen im Dashboard) und die
  // Klickfreigabe dafuer - siehe ki-chat-werkzeuge.ts. Muss vor useChat()
  // stehen: dessen onToolCall braucht starteClientWerkzeug schon fuer den
  // Aufruf selbst; der Chat (fuer setChat) existiert erst danach.
  const {
    clientAktiv,
    klickAnfrage,
    starteClientWerkzeug,
    setChat: setWerkzeugChat,
    neuerZug: werkzeugeNeuerZug,
    abbrechen: werkzeugeAbbrechen,
    unterSchrittGrenze,
  } = useKlientWerkzeuge({ bewegeZeiger, istAgentModus: () => anfrageDaten.current.modus === "agent" });

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
      (unterSchrittGrenze() && clientErgebnisseBereit(optionen.messages)),
    onToolCall: ({ toolCall }) => starteClientWerkzeug(toolCall),
  });
  const { messages, sendMessage, addToolApprovalResponse, status, stop, error, setMessages, clearError } = chat;
  setWerkzeugChat(chat as unknown as WerkzeugChat);

  const beschaeftigt = status === "submitted" || status === "streaming" || clientAktiv !== null;

  // Vorlese-/Diktat-Zustand - siehe ki-chat-sprache.ts.
  const {
    sprachausgabe,
    live,
    diktiert,
    stoppeAlles: stoppeStimme,
    beiMikrofonAufnahme,
    beiMikrofonStart: stilleFuerDiktat,
    merkeDiktatSprachen,
    beginneZug,
  } = useKiChatSprache({
    sprache,
    messages,
    beschaeftigt,
    offen,
  });
  const istErsteNachricht = messages.length === 0;

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

  function stopp() {
    // Zuerst die Stimme: wer auf Stopp drueckt, will sofort Ruhe, nicht erst
    // nach dem laufenden Abschnitt - beide Wege, live und die ganze Antwort.
    stoppeStimme();
    werkzeugeAbbrechen();
    void stop();
  }

  function sende(text: string) {
    const bereinigt = text.trim();
    if (!bereinigt || beschaeftigt) return;
    if (istErsteNachricht && !einwilligung) return;
    const diktatSprachen = beginneZug();
    zugModus.current = modus;
    werkzeugeNeuerZug();
    klebtUnten.current = true;
    setNachUntenKnopf(false);
    anfrageDaten.current = { ...anfrageDaten.current, diktatSprachen };
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
    if (wert.length > 1 && (live.spricht || sprachausgabe.spielt)) stoppeStimme();
    setEingabe(wert);
    const el = eingabeRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }
  }

  // Was vor dem Diktat im Feld stand. Das Diktat wird daran ANGEHAENGT -
  // bis zum 24.09.2026 ersetzte es den Inhalt, und wer nach einer Denkpause
  // weiterdiktierte, verlor den ersten Teil samt allem Getippten.
  const diktatBasis = useRef<string | null>(null);

  function beiMikrofonStart() {
    diktatBasis.current = eingabeRef.current?.value ?? eingabe;
    stilleFuerDiktat();
  }

  /** Live-Diktat: was bis jetzt gehoert wurde, steht schon im Feld. */
  function beiMikrofonZwischentext(zwischentext: string) {
    setzeFeld(haengeDiktatAn(diktatBasis.current ?? "", zwischentext));
  }

  function setzeFeld(wert: string) {
    setEingabe(wert);
    const el = eingabeRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }
  }

  function beiMikrofonText(diktat: string, sprachen?: string[]) {
    // Merken, solange der Text im Feld steht: abgeschickt wird von
    // Hand, und erst dann zaehlt es.
    merkeDiktatSprachen(sprachen);
    const text = haengeDiktatAn(diktatBasis.current ?? "", diktat);
    diktatBasis.current = null;
    beiEingabe(text);
    const feld = eingabeRef.current;
    feld?.focus();
    // Cursor ans Ende: von dort wird korrigiert oder weitergeschrieben.
    feld?.setSelectionRange(text.length, text.length);
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
                      if (segment.art === "aktion")
                        return (
                          <KiChatAktionskarte
                            key={segment.karte.id}
                            karte={segment.karte}
                            onFreigabe={freigabe}
                            onZielOeffnen={oeffneZiel}
                            beschriftungZiel={(name) => beschriftung("ziel", name)}
                          />
                        );
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
                      <VorlesenKnopf id={nachricht.id} zustand={sprachausgabe} sprache={antwortSpracheAus(nachricht)} />
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

      <KiChatComposer
        t={t}
        onSubmit={absenden}
        pruefBezug={pruefBezug}
        onBezugEntfernen={entferneBezug}
        onZielOeffnen={oeffneZiel}
        bereichTitel={bereichTitel}
        istErsteNachricht={istErsteNachricht}
        einwilligung={einwilligung}
        onEinwilligungChange={setEinwilligung}
        eingabeRef={eingabeRef}
        eingabe={eingabe}
        onEingabeChange={beiEingabe}
        onKeyDown={beiTaste}
        beschaeftigt={beschaeftigt}
        einwilligungFehlt={einwilligungFehlt}
        diktiert={diktiert}
        onMikrofonAufnahme={beiMikrofonAufnahme}
        onMikrofonStart={beiMikrofonStart}
        onMikrofonZwischentext={beiMikrofonZwischentext}
        onMikrofonText={beiMikrofonText}
        onStop={stopp}
        sprachausgabe={sprachausgabe}
        live={live}
      />
    </div>
  );
}
