"use client";

import { useCallback, useEffect, useState } from "react";
import { entsperreTon, unterbrichChat } from "@/components/ki/sprachmodus-bus";
import { assistentIstDran, UNTERTITEL_SCHLUESSEL, untertitelAusSpeicher, type UnterbrechungsArt } from "@/lib/domain/sprachmodus";
import type { SprachAblauf, SprachGedaechtnis } from "@/components/ki/sprachmodus-gedaechtnis";

// Bedienung des Sprachmodus (sprachmodus.tsx), seit dem 14.10.2026 eigene Hooks: der Schalter für den mitlaufenden Text,
// Tipp auf Himbi, Stumm, Beenden und die Tasten.

function leseUntertitelWunsch(): boolean {
  try {
    return untertitelAusSpeicher(window.localStorage.getItem(UNTERTITEL_SCHLUESSEL));
  } catch {
    return false;
  }
}

/** Mitlaufender Text: ob er an ist, und der Schalter dafür. */
export function useUntertitelWunsch(): [boolean, () => void] {
  // Mitlaufender Text: standardmaessig aus, die Wahl merkt sich der Browser
  // (domain/sprachmodus.ts, untertitelAusSpeicher). Der Sprachmodus wird nur im Browser
  // eingehaengt, der Speicher ist beim ersten Rendern also lesbar.
  const [untertitelAn, setUntertitelAn] = useState(leseUntertitelWunsch);
  const schalteUntertitel = () => {
    const neu = !untertitelAn;
    setUntertitelAn(neu);
    try {
      window.localStorage.setItem(UNTERTITEL_SCHLUESSEL, neu ? "an" : "aus");
    } catch {
      // Speicher gesperrt: gilt dann nur fuer diese Sitzung.
    }
  };
  return [untertitelAn, schalteUntertitel];
}

interface SprachBedienung {
  beiFigurKlick: () => void;
  beenden: () => void;
  pausieren: () => void;
}

// --- Bedienung --------------------------------------------------------------------------
export function useSprachBedienung(
  ablauf: SprachAblauf,
  gedaechtnis: SprachGedaechtnis,
  unterbrecheHimbi: (art: UnterbrechungsArt) => void,
  beendeSprachmodus: () => void,
): SprachBedienung {
  const { phaseRef, dispatch, setZwischentext } = ablauf;
  const { stromRef, fehlversucheRef, offeneFrageRef, vorsatzRef, grenzeMsRef, neuTimerRef, beendenRef, audioJetzt, schliesseOhr } = gedaechtnis;

  const erneutVersuchen = useCallback(() => {
    fehlversucheRef.current = 0;
    // fehler -> startet (die Meldung verschwindet dabei, meldungNachEreignis); ist das Mikrofon
    // noch offen, gleich weiter zum Zuhoeren, sonst oeffnet der Effekt fuer "startet" es neu.
    dispatch({ art: "fortsetzen" });
    if (stromRef.current) dispatch({ art: "mikrofon-bereit" });
  }, [dispatch, fehlversucheRef, stromRef]);

  const beiFigurKlick = useCallback(() => {
    entsperreTon();
    if (phaseRef.current === "fehler") {
      erneutVersuchen();
      return;
    }
    if (assistentIstDran(phaseRef.current)) {
      offeneFrageRef.current = null;
      unterbrecheHimbi("tipp");
      // Per Tipp: der Nutzer hat nichts gesagt, alles bis jetzt war Himbis Echo.
      grenzeMsRef.current = Math.max(grenzeMsRef.current, audioJetzt());
    }
  }, [audioJetzt, erneutVersuchen, unterbrecheHimbi, grenzeMsRef, offeneFrageRef, phaseRef]);

  const beenden = useCallback(() => {
    if (assistentIstDran(phaseRef.current)) unterbrichChat();
    schliesseOhr();
    beendeSprachmodus();
  }, [beendeSprachmodus, schliesseOhr, phaseRef]);
  useEffect(() => {
    beendenRef.current = beenden;
  }, [beenden, beendenRef]);

  const pausieren = useCallback(() => {
    if (phaseRef.current === "fehler") {
      erneutVersuchen();
    } else if (phaseRef.current === "pausiert") {
      dispatch({ art: "fortsetzen" });
    } else {
      if (assistentIstDran(phaseRef.current)) unterbrichChat();
      window.clearTimeout(neuTimerRef.current);
      schliesseOhr();
      vorsatzRef.current = null;
      offeneFrageRef.current = null;
      setZwischentext("");
      dispatch({ art: "pausieren" });
    }
  }, [dispatch, erneutVersuchen, schliesseOhr, setZwischentext, neuTimerRef, offeneFrageRef, phaseRef, vorsatzRef]);

  // Escape beendet, wie bei der Buehne des Panels (ki-pane-kontext.tsx).
  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") beenden();
      else if (e.key === " " && assistentIstDran(phaseRef.current)) {
        e.preventDefault();
        beiFigurKlick();
      }
    };
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, [beenden, beiFigurKlick, phaseRef]);

  return { beiFigurKlick, beenden, pausieren };
}
