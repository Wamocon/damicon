"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { usePersona } from "@/components/dashboard/persona";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { type KiChatNachrichtZeile } from "@/lib/domain/ki-assistent";
import { erstelleBeschriftungen, laufenderSchrittVon, verlaufZuNachrichten } from "@/components/ki/ki-chat-segmente";
import { clientErgebnisseBereit, useKlientWerkzeuge, type WerkzeugChat } from "@/components/ki/ki-chat-werkzeuge";
import { useSprachTakt } from "@/components/ki/sprach-takt";
import { useKiChatSprache } from "@/components/ki/ki-chat-sprache";
import { KiChatComposer } from "@/components/ki/ki-chat-composer";
import { useKiChatAnfrage, useSprachStart, type ZugModus } from "@/components/ki/ki-chat-anfrage";
import { useKiChatEingabe } from "@/components/ki/ki-chat-eingabe";
import { useErgebnisFolgen } from "@/components/ki/ki-chat-folgen";
import { useFragenVonAussen, useSprachmodusFragen } from "@/components/ki/ki-chat-fragen";
import { useChatStandMeldung, useFreigabeMeldung, useHimbiMeldung, useTaktVerdrahtung } from "@/components/ki/ki-chat-meldungen";
import { KiChatNachricht } from "@/components/ki/ki-chat-nachricht";
import { useKiChatScroll } from "@/components/ki/ki-chat-scroll";
import { useKiChatZug } from "@/components/ki/ki-chat-zug";
import { KiChatFehler, KiChatKlickKarte, KiChatLeer, KiChatStatus } from "@/components/ki/ki-chat-zustaende";

// Der Sprachmodus (sprachmodus-anzeige.tsx) holt die Markdown-Darstellung seit jeher von hier.
export { Markdown } from "@/components/ki/ki-chat-markdown";

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
// Die Komponente buendelt nur noch die Verdrahtung der Hooks. In eigenen Modulen
// stehen: die Anfrage samt Transport (ki-chat-anfrage.ts), Client-Werkzeuge und
// Klickfreigabe (ki-chat-werkzeuge.ts), Sprachein- und -ausgabe (ki-chat-sprache.ts),
// das Eingabefeld (ki-chat-eingabe.ts), Senden, Freigeben und Stoppen eines Zuges
// (ki-chat-zug.ts), was aus Werkzeugergebnissen folgt (ki-chat-folgen.ts), das
// Scrollen (ki-chat-scroll.ts), die reinen Segmentierungs- und Beschriftungs-
// funktionen (ki-chat-segmente.ts) und die Darstellung: Nachricht
// (ki-chat-nachricht.tsx), Zustände der Verlaufsfläche (ki-chat-zustaende.tsx),
// Markdown (ki-chat-markdown.tsx), Aktionskarte (ki-chat-aktionskarte.tsx) und
// Composer (ki-chat-composer.tsx).

// Mindestabstand zwischen zwei Aktualisierungen des Chats waehrend des Streamens.
const STREAM_DROSSEL_MS = 80;

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
  const {
    modus: panelModus,
    offen,
    fuehrung,
    oeffneZiel,
    fuehreZu,
    fuehrungBeenden,
    bewegeZeiger,
    pruefBezug,
    entferneBezug,
    anstoss,
    sprachmodus,
    sprachmodusMoeglich,
    starteSprachmodus,
  } = useKiPane();
  // Im Sprachmodus (components/ki/sprachmodus.tsx) laeuft jede Anfrage als "sprache": kurze,
  // sprechbare Antworten, Navigation und Hervorheben ohne Klicken. Der Modus der Einstellung
  // bleibt dabei unberuehrt und gilt wieder, sobald der Sprachmodus endet.
  const modus: ZugModus = sprachmodus ? "sprache" : panelModus;

  const [einwilligung, setEinwilligung] = useState(false);

  // pruefkontext: der Prüfbericht, auf dem das Gespräch aufsetzt (nach einer Compliance-Prüfung), sonst undefined.
  // Im Sprachmodus nie: dort zeigt die Fuehrung selbst auf den Bericht (Sprechmarken,
  // oeffneBereich "pruefbericht"), und die Anweisung zum Pruefbezug verlangte ein
  // Werkzeug, das im Sprachmodus nichts bewirkt (Befund vom 25.09.2026: ein Bezug von
  // morgens faerbte jede spaetere Sprachmodus-Frage ein).
  const pruefkontext = sprachmodus ? undefined : pruefBezug?.kontext;
  // Was bei jeder Anfrage mitgeht und welcher Teil des Verlaufs ans Modell geht: ki-chat-anfrage.ts.
  const { anfrageDaten, gehoertBis, sprachStart, transport, ergaenzeAnfrage } = useKiChatAnfrage({ einwilligung, modus, pfad, rolle, sprache, pruefkontext });

  // Client-Werkzeuge (Klick/Feld/Scroll/Zeigen im Dashboard) und die
  // Klickfreigabe dafuer - siehe ki-chat-werkzeuge.ts. Muss vor useChat()
  // stehen: dessen onToolCall braucht starteClientWerkzeug schon fuer den
  // Aufruf selbst; der Chat (fuer setChat) existiert erst danach.
  const takt = useSprachTakt();
  const {
    clientAktiv,
    klickAnfrage,
    starteClientWerkzeug,
    setChat: setWerkzeugChat,
    neuerZug: werkzeugeNeuerZug,
    abbrechen: werkzeugeAbbrechen,
    unterSchrittGrenze,
  } = useKlientWerkzeuge({
    bewegeZeiger,
    // Der Sprachmodus hat seit dem 25.09.2026 dieselben Rechte wie der
    // sichtbare Chat (Rueckmeldung vom 25.09.2026: "der Sprachmodus soll die
    // gleichen Rechte haben wie der Chat") - "sprache" zaehlt hier wie
    // "agent", kein eigener nurZeigen-Fall mehr noetig.
    istAgentModus: () => anfrageDaten.current.modus !== "assistent",
    // Im Sprachmodus wartet jede sichtbare Handlung, bis die Stimme den Satz
    // davor gesprochen hat (sprach-takt.ts).
    vorAusfuehrung: takt.vorAusfuehrung,
  });

  const initialMessages = useMemo(() => verlaufZuNachrichten(verlauf), [verlauf]);
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
    vorlesen,
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
    sprachmodus,
  });
  const istErsteNachricht = messages.length === 0;
  const einwilligungFehlt = istErsteNachricht && !einwilligung;

  // Der Takt des Sprachmodus liest, was die Stimme tut (ki-chat-meldungen.ts); der Beginn eines
  // Sprachmodus-Gesprächs begrenzt den Verlauf fürs Modell (ki-chat-anfrage.ts).
  useTaktVerdrahtung({ stimmeRef: takt.stimme, aktivRef: takt.aktiv, standRef: takt.stand, halteRef: takt.halte, live, vorlesen, sprachmodus });
  useSprachStart(sprachStart, sprachmodus, messages.length);

  const { scrollRef, nachUntenKnopf, setNachUntenKnopf, beiScroll, nachUnten, klebeUnten } = useKiChatScroll({ messages, status, offen, klickAnfrage });
  const { eingabe, eingabeRef, beiEingabe, beiMikrofonStart, beiMikrofonZwischentext, beiMikrofonText, leereFeld, insFeld } = useKiChatEingabe({
    vorlesenPhase: vorlesen.phase,
    stoppeStimme,
    stilleFuerDiktat,
    merkeDiktatSprachen,
  });
  const { zugModus, sende, stopp, freigabe } = useKiChatZug({
    modus,
    sprachmodus,
    beschaeftigt,
    istErsteNachricht,
    einwilligung,
    ergaenzeAnfrage,
    klebeUnten,
    setNachUntenKnopf,
    sendMessage,
    stop,
    addToolApprovalResponse,
    beginneZug,
    stoppeStimme,
    werkzeugeNeuerZug,
    werkzeugeAbbrechen,
    taktNeuerZug: takt.neuerZug,
    fuehrungBeenden,
    leereFeld,
  });
  useErgebnisFolgen({ messages, router, zugModus, takt, fuehreZu, oeffneZiel, beschriftung });
  useFreigabeMeldung({ klickAnfrage, messages, freigabe });

  const laufenderSchritt = useMemo(() => laufenderSchrittVon(messages), [messages]);
  // Was der Agent gerade tut: Statuszeile im Chat und Text an Himbi (nur, solange er arbeitet).
  const statusText = laufenderSchritt
    ? beschriftung("laeuft", laufenderSchritt.name, {
        bereich: laufenderSchritt.bereich,
        tabelle: laufenderSchritt.tabelle,
        absicht: laufenderSchritt.absicht,
      })
    : t(modus === "agent" ? "agentDenkt" : "assistentDenkt");
  useHimbiMeldung({ beschaeftigt, klickAnfrage, messages, error, haustierText: !beschaeftigt ? "" : statusText, eingabe });

  // Fragen von Himbi, aus dem Prüfbericht, der Suche und dem Sprachmodus (ki-chat-fragen.ts).
  useFragenVonAussen({
    anstoss,
    kannSenden: !(beschaeftigt || einwilligungFehlt),
    pruefkontext,
    ergaenzeAnfrage,
    insFeld,
    eingabeRef,
    sende,
  });
  useSprachmodusFragen({
    sprachmodus,
    beschaeftigt,
    messages,
    setMessages,
    ergaenzeAnfrage,
    gehoertBis,
    merkeDiktatSprachen,
    sende,
    stopp,
  });
  useChatStandMeldung({ live, beschaeftigt, vorlesen, messages, istErsteNachricht, einwilligung, error });

  const letzteId = messages.at(-1)?.id;

  function absenden(e: FormEvent) {
    e.preventDefault();
    sende(eingabe, true);
  }

  function beiTaste(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sende(eingabe, true);
    }
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
            <KiChatLeer
              rolle={rolle}
              modus={panelModus}
              gesperrt={einwilligungFehlt || beschaeftigt}
              onVorschlag={(vorschlag) => sende(vorschlag)}
            />
          ) : (
            messages.map((nachricht) => (
              <KiChatNachricht
                key={nachricht.id}
                nachricht={nachricht}
                beschaeftigt={beschaeftigt}
                letzteId={letzteId}
                sprache={sprache}
                vorlesen={vorlesen}
                fuehrung={fuehrung}
                beschriftung={beschriftung}
                onFreigabe={freigabe}
                onZielOeffnen={oeffneZiel}
              />
            ))
          )}

          {klickAnfrage ? <KiChatKlickKarte anfrage={klickAnfrage} /> : null}

          {beschaeftigt && !klickAnfrage ? <KiChatStatus text={statusText} /> : null}

          {error ? (
            <KiChatFehler
              error={error}
              sprache={sprache}
              onNeuBeginnen={() => {
                // Nur die Ansicht und der Kontext dieser Sitzung beginnen neu; der gespeicherte Verlauf bleibt.
                clearError();
                setMessages([]);
              }}
            />
          ) : null}
        </div>

        {nachUntenKnopf ? (
          <button type="button" onClick={nachUnten} className="ki-nach-unten" aria-label={t("nachUnten")}>
            <ArrowDown className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <KiChatComposer
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
        vorlesen={vorlesen}
        sprachmodusMoeglich={sprachmodusMoeglich}
        onSprachmodus={() => {
          // Was gerade spricht, verstummt - der Sprachmodus beginnt mit Zuhoeren.
          stoppeStimme();
          starteSprachmodus();
        }}
      />
    </div>
  );
}
