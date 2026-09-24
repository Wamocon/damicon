"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mic, MicOff, Subtitles, X } from "lucide-react";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { SprachKugel, type KugelZustand } from "@/components/ki/sprach-kugel";
import { SprachSpotlight, useHervorhebungsRechteck, useKugelPlatz } from "@/components/ki/sprach-spotlight";
import {
  abonniereSprachBus,
  chatStandServer,
  entsperreTon,
  erteileEinwilligung,
  leseChatStand,
  stelleSprachFrage,
  unterbrichChat,
} from "@/components/ki/sprachmodus-bus";
import { leseAusgabePegel } from "@/lib/ausgabe-pegel";
import {
  antwortFertig,
  assistentIstDran,
  naechstePhase,
  nimmtAuf,
  RUHE_VOR_ZUHOEREN_MS,
  type Phase,
} from "@/lib/domain/sprachmodus";
import {
  AUFNAHME_STUECK_MS,
  AUFNAHME_VORGABEN,
} from "@/lib/domain/diktat";
import { starteLiveSitzung, type LiveSitzung } from "@/components/ki/diktat-live";
import { cn } from "@/lib/utils";
import { useSyncExternalStore } from "react";

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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const stromRef = useRef<MediaStream | null>(null);
  const ruheTimer = useRef<number | undefined>(undefined);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const chatStand = useSyncExternalStore(abonniereSprachBus, leseChatStand, chatStandServer);
  const chatStandRef = useRef(chatStand);
  chatStandRef.current = chatStand;

  const dispatch = useCallback((ereignis: Parameters<typeof naechstePhase>[1]) => {
    setPhase((bisher) => {
      const neu = naechstePhase(bisher, ereignis);
      return neu === bisher ? bisher : neu;
    });
  }, []);

  // --- Mikrofon: einmal geoeffnet, bleibt fuer die ganze Sitzung offen -----------------
  //
  // Anders als beim Diktatknopf (mikrofon.tsx) wird das Mikrofon hier NICHT je Aeusserung
  // neu geoeffnet: staendiges Oeffnen/Schliessen laesst auf iOS die Audiosession zwischen
  // "nur Wiedergabe" und "Aufnahme und Wiedergabe" wechseln, und die erste Antwort nach dem
  // Wiederoeffnen kommt dann stumm ueber den Hoerer statt den Lautsprecher (siehe Recherche,
  // Abschnitt iOS-Audiosession). Waehrend der Assistent dran ist, wird nur das SENDEN der
  // Sitzung pausiert (recorder.pause()), nicht der Strom geschlossen.
  useEffect(() => {
    let abgebrochen = false;
    void (async () => {
      try {
        const strom = await navigator.mediaDevices.getUserMedia({ audio: AUFNAHME_VORGABEN });
        if (abgebrochen) {
          strom.getTracks().forEach((s) => s.stop());
          return;
        }
        stromRef.current = strom;
        const recorder = new MediaRecorder(strom);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) liveRef.current?.sende(e.data);
        };
        recorderRef.current = recorder;
        recorder.start(AUFNAHME_STUECK_MS);
        dispatch({ art: "mikrofon-bereit" });
      } catch {
        setMeldung(t("keinZugriff"));
        dispatch({ art: "fehler" });
      }
    })();
    return () => {
      abgebrochen = true;
      recorderRef.current?.stop();
      stromRef.current?.getTracks().forEach((s) => s.stop());
      liveRef.current?.abbrechen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Eine Aeusserung: eine Live-Sitzung ------------------------------------------------
  const beginneAeusserung = useCallback(() => {
    if (liveRef.current) return;
    setZwischentext("");
    liveRef.current = starteLiveSitzung({
      sprache,
      zweck: "gespraech",
      beiStand: (stand) => setZwischentext(stand.anzeige),
      beiEndpunkt: () => dispatch({ art: "aeusserung-ende" }),
    });
  }, [sprache, dispatch]);

  useEffect(() => {
    if (nimmtAuf(phase)) beginneAeusserung();
  }, [phase, beginneAeusserung]);

  // Aeusserung zu Ende: die laufende Sitzung abschliessen und, wenn etwas dabei
  // herauskam, als Frage an den Chat weiterreichen (sprachmodus-bus.ts).
  useEffect(() => {
    if (phase !== "versteht") return;
    const sitzung = liveRef.current;
    liveRef.current = null;
    if (!sitzung) {
      dispatch({ art: "nichts-gehoert" });
      return;
    }
    void sitzung.beende().then((ergebnis) => {
      setZwischentext("");
      if (ergebnis.ok && ergebnis.text) {
        stelleSprachFrage(ergebnis.text, ergebnis.sprachen);
        dispatch({ art: "frage-gestellt" });
      } else {
        if (!ergebnis.ok) console.warn("[damicon] Sprachmodus: Aeusserung nicht erkannt:", ergebnis.grund);
        dispatch({ art: "nichts-gehoert" });
      }
    });
  }, [phase, dispatch]);

  // Waehrend der Assistent dran ist (denkt/spricht), sendet die Aufnahme nichts - sonst
  // hoerte die Erkennung die eigene Stimme aus dem Lautsprecher (Halbduplex, siehe
  // domain/sprachmodus.ts). Der Mikrofonstrom selbst bleibt offen (siehe oben).
  useEffect(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (assistentIstDran(phase) && recorder.state === "recording") recorder.pause();
    else if (phase === "hoert" && recorder.state === "paused") recorder.resume();
  }, [phase]);

  // --- An den Chat-Zustand gekoppelt: denkt -> spricht -> wieder zuhoeren ---------------
  useEffect(() => {
    if (phaseRef.current !== "denkt" && phaseRef.current !== "spricht") return;
    if (chatStand.einwilligungFehlt) {
      erteileEinwilligung();
      return;
    }
    if (chatStand.fehler) {
      setMeldung(tAktion("fehler.unbekannt"));
      dispatch({ art: "unterbrechen" });
      return;
    }
    const spricht = chatStand.spricht || chatStand.laedt;
    if (spricht && phaseRef.current === "denkt") dispatch({ art: "antwort-spricht" });
    if (!spricht && antwortFertig(chatStand)) {
      window.clearTimeout(ruheTimer.current);
      // Kurze Gnadenfrist: zwischen Streamende und dem Anstoss des Vorlesens liegt ein
      // Renderdurchlauf, ohne diese Pause hoerte die Kugel genau in diese Luecke hinein zu.
      ruheTimer.current = window.setTimeout(() => dispatch({ art: "antwort-fertig" }), RUHE_VOR_ZUHOEREN_MS);
    }
    return () => window.clearTimeout(ruheTimer.current);
  }, [chatStand, dispatch, tAktion]);

  useEffect(() => () => window.clearTimeout(ruheTimer.current), []);

  // --- Bedienung --------------------------------------------------------------------------
  const beiKugelKlick = useCallback(() => {
    entsperreTon();
    if (assistentIstDran(phaseRef.current)) {
      unterbrichChat();
      dispatch({ art: "unterbrechen" });
    }
  }, [dispatch]);

  const beenden = useCallback(() => {
    if (assistentIstDran(phaseRef.current)) unterbrichChat();
    liveRef.current?.abbrechen();
    beendeSprachmodus();
  }, [beendeSprachmodus]);

  const pausieren = useCallback(() => {
    if (phaseRef.current === "pausiert") {
      dispatch({ art: "fortsetzen" });
    } else {
      if (assistentIstDran(phaseRef.current)) unterbrichChat();
      liveRef.current?.abbrechen();
      liveRef.current = null;
      dispatch({ art: "pausieren" });
    }
  }, [dispatch]);

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

  const ausgabePegel = { lesen: leseAusgabePegel };
  const statusText =
    phase === "startet" ? t("status.startet")
    : phase === "hoert" ? t("status.hoert")
    : phase === "versteht" ? t("status.versteht")
    : phase === "denkt" ? t("status.denkt")
    : phase === "spricht" ? t("status.spricht")
    : phase === "pausiert" ? t("status.pausiert")
    : t("status.fehler");

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
          aria-label={assistentIstDran(phase) ? t("unterbrechen") : statusText}
          title={assistentIstDran(phase) ? t("unterbrechen") : undefined}
        >
          <SprachKugel
            zustand={kugelZustand}
            ausgabePegel={ausgabePegel}
            groesse={verschoben ? GROESSE_KLEIN : GROESSE_MITTE}
          />
        </button>
        {!verschoben ? <p className="ki-sprachmodus__status">{statusText}</p> : null}
      </div>

      {!verschoben && untertitelAn ? (
        <div className="ki-sprachmodus__untertitel" aria-hidden={phase !== "hoert" && phase !== "versteht"}>
          {phase === "hoert" || phase === "versteht" ? (
            <p className="ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer">
              {zwischentext || (phase === "hoert" ? t("hoertZu") : "")}
            </p>
          ) : (chatStand.antwort || phase === "spricht" || phase === "denkt") ? (
            <p className="ki-sprachmodus__untertitel-zeile">{chatStand.antwort}</p>
          ) : null}
        </div>
      ) : null}

      {meldung ? <p className="ki-sprachmodus__meldung">{meldung}</p> : null}

      <div className="ki-sprachmodus__leiste">
        <button
          type="button"
          onClick={pausieren}
          aria-pressed={phase === "pausiert"}
          aria-label={phase === "pausiert" ? t("fortsetzen") : t("stumm")}
          title={phase === "pausiert" ? t("fortsetzen") : t("stumm")}
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
