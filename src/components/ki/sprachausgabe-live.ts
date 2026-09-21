"use client";

// Vorlesen, waehrend die Antwort noch geschrieben wird.
//
// Der alte Weg liest eine FERTIGE Antwort vor: ein Knopf, eine Datei, ein
// Abspielen. Hier kommen die Abschnitte nacheinander herein, waehrend das
// Modell noch schreibt - und muessen trotzdem in der richtigen Reihenfolge
// und ohne Luecke klingen.
//
// Drei Dinge machen den Unterschied zum alten Weg:
//
//   1. Web Audio statt <audio>. Ein <audio>-Element pro Abschnitt haette
//      zwischen zwei Abschnitten eine hoerbare Luecke (Laden, Dekodieren,
//      Starten). Mit einem AudioContext wird vorab dekodiert und der
//      naechste Abschnitt genau dann eingeplant, wenn der vorige endet.
//   2. Der AudioContext wird bei einer BEDIENUNG entsperrt (Senden-Klick,
//      Mikrofon-Stopp). Auf dem iPhone darf Ton nur nach einer Geste
//      beginnen; wer das erst beim ersten Abschnitt versucht, bekommt
//      Stille und keinen Fehler.
//   3. Sofort still. Mikrofon an, jemand tippt, neue Frage, Stopp, Panel zu:
//      alles endet auf der Stelle - auch die Anfragen, die noch unterwegs
//      sind. Sonst spraeche die Antwort auf eine Frage weiter, die niemand
//      mehr gestellt hat.
import { useCallback, useEffect, useRef, useState } from "react";
import { erzeugeWarteschlange, type Warteschlange } from "@/lib/domain/sprachausgabe-warteschlange";

export type LiveAbschnitt = { zug: string; nr: number; text: string; sig: string; ablauf: number };

export function useLiveSprachausgabe(aktiv: boolean) {
  const [spricht, setSpricht] = useState(false);
  const [laedtErsten, setLaedtErsten] = useState(false);

  const kontext = useRef<AudioContext | null>(null);
  const warteschlange = useRef<Warteschlange | null>(null);
  const abbrueche = useRef(new Map<number, AbortController>());
  const puffer = useRef(new Map<number, AudioBuffer>());
  // Signatur und Ablauf je Abschnitt. Getrennt von der Warteschlange: die
  // kuemmert sich um die Reihenfolge, nicht um Berechtigungen.
  const scheine = useRef(new Map<number, LiveAbschnitt>());
  const quelle = useRef<AudioBufferSourceNode | null>(null);
  const zugRef = useRef<string | null>(null);
  const spracheRef = useRef<string>("de");

  if (!warteschlange.current) warteschlange.current = erzeugeWarteschlange();

  /** Auf dem iPhone muss der Ton aus einer Geste heraus starten. Deshalb wird
   *  der Kontext beim Senden-Klick bzw. beim Mikrofon-Stopp entsperrt, lange
   *  bevor der erste Abschnitt da ist. */
  const entsperre = useCallback(() => {
    try {
      kontext.current ??= new AudioContext();
      if (kontext.current.state === "suspended") void kontext.current.resume();
    } catch {
      // Kein Web Audio (sehr alter Browser): dann bleibt es beim Knopf je Antwort.
    }
  }, []);

  /** Alles anhalten. Muss unter 200 ms durch sein, deshalb zuerst der Ton und
   *  erst danach das Aufraeumen. */
  const stoppeAlles = useCallback(() => {
    try {
      quelle.current?.stop();
    } catch {
      // schon gestoppt
    }
    quelle.current = null;
    for (const a of abbrueche.current.values()) a.abort();
    abbrueche.current.clear();
    warteschlange.current?.leere();
    puffer.current.clear();
    scheine.current.clear();
    zugRef.current = null;
    setSpricht(false);
    setLaedtErsten(false);
  }, []);

  useEffect(() => () => stoppeAlles(), [stoppeAlles]);
  useEffect(() => {
    if (!aktiv) stoppeAlles();
  }, [aktiv, stoppeAlles]);

  /** Der naechste fertige Abschnitt, genau dann, wenn der vorige endet. */
  const spieleWeiter = useCallback(() => {
    const w = warteschlange.current;
    const ctx = kontext.current;
    if (!w || !ctx) return;
    const naechster = w.naechsterZumSpielen();
    if (!naechster) return;
    const daten = puffer.current.get(naechster.nr);
    if (!daten) return;

    const q = ctx.createBufferSource();
    q.buffer = daten;
    q.connect(ctx.destination);
    q.onended = () => {
      puffer.current.delete(naechster.nr);
      w.fertigGespielt(naechster.nr);
      if (quelle.current === q) quelle.current = null;
      const weiter = w.stand().some((e) => e.stand !== "fertig" && e.stand !== "uebersprungen");
      setSpricht(weiter);
      spieleWeiter();
    };
    quelle.current = q;
    setSpricht(true);
    setLaedtErsten(false);
    q.start();
  }, []);

  /** Holt, was die Warteschlange freigibt - hoechstens zwei gleichzeitig. */
  const holeNach = useCallback(() => {
    const w = warteschlange.current;
    const ctx = kontext.current;
    if (!w || !ctx || !zugRef.current) return;

    for (const eintrag of w.naechsteZumHolen()) {
      const schein = scheine.current.get(eintrag.nr);
      if (!schein) { w.melde(eintrag.nr, "fehler"); continue; }
      const abbruch = new AbortController();
      abbrueche.current.set(eintrag.nr, abbruch);
      void (async () => {
        try {
          const antwort = await fetch("/api/ki-sprachausgabe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sprache: spracheRef.current,
              abschnitt: { zug: schein.zug, nr: schein.nr, text: schein.text, sig: schein.sig, ablauf: schein.ablauf },
            }),
            signal: abbruch.signal,
          });
          if (!antwort.ok) { w.melde(eintrag.nr, "fehler"); holeNach(); return; }
          const roh = await antwort.arrayBuffer();
          // decodeAudioData zerstoert den uebergebenen Puffer - deshalb eine
          // Kopie, falls der Abschnitt noch einmal gebraucht wird.
          puffer.current.set(eintrag.nr, await ctx.decodeAudioData(roh.slice(0)));
          w.melde(eintrag.nr, "bereit");
          spieleWeiter();
          holeNach();
        } catch (f) {
          // Ein Abbruch ist kein Fehler: dann will niemand mehr zuhoeren.
          if ((f as Error)?.name !== "AbortError") { w.melde(eintrag.nr, "fehler"); holeNach(); }
        } finally {
          abbrueche.current.delete(eintrag.nr);
        }
      })();
    }
  }, [spieleWeiter]);

  /** Ein neuer Abschnitt aus dem Stream. */
  const nimmAbschnitt = useCallback(
    (abschnitt: LiveAbschnitt, sprache: string) => {
      if (!aktiv) return;
      spracheRef.current = sprache;
      // Ein neuer Zug raeumt den alten weg - sonst spraeche die vorige
      // Antwort in die neue hinein.
      if (zugRef.current !== abschnitt.zug) {
        stoppeAlles();
        zugRef.current = abschnitt.zug;
        setLaedtErsten(true);
      }
      entsperre();
      const w = warteschlange.current;
      if (!w) return;
      scheine.current.set(abschnitt.nr, abschnitt);
      w.stelleEin(abschnitt.nr, abschnitt.text);
      holeNach();
    },
    [aktiv, entsperre, holeNach, stoppeAlles],
  );

  return { spricht, laedtErsten, nimmAbschnitt, stoppeAlles, entsperre };
}
