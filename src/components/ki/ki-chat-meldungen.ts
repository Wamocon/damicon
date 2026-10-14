"use client";

// Was der KI-Chat (ki-chat.tsx) nach außen meldet, ohne selbst etwas zu zeichnen:
// dem Takt des Sprachmodus, was die Stimme tut (sprach-takt.ts); dem Sprachmodus
// die offene Freigabe und den Stand des Chats (sprachmodus-bus.ts); und Himbi, was
// der Agent gerade tut und wie die Antwort klang (components/haustier).

import { useEffect, useMemo } from "react";
import { isDynamicToolUIPart, isToolUIPart, type UIMessage } from "ai";
import { useTranslations } from "next-intl";
import { useHaustierAktionen } from "@/components/haustier/haustier-kontext";
import { segmentiere, textVonNachricht, type AktionsKarte } from "@/components/ki/ki-chat-segmente";
import type { useKiChatSprache, Vorlesen } from "@/components/ki/ki-chat-sprache";
import type { KlickAnfrageMitEntscheidung } from "@/components/ki/ki-chat-werkzeuge";
import type { useSprachTakt } from "@/components/ki/sprach-takt";
import { meldeChatStand, meldeFreigabeAnfrage, registriereEntsperren, registriereGerade } from "@/components/ki/sprachmodus-bus";
import { agentPhase, stimmungAusAntwort } from "@/lib/haustier";

type Live = ReturnType<typeof useKiChatSprache>["live"];
type TaktRefs = ReturnType<typeof useSprachTakt>;

/** Der Takt des Sprachmodus wartet auf die Stimme: er liest über seine Refs (sprach-takt.ts), was sie tut, wo sie ist und wie man sie anhält. */
export function useTaktVerdrahtung({
  stimmeRef,
  aktivRef,
  standRef,
  halteRef,
  live,
  vorlesen,
  sprachmodus,
}: {
  stimmeRef: TaktRefs["stimme"];
  aktivRef: TaktRefs["aktiv"];
  standRef: TaktRefs["stand"];
  halteRef: TaktRefs["halte"];
  live: Live;
  vorlesen: Vorlesen;
  sprachmodus: boolean;
}) {
  const geradeSprechend = live.gerade;
  const halteStimme = live.halte;
  useEffect(() => {
    halteRef.current = halteStimme;
    return () => {
      halteRef.current = null;
    };
  }, [halteStimme, halteRef]);
  useEffect(() => {
    stimmeRef.current = vorlesen.phase;
  }, [vorlesen.phase, stimmeRef]);
  useEffect(() => {
    standRef.current = geradeSprechend;
    registriereGerade(geradeSprechend);
    return () => {
      standRef.current = null;
      registriereGerade(null);
    };
  }, [geradeSprechend, standRef]);
  useEffect(() => {
    aktivRef.current = sprachmodus;
  }, [sprachmodus, aktivRef]);
}

export function useFreigabeMeldung({
  klickAnfrage,
  messages,
  freigabe,
}: {
  klickAnfrage: KlickAnfrageMitEntscheidung | null;
  messages: UIMessage[];
  freigabe: (karte: AktionsKarte, erlaubt: boolean) => void;
}) {
  const t = useTranslations("kiAssistentAnsicht");
  // Eine Aktion, die gerade auf Freigabe wartet (Kartenzustand "freigabe") -
  // wie freigabeOffen in useHimbiMeldung: nur auf der letzten Nachricht, aus demselben Grund.
  const anstehendeAktion = useMemo(() => {
    const letzte = messages.at(-1);
    if (!letzte || letzte.role !== "assistant") return null;
    const segment = segmentiere(letzte).find((s) => s.art === "aktion" && s.karte.zustand === "freigabe");
    return segment && segment.art === "aktion" ? segment.karte : null;
  }, [messages]);

  // Meldet die offene Freigabekarte (Klick ODER Aktion) an den Sprachmodus -
  // der Sprachmodus hat seit dem 25.09.2026 dieselben Rechte wie der sichtbare
  // Chat und braucht deshalb auch dessen Freigabeschritt (sprachmodus-bus.ts,
  // Kommentar dort). Harmlos, wenn der Sprachmodus gar nicht laeuft: niemand
  // liest die Meldung dann. Derselbe Text wie auf der sichtbaren Karte, aus
  // denselben Uebersetzungen (t, "kiAssistentAnsicht").
  useEffect(() => {
    /** Der Text einer Aktionskarte für den Sprachmodus: Titel und die ausgefüllten Felder. */
    const aktionsFreigabeText = (karte: AktionsKarte) => {
      const felder = Object.entries(karte.eingabe)
        .filter(([, wert]) => wert !== undefined && wert !== null && wert !== "")
        .map(([schluessel, wert]) => `${t.has(`aktion.felder.${schluessel}`) ? t(`aktion.felder.${schluessel}`) : schluessel}: ${String(wert)}`)
        .join(", ");
      const titel = t(`aktion.titel.${karte.name}`);
      return felder ? `${titel}: ${felder}` : titel;
    };
    if (klickAnfrage) {
      meldeFreigabeAnfrage(`${t("klick.titel")}: ${klickAnfrage.absicht} – ${klickAnfrage.label}`, (erlaubt) =>
        klickAnfrage.entscheide(erlaubt),
      );
      return;
    }
    if (anstehendeAktion) {
      const karte = anstehendeAktion;
      meldeFreigabeAnfrage(aktionsFreigabeText(karte), (erlaubt) => freigabe(karte, erlaubt));
      return;
    }
    meldeFreigabeAnfrage(null, null);
  }, [klickAnfrage, anstehendeAktion, t, freigabe]);
}

// Himbi (components/haustier) zeigt den Zustand des Agenten auch bei geschlossenem Panel:
// hier wird nur gemeldet, das Zeichnen uebernimmt Himbi.
export function useHimbiMeldung({
  beschaeftigt,
  klickAnfrage,
  messages,
  error,
  haustierText,
  eingabe,
}: {
  beschaeftigt: boolean;
  klickAnfrage: KlickAnfrageMitEntscheidung | null;
  messages: UIMessage[];
  error: Error | undefined;
  /** Was der Agent gerade tut, leer, solange er nicht arbeitet. */
  haustierText: string;
  /** Was gerade im Eingabefeld steht. */
  eingabe: string;
}) {
  const { melde } = useHaustierAktionen();
  const freigabeOffen =
    klickAnfrage !== null ||
    !!messages.at(-1)?.parts.some((teil) => (isToolUIPart(teil) || isDynamicToolUIPart(teil)) && teil.state === "approval-requested");
  const haustierPhase = agentPhase({ beschaeftigt, freigabeOffen, fehler: !!error });
  // Wie die fertige Antwort geklungen hat, entscheidet Himbis Gesicht. Bewusst hier und
  // nicht im Modell: kein zweiter Aufruf, keine Wartezeit, und es funktioniert in jeder
  // der fuenf Sprachen der Oberflaeche.
  //
  // Waehrend getippt wird, geht die eigene Nachricht vor: Himbi reagiert direkt auf das,
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
}

/** Der Sprachmodus liest den Stand des Chats über den Bus: arbeitet er, spricht er, was sagt er, und wie man den Ton entsperrt. */
export function useChatStandMeldung({
  live,
  beschaeftigt,
  vorlesen,
  messages,
  istErsteNachricht,
  einwilligung,
  error,
}: {
  live: Live;
  beschaeftigt: boolean;
  vorlesen: Vorlesen;
  messages: UIMessage[];
  istErsteNachricht: boolean;
  einwilligung: boolean;
  error: Error | undefined;
}) {
  useEffect(() => {
    registriereEntsperren(live.entsperre);
    return () => registriereEntsperren(null);
  }, [live.entsperre]);

  const letzteNachricht = messages.at(-1);
  const antwortText = letzteNachricht?.role === "assistant" ? textVonNachricht(letzteNachricht) : "";
  useEffect(() => {
    meldeChatStand({
      beschaeftigt,
      spricht: vorlesen.phase === "spricht",
      laedt: vorlesen.phase === "laedt",
      antwort: antwortText,
      einwilligungFehlt: istErsteNachricht && !einwilligung,
      fehler: Boolean(error),
      bereit: true,
    });
  }, [beschaeftigt, vorlesen.phase, antwortText, istErsteNachricht, einwilligung, error]);
  useEffect(
    () => () =>
      meldeChatStand({ beschaeftigt: false, spricht: false, laedt: false, antwort: "", einwilligungFehlt: false, fehler: false, bereit: false }),
    [],
  );
}
