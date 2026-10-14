"use client";

import { useCallback } from "react";
import type { LiveSitzung } from "@/components/ki/diktat-live";
import { entscheideFreigabe, leseChatStand, leseFreigabeAnfrage, leseGerade, unterbrichChat } from "@/components/ki/sprachmodus-bus";
import {
  aeusserungsBeginn,
  assistentIstDran,
  befehlBeiOffenerKarte,
  befehlGeprueftBis,
  befehlOhneEcho,
  befehlsBeginn,
  befehlsWortIn,
  beendetWirklich,
  freigabeAntwortMitEcho,
  fuegeZusammen,
  istBeendenBefehl,
  istGesprochen,
  istNachsatz,
} from "@/lib/domain/sprachmodus";
import type { SprachAblauf, SprachGedaechtnis } from "@/components/ki/sprachmodus-gedaechtnis";
import type { SprachFragen } from "@/components/ki/sprachmodus-fragen";
import type { Verdacht } from "@/components/ki/sprachmodus-verdacht";

// Was die Live-Erkennung im Sprachmodus (sprachmodus.tsx) meldet, seit dem 14.10.2026 ein eigener Hook: neuer Text (Befehle,
// Nachsatz, Verdacht) und das Ende einer Äußerung (Freigabe, Echo, Frage). Das Ohr (sprachmodus-ohr.ts) ruft beide über
// seine Rückrufe auf.

/** So lange muss ein vorlaeufig erkanntes Befehlswort ("Stopp") stehen bleiben, bevor es
 *  Himbi anhaelt (kurz genug, um sofort zu wirken, lang genug, dass ein vorlaeufiges Wort,
 *  das die Erkennung gleich korrigiert, nichts ausloest). Bis zum 28.09.2026 galt das fuer
 *  einen eigenen Stoppwort-Waechter, heute fuer die Befehlssuche im durchgehenden Ohr. */
const STOPP_STABIL_MS = 350;
/** Spielraum zwischen dem Erscheinen einer Freigabekarte und dem Zeitstempel der Erkennung
 *  (Uhr des Browsers und Audiozeit von Soniox laufen um einige Dutzend ms versetzt). */
const FREIGABE_VORLAUF_MS = 200;

export interface Erkennung {
  beiText: (sitzung: LiveSitzung) => void;
  beiEndpunkt: (sitzung: LiveSitzung) => void;
}

export function useErkennung(ablauf: SprachAblauf, gedaechtnis: SprachGedaechtnis, fragen: SprachFragen, verdacht: Verdacht): Erkennung {
  const beiText = useBeiText(ablauf, gedaechtnis, fragen, verdacht);
  const beiEndpunkt = useBeiEndpunkt(ablauf, gedaechtnis, fragen, verdacht);
  return { beiText, beiEndpunkt };
}

/** Neuer Text von der Erkennung, in jeder Phase. */
function useBeiText(ablauf: SprachAblauf, gedaechtnis: SprachGedaechtnis, fragen: SprachFragen, verdacht: Verdacht) {
  const { dispatch, phaseRef, setZwischentext } = ablauf;
  const {
    ohrRef,
    zuletztGehoertRef,
    kandidatTimerRef,
    vorsatzRef,
    offeneFrageRef,
    befehlGeprueftMsRef,
    grenzeMsRef,
    echoBisMsRef,
    beendenRef,
    audioJetzt,
    befehlAb,
    frageAb,
  } = gedaechtnis;
  const { unterbrecheHimbi } = fragen;
  const { pruefeVerdacht } = verdacht;

  return useCallback(
    (sitzung: LiveSitzung) => {
      if (ohrRef.current?.sitzung !== sitzung) return;
      const phase = phaseRef.current;
      const t = sitzung.textAb(frageAb());
      if (t.anzeige) zuletztGehoertRef.current = performance.now();
      if (phase === "hoert") {
        window.clearTimeout(kandidatTimerRef.current);
        setZwischentext(vorsatzRef.current ? fuegeZusammen(vorsatzRef.current.text, t.anzeige) : t.anzeige);
        return;
      }
      if (phase !== "denkt" && phase !== "spricht") return;
      // Zweite Stufe beim Dazwischenreden: entscheiden die Woerter seit dem Einsatz schon? Ein
      // Befehlswort allein ("Stopp") bleibt "warten" und wirkt unten wie bisher sofort.
      if (phase === "spricht" && pruefeVerdacht(sitzung, "offen") === "unterbrechen") return;
      // Befehle auch kurz vor Himbis Verstummen (befehlAb), der Nachsatz erst dahinter.
      const suche = sitzung.textAb(befehlAb());
      if (!istGesprochen(suche.anzeige)) return;
      // Waehrend Himbi spricht, hoert die Erkennung sein Echo mit: ein Befehlswort zaehlt nur,
      // wenn er es nicht gerade selbst sagt (klingender oder voriger Satz, nicht die ganze
      // Antwort - ein "halt" irgendwo darin sperrte sonst jedes "Halt"). Beim Nachdenken ist er still.
      const gerade = leseGerade();
      const gesagt = phase === "spricht" ? (gerade ? `${gerade.satz ?? ""} ${gerade.vorher ?? ""}` : leseChatStand().antwort) : "";
      const istEcho = (wort: string) => phase === "spricht" && befehlsWortIn(gesagt, wort) !== null;
      const beginn = befehlsBeginn(suche.woerter.map((w) => w.text), istEcho);
      const endgueltigeWoerter = suche.endgueltig.split(/\s+/).filter(Boolean).length;
      // Was jetzt gegen den klingenden Satz geprueft und kein Befehl war, wird spaeter nicht
      // gegen einen anderen Satz noch einmal geprueft (befehlGeprueftBis).
      if (beginn === null && phase === "spricht") {
        befehlGeprueftMsRef.current = befehlGeprueftBis(suche.woerter, endgueltigeWoerter, befehlGeprueftMsRef.current);
      }
      // Beim Nachdenken zaehlt ein Befehl nur am Anfang; alles andere ist ein Nachsatz.
      if (beginn === null || (phase === "denkt" && beginn > 0)) {
        window.clearTimeout(kandidatTimerRef.current);
        if (phase === "denkt" && !leseFreigabeAnfrage() && offeneFrageRef.current && istNachsatz(t.anzeige)) {
          // Nachsatz: weitergesprochen, bevor Himbi antwortet. Die Anfrage bricht ab, und am
          // naechsten Endpunkt geht die zusammengefuegte Frage an Stelle der alten hinaus.
          vorsatzRef.current = offeneFrageRef.current;
          offeneFrageRef.current = null;
          unterbrichChat();
          dispatch({ art: "unterbrechen" });
          setZwischentext(fuegeZusammen(vorsatzRef.current.text, t.anzeige));
        }
        return;
      }
      const loeseAus = () => {
        const jetzt = sitzung.textAb(befehlAb());
        const woerter = jetzt.woerter.map((w) => w.text);
        const b = befehlsBeginn(woerter, istEcho);
        if (b === null || ohrRef.current?.sitzung !== sitzung || !assistentIstDran(phaseRef.current)) return;
        // Himbis Echo hinter dem Befehl zaehlt nicht mit ("Tschuess Himbi" mitten in die Antwort).
        // Beenden nur, wenn die Aeusserung damit beginnt: "Kannst du die Schicht beenden?" ist eine Frage.
        if (istBeendenBefehl(befehlOhneEcho(woerter, b, istEcho))) {
          if (beendetWirklich(woerter, b, gesagt)) return beendenRef.current();
          return;
        }
        const karte = leseFreigabeAnfrage();
        if (karte) {
          // Bei offener Freigabekarte lehnt "Stopp" nur die Karte ab, wie beim Zuhoeren; "Himbi, ja,
          // bitte" ist keine Ablehnung (die Zusage wertet beiEndpunkt aus).
          if (befehlBeiOffenerKarte(woerter, b, istEcho) === "ignorieren") return;
          entscheideFreigabe(false, karte.nr);
          grenzeMsRef.current = Math.max(grenzeMsRef.current, (jetzt.endeMs ?? audioJetzt()) + 1);
          return;
        }
        // Die naechste Aeusserung beginnt mit den eigenen Worten vor dem Befehl ("Wie sagt man Stopp
        // auf Russisch?"), sonst mit dem Befehlswort; das Echo davor faellt weg, und die Frage
        // beginnt dort, auch wenn Himbi erst danach verstummt ist.
        const ab = aeusserungsBeginn(woerter, b, gesagt);
        grenzeMsRef.current = Math.max(grenzeMsRef.current, jetzt.woerter[ab]!.startMs ?? jetzt.woerter[b]!.startMs ?? grenzeMsRef.current);
        echoBisMsRef.current = grenzeMsRef.current;
        offeneFrageRef.current = null;
        unterbrecheHimbi("wort");
      };
      // Endgueltig erkannt: sofort. Nur vorlaeufig: erst, wenn es STOPP_STABIL_MS so bleibt -
      // ein vorlaeufiges Wort, das die Erkennung gleich korrigiert, loest nichts aus.
      window.clearTimeout(kandidatTimerRef.current);
      if (beginn < endgueltigeWoerter) loeseAus();
      else kandidatTimerRef.current = window.setTimeout(loeseAus, STOPP_STABIL_MS);
    },
    [
      audioJetzt,
      befehlAb,
      dispatch,
      frageAb,
      pruefeVerdacht,
      unterbrecheHimbi,
      setZwischentext,
      befehlGeprueftMsRef,
      beendenRef,
      echoBisMsRef,
      grenzeMsRef,
      kandidatTimerRef,
      offeneFrageRef,
      ohrRef,
      phaseRef,
      vorsatzRef,
      zuletztGehoertRef,
    ],
  );
}

/** Die Erkennung meldet das Ende einer Aeusserung. */
function useBeiEndpunkt(ablauf: SprachAblauf, gedaechtnis: SprachGedaechtnis, fragen: SprachFragen, verdacht: Verdacht) {
  const { dispatch, phaseRef, setZwischentext } = ablauf;
  const {
    ohrRef,
    freigabeNrRef,
    freigabeAbMsRef,
    grenzeMsRef,
    grenzeStehtRef,
    nachUnterbrechungRef,
    ruheTimerRef,
    echoBisMsRef,
    beendenRef,
    audioJetzt,
    frageAb,
  } = gedaechtnis;
  const { nimmAeusserung } = fragen;
  const { pruefeVerdacht } = verdacht;

  return useCallback(
    (sitzung: LiveSitzung) => {
      if (ohrRef.current?.sitzung !== sitzung) return;
      const phase = phaseRef.current;
      const t = sitzung.textAb(frageAb());
      // Eine offene Freigabekarte wartet auf "Ja" oder "Nein", in JEDER Phase. Bis zum
      // 28.09.2026 nur beim Zuhoeren: waehrend eine Klickkarte offen ist, gilt der Chat aber als
      // beschaeftigt (die Ausfuehrung wartet ja auf die Entscheidung), die Phase blieb "spricht",
      // und ein "Ja" fiel hier als Echo weg (Rueckmeldung: "wenn ich Ja sage, passiert nichts").
      // Es zaehlt nur, was nach dem Erscheinen der Karte gesagt wurde, und nur fuer genau diese.
      const karte = leseFreigabeAnfrage();
      if (karte && karte.nr === freigabeNrRef.current && freigabeAbMsRef.current !== null) {
        // Ab der harten Grenze, NICHT ab frageAb(): die Karte erscheint oft, bevor Himbi den Satz
        // vor dem Klick gesprochen hat, man antwortet mitten hinein, und sein Verstummen danach
        // rueckte die weiche Echo-Grenze hinter das "Ja" (gemessen am 28.09.2026: "Ja, bitte."
        // bei 1,6 s, Himbi still bei 4,2 s, das Ja war weg). Seine eigenen Worte filtert
        // freigabeAntwortMitEcho heraus.
        const antwort = sitzung.textAb(Math.max(grenzeMsRef.current, freigabeAbMsRef.current - FREIGABE_VORLAUF_MS));
        const gerade = leseGerade();
        // Echo kann nur sein, was Himbi gerade sagt. Still (kein Satz, oder der Chat spricht nicht),
        // gibt es keins - sonst waere ein "Хорошо" nie eine Zusage, sobald es in seiner Antwort stand.
        const chat = leseChatStand();
        const gesagt = gerade ? `${gerade.satz ?? ""} ${gerade.vorher ?? ""}` : chat.spricht ? chat.antwort.slice(-200) : "";
        const art = freigabeAntwortMitEcho(antwort.woerter.map((w) => w.text), gesagt);
        if (art) {
          grenzeMsRef.current = Math.max(grenzeMsRef.current, (antwort.endeMs ?? audioJetzt()) + 1);
          grenzeStehtRef.current = false;
          nachUnterbrechungRef.current = false;
          setZwischentext("");
          entscheideFreigabe(art === "zusage", karte.nr);
          // "Sprachmodus beenden" bei offener Karte: ablehnen UND beenden.
          if (art === "beenden") return beendenRef.current();
          // Beim Zuhoeren arbeitet der Chat nach der Entscheidung weiter: Himbi denkt.
          if (phase === "hoert") dispatch({ art: "frage-gestellt" });
          return;
        }
        // Keine Antwort auf die Karte (ein "Äh", ein Huster, Himbis Echo): das Fenster rueckt hinter
        // diese Aeusserung. Bis zur Gegenpruefung vom 29.09.2026 blieb sein Anfang stehen, jede
        // spaetere Aeusserung wurde samt dem "Äh" davor geprueft, und kein "Ja" gab die Karte mehr frei.
        freigabeAbMsRef.current = Math.max(freigabeAbMsRef.current, (antwort.endeMs ?? audioJetzt()) + 1 + FREIGABE_VORLAUF_MS);
      }
      if (phase === "spricht") {
        // Zweite Stufe: die Aeusserung ist zu Ende, jetzt entscheiden ihre Woerter. War es eine
        // Unterbrechung, ist dieser Endpunkt schon der der neuen Frage (die Phase ist jetzt "hoert").
        if (pruefeVerdacht(sitzung, "endpunkt") === "unterbrechen") {
          nimmAeusserung(sitzung.textAb(frageAb()));
          return;
        }
        const stand = leseChatStand();
        if (!stand.spricht && !stand.laedt && !stand.beschaeftigt) {
          // Die Antwort ist schon verklungen, nur die kurze Gnadenfrist lief noch: das war der
          // Nutzer (die Grenze steht seit dem Verstummen hinter Himbis letztem Wort).
          window.clearTimeout(ruheTimerRef.current);
          dispatch({ art: "antwort-fertig" });
          nimmAeusserung(t);
          return;
        }
        // Sonst Himbis Echo oder ein Nebengeraeusch - ein Befehl darin hat beiText schon
        // ausgeloest. Nur die weiche Grenze: die Befehlssuche schaut noch kurz davor.
        echoBisMsRef.current = Math.max(echoBisMsRef.current, (t.endeMs ?? 0) + 1);
        return;
      }
      if (phase === "hoert") nimmAeusserung(t);
    },
    [
      audioJetzt,
      dispatch,
      frageAb,
      nimmAeusserung,
      pruefeVerdacht,
      setZwischentext,
      beendenRef,
      echoBisMsRef,
      freigabeAbMsRef,
      freigabeNrRef,
      grenzeMsRef,
      grenzeStehtRef,
      nachUnterbrechungRef,
      ohrRef,
      phaseRef,
      ruheTimerRef,
    ],
  );
}
