"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  Bot,
  ChevronLeft,
  Info,
  LifeBuoy,
  MessageSquareText,
  MoreHorizontal,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { Himbeere } from "@/components/ki/himbeere";
import { useHaustierAktionen, useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { KiChat } from "@/components/ki/ki-chat";
import { KiPaneGriff } from "@/components/ki/ki-pane-griff";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { EskalationsFormular, KiChatFenster } from "@/components/db/ki-assistent-formulare";
import type { KiChatNachrichtZeile } from "@/lib/domain/ki-assistent";
import type { Pruefbereich } from "@/lib/pruefung/rollen";
import { useIstHandy } from "@/components/ui/handy";
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

type Ansicht = "chat" | "einstellungen" | "hilfe" | "mehr";

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

// Die Compliance-Pruefung ist gross (Buehne, Bericht) und wird erst geladen, wenn sie geoeffnet wird.
const PruefungDialog = dynamic(() => import("@/components/pruefung/pruefung-dialog").then((m) => m.PruefungDialog), { ssr: false });

// Eine Zeile der Mehr-Ansicht. 56 px hoch, volle Breite - dasselbe Mass wie
// die Bereiche im Menue-Blatt der unteren Leiste.
function MehrZeile({
  symbol,
  text,
  onClick,
}: {
  symbol: ReactNode;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-full items-center gap-3 rounded-xl border border-border px-3 text-left text-base font-bold text-foreground transition-colors hover:bg-muted"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {symbol}
      </span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
    </button>
  );
}

export function KiPane({
  verlauf,
  agentFaehig,
  einstellungen,
  pruefungBereiche = [],
}: {
  verlauf: KiChatNachrichtZeile[];
  /** true nur bei einem Anbieter vom Typ 'anthropic' (Werkzeuge + Streaming);
   *  sonst der bisherige nicht-streamende Chat ohne Modi. */
  agentFaehig: boolean;
  /** Anbieterverwaltung - nur fuer Admins, vom Layout als fertiges Element uebergeben. */
  einstellungen: ReactNode | null;
  /** Bereiche der Compliance-Pruefung, die die Rolle ausloesen darf (leer = kein Knopf). Erzwungen wird es in /api/ki-pruefung. */
  pruefungBereiche?: readonly Pruefbereich[];
}) {
  const t = useTranslations("kiAssistentAnsicht");
  const { verfuegbar, offen, setOffen, modus } = useKiPane();
  const tp = useTranslations("pruefung");
  const [ansicht, setAnsichtRoh] = useState<Ansicht>("chat");
  const [pruefungOffen, setPruefungOffen] = useState(false);
  const handy = useIstHandy();

  if (!verfuegbar) return null;

  // Der Agent steuert das Hauptfenster und lebt davon, dass man dabei
  // zusehen kann. Als Blatt von unten deckt das Panel die Seite fast
  // vollstaendig ab - die Fuehrung liefe hinter dem Blatt ab, wo niemand sie
  // sieht. Auf dem Handy antwortet der Assistent deshalb, fuehrt aber nicht;
  // die Einstellung selbst bleibt unberuehrt und gilt am Schreibtisch weiter.
  const agentAktiv = agentFaehig && modus === "agent" && !handy;
  const hatEinstellungen = agentFaehig || einstellungen !== null;
  // Die Mehr-Ansicht gibt es nur auf dem Handy. Wer das Fenster breiter zieht,
  // waehrend sie offen ist, landet wieder im Gespraech, statt auf einer Seite
  // zu stehen, deren Knopf gerade verschwunden ist.
  const sichtbar: Ansicht = !handy && ansicht === "mehr" ? "chat" : ansicht;
  const umschalten = (ziel: Ansicht) =>
    setAnsichtRoh((aktuell) => (aktuell === ziel ? "chat" : ziel));

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
          <KiPaneGriff />
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
              {/* Auf dem Handy fuehrt ein Knopf in die Mehr-Ansicht, statt
                  vier Ziele mit 0,15 rem Abstand nebeneinanderzustellen -
                  die lagen enger beieinander als eine Fingerkuppe breit ist.
                  Steht man schon darin, fuehrt derselbe Knopf zurueck. */}
              {handy ? (
                <button
                  type="button"
                  onClick={() => umschalten("mehr")}
                  aria-pressed={sichtbar === "mehr"}
                  aria-label={t("mehr")}
                  title={t("mehr")}
                  className="ki-pane__knopf"
                >
                  {sichtbar === "chat" ? (
                    <MoreHorizontal className="h-5 w-5" />
                  ) : (
                    <ChevronLeft className="h-5 w-5" />
                  )}
                </button>
              ) : (
                <>
                  {pruefungBereiche.length > 0 ? (
                    <button type="button" onClick={() => setPruefungOffen(true)} aria-label={tp("knopf")} title={tp("knopf")} className="ki-pane__knopf">
                      <ShieldCheck className="h-4 w-4" />
                    </button>
                  ) : null}
                  {hatEinstellungen ? (
                    <button
                      type="button"
                      onClick={() => umschalten("einstellungen")}
                      aria-pressed={sichtbar === "einstellungen"}
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
                    aria-pressed={sichtbar === "hilfe"}
                    aria-label={t("eskalationKnopf")}
                    title={t("eskalationKnopf")}
                    className="ki-pane__knopf"
                  >
                    <LifeBuoy className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setOffen(false)}
                aria-label={t("schliessen")}
                title={t("schliessen")}
                className="ki-pane__knopf"
              >
                <X className={handy ? "h-5 w-5" : "h-4 w-4"} />
              </button>
            </div>
          </header>

          <div className="ki-pane__koerper">
            <div
              className={cn("ki-pane__ansicht", sichtbar !== "chat" && "pointer-events-none invisible")}
              inert={sichtbar !== "chat" ? true : undefined}
            >
              {agentFaehig ? (
                <KiChat verlauf={verlauf} />
              ) : (
                <div className="h-full overflow-y-auto p-4">
                  <KiChatFenster verlauf={verlauf} />
                </div>
              )}
            </div>
            {sichtbar === "mehr" ? (
              <div className="ki-pane__ansicht space-y-2 overflow-y-auto p-4">
                {pruefungBereiche.length > 0 ? (
                  <MehrZeile
                    symbol={<ShieldCheck className="h-5 w-5" />}
                    text={tp("knopf")}
                    onClick={() => {
                      setAnsichtRoh("chat");
                      setPruefungOffen(true);
                    }}
                  />
                ) : null}
                {hatEinstellungen ? (
                  <MehrZeile
                    symbol={<Settings2 className="h-5 w-5" />}
                    text={t("einstellungen")}
                    onClick={() => setAnsichtRoh("einstellungen")}
                  />
                ) : null}
                <MehrZeile
                  symbol={<LifeBuoy className="h-5 w-5" />}
                  text={t("eskalationKnopf")}
                  onClick={() => setAnsichtRoh("hilfe")}
                />
              </div>
            ) : null}
            {sichtbar === "einstellungen" && hatEinstellungen ? (
              <div className="ki-pane__ansicht space-y-5 overflow-y-auto p-4">
                {/* Der Agent-Schalter fehlt auf dem Handy: dort ruht der
                    Modus ohnehin, ein Schalter ohne Wirkung waere irrefuehrend. */}
                {agentFaehig && !handy ? <ModusEinstellung /> : null}
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
            {sichtbar === "hilfe" ? (
              <div className="ki-pane__ansicht space-y-3 overflow-y-auto p-4">
                <p className="text-sm leading-6 text-muted-foreground">{t("eskalationText")}</p>
                <EskalationsFormular />
              </div>
            ) : null}
          </div>
        </div>
      </aside>
      {pruefungOffen ? <PruefungDialog erlaubt={pruefungBereiche} onClose={() => setPruefungOffen(false)} /> : null}
    </>
  );
}
