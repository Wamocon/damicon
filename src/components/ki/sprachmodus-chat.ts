"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { abonniereSprachBus, leseChatStand, leseFreigabeAnfrage } from "@/components/ki/sprachmodus-bus";
import { antwortFertig, RUHE_VOR_ZUHOEREN_MS, tagesbeginnAktion, urteilNachVerdacht, type Phase } from "@/lib/domain/sprachmodus";
import { tageszeitBestimmen } from "@/lib/domain/tageszeit";
import { merkeTagesbeginn, tagesbeginnFaellig } from "@/lib/himbi-tagesbeginn";
import { browserAblage } from "@/lib/suche/zuletzt";
import type { SprachAblauf, SprachGedaechtnis } from "@/components/ki/sprachmodus-gedaechtnis";
import type { SprachFragen } from "@/components/ki/sprachmodus-fragen";

// Der Sprachmodus (sprachmodus.tsx) am Chat, seit dem 14.10.2026 eigene Hooks: er folgt dem Stand des Chats (denkt, spricht,
// wieder zuhören, Fehler) und stellt einmal am Tag selbst die erste Frage.

// --- An den Chat-Zustand gekoppelt: denkt -> spricht -> wieder zuhoeren ---------------
// Direkt am Bus statt in einem Effekt auf chatStand: der Chat meldet seinen Stand aus
// einem eigenen Effekt (ki-chat.tsx), und hier wird im Rueckruf darauf reagiert.
export function useChatKopplung(ablauf: SprachAblauf, gedaechtnis: SprachGedaechtnis, beendeVerdacht: (lauter: boolean) => void): void {
  const t = useTranslations("kiAssistentAnsicht.sprachmodus");
  const tAktion = useTranslations("aktionen");
  const { phaseRef, dispatch, zeigeMeldung } = ablauf;
  const { ohrRef, freigabeNrRef, freigabeAbMsRef, grenzeStehtRef, verdachtRef, hauptsprecherRef, grenzeMsRef, echoBisMsRef, ruheTimerRef, offeneFrageRef, audioJetzt } =
    gedaechtnis;

  const sprachZuletzt = useRef(false);
  useEffect(() => {
    const reagiere = () => {
      // Eine neue Freigabekarte: ab jetzt zaehlt, was der Nutzer sagt, als Antwort darauf.
      const karte = leseFreigabeAnfrage();
      if ((karte?.nr ?? null) !== freigabeNrRef.current) {
        freigabeNrRef.current = karte?.nr ?? null;
        freigabeAbMsRef.current = karte ? audioJetzt() : null;
      }
      const stand = leseChatStand();
      const sprichtJetzt = stand.spricht || stand.laedt;
      // Himbi ist gerade verstummt: was die Erkennung ab jetzt hoert, ist nicht mehr sein Echo.
      // Ausser er wurde per Stimme unterbrochen: dann steht die Grenze schon am Einsatz des Nutzers.
      // Lief dabei noch die erste Stufe (der Nutzer spricht schon), gehoeren seine Worte ab dem
      // Einsatz zur naechsten Frage, sofern sie Inhalt haben - ein "Mhm" in Himbis letzten Satz nicht.
      if (sprachZuletzt.current && !sprichtJetzt && !grenzeStehtRef.current) {
        const v = verdachtRef.current;
        const sitzung = ohrRef.current?.sitzung;
        const inhalt =
          v && sitzung
            ? urteilNachVerdacht({ woerter: sitzung.textAb(v.abMs).woerter, gesagt: stand.antwort.slice(-200), abgeschlossen: true, hauptsprecher: hauptsprecherRef.current }) === "unterbrechen"
            : false;
        if (v && inhalt) {
          grenzeMsRef.current = Math.max(grenzeMsRef.current, v.abMs);
          echoBisMsRef.current = grenzeMsRef.current;
          grenzeStehtRef.current = true;
        } else {
          echoBisMsRef.current = Math.max(echoBisMsRef.current, audioJetzt() + 50);
        }
        beendeVerdacht(true);
      }
      sprachZuletzt.current = sprichtJetzt;
      window.clearTimeout(ruheTimerRef.current);
      if (phaseRef.current !== "denkt" && phaseRef.current !== "spricht") return;
      if (stand.einwilligungFehlt) {
        // Der Chat hat die Frage verworfen, weil dem Hinweis zur KI-Nutzung noch
        // nicht zugestimmt ist. Eine Zustimmung darf hier nicht ungesehen gesetzt
        // werden (bis zum 24.09.2026 tat der Sprachmodus genau das) - der Start
        // prueft sie deshalb schon vorher (ki-pane-kontext.tsx, starteSprachmodus).
        zeigeMeldung({ text: t("einwilligungZuerst"), fehlerzustand: true });
        dispatch({ art: "fehler" });
        return;
      }
      if (stand.fehler) {
        // Das Gespraech bleibt offen: die Meldung gilt bis zur naechsten Frage oder Antwort.
        zeigeMeldung({ text: tAktion("fehler.unbekannt"), fehlerzustand: false });
        dispatch({ art: "unterbrechen" });
        return;
      }
      if (sprichtJetzt && phaseRef.current === "denkt") dispatch({ art: "antwort-spricht" });
      if (!sprichtJetzt && antwortFertig(stand)) {
        // Kurze Gnadenfrist: zwischen Streamende und dem Anstoss des Vorlesens liegt ein
        // Renderdurchlauf, ohne sie sprang die Anzeige mitten in diese Luecke auf "hoert".
        ruheTimerRef.current = window.setTimeout(() => {
          offeneFrageRef.current = null;
          dispatch({ art: "antwort-fertig" });
        }, RUHE_VOR_ZUHOEREN_MS);
      }
    };
    return abonniereSprachBus(reagiere);
  }, [
    audioJetzt,
    beendeVerdacht,
    dispatch,
    t,
    tAktion,
    zeigeMeldung,
    echoBisMsRef,
    freigabeAbMsRef,
    freigabeNrRef,
    grenzeMsRef,
    grenzeStehtRef,
    hauptsprecherRef,
    offeneFrageRef,
    ohrRef,
    phaseRef,
    ruheTimerRef,
    verdachtRef,
  ]);
}

// --- Himbi beginnt den Tag (lib/himbi-tagesbeginn.ts) -----------------------------------
//
// Rueckmeldung vom 28.09.2026: "Himbi soll mit mir interagieren, zum Beispiel mir
// vorschlagen, was ich heute machen kann, was dringende Themen sind ... Er soll mir Fragen
// stellen!" Einmal am Tag je Nutzer stellt Himbi beim ERSTEN Zuhoeren dieser Sitzung selbst
// die Frage nach der Tageslage; die Antwort (TAGESBEGLEITER im Prompt) nennt hoechstens drei
// Punkte und endet mit einer Rueckfrage, auf die der Nutzer einfach antwortet.
//   - Die Frage geht wie jede andere an den Chat und steht danach im Verlauf. Das ist gewollt:
//     sichtbar, was gefragt wurde, und kein Sonderweg im Server.
//   - Nur beim ersten Uebergang nach "hoert": das Ref haelt, auch wenn "hoert" nach Pause,
//     Fehler oder Neuversuch wiederkommt, und auch beim probeweisen zweiten Einhaengen der
//     Effekte im Entwicklungsmodus (die Refs bleiben dabei erhalten).
//   - Die Einwilligung hat starteSprachmodus (ki-pane-kontext.tsx) schon geprueft. Ist der Chat
//     nicht bereit, beschaeftigt oder wartet eine Freigabe, entfaellt die Begruessung, ohne den
//     Tag zu verbrauchen: der Merker wird erst gesetzt, wenn die Frage wirklich gestellt ist.
//   - Danach wie in nimmAeusserung (stelleFrage): offeneFrage gesetzt (spricht der Nutzer gleich
//     hinein, wird es ein Nachsatz zu dieser Frage) und die Phase "denkt". Bliebe sie auf
//     "hoert", naehme das Ohr Himbis eigene Antwort am naechsten Endpunkt als Frage.
// Die Entscheidung selbst steht als reine Funktion in domain/sprachmodus.ts
// (tagesbeginnAktion) und wird dort Fall fuer Fall geprueft (himbi-tagesbegleiter.mjs).
export function useTagesbeginn(phase: Phase, tagesbeginnAn: boolean, nutzerId: string | null, stelleFrage: SprachFragen["stelleFrage"]): void {
  const t = useTranslations("kiAssistentAnsicht.sprachmodus");
  const sprache = useLocale();
  const tagesbeginnEntschieden = useRef(false);
  useEffect(() => {
    const ablage = browserAblage();
    const jetzt = new Date();
    const stand = leseChatStand();
    const aktion = tagesbeginnAktion({
      phase,
      schonEntschieden: tagesbeginnEntschieden.current,
      einstellungAn: tagesbeginnAn,
      faellig: tagesbeginnFaellig(ablage, nutzerId, "gespraech", jetzt),
      chat: stand,
      freigabeOffen: leseFreigabeAnfrage() !== null,
    });
    if (aktion === "nichts") return;
    tagesbeginnEntschieden.current = true;
    if (aktion !== "fragen") return;
    stelleFrage(t(`tagesbeginn.${tageszeitBestimmen(jetzt)}`), [sprache]);
    merkeTagesbeginn(ablage, nutzerId, "gespraech", jetzt);
  }, [phase, tagesbeginnAn, nutzerId, sprache, stelleFrage, t]);
}
