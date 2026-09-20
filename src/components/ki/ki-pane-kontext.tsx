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

/** Wo der Assistent steht. "seite" ist das angedockte Panel von Anfang an, "buehne"
 *  holt ihn in die Mitte: die Seite dahinter tritt unscharf zurueck, Himbi stellt sich
 *  ueber die Karte und der Chat liegt darunter. Beides ist DASSELBE Panel in einer
 *  anderen Darstellung - es bleibt gemountet, eine laufende Antwort laeuft weiter. */
export type KiDarstellung = "seite" | "buehne";

export interface KiZeiger {
  x: number;
  y: number;
  /** Zaehler: jeder Klick erhoeht ihn und loest die Klick-Welle neu aus. */
  klicks: number;
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
  darstellung: KiDarstellung;
  setDarstellung: (darstellung: KiDarstellung) => void;
  /** Oeffnet den Assistenten in der Mitte (Klick auf Himbi). */
  oeffneBuehne: () => void;
  fuehrung: KiFuehrung | null;
  /** Sofort hin (Klick auf einen Quellenverweis): verwirft eine laufende Tour. */
  oeffneZiel: (ziel: string, label: string) => void;
  /** Reiht ein Ziel in die Tour ein (Agent-Modus): nacheinander, mit Verweilzeit. */
  fuehreZu: (ziel: string, label: string) => void;
  fuehrungBeenden: () => void;
  /** Sichtbarer Mauszeiger des Agenten; die Zusage loest, sobald er angekommen ist. */
  zeiger: KiZeiger | null;
  bewegeZeiger: (x: number, y: number, klick?: boolean) => Promise<void>;
}

const MODUS_SCHLUESSEL = "damicon-ki-modus";
const DARSTELLUNG_SCHLUESSEL = "damicon-ki-darstellung";
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
  darstellung: "seite",
  setDarstellung: () => {},
  oeffneBuehne: () => {},
  fuehrung: null,
  oeffneZiel: () => {},
  fuehreZu: () => {},
  fuehrungBeenden: () => {},
  zeiger: null,
  bewegeZeiger: async () => {},
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
  const [darstellung, setDarstellungState] = useState<KiDarstellung>("seite");
  const [fuehrung, setFuehrung] = useState<KiFuehrung | null>(null);
  const [zeiger, setZeiger] = useState<KiZeiger | null>(null);
  const zeigerTimer = useRef<number | undefined>(undefined);

  const warteschlange = useRef<KiFuehrung[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const laeuft = useRef(false);

  // Gespeicherten Modus erst nach dem Mounten lesen - der Server rendert
  // immer "assistent", ein direktes Lesen wuerde die Hydration verfehlen.
  useEffect(() => {
    try {
      const gespeichert = window.localStorage.getItem(MODUS_SCHLUESSEL);
      if (gespeichert === "agent" || gespeichert === "assistent") setModusState(gespeichert);
      const art = window.localStorage.getItem(DARSTELLUNG_SCHLUESSEL);
      if (art === "seite" || art === "buehne") setDarstellungState(art);
    } catch {
      // Speicher gesperrt (privates Fenster): Modus gilt dann nur fuer diese Sitzung.
    }
  }, []);

  const setDarstellung = useCallback((neu: KiDarstellung) => {
    setDarstellungState(neu);
    try {
      window.localStorage.setItem(DARSTELLUNG_SCHLUESSEL, neu);
    } catch {
      // siehe oben
    }
  }, []);

  const oeffneBuehne = useCallback(() => {
    setDarstellung("buehne");
    setOffen(true);
  }, [setDarstellung]);

  // Im Agent-Modus steuert der Assistent die Ansicht nebenan. Auf der Buehne liegt die
  // Seite unscharf dahinter - von der Fahrt saehe man nichts. Solange eine Fuehrung
  // laeuft, dockt er darum an den Rand und geht danach zurueck in die Mitte.
  //
  // Absichtlich ueber setDarstellungState statt setDarstellung: die gespeicherte Wahl
  // bleibt "buehne". Das Andocken ist eine Leihgabe fuer die Dauer der Fuehrung, keine
  // Umstellung, die der Mensch beim naechsten Mal wiederfinden soll.
  const buehneGeliehen = useRef(false);
  useEffect(() => {
    if (fuehrung && darstellung === "buehne") {
      buehneGeliehen.current = true;
      setDarstellungState("seite");
      return;
    }
    if (!fuehrung && buehneGeliehen.current) {
      buehneGeliehen.current = false;
      setDarstellungState("buehne");
    }
  }, [fuehrung, darstellung]);

  // Die Buehne legt sich ueber die Seite und ist damit ein Dialog: Escape schliesst sie.
  // Das angedockte Panel bleibt offen - es verdeckt nichts, und wer darin tippt, will
  // mit Escape keine laufende Antwort aus dem Blick verlieren.
  useEffect(() => {
    if (!offen || darstellung !== "buehne") return;
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOffen(false);
    };
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, [offen, darstellung]);

  // Solange die Buehne steht, scrollt die Seite dahinter nicht mit.
  useEffect(() => {
    if (!offen || darstellung !== "buehne") return;
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = vorher;
    };
  }, [offen, darstellung]);

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
      darstellung,
      setDarstellung,
      oeffneBuehne,
      fuehrung,
      oeffneZiel,
      fuehreZu,
      fuehrungBeenden,
      zeiger,
      bewegeZeiger,
    }),
    [
      verfuegbar,
      offen,
      modus,
      setModus,
      darstellung,
      setDarstellung,
      oeffneBuehne,
      fuehrung,
      oeffneZiel,
      fuehreZu,
      fuehrungBeenden,
      zeiger,
      bewegeZeiger,
    ],
  );

  return <KiPaneKontext.Provider value={wert}>{children}</KiPaneKontext.Provider>;
}
