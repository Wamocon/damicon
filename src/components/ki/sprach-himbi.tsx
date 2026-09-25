"use client";

import "@/components/haustier/haustier.css";
import { useEffect, useRef } from "react";
import { Himbi } from "@/components/haustier/himbi";
import { useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { himbiStill } from "@/lib/haustier";
import { lesePegel as leseMikrofonPegel } from "@/lib/hoeren";
import { leseAusgabePegel, leseAusgabeSpektrum, spieltUeberElement } from "@/lib/ausgabe-pegel";
import { baenderAus, folgeSpitze, glaetteMund, MUND_ZU, mundAusKlang, mundGeometrie, SPITZE_BODEN, type Mundform } from "@/lib/domain/lippen";
import {
  blickImGespraech,
  darfRuhen,
  faelligeForm,
  glaetteSchein,
  HIMBI_ZUSTAND,
  laechelnFuer,
  nickenProzent,
  scheinStil,
  scheinZiel,
  sichtbareForm,
  taktMund,
  type MundEintrag,
  type SprachZustand,
} from "@/lib/domain/himbi-gespraech";

export type { SprachZustand } from "@/lib/domain/himbi-gespraech";

// Himbi als Gegenueber im Sprachmodus. Bis zum 25.09.2026 stand dort eine abstrakte
// Kugel (Canvas); jetzt fuehrt die Figur das Gespraech: sie hoert zu, denkt (die
// KI-Funken kreisen) und spricht mit Lippen, die dem Klang der Stimme folgen
// (lib/domain/lippen.ts). Rueckmeldung vom 25.09.2026: "anstatt der Sprachblase die
// Himbi-Figur, die beim Sprechen die Lippen bewegt".
//
// Wie bei der Kugel geht nichts davon durch React: eine eigene Bildschleife liest
// Pegel und Spektrum und schreibt Mundform, Blick, Schein und Nicken direkt an die
// Elemente, die sie brauchen. Was sie rechnet, steht als reine Funktionen in
// lib/domain/himbi-gespraech.ts. React rendert nur, wenn der Zustand wechselt.
//
// Ist Himbi in den Einstellungen ausgeschaltet oder weggeschickt, bleibt die Figur
// auch hier weg ("bleibt ganz weg", sagt die Einstellung): dann zeigt der Schein
// allein den Zustand, als farbiger Kreis wie frueher die Kugel.

/** Groesse der Figur: in der Mitte oder links angedockt. Die Pixel stehen in
 *  sprachmodus.css (--himbi-b), dort passen sie sich auch kleinen Hoehen an. */
export type SprachHimbiGroesse = "mitte" | "klein";

export interface Blickziel {
  x: number;
  y: number;
}

/** Augenhoehe im viewBox 96 x 144 von himbi.tsx (Augen bei y 68): 68/144. */
const AUGEN_ANTEIL = 68 / 144;

export function SprachHimbi({
  zustand,
  groesse,
  blickziel,
  links = false,
}: {
  zustand: SprachZustand;
  groesse: SprachHimbiGroesse;
  /** Mittelpunkt eines hervorgehobenen Bereichs (Bildschirmkoordinaten): Himbi sieht hin. */
  blickziel?: Blickziel | null;
  /** Himbi steht links ueber der Navigationsleiste: ohne Ziel sieht er zur Seite hin. */
  links?: boolean;
}) {
  const { inventar, an, weg } = useHaustierStatus();
  const mitFigur = an && !weg;
  const huelle = useRef<HTMLDivElement>(null);
  const zustandRef = useRef(zustand);
  const blickRef = useRef(blickziel ?? null);
  const linksRef = useRef(links);
  const weckeRef = useRef<() => void>(() => {});

  useEffect(() => {
    zustandRef.current = zustand;
    blickRef.current = blickziel ?? null;
    linksRef.current = links;
    weckeRef.current();
  }, [zustand, blickziel, links]);

  useEffect(() => {
    const el = huelle.current;
    if (!el) return;
    const teil = (name: string) => el.querySelector<SVGElement>(`[data-lippe="${name}"]`);
    const umriss = teil("umriss");
    const hoehle = teil("hoehle");
    const clip = teil("clip");
    const zunge = teil("zunge");
    const zaehne = teil("zaehne");
    const schein = el.querySelector<HTMLElement>(".ki-himbi__schein");
    const koerper = el.querySelector<HTMLElement>(".ki-himbi__koerper");

    let bild = 0;
    let laeuft = false;
    let letzte = 0;
    let mund: Mundform = MUND_ZU;
    let spitze = SPITZE_BODEN;
    let scheinWert = 0;
    let letzterPfad = "";
    let letzterBlick = "";
    let letzterSchein = "";
    let letztesNicken = "";
    let rechteck: DOMRect | null = null;
    let rechteckZeit = 0;
    const verlauf: MundEintrag[] = [];
    let latenzMs = 0;
    // Reduzierte Bewegung wird nachgefuehrt, nicht nur beim Einhaengen gelesen: der
    // Schalter "Bewegung" laesst sich waehrend des Gespraechs umlegen.
    let still = himbiStill();

    const schleife = (jetzt: number) => {
      const dt = letzte ? jetzt - letzte : 16;
      letzte = jetzt;
      const z = zustandRef.current;

      let ziel: Mundform = MUND_ZU;
      let mikrofon = 0;
      if (z === "spricht") {
        const pegel = leseAusgabePegel();
        spitze = folgeSpitze(spitze, pegel, dt);
        const s = leseAusgabeSpektrum();
        if (s) {
          latenzMs = s.latenz * 1000;
          ziel = mundAusKlang(pegel / spitze, baenderAus(s.frequenzen, s.abtastrate, s.fftGroesse, s.minDb, s.maxDb));
        }
        // Datei-Weg: der Klang laeuft am Analyser vorbei, dann wenigstens im Takt.
        if (pegel === 0 && spieltUeberElement()) ziel = taktMund(jetzt);
      } else if (z === "hoert") {
        mikrofon = leseMikrofonPegel();
      }
      mund = glaetteMund(mund, faelligeForm(verlauf, jetzt, ziel, latenzMs), dt);

      // Mund: nur schreiben, wenn sich die Form sichtbar aendert.
      const g = mundGeometrie(sichtbareForm(still, z, mund), laechelnFuer(z));
      if (g.pfad !== letzterPfad) {
        letzterPfad = g.pfad;
        umriss?.setAttribute("d", g.pfad);
        hoehle?.setAttribute("d", g.pfad);
        clip?.setAttribute("d", g.pfad);
        if (zunge) {
          zunge.setAttribute("cy", String(g.zunge.cy));
          zunge.setAttribute("rx", String(g.zunge.rx));
          zunge.setAttribute("ry", String(g.zunge.ry));
        }
        if (zaehne) {
          zaehne.setAttribute("y", String(g.zaehne.y));
          zaehne.setAttribute("height", String(g.zaehne.hoehe));
          zaehne.setAttribute("opacity", String(g.zaehne.deckkraft));
        }
      }

      // Schein und Nicken direkt an ihre zwei Elemente, nicht als geerbte Variable an
      // die Huelle: die haette je Bild alle Teile der Figur neu berechnen lassen.
      scheinWert = glaetteSchein(scheinWert, scheinZiel(z, mikrofon, mund.offen), dt);
      const stil = scheinStil(still ? 0 : scheinWert);
      const scheinText = `${stil.deckkraft.toFixed(3)} ${stil.groesse.toFixed(3)}`;
      if (schein && scheinText !== letzterSchein) {
        letzterSchein = scheinText;
        schein.style.opacity = stil.deckkraft.toFixed(3);
        schein.style.scale = stil.groesse.toFixed(3);
      }
      const nicken = `0 ${(still ? 0 : nickenProzent(mund.offen)).toFixed(2)}%`;
      if (koerper && nicken !== letztesNicken) {
        letztesNicken = nicken;
        koerper.style.translate = nicken;
      }

      // Blick: das Rechteck der Figur wird nur gebraucht, wenn es ein Ziel gibt.
      const b = blickRef.current;
      if (b && (!rechteck || jetzt - rechteckZeit > 250)) {
        rechteck = el.getBoundingClientRect();
        rechteckZeit = jetzt;
      }
      const abstand = b && rechteck ? { dx: b.x - (rechteck.left + rechteck.width / 2), dy: b.y - (rechteck.top + rechteck.height * AUGEN_ANTEIL) } : null;
      const blick = blickImGespraech(z, abstand, linksRef.current);
      const blickText = `${blick.x.toFixed(2)} ${blick.y.toFixed(2)}`;
      if (blickText !== letzterBlick) {
        letzterBlick = blickText;
        el.style.setProperty("--bx", blick.x.toFixed(2));
        el.style.setProperty("--by", blick.y.toFixed(2));
      }

      // In Pause und Fehler schlaeft die Schleife, sobald alles zur Ruhe gekommen ist.
      if (darfRuhen(z, mund, scheinWert)) {
        laeuft = false;
        return;
      }
      bild = requestAnimationFrame(schleife);
    };

    const wecke = () => {
      if (laeuft) return;
      laeuft = true;
      letzte = 0;
      bild = requestAnimationFrame(schleife);
    };
    weckeRef.current = wecke;

    const neuStill = () => {
      still = himbiStill();
      wecke();
    };
    const medien = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    medien?.addEventListener?.("change", neuStill);
    const beobachter = new MutationObserver(neuStill);
    beobachter.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hb-still"] });

    wecke();
    return () => {
      cancelAnimationFrame(bild);
      laeuft = false;
      weckeRef.current = () => {};
      medien?.removeEventListener?.("change", neuStill);
      beobachter.disconnect();
    };
  }, [mitFigur]);

  return (
    <div ref={huelle} className="ki-himbi" data-zustand={zustand} data-groesse={groesse} data-figur={mitFigur ? undefined : "aus"}>
      <span className="ki-himbi__schein" aria-hidden />
      {mitFigur ? (
        <div className="ki-himbi__koerper">
          <Himbi zustand={HIMBI_ZUSTAND[zustand]} groesse={groesse === "klein" ? 84 : 160} tracht={inventar.tracht} brille={inventar.brille} lippen />
        </div>
      ) : null}
    </div>
  );
}
