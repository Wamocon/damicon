"use client";

// Eine Nachricht im Verlauf des KI-Chats (ki-chat.tsx): die Frage als Blase, die
// Antwort mit Text (Markdown), Werkzeugschritten, Aktionskarten, Quellen und dem
// Vorlesen-Knopf. Reine Darstellung; Zustand und Handlungen kommen als Props aus
// ki-chat.tsx, das die Hooks hält.

import type { ComponentType, ReactNode } from "react";
import type { UIMessage } from "ai";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronsDown,
  Compass,
  Crosshair,
  Database,
  Eye,
  Landmark,
  ListTodo,
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
import { Himbeere } from "@/components/ki/himbeere";
import { KiChatAktionskarte } from "@/components/ki/ki-chat-aktionskarte";
import { Markdown } from "@/components/ki/ki-chat-markdown";
import {
  belegeVonNachricht,
  segmentiere,
  textVonNachricht,
  type AktionsKarte,
  type erstelleBeschriftungen,
  type Schritt,
} from "@/components/ki/ki-chat-segmente";
import { antwortSpracheAus, type Vorlesen } from "@/components/ki/ki-chat-sprache";
import type { KiFuehrung } from "@/components/ki/ki-pane-kontext";
import { BelegAnbieter, QuellenListe } from "@/components/ki/ki-quellen";
import { istVorlesbar, stimmeVorhanden, VorlesenKnopf } from "@/components/ki/sprachausgabe";
import { istClientWerkzeug } from "@/lib/ai/client-werkzeuge-meta";
import { zitierteKennungen } from "@/lib/wissen/belege";
import { cn } from "@/lib/utils";

type Beschriftung = ReturnType<typeof erstelleBeschriftungen>["beschriftung"];

const werkzeugIcon: Record<string, ComponentType<{ className?: string }>> = {
  mwstStatusAbrufen: Landmark,
  esutdOffeneFristenAbrufen: UserRound,
  complianceUebersichtAbrufen: ShieldAlert,
  kuehlketteAbrufen: Snowflake,
  risikoRadarAbrufen: Radar,
  tagesLageAbrufen: ListTodo,
  oeffneBereich: Compass,
  oeffnePruefBereich: Compass,
  wissenSuchen: BookOpenCheck,
  wissensbasisAbrufen: Database,
  wissenDokumentAnalysieren: Eye,
  wissenBestandAnalysieren: Eye,
  datenmodellErkunden: Database,
  datenLesen: Table2,
  seiteLesen: Eye,
  klicke: MousePointerClick,
  fuelleFeld: PencilLine,
  scrolleZu: ChevronsDown,
  zeigeAuf: Crosshair,
};

/** Klasse und Endsymbol je Zustand eines Schritts. */
const ZUSTAND_KLASSE: Record<Schritt["zustand"], string | null> = {
  laeuft: "ki-schritt--laeuft",
  fehler: "ki-schritt--fehler",
  fertig: null,
};
const ZUSTAND_ENDE: Record<Schritt["zustand"], ReactNode> = {
  laeuft: <Loader2 className="h-3 w-3 animate-spin" />,
  fehler: <TriangleAlert className="h-3 w-3" />,
  fertig: <Check className="h-3 w-3" />,
};

interface SchrittEigenschaften {
  fuehrung: KiFuehrung | null;
  beschriftung: Beschriftung;
  onZielOeffnen: (ziel: string, label: string) => void;
}

function KiChatSchritt({ schritt, fuehrung, beschriftung, onZielOeffnen }: SchrittEigenschaften & { schritt: Schritt }) {
  const t = useTranslations("kiAssistentAnsicht");
  const Icon = werkzeugIcon[schritt.name] ?? Radar;
  const klickbar = schritt.zustand === "fertig" && schritt.ziel !== null;
  const teile = { bereich: schritt.bereich, tabelle: schritt.tabelle, absicht: schritt.absicht };
  const label =
    schritt.zustand === "fehler" && istClientWerkzeug(schritt.name)
      ? t("klick.nicht", { absicht: schritt.absicht ?? "" })
      : beschriftung(schritt.zustand === "laeuft" ? "laeuft" : "werkzeug", schritt.name, teile);
  return (
    <li>
      <button
        type="button"
        disabled={!klickbar}
        onClick={() => schritt.ziel && onZielOeffnen(schritt.ziel, beschriftung("ziel", schritt.name, teile))}
        className={cn(
          "ki-schritt",
          ZUSTAND_KLASSE[schritt.zustand],
          klickbar && "ki-schritt--klickbar",
          klickbar && fuehrung?.ziel === schritt.ziel && "ki-schritt--aktiv",
        )}
      >
        <Icon className="ki-schritt__icon h-3.5 w-3.5" />
        <span className="ki-schritt__text">{label}</span>
        <span className="ki-schritt__ende">{ZUSTAND_ENDE[schritt.zustand]}</span>
        {klickbar ? <ArrowRight className="ki-schritt__pfeil h-3 w-3" /> : null}
      </button>
    </li>
  );
}

function KiChatSchritte({ schritte, ...rest }: SchrittEigenschaften & { schritte: Schritt[] }) {
  return (
    <ol className="ki-schritte">
      {schritte.map((schritt) => (
        <KiChatSchritt key={schritt.id} schritt={schritt} {...rest} />
      ))}
    </ol>
  );
}

interface NachrichtEigenschaften extends SchrittEigenschaften {
  nachricht: UIMessage;
  beschaeftigt: boolean;
  /** Die Kennung der letzten Nachricht: solange beschaeftigt, entsteht sie gerade. */
  letzteId: string | undefined;
  sprache: string;
  vorlesen: Vorlesen;
  onFreigabe: (karte: AktionsKarte, erlaubt: boolean) => void;
}

function NutzerNachricht({ nachricht }: { nachricht: UIMessage }) {
  return (
    <div className="ki-nachricht ki-nachricht--nutzer">
      <div className="ki-nachricht__blase">
        {nachricht.parts.map((teil, index) => (teil.type === "text" ? <p key={index}>{teil.text}</p> : null))}
      </div>
    </div>
  );
}

function AssistentNachricht({ nachricht, beschaeftigt, letzteId, sprache, vorlesen, onFreigabe, ...schrittEigenschaften }: NachrichtEigenschaften) {
  const { beschriftung, onZielOeffnen } = schrittEigenschaften;
  return (
    <div className="ki-nachricht ki-nachricht--assistent">
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
                  onFreigabe={onFreigabe}
                  onZielOeffnen={onZielOeffnen}
                  beschriftungZiel={(name) => beschriftung("ziel", name)}
                />
              );
            return <KiChatSchritte key={index} schritte={segment.schritte} {...schrittEigenschaften} />;
          })}
          <QuellenListe
            nachrichtId={nachricht.id}
            belege={belegeVonNachricht(nachricht)}
            zitiert={zitierteKennungen(textVonNachricht(nachricht))}
          />
        </BelegAnbieter>
        {/* Vorlesen, wenn es fuer die Sprache eine Stimme gibt - fehlt eine,
            erscheint gar kein Knopf statt eines Fehlers nach dem Klick. Waehrend
            eine Antwort noch entsteht, nur dann, wenn sie schon vorgelesen wird:
            dann ist der Knopf ihr Stopp. */}
        {istVorlesbar(nachricht.id) &&
        (vorlesen.liest(nachricht.id) || !(beschaeftigt && nachricht.id === letzteId)) &&
        stimmeVorhanden(sprache) ? (
          <VorlesenKnopf
            id={nachricht.id}
            text={textVonNachricht(nachricht)}
            sprache={antwortSpracheAus(nachricht)}
            vorlesen={vorlesen}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Eine Nachricht des Verlaufs: Frage oder Antwort. */
export function KiChatNachricht(eigenschaften: NachrichtEigenschaften) {
  return eigenschaften.nachricht.role === "user" ? (
    <NutzerNachricht nachricht={eigenschaften.nachricht} />
  ) : (
    <AssistentNachricht {...eigenschaften} />
  );
}
