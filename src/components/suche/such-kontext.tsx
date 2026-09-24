"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { usePathname } from "@/i18n/navigation";
import { useBlatt } from "@/components/dashboard/blatt-kontext";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { SuchDialog } from "@/components/suche/such-dialog";
import { istSuchKuerzel } from "@/lib/suche/kern";
import { zielSchluesselFuerPfad } from "@/lib/suche/seiten-ziele";
import { browserAblage, liesZuletzt, merkeZuletzt } from "@/lib/suche/zuletzt";

// Gemeinsamer Zustand der globalen Suche: die Ausloeser in der Kopfzeile
// (such-ausloeser.tsx) oeffnen, der Dialog steht genau einmal im Layout.
// Er geht immer oben in der Mitte des Bildschirms auf, egal welcher Ausloeser
// ihn oeffnet (Sheet "oben").
//
// Der Dialog haengt hier und nicht in der Kopfzeile. Deren backdrop-blur macht
// sie zum Bezugsrahmen fuer fixierte Kinder - ein Blatt darin waere auf die
// Kopfzeile beschnitten. Ausserdem wird die Spalte mit der Kopfzeile inert,
// sobald ein Blatt der unteren Leiste offen ist (blatt-kontext.tsx).

interface SuchWert {
  offen: boolean;
  oeffne: () => void;
}

const SuchKontext = createContext<SuchWert>({ offen: false, oeffne: () => {} });

export function useSuche(): SuchWert {
  return useContext(SuchKontext);
}

function istEingabefeld(ziel: EventTarget | null): boolean {
  return (
    ziel instanceof HTMLElement &&
    (ziel.isContentEditable || ziel.matches("input, textarea, select"))
  );
}

export function SuchProvider({
  nutzerId,
  children,
}: {
  /** Wem die Zuletzt-Liste gehoert. Null im Demo-Betrieb ohne Anmeldung. */
  nutzerId: string | null;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const [zuletzt, setZuletzt] = useState<string[]>([]);
  const feldRef = useRef<HTMLInputElement>(null);
  // Wer die Suche geoeffnet hat, bekommt den Fokus zurueck, wenn sie ohne
  // Sprung geschlossen wird - sonst stuende er nach Esc irgendwo am Seitenanfang.
  const ausloeserRef = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const { offen: blattOffen } = useBlatt();
  const { tourLaeuft } = useKiPane();

  const oeffne = useCallback(() => {
    if (offen) {
      feldRef.current?.focus();
      feldRef.current?.select();
      return;
    }
    ausloeserRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Die Liste beim Oeffnen lesen und nicht beim Rendern: der Server kennt
    // keinen localStorage, und jedes Oeffnen soll den neuesten Stand zeigen.
    setZuletzt(liesZuletzt(browserAblage(), nutzerId));
    // Sofort rendern und noch im selben Tipp fokussieren. iOS oeffnet die
    // Tastatur nur, wenn der Fokus innerhalb der Beruehrung gesetzt wird -
    // ein Effekt danach kaeme zu spaet, das Feld waere fokussiert, aber ohne
    // Tastatur.
    flushSync(() => setOffen(true));
    feldRef.current?.focus();
  }, [offen, nutzerId]);

  const schliesse = useCallback((fokusZurueck: boolean) => {
    const ausloeser = ausloeserRef.current;
    ausloeserRef.current = null;
    flushSync(() => setOffen(false));
    if (fokusZurueck && ausloeser?.isConnected) ausloeser.focus();
  }, []);

  // Tastenkuerzel wie im Handbuch: "/" und Strg+K bzw. Cmd+K. Solange ein
  // Blatt der unteren Leiste offen ist, bleibt die Suche zu - Blaetter und
  // Suche schliessen einander aus wie Blaetter und KI-Panel.
  useEffect(() => {
    const beiTaste = (event: KeyboardEvent) => {
      if (event.defaultPrevented || blattOffen) return;
      if (!istSuchKuerzel(event, istEingabefeld(event.target))) return;
      event.preventDefault();
      oeffne();
    };
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, [blattOffen, oeffne]);

  // Jede selbst aufgerufene Seite landet in "Zuletzt geoeffnet", egal ob ueber
  // Seitenleiste, Link oder Suche. Stationen einer Agent-Fuehrung nicht: die
  // hat nicht die Person aufgerufen.
  //
  // tourLaeuft wird im Ereignis gelesen und steht nicht in den Abhaengigkeiten.
  // Sonst liefe der Effekt am Ende einer Fuehrung noch einmal und schriebe
  // deren letzte Station doch noch in die Liste.
  const merkeSeite = useEffectEvent((pfad: string) => {
    if (tourLaeuft) return;
    const schluessel = zielSchluesselFuerPfad(pfad);
    if (schluessel) merkeZuletzt(browserAblage(), nutzerId, schluessel);
  });
  useEffect(() => {
    merkeSeite(pathname);
  }, [pathname]);

  const wert = useMemo(() => ({ offen, oeffne }), [offen, oeffne]);

  return (
    <SuchKontext.Provider value={wert}>
      {children}
      {/* Nur solange offen im Baum: jedes Oeffnen beginnt mit leerem Feld
          und dem ersten Treffer markiert. */}
      {offen ? (
        <SuchDialog
          feldRef={feldRef}
          zuletzt={zuletzt}
          nutzerId={nutzerId}
          onSchliessen={schliesse}
        />
      ) : null}
    </SuchKontext.Provider>
  );
}
