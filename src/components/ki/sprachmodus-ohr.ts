"use client";

import { useCallback, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { starteLiveSitzung, type LiveSitzung } from "@/components/ki/diktat-live";
import { daempfeAusgabe } from "@/lib/ausgabe-pegel";
import { starteHoeren, stoppeHoeren } from "@/lib/hoeren";
import { AUFNAHME_STUECK_MS, AUFNAHME_VORGABEN } from "@/lib/domain/diktat";
import { assistentIstDran, nachSitzungsAbbruch, NEUVERSUCH_MS, ohrOffen, STILLE_BIS_STUMM_MS } from "@/lib/domain/sprachmodus";
import type { SprachAblauf, SprachGedaechtnis } from "@/components/ki/sprachmodus-gedaechtnis";
import type { Erkennung } from "@/components/ki/sprachmodus-erkennung";

// Mikrofon und Ohr des Sprachmodus (sprachmodus.tsx), seit dem 14.10.2026 eigene Hooks: der Mikrofonstrom für die ganze
// Sitzung, die eine Aufnahme mit ihrer Live-Sitzung, Neuversuche nach einem Abbruch, das Stummschalten nach langer Stille
// und das Schließen von allem, wenn der Sprachmodus endet.

/** Wie das Mikrofon im Gespraech geoeffnet wird: wie beim Diktat, aber MIT
 *  Echounterdrueckung. Beim Diktat verstummt jede Wiedergabe, solange das
 *  Mikrofon offen ist; hier spricht Himbi, waehrend das Mikrofon offen bleibt
 *  (Dazwischenreden, siehe erzeugeUnterbrechungsWaechter). Ohne Filter hoerte
 *  das Mikrofon die Stimme aus dem Lautsprecher mit.
 *
 *  Seit dem 05.10.2026 "all" statt true: Chrome ab 141 rechnet damit auch Ton anderer
 *  Programme aus dem Mikrofon heraus (ein Anruf, Musik, ein Video im Nachbartab - "Ton von
 *  anderen", Rueckmeldung vom 05.10.2026), sonst nur den eigenen. Browser ohne diesen Wert
 *  (Firefox, Safari, aeltere Chrome) lesen den Text nach WebIDL als true, also wie bisher. */
const GESPRAECH_AUFNAHME = { ...AUFNAHME_VORGABEN, echoCancellation: "all" } as unknown as MediaTrackConstraints;

// --- Mikrofon: einmal geoeffnet, bleibt fuer die ganze Sitzung offen -----------------
//
// Anders als beim Diktatknopf (mikrofon.tsx) wird der Mikrofonstrom hier NICHT je
// Aeusserung neu geoeffnet: staendiges Oeffnen/Schliessen laesst auf iOS die
// Audiosession zwischen "nur Wiedergabe" und "Aufnahme und Wiedergabe" wechseln, und die
// erste Antwort nach dem Wiederoeffnen kommt dann stumm ueber den Hoerer statt den
// Lautsprecher. Die Aufnahme darauf (MediaRecorder) laeuft seit dem 28.09.2026 ebenfalls
// durchgehend, EINE fuers ganze Gespraech (siehe starteOhr).
// Ist der Strom schon offen (Neustart nach einem Fehler), fuehrt erneutVersuchen() selbst
// weiter - hier wird nur geoeffnet, was noch nicht offen ist.
export function useMikrofon(ablauf: SprachAblauf, gedaechtnis: SprachGedaechtnis): void {
  const t = useTranslations("kiAssistentAnsicht.sprachmodus");
  const { phase, dispatch, zeigeMeldung } = ablauf;
  const { stromRef } = gedaechtnis;

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
        // Der Schein hinter Himbi reagiert auf die eigene Stimme (lib/hoeren.ts), und das Dazwischenreden
        // misst dort die Lautstaerke.
        starteHoeren(strom);
        dispatch({ art: "mikrofon-bereit" });
      } catch {
        if (abgebrochen) return;
        zeigeMeldung({ text: t("keinZugriff"), fehlerzustand: true });
        dispatch({ art: "fehler" });
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [phase, dispatch, t, zeigeMeldung, stromRef]);
}

// --- Das Ohr: eine Aufnahme, eine Live-Sitzung fuer das ganze Gespraech ------------------
//
// Bis zum 28.09.2026 begann jede Aeusserung eine eigene Aufnahme und Verbindung, die am
// Endpunkt schloss; waehrend Himbi dachte und sprach, lief nur ein Stoppwort-Waechter mit
// einer zweiten Verbindung. Das kostete vor jeder Frage das Warten auf den Abschluss der
// Sitzung, und was zwischen zwei Aufnahmen gesagt wurde, ging verloren: aus "Ja." ...
// "und zeig mir bitte die Lieferungen" wurde "Ja." (Rueckmeldung und Messung vom
// 28.09.2026). Jetzt hoert EINE Verbindung durchgehend zu, und eine Grenze im Audio
// (grenzeMs) trennt, was zur naechsten Frage gehoert:
//   - Zuhoeren: am Endpunkt ist alles ab der Grenze die Frage, sofort - die Woerter vor
//     dem Endpunkt sind schon endgueltig, auf das Ende der Sitzung wird nicht gewartet.
//   - Nachdenken: spricht der Nutzer weiter, bricht die Anfrage ab, und seine Worte
//     werden an die Frage angehaengt (Nachsatz).
//   - Sprechen: Befehlswoerter ("Stopp", "Moment", "Himbi" ...) unterbrechen, Himbis
//     eigene Worte (Echo) nicht. Was nach dem Befehl kommt, ist die naechste Frage.
export function useSprachOhr(ablauf: SprachAblauf, gedaechtnis: SprachGedaechtnis, erkennung: Erkennung, beendeVerdacht: (lauter: boolean) => void): void {
  const t = useTranslations("kiAssistentAnsicht.sprachmodus");
  const sprache = useLocale();
  const { phase, phaseRef, dispatch, zeigeMeldung } = ablauf;
  const {
    ohrRef,
    stromRef,
    grenzeMsRef,
    echoBisMsRef,
    befehlGeprueftMsRef,
    grenzeStehtRef,
    hauptsprecherRef,
    freigabeAbMsRef,
    zuletztGehoertRef,
    starteOhrRef,
    schliesseOhr,
  } = gedaechtnis;
  const { beiText, beiEndpunkt } = erkennung;
  const beiScheitern = useBeiScheitern(ablauf, gedaechtnis);

  // Die Rueckrufe der Sitzung lesen immer die neueste Fassung (die Sitzung lebt laenger als
  // ein Rendern).
  const rueckrufe = useRef({ beiText, beiEndpunkt, beiScheitern });
  useEffect(() => {
    rueckrufe.current = { beiText, beiEndpunkt, beiScheitern };
  }, [beiText, beiEndpunkt, beiScheitern]);

  const starteOhr = useCallback(() => {
    if (ohrRef.current) return;
    const strom = stromRef.current;
    if (!strom) return;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(strom);
    } catch {
      // Nicht mitten im Effekt, der das Ohr startet, den Zustand umwerfen.
      queueMicrotask(() => {
        zeigeMeldung({ text: t("keinZugriff"), fehlerzustand: true });
        dispatch({ art: "fehler" });
      });
      return;
    }
    const startPerf = performance.now();
    let sitzung: LiveSitzung | null = null;
    sitzung = starteLiveSitzung({
      sprache,
      zweck: "gespraech",
      beiStand: () => {
        if (sitzung) rueckrufe.current.beiText(sitzung);
      },
      beiEndpunkt: () => {
        if (sitzung) rueckrufe.current.beiEndpunkt(sitzung);
      },
      // Scheitert die Sitzung (Schluessel, Verbindung, Dienst), wird neu verbunden - ohne
      // diesen Weg hoerte der Sprachmodus endlos zu, ohne je etwas zu verstehen.
      beiScheitern: (grund) => {
        if (sitzung) rueckrufe.current.beiScheitern(sitzung, grund, startPerf);
      },
    });
    const diese = sitzung;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ohrRef.current?.sitzung === diese) diese.sende(e.data);
    };
    recorder.start(AUFNAHME_STUECK_MS);
    ohrRef.current = { recorder, sitzung: diese, startPerf };
    grenzeMsRef.current = 0;
    echoBisMsRef.current = 0;
    befehlGeprueftMsRef.current = 0;
    grenzeStehtRef.current = false;
    // Neue Sitzung, neue Audiozeit und neue Sprechernummern: ein offener Verdacht und der
    // Hauptsprecher gehoeren zur alten.
    beendeVerdacht(true);
    hauptsprecherRef.current = null;
    // Neue Sitzung, neue Audiozeit ab 0: eine offene Karte stand schon vorher.
    if (freigabeAbMsRef.current !== null) freigabeAbMsRef.current = 0;
    zuletztGehoertRef.current = performance.now();
  }, [
    sprache,
    beendeVerdacht,
    dispatch,
    t,
    zeigeMeldung,
    befehlGeprueftMsRef,
    echoBisMsRef,
    freigabeAbMsRef,
    grenzeMsRef,
    grenzeStehtRef,
    hauptsprecherRef,
    ohrRef,
    stromRef,
    zuletztGehoertRef,
  ]);
  useEffect(() => {
    starteOhrRef.current = starteOhr;
  }, [starteOhr, starteOhrRef]);

  // Offen, solange das Gespraech laeuft (auch waehrend Himbi denkt und spricht); zu im
  // Stumm- und Fehlerzustand.
  useEffect(() => {
    if (ohrOffen(phase)) starteOhr();
    else if (phase === "pausiert" || phase === "fehler") schliesseOhr();
  }, [phase, starteOhr, schliesseOhr]);

  // Beim Zuhoeren nach langer Stille stumm schalten (vorher erledigte das die 2-Minuten-Grenze
  // jeder Sitzung, die es im Gespraech nicht mehr gibt).
  useEffect(() => {
    if (phase !== "hoert") return;
    zuletztGehoertRef.current = performance.now();
    const uhr = window.setInterval(() => {
      if (phaseRef.current === "hoert" && performance.now() - zuletztGehoertRef.current > STILLE_BIS_STUMM_MS) {
        schliesseOhr();
        dispatch({ art: "pausieren" });
      }
    }, 5_000);
    return () => window.clearInterval(uhr);
  }, [phase, dispatch, schliesseOhr, phaseRef, zuletztGehoertRef]);
}

/** Die Live-Sitzung ist gescheitert (Schlüssel, Verbindung, Dienst, lange Stille): neu verbinden, stumm schalten oder aufgeben. */
function useBeiScheitern(ablauf: SprachAblauf, gedaechtnis: SprachGedaechtnis) {
  const t = useTranslations("kiAssistentAnsicht.sprachmodus");
  const { phaseRef, dispatch, zeigeMeldung, setZwischentext } = ablauf;
  const { ohrRef, neuTimerRef, fehlversucheRef, starteOhrRef, schliesseOhr } = gedaechtnis;

  return useCallback(
    (sitzung: LiveSitzung, grund: string, startPerf: number) => {
      if (ohrRef.current?.sitzung !== sitzung) return;
      schliesseOhr();
      setZwischentext("");
      const { weiter, fehlversuche: neu } = nachSitzungsAbbruch({
        grund,
        dauerMs: performance.now() - startPerf,
        gehoert: sitzung.hatGehoert(),
        fehlversucheBisher: fehlversucheRef.current,
      });
      fehlversucheRef.current = neu;
      if (weiter === "nicht-eingerichtet") {
        zeigeMeldung({ text: t("liveFehlt"), fehlerzustand: true });
        dispatch({ art: "fehler" });
      } else if (weiter === "aufgeben") {
        zeigeMeldung({ text: t("verbindungFehlt"), fehlerzustand: true });
        dispatch({ art: "fehler" });
      } else if (weiter === "stumm" && !assistentIstDran(phaseRef.current)) {
        // Lange nichts gehoert: stumm schalten, statt weiter Stille an die Erkennung zu
        // schicken. Ein Tipp auf den Mikrofonknopf setzt fort.
        dispatch({ art: "pausieren" });
      } else {
        window.clearTimeout(neuTimerRef.current);
        neuTimerRef.current = window.setTimeout(() => {
          if (ohrOffen(phaseRef.current)) starteOhrRef.current();
        }, NEUVERSUCH_MS);
      }
    },
    [dispatch, schliesseOhr, t, zeigeMeldung, setZwischentext, fehlversucheRef, neuTimerRef, ohrRef, phaseRef, starteOhrRef],
  );
}

// Alles schliessen, wenn der Sprachmodus endet.
export function useAbbau(gedaechtnis: SprachGedaechtnis, beendeVerdacht: (lauter: boolean) => void): void {
  const { ruheTimerRef, neuTimerRef, stromRef, schliesseOhr } = gedaechtnis;
  useEffect(
    () => () => {
      window.clearTimeout(ruheTimerRef.current);
      window.clearTimeout(neuTimerRef.current);
      // Endet der Sprachmodus mitten in oder kurz nach der ersten Stufe, liest der Chat danach
      // wieder in normaler Lautstaerke vor.
      beendeVerdacht(false);
      daempfeAusgabe(1);
      schliesseOhr();
      stromRef.current?.getTracks().forEach((s) => s.stop());
      stromRef.current = null;
      stoppeHoeren();
    },
    [beendeVerdacht, schliesseOhr, neuTimerRef, ruheTimerRef, stromRef],
  );
}
