"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Bot, LifeBuoy, MessageSquareText, Settings2, X } from "lucide-react";
import { Himbeere } from "@/components/ki/himbeere";
import { KiChat } from "@/components/ki/ki-chat";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { EskalationsFormular, KiChatFenster } from "@/components/db/ki-assistent-formulare";
import type { KiChatNachrichtZeile } from "@/lib/domain/ki-assistent";
import { cn } from "@/lib/utils";

// Andockbares Seitenpanel (Layout dashboard/layout.tsx): sitzt NEBEN dem
// Hauptfenster statt darueber, damit der Nutzer im Agent-Modus sieht, wie die
// Ansicht nebenan mitwandert. Geoeffnet wird es ueber den "KI fragen"-Knopf
// in der Kopfzeile (topbar.tsx); auf schmalen Bildschirmen legt es sich als
// Schublade ueber die Seite (globals.css, .ki-pane-huelle).
//
// Das Panel bleibt immer gemountet - Zu heisst nur "Breite 0" bzw.
// "ausserhalb des Bildschirms". Damit laeuft eine begonnene Antwort (und eine
// Agent-Tour) weiter, auch wenn man das Panel zwischendurch zuklappt, und die
// Schliessen-Animation ist dieselbe wie die Oeffnen-Animation rueckwaerts.

type Ansicht = "chat" | "einstellungen" | "hilfe";

export function KiPane({
  verlauf,
  agentFaehig,
  einstellungen,
}: {
  verlauf: KiChatNachrichtZeile[];
  /** true nur bei einem Anbieter vom Typ 'anthropic' (Werkzeuge + Streaming);
   *  sonst der bisherige nicht-streamende Chat ohne Modi. */
  agentFaehig: boolean;
  /** Anbieterverwaltung - nur fuer Admins, vom Layout als fertiges Element uebergeben. */
  einstellungen: ReactNode | null;
}) {
  const t = useTranslations("kiAssistentAnsicht");
  const { verfuegbar, offen, setOffen, modus, setModus } = useKiPane();
  const [ansicht, setAnsicht] = useState<Ansicht>("chat");

  if (!verfuegbar) return null;

  const agentAktiv = agentFaehig && modus === "agent";
  const umschalten = (ziel: Ansicht) => setAnsicht((aktuell) => (aktuell === ziel ? "chat" : ziel));

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("schliessen")}
        onClick={() => setOffen(false)}
        className={cn("ki-pane-hintergrund print:hidden", offen && "ki-pane-hintergrund--offen")}
      />
      <aside
        aria-label={t("chatTitel")}
        aria-hidden={!offen}
        inert={!offen ? true : undefined}
        className={cn("ki-pane-huelle print:hidden", offen && "ki-pane-huelle--offen")}
      >
        <div className={cn("ki-pane", agentAktiv && "ki-pane--agent")}>
          <header className="ki-pane__kopf">
            <div className="ki-pane__titel">
              <span className="ki-pane__zeichen" aria-hidden>
                <Himbeere groesse={26} schweben={agentAktiv} />
              </span>
              {t("chatTitel")}
            </div>
            <div className="ki-pane__werkzeuge">
              {einstellungen ? (
                <button
                  type="button"
                  onClick={() => umschalten("einstellungen")}
                  aria-pressed={ansicht === "einstellungen"}
                  aria-label={t("einstellungen")}
                  title={t("einstellungen")}
                  className="ki-pane__knopf"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => umschalten("hilfe")}
                aria-pressed={ansicht === "hilfe"}
                aria-label={t("eskalationKnopf")}
                title={t("eskalationKnopf")}
                className="ki-pane__knopf"
              >
                <LifeBuoy className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOffen(false)}
                aria-label={t("schliessen")}
                title={t("schliessen")}
                className="ki-pane__knopf"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {agentFaehig ? (
            <div className="ki-pane__modus">
              <div className="ki-modus" role="radiogroup" aria-label={t("modus.label")} data-modus={modus}>
                <span className="ki-modus__schieber" aria-hidden />
                <button
                  type="button"
                  role="radio"
                  aria-checked={modus === "assistent"}
                  onClick={() => setModus("assistent")}
                >
                  <MessageSquareText className="h-3.5 w-3.5" />
                  {t("modus.assistent.name")}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={modus === "agent"}
                  onClick={() => setModus("agent")}
                >
                  <Bot className="h-3.5 w-3.5" />
                  {t("modus.agent.name")}
                </button>
              </div>
              <p className="ki-pane__modus-hinweis">{t(`modus.${modus}.kurz`)}</p>
            </div>
          ) : null}

          <div className="ki-pane__koerper">
            <div
              className={cn("ki-pane__ansicht", ansicht !== "chat" && "pointer-events-none invisible")}
              inert={ansicht !== "chat" ? true : undefined}
            >
              {agentFaehig ? (
                <KiChat verlauf={verlauf} />
              ) : (
                <div className="h-full overflow-y-auto p-4">
                  <KiChatFenster verlauf={verlauf} />
                </div>
              )}
            </div>
            {ansicht === "einstellungen" && einstellungen ? (
              <div className="ki-pane__ansicht overflow-y-auto p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("anbieterVerwaltung.titel")}
                </p>
                {einstellungen}
              </div>
            ) : null}
            {ansicht === "hilfe" ? (
              <div className="ki-pane__ansicht space-y-3 overflow-y-auto p-4">
                <p className="text-sm leading-6 text-muted-foreground">{t("eskalationText")}</p>
                <EskalationsFormular />
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
