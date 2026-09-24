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
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { SuchDialog } from "@/components/suche/such-dialog";
import { seiteGesperrt } from "@/components/ui/scroll-sperre";
import { istSuchKuerzel } from "@/lib/suche/kern";
import { zielSchluesselFuerPfad, type ZielSchluessel } from "@/lib/suche/seiten-ziele";
import { browserAblage, liesZuletzt, merkeZuletzt } from "@/lib/suche/zuletzt";

// Gemeinsamer Zustand der globalen Suche: die Lupe in der Kopfzeile
// (such-ausloeser.tsx) und die Tastenkuerzel oeffnen, der Dialog steht genau
// einmal im Layout. Er geht immer oben in der Mitte des Bildschirms auf
// (Sheet "oben").
//
// Der Dialog haengt hier und nicht in der Kopfzeile. Deren backdrop-blur macht
// sie zum Bezugsrahmen fuer fixierte Kinder - ein Blatt darin waere auf die
// Kopfzeile beschnitten. Ausserdem wird die Spalte mit der Kopfzeile inert,
// sobald ein Blatt der unteren Leiste offen ist (blatt-kontext.tsx).
//
// "Zuletzt geoeffnet" schreibt nur diese Stelle (merke): beim Seitenwechsel
// und, ueber den Dialog, beim Handbuch, das im neuen Tab aufgeht.

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
  const { tourLaeuft } = useKiPane();

  const merke = useCallback(
    (schluessel: ZielSchluessel) => merkeZuletzt(browserAblage(), nutzerId, schluessel),
    [nutzerId],
  );

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

  // Tastenkuerzel wie im Handbuch: "/" und Strg+K, auf dem Mac Cmd+K.
  //
  // Solange eine andere Ebene ueber der Seite liegt - ein Blatt, die
  // KI-Buehne, das KI-Panel auf dem Handy -, bleibt die Suche zu. Jede solche
  // Ebene sperrt das Scrollen (ui/scroll-sperre.ts), daran ist sie zu
  // erkennen. Sonst laege die Suche darueber, und ein Esc schloesse beide.
  useEffect(() => {
    const mac = /Mac|iPhone|iPad/.test(navigator.userAgent);
    const beiTaste = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (!offen && seiteGesperrt())) return;
      if (!istSuchKuerzel(event, istEingabefeld(event.target), mac)) return;
      event.preventDefault();
      oeffne();
    };
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, [offen, oeffne]);

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
    if (schluessel) merke(schluessel);
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
          onMerke={merke}
          onSchliessen={schliesse}
        />
      ) : null}
    </SuchKontext.Provider>
  );
}
