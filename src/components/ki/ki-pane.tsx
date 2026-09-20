"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import { BlattZeile } from "@/components/ui/blatt-zeile";
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

type Ansicht = "chat" | "einstellungen" | "hilfe" | "pruefung" | "mehr";

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

// Die Compliance-Pruefung ist gross (Ablauf, Bericht) und wird erst geladen, wenn sie zum ersten Mal geoeffnet wird.
const PruefungAnsicht = dynamic(() => import("@/components/pruefung/pruefung-ansicht").then((m) => m.PruefungAnsicht), { ssr: false });

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
  const [ansicht, setAnsicht] = useState<Ansicht>("chat");
  // Einmal geoeffnet, bleibt die Pruefung eingebunden (nur ausgeblendet): ein laufender Lauf ueberlebt den Wechsel zum Chat.
  const [pruefungGeladen, setPruefungGeladen] = useState(false);

  // Die Pruefung braucht Platz (Spuren mit Schritten, Bericht): das Panel wird fuer diese Ansicht vorruebergehend
  // breiter, ohne die gespeicherte Breite des Nutzers zu ueberschreiben, und geht danach auf den alten Wert zurueck.
  // Das Hauptfenster behaelt mindestens 680 px (siehe ki-pane-griff.tsx).
  useEffect(() => {
    if (ansicht !== "pruefung" || !offen) return;
    const wurzel = document.documentElement.style;
    const links = document.getElementById("main")?.getBoundingClientRect().left ?? 0;
    const ziel = Math.max(352, Math.min(600, Math.floor(window.innerWidth - links - 680)));
    const aktuell = document.querySelector(".ki-pane-huelle")?.getBoundingClientRect().width ?? 0;
    if (aktuell >= ziel - 16) return;
    const vorher = wurzel.getPropertyValue("--ki-pane-breite");
    const gesetzt = `${ziel}px`;
    wurzel.setProperty("--ki-pane-breite", gesetzt);
    return () => {
      // Hat der Nutzer inzwischen selbst gezogen, bleibt seine Breite.
      if (wurzel.getPropertyValue("--ki-pane-breite") !== gesetzt) return;
      if (vorher) wurzel.setProperty("--ki-pane-breite", vorher);
      else wurzel.removeProperty("--ki-pane-breite");
    };
  }, [ansicht, offen]);

  const handy = useIstHandy();

  // Esc schliesst, und solange das Blatt offen ist, scrollt die Seite darunter
  // nicht mit. Beides kannte bisher nur ui/sheet.tsx, obwohl Menue-, Konto- und
  // KI-Blatt auf dem Handy dieselbe Flaeche sind und gleich aussehen.
  //
  // Die Bauweisen bleiben getrennt: ui/sheet.tsx haengt beim Schliessen aus,
  // dieses Panel muss gemountet bleiben, sonst reisst eine laufende Antwort
  // ab - und seit der Pruefung auch ein laufender Pruefvorgang. Angeglichen
  // wird das Verhalten, nicht der Bau.
  //
  // Nur unter md: ab dort ist das Panel eine angedockte Spalte neben der Seite,
  // und die soll weiter scrollen, waehrend man daneben liest.
  useEffect(() => {
    if (!offen || !handy) return;
    const beiTaste = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOffen(false);
    };
    document.addEventListener("keydown", beiTaste);
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", beiTaste);
      document.body.style.overflow = vorher;
    };
  }, [offen, handy, setOffen]);

  if (!verfuegbar) return null;

  // Gilt auf jedem Geraet gleich. Hier stand eine Weile `&& !handy`, mit der
  // Begruendung, der Agent lebe davon, dass man ihm zusieht, und auf dem Handy
  // decke das Blatt die Seite ab. Beides hielt nicht stand:
  //
  // Zusehen geht sehr wohl - das Panel bleibt beim Schliessen gemountet (siehe
  // oben), eine laufende Tour laeuft also weiter, waehrend man das Blatt nach
  // unten wischt und der Seite zuschaut.
  //
  // Schlimmer war, dass die Abschaltung gar nicht griff. Diese Variable steuert
  // nur drei optische Dinge: die Klasse ki-pane--agent, das Schweben der
  // Himbeere und das Abzeichen im Kopf. Was wirklich ueber die Werkzeuge
  // entscheidet, setzt ki-chat.tsx als `agentModus: modus === "agent"`, und
  // jene Datei kennt die Handy-Erkennung nicht. Ein iPhone im Querformat ist
  // 844 px breit, liegt also ueber der Grenze: dort liess sich der Modus
  // einschalten, und beim Drehen ins Hochformat verschwanden Abzeichen,
  // Schweben und Schalter - waehrend der Agent weiter klickte und tippte.
  // Die Oberflaeche sagte damit das Gegenteil dessen, was geschah.
  const agentAktiv = agentFaehig && modus === "agent";
  const hatEinstellungen = agentFaehig || einstellungen !== null;
  // Die Mehr-Ansicht gibt es nur auf dem Handy. Wer das Fenster breiter zieht,
  // waehrend sie offen ist, landet wieder im Gespraech, statt auf einer Seite
  // zu stehen, deren Knopf gerade verschwunden ist.
  const sichtbar: Ansicht = !handy && ansicht === "mehr" ? "chat" : ansicht;
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
                  vier Ziele mit 0,15 rem Abstand nebeneinanderzustellen - die
                  lagen enger beieinander als eine Fingerkuppe breit ist. Steht
                  man schon darin, fuehrt derselbe Knopf zurueck. */}
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
                    <button
                      type="button"
                      onClick={() => {
                        setPruefungGeladen(true);
                        umschalten("pruefung");
                      }}
                      aria-pressed={sichtbar === "pruefung"}
                      aria-label={tp("knopf")}
                      title={tp("knopf")}
                      className="ki-pane__knopf"
                    >
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
                {/* Ueber CSS und nicht ueber `handy`: eine Groesse ist keine
                    Frage, fuer die der zweite Renderdurchgang noetig waere,
                    und der Server rendert die Schreibtisch-Fassung - das
                    Kreuz waere auf dem Handy erst klein und spraenge nach der
                    Hydration. Siehe ui/handy.ts: was mit einer Media Query
                    geht, gehoert auch dorthin. */}
                <X className="h-5 w-5 md:h-4 md:w-4" />
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
            {pruefungGeladen && pruefungBereiche.length > 0 ? (
              <div
                className={cn("ki-pane__ansicht overflow-y-auto", sichtbar !== "pruefung" && "pointer-events-none invisible")}
                inert={sichtbar !== "pruefung" ? true : undefined}
              >
                <PruefungAnsicht erlaubt={pruefungBereiche} />
              </div>
            ) : null}
            {sichtbar === "mehr" ? (
              <div className="ki-pane__ansicht space-y-2 overflow-y-auto p-4">
                {pruefungBereiche.length > 0 ? (
                  <BlattZeile
                    symbol={<ShieldCheck className="h-5 w-5" />}
                    text={tp("knopf")}
                    onClick={() => {
                      setPruefungGeladen(true);
                      setAnsicht("pruefung");
                    }}
                  />
                ) : null}
                {hatEinstellungen ? (
                  <BlattZeile
                    symbol={<Settings2 className="h-5 w-5" />}
                    text={t("einstellungen")}
                    onClick={() => setAnsicht("einstellungen")}
                  />
                ) : null}
                <BlattZeile
                  symbol={<LifeBuoy className="h-5 w-5" />}
                  text={t("eskalationKnopf")}
                  onClick={() => setAnsicht("hilfe")}
                />
              </div>
            ) : null}
            {sichtbar === "einstellungen" && hatEinstellungen ? (
              <div className="ki-pane__ansicht space-y-5 overflow-y-auto p-4">
                {/* Auf jedem Geraet, siehe agentAktiv oben. Ohne den Schalter
                    kam man auf dem Handy aus einem einmal eingeschalteten
                    Agent-Modus nicht mehr heraus. */}
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
            {sichtbar === "hilfe" ? (
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
