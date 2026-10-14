"use client";

import { useCallback, useEffect } from "react";
import type { LiveSitzung } from "@/components/ki/diktat-live";
import { leseChatStand, leseFreigabeAnfrage, leseGerade, unterbrichChat } from "@/components/ki/sprachmodus-bus";
import { daempfeAusgabe, leseAusgabePegel } from "@/lib/ausgabe-pegel";
import { leseLautstaerke } from "@/lib/hoeren";
import {
  alsNachsatz,
  AUSGABE_GEDAEMPFT,
  EINSATZ_VORLAUF_MS,
  erzeugeEinsatzMerker,
  erzeugeUnterbrechungsWaechter,
  urteilNachVerdacht,
  VERDACHT_HOECHSTENS_MS,
  type UnterbrechungsArt,
  type VerdachtUrteil,
} from "@/lib/domain/sprachmodus";
import type { SprachAblauf, SprachGedaechtnis } from "@/components/ki/sprachmodus-gedaechtnis";

// Dazwischenreden im Sprachmodus (sprachmodus.tsx), seit dem 14.10.2026 eigene Hooks: der Verdacht (erste Stufe, Himbi
// spricht leiser) mit seiner Prüfung durch die Wörter (zweite Stufe) und der Lautstärke-Wächter, der ihn auslöst.
// useVerdacht hat keine Effekte und steht vor dem Ohr, weil dessen Rückrufe den Verdacht prüfen. Die Effekte des Wächters
// (useLautstaerkeWaechter) laufen wie bisher erst nach denen des Ohrs.

export interface Verdacht {
  beendeVerdacht: (lauter: boolean) => void;
  pruefeVerdacht: (sitzung: LiveSitzung, abschluss: "offen" | "endpunkt" | "frist") => VerdachtUrteil | null;
}

export function useVerdacht(ablauf: SprachAblauf, gedaechtnis: SprachGedaechtnis, unterbrecheHimbi: (art: UnterbrechungsArt) => void): Verdacht {
  const { dispatch, phaseRef } = ablauf;
  const {
    ohrRef,
    verdachtRef,
    verdachtTimerRef,
    hauptsprecherRef,
    grenzeMsRef,
    echoBisMsRef,
    sprichtSeitRef,
    offeneFrageRef,
    vorsatzRef,
    unterbrochenBeiRef,
    echoBeimUnterbrechenRef,
    grenzeStehtRef,
    nachUnterbrechungRef,
  } = gedaechtnis;

  /** Die erste Stufe endet. `lauter`: Himbi spricht weiter, also wieder in normaler Lautstaerke.
   *  Ohne (er verstummt gleich): leise bis zum Ende - sonst klaenge er im Moment zwischen
   *  Entscheidung und Stopp des Chats noch einmal laut auf. Die naechste Antwort beginnt in jedem
   *  Fall wieder normal (Effekt auf die Phase). */
  const beendeVerdacht = useCallback(
    (lauter: boolean) => {
      window.clearTimeout(verdachtTimerRef.current);
      if (!verdachtRef.current) return;
      verdachtRef.current = null;
      if (lauter) daempfeAusgabe(1);
    },
    [verdachtRef, verdachtTimerRef],
  );

  /** Zweite Stufe: entscheiden die Woerter seit dem Einsatz der Stimme schon (domain/sprachmodus.ts,
   *  Abschnitt 5)? "rueckmeldung": wieder lauter, Himbi spricht weiter. "unterbrechen": Himbi
   *  verstummt, die Woerter ab dem Einsatz sind die naechste Frage - in den ersten Sekunden der
   *  Antwort als Nachsatz zur vorigen. "warten": weiter leiser, bis mehr kommt. */
  const pruefeVerdacht = useCallback(
    (sitzung: LiveSitzung, abschluss: "offen" | "endpunkt" | "frist"): VerdachtUrteil | null => {
      const v = verdachtRef.current;
      if (!v || ohrRef.current?.sitzung !== sitzung || phaseRef.current !== "spricht") return null;
      // Erscheint waehrend des Verdachts eine Freigabekarte, ist Sprechen die Antwort darauf (wie
      // beim Waechter): kein Unterbrechen, das die Karte abbraeche. Himbi wieder normal laut.
      if (leseFreigabeAnfrage()) {
        beendeVerdacht(true);
        return null;
      }
      const woerter = sitzung.textAb(v.abMs).woerter;
      // Abgeschlossen ist die Aeusserung nach der Frist immer, an einem Endpunkt nur, wenn seit dem
      // Einsatz ueberhaupt ein Wort kam: sonst gehoert der Endpunkt noch zu Himbis Echo davor, und
      // die Aeusserung des Nutzers hat noch nicht einmal begonnen.
      const abgeschlossen = abschluss === "frist" || (abschluss === "endpunkt" && woerter.length > 0);
      const gerade = leseGerade();
      const gesagt = gerade ? `${gerade.satz ?? ""} ${gerade.vorher ?? ""}` : leseChatStand().antwort.slice(-200);
      const urteil = urteilNachVerdacht({ woerter, gesagt, abgeschlossen, hauptsprecher: hauptsprecherRef.current });
      if (urteil === "warten") return urteil;
      beendeVerdacht(urteil === "rueckmeldung");
      if (urteil === "rueckmeldung") return urteil;
      // Die naechste Frage beginnt am Einsatz der Stimme, auch wenn Himbi erst jetzt verstummt.
      grenzeMsRef.current = Math.max(grenzeMsRef.current, v.abMs);
      echoBisMsRef.current = grenzeMsRef.current;
      if (alsNachsatz({ sprichtSeitMs: sprichtSeitRef.current, jetztMs: performance.now(), offeneFrage: offeneFrageRef.current !== null })) {
        // Wie beim Weiterreden waehrend des Nachdenkens: die Antwort bricht ab, und am naechsten
        // Endpunkt geht die zusammengefuegte Frage an Stelle der alten hinaus.
        vorsatzRef.current = offeneFrageRef.current;
        offeneFrageRef.current = null;
        unterbrochenBeiRef.current = null;
        echoBeimUnterbrechenRef.current = gesagt;
        grenzeStehtRef.current = true;
        nachUnterbrechungRef.current = true;
        unterbrichChat();
        dispatch({ art: "unterbrechen" });
      } else {
        offeneFrageRef.current = null;
        unterbrecheHimbi("stimme");
      }
      return urteil;
    },
    [
      beendeVerdacht,
      dispatch,
      unterbrecheHimbi,
      echoBeimUnterbrechenRef,
      echoBisMsRef,
      grenzeMsRef,
      grenzeStehtRef,
      hauptsprecherRef,
      nachUnterbrechungRef,
      offeneFrageRef,
      ohrRef,
      phaseRef,
      sprichtSeitRef,
      unterbrochenBeiRef,
      verdachtRef,
      vorsatzRef,
    ],
  );

  return { beendeVerdacht, pruefeVerdacht };
}

// --- Dazwischenreden, waehrend Himbi spricht --------------------------------------------
//
// Neben den Befehlswoertern bleibt der Lautstaerke-Waechter: wer deutlich lauter als das
// Echo und laenger als einen Moment spricht, loest die erste Stufe aus (domain/sprachmodus.ts,
// Abschnitt 5): Himbi wird leiser, und die Woerter entscheiden (pruefeVerdacht, aus beiText,
// beiEndpunkt und spaetestens nach VERDACHT_HOECHSTENS_MS). Bis zum 05.10.2026 hielt der
// Waechter Himbi sofort an, auch fuer ein "Mhm" oder einen Kollegen im Raum (Rueckmeldung vom
// 05.10.2026). Was ab dem Einsatz der Stimme gesagt wurde, gehoert zur naechsten Frage. Der
// Tipp auf Himbi bleibt der sichere Weg (laute Halle).
export function useLautstaerkeWaechter(ablauf: SprachAblauf, gedaechtnis: SprachGedaechtnis, verdacht: Verdacht): void {
  const { phase, phaseRef } = ablauf;
  const { ohrRef, verdachtRef, verdachtTimerRef, grenzeMsRef, sprichtSeitRef, audioJetzt } = gedaechtnis;
  const { beendeVerdacht, pruefeVerdacht } = verdacht;

  useEffect(() => {
    if (phase !== "spricht") return;
    sprichtSeitRef.current = performance.now();
    let waechter = erzeugeUnterbrechungsWaechter();
    let bild = 0;
    // Wo die Stimme eingesetzt hat (domain/sprachmodus.ts, erzeugeEinsatzMerker): ueberdauert
    // die Kommapause in "Stopp, zeig mir ...", aber keine einzelne Geraeuschspitze.
    let einsatz = erzeugeEinsatzMerker();
    const schritt = () => {
      // Hat ein Befehlswort schon unterbrochen, laeuft dieser Takt bis zum Aufraeumen des
      // Effekts noch einmal: kein zweites Unterbrechen, das die Grenze hinter die ersten Worte
      // der neuen Frage schoebe (Messung vom 28.09.2026: aus "Stopp, zeig mir ..." wurde "mir ...").
      if (phaseRef.current !== "spricht") return;
      // Waehrend eine Freigabekarte wartet, ist lautes Sprechen die Antwort darauf ("Ja, bitte,
      // mach das"), kein Dazwischenreden: Unterbrechen wuerde die Karte ablehnen. Und solange der
      // Verdacht laeuft, entscheiden die Woerter, nicht der Pegel; danach misst der Waechter von
      // vorn, sonst zaehlte das "Mhm" von eben beim naechsten Mal noch mit.
      if (leseFreigabeAnfrage() || verdachtRef.current) {
        waechter = erzeugeUnterbrechungsWaechter();
        einsatz = erzeugeEinsatzMerker();
        bild = window.requestAnimationFrame(schritt);
        return;
      }
      const urteil = waechter.melde(leseLautstaerke(), leseAusgabePegel(), performance.now());
      const beginn = einsatz.melde(urteil, audioJetzt());
      if (urteil === "unterbrechen") {
        // Erste Stufe: leiser, nicht still. Die Frage beginnt erst, wenn die Woerter es bestaetigen.
        verdachtRef.current = { abMs: Math.max(grenzeMsRef.current, (beginn ?? audioJetzt()) - EINSATZ_VORLAUF_MS) };
        daempfeAusgabe(AUSGABE_GEDAEMPFT);
        window.clearTimeout(verdachtTimerRef.current);
        verdachtTimerRef.current = window.setTimeout(() => {
          const sitzung = ohrRef.current?.sitzung;
          if (!sitzung || pruefeVerdacht(sitzung, "frist") === null) beendeVerdacht(true);
        }, VERDACHT_HOECHSTENS_MS);
        // War die Erkennung schneller als der Pegel, liegen die Woerter schon vor.
        const sitzung = ohrRef.current?.sitzung;
        if (sitzung && pruefeVerdacht(sitzung, "offen") === "unterbrechen") return;
      }
      bild = window.requestAnimationFrame(schritt);
    };
    bild = window.requestAnimationFrame(schritt);
    return () => window.cancelAnimationFrame(bild);
  }, [phase, audioJetzt, beendeVerdacht, pruefeVerdacht, grenzeMsRef, ohrRef, phaseRef, sprichtSeitRef, verdachtRef, verdachtTimerRef]);

  // Verlaesst Himbi das Sprechen (fertig, Befehlswort, Tipp, Stumm), endet auch die erste Stufe.
  // Leise bleibt er bis dahin; die naechste Antwort beginnt wieder in normaler Lautstaerke - ab
  // "denkt" ist der Stopp der vorigen laengst durch (bei "spricht" direkt aus "hoert" ebenso).
  useEffect(() => {
    if (phase !== "spricht") {
      sprichtSeitRef.current = null;
      beendeVerdacht(false);
    }
    if (phase === "denkt" || (phase === "spricht" && !verdachtRef.current)) daempfeAusgabe(1);
  }, [phase, beendeVerdacht, sprichtSeitRef, verdachtRef]);
}
