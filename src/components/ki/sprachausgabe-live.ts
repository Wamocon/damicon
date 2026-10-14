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
//
// Aufbau: useTon (AudioContext, Rueckfall ohne Web Audio, Anhalten), useAbschnittsWeg (Weg 2)
// und useLiveSprachausgabe, das die Runde fuehrt und den Strom-Sprecher (Weg 1) haelt. Alle
// in dieser Datei: der Hook-Test in supabase/tests/ki-assistent.mjs ersetzt React nur fuer
// Module, die er selbst laedt.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { erzeugeWarteschlange, type Eintrag, type Warteschlange } from "@/lib/domain/sprachausgabe-warteschlange";
import { saetzeAusAntwort, zumSprechen } from "@/lib/domain/sprachausgabe";
import { sprachenFuerSaetze } from "@/lib/text/sprache-erkennen";
import { ausgangFuer } from "@/lib/ausgabe-pegel";
import type { VorlesePhase } from "@/lib/domain/vorlesen-zustand";
import { erzeugeStromSprecher, stromMoeglich, type SprechStand, type StromRueckmeldung, type StromSprecher, type StromZustand } from "@/components/ki/sprachausgabe-strom";
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

/** Ein Abschnitt und die Sprache, in der er gelesen wird. */
type Schein = { a: LiveAbschnitt; sprache: string };
/** Knopf an einer Nachricht (sprichNachricht): welche, wie viele Saetze an den
 *  Strom gingen, ihre Stelle unter allen Saetzen (saetzeAusAntwort) und wie
 *  viele das insgesamt waren - fuer den Rest im Datei-Weg (beiAufgabe). */
type KnopfNachricht = { id: string; saetze: number; stellen: number[]; gesamt: number };

// --- Ton --------------------------------------------------------------------------------

function useTon() {
  const kontext = useRef<AudioContext | null>(null);
  // Rueckfall ohne Web Audio: fertige Toene als Adresse (useAbschnittsWeg), gespielt von
  // einem <audio>-Element. Die Luecken sind groesser, aber es klingt.
  const ersatzSpieler = useRef<HTMLAudioElement | null>(null);
  const hatWebAudio = useRef(true);
  const gehaltenRef = useRef(false);

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

  /** Haelt die Stimme an (Seitenwechsel im Sprachmodus, sprach-takt.ts), ohne
   *  etwas zu verwerfen: der AudioContext steht, die Zeitachse mit ihm. */
  const halte = useCallback((an: boolean) => {
    gehaltenRef.current = an;
    const ctx = kontext.current;
    if (!ctx) return;
    if (an && ctx.state === "running") void ctx.suspend().catch(() => {});
    else if (!an && ctx.state === "suspended") void ctx.resume().catch(() => {});
  }, []);

  /** Eine angehaltene Stimme (Seitenwechsel) nicht angehalten zuruecklassen (stoppeAlles). */
  const gibFrei = useCallback(() => {
    if (gehaltenRef.current) {
      gehaltenRef.current = false;
      if (kontext.current?.state === "suspended") void kontext.current.resume().catch(() => {});
    }
  }, []);

  /** Beim Abbau: den Kontext schliessen und vergessen, damit ein erneutes Einhaengen neu aufbaut. */
  const schliesse = useCallback(() => {
    const ctx = kontext.current;
    kontext.current = null;
    void ctx?.close().catch(() => {});
  }, []);

  return { kontext, ersatzSpieler, hatWebAudio, gehaltenRef, entsperre, halte, gibFrei, schliesse };
}

// --- Weg 2: Abschnitte ---------------------------------------------------------------

/** Was ein Abspiel-Schritt von Weg 2 braucht. */
type Abspiel = {
  w: Warteschlange;
  meinDurchgang: number;
  durchgang: RefObject<number>;
  spieltNr: RefObject<number | null>;
  fertigBis: RefObject<number>;
  /** Der naechste fertige Abschnitt (spieleWeiter). */
  weiter: () => void;
  aktualisiere: () => void;
};

/** Rueckfall: ein <audio>-Element, ein Abschnitt nach dem anderen. */
function spieleUeberElement(s: Abspiel, spieler: HTMLAudioElement | null, ersatzToene: Map<number, string>): void {
  const { w, meinDurchgang, durchgang, spieltNr, fertigBis } = s;
  if (!spieler) return;
  const naechster = w.naechsterZumSpielen();
  if (!naechster) return s.aktualisiere();
  const url = ersatzToene.get(naechster.nr);
  if (!url) return s.aktualisiere();
  spieler.src = url;
  spieltNr.current = naechster.nr;
  spieler.onended = () => {
    if (meinDurchgang !== durchgang.current) return;
    URL.revokeObjectURL(url);
    ersatzToene.delete(naechster.nr);
    w.fertigGespielt(naechster.nr);
    spieltNr.current = null;
    fertigBis.current = Math.max(fertigBis.current, naechster.nr);
    s.weiter();
  };
  s.aktualisiere();
  void spieler.play().catch(() => {
    // Der Browser verweigert den Ton ohne Geste - dann bleibt es beim
    // Knopf je Antwort, und die Warteschlange wird nicht weiter bedient.
    if (meinDurchgang !== durchgang.current) return;
    w.fertigGespielt(naechster.nr);
    s.aktualisiere();
  });
}

/** Web Audio: der naechste dekodierte Abschnitt. */
function spieleUeberKontext(s: Abspiel, ctx: AudioContext | null, puffer: Map<number, AudioBuffer>, knoten: RefObject<AudioBufferSourceNode | null>): void {
  const { w, meinDurchgang, durchgang, spieltNr, fertigBis } = s;
  if (!ctx) return s.aktualisiere();
  const naechster = w.naechsterZumSpielen();
  if (!naechster) return s.aktualisiere();
  const daten = puffer.get(naechster.nr);
  if (!daten) return s.aktualisiere();

  const q = ctx.createBufferSource();
  q.buffer = daten;
  // Ueber den gemeinsamen Ausgang: die Lippen von Himbi im Sprachmodus und das
  // Dazwischenreden lesen dort Pegel und Spektrum (lib/ausgabe-pegel.ts).
  q.connect(ausgangFuer(ctx));
  q.onended = () => {
    if (meinDurchgang !== durchgang.current) return;
    puffer.delete(naechster.nr);
    w.fertigGespielt(naechster.nr);
    if (knoten.current === q) knoten.current = null;
    spieltNr.current = null;
    fertigBis.current = Math.max(fertigBis.current, naechster.nr);
    s.weiter();
  };
  knoten.current = q;
  spieltNr.current = naechster.nr;
  q.start();
  s.aktualisiere();
}

/** Was das Holen eines Abschnitts braucht. */
type Holung = {
  w: Warteschlange;
  eintrag: Eintrag;
  schein: Schein;
  abbruch: AbortController;
  meinDurchgang: number;
  durchgang: RefObject<number>;
  kontext: RefObject<AudioContext | null>;
  hatWebAudio: RefObject<boolean>;
  puffer: Map<number, AudioBuffer>;
  ersatzToene: Map<number, string>;
  abbrueche: Map<number, AbortController>;
  spieleWeiter: () => void;
  holeNach: () => void;
};

/** Holt einen Abschnitt als signierte Anfrage an api/ki-sprachausgabe und legt ihn
 *  bereit: dekodiert, ohne Web Audio als Adresse. */
async function holeAbschnitt(h: Holung): Promise<void> {
  const { w, eintrag, schein, meinDurchgang, durchgang, kontext, hatWebAudio, spieleWeiter, holeNach } = h;
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
      signal: h.abbruch.signal,
    });
    if (meinDurchgang !== durchgang.current) return;
    if (!antwort.ok) return gescheitert();
    if (!hatWebAudio.current) {
      h.ersatzToene.set(eintrag.nr, URL.createObjectURL(await antwort.blob()));
    } else {
      const roh = await antwort.arrayBuffer();
      // decodeAudioData zerstoert den uebergebenen Puffer - deshalb eine
      // Kopie, falls der Abschnitt noch einmal gebraucht wird.
      const dekodiert = await kontext.current!.decodeAudioData(roh.slice(0));
      if (meinDurchgang !== durchgang.current) return;
      h.puffer.set(eintrag.nr, dekodiert);
    }
    w.melde(eintrag.nr, "bereit");
    spieleWeiter();
    holeNach();
  } catch (f) {
    // Ein Abbruch ist kein Fehler: dann will niemand mehr zuhoeren.
    if ((f as Error)?.name !== "AbortError") gescheitert();
  } finally {
    h.abbrueche.delete(eintrag.nr);
  }
}

function useAbschnittsWeg({
  kontext,
  ersatzSpieler,
  hatWebAudio,
  durchgang,
  stromSpricht,
}: {
  kontext: RefObject<AudioContext | null>;
  ersatzSpieler: RefObject<HTMLAudioElement | null>;
  hatWebAudio: RefObject<boolean>;
  durchgang: RefObject<number>;
  stromSpricht: RefObject<boolean>;
}) {
  const [abschnittSpricht, setAbschnittSpricht] = useState(false);
  const [abschnittLaedt, setAbschnittLaedt] = useState(false);
  const warteschlange = useRef<Warteschlange | null>(null);
  const abbrueche = useRef(new Map<number, AbortController>());
  const puffer = useRef(new Map<number, AudioBuffer>());
  // Ohne Web Audio: die fertigen Toene als Adresse fuer das <audio>-Element.
  const ersatzToene = useRef(new Map<number, string>());
  // Signatur und Ablauf je Abschnitt, unter der LAUFENDEN Nummer der Runde (die
  // Nummern des Servers beginnen je Antwort wieder bei 1).
  const scheine = useRef(new Map<number, Schein>());
  const laufendeNr = useRef(0);
  const knoten = useRef<AudioBufferSourceNode | null>(null);
  // Fuer gerade() im Abschnitts-Weg: welcher Abschnitt gerade klingt, und bis
  // zu welchem alle fertig sind.
  const spieltNr = useRef<number | null>(null);
  const fertigBis = useRef(0);

  function schlange(): Warteschlange {
    warteschlange.current ??= erzeugeWarteschlange();
    return warteschlange.current;
  }

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

  /** Der naechste fertige Abschnitt, genau dann, wenn der vorige endet. */
  const spieleWeiter = useCallback(() => {
    const w = schlange();
    const meinDurchgang = durchgang.current;
    // Klingt noch eingeplanter Ton des Stroms (er hat live aufgegeben, der Rest kam
    // hierher), wartet der Abschnitt: beiAufgabe setzt dann nachholen, und es geht
    // weiter, sobald der Strom verklungen ist. Bis zum 29.09.2026 sprachen beide Stimmen
    // bis zu mehrere Sekunden gleichzeitig (Cleanup-Fund 30); der Knopf-Weg wartete schon.
    if (stromSpricht.current) return aktualisiereAbschnitte();
    const schritt: Abspiel = { w, meinDurchgang, durchgang, spieltNr, fertigBis, weiter: spieleWeiter, aktualisiere: aktualisiereAbschnitte };
    if (!hatWebAudio.current) return spieleUeberElement(schritt, ersatzSpieler.current, ersatzToene.current);
    spieleUeberKontext(schritt, kontext.current, puffer.current, knoten);
  }, [aktualisiereAbschnitte, durchgang, stromSpricht, hatWebAudio, ersatzSpieler, kontext]);

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
      void holeAbschnitt({
        w,
        eintrag,
        schein,
        abbruch,
        meinDurchgang,
        durchgang,
        kontext,
        hatWebAudio,
        puffer: puffer.current,
        ersatzToene: ersatzToene.current,
        abbrueche: abbrueche.current,
        spieleWeiter,
        holeNach,
      });
    }
    aktualisiereAbschnitte();
  }, [spieleWeiter, aktualisiereAbschnitte, hatWebAudio, kontext, durchgang]);

  const stelleAbschnittEin = useCallback(
    (a: LiveAbschnitt, sprache: string) => {
      laufendeNr.current += 1;
      scheine.current.set(laufendeNr.current, { a, sprache });
      schlange().stelleEin(laufendeNr.current, a.text);
      holeNach();
    },
    [holeNach],
  );

  /** Weg 2 sofort anhalten und vergessen (Teil von stoppeAlles). */
  const leere = useCallback(() => {
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
    setAbschnittSpricht(false);
    setAbschnittLaedt(false);
  }, [ersatzSpieler]);

  /** Wo Weg 2 ist: die laufende Nummer der Warteschlange ist der Satz. Null vor dem ersten Abschnitt. */
  const stand = useCallback((): SprechStand | null => {
    if (laufendeNr.current === 0) return null;
    const anzahl = laufendeNr.current;
    const nr = spieltNr.current;
    if (nr === null) return { index: fertigBis.current, anzahl, satz: null };
    const schein = scheine.current.get(nr);
    return { index: nr - 1, anzahl, satz: schein?.a.text ?? null, ziel: schein?.a.gebunden ?? null, vorher: scheine.current.get(nr - 1)?.a.text ?? null };
  }, []);

  return { abschnittSpricht, abschnittLaedt, spieleWeiter, stelleAbschnittEin, leere, stand };
}

// --- Weg 1: Strom, und die Uebergabe an Weg 2 -----------------------------------------------

/** Die Refs der Runde, die der Strom-Sprecher bei einer Aufgabe braucht. */
type Runde = {
  durchgang: RefObject<number>;
  weg: RefObject<"strom" | "abschnitte" | null>;
  anDenStrom: RefObject<Schein[]>;
  nachricht: RefObject<KnopfNachricht | null>;
  nachholen: RefObject<(() => void) | null>;
  stromSpricht: RefObject<boolean>;
  ohneStrom: RefObject<((id: string, rest?: number) => void) | undefined>;
  gehaltenRef: RefObject<boolean>;
};
/** Weg 2, soweit der Strom-Sprecher ihn braucht. */
type Rueckfall = {
  setStromZustand: (zustand: StromZustand) => void;
  stelleAbschnittEin: (a: LiveAbschnitt, sprache: string) => void;
  spieleWeiter: () => void;
};

function rueckmeldungFuer(runde: Runde, rueckfall: Rueckfall): StromRueckmeldung {
  const { nachholen, stromSpricht, gehaltenRef } = runde;
  return {
    beiZustand: (z) => {
      rueckfall.setStromZustand(z);
      stromSpricht.current = z.spricht;
      if (!z.spricht && nachholen.current) {
        const lies = nachholen.current;
        nachholen.current = null;
        lies();
      }
    },
    gehalten: () => gehaltenRef.current,
    beiAufgabe: (grund, ungesprochen) => {
      console.warn("[damicon] Vorlese-Strom aufgegeben:", grund);
      const n = runde.nachricht.current;
      if (n) return uebergibAnDatei(runde, n, ungesprochen);
      uebergibAnAbschnitte(runde, rueckfall, ungesprochen);
    },
  };
}

/** Knopf an einer Nachricht: der Datei-Weg (api/ki-sprachausgabe, Text aus
 *  der gespeicherten Nachricht) liest, was noch nicht geklungen hat - klang
 *  nichts, die ganze Antwort. Bis zum 28.09.2026 gab es den Rueckfall nur
 *  ohne jeden Ton; gab der Strom mittendrin auf (etwa beim 13. Schluessel
 *  einer Minute), endete das Vorlesen still. */
function uebergibAnDatei({ durchgang, nachholen, stromSpricht, ohneStrom }: Runde, n: KnopfNachricht, ungesprochen: number): void {
  if (ungesprochen <= 0) return;
  // Die Saetze zaehlen vom Ende her: `rest` Saetze der ganzen Antwort,
  // ab dem ersten, der nicht geklungen hat.
  const rest = ungesprochen >= n.saetze ? undefined : n.gesamt - (n.stellen[n.saetze - ungesprochen] ?? 0);
  const meinDurchgang = durchgang.current;
  const lies = () => {
    if (meinDurchgang === durchgang.current) ohneStrom.current?.(n.id, rest);
  };
  if (stromSpricht.current) nachholen.current = lies;
  else lies();
}

/** Live: der Rest der Runde als signierte Abschnitte. Sie werden sofort eingestellt
 *  (geholt wird gleich, und neue Abschnitte aus dem Stream reihen sich dahinter),
 *  gespielt aber erst, wenn der Strom verklungen ist (spieleWeiter). */
function uebergibAnAbschnitte({ durchgang, weg, anDenStrom, nachholen, stromSpricht }: Runde, { stelleAbschnittEin, spieleWeiter }: Rueckfall, ungesprochen: number): void {
  weg.current = "abschnitte";
  const rest = anDenStrom.current.slice(Math.max(0, anDenStrom.current.length - ungesprochen));
  anDenStrom.current = [];
  for (const { a, sprache } of rest) stelleAbschnittEin(a, sprache);
  if (stromSpricht.current) {
    const meinDurchgang = durchgang.current;
    nachholen.current = () => {
      if (meinDurchgang === durchgang.current) spieleWeiter();
    };
  }
}

/** Die Saetze einer fertigen Antwort fuer den Strom, je Satz in seiner Sprache.
 *
 *  Nur Saetze, die nach der Aufbereitung noch etwas zu sprechen haben -
 *  sonst stimmte die Zahl fuer den Rueckfall nicht (beiAufgabe).
 *
 *  Die Stimme je Satz (seit 28.09.2026): `sprache` ist die der Antwort, ein
 *  Satz in einer anderen Sprache (das russische Zitat in einer deutschen
 *  Antwort) bekommt seine eigene - und zumSprechen dieselbe, sonst
 *  stellte es Umlaute in einem russischen Satz her. Dieselbe Folge wie
 *  der Server (sprachenFuerSaetze): hoechstens vier Wechsel, denn jeder
 *  kostet einen Strom und einen Schluessel. */
function saetzeZumSprechen(markdown: string, sprache: string): { texte: Array<{ stelle: number; text: string; sprache: string }>; gesamt: number } {
  const saetze = saetzeAusAntwort(markdown);
  const sprachen = sprachenFuerSaetze(saetze, sprache);
  const texte = saetze
    .map((satz, stelle) => ({ stelle, text: zumSprechen(satz, sprachen[stelle]!), sprache: sprachen[stelle]! }))
    .filter((t) => t.text.trim());
  return { texte, gesamt: saetze.length };
}

// --- Die Runde ------------------------------------------------------------------------------

export function useLiveSprachausgabe({ beiNachrichtOhneStrom }: { beiNachrichtOhneStrom?: (id: string, rest?: number) => void } = {}) {
  const [stromZustand, setStromZustand] = useState<StromZustand>({ laedt: false, spricht: false });
  // Welche Nachricht gerade gelesen wird (fuer den Knopf an der Nachricht).
  const [quelle, setQuelle] = useState<string | null>(null);

  const { kontext, ersatzSpieler, hatWebAudio, gehaltenRef, entsperre, halte, gibFrei, schliesse: schliesseTon } = useTon();
  const durchgang = useRef(0);
  const weg = useRef<"strom" | "abschnitte" | null>(null);
  // Alles, was in dieser Runde an den Strom ging - fuer die Uebergabe an Weg 2.
  const anDenStrom = useRef<Schein[]>([]);
  const nachricht = useRef<KnopfNachricht | null>(null);
  // Was nach einer Aufgabe des Stroms den Rest liest (am Knopf der Datei-Weg, live die
  // Abschnitte), sobald der eingeplante Ton des Stroms verklungen ist - sonst spraechen
  // zwei Stimmen gleichzeitig.
  const nachholen = useRef<(() => void) | null>(null);
  const stromSpricht = useRef(false);
  const sprecher = useRef<StromSprecher | null>(null);
  const ohneStrom = useRef(beiNachrichtOhneStrom);
  useEffect(() => {
    ohneStrom.current = beiNachrichtOhneStrom;
  }, [beiNachrichtOhneStrom]);

  const abschnitte = useAbschnittsWeg({ kontext, ersatzSpieler, hatWebAudio, durchgang, stromSpricht });
  const { spieleWeiter, stelleAbschnittEin, leere: leereAbschnitte, stand: abschnittStand } = abschnitte;

  /** Alles anhalten. Muss unter 200 ms durch sein, deshalb zuerst der Ton und
   *  erst danach das Aufraeumen. */
  const stoppeAlles = useCallback(() => {
    // Vor dem Stopp des Sprechers: der meldet danach "still", und ein
    // wartender Rest setzte sonst genau jetzt ein.
    nachholen.current = null;
    durchgang.current += 1;
    sprecher.current?.stopp();
    gibFrei();
    leereAbschnitte();
    anDenStrom.current = [];
    nachricht.current = null;
    weg.current = null;
    setQuelle(null);
    setStromZustand({ laedt: false, spricht: false });
  }, [gibFrei, leereAbschnitte]);

  // Beim Abbau alles freigeben: stoppeAlles() haelt nur an und laesst die Verbindung des
  // Strom-Sprechers fuer die naechste Frage offen. Bis zum 29.09.2026 blieb deshalb nach dem
  // Abbau die Verbindung samt Keepalive bis zum Leerlauf offen, die Aufsicht tickte, und der
  // AudioContext wurde nie geschlossen (Cleanup-Fund 31). Die Refs werden geleert, damit ein
  // erneutes Einhaengen (React StrictMode) neu aufbaut statt einen geschlossenen Kontext zu nutzen.
  useEffect(
    () => () => {
      stoppeAlles();
      sprecher.current?.schliesse();
      sprecher.current = null;
      schliesseTon();
    },
    [stoppeAlles, schliesseTon],
  );

  const holeSprecher = useCallback((): StromSprecher => {
    sprecher.current ??= erzeugeStromSprecher(
      () => kontext.current,
      rueckmeldungFuer({ durchgang, weg, anDenStrom, nachricht, nachholen, stromSpricht, ohneStrom, gehaltenRef }, { setStromZustand, stelleAbschnittEin, spieleWeiter }),
    );
    return sprecher.current;
  }, [stelleAbschnittEin, spieleWeiter, kontext, gehaltenRef]);

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
    [entsperre, hatWebAudio, holeSprecher, stelleAbschnittEin],
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
      const { texte, gesamt } = saetzeZumSprechen(markdown, sprache);
      if (texte.length === 0) return false;
      nachricht.current = { id, saetze: texte.length, stellen: texte.map((t) => t.stelle), gesamt };
      weg.current = "strom";
      setQuelle(id);
      const s = holeSprecher();
      s.setzeNachweis({ art: "nachricht", nachrichtId: id });
      for (const t of texte) s.sprich(t.text, t.sprache);
      s.ende();
      return true;
    },
    [stoppeAlles, entsperre, hatWebAudio, holeSprecher],
  );

  /** Wo die Stimme gerade ist (nur im Strom-Weg, sonst null) - fuer den Takt und
   *  das Mitlesen im Sprachmodus. */
  const gerade = useCallback((): SprechStand | null => {
    if (weg.current === "strom") return sprecher.current?.stand() ?? null;
    if (weg.current !== "abschnitte") return null;
    return abschnittStand();
  }, [abschnittStand]);

  const spricht = stromZustand.spricht || abschnitte.abschnittSpricht;
  const laedt = !spricht && (stromZustand.laedt || abschnitte.abschnittLaedt);
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
