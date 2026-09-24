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
import type { SheetAnker } from "@/components/ui/sheet";
import { istSuchKuerzel } from "@/lib/suche/kern";
import { zielSchluesselFuerPfad } from "@/lib/suche/seiten-ziele";
import { browserAblage, liesZuletzt, merkeZuletzt } from "@/lib/suche/zuletzt";

// Gemeinsamer Zustand der globalen Suche. Ab xl ist sie ein echtes Feld in
// der Kopfzeile (such-leiste.tsx), darunter oeffnet die Lupe
// (such-ausloeser.tsx) ein Suchfenster, das genau einmal im Layout steht.
//
// Das Fenster haengt hier und nicht in der Kopfzeile. Deren backdrop-blur
// macht sie zum Bezugsrahmen fuer fixierte Kinder - ein Blatt darin waere auf
// die Kopfzeile beschnitten. Ausserdem wird die Spalte mit der Kopfzeile
// inert, sobald ein Blatt der unteren Leiste offen ist (blatt-kontext.tsx).

interface SuchWert {
  offen: boolean;
  oeffne: () => void;
  /** Wem die Zuletzt-Liste gehoert, auch fuer die Leiste in der Kopfzeile. */
  nutzerId: string | null;
}

const SuchKontext = createContext<SuchWert>({
  offen: false,
  oeffne: () => {},
  nutzerId: null,
});

export function useSuche(): SuchWert {
  return useContext(SuchKontext);
}

function istEingabefeld(ziel: EventTarget | null): boolean {
  return (
    ziel instanceof HTMLElement &&
    (ziel.isContentEditable || ziel.matches("input, textarea, select"))
  );
}

// Das Fenster geht dort auf, wo die Lupe sitzt: zwischen md und xl hinter dem
// Pfad. Das Eingabefeld im Kopf des Fensters steht dann auf ihrer Hoehe - der
// Kopf ist 56 px hoch, die Lupe 36 px, also 10 px hoeher ansetzen.
//
// Auf dem Handy (unter md) kein Anker: dort sitzt die Lupe neben der Glocke
// in der obersten Zeile, und das Fenster nimmt oben die volle Breite ein.
const ANKER_AB = "(min-width: 768px)";
const BREITE_MIN = 560;
const BREITE_MAX = 720;
const RAND = 8;

function sichtbar<T extends HTMLElement>(auswahl: string): T | undefined {
  return Array.from(document.querySelectorAll<T>(auswahl)).find(
    (element) => element.getBoundingClientRect().width > 0,
  );
}

function bestimmeAnker(): SheetAnker | null {
  if (!window.matchMedia(ANKER_AB).matches) return null;
  // Die sichtbare Lupe, auch wenn die Suche per Tastenkuerzel aufging: das
  // Fenster steht immer an derselben Stelle, egal wie man es oeffnet.
  const ausloeser = sichtbar('[data-suche="knopf"]');
  if (!ausloeser) return null;

  const rahmen = ausloeser.getBoundingClientRect();
  const breite = Math.min(
    Math.max(rahmen.width, BREITE_MIN),
    BREITE_MAX,
    window.innerWidth - 2 * RAND,
  );
  const left = Math.min(Math.max(RAND, rahmen.left), window.innerWidth - RAND - breite);
  const top = Math.max(RAND / 2, rahmen.top - 10);
  return { top, left, width: breite, maxHoehe: window.innerHeight - top - 2 * RAND };
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
  const [anker, setAnker] = useState<SheetAnker | null>(null);
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
    // Steht das Feld der Kopfzeile sichtbar da (ab xl), springt das Kuerzel
    // dorthin, und das Feld klappt seine Liste selbst auf - kein Fenster.
    const leiste = sichtbar<HTMLInputElement>('input[data-suche="feld"]');
    if (leiste) {
      leiste.focus();
      leiste.select();
      return;
    }
    ausloeserRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Die Liste beim Oeffnen lesen und nicht beim Rendern: der Server kennt
    // keinen localStorage, und jedes Oeffnen soll den neuesten Stand zeigen.
    setZuletzt(liesZuletzt(browserAblage(), nutzerId));
    setAnker(bestimmeAnker());
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

  // Aendert sich die Fenstergroesse, waehrend die Suche offen ist, wandert der
  // Ausloeser mit - das Fenster zieht nach, notfalls vom Anker an den Rand.
  useEffect(() => {
    if (!offen) return;
    const nachziehen = () => setAnker(bestimmeAnker());
    window.addEventListener("resize", nachziehen);
    return () => window.removeEventListener("resize", nachziehen);
  }, [offen]);

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

  const wert = useMemo(() => ({ offen, oeffne, nutzerId }), [offen, oeffne, nutzerId]);

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
          anker={anker}
          onSchliessen={schliesse}
        />
      ) : null}
    </SuchKontext.Provider>
  );
}
