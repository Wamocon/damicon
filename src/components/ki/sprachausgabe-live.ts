"use client";

// Vorlesen, waehrend die Antwort noch geschrieben wird - und der Vorlese-Knopf
// an einer fertigen Antwort, wenn der Strom zur Verfuegung steht.
//
// Zwei Wege, je Runde entschieden:
//
//   1. STROM (Regelfall mit Soniox, components/ki/sprachausgabe-strom.ts):
//      jeder Satz geht sofort in einen Soniox-WebSocket, der Ton kommt zurueck,
//      waehrend er entsteht. Seit 24.09.2026.
//   2. ABSCHNITTE (Rueckfall: Sokrates, Strom aus oder gescheitert): jeder
//      Abschnitt als eigene, signierte Anfrage an api/ki-sprachausgabe, als
//      ganze Datei dekodiert und nacheinander gespielt. Bis zum 24.09.2026 der
//      einzige Weg - mit Soniox wartete er je Abschnitt etwa so lange, wie der
//      Abschnitt klingt, daher 5 s bis zum ersten Ton und Luecken dazwischen.
//
// Gibt der Strom mitten in einer Runde auf, uebernimmt Weg 2 alles, was noch
// nicht geklungen hat - die signierten Abschnitte dafuer liegen bereit.
//
// Eine RUNDE ist eine Nutzerfrage (neueRunde), nicht eine Server-Antwort: im
// Agent- und Sprachmodus stellt der Browser nach jedem Client-Werkzeug eine
// Folgeanfrage mit neuer ID. Bis zum 24.09.2026 schnitt jede neue ID die Stimme
// ab ("Ich schaue in Ihre Aufgaben" verstummte, sobald zeigeAuf zurueckkam).
//
// Wie bisher: der AudioContext wird bei einer BEDIENUNG entsperrt (iPhone), und
// stoppeAlles() ist sofort still - Rueckrufe eines alten Durchgangs tun danach
// nichts mehr (durchgang).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { erzeugeWarteschlange, type Warteschlange } from "@/lib/domain/sprachausgabe-warteschlange";
import { istSprachausgabeSprache, saetzeAusAntwort, sprechfassung } from "@/lib/domain/sprachausgabe";
import { fuerSprache } from "@/lib/text/umlaute";
import { ausgangFuer } from "@/lib/ausgabe-pegel";
import type { VorlesePhase } from "@/lib/domain/vorlesen-zustand";
import { erzeugeStromSprecher, stromMoeglich, type SprechStand, type StromSprecher, type StromZustand } from "@/components/ki/sprachausgabe-strom";
import type { GebundenesZiel } from "@/components/ki/sprach-mitlesen";

export type LiveAbschnitt = {
  zug: string;
  nr: number;
  text: string;
  sig: string;
  ablauf: number;
  /** Sprechmarken des Abschnitts (vom Server, unsigniert, domain/sprechmarken.ts). */
  ziele?: string[];
  /** Dieselben, im Browser beim Eintreffen an ihr Element gebunden (ki-chat-sprache.ts). */
  gebunden?: GebundenesZiel | null;
};
/** Zug-Nachweis aus dem Chat-Stream (data-nachweis): damit gibt es einen
 *  Schluessel fuer den Vorlese-Strom. */
export type ZugNachweis = { zug: string; ablauf: number; sig: string };
export type { VorlesePhase };

/** Der Text, wie ihn die Stimme bekommt - dieselbe Aufbereitung wie die Route
 *  (api/ki-sprachausgabe, zumSprechen): Umlaute auf Deutsch, Symbole und
 *  Tausendertrennung als Worte. Im Strom geschieht das hier im Browser. */
export function zumSprechen(text: string, sprache: string): string {
  return istSprachausgabeSprache(sprache) ? sprechfassung(fuerSprache(text, sprache), sprache) : text;
}

export function useLiveSprachausgabe({ beiNachrichtOhneStrom }: { beiNachrichtOhneStrom?: (id: string) => void } = {}) {
  const [stromZustand, setStromZustand] = useState<StromZustand>({ laedt: false, spricht: false });
  const [abschnittSpricht, setAbschnittSpricht] = useState(false);
  const [abschnittLaedt, setAbschnittLaedt] = useState(false);
  // Welche Nachricht gerade gelesen wird (fuer den Knopf an der Nachricht).
  const [quelle, setQuelle] = useState<string | null>(null);

  const kontext = useRef<AudioContext | null>(null);
  const durchgang = useRef(0);
  const weg = useRef<"strom" | "abschnitte" | null>(null);
  // Alles, was in dieser Runde an den Strom ging - fuer die Uebergabe an Weg 2.
  const anDenStrom = useRef<Array<{ a: LiveAbschnitt; sprache: string }>>([]);
  // Knopf an einer Nachricht (sprichNachricht): welche, und wie viele Saetze.
  const nachricht = useRef<{ id: string; saetze: number } | null>(null);
  const sprecher = useRef<StromSprecher | null>(null);
  const ohneStrom = useRef(beiNachrichtOhneStrom);
  useEffect(() => {
    ohneStrom.current = beiNachrichtOhneStrom;
  }, [beiNachrichtOhneStrom]);

  // --- Weg 2: Abschnitte ---------------------------------------------------------------
  const warteschlange = useRef<Warteschlange | null>(null);
  const abbrueche = useRef(new Map<number, AbortController>());
  const puffer = useRef(new Map<number, AudioBuffer>());
  // Rueckfall ohne Web Audio: fertige Toene als Adresse, gespielt von einem
  // <audio>-Element. Die Luecken sind groesser, aber es klingt.
  const ersatzToene = useRef(new Map<number, string>());
  const ersatzSpieler = useRef<HTMLAudioElement | null>(null);
  const hatWebAudio = useRef(true);
  // Signatur und Ablauf je Abschnitt, unter der LAUFENDEN Nummer der Runde (die
  // Nummern des Servers beginnen je Antwort wieder bei 1).
  const scheine = useRef(new Map<number, { a: LiveAbschnitt; sprache: string }>());
  const laufendeNr = useRef(0);
  const knoten = useRef<AudioBufferSourceNode | null>(null);
  // Fuer gerade() im Abschnitts-Weg: welcher Abschnitt gerade klingt, und bis
  // zu welchem alle fertig sind.
  const spieltNr = useRef<number | null>(null);
  const gehaltenRef = useRef(false);
  const fertigBis = useRef(0);

  function schlange(): Warteschlange {
    warteschlange.current ??= erzeugeWarteschlange();
    return warteschlange.current;
  }

  /** Auf dem iPhone muss der Ton aus einer Geste heraus starten. Deshalb wird
   *  der Kontext beim Senden-Klick bzw. beim Mikrofon-Stopp entsperrt, lange
   *  bevor der erste Abschnitt da ist. */
  const entsperre = useCallback(() => {
    try {
      const Klasse = typeof AudioContext !== "undefined" ? AudioContext : undefined;
      if (Klasse) {
        kontext.current ??= new Klasse();
        if (kontext.current.state === "suspended" && !gehaltenRef.current) void kontext.current.resume();
        hatWebAudio.current = true;
        return;
      }
    } catch {
      // faellt unten auf <audio> zurueck
    }
    // Ohne Web Audio wird trotzdem vorgelesen, nur eben mit einem
    // <audio>-Element je Abschnitt (und ohne Strom: der braucht Web Audio).
    hatWebAudio.current = false;
    if (!ersatzSpieler.current) {
      try {
        ersatzSpieler.current = new Audio();
      } catch {
        // Auch das nicht: dann bleibt es beim Knopf je Antwort.
      }
    }
    // Ein leerer Ton aus der Geste heraus nimmt dem Browser die Sperre.
    void ersatzSpieler.current?.play().catch(() => {});
    ersatzSpieler.current?.pause();
  }, []);

  /** Zustand von Weg 2 aus der Warteschlange: spricht, solange eine Quelle
   *  laeuft; laedt, solange noch etwas aussteht. Bis zum 24.09.2026 blieb
   *  "laedt" nach einem gescheiterten Abschnitt stehen - die Welle drehte
   *  endlos, und der Sprachmodus kehrte nie zum Zuhoeren zurueck. */
  const aktualisiereAbschnitte = useCallback(() => {
    const stand = schlange().stand();
    const offen = stand.some((e) => e.stand !== "fertig" && e.stand !== "uebersprungen");
    const spielt = stand.some((e) => e.stand === "spielt");
    setAbschnittSpricht(spielt);
    setAbschnittLaedt(offen && !spielt);
  }, []);

  /** Alles anhalten. Muss unter 200 ms durch sein, deshalb zuerst der Ton und
   *  erst danach das Aufraeumen. */
  const stoppeAlles = useCallback(() => {
    durchgang.current += 1;
    sprecher.current?.stopp();
    // Eine angehaltene Stimme (Seitenwechsel) nicht angehalten zuruecklassen.
    if (gehaltenRef.current) {
      gehaltenRef.current = false;
      if (kontext.current?.state === "suspended") void kontext.current.resume().catch(() => {});
    }
    try {
      knoten.current?.stop();
    } catch {
      // schon gestoppt
    }
    knoten.current = null;
    try {
      ersatzSpieler.current?.pause();
    } catch {
      // schon gestoppt
    }
    for (const a of abbrueche.current.values()) a.abort();
    abbrueche.current.clear();
    schlange().leere();
    puffer.current.clear();
    for (const url of ersatzToene.current.values()) URL.revokeObjectURL(url);
    ersatzToene.current.clear();
    scheine.current.clear();
    laufendeNr.current = 0;
    spieltNr.current = null;
    fertigBis.current = 0;
    anDenStrom.current = [];
    nachricht.current = null;
    weg.current = null;
    setQuelle(null);
    setAbschnittSpricht(false);
    setAbschnittLaedt(false);
    setStromZustand({ laedt: false, spricht: false });
  }, []);

  useEffect(() => () => stoppeAlles(), [stoppeAlles]);

  /** Der naechste fertige Abschnitt, genau dann, wenn der vorige endet. */
  const spieleWeiter = useCallback(() => {
    const w = schlange();
    const meinDurchgang = durchgang.current;

    // Rueckfall: ein <audio>-Element, ein Abschnitt nach dem anderen.
    if (!hatWebAudio.current) {
      const spieler = ersatzSpieler.current;
      if (!spieler) return;
      const naechster = w.naechsterZumSpielen();
      if (!naechster) return aktualisiereAbschnitte();
      const url = ersatzToene.current.get(naechster.nr);
      if (!url) return aktualisiereAbschnitte();
      spieler.src = url;
      spieltNr.current = naechster.nr;
      spieler.onended = () => {
        if (meinDurchgang !== durchgang.current) return;
        URL.revokeObjectURL(url);
        ersatzToene.current.delete(naechster.nr);
        w.fertigGespielt(naechster.nr);
        spieltNr.current = null;
        fertigBis.current = Math.max(fertigBis.current, naechster.nr);
        spieleWeiter();
      };
      aktualisiereAbschnitte();
      void spieler.play().catch(() => {
        // Der Browser verweigert den Ton ohne Geste - dann bleibt es beim
        // Knopf je Antwort, und die Warteschlange wird nicht weiter bedient.
        if (meinDurchgang !== durchgang.current) return;
        w.fertigGespielt(naechster.nr);
        aktualisiereAbschnitte();
      });
      return;
    }

    const ctx = kontext.current;
    if (!ctx) return aktualisiereAbschnitte();
    const naechster = w.naechsterZumSpielen();
    if (!naechster) return aktualisiereAbschnitte();
    const daten = puffer.current.get(naechster.nr);
    if (!daten) return aktualisiereAbschnitte();

    const q = ctx.createBufferSource();
    q.buffer = daten;
    // Ueber den gemeinsamen Ausgang: die Kugel des Sprachmodus und das
    // Dazwischenreden lesen dort den Pegel (lib/ausgabe-pegel.ts).
    q.connect(ausgangFuer(ctx));
    q.onended = () => {
      if (meinDurchgang !== durchgang.current) return;
      puffer.current.delete(naechster.nr);
      w.fertigGespielt(naechster.nr);
      if (knoten.current === q) knoten.current = null;
      spieltNr.current = null;
      fertigBis.current = Math.max(fertigBis.current, naechster.nr);
      spieleWeiter();
    };
    knoten.current = q;
    spieltNr.current = naechster.nr;
    q.start();
    aktualisiereAbschnitte();
  }, [aktualisiereAbschnitte]);

  /** Holt, was die Warteschlange freigibt - hoechstens zwei gleichzeitig. */
  const holeNach = useCallback(() => {
    const w = schlange();
    if (hatWebAudio.current && !kontext.current) return;
    const meinDurchgang = durchgang.current;

    for (const eintrag of w.naechsteZumHolen()) {
      const schein = scheine.current.get(eintrag.nr);
      if (!schein) {
        w.melde(eintrag.nr, "fehler");
        continue;
      }
      const abbruch = new AbortController();
      abbrueche.current.set(eintrag.nr, abbruch);
      void (async () => {
        const gescheitert = () => {
          if (meinDurchgang !== durchgang.current) return;
          w.melde(eintrag.nr, "fehler");
          // Ein uebersprungener Abschnitt darf die Reihe nicht aufhalten.
          spieleWeiter();
          holeNach();
        };
        try {
          const { a } = schein;
          const antwort = await fetch("/api/ki-sprachausgabe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sprache: schein.sprache,
              abschnitt: { zug: a.zug, nr: a.nr, text: a.text, sig: a.sig, ablauf: a.ablauf },
            }),
            signal: abbruch.signal,
          });
          if (meinDurchgang !== durchgang.current) return;
          if (!antwort.ok) return gescheitert();
          if (!hatWebAudio.current) {
            ersatzToene.current.set(eintrag.nr, URL.createObjectURL(await antwort.blob()));
          } else {
            const roh = await antwort.arrayBuffer();
            // decodeAudioData zerstoert den uebergebenen Puffer - deshalb eine
            // Kopie, falls der Abschnitt noch einmal gebraucht wird.
            const dekodiert = await kontext.current!.decodeAudioData(roh.slice(0));
            if (meinDurchgang !== durchgang.current) return;
            puffer.current.set(eintrag.nr, dekodiert);
          }
          w.melde(eintrag.nr, "bereit");
          spieleWeiter();
          holeNach();
        } catch (f) {
          // Ein Abbruch ist kein Fehler: dann will niemand mehr zuhoeren.
          if ((f as Error)?.name !== "AbortError") gescheitert();
        } finally {
          abbrueche.current.delete(eintrag.nr);
        }
      })();
    }
    aktualisiereAbschnitte();
  }, [spieleWeiter, aktualisiereAbschnitte]);

  const stelleAbschnittEin = useCallback(
    (a: LiveAbschnitt, sprache: string) => {
      laufendeNr.current += 1;
      scheine.current.set(laufendeNr.current, { a, sprache });
      schlange().stelleEin(laufendeNr.current, a.text);
      holeNach();
    },
    [holeNach],
  );

  const holeSprecher = useCallback((): StromSprecher => {
    sprecher.current ??= erzeugeStromSprecher(() => kontext.current, {
      beiZustand: (z) => setStromZustand(z),
      gehalten: () => gehaltenRef.current,
      beiAufgabe: (grund, ungesprochen) => {
        console.warn("[damicon] Vorlese-Strom aufgegeben:", grund);
        // Knopf an einer Nachricht: klang noch nichts, liest der bisherige Weg
        // (ganze Antwort, api/ki-sprachausgabe) sie vor.
        const n = nachricht.current;
        if (n) {
          if (ungesprochen >= n.saetze) ohneStrom.current?.(n.id);
          return;
        }
        // Live: der Rest der Runde als signierte Abschnitte.
        weg.current = "abschnitte";
        const rest = anDenStrom.current.slice(Math.max(0, anDenStrom.current.length - ungesprochen));
        anDenStrom.current = [];
        for (const { a, sprache } of rest) stelleAbschnittEin(a, sprache);
      },
    });
    return sprecher.current;
  }, [stelleAbschnittEin]);

  /** Eine neue Runde (neue Nutzerfrage): alles Alte verstummt. */
  const neueRunde = useCallback(() => {
    stoppeAlles();
  }, [stoppeAlles]);

  /** Der Chat-Stream hat den Nachweis fuer diese Antwort geschickt: gleich einen
   *  Schluessel fuer den Strom holen, noch bevor der erste Satz da ist. */
  const nimmNachweis = useCallback(
    (n: ZugNachweis) => {
      if (!stromMoeglich()) return;
      holeSprecher().setzeNachweis({ art: "zug", zug: n.zug, ablauf: n.ablauf, sig: n.sig });
    },
    [holeSprecher],
  );

  /** Bei Folgeanfragen (Client-Werkzeug, Freigabe) bekommt die Nachricht eine
   *  neue ID; liest die Runde noch, zieht die Kennung mit - sonst zeigte der
   *  Knopf an der Nachricht nicht mehr "Stopp". */
  const folgeQuelle = useCallback((id: string) => {
    if (nachricht.current) return;
    setQuelle((bisher) => (bisher === null || bisher === id ? bisher : id));
  }, []);

  /** Ein neuer Abschnitt aus dem Stream. */
  const nimmAbschnitt = useCallback(
    (a: LiveAbschnitt, sprache: string) => {
      entsperre();
      setQuelle((bisher) => (bisher === a.zug ? bisher : a.zug));
      nachricht.current = null;
      weg.current ??= stromMoeglich() && hatWebAudio.current ? "strom" : "abschnitte";
      if (weg.current === "strom") {
        anDenStrom.current.push({ a, sprache });
        holeSprecher().sprich(zumSprechen(a.text, sprache), sprache, a.text, a.gebunden ?? null);
      } else {
        stelleAbschnittEin(a, sprache);
      }
    },
    [entsperre, holeSprecher, stelleAbschnittEin],
  );

  /** Die Antwort ist fertig geschrieben: der Strom bekommt kein Wort mehr. */
  const schliesseRunde = useCallback(() => {
    if (weg.current === "strom") sprecher.current?.ende();
  }, []);

  /** Eine fertige Antwort ueber den Strom vorlesen (Knopf an der Nachricht).
   *  false, wenn der Strom hier nicht in Frage kommt - dann liest der bisherige
   *  Weg (useSprachausgabe) sie vor. Muss synchron im Klick laufen (iPhone). */
  const sprichNachricht = useCallback(
    (id: string, markdown: string, sprache: string): boolean => {
      if (!stromMoeglich()) return false;
      stoppeAlles();
      entsperre();
      if (!hatWebAudio.current) return false;
      // Nur Saetze, die nach der Aufbereitung noch etwas zu sprechen haben -
      // sonst stimmte die Zahl fuer den Rueckfall nicht (beiAufgabe).
      const texte = saetzeAusAntwort(markdown)
        .map((satz) => zumSprechen(satz, sprache))
        .filter((t) => t.trim());
      if (texte.length === 0) return false;
      nachricht.current = { id, saetze: texte.length };
      weg.current = "strom";
      setQuelle(id);
      const s = holeSprecher();
      s.setzeNachweis({ art: "nachricht", nachrichtId: id });
      for (const t of texte) s.sprich(t, sprache);
      s.ende();
      return true;
    },
    [stoppeAlles, entsperre, holeSprecher],
  );

  /** Wo die Stimme gerade ist (nur im Strom-Weg, sonst null) - fuer den Takt und
   *  das Mitlesen im Sprachmodus. */
  const gerade = useCallback((): SprechStand | null => {
    if (weg.current === "strom") return sprecher.current?.stand() ?? null;
    if (weg.current !== "abschnitte" || laufendeNr.current === 0) return null;
    // Abschnitts-Weg: die laufende Nummer der Warteschlange ist der Satz.
    const anzahl = laufendeNr.current;
    const nr = spieltNr.current;
    if (nr === null) return { index: fertigBis.current, anzahl, satz: null };
    const schein = scheine.current.get(nr);
    return { index: nr - 1, anzahl, satz: schein?.a.text ?? null, ziel: schein?.a.gebunden ?? null };
  }, []);

  /** Haelt die Stimme an (Seitenwechsel im Sprachmodus, sprach-takt.ts), ohne
   *  etwas zu verwerfen: der AudioContext steht, die Zeitachse mit ihm. */
  const halte = useCallback((an: boolean) => {
    gehaltenRef.current = an;
    const ctx = kontext.current;
    if (!ctx) return;
    if (an && ctx.state === "running") void ctx.suspend().catch(() => {});
    else if (!an && ctx.state === "suspended") void ctx.resume().catch(() => {});
  }, []);

  const spricht = stromZustand.spricht || abschnittSpricht;
  const laedt = !spricht && (stromZustand.laedt || abschnittLaedt);
  const phase: VorlesePhase = spricht ? "spricht" : laedt ? "laedt" : "still";

  // Stabil halten: sonst ist der Rueckgabewert bei jedem Render ein neues
  // Objekt, und jeder Effekt, der ihn in den Abhaengigkeiten hat, laeuft
  // wieder an - bei einem Stream mit vielen Renderpassagen dutzendfach pro
  // Sekunde.
  return useMemo(
    () => ({
      phase,
      quelle: phase === "still" ? null : quelle,
      neueRunde,
      nimmNachweis,
      nimmAbschnitt,
      folgeQuelle,
      schliesseRunde,
      sprichNachricht,
      stoppeAlles,
      entsperre,
      gerade,
      halte,
    }),
    [phase, quelle, neueRunde, nimmNachweis, nimmAbschnitt, folgeQuelle, schliesseRunde, sprichNachricht, stoppeAlles, entsperre, gerade, halte],
  );
}
