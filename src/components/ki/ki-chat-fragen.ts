"use client";

// Fragen, die von außen an den KI-Chat (ki-chat.tsx) kommen: von Himbi (Vorgabe),
// aus dem Prüfbericht oder der Suche (Anstoss) und aus dem Sprachmodus (Frage und
// Stopp über sprachmodus-bus.ts). Jede geht hinaus, sobald es geht; sonst steht
// sie im Eingabefeld oder wartet, bis der Chat frei ist.

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import type { UIMessage } from "ai";
import { useHaustierVorgabe } from "@/components/haustier/haustier-kontext";
import type { Anstoss } from "@/components/ki/ki-pane-kontext";
import { abonniereSprachBus, leseSprachFrage, leseStopp, zaehlerServer, type SprachFrage } from "@/components/ki/sprachmodus-bus";

type Sende = (text: string, ausFeld?: boolean, erzwingeVorlesen?: boolean) => void;

export function useFragenVonAussen({
  anstoss,
  kannSenden,
  pruefkontext,
  ergaenzeAnfrage,
  insFeld,
  eingabeRef,
  sende,
}: {
  anstoss: Anstoss | null;
  /** Weder läuft eine Antwort, noch fehlt die Einwilligung. */
  kannSenden: boolean;
  pruefkontext: string | undefined;
  ergaenzeAnfrage: (teil: Record<string, unknown>) => void;
  insFeld: (text: string) => void;
  eingabeRef: RefObject<HTMLTextAreaElement | null>;
  sende: Sende;
}) {
  // Eine Frage, die Himbi stellen moechte ("Zeig mir das" im Tipp): abschicken, sobald es geht;
  // fehlt noch die Einwilligung oder laeuft gerade eine Antwort, landet sie im Eingabefeld.
  const vorgabe = useHaustierVorgabe();
  const letzteVorgabe = useRef(0);
  useEffect(() => {
    if (!vorgabe || vorgabe.id === letzteVorgabe.current) return;
    letzteVorgabe.current = vorgabe.id;
    if (!kannSenden) {
      insFeld(vorgabe.text);
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
    if (!kannSenden) {
      insFeld(anstoss.frage);
    } else {
      // Der Effekt in useKiChatAnfrage hat anfrageDaten noch nicht aktualisiert, wenn Bezug und Anstoss im selben Zug gesetzt werden.
      ergaenzeAnfrage({ pruefkontext });
      // Eine Frage zum Pruefbericht (Tour-Zusammenfassung, Knopf im Bericht) stellt die
      // Oberflaeche selbst - immer gesprochen, das ist ihr Zweck (siehe beginneZug()). Eine
      // Frage aus der Suche ("KI fragen") ist dagegen wie getippt.
      sende(anstoss.frage, false, anstoss.zurPruefung);
      // Der Anstoss kommt oft aus einer Ebene, die sich dabei schliesst (die
      // Suche): ohne das stuende der Tastaturfokus danach auf <body>.
      eingabeRef.current?.focus();
    }
    // sende() und die Zustandswerte sind pro Render neu; ausgeloest wird nur durch einen neuen Anstoss.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anstoss]);
}

/** Nachsatz: die vorige Frage und ihre angefangene Antwort gehen, die zusammengefuegte kommt. */
function ohneLetzteFrage(alt: UIMessage[]): UIMessage[] {
  let i = alt.length - 1;
  while (i >= 0 && alt[i]!.role === "assistant") i -= 1;
  return i >= 0 && alt[i]!.role === "user" ? alt.slice(0, i) : alt;
}

// --- Sprachmodus (components/ki/sprachmodus.tsx) ------------------------------------
// Der Sprachmodus hat keinen eigenen Chat: er stellt seine Fragen DIESEM Chat und hoert
// mit, was er tut (sprachmodus-bus.ts). So gibt es einen Verlauf, einen Satz Werkzeuge
// und eine Navigation - und nach dem Gespraech steht alles hier zum Nachlesen.
export function useSprachmodusFragen({
  sprachmodus,
  beschaeftigt,
  messages,
  setMessages,
  ergaenzeAnfrage,
  gehoertBis,
  merkeDiktatSprachen,
  sende,
  stopp,
}: {
  sprachmodus: boolean;
  beschaeftigt: boolean;
  messages: UIMessage[];
  setMessages: (aendere: (alt: UIMessage[]) => UIMessage[]) => void;
  ergaenzeAnfrage: (teil: Record<string, unknown>) => void;
  /** ki-chat-anfrage.ts: wo unterbrochene Antworten fürs Modell enden. */
  gehoertBis: RefObject<Map<string, string>>;
  merkeDiktatSprachen: (sprachen: string[] | undefined) => void;
  sende: Sende;
  stopp: () => void;
}) {
  const sprachFrage = useSyncExternalStore(abonniereSprachBus, leseSprachFrage, () => null);
  const stoppZaehler = useSyncExternalStore(abonniereSprachBus, leseStopp, zaehlerServer);
  const letzteSprachFrage = useRef(0);
  const letzterStopp = useRef(stoppZaehler);

  // Eine Frage, die kommt, waehrend die vorige Antwort noch abbricht (Unterbrechung,
  // Nachsatz), wartet, bis der Chat frei ist. Vorher schluckte sende() sie stillschweigend,
  // weil es waehrend einer laufenden Anfrage nichts abschickt.
  const wartendeSprachFrage = useRef<SprachFrage | null>(null);
  function schickeWartendeSprachFrage() {
    const f = wartendeSprachFrage.current;
    if (!f || beschaeftigt) return;
    wartendeSprachFrage.current = null;
    if (f.ersetztLetzte) setMessages(ohneLetzteFrage);
    if (f.unterbrochen) {
      ergaenzeAnfrage({ unterbrochen: f.unterbrochen });
      // Die unterbrochene Antwort ist die letzte im Verlauf: fuers Modell endet sie ab jetzt beim
      // zuletzt gehoerten Satz, auch bei allen spaeteren Fragen.
      const unterbrocheneAntwort = messages.findLast((m) => m.role === "assistant");
      if (unterbrocheneAntwort) gehoertBis.current.set(unterbrocheneAntwort.id, f.unterbrochen);
    }
    // Gesprochen, also wie ein Diktat: die gehoerten Sprachen gehen mit und entscheiden
    // ueber die Sprache der Antwort (domain/antwortsprache.ts).
    merkeDiktatSprachen(f.sprachen);
    sende(f.text, true);
  }
  useEffect(() => {
    if (!sprachFrage || sprachFrage.nr === letzteSprachFrage.current) return;
    letzteSprachFrage.current = sprachFrage.nr;
    if (!sprachmodus) return;
    wartendeSprachFrage.current = sprachFrage;
    schickeWartendeSprachFrage();
    // Die Funktion ist pro Render neu; ausgeloest wird nur durch eine neue Frage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprachFrage]);
  useEffect(() => {
    if (!beschaeftigt) schickeWartendeSprachFrage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beschaeftigt]);

  useEffect(() => {
    if (stoppZaehler === letzterStopp.current) return;
    letzterStopp.current = stoppZaehler;
    stopp();
    // stopp() ist pro Render neu; ausgeloest wird nur durch einen neuen Stopp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stoppZaehler]);
}
