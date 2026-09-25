"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Ear, Loader2, Mic, MicOff, Subtitles, Volume2, X } from "lucide-react";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { SprachKugel, type KugelZustand } from "@/components/ki/sprach-kugel";
import { SprachSpotlight, useHervorhebungsRechteck, useKugelPlatz } from "@/components/ki/sprach-spotlight";
import {
  abonniereSprachBus,
  chatStandServer,
  entsperreTon,
  leseChatStand,
  stelleSprachFrage,
  unterbrichChat,
} from "@/components/ki/sprachmodus-bus";
import { leseAusgabePegel } from "@/lib/ausgabe-pegel";
import { leseLautstaerke, starteHoeren, stoppeHoeren } from "@/lib/hoeren";
import {
  antwortFertig,
  assistentIstDran,
  erzeugeUnterbrechungsWaechter,
  nachSitzungsAbbruch,
  naechstePhase,
  NEUVERSUCH_MS,
  nimmtAuf,
  RUHE_VOR_ZUHOEREN_MS,
  type Phase,
} from "@/lib/domain/sprachmodus";
import { AUFNAHME_STUECK_MS, AUFNAHME_VORGABEN } from "@/lib/domain/diktat";
import { textFuerSprachausgabe } from "@/lib/domain/sprachausgabe";
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
const GROESSE_KLEIN = 96;
const RAENDER = { oben: 72, rechts: 16, unten: 16, links: 16 };

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
        if (ergebnis.ok && ergebnis.text) {
          fehlversuche.current = 0;
          stelleSprachFrage(ergebnis.text, ergebnis.sprachen);
          dispatch({ art: "frage-gestellt" });
        } else {
          if (!ergebnis.ok) console.warn("[damicon] Sprachmodus: Aeusserung nicht erkannt:", ergebnis.grund);
          dispatch({ art: "nichts-gehoert" });
        }
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
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", beiTaste);
      document.body.style.overflow = vorher;
    };
  }, [beenden, beiKugelKlick]);

  // --- Kugel-Platzierung: Mitte, oder klein an den Rand bei Hervorhebung ----------------
  const zielRechteck = useHervorhebungsRechteck();
  const kugelPlatz = useKugelPlatz(zielRechteck, { breite: GROESSE_KLEIN, hoehe: GROESSE_KLEIN }, RAENDER);
  const verschoben = kugelPlatz !== null;

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("titel")}
      className={cn("ki-sprachmodus", verschoben && "ki-sprachmodus--verschoben")}
    >
      <div className="ki-sprachmodus__hintergrund" />
      <SprachSpotlight rechteck={zielRechteck} />

      {/* Statusansage fuer Screenreader - ohne den Fokus zu verschieben, ein zweiter Kanal
          neben der visuellen Kugel (siehe Recherche, Abschnitt Barrierefreiheit). */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusText}
      </p>

      <div
        className="ki-sprachmodus__kugel-huelle"
        style={
          kugelPlatz
            ? {
                left: kugelPlatz.rechteck.x,
                top: kugelPlatz.rechteck.y,
                width: kugelPlatz.rechteck.breite,
                height: kugelPlatz.rechteck.hoehe,
              }
            : undefined
        }
      >
        <button
          type="button"
          onClick={beiKugelKlick}
          className="ki-sprachmodus__kugel-knopf"
          aria-label={kugelBeschriftung}
          title={phase === "fehler" || assistentIstDran(phase) ? kugelBeschriftung : undefined}
        >
          <SprachKugel
            zustand={kugelZustand}
            ausgabePegel={ausgabePegel}
            groesse={verschoben ? GROESSE_KLEIN : GROESSE_MITTE}
          />
        </button>
        {!verschoben ? (
          <p className="ki-sprachmodus__status">
            <StatusSymbol
              className={cn("ki-sprachmodus__status-symbol", kugelZustand === "denkt" && "ki-sprachmodus__status-symbol--dreht")}
              aria-hidden
            />
            {statusText}
          </p>
        ) : null}
      </div>

      {!verschoben && untertitelAn ? (
        <div className="ki-sprachmodus__untertitel" aria-hidden={phase !== "hoert" && phase !== "versteht"}>
          {phase === "hoert" || phase === "versteht" ? (
            <p className="ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer">
              {zwischentext || (phase === "hoert" ? t("hoertZu") : "")}
            </p>
          ) : (chatStand.antwort || phase === "spricht" || phase === "denkt") ? (
            // Nie das rohe Markdown der Antwort ("**fett**", "1. ...") - das
            // stand bis zum 25.09.2026 unbereinigt im Untertitel, bei
            // laengeren Antworten kaum lesbar. Dieselbe Aufbereitung wie
            // fuers Vorlesen: der Untertitel zeigt, was auch gesagt wird.
            <p className="ki-sprachmodus__untertitel-zeile">{textFuerSprachausgabe(chatStand.antwort)}</p>
          ) : null}
        </div>
      ) : null}

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
