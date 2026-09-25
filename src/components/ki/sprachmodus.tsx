"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Ear, Loader2, Mic, MicOff, Subtitles, Volume2, X } from "lucide-react";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { useScrollSperre } from "@/components/ui/scroll-sperre";
import { SprachKugel, type KugelZustand } from "@/components/ki/sprach-kugel";
import { SprachSpotlight, useHervorhebungsRechteck } from "@/components/ki/sprach-spotlight";
import { loeseSprechZiel, ueberschriftImSatz, zeigeSprechStelle } from "@/components/ki/sprach-mitlesen";
import {
  abonniereSprachBus,
  chatStandServer,
  entscheideFreigabe,
  entsperreTon,
  freigabeAnfrageServer,
  leseChatStand,
  leseFreigabeAnfrage,
  leseGerade,
  stelleSprachFrage,
  unterbrichChat,
} from "@/components/ki/sprachmodus-bus";
import { leseAusgabePegel } from "@/lib/ausgabe-pegel";
import { leseLautstaerke, starteHoeren, stoppeHoeren } from "@/lib/hoeren";
import {
  antwortFertig,
  assistentIstDran,
  erzeugeUnterbrechungsWaechter,
  istAbsageBefehl,
  istStoppBefehl,
  istZusageBefehl,
  stoppBefehlAmEnde,
  stoppWortIn,
  nachSitzungsAbbruch,
  naechstePhase,
  NEUVERSUCH_MS,
  nimmtAuf,
  RUHE_VOR_ZUHOEREN_MS,
  type Phase,
} from "@/lib/domain/sprachmodus";
import { AUFNAHME_STUECK_MS, AUFNAHME_VORGABEN } from "@/lib/domain/diktat";
import { Markdown } from "@/components/ki/ki-chat";
import { starteLiveSitzung, type LiveErgebnis, type LiveSitzung } from "@/components/ki/diktat-live";
import { cn } from "@/lib/utils";

// Der Sprachmodus: ein Live-Gespraech mit Himbi ohne sichtbaren Chat.
//
// Vollflaechiges Overlay ueber der Seite (dieselbe Grundidee wie die "Buehne"
// des Panels, ki-pane.css: unscharfer Hintergrund, .ki-buehne-*), in der Mitte
// die Kugel (sprach-kugel.tsx). Solange nichts hervorgehoben ist, bleibt sie
// dort stehen. Springt der Assistent zu einem Bereich (oeffneBereich/zeigeAuf,
// ueber ki-pane-kontext.tsx und components/ki/hervorhebung.ts gemeldet), legt
// sich ein Lichtkegel um das Ziel (sprach-spotlight.tsx) und die Kugel rueckt
// klein an den freien Rand (besterPlatz, domain/sprachmodus.ts) - sie zeigt
// weiter den Zustand des Gespraechs, verdeckt aber nicht, wovon Himbi spricht.
//
// Die Frage geht ueber sprachmodus-bus.ts an den ganz normalen Chat im
// Seitenpanel (der bleibt dabei UNSICHTBAR, aber gemountet und aktiv - er
// fuehrt Werkzeuge aus, navigiert, speichert den Verlauf). Nach dem Gespraech
// steht alles dort zum Nachlesen, es gibt keinen zweiten, eigenen Weg.
export function Sprachmodus() {
  const { sprachmodus } = useKiPane();
  if (!sprachmodus) return null;
  return <SprachmodusInhalt />;
}

const GROESSE_MITTE = 220;
/** So lange muss ein vorlaeufig erkanntes "Stopp" stehen bleiben, bevor der
 *  Stoppwort-Waechter anhaelt (kurz genug, um sofort zu wirken, lang genug, dass
 *  ein vorlaeufiges Wort, das die Erkennung gleich korrigiert, nichts ausloest). */
const STOPP_STABIL_MS = 350;
const GROESSE_KLEIN = 96;

/** Ein Symbol je Kugelzustand, neben dem Zustandstext - der Ton haengt nie an
 *  der Farbe der Kugel allein (Rueckmeldung vom 25.09.2026: die vier Farben
 *  liessen sich nicht sicher als "hoert zu / denkt nach / spricht / Fehler"
 *  lesen). "denkt" dreht sich (Loader2), das macht "arbeitet gerade" auch
 *  ohne jedes Lesen der Beschriftung sofort klar. */
const STATUS_SYMBOL: Record<KugelZustand, typeof Ear> = {
  hoert: Ear,
  denkt: Loader2,
  spricht: Volume2,
  pausiert: MicOff,
  fehler: AlertTriangle,
};

/** Wie das Mikrofon im Gespraech geoeffnet wird: wie beim Diktat, aber MIT
 *  Echounterdrueckung. Beim Diktat verstummt jede Wiedergabe, solange das
 *  Mikrofon offen ist; hier spricht Himbi, waehrend das Mikrofon offen bleibt
 *  (Dazwischenreden, siehe erzeugeUnterbrechungsWaechter). Ohne Filter hoerte
 *  das Mikrofon die Stimme aus dem Lautsprecher mit. */
const GESPRAECH_AUFNAHME: MediaTrackConstraints = { ...AUFNAHME_VORGABEN, echoCancellation: true };

/** Eine Aufnahme = eine Aeusserung. Bis sie zu einer Live-Sitzung gehoert,
 *  sammelt sie ihre Stuecke (Vorlauf beim Dazwischenreden). */
type Aufnahme = { recorder: MediaRecorder; puffer: Blob[]; sitzung: LiveSitzung | null };

function SprachmodusInhalt() {
  const t = useTranslations("kiAssistentAnsicht.sprachmodus");
  const tAktion = useTranslations("aktionen");
  const sprache = useLocale();
  const { beendeSprachmodus } = useKiPane();

  const [phase, setPhase] = useState<Phase>("startet");
  const [zwischentext, setZwischentext] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [untertitelAn, setUntertitelAn] = useState(true);

  const liveRef = useRef<LiveSitzung | null>(null);
  const aufnahmeRef = useRef<Aufnahme | null>(null);
  const stromRef = useRef<MediaStream | null>(null);
  const ruheTimer = useRef<number | undefined>(undefined);
  const neuTimer = useRef<number | undefined>(undefined);
  const sitzungSeit = useRef(0);
  const fehlversuche = useRef(0);
  const phaseRef = useRef(phase);
  // Als erster Effekt: alle folgenden lesen im selben Durchlauf schon die neue Phase.
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const chatStand = useSyncExternalStore(abonniereSprachBus, leseChatStand, chatStandServer);
  const freigabeAnfrage = useSyncExternalStore(abonniereSprachBus, leseFreigabeAnfrage, freigabeAnfrageServer);

  const dispatch = useCallback((ereignis: Parameters<typeof naechstePhase>[1]) => {
    setPhase((bisher) => {
      const neu = naechstePhase(bisher, ereignis);
      return neu === bisher ? bisher : neu;
    });
  }, []);

  // --- Mikrofon: einmal geoeffnet, bleibt fuer die ganze Sitzung offen -----------------
  //
  // Anders als beim Diktatknopf (mikrofon.tsx) wird der Mikrofonstrom hier NICHT je
  // Aeusserung neu geoeffnet: staendiges Oeffnen/Schliessen laesst auf iOS die
  // Audiosession zwischen "nur Wiedergabe" und "Aufnahme und Wiedergabe" wechseln, und die
  // erste Antwort nach dem Wiederoeffnen kommt dann stumm ueber den Hoerer statt den
  // Lautsprecher. Neu je Aeusserung ist nur der MediaRecorder auf diesem Strom (siehe
  // starteAufnahme) - das beruehrt die Audiosession nicht.
  // Ist der Strom schon offen (Neustart nach einem Fehler), fuehrt erneutVersuchen() selbst
  // weiter - hier wird nur geoeffnet, was noch nicht offen ist.
  useEffect(() => {
    if (phase !== "startet" || stromRef.current) return;
    let abgebrochen = false;
    void (async () => {
      try {
        const strom = await navigator.mediaDevices.getUserMedia({ audio: GESPRAECH_AUFNAHME });
        if (abgebrochen) {
          strom.getTracks().forEach((s) => s.stop());
          return;
        }
        stromRef.current = strom;
        // Die Kugel reagiert auf die eigene Stimme (lib/hoeren.ts), und das Dazwischenreden
        // misst dort die Lautstaerke.
        starteHoeren(strom);
        setMeldung(null);
        dispatch({ art: "mikrofon-bereit" });
      } catch {
        if (abgebrochen) return;
        setMeldung(t("keinZugriff"));
        dispatch({ art: "fehler" });
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [phase, dispatch, t]);

  // --- Aufnahme je Aeusserung --------------------------------------------------------------
  //
  // Bis zum 24.09.2026 lief EIN MediaRecorder fuer den ganzen Sprachmodus, pausiert und
  // fortgesetzt. Nur sein allererstes Stueck traegt aber den Dateikopf (webm/mp4); jede
  // weitere Aeusserung begann fuer Soniox mitten in einer Datei ohne Kopf und wurde nicht
  // erkannt - die erste Frage ging, die zweite nicht mehr. Jetzt beginnt jede Aeusserung
  // eine eigene Aufnahme, und ihr erstes Stueck ist wieder ein Dateikopf.
  const starteAufnahme = useCallback((): Aufnahme | null => {
    if (aufnahmeRef.current) return aufnahmeRef.current;
    const strom = stromRef.current;
    if (!strom) return null;
    try {
      const recorder = new MediaRecorder(strom);
      const aufnahme: Aufnahme = { recorder, puffer: [], sitzung: null };
      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        if (aufnahme.sitzung) aufnahme.sitzung.sende(e.data);
        else aufnahme.puffer.push(e.data);
      };
      recorder.start(AUFNAHME_STUECK_MS);
      aufnahmeRef.current = aufnahme;
      return aufnahme;
    } catch {
      return null;
    }
  }, []);

  /** Aufnahme verwerfen, ohne dass noch etwas an eine Sitzung geht. */
  const verwirfAufnahme = useCallback(() => {
    const aufnahme = aufnahmeRef.current;
    aufnahmeRef.current = null;
    if (!aufnahme) return;
    aufnahme.sitzung = null;
    aufnahme.puffer = [];
    try {
      if (aufnahme.recorder.state !== "inactive") aufnahme.recorder.stop();
    } catch {
      // schon gestoppt
    }
  }, []);

  /** Aufnahme beenden und warten, bis ihr letztes Stueck bei der Sitzung ist. */
  const schliesseAufnahme = useCallback((): Promise<void> => {
    const aufnahme = aufnahmeRef.current;
    aufnahmeRef.current = null;
    if (!aufnahme || aufnahme.recorder.state === "inactive") return Promise.resolve();
    return new Promise((fertig) => {
      const notbremse = window.setTimeout(fertig, 500);
      aufnahme.recorder.addEventListener(
        "stop",
        () => {
          window.clearTimeout(notbremse);
          fertig();
        },
        { once: true },
      );
      try {
        aufnahme.recorder.stop();
      } catch {
        fertig();
      }
    });
  }, []);

  // --- Eine Aeusserung: eine Live-Sitzung ------------------------------------------------
  const beginneRef = useRef<() => void>(() => {});
  // beenden() ist erst weiter unten definiert, gebraucht wird sie schon hier
  // (Wortbefehl "Stopp") - derselbe Ref-Umweg wie bei beginneRef oben.
  const beendenRef = useRef<() => void>(() => {});

  const sitzungAbgebrochen = useCallback(
    (grund: string, gehoert: boolean) => {
      liveRef.current = null;
      verwirfAufnahme();
      setZwischentext("");
      const { weiter, fehlversuche: neu } = nachSitzungsAbbruch({
        grund,
        dauerMs: performance.now() - sitzungSeit.current,
        gehoert,
        fehlversucheBisher: fehlversuche.current,
      });
      fehlversuche.current = neu;
      if (weiter === "nicht-eingerichtet") {
        setMeldung(t("liveFehlt"));
        dispatch({ art: "fehler" });
      } else if (weiter === "aufgeben") {
        setMeldung(t("verbindungFehlt"));
        dispatch({ art: "fehler" });
      } else if (weiter === "stumm") {
        // Zwei Minuten nichts gehoert: stumm schalten, statt weiter Stille an die
        // Erkennung zu schicken. Ein Tipp auf den Mikrofonknopf setzt fort.
        dispatch({ art: "pausieren" });
      } else {
        window.clearTimeout(neuTimer.current);
        neuTimer.current = window.setTimeout(() => {
          if (phaseRef.current === "hoert" && !liveRef.current) beginneRef.current();
        }, NEUVERSUCH_MS);
      }
    },
    [dispatch, t, verwirfAufnahme],
  );

  const beginneAeusserung = useCallback(() => {
    if (liveRef.current) return;
    const aufnahme = starteAufnahme();
    if (!aufnahme) {
      // Nicht mitten im Effekt, der diese Aeusserung beginnt, den Zustand umwerfen.
      queueMicrotask(() => {
        setMeldung(t("keinZugriff"));
        dispatch({ art: "fehler" });
      });
      return;
    }
    sitzungSeit.current = performance.now();
    const sitzung: LiveSitzung = starteLiveSitzung({
      sprache,
      zweck: "gespraech",
      beiStand: (stand) => {
        if (liveRef.current === sitzung) setZwischentext(stand.anzeige);
      },
      beiEndpunkt: () => {
        if (liveRef.current === sitzung) dispatch({ art: "aeusserung-ende" });
      },
      // Bis zum 24.09.2026 gab es diesen Weg nicht: scheiterte die Sitzung (Schluessel,
      // Verbindung, Dienst), kam nie ein Endpunkt, und die Kugel hoerte endlos zu.
      beiScheitern: (grund) => {
        if (liveRef.current === sitzung) sitzungAbgebrochen(grund, sitzung.hatGehoert());
      },
    });
    liveRef.current = sitzung;
    aufnahme.sitzung = sitzung;
    for (const stueck of aufnahme.puffer) sitzung.sende(stueck);
    aufnahme.puffer = [];
  }, [sprache, dispatch, t, starteAufnahme, sitzungAbgebrochen]);
  useEffect(() => {
    beginneRef.current = beginneAeusserung;
  }, [beginneAeusserung]);

  useEffect(() => {
    if (nimmtAuf(phase)) beginneAeusserung();
  }, [phase, beginneAeusserung]);

  // Aeusserung zu Ende: Aufnahme schliessen (ihr letztes Stueck geht noch an die
  // Sitzung), die Sitzung abschliessen und, wenn etwas dabei herauskam, als Frage an den
  // Chat weiterreichen (sprachmodus-bus.ts).
  useEffect(() => {
    if (phase !== "versteht") return;
    const sitzung = liveRef.current;
    liveRef.current = null;
    void schliesseAufnahme()
      .then((): Promise<LiveErgebnis> | LiveErgebnis => (sitzung ? sitzung.beende() : { ok: false, grund: "keine-sitzung" }))
      .then((ergebnis) => {
        setZwischentext("");
        if (!ergebnis.ok || !ergebnis.text) {
          if (!ergebnis.ok) console.warn("[damicon] Sprachmodus: Aeusserung nicht erkannt:", ergebnis.grund);
          dispatch({ art: "nichts-gehoert" });
          return;
        }
        // Der Sprachmodus hat seit dem 25.09.2026 dieselben Rechte wie der
        // sichtbare Chat: eine Aktion, die etwas aendert, wartet auf eine
        // Freigabe (sprachmodus-bus.ts). Ist gerade eine offen, zaehlt die
        // Aeusserung zuerst als Zusage oder Absage dazu, nicht als neue Frage -
        // "Stopp" lehnt dann NUR die Karte ab, nicht den ganzen Sprachmodus
        // (istAbsageBefehl deckt das ab, istStoppBefehl wird hier bewusst
        // nicht geprueft).
        if (leseFreigabeAnfrage()) {
          if (istZusageBefehl(ergebnis.text) || istAbsageBefehl(ergebnis.text)) {
            entscheideFreigabe(istZusageBefehl(ergebnis.text));
            dispatch({ art: "frage-gestellt" });
            return;
          }
          // "Sprachmodus beenden" bei offener Karte: ablehnen UND beenden.
          if (istStoppBefehl(ergebnis.text)) {
            entscheideFreigabe(false);
            beendenRef.current();
            return;
          }
        } else if (istStoppBefehl(ergebnis.text)) {
          // Sicherer Weg zu beenden, ohne Knopf oder Taste (Rueckmeldung vom
          // 25.09.2026: "ich muss ihn stoppen koennen mit Stopp").
          beendenRef.current();
          return;
        }
        fehlversuche.current = 0;
        stelleSprachFrage(ergebnis.text, ergebnis.sprachen);
        dispatch({ art: "frage-gestellt" });
      });
  }, [phase, dispatch, schliesseAufnahme]);

  // --- Dazwischenreden, waehrend Himbi spricht --------------------------------------------
  //
  // Wie in einem echten Gespraech: wer spricht, unterbricht. Der Waechter vergleicht die
  // Lautstaerke am Mikrofon mit der eigenen Ausgabe (Echo) und dem Grundrauschen und
  // schlaegt erst nach einem Moment durchgehender Sprache an (domain/sprachmodus.ts).
  // Sobald es nach Sprache klingt, laeuft schon eine Aufnahme mit - sonst fehlte der
  // Anfang des Satzes, der den Waechter ausgeloest hat. Verklingt es wieder, wird sie
  // verworfen. Der Tipp auf die Kugel bleibt der sichere Weg (laute Halle).
  useEffect(() => {
    if (phase !== "spricht") return;
    const waechter = erzeugeUnterbrechungsWaechter();
    let bild = 0;
    let unterbrochen = false;
    const schritt = () => {
      const urteil = waechter.melde(leseLautstaerke(), leseAusgabePegel(), performance.now());
      if (urteil === "unterbrechen") {
        unterbrochen = true;
        unterbrichChat();
        dispatch({ art: "unterbrechen" });
        return;
      }
      if (urteil === "vielleicht") starteAufnahme();
      else if (aufnahmeRef.current && !aufnahmeRef.current.sitzung) verwirfAufnahme();
      bild = window.requestAnimationFrame(schritt);
    };
    bild = window.requestAnimationFrame(schritt);
    return () => {
      window.cancelAnimationFrame(bild);
      // Endet die Phase anders als durch Dazwischenreden (Antwort fertig, Tipp, Pause),
      // gehoert ein Vorlauf nicht zur naechsten Frage: er kann das Echo der letzten Worte
      // enthalten, und Himbi hoerte sich sonst selbst eine Frage stellen.
      if (!unterbrochen && aufnahmeRef.current && !aufnahmeRef.current.sitzung) verwirfAufnahme();
    };
  }, [phase, dispatch, starteAufnahme, verwirfAufnahme]);

  // --- An den Chat-Zustand gekoppelt: denkt -> spricht -> wieder zuhoeren ---------------
  // Direkt am Bus statt in einem Effekt auf chatStand: der Chat meldet seinen Stand aus
  // einem eigenen Effekt (ki-chat.tsx), und hier wird im Rueckruf darauf reagiert.
  useEffect(() => {
    const reagiere = () => {
      const stand = leseChatStand();
      window.clearTimeout(ruheTimer.current);
      if (phaseRef.current !== "denkt" && phaseRef.current !== "spricht") return;
      if (stand.einwilligungFehlt) {
        // Der Chat hat die Frage verworfen, weil dem Hinweis zur KI-Nutzung noch
        // nicht zugestimmt ist. Eine Zustimmung darf hier nicht ungesehen gesetzt
        // werden (bis zum 24.09.2026 tat der Sprachmodus genau das) - der Start
        // prueft sie deshalb schon vorher (ki-pane-kontext.tsx, starteSprachmodus).
        setMeldung(t("einwilligungZuerst"));
        dispatch({ art: "fehler" });
        return;
      }
      if (stand.fehler) {
        setMeldung(tAktion("fehler.unbekannt"));
        dispatch({ art: "unterbrechen" });
        return;
      }
      const spricht = stand.spricht || stand.laedt;
      if (spricht && phaseRef.current === "denkt") dispatch({ art: "antwort-spricht" });
      if (!spricht && antwortFertig(stand)) {
        // Kurze Gnadenfrist: zwischen Streamende und dem Anstoss des Vorlesens liegt ein
        // Renderdurchlauf, ohne diese Pause hoerte die Kugel genau in diese Luecke hinein zu.
        ruheTimer.current = window.setTimeout(() => dispatch({ art: "antwort-fertig" }), RUHE_VOR_ZUHOEREN_MS);
      }
    };
    return abonniereSprachBus(reagiere);
  }, [dispatch, t, tAktion]);

  // Alles schliessen, wenn der Sprachmodus endet.
  useEffect(
    () => () => {
      window.clearTimeout(ruheTimer.current);
      window.clearTimeout(neuTimer.current);
      liveRef.current?.abbrechen();
      liveRef.current = null;
      verwirfAufnahme();
      stromRef.current?.getTracks().forEach((s) => s.stop());
      stromRef.current = null;
      stoppeHoeren();
    },
    [verwirfAufnahme],
  );

  // --- Bedienung --------------------------------------------------------------------------
  const erneutVersuchen = useCallback(() => {
    setMeldung(null);
    fehlversuche.current = 0;
    // fehler -> startet; ist das Mikrofon noch offen, gleich weiter zum Zuhoeren,
    // sonst oeffnet der Effekt fuer "startet" es neu.
    dispatch({ art: "fortsetzen" });
    if (stromRef.current) dispatch({ art: "mikrofon-bereit" });
  }, [dispatch]);

  const beiKugelKlick = useCallback(() => {
    entsperreTon();
    if (phaseRef.current === "fehler") {
      erneutVersuchen();
      return;
    }
    if (assistentIstDran(phaseRef.current)) {
      unterbrichChat();
      dispatch({ art: "unterbrechen" });
    }
  }, [dispatch, erneutVersuchen]);

  const beenden = useCallback(() => {
    if (assistentIstDran(phaseRef.current)) unterbrichChat();
    liveRef.current?.abbrechen();
    liveRef.current = null;
    verwirfAufnahme();
    beendeSprachmodus();
  }, [beendeSprachmodus, verwirfAufnahme]);
  useEffect(() => {
    beendenRef.current = beenden;
  }, [beenden]);

  const pausieren = useCallback(() => {
    if (phaseRef.current === "fehler") {
      erneutVersuchen();
    } else if (phaseRef.current === "pausiert") {
      dispatch({ art: "fortsetzen" });
    } else {
      if (assistentIstDran(phaseRef.current)) unterbrichChat();
      window.clearTimeout(neuTimer.current);
      liveRef.current?.abbrechen();
      liveRef.current = null;
      verwirfAufnahme();
      dispatch({ art: "pausieren" });
    }
  }, [dispatch, erneutVersuchen, verwirfAufnahme]);

  // Escape beendet, wie bei der Buehne des Panels (ki-pane-kontext.tsx).
  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") beenden();
      else if (e.key === " " && assistentIstDran(phaseRef.current)) {
        e.preventDefault();
        beiKugelKlick();
      }
    };
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, [beenden, beiKugelKlick]);
  // Die Seite scrollt nur noch, wenn Himbi sie scrollt. Ueber die gemeinsame Sperre am
  // <html> (ui/scroll-sperre.ts): eine eigene Sperre am <body> machte ihn zum
  // Scrollcontainer, und Kopfzeile und Seitenleiste scrollten mit.
  useScrollSperre(true);

  // --- Kugel-Platzierung: Mitte oder links ueber der Menueleiste --------------------------
  //
  // Zwei Faelle (Rueckmeldung vom 25.09.2026: "sobald er anfaengt, mir den
  // Inhalt der UI zu erzaehlen, soll er nach links ueber die Menueleiste, links
  // vertikal mittig, der gesprochene Text darunter, die Mitte muss frei und gut
  // lesbar bleiben"):
  //   1. angedockt: der Assistent denkt oder spricht ODER ein Element ist
  //      hervorgehoben (zeigeAuf) - Kugel, Zustand und Text sitzen links, ueber
  //      der Navigationsleiste. Ein hervorgehobenes Ziel bekommt nur den
  //      Rahmen (SprachSpotlight), die Kugel rueckt NICHT mehr daneben: dort
  //      fehlte das Schriftbild des Gesprochenen, und die Menueleiste blieb
  //      scharf (Screenshot vom 25.09.2026).
  //   2. sonst (Zuhoeren, Fehler, Pause): Kugel gross in der Mitte wie bisher.
  const zielRechteck = useHervorhebungsRechteck();
  const zielSichtbar = zielRechteck !== null && zielRechteck.breite > 0 && zielRechteck.hoehe > 0;
  const angedockt = zielSichtbar || assistentIstDran(phase);

  // Mitlesen: der Rahmen in der Mitte folgt dem Satz, den die Stimme gerade
  // spricht (Rückmeldung vom 25.09.2026: "ich kann nicht nachvollziehen, bei
  // welchem Punkt er gerade ist"). Welcher Satz klingt, weiß der Vorlese-Strom
  // (sprachmodus-bus.ts, leseGerade); welche Stelle er meint, sagt seine
  // Sprechmarke (domain/sprechmarken.ts, sprach-mitlesen.ts). Ein Satz ohne Marke
  // lässt den Rahmen stehen. Nur wenn in der ganzen Antwort noch keine Marke kam,
  // zeigt eine wörtlich genannte Überschrift die Stelle - nie Wortähnlichkeit.
  //
  // Nebenbei steht der klingende Satz als data-satz-jetzt am Untertitel: der
  // Führungstest liest dort mit, was gerade gesprochen wird.
  const untertitelRef = useRef<HTMLDivElement | null>(null);
  const himbiDran = assistentIstDran(phase);
  useEffect(() => {
    if (!himbiDran) return;
    let letzter = "";
    let markeGesehen = false;
    const uhr = window.setInterval(() => {
      const jetzt = leseGerade();
      // Satz und ob er klingt: nach einer Sprechpause steht derselbe Index erst
      // still (noch nicht gesprochen) und klingt dann - erst dann gilt seine Marke.
      const schluessel = jetzt ? `${jetzt.index}:${jetzt.satz === null ? 0 : 1}` : "";
      if (!jetzt || schluessel === letzter) return;
      letzter = schluessel;
      if (jetzt.satz === null) return;
      untertitelRef.current?.setAttribute("data-satz-jetzt", jetzt.satz ?? "");
      untertitelRef.current?.setAttribute("data-satz-index", String(jetzt.index));
      if (jetzt.ziel) {
        markeGesehen = true;
        const stelle = loeseSprechZiel(jetzt.ziel);
        if (stelle) zeigeSprechStelle(stelle);
        return;
      }
      if (markeGesehen || !jetzt.satz) return;
      const stelle = ueberschriftImSatz(jetzt.satz);
      if (stelle) zeigeSprechStelle(stelle);
    }, 150);
    return () => window.clearInterval(uhr);
  }, [himbiDran]);

  // --- Stoppwort, waehrend Himbi denkt oder spricht -------------------------------------
  //
  // Waehrend Himbi dran ist, laeuft keine Spracherkennung fuer Fragen, nur der
  // Lautstaerke-Waechter fuer das Dazwischenreden. Der verlangt 400 ms
  // durchgehende Sprache, ein kurzes "Stopp" (ein kurzer Vokal) erreicht das nie,
  // und beim Nachdenken hoerte gar nichts zu (Live-Test vom 25.09.2026: "Stopp"
  // blieb ohne Wirkung, Himbi sprach und fuehrte weiter). Deshalb laeuft in
  // dieser Zeit eine eigene Live-Erkennung auf demselben Mikrofon (mit
  // Echounterdrueckung), die NUR auf kurze Stoppbefehle reagiert (istStoppBefehl):
  // endgueltig erkannt, oder vorlaeufig und STOPP_STABIL_MS lang unveraendert. Ein
  // Stoppwort, das Himbi gerade selbst sagt, zaehlt nicht. Bei offener
  // Freigabekarte lehnt "Stopp" nur die Karte ab, wie beim Zuhoeren, und der
  // Waechter hoert weiter. Bricht die Sitzung ab (Verbindung, Zeitgrenze einer
  // Sitzung), startet er neu, hoechstens dreimal je Antwort.
  useEffect(() => {
    if (!himbiDran) return;
    const strom = stromRef.current;
    if (!strom) return;
    let aus = false;
    let versuche = 0;
    let recorder: MediaRecorder | null = null;
    let sitzung: LiveSitzung | null = null;
    let kandidatUhr: number | undefined;
    let neustartUhr: number | undefined;
    // Ein Stoppbefehl in irgendeinem Satz des neuen Textes oder an seinem Ende (dem
    // oft unpunktierter Resthall vorausgeht) - nicht nur als letzter eigener Satz.
    const stoppIn = (text: string): string | null => {
      for (const satz of text.split(/(?<=[.!?…])\s+/)) if (satz.trim() && istStoppBefehl(satz)) return satz;
      return stoppBefehlAmEnde(text);
    };
    const stoppeTeil = () => {
      window.clearTimeout(kandidatUhr);
      try {
        if (recorder && recorder.state !== "inactive") recorder.stop();
      } catch {
        // schon gestoppt
      }
      sitzung?.abbrechen();
      recorder = null;
      sitzung = null;
    };
    const starte = () => {
      if (aus) return;
      let neuerRecorder: MediaRecorder;
      try {
        neuerRecorder = new MediaRecorder(strom);
      } catch {
        return;
      }
      let geprueftBis = 0;
      let kandidat: string | null = null;
      let endgueltigBisher = "";
      const loeseAus = (aeusserung: string): void => {
        if (aus) return;
        // Hat Himbi dieses Wort gerade selbst gesagt (im klingenden oder vorigen
        // Satz), ist es das eigene Echo. Nicht die ganze Antwort: ein "halt"
        // irgendwo darin sperrte sonst jedes "Halt" bis zum Ende.
        const wort = stoppWortIn(aeusserung);
        const gerade = leseGerade();
        const zuletztGesagt = gerade ? `${gerade.satz ?? ""} ${gerade.vorher ?? ""}` : leseChatStand().antwort;
        if (wort && stoppWortIn(zuletztGesagt, wort)) return;
        kandidat = null;
        window.clearTimeout(kandidatUhr);
        geprueftBis = endgueltigBisher.length;
        if (leseFreigabeAnfrage()) {
          entscheideFreigabe(false);
          return;
        }
        aus = true;
        beendenRef.current();
      };
      const diese = starteLiveSitzung({
        sprache,
        zweck: "gespraech",
        beiStand: (stand) => {
          if (aus || sitzung !== diese) return;
          endgueltigBisher = stand.endgueltig;
          const neu = stand.endgueltig.slice(geprueftBis);
          const endgueltig = stoppIn(neu);
          if (endgueltig) return loeseAus(endgueltig);
          // Schneller: der vorlaeufige Text, wenn er STOPP_STABIL_MS lang ein reiner
          // Stoppbefehl bleibt. Der endgueltige kam im Test erst nach rund drei
          // Sekunden, und so lange lief die Fuehrung weiter.
          const vorlaeufig = stoppIn(stand.anzeige.slice(geprueftBis));
          if (vorlaeufig) {
            if (kandidat !== vorlaeufig) {
              kandidat = vorlaeufig;
              window.clearTimeout(kandidatUhr);
              kandidatUhr = window.setTimeout(() => {
                if (kandidat === vorlaeufig && sitzung === diese) loeseAus(vorlaeufig);
              }, STOPP_STABIL_MS);
            }
          } else {
            kandidat = null;
            window.clearTimeout(kandidatUhr);
          }
          // Ein abgeschlossener Satz ohne Stopp: der naechste beginnt dahinter.
          if (/[.!?…]\s*$/.test(neu) || neu.length > 160) geprueftBis = stand.endgueltig.length;
        },
        beiEndpunkt: () => {},
        beiScheitern: () => {
          if (aus || sitzung !== diese) return;
          stoppeTeil();
          versuche += 1;
          if (versuche <= 3) neustartUhr = window.setTimeout(starte, 600);
        },
      });
      recorder = neuerRecorder;
      sitzung = diese;
      neuerRecorder.ondataavailable = (e) => {
        if (e.data.size > 0 && sitzung === diese) diese.sende(e.data);
      };
      neuerRecorder.start(AUFNAHME_STUECK_MS);
    };
    starte();
    return () => {
      aus = true;
      window.clearTimeout(neustartUhr);
      stoppeTeil();
    };
  }, [himbiDran, sprache]);

  // Die Navigationsleiste wird unscharf, solange Kugel und Text links stehen
  // (Filter direkt auf der Leiste, siehe sprachmodus.css).
  useEffect(() => {
    if (!angedockt) return;
    const wurzel = document.documentElement;
    wurzel.setAttribute("data-sprach-links", "");
    return () => wurzel.removeAttribute("data-sprach-links");
  }, [angedockt]);

  const kugelZustand: KugelZustand =
    phase === "fehler" ? "fehler" : phase === "pausiert" ? "pausiert" : phase === "spricht" ? "spricht" : phase === "denkt" ? "denkt" : "hoert";
  // Der Zustand haengt nie an der Farbe allein (Rueckmeldung vom 25.09.2026:
  // "weiss anhand der Farbe nicht, ob die KI zuhoert, denkt oder spricht") -
  // dasselbe Symbol wie der Zustandstext daneben, unabhaengig vom Farbsehen.
  const StatusSymbol = STATUS_SYMBOL[kugelZustand];

  const ausgabePegel = { lesen: leseAusgabePegel };
  const statusText =
    phase === "startet" ? t("status.startet")
    : phase === "hoert" ? t("status.hoert")
    : phase === "versteht" ? t("status.versteht")
    : phase === "denkt" ? t("status.denkt")
    : phase === "spricht" ? t("status.spricht")
    : phase === "pausiert" ? t("status.pausiert")
    : t("status.fehler");
  const kugelBeschriftung = phase === "fehler" ? t("erneut") : assistentIstDran(phase) ? t("unterbrechen") : statusText;

  // Kugel + Knopf: identischer Inhalt in beiden Lagen (Mitte, links) - nur die
  // Groesse unterscheidet sich.
  const kugelKnopf = (
    <button
      type="button"
      onClick={beiKugelKlick}
      className="ki-sprachmodus__kugel-knopf"
      aria-label={kugelBeschriftung}
      title={kugelBeschriftung}
    >
      <SprachKugel zustand={kugelZustand} ausgabePegel={ausgabePegel} groesse={angedockt ? GROESSE_KLEIN : GROESSE_MITTE} />
    </button>
  );
  const statusZeile = (
    <p className="ki-sprachmodus__status">
      <StatusSymbol className={cn("ki-sprachmodus__status-symbol", kugelZustand === "denkt" && "ki-sprachmodus__status-symbol--dreht")} aria-hidden />
      {statusText}
    </p>
  );
  // Eine offene Freigabe (Klick- oder Aktionskarte, sprachmodus-bus.ts) geht
  // ÜBER allem anderen: sichtbar, auch wenn die Untertitel ausgeschaltet sind -
  // eine Sicherheitsfrage darf nie unsichtbar bleiben. "Ja"/"Nein" loest sie
  // auf (siehe die "versteht"-Auswertung oben, istZusageBefehl/istAbsageBefehl).
  const untertitel = freigabeAnfrage ? (
    <div className="ki-sprachmodus__untertitel ki-sprachmodus__untertitel--freigabe" role="alertdialog" aria-live="assertive">
      <p className="ki-sprachmodus__untertitel-zeile">{freigabeAnfrage.text}</p>
      <p className="ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer">{t("freigabeHinweis")}</p>
    </div>
  ) : untertitelAn ? (
    <div ref={untertitelRef} className="ki-sprachmodus__untertitel" aria-hidden={phase !== "hoert" && phase !== "versteht"}>
      {phase === "hoert" || phase === "versteht" ? (
        <p className="ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer">
          {zwischentext || (phase === "hoert" ? t("hoertZu") : "")}
        </p>
      ) : (chatStand.antwort || phase === "spricht" || phase === "denkt") ? (
        // Nie das rohe Markdown der Antwort ("**fett**", "1. ...") - das
        // stand bis zum 25.09.2026 unbereinigt im Untertitel, bei
        // laengeren Antworten kaum lesbar. Dieselbe Markdown-Darstellung
        // wie im sichtbaren Chat (Absaetze, Fettdruck, Listen).
        <div className="ki-sprachmodus__untertitel-zeile">
          <Markdown text={chatStand.antwort} />
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("titel")}
      className={cn("ki-sprachmodus", angedockt && "ki-sprachmodus--angedockt")}
    >
      <SprachSpotlight rechteck={zielRechteck} />

      {/* Statusansage fuer Screenreader - ohne den Fokus zu verschieben, ein zweiter Kanal
          neben der visuellen Kugel (siehe Recherche, Abschnitt Barrierefreiheit). */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusText}
      </p>

      {angedockt ? (
        // Links, vertikal mittig ueber der Navigationsleiste (nur diese wird
        // unscharf, siehe data-sprach-links in sprachmodus.css - die Mitte
        // bleibt frei und scharf). EIN Flex-Block fuer Kugel
        // und Text: waechst der Text nach unten, ruecken beide zusammen als
        // Einheit wieder mittig - die Kugel wandert dabei von selbst nach
        // oben (Rueckmeldung vom 25.09.2026). max-height haelt die Einheit
        // dabei immer im Rahmen der Navigationsleiste.
        <>
          <div className="ki-sprachmodus__links-spalte">
            <div className="ki-sprachmodus__kugel-huelle ki-sprachmodus__kugel-huelle--links">
              {kugelKnopf}
              {statusZeile}
            </div>
            {untertitel}
          </div>
        </>
      ) : (
        <>
          <div className="ki-sprachmodus__kugel-huelle">
            {kugelKnopf}
            {statusZeile}
          </div>
          {untertitel}
        </>
      )}

      {meldung ? <p className="ki-sprachmodus__meldung">{meldung}</p> : null}

      <div className="ki-sprachmodus__leiste">
        <button
          type="button"
          onClick={pausieren}
          aria-pressed={phase === "pausiert"}
          aria-label={phase === "fehler" ? t("erneut") : phase === "pausiert" ? t("fortsetzen") : t("stumm")}
          title={phase === "fehler" ? t("erneut") : phase === "pausiert" ? t("fortsetzen") : t("stumm")}
          className="ki-sprachmodus__knopf"
        >
          {phase === "pausiert" ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => setUntertitelAn((an) => !an)}
          aria-pressed={untertitelAn}
          aria-label={t("untertitel")}
          title={t("untertitel")}
          className={cn("ki-sprachmodus__knopf", untertitelAn && "ki-sprachmodus__knopf--aktiv")}
        >
          <Subtitles className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={beenden}
          aria-label={t("beenden")}
          title={t("beenden")}
          className="ki-sprachmodus__knopf ki-sprachmodus__knopf--beenden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
