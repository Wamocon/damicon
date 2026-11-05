"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { DemoBlase } from "@/components/demo/demo-blase";
import { usePersona } from "@/components/dashboard/persona";
import type { ComplianceTourAnzeige } from "@/components/dashboard/use-compliance-tour";
import { useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { Rahmen, karteVon } from "@/components/demo/demo-rahmen";
import { useTonSpeicher } from "@/components/demo/demo-ton";
import { inSichtBringen, stelleZuSprechziel, warteBisRuhig } from "@/components/ki/ui-steuerung";
import { bewegungReduziert } from "@/lib/bewegung";
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

// Der Durchgang durch das Drehbuch (lib/demo/drehbuch.ts): Himbi öffnet Seite für Seite, zeigt auf die
// Stellen, spricht den Text und geht weiter. Er speist dieselben Felder wie die Compliance-Tour
// (Blase, Zustand, Blickziel, Hüpfer), deshalb braucht Himbis Figur (haustier-dashboard.tsx) keine
// zweite Anbindung: useComplianceTourAnzeige() reicht, solange die Vorführung läuft, DIESE Anzeige
// durch.
//
// Es wird nur gezeigt. Der Durchgang öffnet Seiten, scrollt und legt einen Rahmen um die Karte (demo-rahmen.ts), er
// klickt nichts, was etwas absendet oder ändert, und füllt kein Feld aus.
//
// Zeigen: ein Schritt nennt die Stellen der Seite (abschnitte), und die Markierung wandert über sie,
// gleichmäßig verteilt über die Sprechzeit. Eine einzelne Markierung rahmte vorher immer nur ein
// Element, obwohl der Text über mehrere Stellen der Seite sprach.
//
// Ton: die Route liefert eine ganze Datei je Schritt. Sie wird vorab geholt (die nächsten drei
// Schritte, schon während der aktuelle läuft) und aus dem Speicher abgespielt. Vorher wurde nur der
// nächste Schritt vorab erzeugt, und war die Stimme langsamer als der Schritt lang, stand der
// Durchgang mal lange, mal kurz still. Ein einziges <audio>-Element, im Klick auf "Vorführung
// starten" angelegt (Autoplay-Regel der Browser). Fällt der Ton aus (Dienst nicht erreichbar,
// Berechtigung), laufen die Untertitel mit der Lesezeit weiter: ein Schritt bleibt nie hängen.

export interface DemoStart {
  mitCeoTeil: boolean;
  /** Himbi spricht auch Begrüßung, Problem und Lösung. Aus: die vortragende Person leitet selbst ein
   *  und übergibt an Himbi, der mit den Beispielen beginnt. */
  mitEinleitung: boolean;
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

/** Feste Pause nach dem letzten Wort, bevor die nächste Seite aufgeht. */
const NACHLAUF_MS = 500;
/** So lange wartet der Durchgang höchstens auf eine Seite, bevor er mit der aktuellen weitermacht. */
const SEITE_MAX_MS = 6000;
/** So lange wartet er höchstens auf den Ton eines Schritts (die Stimme erzeugt etwa in Echtzeit). */
const TON_MAX_MS = 25_000;
/** Wie viele Schritte im Voraus der Ton geholt wird. */
const VORAB = 3;

export function zielPfad(schritt: DemoSchritt): string | null {
  if (schritt.ziel.art === "pfad") return schritt.ziel.pfad;
  const modul = modulZu(schritt.ziel);
  return modul ? moduleHref(modul) : null;
}

function sichtbar(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Die Karten, auf die Himbi bei diesem Schritt nacheinander zeigt (leer: nirgends), und wie viele der
 *  gewünschten Abschnitte die Seite schon hat. Zwei Abschnitte können in derselben Karte liegen: dann
 *  gibt es weniger Karten als Abschnitte, und das ist kein Grund zu warten. */
function findeStellen(schritt: DemoSchritt, t: ReturnType<typeof useTranslations>): { stellen: HTMLElement[]; gefunden: number } {
  if (schritt.zeigeAuf) {
    let titel: string | null = null;
    try {
      titel = t(schritt.zeigeAuf);
    } catch {
      titel = null;
    }
    const treffer = titel ? stelleZuSprechziel(`t:${titel}`) : null;
    return treffer ? { stellen: [karteVon(treffer)], gefunden: 1 } : { stellen: [], gefunden: 0 };
  }
  if (schritt.ziel.art !== "modul") return { stellen: [], gefunden: 0 };
  const haupt = document.getElementById("main");
  const kopf = haupt?.querySelector<HTMLElement>("h1");
  if (!haupt || !kopf) return { stellen: [], gefunden: 0 };
  // 0 ist der Seitenkopf, 1.. sind die Abschnitte mit Zwischenüberschrift in der Reihenfolge der Seite.
  const abschnitte = Array.from(haupt.querySelectorAll<HTMLElement>("h2")).filter((h) => sichtbar(h) && !h.closest("aside, nav"));
  const gewollt = schritt.abschnitte ?? [0];
  const stellen: HTMLElement[] = [];
  let gefunden = 0;
  for (const nr of gewollt) {
    const quelle = nr === 0 ? kopf : abschnitte[nr - 1];
    if (!quelle) continue;
    gefunden++;
    const stelle = karteVon(quelle);
    if (!stellen.includes(stelle)) stellen.push(stelle);
  }
  return { stellen, gefunden };
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
  const rahmenRef = useRef<Rahmen | null>(null);
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

  /** Der Ton eines Schritts als Datei, genau einmal angefragt (demo-ton.ts). */
  const holeTon = useTonSpeicher();

  const starten = useCallback(
    ({ mitCeoTeil, mitEinleitung, sprache }: DemoStart) => {
      if (!kannStarten) return;
      // Das Audio-Element entsteht im Klick: spätere play()-Aufrufe der Schleife sind dann erlaubt.
      audioRef.current ??= new Audio();
      audioRef.current.preload = "auto";
      // Das Seitenpanel zeigt sonst die Antwort statt der Sprechblase (haustier-dashboard-blasen.ts).
      setOffen(false);
      // Schritte, deren Seite die Rolle nicht sehen darf, entfallen. Für Geschäftsführung und
      // Administration sind das keine, die Prüfung hält aber auch eine künftige Rechteänderung ein.
      const schritte = schritteFuer(mitCeoTeil, mitEinleitung).filter((s) => {
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

  // Der Durchgang eines Schritts: Ton anfordern, Seite öffnen, abwarten, sprechen und dabei zeigen,
  // weiter. Die Aufräumfunktion bricht alles ab (Pause, Stopp, Sprung, Sprachwechsel), das Neustarten
  // eines Schritts ist damit dasselbe wie sein erster Start.
  const schrittNummer = lauf ? index : 0;
  const aktuellerSchritt = lauf?.schritte[schrittNummer] ?? null;
  const sprache = lauf?.sprache ?? "de";
  const schritte = lauf?.schritte ?? null;
  // Der Rahmen lebt, solange die Vorführung läuft, und wird bei Pause, Ende und Abmeldung entfernt.
  // Vor dem Schrittablauf deklariert: dessen Effekt findet ihn beim ersten Lauf schon vor.
  useEffect(() => {
    if (phase !== "laeuft") return;
    const rahmen = new Rahmen(bewegungReduziert());
    rahmenRef.current = rahmen;
    return () => {
      rahmen.entfernen();
      rahmenRef.current = null;
    };
  }, [phase]);
  useEffect(() => {
    if (phase !== "laeuft" || !schritte || !aktuellerSchritt) return;
    const schritt = aktuellerSchritt;
    let abgebrochen = false;
    const timer = new Set<number>();
    const audio = audioRef.current;
    let tonAdresse: string | null = null;

    const aufraeumen = () => {
      abgebrochen = true;
      timer.forEach((id) => window.clearTimeout(id));
      timer.clear();
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.onloadedmetadata = null;
        audio.pause();
      }
      if (tonAdresse) URL.revokeObjectURL(tonAdresse);
      rahmenRef.current?.setze(null);
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

    /** Legt den Rahmen um eine Karte (er gleitet von der vorigen) und lässt Himbi hinschauen. */
    const zeige = (stelle: HTMLElement) => {
      inSichtBringen(stelle);
      rahmenRef.current?.setze(stelle);
      setZiel(stelle);
      setHuepf((h) => h + 1);
    };

    /** Zeigt nacheinander auf die Stellen, gleichmäßig verteilt über die Sprechzeit. */
    const fuehreDurch = (stellen: HTMLElement[], gesamtMs: number) => {
      stellen.forEach((stelle, i) => {
        if (i === 0) return zeige(stelle);
        const id = window.setTimeout(() => {
          timer.delete(id);
          if (!abgebrochen) zeige(stelle);
        }, (gesamtMs * i) / stellen.length);
        timer.add(id);
      });
    };

    /** Zeigt auf die Stellen, sobald die Seite sie hat: lädt sie langsam, beginnt Himbi trotzdem zu
     *  sprechen und die Markierung folgt, auf die Restzeit verteilt. */
    const fuehreNach = (stellenZukunft: Promise<HTMLElement[]>, gesamtMs: number) => {
      const seit = Date.now();
      void stellenZukunft.then((stellen) => {
        if (abgebrochen || stellen.length === 0) return;
        fuehreDurch(stellen, Math.max(gesamtMs - (Date.now() - seit), 1500));
      });
    };

    const sprich = (text: string, ton: Blob | null, stellenZukunft: Promise<HTMLElement[]>) =>
      new Promise<void>((fertig) => {
        const lesezeit = lesedauerMs(text);
        let erledigt = false;
        const ende = () => {
          if (erledigt) return;
          erledigt = true;
          fertig();
        };
        const ohneTon = () => {
          setTonFehlt(true);
          setStimmeLaeuft(false);
          fuehreNach(stellenZukunft, lesezeit);
          void nachPause(lesezeit).then(ende);
        };
        if (!audio || !ton) return ohneTon();
        tonAdresse = URL.createObjectURL(ton);
        audio.onended = () => {
          setStimmeLaeuft(false);
          ende();
        };
        audio.onerror = ohneTon;
        audio.src = tonAdresse;
        audio.play().then(
          () => {
            setStimmeLaeuft(true);
            setTonFehlt(false);
            // Die Länge steht nach dem Start fest; bis dahin gilt die Lesezeit.
            const dauer = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : lesezeit;
            fuehreNach(stellenZukunft, dauer);
          },
          ohneTon,
        );
        // Sicherung: bricht der Ton mittendrin ab, ohne ein Ende zu melden, geht es nach der
        // dreifachen Lesezeit trotzdem weiter.
        const sicherung = window.setTimeout(ende, Math.max(lesezeit * 3, 60_000));
        timer.add(sicherung);
      });

    void (async () => {
      setZiel(null);
      // Der Ton wird sofort angefordert und läuft parallel zum Öffnen der Seite.
      const tonAbruf = holeTon(schritt.id, sprache);
      const gewollt = zielPfad(schritt);
      if (gewollt && pfadRef.current !== gewollt) {
        router.push(gewollt);
        const start = Date.now();
        while (!abgebrochen && pfadRef.current !== gewollt && Date.now() - start < SEITE_MAX_MS) await nachPause(100);
      }
      if (abgebrochen) return;
      await warteBisRuhig(2500, 300);
      if (abgebrochen) return;

      // Eine langsame Seite zeigt zuerst Platzhalter und liefert die Abschnitte nach: bis zu vier
      // Sekunden warten, bis alle gewünschten da sind, sonst mit den vorhandenen weitermachen.
      const erwartet = schritt.ziel.art === "modul" ? (schritt.abschnitte ?? [0]).length : schritt.zeigeAuf ? 1 : 0;
      // Bis zu 1,5 s auf die Abschnitte warten, dann beginnt Himbi trotzdem: die Suche läuft bis zu vier
      // weitere Sekunden im Hintergrund weiter, und die Markierung folgt, sobald die Seite so weit ist.
      let fund = findeStellen(schritt, tRef.current);
      for (let versuch = 0; versuch < 6 && fund.gefunden < erwartet && !abgebrochen; versuch++) {
        await nachPause(250);
        fund = findeStellen(schritt, tRef.current);
      }
      const bisher = fund;
      const stellenZukunft: Promise<HTMLElement[]> =
        bisher.gefunden >= erwartet
          ? Promise.resolve(bisher.stellen)
          : (async () => {
              let spaeter = bisher;
              for (let versuch = 0; versuch < 16 && spaeter.gefunden < erwartet && !abgebrochen; versuch++) {
                await nachPause(250);
                spaeter = findeStellen(schritt, tRef.current);
              }
              return spaeter.stellen;
            })();
      if (abgebrochen) return;
      const ton = await Promise.race([tonAbruf, nachPause(TON_MAX_MS).then(() => null)]);
      if (abgebrochen) return;
      const text = textIn(schritt, sprache);
      if (text) await sprich(text, ton, stellenZukunft);
      if (abgebrochen) return;
      await nachPause(NACHLAUF_MS);
      if (abgebrochen) return;
      rahmenRef.current?.setze(null);
      if (index + 1 < schritte.length) setIndex(index + 1);
      else {
        setZiel(null);
        setPhase("fertig");
      }
    })();

    return aufraeumen;
    // router und die Anzeige-Setzer sind stabil; pfad, t und role laufen über Refs (siehe oben).
  }, [phase, schritte, aktuellerSchritt, sprache, index, router, holeTon]);

  // Die nächsten Schritte schon holen, während dieser läuft: die Route erzeugt und legt ab, der Abruf
  // danach kommt aus dem Speicher. Ein Fehlschlag fällt nicht auf: der Schritt läuft dann mit Untertiteln.
  useEffect(() => {
    if (phase !== "laeuft" || !schritte) return;
    for (let k = 1; k <= VORAB; k++) {
      const naechster = schritte[index + k];
      if (naechster && textIn(naechster, sprache)) void holeTon(naechster.id, sprache, true);
    }
  }, [phase, schritte, index, sprache, holeTon]);

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

/** Für Himbis Figur: die Anzeige der Vorführung, solange sie läuft, sonst null. */
export function useDemoAnzeige(): ComplianceTourAnzeige | null {
  return useContext(DemoContext).anzeige;
}

/** Für den Start-Knopf in Himbis Einstellungen. */
export function useDemoSteuerung(): DemoSteuerung {
  return useContext(DemoContext).steuerung;
}
