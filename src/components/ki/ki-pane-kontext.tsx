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
import { setzeHervorhebung } from "@/components/ki/hervorhebung";
import { leseChatStand, unterbrichChat } from "@/components/ki/sprachmodus-bus";
import {
  ANFANG,
  DARSTELLUNG_SCHLUESSEL,
  istDarstellung,
  naechsterZustand,
  NUTZER_SCHLUESSEL,
  OFFEN_SCHLUESSEL,
} from "@/lib/domain/ki-ansicht";

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
  sprachmodusMoeglich: boolean;
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
  /** Bericht, auf dem das laufende Gespraech aufsetzt (geht bei jeder Anfrage mit), oder null. */
  pruefBezug: PruefBezug | null;
  /** Oeffnet den Chat mit dem Bericht als Grundlage und stellt die erste Frage. */
  starteGespraechZurPruefung: (bezug: PruefBezug, frage: string) => void;
  entferneBezug: () => void;
  /** Frage, die der Chat als Naechstes stellen soll (nr zaehlt hoch, damit dieselbe Frage zweimal geht). */
  anstoss: { nr: number; frage: string } | null;
  /** Sprachmodus (components/ki/sprachmodus.tsx): Live-Gespraech ohne sichtbaren Chat. */
  sprachmodus: boolean;
  starteSprachmodus: () => void;
  beendeSprachmodus: () => void;
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
  sprachmodusMoeglich: false,
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
  pruefBezug: null,
  starteGespraechZurPruefung: () => {},
  entferneBezug: () => {},
  anstoss: null,
  sprachmodus: false,
  starteSprachmodus: () => {},
  beendeSprachmodus: () => {},
};

const KiPaneKontext = createContext<KiPaneWert>(Standard);

export function useKiPane(): KiPaneWert {
  return useContext(KiPaneKontext);
}

/** Scrollt zum Anker des Ziels (falls es einen gibt) und laesst ihn kurz
 *  aufleuchten. Die Zielseite rendert erst nach der Navigation - deshalb
 *  wird kurz auf das Element gewartet, statt einmalig zu suchen. */
function hebeHervor(element: Element): void {
  // Der Sprachmodus legt einen Lichtkegel um genau dieses Element (hervorhebung.ts).
  setzeHervorhebung(element);
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
  seitenansichtAn = false,
  sprachmodusMoeglich = false,
  nutzerId,
  children,
}: {
  verfuegbar: boolean;
  /** KI_AGENT_SEITENANSICHT. Aus heisst: alles bleibt wie vorher. */
  seitenansichtAn?: boolean;
  /** Anbieter mit Werkzeugen (Anthropic) UND KI_DIKTAT_LIVE an: ohne beides gibt es
   *  weder Navigation noch Live-Erkennung fuer ein Gespraech - der Knopf in der
   *  Kopfzeile bleibt dann verborgen (topbar.tsx). */
  sprachmodusMoeglich?: boolean;
  /** Wem die gemerkte Ansicht gehoert. Meldet sich jemand anderes an diesem
   *  Rechner an, wird sie vergessen. */
  nutzerId?: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  // "offen" wird jetzt gemerkt. Ohne das haelt die Seitenansicht nur
  // innerhalb des Dashboards: der Provider haengt in dessen Layout, und ein
  // Sprung nach /herkunft baut ihn ab. Beim Zurueckkommen waere das Panel
  // wieder zu - mitten in einer Fuehrung.
  const [offen, setOffenIntern] = useState(false);
  const setOffen = useCallback((neu: boolean) => {
    setOffenIntern(neu);
    try {
      window.localStorage.setItem(OFFEN_SCHLUESSEL, neu ? "an" : "aus");
    } catch {
      // Speicher gesperrt: gilt dann nur fuer diese Sitzung.
    }
  }, []);
  const [modus, setModusState] = useState<KiModus>("assistent");
  const [darstellung, setDarstellungState] = useState<KiDarstellung>("seite");
  const [fuehrung, setFuehrung] = useState<KiFuehrung | null>(null);
  const [zeiger, setZeiger] = useState<KiZeiger | null>(null);
  const zeigerTimer = useRef<number | undefined>(undefined);
  const [pruefBezug, setPruefBezug] = useState<PruefBezug | null>(null);
  const [anstoss, setAnstoss] = useState<{ nr: number; frage: string } | null>(null);
  const anstossNr = useRef(0);
  // Sprachmodus: solange er laeuft, oeffnet eine Navigation des Assistenten NICHT das
  // Panel - das Gespraech hat keinen sichtbaren Chat, und das Panel naehme der Seite den
  // Platz, die der Assistent gerade zeigt. War das Panel beim Start offen, ist es danach
  // wieder offen.
  const [sprachmodus, setSprachmodus] = useState(false);
  const sprachmodusRef = useRef(false);
  const panelVorSprachmodus = useRef(false);

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

  useEffect(() => {
    try {
      // Gehoert das Gemerkte ueberhaupt dieser Person? Nach einer neuen
      // Anmeldung faengt die Ansicht wieder bei der Voreinstellung an - sonst
      // sitzt die naechste Person vor dem Panel ihrer Vorgaengerin.
      const gemerkterNutzer = window.localStorage.getItem(NUTZER_SCHLUESSEL);
      if (nutzerId && gemerkterNutzer !== nutzerId) {
        window.localStorage.setItem(NUTZER_SCHLUESSEL, nutzerId);
        window.localStorage.removeItem(DARSTELLUNG_SCHLUESSEL);
        window.localStorage.removeItem(OFFEN_SCHLUESSEL);
        setDarstellungState(ANFANG.darstellung);
        setOffenIntern(ANFANG.offen);
        return;
      }
      const art = window.localStorage.getItem(DARSTELLUNG_SCHLUESSEL);
      if (istDarstellung(art)) setDarstellungState(art);
      // Und ob es offen war. Beides erst nach dem Mounten, wie beim Modus:
      // der Server rendert immer den Anfangszustand.
      if (window.localStorage.getItem(OFFEN_SCHLUESSEL) === "an") setOffenIntern(true);
    } catch {
      // siehe oben
    }
  }, [nutzerId]);

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

  const setModus = useCallback((neu: KiModus) => {
    setModusState(neu);
    try {
      window.localStorage.setItem(MODUS_SCHLUESSEL, neu);
    } catch {
      // siehe oben
    }
  }, []);

  const starteGespraechZurPruefung = useCallback(
    (bezug: PruefBezug, frage: string) => {
      speichereBezug(bezug);
      setAnstoss({ nr: ++anstossNr.current, frage });
      setOffen(true);
      // Immer im Assistent-Modus, unabhaengig davon, was zuletzt eingestellt war: im
      // Agent-Modus oeffnet JEDES Werkzeugergebnis mit einem Ziel automatisch die
      // zugehoerige Ansicht im Hauptfenster (siehe ki-chat.tsx, "Agent-Modus"-Effekt) - ein
      // Gespraech ueber den Bericht rief dort z. B. complianceUebersichtAbrufen auf und riss
      // damit die Seite zum Compliance-Cockpit, obwohl niemand das verlangt hatte. Die
      // Zusammenfassung soll auf der Uebersichtsseite bleiben und nur anklickbare Verweise
      // anbieten (gemeldet am 23.09.2026).
      setModus("assistent");
    },
    [speichereBezug, setOffen, setModus],
  );

  const entferneBezug = useCallback(() => speichereBezug(null), [speichereBezug]);

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
  }, [setDarstellung, setOffen]);

  // Im Agent-Modus steuert der Assistent die Ansicht nebenan. Auf der Buehne liegt die
  // Seite unscharf dahinter - von der Fahrt saehe man nichts. Deshalb dockt das Panel
  // an den Rand, sobald der Agent das erste Mal navigiert.
  //
  // Bis zum 22.09.2026 war das eine LEIHGABE: nach der Fuehrung sprang es zurueck in
  // die Mitte, und die gespeicherte Wahl blieb "buehne". Das ist verkehrt herum. Wer
  // den Agenten etwas zeigen laesst, will die Seite sehen - und beim naechsten Mal
  // wieder. Ein Panel, das nach jeder Tour zurueckspringt und die Seite verdeckt,
  // nimmt dem Agenten den Sinn.
  //
  // Jetzt wird die Umstellung GEMERKT (setDarstellung statt setDarstellungState) und
  // bleibt ueber weitere Fragen, Stationen und ein Neuladen hinweg. Zurueck in die
  // Mitte fuehrt nur der Knopf im Panelkopf - oder eine neue Anmeldung.
  //
  // Hinter KI_AGENT_SEITENANSICHT: steht der Schalter aus, bleibt alles beim Alten.
  useEffect(() => {
    if (!fuehrung || !seitenansichtAn || sprachmodus) return;
    const ziel = naechsterZustand({ darstellung, offen }, "agent-navigation", true);
    if (ziel.darstellung !== darstellung) setDarstellung(ziel.darstellung);
    if (ziel.offen && !offen) setOffen(true);
  }, [fuehrung, darstellung, offen, seitenansichtAn, sprachmodus, setDarstellung, setOffen]);

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
  }, [offen, darstellung, setOffen]);

  // Solange die Buehne steht, scrollt die Seite dahinter nicht mit.
  useEffect(() => {
    if (!offen || darstellung !== "buehne") return;
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = vorher;
    };
  }, [offen, darstellung]);

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
      // Eine Fuehrung, die niemand sieht, ist keine: war das Panel zu, geht es
      // auf. Vorher lief die Tour im Hauptfenster ab, waehrend der Assistent
      // eingeklappt war und niemand die Begleitung dazu lesen konnte.
      if (seitenansichtAn && !sprachmodusRef.current) setOffen(true);
      if (!laeuft.current) naechsteStation();
    },
    [naechsteStation, seitenansichtAn, setOffen],
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

  const starteSprachmodus = useCallback(() => {
    if (sprachmodusRef.current) return;
    // Vor der ersten Nachricht steht im Chat der Hinweis zur KI-Nutzung, dem
    // zugestimmt werden muss. Ohne Zustimmung ginge die erste gesprochene Frage
    // verloren (der Chat verwirft sie) - also zuerst den Chat zeigen, wo der
    // Hinweis steht. Dort ist der Sprachmodus-Knopf bis zur Zustimmung gesperrt.
    if (leseChatStand().einwilligungFehlt) {
      setOffen(true);
      return;
    }
    // Eine laufende Antwort endet hier: sonst spraeche sie in das Zuhoeren
    // hinein, und die erste Frage im Sprachmodus ginge verloren (der Chat
    // nimmt keine neue an, solange er beschaeftigt ist).
    unterbrichChat();
    sprachmodusRef.current = true;
    panelVorSprachmodus.current = offen;
    if (offen) setOffen(false);
    setSprachmodus(true);
  }, [offen, setOffen]);

  const beendeSprachmodus = useCallback(() => {
    if (!sprachmodusRef.current) return;
    sprachmodusRef.current = false;
    setSprachmodus(false);
    setzeHervorhebung(null);
    if (panelVorSprachmodus.current) setOffen(true);
  }, [setOffen]);

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
      sprachmodusMoeglich,
      offen,
      setOffen,
      umschalten: () => setOffen(!offen),
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
      pruefBezug,
      starteGespraechZurPruefung,
      entferneBezug,
      anstoss,
      sprachmodus,
      starteSprachmodus,
      beendeSprachmodus,
    }),
    [
      verfuegbar,
      sprachmodusMoeglich,
      offen,
      setOffen,
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
      pruefBezug,
      starteGespraechZurPruefung,
      entferneBezug,
      anstoss,
      sprachmodus,
      starteSprachmodus,
      beendeSprachmodus,
    ],
  );

  return <KiPaneKontext.Provider value={wert}>{children}</KiPaneKontext.Provider>;
}
