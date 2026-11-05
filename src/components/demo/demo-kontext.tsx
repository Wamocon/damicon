"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { DemoBlase } from "@/components/demo/demo-blase";
import { usePersona } from "@/components/dashboard/persona";
import type { ComplianceTourAnzeige } from "@/components/dashboard/use-compliance-tour";
import { useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { inSichtBringen, stelleZuSprechziel, warteBisRuhig } from "@/components/ki/ui-steuerung";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { useIstHandy } from "@/components/ui/handy";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  darfDemo,
  lesedauerMs,
  modulZu,
  schritteFuer,
  textIn,
  verfuegbareSprachen,
  type DemoSchritt,
  type DemoSprache,
} from "@/lib/demo/drehbuch";
import { moduleHref } from "@/lib/modules";
import { hasPermission } from "@/lib/rbac";

// Der Durchgang durch das Drehbuch (lib/demo/drehbuch.ts): Himbi öffnet Seite für Seite, zeigt auf
// die Stelle, spricht den Text und geht weiter. Er speist dieselben Felder wie die Compliance-Tour
// (Blase, Zustand, Blickziel, Hüpfer), deshalb braucht Himbis Figur (haustier-dashboard.tsx) keine
// zweite Anbindung: useComplianceTourAnzeige() reicht, solange die Vorführung läuft, DIESE Anzeige
// durch.
//
// Es wird nur gezeigt. Der Durchgang öffnet Seiten, scrollt und hebt hervor (haustier-fokus), er
// klickt nichts, was etwas absendet oder ändert, und füllt kein Feld aus.
//
// Ton: ein einziges <audio>-Element, im Klick auf "Vorführung starten" angelegt (Autoplay-Regel der
// Browser). Fällt der Ton aus (Dienst nicht erreichbar, Berechtigung), laufen die Untertitel mit der
// Lesezeit weiter: ein Schritt bleibt nie hängen.

export interface DemoStart {
  mitCeoTeil: boolean;
  sprache: DemoSprache;
}

export interface DemoSteuerung {
  /** Die Rolle darf die Vorführung. Nur dann zeigt Himbis Einstellung den Bereich überhaupt. */
  erlaubt: boolean;
  /** Rolle, Himbi und Gerät erlauben die Vorführung jetzt (nicht auf dem Handy: dort hat Himbi keine Figur). */
  kannStarten: boolean;
  /** Es läuft gerade eine Vorführung. */
  aktiv: boolean;
  /** Sprachen, in denen das ganze Drehbuch vorliegt. */
  sprachen: readonly DemoSprache[];
  starten: (start: DemoStart) => void;
}

const LEERE_STEUERUNG: DemoSteuerung = { erlaubt: false, kannStarten: false, aktiv: false, sprachen: ["de"], starten: () => {} };

interface DemoApi {
  anzeige: ComplianceTourAnzeige | null;
  steuerung: DemoSteuerung;
}

const DemoContext = createContext<DemoApi>({ anzeige: null, steuerung: LEERE_STEUERUNG });

type Phase = "aus" | "laeuft" | "pause" | "fertig";

interface Lauf {
  schritte: DemoSchritt[];
  sprache: DemoSprache;
  mitCeoTeil: boolean;
}

const FOKUS_KLASSE = "haustier-fokus";
/** Pause nach dem letzten Wort, bevor die nächste Seite aufgeht. */
const NACHLAUF_MS = 700;
/** So lange wartet der Durchgang höchstens auf eine Seite, bevor er mit der aktuellen weitermacht. */
const SEITE_MAX_MS = 6000;

export function zielPfad(schritt: DemoSchritt): string | null {
  if (schritt.ziel.art === "pfad") return schritt.ziel.pfad;
  const modul = modulZu(schritt.ziel);
  return modul ? moduleHref(modul) : null;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pfad = usePathname();
  const { role } = usePersona();
  const { an, weg } = useHaustierStatus();
  const { verfuegbar, setOffen } = useKiPane();
  const handy = useIstHandy();

  const [phase, setPhase] = useState<Phase>("aus");
  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [index, setIndex] = useState(0);
  const [ziel, setZiel] = useState<Element | null>(null);
  const [huepf, setHuepf] = useState(0);
  const [stimmeLaeuft, setStimmeLaeuft] = useState(false);
  const [tonFehlt, setTonFehlt] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Stände für die asynchrone Schleife unten: sie darf nicht bei jedem Seitenwechsel neu starten,
  // liest die aktuellen Werte also über Refs, die im Effekt nachgeführt werden.
  const pfadRef = useRef(pfad);
  const tRef = useRef(t);
  const rolleRef = useRef(role);
  useEffect(() => {
    pfadRef.current = pfad;
    tRef.current = t;
    rolleRef.current = role;
  }, [pfad, t, role]);

  const sprachen = useMemo(() => verfuegbareSprachen(), []);
  const kannStarten = darfDemo(role) && an && !weg && verfuegbar && !handy;

  const starten = useCallback(
    ({ mitCeoTeil, sprache }: DemoStart) => {
      if (!kannStarten) return;
      // Das Audio-Element entsteht im Klick: spätere play()-Aufrufe der Schleife sind dann erlaubt.
      audioRef.current ??= new Audio();
      audioRef.current.preload = "auto";
      // Das Seitenpanel zeigt sonst die Antwort statt der Sprechblase (haustier-dashboard-blasen.ts).
      setOffen(false);
      // Schritte, deren Seite die Rolle nicht sehen darf, entfallen. Für Geschäftsführung und
      // Administration sind das keine, die Prüfung hält aber auch eine künftige Rechteänderung ein.
      const schritte = schritteFuer(mitCeoTeil).filter((s) => {
        const modul = modulZu(s.ziel);
        return !modul || hasPermission(rolleRef.current, modul.resource, "view");
      });
      setLauf({ schritte, sprache: textIn(schritte[0], sprache) ? sprache : "de", mitCeoTeil });
      setIndex(0);
      setTonFehlt(false);
      setPhase("laeuft");
    },
    [kannStarten, setOffen],
  );

  const beenden = useCallback(() => {
    setPhase("aus");
    setZiel(null);
    setStimmeLaeuft(false);
  }, []);

  // Der Durchgang eines Schritts: Seite öffnen, abwarten, hinzeigen, sprechen, weiter. Die
  // Aufräumfunktion bricht alles ab (Pause, Stopp, Sprung, Sprachwechsel), das Neustarten eines
  // Schritts ist damit dasselbe wie sein erster Start.
  const schrittNummer = lauf ? index : 0;
  const aktuellerSchritt = lauf?.schritte[schrittNummer] ?? null;
  const sprache = lauf?.sprache ?? "de";
  const schritte = lauf?.schritte ?? null;
  useEffect(() => {
    if (phase !== "laeuft" || !schritte || !aktuellerSchritt) return;
    const schritt = aktuellerSchritt;
    let abgebrochen = false;
    const timer = new Set<number>();
    const audio = audioRef.current;
    const aufraeumen = () => {
      abgebrochen = true;
      timer.forEach((id) => window.clearTimeout(id));
      timer.clear();
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
      }
      setStimmeLaeuft(false);
    };

    const nachPause = (ms: number) =>
      new Promise<void>((fertig) => {
        const id = window.setTimeout(() => {
          timer.delete(id);
          fertig();
        }, ms);
        timer.add(id);
      });

    const sprich = (text: string) =>
      new Promise<void>((fertig) => {
        const dauer = lesedauerMs(text);
        let erledigt = false;
        const ende = () => {
          if (erledigt) return;
          erledigt = true;
          fertig();
        };
        const ohneTon = () => {
          setTonFehlt(true);
          setStimmeLaeuft(false);
          void nachPause(dauer).then(ende);
        };
        if (!audio) return ohneTon();
        audio.onended = () => {
          setStimmeLaeuft(false);
          ende();
        };
        audio.onerror = ohneTon;
        audio.src = `/api/demo-sprachausgabe?schritt=${encodeURIComponent(schritt.id)}&sprache=${sprache}`;
        audio.play().then(() => setStimmeLaeuft(true), ohneTon);
        // Sicherung: bricht der Ton mittendrin ab, ohne ein Ende zu melden, geht es nach der
        // dreifachen Lesezeit trotzdem weiter.
        const sicherung = window.setTimeout(ende, Math.max(dauer * 3, 60_000));
        timer.add(sicherung);
      });

    void (async () => {
      setZiel(null);
      const gewollt = zielPfad(schritt);
      if (gewollt && pfadRef.current !== gewollt) {
        router.push(gewollt);
        const start = Date.now();
        while (!abgebrochen && pfadRef.current !== gewollt && Date.now() - start < SEITE_MAX_MS) await nachPause(100);
      }
      if (abgebrochen) return;
      await warteBisRuhig(4000, 450);
      if (abgebrochen) return;

      // Wohin Himbi zeigt: die genannte Überschrift, sonst die Überschrift der Seite. Nichts davon
      // zu finden ist kein Fehler, dann spricht Himbi ohne Zeigen weiter.
      const stelle = findeStelle(schritt, tRef.current);
      if (stelle) {
        if (inSichtBringen(stelle)) await nachPause(450);
        if (abgebrochen) return;
        stelle.classList.add(FOKUS_KLASSE);
        timer.add(window.setTimeout(() => stelle.classList.remove(FOKUS_KLASSE), 3300));
        setZiel(stelle);
        setHuepf((h) => h + 1);
      }

      const text = textIn(schritt, sprache);
      if (text) await sprich(text);
      if (abgebrochen) return;
      await nachPause(NACHLAUF_MS);
      if (abgebrochen) return;
      if (index + 1 < schritte.length) setIndex(index + 1);
      else {
        setZiel(null);
        setPhase("fertig");
      }
    })();

    return aufraeumen;
    // router und die Anzeige-Setzer sind stabil; pfad, t und role laufen über Refs (siehe oben).
  }, [phase, schritte, aktuellerSchritt, sprache, index, router]);

  // Das nächste Audio schon erzeugen lassen, während dieses läuft: die Route legt es ab, der
  // Abruf danach kommt aus dem Speicher.
  useEffect(() => {
    if (phase !== "laeuft" || !schritte) return;
    const naechster = schritte[index + 1];
    if (!naechster || !textIn(naechster, sprache)) return;
    const controller = new AbortController();
    void fetch(`/api/demo-sprachausgabe?schritt=${encodeURIComponent(naechster.id)}&sprache=${sprache}`, {
      signal: controller.signal,
    })
      .then((antwort) => antwort.arrayBuffer())
      .catch(() => {});
    return () => controller.abort();
  }, [phase, schritte, index, sprache]);

  // Ein Klick ausserhalb von Himbi übernimmt die Führung (Pause), wie bei der Compliance-Tour.
  useEffect(() => {
    if (phase !== "laeuft") return;
    const beiKlick = (e: PointerEvent) => {
      const z = e.target;
      if (z instanceof Element && z.closest(".haustier")) return;
      setPhase("pause");
    };
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") beenden();
    };
    window.addEventListener("pointerdown", beiKlick, { passive: true });
    window.addEventListener("keydown", beiTaste);
    return () => {
      window.removeEventListener("pointerdown", beiKlick);
      window.removeEventListener("keydown", beiTaste);
    };
  }, [phase, beenden]);

  // Verlässt jemand das Dashboard (Abmeldung), hört der Ton auf.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  const anzeige = useMemo<ComplianceTourAnzeige | null>(() => {
    if (phase === "aus" || !lauf || !aktuellerSchritt) return null;
    const text = textIn(aktuellerSchritt, lauf.sprache) ?? "";
    const blase = (
      <DemoBlase
        phase={phase === "fertig" ? "fertig" : phase}
        nummer={index + 1}
        anzahl={lauf.schritte.length}
        untertitel={text}
        sprache={lauf.sprache}
        sprachen={sprachen}
        tonFehlt={tonFehlt}
        onZurueck={() => {
          setIndex(Math.max(0, index - 1));
          setPhase("laeuft");
        }}
        onWeiter={() => {
          if (index + 1 < lauf.schritte.length) {
            setIndex(index + 1);
            setPhase("laeuft");
          } else setPhase("fertig");
        }}
        onPause={() => setPhase("pause")}
        onFortsetzen={() => setPhase("laeuft")}
        onSprache={(s) => {
          setLauf({ ...lauf, sprache: s });
          setPhase("laeuft");
        }}
        onBeenden={beenden}
        onNochmal={() => {
          setIndex(0);
          setPhase("laeuft");
        }}
      />
    );
    return {
      frageBereit: false,
      frageBlase: null,
      aktiv: true,
      vorrang: true,
      tourBlase: blase,
      tourZustand: phase === "fertig" ? "fertig" : phase === "pause" ? "ruhe" : stimmeLaeuft ? "spricht" : "denkt",
      tourZiel: phase === "laeuft" ? ziel : null,
      huepf,
      verfuegbar: true,
      tourVerfuegbar: false,
      starten: () => {},
      zusammenfassen: () => {},
    };
  }, [phase, lauf, aktuellerSchritt, index, sprachen, tonFehlt, stimmeLaeuft, ziel, huepf, beenden]);

  const erlaubt = darfDemo(role);
  const steuerung = useMemo<DemoSteuerung>(
    () => ({ erlaubt, kannStarten, aktiv: phase !== "aus", sprachen, starten }),
    [erlaubt, kannStarten, phase, sprachen, starten],
  );
  const wert = useMemo<DemoApi>(() => ({ anzeige, steuerung }), [anzeige, steuerung]);

  return <DemoContext.Provider value={wert}>{children}</DemoContext.Provider>;
}

/** Die Stelle, auf die Himbi bei diesem Schritt zeigt, oder null. */
function findeStelle(schritt: DemoSchritt, t: ReturnType<typeof useTranslations>): HTMLElement | null {
  const modul = modulZu(schritt.ziel);
  const schluessel = schritt.zeigeAuf ?? (modul ? `modules.${modul.key}.title` : null);
  if (schluessel) {
    let titel: string | null = null;
    try {
      titel = t(schluessel);
    } catch {
      titel = null;
    }
    const treffer = titel ? stelleZuSprechziel(`t:${titel}`) : null;
    if (treffer) return treffer;
  }
  // Rückfall: die Überschrift der Seite. Auf der Startübersicht gibt es keine, dort bleibt es leer.
  return document.querySelector<HTMLElement>("#main h1");
}

/** Für Himbis Figur: die Anzeige der Vorführung, solange sie läuft, sonst null. */
export function useDemoAnzeige(): ComplianceTourAnzeige | null {
  return useContext(DemoContext).anzeige;
}

/** Für den Start-Knopf in Himbis Einstellungen. */
export function useDemoSteuerung(): DemoSteuerung {
  return useContext(DemoContext).steuerung;
}
