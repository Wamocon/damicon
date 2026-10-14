"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  Bot,
  ChevronLeft,
  Info,
  LifeBuoy,
  Maximize2,
  MessageSquareText,
  MoreHorizontal,
  PanelRight,
  Scale,
  Settings2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Himbeere } from "@/components/ki/himbeere";
import { HaustierEinstellung } from "@/components/haustier/haustier-einstellung";
import { useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { KiChat } from "@/components/ki/ki-chat";
import { KiPaneGriff } from "@/components/ki/ki-pane-griff";
import { useKiPane, type KiDarstellung } from "@/components/ki/ki-pane-kontext";
import { useHandyBlatt, useKiPaneAnsicht, usePruefungsBreite, type Ansicht } from "@/components/ki/ki-pane-zustand";
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
//
// Welche Ansicht offen ist, die Breite fuer die Pruefung und das Verhalten als
// Blatt auf dem Handy stehen in ki-pane-zustand.ts.

type Uebersetzer = ReturnType<typeof useTranslations>;

/** Die Ansichten neben dem Chat: Knopf im Kopf (Schreibtisch) oder Zeile der Mehr-Ansicht (Handy). */
type Zusatz = "pruefung" | "einstellungen" | "hilfe";
const ZUSATZ: Record<Zusatz, { Symbol: LucideIcon; text: (t: Uebersetzer, tp: Uebersetzer) => string }> = {
  pruefung: { Symbol: Scale, text: (_t, tp) => tp("knopf") },
  einstellungen: { Symbol: Settings2, text: (t) => t("einstellungen") },
  hilfe: { Symbol: LifeBuoy, text: (t) => t("eskalationKnopf") },
};
const ZUSATZ_FOLGE: readonly Zusatz[] = ["pruefung", "einstellungen", "hilfe"];

/** Der Knopf für die Darstellung: auf der Bühne andocken, angedockt in die Mitte holen. */
const DARSTELLUNG_KNOPF: Record<KiDarstellung, { ziel: KiDarstellung; text: "andocken" | "buehne"; Symbol: LucideIcon }> = {
  buehne: { ziel: "seite", text: "andocken", Symbol: PanelRight },
  seite: { ziel: "buehne", text: "buehne", Symbol: Maximize2 },
};

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

// Die Compliance-Pruefung ist gross (Ablauf, Bericht) und wird erst geladen, wenn sie zum ersten Mal geoeffnet wird.
const PruefungAnsicht = dynamic(() => import("@/components/pruefung/pruefung-ansicht").then((m) => m.PruefungAnsicht), { ssr: false });

interface KopfEigenschaften {
  t: Uebersetzer;
  tp: Uebersetzer;
  handy: boolean;
  agentAktiv: boolean;
  darstellung: KiDarstellung;
  sichtbar: Ansicht;
  zusaetze: readonly Zusatz[];
  schalteUm: (ziel: Ansicht) => void;
  setDarstellung: (darstellung: KiDarstellung) => void;
  onSchliessen: () => void;
}

/** Schreibtisch: Darstellung und je Zusatzansicht ein Knopf, der sie öffnet und beim zweiten Klick zum Chat zurückführt. */
function SchreibtischKnoepfe({ t, tp, darstellung, sichtbar, zusaetze, schalteUm, setDarstellung }: KopfEigenschaften) {
  const knopf = DARSTELLUNG_KNOPF[darstellung];
  return (
    <>
      <button
        type="button"
        onClick={() => setDarstellung(knopf.ziel)}
        aria-label={t(knopf.text)}
        title={t(knopf.text)}
        className="ki-pane__knopf"
      >
        <knopf.Symbol className="h-4 w-4" />
      </button>
      {zusaetze.map((zusatz) => {
        const { Symbol, text } = ZUSATZ[zusatz];
        return (
          <button
            key={zusatz}
            type="button"
            onClick={() => schalteUm(zusatz)}
            aria-pressed={sichtbar === zusatz}
            aria-label={text(t, tp)}
            title={text(t, tp)}
            className="ki-pane__knopf"
          >
            <Symbol className="h-4 w-4" />
          </button>
        );
      })}
    </>
  );
}

function KiPaneKopf(eigenschaften: KopfEigenschaften) {
  const { t, handy, agentAktiv, sichtbar, schalteUm, onSchliessen } = eigenschaften;
  return (
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
            onClick={() => schalteUm("mehr")}
            aria-pressed={sichtbar === "mehr"}
            aria-label={t("mehr")}
            title={t("mehr")}
            className="ki-pane__knopf"
          >
            {sichtbar === "chat" ? <MoreHorizontal className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        ) : (
          <SchreibtischKnoepfe {...eigenschaften} />
        )}
        <button type="button" onClick={onSchliessen} aria-label={t("schliessen")} title={t("schliessen")} className="ki-pane__knopf">
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
  );
}

/** Eine Ansicht, die eingebunden bleibt, aber verborgen und nicht bedienbar ist, solange eine andere vorn ist. */
function verborgenSolange(nichtVorn: boolean, klasse: string) {
  return { className: cn(klasse, nichtVorn && "pointer-events-none invisible"), inert: nichtVorn ? true : undefined };
}

function KiPaneKoerper({
  t,
  tp,
  sichtbar,
  agentFaehig,
  handy,
  hatEinstellungen,
  verlauf,
  pruefungGeladen,
  pruefungBereiche,
  zusaetze,
  zeige,
}: {
  t: Uebersetzer;
  tp: Uebersetzer;
  sichtbar: Ansicht;
  agentFaehig: boolean;
  handy: boolean;
  hatEinstellungen: boolean;
  verlauf: KiChatNachrichtZeile[];
  pruefungGeladen: boolean;
  pruefungBereiche: readonly Pruefbereich[];
  zusaetze: readonly Zusatz[];
  zeige: (ziel: Ansicht) => void;
}) {
  return (
    <div className="ki-pane__koerper">
      <div {...verborgenSolange(sichtbar !== "chat", "ki-pane__ansicht")}>
        {agentFaehig ? (
          <KiChat verlauf={verlauf} />
        ) : (
          <div className="h-full overflow-y-auto p-4">
            <KiChatFenster verlauf={verlauf} />
          </div>
        )}
      </div>
      {pruefungGeladen && pruefungBereiche.length > 0 ? (
        <div {...verborgenSolange(sichtbar !== "pruefung", "ki-pane__ansicht overflow-y-auto")}>
          <PruefungAnsicht erlaubt={pruefungBereiche} />
        </div>
      ) : null}
      {sichtbar === "mehr" ? (
        <div className="ki-pane__ansicht space-y-2 overflow-y-auto p-4">
          {zusaetze.map((zusatz) => {
            const { Symbol, text } = ZUSATZ[zusatz];
            return <BlattZeile key={zusatz} symbol={<Symbol className="h-5 w-5" />} text={text(t, tp)} onClick={() => zeige(zusatz)} />;
          })}
        </div>
      ) : null}
      {sichtbar === "einstellungen" && hatEinstellungen ? (
        <div className="ki-pane__ansicht space-y-5 overflow-y-auto p-4">
          {/* Der Agent-Schalter fehlt auf dem Handy: dort ruht der
              Modus ohnehin, ein Schalter ohne Wirkung waere
              irrefuehrend. */}
          {agentFaehig && !handy ? <ModusEinstellung /> : null}
          <HaustierEinstellung />
        </div>
      ) : null}
      {sichtbar === "hilfe" ? (
        <div className="ki-pane__ansicht space-y-3 overflow-y-auto p-4">
          <p className="text-sm leading-6 text-muted-foreground">{t("eskalationText")}</p>
          <EskalationsFormular />
        </div>
      ) : null}
    </div>
  );
}

/** Die Hülle des Panels: zu (verborgen, nicht bedienbar), offen, als Dialog auf der Bühne oder als Spalte neben der Seite. */
function KiPaneHuelle({
  t,
  phase,
  offen,
  aufBuehne,
  agentFaehig,
  agentAktiv,
  handyGross,
  children,
}: {
  t: Uebersetzer;
  /** Zustand von Himbi (haustier-kontext.tsx), für die Farben der Hülle. */
  phase: string;
  offen: boolean;
  aufBuehne: boolean;
  agentFaehig: boolean;
  agentAktiv: boolean;
  handyGross: boolean;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={t("chatTitel")}
      aria-hidden={!offen}
      aria-modal={aufBuehne && offen ? true : undefined}
      role={aufBuehne ? "dialog" : undefined}
      data-phase={phase}
      inert={!offen ? true : undefined}
      className={cn(
        "ki-pane-huelle print:hidden",
        offen && "ki-pane-huelle--offen",
        aufBuehne && "ki-pane-huelle--buehne",
        // Nur wenn der Agent an der Seite steht - sonst bleibt das Blatt,
        // wie es war.
        !aufBuehne && agentFaehig && "ki-pane-huelle--agentseite",
        handyGross && "ki-pane-huelle--gross",
      )}
    >
      {aufBuehne ? (
        <span className="ki-buehne-aura" aria-hidden>
          <span className="ki-buehne-aura__blob ki-buehne-aura__blob--1" />
          <span className="ki-buehne-aura__blob ki-buehne-aura__blob--2" />
          <span className="ki-buehne-aura__blob ki-buehne-aura__blob--3" />
        </span>
      ) : null}
      <div className={cn("ki-pane", agentAktiv && "ki-pane--agent")}>{children}</div>
    </aside>
  );
}

/** Handy: der Griff oben macht das Blatt groß oder wieder halb so hoch. */
function HandyGriff({ t, gross, onUmschalten }: { t: Uebersetzer; gross: boolean; onUmschalten: () => void }) {
  return (
    <button
      type="button"
      onClick={onUmschalten}
      aria-label={t(gross ? "kleiner" : "groesser")}
      title={t(gross ? "kleiner" : "groesser")}
      className="ki-pane__handygriff"
    >
      <span aria-hidden />
    </button>
  );
}

export function KiPane({
  verlauf,
  agentFaehig,
  einstellungenZeigen = false,
  pruefungBereiche = [],
}: {
  verlauf: KiChatNachrichtZeile[];
  /** true nur bei einem Anbieter vom Typ 'anthropic' (Werkzeuge + Streaming);
   *  sonst der bisherige nicht-streamende Chat ohne Modi. */
  agentFaehig: boolean;
  /** Die Einstellungen (Haustier) zeigen, auch ohne Agent-Anbieter. Gilt fuer die Administration, wie bisher. Die
   *  Verwaltung von Anbietern, Ratenlimit und Wissensdokumenten steht nicht mehr hier, sondern im Bereich Administration
   *  der Seitenleiste (/dashboard/administration). */
  einstellungenZeigen?: boolean;
  /** Bereiche der Compliance-Pruefung, die die Rolle ausloesen darf (leer = kein Knopf). Erzwungen wird es in /api/ki-pruefung. */
  pruefungBereiche?: readonly Pruefbereich[];
}) {
  const t = useTranslations("kiAssistentAnsicht");
  const { verfuegbar, offen, setOffen, modus, darstellung, setDarstellung, anstoss } = useKiPane();
  const { phase } = useHaustierStatus();
  const tp = useTranslations("pruefung");
  const { ansicht, pruefungGeladen, schalteUm, zeige } = useKiPaneAnsicht(anstoss);
  usePruefungsBreite(ansicht, offen);

  const handy = useIstHandy();
  // Auf dem Handy nimmt die Agenten-Seitenansicht nur die untere Haelfte:
  // oben bleibt die Seite sichtbar, um die es gerade geht. Ein Griff macht
  // das Panel gross, wer lesen statt zusehen will.
  const [handyGross, setHandyGross] = useState(false);
  useHandyBlatt(offen, handy, setOffen);

  if (!verfuegbar) return null;

  // Der Agent steuert das Hauptfenster und lebt davon, dass man dabei zusehen
  // kann. Als Blatt von unten deckt das Panel die Seite fast vollstaendig ab -
  // die Fuehrung liefe hinter dem Blatt ab, wo niemand sie sieht. Auf dem Handy
  // antwortet der Assistent deshalb, fuehrt aber nicht; die Einstellung selbst
  // bleibt unberuehrt und gilt am Schreibtisch weiter.
  const agentAktiv = agentFaehig && modus === "agent" && !handy;
  const aufBuehne = darstellung === "buehne";
  const hatEinstellungen = agentFaehig || einstellungenZeigen;
  // Die Mehr-Ansicht gibt es nur auf dem Handy. Wer das Fenster breiter zieht,
  // waehrend sie offen ist, landet wieder im Gespraech, statt auf einer Seite
  // zu stehen, deren Knopf gerade verschwunden ist.
  const sichtbar: Ansicht = !handy && ansicht === "mehr" ? "chat" : ansicht;
  const vorhanden: Record<Zusatz, boolean> = { pruefung: pruefungBereiche.length > 0, einstellungen: hatEinstellungen, hilfe: true };
  const zusaetze = ZUSATZ_FOLGE.filter((zusatz) => vorhanden[zusatz]);

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
      <KiPaneHuelle
        t={t}
        phase={phase}
        offen={offen}
        aufBuehne={aufBuehne}
        agentFaehig={agentFaehig}
        agentAktiv={agentAktiv}
        handyGross={handyGross}
      >
        {aufBuehne ? null : <KiPaneGriff />}
        {handy && !aufBuehne ? <HandyGriff t={t} gross={handyGross} onUmschalten={() => setHandyGross((v) => !v)} /> : null}
        <KiPaneKopf
          t={t}
          tp={tp}
          handy={handy}
          agentAktiv={agentAktiv}
          darstellung={darstellung}
          sichtbar={sichtbar}
          zusaetze={zusaetze}
          schalteUm={schalteUm}
          setDarstellung={setDarstellung}
          onSchliessen={() => setOffen(false)}
        />
        <KiPaneKoerper
          t={t}
          tp={tp}
          sichtbar={sichtbar}
          agentFaehig={agentFaehig}
          handy={handy}
          hatEinstellungen={hatEinstellungen}
          verlauf={verlauf}
          pruefungGeladen={pruefungGeladen}
          pruefungBereiche={pruefungBereiche}
          zusaetze={zusaetze}
          zeige={zeige}
        />
      </KiPaneHuelle>
    </>
  );
}
