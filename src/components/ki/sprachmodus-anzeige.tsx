"use client";

import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Ear, Loader2, Mic, MicOff, Subtitles, Volume2, X } from "lucide-react";
import { SprachHimbi, type SprachZustand } from "@/components/ki/sprach-himbi";
import { Markdown } from "@/components/ki/ki-chat";
import type { ChatStand, FreigabeAnfrage } from "@/components/ki/sprachmodus-bus";
import { assistentIstDran, type Phase } from "@/lib/domain/sprachmodus";
import { cn } from "@/lib/utils";

// Was der Sprachmodus (sprachmodus.tsx) zeigt, seit dem 14.10.2026 eigene Teilkomponenten: die Statusansage, Himbi mit
// Zustandszeile, den mitlaufenden Text samt Freigabekarte und die Bedienleiste. Das gerenderte HTML ist dasselbe wie vorher
// in einer Komponente.

/** Ein Symbol je Zustand, neben dem Zustandstext - der Ton haengt nie an
 *  der Farbe des Scheins hinter Himbi allein (Rueckmeldung vom 25.09.2026: die vier Farben
 *  liessen sich nicht sicher als "hoert zu / denkt nach / spricht / Fehler"
 *  lesen). "denkt" dreht sich (Loader2), das macht "arbeitet gerade" auch
 *  ohne jedes Lesen der Beschriftung sofort klar. */
const STATUS_SYMBOL: Record<SprachZustand, typeof Ear> = {
  hoert: Ear,
  denkt: Loader2,
  spricht: Volume2,
  pausiert: MicOff,
  fehler: AlertTriangle,
};

interface GespraechsAnzeigeProps {
  phase: Phase;
  chatStand: ChatStand;
  freigabeAnfrage: FreigabeAnfrage | null;
  untertitelAn: boolean;
  zwischentext: string;
  angedockt: boolean;
  blickziel: { x: number; y: number } | null;
  figurKnopfRef: RefObject<HTMLButtonElement | null>;
  spalteRef: RefObject<HTMLDivElement | null>;
  beiFigurKlick: () => void;
}

/** Die Statusansage für Screenreader und die Spalte mit Himbi, Zustandszeile und mitlaufendem Text. */
export function GespraechsAnzeige({
  phase,
  chatStand,
  freigabeAnfrage,
  untertitelAn,
  zwischentext,
  angedockt,
  blickziel,
  figurKnopfRef,
  spalteRef,
  beiFigurKlick,
}: GespraechsAnzeigeProps) {
  const t = useTranslations("kiAssistentAnsicht.sprachmodus");
  // Wartet eine Freigabekarte und Himbi spricht gerade nicht, hoert er auf "Ja" oder "Nein" -
  // bis zum 28.09.2026 stand hier weiter "Himbi spricht", obwohl er auf den Nutzer wartete.
  const wartetAufFreigabe = freigabeAnfrage !== null && !chatStand.spricht && (phase === "denkt" || phase === "spricht" || phase === "hoert");
  const statusText =
    wartetAufFreigabe ? t("status.freigabe")
    : phase === "startet" ? t("status.startet")
    : phase === "hoert" ? t("status.hoert")
    : phase === "denkt" ? t("status.denkt")
    : phase === "spricht" ? t("status.spricht")
    : phase === "pausiert" ? t("status.pausiert")
    : t("status.fehler");

  return (
    <>
      {/* Statusansage fuer Screenreader - ohne den Fokus zu verschieben, ein zweiter Kanal
          neben Himbi und dem Zustandstext (siehe Recherche, Abschnitt Barrierefreiheit). */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusText}
      </p>

      {/* EIN Baum fuer beide Lagen, nur die Klassen wechseln: vorher hingen Knopf und
          Untertitel je Lage an einer anderen Stelle, React baute sie beim Andocken neu,
          und der Tastaturfokus fiel auf <body> (Gegenpruefung vom 25.09.2026).
          Angedockt: links, vertikal mittig ueber der Navigationsleiste (nur diese wird
          unscharf, siehe data-sprach-links in sprachmodus.css - die Mitte bleibt frei
          und scharf). EIN Flex-Block fuer Himbi und Text: waechst der Text nach unten,
          ruecken beide zusammen als Einheit wieder mittig - Himbi wandert dabei von
          selbst nach oben (Rueckmeldung vom 25.09.2026). max-height haelt die Einheit
          dabei immer im Rahmen der Navigationsleiste. In der Mitte ist die Spalte
          display: contents, Himbi und Text stehen wie bisher untereinander. */}
      <div ref={spalteRef} className={angedockt ? "ki-sprachmodus__links-spalte" : "ki-sprachmodus__mitte"}>
        <HimbiMitZustand
          phase={phase}
          wartetAufFreigabe={wartetAufFreigabe}
          statusText={statusText}
          angedockt={angedockt}
          blickziel={blickziel}
          figurKnopfRef={figurKnopfRef}
          beiFigurKlick={beiFigurKlick}
        />
        <SprachUntertitel phase={phase} chatStand={chatStand} freigabeAnfrage={freigabeAnfrage} untertitelAn={untertitelAn} zwischentext={zwischentext} />
      </div>
    </>
  );
}

interface HimbiMitZustandProps {
  phase: Phase;
  wartetAufFreigabe: boolean;
  statusText: string;
  angedockt: boolean;
  blickziel: { x: number; y: number } | null;
  figurKnopfRef: RefObject<HTMLButtonElement | null>;
  beiFigurKlick: () => void;
}

/** Himbi als Knopf (unterbrechen, erneut versuchen) und darunter die Zustandszeile. */
function HimbiMitZustand({ phase, wartetAufFreigabe, statusText, angedockt, blickziel, figurKnopfRef, beiFigurKlick }: HimbiMitZustandProps) {
  const t = useTranslations("kiAssistentAnsicht.sprachmodus");
  const sprachZustand: SprachZustand = wartetAufFreigabe
    ? "hoert"
    : phase === "fehler" ? "fehler" : phase === "pausiert" ? "pausiert" : phase === "spricht" ? "spricht" : phase === "denkt" ? "denkt" : "hoert";
  // Der Zustand haengt nie an der Farbe allein (Rueckmeldung vom 25.09.2026:
  // "weiss anhand der Farbe nicht, ob die KI zuhoert, denkt oder spricht") -
  // dasselbe Symbol wie der Zustandstext daneben, unabhaengig vom Farbsehen.
  const StatusSymbol = STATUS_SYMBOL[sprachZustand];
  const figurBeschriftung = phase === "fehler" ? t("erneut") : assistentIstDran(phase) ? t("unterbrechen") : statusText;

  // Himbi + Knopf: identischer Inhalt in beiden Lagen (Mitte, links) - nur die
  // Groesse unterscheidet sich (sprachmodus.css, --himbi-b). Bis zum 25.09.2026 stand
  // hier eine Kugel; jetzt fuehrt Himbi das Gespraech, mit Lippen, die der Stimme folgen
  // (sprach-himbi.tsx). Ist ein Bereich hervorgehoben, sieht Himbi zu ihm hin.
  const figurKnopf = (
    <button
      ref={figurKnopfRef}
      type="button"
      onClick={beiFigurKlick}
      className="ki-sprachmodus__figur-knopf"
      aria-label={figurBeschriftung}
      title={figurBeschriftung}
    >
      <SprachHimbi zustand={sprachZustand} groesse={angedockt ? "klein" : "mitte"} blickziel={blickziel} links={angedockt} />
    </button>
  );
  const statusZeile = (
    <p className="ki-sprachmodus__status">
      <StatusSymbol className={cn("ki-sprachmodus__status-symbol", sprachZustand === "denkt" && "ki-sprachmodus__status-symbol--dreht")} aria-hidden />
      {statusText}
    </p>
  );
  return (
    <div className={cn("ki-sprachmodus__figur-huelle", angedockt && "ki-sprachmodus__figur-huelle--links")}>
      {figurKnopf}
      {statusZeile}
    </div>
  );
}

interface SprachUntertitelProps {
  phase: Phase;
  chatStand: ChatStand;
  freigabeAnfrage: FreigabeAnfrage | null;
  untertitelAn: boolean;
  zwischentext: string;
}

/** Eine offene Freigabekarte oder, wenn eingeschaltet, der mitlaufende Text. */
function SprachUntertitel({ phase, chatStand, freigabeAnfrage, untertitelAn, zwischentext }: SprachUntertitelProps) {
  const t = useTranslations("kiAssistentAnsicht.sprachmodus");
  // Eine offene Freigabe (Klick- oder Aktionskarte, sprachmodus-bus.ts) geht
  // ÜBER allem anderen: sichtbar, auch wenn die Untertitel ausgeschaltet sind -
  // eine Sicherheitsfrage darf nie unsichtbar bleiben. "Ja"/"Nein" loest sie
  // auf, in jeder Phase (siehe beiEndpunkt in sprachmodus-erkennung.ts, freigabeAntwortMitEcho).
  const untertitel = freigabeAnfrage ? (
    <div className="ki-sprachmodus__untertitel ki-sprachmodus__untertitel--freigabe" role="alertdialog" aria-live="assertive">
      <p className="ki-sprachmodus__untertitel-zeile">{freigabeAnfrage.text}</p>
      <p className="ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer">{t("freigabeHinweis")}</p>
    </div>
  ) : untertitelAn ? (
    <div className="ki-sprachmodus__untertitel" aria-hidden={phase !== "hoert"}>
      {phase === "hoert" ? (
        <p className="ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer">
          {zwischentext || (phase === "hoert" ? t("hoertZu") : "")}
        </p>
      ) : (chatStand.antwort || phase === "spricht" || phase === "denkt") ? (
        // Nie das rohe Markdown der Antwort ("**fett**", "1. ...") - das
        // stand bis zum 25.09.2026 unbereinigt im Untertitel, bei
        // laengeren Antworten kaum lesbar. Dieselbe Markdown-Darstellung
        // wie im sichtbaren Chat (Absaetze, Fettdruck, Listen).
        <div className="ki-sprachmodus__untertitel-zeile">
          <Markdown text={chatStand.antwort} />
        </div>
      ) : null}
    </div>
  ) : null;
  return untertitel;
}

interface SprachLeisteProps {
  phase: Phase;
  untertitelAn: boolean;
  pausieren: () => void;
  schalteUntertitel: () => void;
  beenden: () => void;
}

/** Die Bedienleiste: Stumm oder erneut versuchen, mitlaufender Text, Beenden. */
export function SprachLeiste({ phase, untertitelAn, pausieren, schalteUntertitel, beenden }: SprachLeisteProps) {
  const t = useTranslations("kiAssistentAnsicht.sprachmodus");
  return (
    <div className="ki-sprachmodus__leiste">
      <button
        type="button"
        onClick={pausieren}
        aria-pressed={phase === "pausiert"}
        aria-label={phase === "fehler" ? t("erneut") : phase === "pausiert" ? t("fortsetzen") : t("stumm")}
        title={phase === "fehler" ? t("erneut") : phase === "pausiert" ? t("fortsetzen") : t("stumm")}
        className="ki-sprachmodus__knopf"
      >
        {phase === "pausiert" ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </button>
      <button
        type="button"
        onClick={schalteUntertitel}
        aria-pressed={untertitelAn}
        aria-label={t("untertitel")}
        title={t("untertitel")}
        className={cn("ki-sprachmodus__knopf ki-sprachmodus__knopf--untertitel", untertitelAn && "ki-sprachmodus__knopf--aktiv")}
      >
        <Subtitles className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={beenden}
        aria-label={t("beenden")}
        title={t("beenden")}
        className="ki-sprachmodus__knopf ki-sprachmodus__knopf--beenden"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
