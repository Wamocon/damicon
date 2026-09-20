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

export interface KiZeiger {
  x: number;
  y: number;
  /** Zaehler: jeder Klick erhoeht ihn und loest die Klick-Welle neu aus. */
  klicks: number;
}

/** Der Prüfbericht, auf dem das Gespräch aufsetzt (lib/pruefung/kontext.ts): Kennung zur Anzeige, Text fuer den Assistenten. */
export interface PruefBezug {
  id: string;
  kontext: string;
}

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
  /** Sichtbarer Mauszeiger des Agenten; die Zusage loest, sobald er angekommen ist. */
  zeiger: KiZeiger | null;
  bewegeZeiger: (x: number, y: number, klick?: boolean) => Promise<void>;
  /** Bericht, auf dem das laufende Gespraech aufsetzt (geht bei jeder Anfrage mit), oder null. */
  pruefBezug: PruefBezug | null;
  /** Oeffnet den Chat mit dem Bericht als Grundlage und stellt die erste Frage. */
  starteGespraechZurPruefung: (bezug: PruefBezug, frage: string) => void;
  entferneBezug: () => void;
  /** Frage, die der Chat als Naechstes stellen soll (nr zaehlt hoch, damit dieselbe Frage zweimal geht). */
  anstoss: { nr: number; frage: string } | null;
}

const MODUS_SCHLUESSEL = "damicon-ki-modus";
const BEZUG_SCHLUESSEL = "damicon-ki-pruefbezug";
// So lange bleibt jede Station der Tour im Bild, bevor die naechste kommt -
// kurz genug, dass es fluessig wirkt, lang genug, dass man sieht, wo man ist.
const VERWEILZEIT_MS = 2600;
const AUSKLINGZEIT_MS = 1800;
const FOKUS_KLASSE = "ki-fokus";
const ZEIGER_FLUGZEIT_MS = 720;
const ZEIGER_NACHLAUF_MS = 2600;

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
  zeiger: null,
  bewegeZeiger: async () => {},
  pruefBezug: null,
  starteGespraechZurPruefung: () => {},
  entferneBezug: () => {},
  anstoss: null,
};

const KiPaneKontext = createContext<KiPaneWert>(Standard);

export function useKiPane(): KiPaneWert {
  return useContext(KiPaneKontext);
}

/** Scrollt zum Anker des Ziels (falls es einen gibt) und laesst ihn kurz
 *  aufleuchten. Die Zielseite rendert erst nach der Navigation - deshalb
 *  wird kurz auf das Element gewartet, statt einmalig zu suchen. */
function hebeHervor(element: Element): void {
  element.classList.remove(FOKUS_KLASSE);
  void (element as HTMLElement).offsetWidth;
  element.classList.add(FOKUS_KLASSE);
  window.setTimeout(() => element.classList.remove(FOKUS_KLASSE), 2800);
}

function fokussiere(ziel: string): void {
  const anker = ziel.split("#")[1];
  if (!anker) {
    // Ohne Anker (ganzes Modul, oder man ist schon dort): nach oben scrollen und
    // den Kopf der Seite hervorheben - sonst wirkt ein Ziel, das gleich der
    // aktuellen Seite ist, als sei nichts passiert.
    let versuche = 0;
    const kopf = () => {
      const erstes = document.querySelector("#main > :first-child");
      if (erstes) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        hebeHervor(erstes);
        return;
      }
      versuche += 1;
      if (versuche < 40) window.setTimeout(kopf, 60);
    };
    window.setTimeout(kopf, 120);
    return;
  }
  let versuche = 0;
  const suche = () => {
    const element = document.getElementById(anker);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      hebeHervor(element);
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
  const [zeiger, setZeiger] = useState<KiZeiger | null>(null);
  const zeigerTimer = useRef<number | undefined>(undefined);
  const [pruefBezug, setPruefBezug] = useState<PruefBezug | null>(null);
  const [anstoss, setAnstoss] = useState<{ nr: number; frage: string } | null>(null);
  const anstossNr = useRef(0);

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

  // Der Bezug ueberlebt ein Neuladen der Seite (nur in dieser Sitzung): wer nach der Pruefung weiterfragt, soll nicht ins Leere fragen.
  useEffect(() => {
    try {
      const roh = window.sessionStorage.getItem(BEZUG_SCHLUESSEL);
      if (!roh) return;
      const b = JSON.parse(roh) as Partial<PruefBezug>;
      if (typeof b.id === "string" && typeof b.kontext === "string") setPruefBezug({ id: b.id, kontext: b.kontext });
    } catch {
      // kein Speicher oder beschaedigt: dann eben ohne Bezug
    }
  }, []);

  const speichereBezug = useCallback((bezug: PruefBezug | null) => {
    setPruefBezug(bezug);
    try {
      if (bezug) window.sessionStorage.setItem(BEZUG_SCHLUESSEL, JSON.stringify(bezug));
      else window.sessionStorage.removeItem(BEZUG_SCHLUESSEL);
    } catch {
      // siehe oben
    }
  }, []);

  const starteGespraechZurPruefung = useCallback(
    (bezug: PruefBezug, frage: string) => {
      speichereBezug(bezug);
      setAnstoss({ nr: ++anstossNr.current, frage });
      setOffen(true);
    },
    [speichereBezug],
  );

  const entferneBezug = useCallback(() => speichereBezug(null), [speichereBezug]);

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

  const bewegeZeiger = useCallback((x: number, y: number, klick = false) => {
    window.clearTimeout(zeigerTimer.current);
    setZeiger((alt) => ({ x, y, klicks: (alt?.klicks ?? 0) + (klick ? 1 : 0) }));
    zeigerTimer.current = window.setTimeout(() => setZeiger(null), ZEIGER_NACHLAUF_MS);
    return new Promise<void>((weiter) => window.setTimeout(weiter, ZEIGER_FLUGZEIT_MS));
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(zeigerTimer.current);
    },
    [],
  );

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
      zeiger,
      bewegeZeiger,
      pruefBezug,
      starteGespraechZurPruefung,
      entferneBezug,
      anstoss,
    }),
    [verfuegbar, offen, modus, setModus, fuehrung, oeffneZiel, fuehreZu, fuehrungBeenden, zeiger, bewegeZeiger, pruefBezug, starteGespraechZurPruefung, entferneBezug, anstoss],
  );

  return <KiPaneKontext.Provider value={wert}>{children}</KiPaneKontext.Provider>;
}
