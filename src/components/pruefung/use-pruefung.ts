"use client";

import { useCallback, useReducer, useRef } from "react";
import type { Pruefbereich } from "@/lib/pruefung/rollen";
import type { AgentPhase, Befund, Bericht, Ereignis } from "@/lib/pruefung/typen";

// Zustand der laufenden Pruefung im Browser: liest den Ereignisstrom von /api/ki-pruefung (eine
// JSON-Zeile je Ereignis) und macht daraus den Stand, den die Buehne zeichnet. Reine Reduktion,
// keine Effekte: jedes Ereignis aendert genau einen Teil des Stands.

export interface FeldStand {
  titel: string;
  daten: number | null;
  quellen: number | null;
  stelle?: string;
  bewertet: boolean;
}

export interface AgentStand {
  phase: "wartet" | AgentPhase;
  felder: Record<string, FeldStand>;
  reihenfolge: string[];
  befunde: number;
}

export interface LogZeile {
  id: number;
  art: "fakten" | "recht" | "befund" | "agent" | "synthese";
  bereich?: Pruefbereich;
  feld?: string;
  anzahl?: number;
  text?: string;
}

export type FehlerArt = "allgemein" | "wissensbasis" | "laeuft" | "rechte" | "anmeldung";

export interface PruefungStand {
  phase: "bereit" | "laeuft" | "fertig" | "fehler";
  agenten: Partial<Record<Pruefbereich, AgentStand>>;
  reihenfolge: Pruefbereich[];
  abgelehnt: Pruefbereich[];
  befunde: Befund[];
  synthese: "aus" | "laeuft" | "fertig";
  log: LogZeile[];
  bericht: Bericht | null;
  protokolliert: boolean;
  fehler: FehlerArt | null;
}

const START: PruefungStand = { phase: "bereit", agenten: {}, reihenfolge: [], abgelehnt: [], befunde: [], synthese: "aus", log: [], bericht: null, protokolliert: false, fehler: null };

type Aktion = { t: "ereignis"; e: Ereignis } | { t: "beginn" } | { t: "fehler"; art: FehlerArt } | { t: "zurueck" };

const MAX_LOG = 80;
let zeilenNr = 0;
const mitLog = (s: PruefungStand, z: Omit<LogZeile, "id">): PruefungStand => ({ ...s, log: [...s.log, { ...z, id: ++zeilenNr }].slice(-MAX_LOG) });

function agentAendern(s: PruefungStand, bereich: Pruefbereich, f: (a: AgentStand) => AgentStand): PruefungStand {
  const a = s.agenten[bereich];
  if (!a) return s;
  return { ...s, agenten: { ...s.agenten, [bereich]: f(a) } };
}

function reduziere(s: PruefungStand, a: Aktion): PruefungStand {
  if (a.t === "zurueck") return START;
  if (a.t === "beginn") return { ...START, phase: "laeuft" };
  if (a.t === "fehler") return { ...s, phase: "fehler", fehler: a.art };
  const e = a.e;
  switch (e.t) {
    case "start": {
      const agenten: PruefungStand["agenten"] = {};
      for (const ag of e.agenten) {
        agenten[ag.bereich] = {
          phase: "wartet",
          befunde: 0,
          reihenfolge: ag.felder.map((f) => f.id),
          felder: Object.fromEntries(ag.felder.map((f) => [f.id, { titel: f.titel, daten: null, quellen: null, bewertet: false }])),
        };
      }
      return { ...s, phase: "laeuft", agenten, reihenfolge: e.agenten.map((x) => x.bereich), abgelehnt: e.abgelehnt };
    }
    case "agent": {
      const n = agentAendern(s, e.bereich, (x) => ({ ...x, phase: e.phase }));
      return mitLog(n, { art: "agent", bereich: e.bereich, text: e.phase });
    }
    case "feld": {
      const n = agentAendern(s, e.bereich, (x) => {
        const f = x.felder[e.feld];
        if (!f) return x;
        const neu: FeldStand = { ...f };
        if (e.phase === "fakten") neu.daten = e.anzahl ?? 0;
        if (e.phase === "recht") {
          neu.quellen = e.anzahl ?? 0;
          neu.stelle = e.text;
        }
        if (e.phase === "bewertet") neu.bewertet = true;
        return { ...x, felder: { ...x.felder, [e.feld]: neu } };
      });
      if (e.phase === "bewertet") return n;
      return mitLog(n, { art: e.phase === "fakten" ? "fakten" : "recht", bereich: e.bereich, feld: e.feld, anzahl: e.anzahl, text: e.text });
    }
    case "befund": {
      const n = agentAendern(s, e.befund.bereich, (x) => ({ ...x, befunde: x.befunde + 1 }));
      return mitLog({ ...n, befunde: [...n.befunde, e.befund] }, { art: "befund", bereich: e.befund.bereich, feld: e.befund.feld, text: e.befund.titel });
    }
    case "synthese":
      return mitLog({ ...s, synthese: e.phase === "start" ? "laeuft" : "fertig" }, { art: "synthese", text: e.phase });
    case "bericht":
      return { ...s, phase: "fertig", bericht: e.bericht, protokolliert: e.protokolliert };
    case "fehler":
      return { ...s, phase: "fehler", fehler: "allgemein" };
  }
}

export function usePruefung() {
  const [stand, dispatch] = useReducer(reduziere, START);
  const abbruch = useRef<AbortController | null>(null);

  const starten = useCallback(async (bereiche: Pruefbereich[], sprache: string) => {
    abbruch.current?.abort();
    const ac = new AbortController();
    abbruch.current = ac;
    dispatch({ t: "beginn" });
    try {
      const antwort = await fetch("/api/ki-pruefung", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bereiche, sprache }),
        signal: ac.signal,
      });
      if (!antwort.ok || !antwort.body) {
        const art: FehlerArt = antwort.status === 409 ? "wissensbasis" : antwort.status === 429 ? "laeuft" : antwort.status === 403 ? "rechte" : antwort.status === 401 ? "anmeldung" : "allgemein";
        dispatch({ t: "fehler", art });
        return;
      }
      const leser = antwort.body.getReader();
      const decoder = new TextDecoder();
      let rest = "";
      let bericht = false;
      for (;;) {
        const { done, value } = await leser.read();
        if (done) break;
        rest += decoder.decode(value, { stream: true });
        const zeilen = rest.split("\n");
        rest = zeilen.pop() ?? "";
        for (const zeile of zeilen) {
          if (!zeile.trim()) continue;
          try {
            const e = JSON.parse(zeile) as Ereignis;
            if (e.t === "bericht") bericht = true;
            dispatch({ t: "ereignis", e });
          } catch {
            /* unvollstaendige oder fremde Zeile: ignorieren */
          }
        }
      }
      if (!bericht && !ac.signal.aborted) dispatch({ t: "fehler", art: "allgemein" });
    } catch {
      if (!ac.signal.aborted) dispatch({ t: "fehler", art: "allgemein" });
    }
  }, []);

  const abbrechen = useCallback(() => {
    abbruch.current?.abort();
    dispatch({ t: "zurueck" });
  }, []);

  const zurueck = useCallback(() => dispatch({ t: "zurueck" }), []);

  return { stand, starten, abbrechen, zurueck };
}
