"use client";

import { useCallback } from "react";
import { entscheideFreigabe, leseFreigabeAnfrage, leseGerade, stelleSprachFrage, unterbrichChat } from "@/components/ki/sprachmodus-bus";
import {
  beginntMitBefehl,
  frageNachUnterbrechung,
  fuegeZusammen,
  hauptsprecherVon,
  istBeendenBefehl,
  istGesprochen,
  istNachsatz,
  istNurAnhalten,
  nurHauptsprecher,
  type UnterbrechungsArt,
} from "@/lib/domain/sprachmodus";
import type { TextAb } from "@/lib/domain/diktat-live";
import type { SprachAblauf, SprachGedaechtnis } from "@/components/ki/sprachmodus-gedaechtnis";

// Fragen und Unterbrechen im Sprachmodus (sprachmodus.tsx), seit dem 14.10.2026 ein eigener Hook: was aus einer zu Ende
// gesprochenen Äußerung wird (Frage, Nachsatz, Beenden), wie eine Frage an den Chat geht und wie Himbi verstummt.

export interface SprachFragen {
  unterbrecheHimbi: (art: UnterbrechungsArt) => void;
  stelleFrage: (frage: string, sprachen: string[], optionen?: { ersetztLetzte?: boolean; unterbrochen?: string | null }) => void;
  nimmAeusserung: (t: TextAb) => void;
}

export function useSprachFragen(ablauf: SprachAblauf, gedaechtnis: SprachGedaechtnis): SprachFragen {
  const { dispatch, setZwischentext } = ablauf;
  const {
    grenzeMsRef,
    grenzeStehtRef,
    hauptsprecherRef,
    nachUnterbrechungRef,
    echoBeimUnterbrechenRef,
    unterbrochenBeiRef,
    offeneFrageRef,
    vorsatzRef,
    fehlversucheRef,
    beendenRef,
    audioJetzt,
  } = gedaechtnis;

  /** Himbi verstummt, das Gespraech bleibt offen und der Verlauf erhalten. Der Satz, den er
   *  gerade sprach, geht mit der naechsten Frage ans Modell (sprachmodus-bus.ts). */
  const unterbrecheHimbi = useCallback(
    (art: UnterbrechungsArt) => {
      const gerade = leseGerade();
      unterbrochenBeiRef.current = gerade?.satz ?? gerade?.vorher ?? null;
      echoBeimUnterbrechenRef.current = `${gerade?.satz ?? ""} ${gerade?.vorher ?? ""}`;
      grenzeStehtRef.current = art !== "tipp";
      // Auch nach dem Lautstaerke-Waechter kann die naechste Aeusserung mit "Stopp" beginnen,
      // nach einem Tipp nicht.
      nachUnterbrechungRef.current = beginntMitBefehl(art);
      unterbrichChat();
      dispatch({ art: "unterbrechen" });
    },
    [dispatch, echoBeimUnterbrechenRef, grenzeStehtRef, nachUnterbrechungRef, unterbrochenBeiRef],
  );

  /** Stellt eine Frage an den Chat (sprachmodus-bus.ts): sie ist ab jetzt die offene Frage
   *  (ein Nachsatz haengt sich an sie), und Himbi denkt. */
  const stelleFrage = useCallback(
    (frage: string, sprachen: string[], optionen: { ersetztLetzte?: boolean; unterbrochen?: string | null } = {}) => {
      offeneFrageRef.current = { text: frage, sprachen };
      stelleSprachFrage(frage, sprachen, optionen);
      dispatch({ art: "frage-gestellt" });
    },
    [dispatch, offeneFrageRef],
  );

  /** Die Aeusserung ab der Grenze ist zu Ende (Endpunkt): Frage, Befehl oder Freigabe. */
  const nimmAeusserung = useCallback(
    (t: TextAb) => {
      grenzeMsRef.current = Math.max(grenzeMsRef.current, (t.endeMs ?? audioJetzt()) + 1);
      grenzeStehtRef.current = false;
      setZwischentext("");
      // Sprechertrennung (Schalter KI_SPRECHERTRENNUNG): nur der Hauptsprecher der Sitzung zaehlt,
      // was nur andere sagen, ist keine Frage. Ohne Sprechernummern bleibt alles, wie es ist.
      const haupt = hauptsprecherRef.current ?? hauptsprecherVon(t.woerter);
      const woerter = nurHauptsprecher(t.woerter, haupt);
      if (t.woerter.length > 0 && woerter.length === 0) return;
      let text = woerter.length === t.woerter.length ? t.endgueltig || t.anzeige : woerter.map((w) => w.text).join(" ");
      if (nachUnterbrechungRef.current) {
        // "Stopp, zeig mir lieber die Reklamationen": das Befehlswort hat schon gewirkt. Bei
        // offener Freigabe bleibt "Nein" eine Absage.
        nachUnterbrechungRef.current = false;
        const rest = leseFreigabeAnfrage() ? null : frageNachUnterbrechung(woerter.map((w) => w.text), echoBeimUnterbrechenRef.current);
        if (rest !== null) text = rest;
      }
      if (!istGesprochen(text) && !vorsatzRef.current) return;
      // Ja/Nein zu einer offenen Freigabekarte wertet beiEndpunkt vorher aus, in jeder Phase.
      // Was hier ankommt, ist keine Antwort darauf: eine neue Frage, die die Karte ablehnt.
      if (istBeendenBefehl(text)) {
        beendenRef.current();
        return;
      }
      // "Stopp" beim Zuhoeren: es gibt nichts anzuhalten, und als Frage waere es sinnlos.
      if (istNurAnhalten(text) && !vorsatzRef.current) return;
      // Bei offener Karte: ein Fuellaut ("Äh", "Hm") ist weder Antwort noch Frage, und eine neue
      // Frage lehnt die Karte erst ab. Bis zur Gegenpruefung vom 29.09.2026 ging die Frage bei
      // offener Karte hinaus, die Karte verschwand aus dem Sprachmodus, und der Werkzeugaufruf
      // blieb im Verlauf unbeantwortet stehen.
      const karte = leseFreigabeAnfrage();
      if (karte && !vorsatzRef.current) {
        if (!istNachsatz(text)) return;
        entscheideFreigabe(false, karte.nr);
      }
      const frage = vorsatzRef.current ? fuegeZusammen(vorsatzRef.current.text, text) : text;
      const sprachen = vorsatzRef.current ? [...vorsatzRef.current.sprachen, ...t.sprachen] : t.sprachen;
      const ersetzt = vorsatzRef.current !== null;
      vorsatzRef.current = null;
      fehlversucheRef.current = 0;
      stelleFrage(frage, sprachen, { ersetztLetzte: ersetzt, unterbrochen: unterbrochenBeiRef.current });
      unterbrochenBeiRef.current = null;
      if (!hauptsprecherRef.current && haupt) hauptsprecherRef.current = haupt;
    },
    [
      audioJetzt,
      stelleFrage,
      setZwischentext,
      beendenRef,
      echoBeimUnterbrechenRef,
      fehlversucheRef,
      grenzeMsRef,
      grenzeStehtRef,
      hauptsprecherRef,
      nachUnterbrechungRef,
      unterbrochenBeiRef,
      vorsatzRef,
    ],
  );

  return { unterbrecheHimbi, stelleFrage, nimmAeusserung };
}
