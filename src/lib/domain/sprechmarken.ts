// Sprechmarken: im Sprachmodus stellt das Modell vor einen Satz, der eine Stelle
// der Seite erklärt, eine unsichtbare Marke, zum Beispiel
//   "[[a3]] Im Risiko-Radar stehen zwei Fristen."
// Wenn die Stimme genau diesen Satz erreicht, hebt der Browser die Stelle hervor
// (sprach-mitlesen.ts). So folgt der Rahmen dem, was Himbi meint, statt einer
// Wortähnlichkeit (Rückmeldung vom 25.09.2026: "er sprach über die Prüfberichte,
// sprang aber zur Kachel Hof").
//
// Die Marke verlässt den Server nie im Text: route.ts filtert sie aus jedem
// Textstück (erzeugeMarkenFilter). Der Satzzerleger bekommt an ihrer Stelle
// einen Platzhalter und ordnet das Ziel dem richtigen Satz zu; das Ziel reist
// als eigenes, unsigniertes Feld neben dem signierten Satz. Anzeige, Signatur,
// Rückfallweg und gespeicherter Verlauf sehen nur sauberen Text.
//
// Platzhalter, Zieltyp und ohneSprechmarken stehen in domain/sprachausgabe.ts:
// dort braucht sie der Zerleger, und die Tests laden sie ohne Alias-Lader.

import { MARKEN_PLATZHALTER, type SprechZiel } from "@/lib/domain/sprachausgabe";

const MAX_INNEN = 80;

/** Das Ziel aus dem Inhalt einer Marke, oder null, wenn er nichts taugt. */
export function zielAusMarke(inhalt: string): SprechZiel | null {
  const s = inhalt.trim();
  if (/^[ea]\d{1,5}$/i.test(s)) return s.toLowerCase();
  if (/^#[A-Za-z][\w-]{0,80}$/.test(s)) return s;
  if (s.length >= 2 && s.length <= MAX_INNEN && !/[<>{}]/.test(s)) return `t:${s}`;
  return null;
}

export interface GefiltertesStueck {
  /** Für Anzeige, Verlauf und alles außer dem Zerleger: ohne Marke. */
  anzeige: string;
  /** Für den Satzzerleger: an der Stelle jeder Marke ein MARKEN_PLATZHALTER. */
  zerleger: string;
  /** Die Ziele der Marken dieses Stücks, in der Reihenfolge der Platzhalter. */
  ziele: SprechZiel[];
}

export interface MarkenFilter {
  /** Ein Stück aus dem Stream. Eine Marke, die über zwei Stücke verteilt
   *  ankommt ("[[a" + "3]]"), wird zurückgehalten, bis sie vollständig ist. */
  fuettere(stueck: string): GefiltertesStueck;
  /** Ende eines Textteils: nichts mehr zurückhalten. Ein unvollständiges "[[…"
   *  fällt weg, ein einzelnes "[" bleibt Text. */
  leere(): GefiltertesStueck;
}

export function erzeugeMarkenFilter(): MarkenFilter {
  let rest = "";

  function verarbeite(text: string, amEnde: boolean): GefiltertesStueck {
    let anzeige = "";
    let zerleger = "";
    const ziele: SprechZiel[] = [];
    let i = 0;
    for (;;) {
      const auf = text.indexOf("[[", i);
      if (auf < 0) {
        let stueck = text.slice(i);
        // Ein "[" ganz am Ende kann der Anfang einer Marke sein.
        if (!amEnde && stueck.endsWith("[")) {
          rest = "[";
          stueck = stueck.slice(0, -1);
        }
        anzeige += stueck;
        zerleger += stueck;
        return { anzeige, zerleger, ziele };
      }
      const davor = text.slice(i, auf);
      anzeige += davor;
      zerleger += davor;
      const zu = text.indexOf("]]", auf + 2);
      const innen = zu < 0 ? text.slice(auf + 2) : text.slice(auf + 2, zu);
      if (zu < 0) {
        // Noch offen: zurückhalten, solange es eine Marke werden kann.
        if (!amEnde && innen.length <= MAX_INNEN && !innen.includes("\n") && !innen.includes("[")) {
          rest = text.slice(auf);
          return { anzeige, zerleger, ziele };
        }
        if (amEnde && innen.length <= MAX_INNEN && !innen.includes("\n")) return { anzeige, zerleger, ziele };
        // Keine Marke, nur Text mit "[[".
        anzeige += "[[";
        zerleger += "[[";
        i = auf + 2;
        continue;
      }
      if (innen.length > MAX_INNEN || innen.includes("\n") || innen.includes("[")) {
        anzeige += "[[";
        zerleger += "[[";
        i = auf + 2;
        continue;
      }
      const ziel = zielAusMarke(innen);
      // Auch eine unbrauchbare Marke wird nie angezeigt oder gesprochen.
      if (ziel) {
        zerleger += MARKEN_PLATZHALTER;
        ziele.push(ziel);
      }
      i = zu + 2;
    }
  }

  return {
    fuettere(stueck) {
      const text = rest + stueck;
      rest = "";
      return verarbeite(text, false);
    },
    leere() {
      const text = rest;
      rest = "";
      return text ? verarbeite(text, true) : { anzeige: "", zerleger: "", ziele: [] };
    },
  };
}

/** Die Ziele aus einer bekannten Liste (Refs der jüngsten seiteLesen-Antwort
 *  oder der Seitenkarte): eine erfundene e-/a-Referenz fällt weg. Anker und
 *  Überschriften prüft erst der Browser. Ohne Liste bleibt alles stehen. */
export function nurBekannteZiele(ziele: readonly SprechZiel[], bekannt: ReadonlySet<string> | null): SprechZiel[] {
  if (!bekannt) return [...ziele];
  return ziele.filter((z) => !/^[ea]\d+$/.test(z) || bekannt.has(z));
}
