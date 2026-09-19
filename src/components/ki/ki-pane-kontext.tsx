"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "@/i18n/navigation";

// Gemeinsamer Zustand zwischen dem "KI fragen"-Knopf in der Kopfzeile
// (topbar.tsx), dem andockbaren Seitenpanel (ki-pane.tsx) und der
// Fuehrungsanzeige im Hauptfenster (ki-fuehrung.tsx). Alles, was das
// Hauptfenster "fernsteuert" - Navigation, Scrollen, Hervorheben - laeuft
// ueber diese eine Stelle, damit Assistent-Modus (ein Klick auf einen
// Quellenverweis) und Agent-Modus (automatische Tour) exakt dieselbe
// Mechanik nutzen und sich nur darin unterscheiden, WER sie ausloest.

export type KiModus = "assistent" | "agent";

export interface KiFuehrung {
  label: string;
  ziel: string;
}

interface KiPaneWert {
  verfuegbar: boolean;
  offen: boolean;
  setOffen: (offen: boolean) => void;
  umschalten: () => void;
  modus: KiModus;
  setModus: (modus: KiModus) => void;
  fuehrung: KiFuehrung | null;
  /** Sofort hin (Klick auf einen Quellenverweis): verwirft eine laufende Tour. */
  oeffneZiel: (ziel: string, label: string) => void;
  /** Reiht ein Ziel in die Tour ein (Agent-Modus): nacheinander, mit Verweilzeit. */
  fuehreZu: (ziel: string, label: string) => void;
  fuehrungBeenden: () => void;
}

const MODUS_SCHLUESSEL = "damicon-ki-modus";
// So lange bleibt jede Station der Tour im Bild, bevor die naechste kommt -
// kurz genug, dass es fluessig wirkt, lang genug, dass man sieht, wo man ist.
const VERWEILZEIT_MS = 2600;
const AUSKLINGZEIT_MS = 1800;
const FOKUS_KLASSE = "ki-fokus";

const Standard: KiPaneWert = {
  verfuegbar: false,
  offen: false,
  setOffen: () => {},
  umschalten: () => {},
  modus: "assistent",
  setModus: () => {},
  fuehrung: null,
  oeffneZiel: () => {},
  fuehreZu: () => {},
  fuehrungBeenden: () => {},
};

const KiPaneKontext = createContext<KiPaneWert>(Standard);

export function useKiPane(): KiPaneWert {
  return useContext(KiPaneKontext);
}

/** Scrollt zum Anker des Ziels (falls es einen gibt) und laesst ihn kurz
 *  aufleuchten. Die Zielseite rendert erst nach der Navigation - deshalb
 *  wird kurz auf das Element gewartet, statt einmalig zu suchen. */
function fokussiere(ziel: string): void {
  const anker = ziel.split("#")[1];
  if (!anker) {
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 120);
    return;
  }
  let versuche = 0;
  const suche = () => {
    const element = document.getElementById(anker);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      element.classList.remove(FOKUS_KLASSE);
      void element.offsetWidth;
      element.classList.add(FOKUS_KLASSE);
      window.setTimeout(() => element.classList.remove(FOKUS_KLASSE), 2800);
      return;
    }
    versuche += 1;
    if (versuche < 40) window.setTimeout(suche, 60);
  };
  window.setTimeout(suche, 120);
}

export function KiPaneProvider({
  verfuegbar,
  children,
}: {
  verfuegbar: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [modus, setModusState] = useState<KiModus>("assistent");
  const [fuehrung, setFuehrung] = useState<KiFuehrung | null>(null);

  const warteschlange = useRef<KiFuehrung[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const laeuft = useRef(false);

  // Gespeicherten Modus erst nach dem Mounten lesen - der Server rendert
  // immer "assistent", ein direktes Lesen wuerde die Hydration verfehlen.
  useEffect(() => {
    try {
      const gespeichert = window.localStorage.getItem(MODUS_SCHLUESSEL);
      if (gespeichert === "agent" || gespeichert === "assistent") setModusState(gespeichert);
    } catch {
      // Speicher gesperrt (privates Fenster): Modus gilt dann nur fuer diese Sitzung.
    }
  }, []);

  const setModus = useCallback((neu: KiModus) => {
    setModusState(neu);
    try {
      window.localStorage.setItem(MODUS_SCHLUESSEL, neu);
    } catch {
      // siehe oben
    }
  }, []);

  const naechsteStation = useCallback(
    function station() {
      window.clearTimeout(timer.current);
      const naechste = warteschlange.current.shift();
      if (!naechste) {
        laeuft.current = false;
        timer.current = window.setTimeout(() => setFuehrung(null), AUSKLINGZEIT_MS);
        return;
      }
      laeuft.current = true;
      setFuehrung(naechste);
      router.push(naechste.ziel);
      fokussiere(naechste.ziel);
      timer.current = window.setTimeout(station, VERWEILZEIT_MS);
    },
    [router],
  );

  const fuehreZu = useCallback(
    (ziel: string, label: string) => {
      const letzte = warteschlange.current.at(-1);
      if (letzte?.ziel === ziel) return;
      warteschlange.current.push({ ziel, label });
      if (!laeuft.current) naechsteStation();
    },
    [naechsteStation],
  );

  const fuehrungBeenden = useCallback(() => {
    warteschlange.current = [];
    laeuft.current = false;
    window.clearTimeout(timer.current);
    setFuehrung(null);
  }, []);

  const oeffneZiel = useCallback(
    (ziel: string, label: string) => {
      warteschlange.current = [{ ziel, label }];
      naechsteStation();
    },
    [naechsteStation],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const wert = useMemo<KiPaneWert>(
    () => ({
      verfuegbar,
      offen,
      setOffen,
      umschalten: () => setOffen((v) => !v),
      modus,
      setModus,
      fuehrung,
      oeffneZiel,
      fuehreZu,
      fuehrungBeenden,
    }),
    [verfuegbar, offen, modus, setModus, fuehrung, oeffneZiel, fuehreZu, fuehrungBeenden],
  );

  return <KiPaneKontext.Provider value={wert}>{children}</KiPaneKontext.Provider>;
}
