"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Bot, Info, LifeBuoy, Maximize2, MessageSquareText, PanelRight, Settings2, X } from "lucide-react";
import { Himbeere } from "@/components/ki/himbeere";
import { useHaustierAktionen, useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { KiChat } from "@/components/ki/ki-chat";
import { KiPaneGriff } from "@/components/ki/ki-pane-griff";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { EskalationsFormular, KiChatFenster } from "@/components/db/ki-assistent-formulare";
import type { KiChatNachrichtZeile } from "@/lib/domain/ki-assistent";
import { cn } from "@/lib/utils";

// Andockbares Seitenpanel (Layout dashboard/layout.tsx): sitzt NEBEN dem
// Hauptfenster statt darueber, damit der Nutzer im Agent-Modus sieht, wie die
// Ansicht nebenan mitwandert. Geoeffnet wird es ueber den "KI fragen"-Knopf
// in der Kopfzeile (topbar.tsx); auf schmalen Bildschirmen legt es sich als
// Schublade ueber die Seite (ki-pane.css, .ki-pane-huelle).
//
// Das Panel bleibt immer gemountet - Zu heisst nur "Breite 0" bzw.
// "ausserhalb des Bildschirms". Damit laeuft eine begonnene Antwort (und eine
// Agent-Tour) weiter, auch wenn man das Panel zwischendurch zuklappt, und die
// Schliessen-Animation ist dieselbe wie die Oeffnen-Animation rueckwaerts.
//
// Assistent oder Agent ist bewusst KEIN Schalter im Kopf, sondern eine
// Einstellung: Standard ist der ruhige Assistent, den Agent-Modus (der das
// Hauptfenster selbst steuert) schaltet man hier ausdruecklich ein - mit einer
// Erklaerung beim Ueberfahren, worin der Unterschied besteht.

type Ansicht = "chat" | "einstellungen" | "hilfe";

function ModusEinstellung() {
  const t = useTranslations("kiAssistentAnsicht");
  const { modus, setModus } = useKiPane();
  const agentAn = modus === "agent";

  return (
    <section className="ki-einstellung">
      <div className="ki-einstellung__kopf">
        <div className="ki-einstellung__titel">
          <Bot className="h-4 w-4" />
          {t("modus.schalterTitel")}
          <span className="ki-info" tabIndex={0} aria-describedby="ki-modus-info" aria-label={t("modus.infoTitel")}>
            <Info className="h-3.5 w-3.5" />
            <span role="tooltip" id="ki-modus-info" className="ki-info__blase">
              <strong>{t("modus.infoTitel")}</strong>
              <span className="ki-info__zeile">
                <MessageSquareText className="h-3.5 w-3.5" />
                <span>
                  <b>{t("modus.assistent.name")}:</b> {t("modus.assistent.kurz")}
                </span>
              </span>
              <span className="ki-info__zeile">
                <Bot className="h-3.5 w-3.5" />
                <span>
                  <b>{t("modus.agent.name")}:</b> {t("modus.agent.kurz")}
                </span>
              </span>
              <span className="ki-info__fuss">{t("modus.aktionenHinweis")}</span>
            </span>
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={agentAn}
          aria-label={t("modus.schalterTitel")}
          onClick={() => setModus(agentAn ? "assistent" : "agent")}
          className="ki-schalter"
        >
          <span className="ki-schalter__knopf" />
        </button>
      </div>
      <p className="ki-einstellung__text">{t("modus.schalterText")}</p>
    </section>
  );
}

function HaustierEinstellung() {
  const t = useTranslations("haustier");
  const { an } = useHaustierStatus();
  const { setAn } = useHaustierAktionen();
  return (
    <section className="ki-einstellung">
      <div className="ki-einstellung__kopf">
        <div className="ki-einstellung__titel">
          <Himbeere groesse={16} />
          {t("einstellung.titel")}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={an}
          aria-label={t("einstellung.titel")}
          onClick={() => setAn(!an)}
          className="ki-schalter"
        >
          <span className="ki-schalter__knopf" />
        </button>
      </div>
      <p className="ki-einstellung__text">{t("einstellung.text")}</p>
    </section>
  );
}

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
  const { verfuegbar, offen, setOffen, modus, darstellung, setDarstellung } = useKiPane();
  const [ansicht, setAnsicht] = useState<Ansicht>("chat");

  if (!verfuegbar) return null;

  const agentAktiv = agentFaehig && modus === "agent";
  const aufBuehne = darstellung === "buehne";
  const hatEinstellungen = agentFaehig || einstellungen !== null;
  const umschalten = (ziel: Ansicht) => setAnsicht((aktuell) => (aktuell === ziel ? "chat" : ziel));

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("schliessen")}
        onClick={() => setOffen(false)}
        className={cn(
          "ki-pane-hintergrund print:hidden",
          offen && "ki-pane-hintergrund--offen",
          aufBuehne && "ki-pane-hintergrund--buehne",
        )}
      />
      <aside
        aria-label={t("chatTitel")}
        aria-hidden={!offen}
        aria-modal={aufBuehne && offen ? true : undefined}
        role={aufBuehne ? "dialog" : undefined}
        inert={!offen ? true : undefined}
        className={cn(
          "ki-pane-huelle print:hidden",
          offen && "ki-pane-huelle--offen",
          aufBuehne && "ki-pane-huelle--buehne",
        )}
      >
        <div className={cn("ki-pane", agentAktiv && "ki-pane--agent")}>
          {aufBuehne ? null : <KiPaneGriff />}
          <header className="ki-pane__kopf">
            <div className="ki-pane__titel">
              <span className="ki-pane__zeichen" aria-hidden>
                <Himbeere groesse={26} schweben={agentAktiv} />
              </span>
              {t("chatTitel")}
              {agentAktiv ? (
                <span className="ki-pane__abzeichen" title={t("modus.agent.kurz")}>
                  {t("modus.agent.name")}
                </span>
              ) : null}
            </div>
            <div className="ki-pane__werkzeuge">
              <button
                type="button"
                onClick={() => setDarstellung(aufBuehne ? "seite" : "buehne")}
                aria-label={t(aufBuehne ? "andocken" : "buehne")}
                title={t(aufBuehne ? "andocken" : "buehne")}
                className="ki-pane__knopf"
              >
                {aufBuehne ? <PanelRight className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              {hatEinstellungen ? (
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
            {ansicht === "einstellungen" && hatEinstellungen ? (
              <div className="ki-pane__ansicht space-y-5 overflow-y-auto p-4">
                {agentFaehig ? <ModusEinstellung /> : null}
                <HaustierEinstellung />
                {einstellungen ? (
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {t("anbieterVerwaltung.titel")}
                    </p>
                    {einstellungen}
                  </div>
                ) : null}
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
