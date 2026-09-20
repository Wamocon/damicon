"use client";

import { useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { Himbi } from "@/components/haustier/himbi";
import "@/components/haustier/feld-lader.css";

// Ladeanzeige fuer grosse Warteschritte (bisher nur der Einstieg ins Dashboard,
// dashboard/loading.tsx): DamiAI geht ueber den Feldweg, die eigene kleine
// Himbeerreihe zieht langsamer als der Pfad vorbei. Reines SVG und CSS, keine
// Google Fonts, kein Bild aus dem Netz - lief bisher offline nur, weil nichts
// nachgeladen werden musste (public/sw.js, offline.html), und das soll bei dieser
// Anzeige genauso bleiben: auf dem Betrieb ist oft kein Netz.
//
// Tracht und Brille kommen aus demselben Inventar wie der Begleiter in der Ecke
// (haustier-kontext.tsx) - wer die Farbe in den Einstellungen gewechselt hat,
// sieht hier dieselbe Figur, nicht eine zweite mit eigenem Stand.
export function FeldLader({ text }: { text?: string }) {
  const { inventar } = useHaustierStatus();

  return (
    <div className="fl-buehne" role="status" aria-live="polite">
      <div className="fl-himmel" aria-hidden>
        <span className="fl-wolke fl-wolke--1" />
        <span className="fl-wolke fl-wolke--2" />
        <span className="fl-sonne" />
      </div>

      <div className="fl-farmspur" aria-hidden>
        {Array.from({ length: 16 }, (_, i) => (
          <span className="fl-busch" key={i}>
            <span className="fl-busch__laub" />
            <span className="fl-busch__frucht fl-busch__frucht--1" />
            <span className="fl-busch__frucht fl-busch__frucht--2" />
            <span className="fl-busch__frucht fl-busch__frucht--3" />
          </span>
        ))}
      </div>

      <div className="fl-pfad" aria-hidden>
        <div className="fl-pfad__lauf">
          {Array.from({ length: 30 }, (_, i) => (
            <span className="fl-stein" key={i} />
          ))}
        </div>
      </div>

      <div className="fl-figur-buehne">
        <span className="fl-staub fl-staub--l" aria-hidden />
        <span className="fl-staub fl-staub--r" aria-hidden />
        <span className="fl-schatten" aria-hidden />
        <div className="fl-figur">
          <Himbi zustand="ruhe" tracht={inventar.tracht} brille={inventar.brille} groesse={68} />
        </div>
      </div>

      {text ? <p className="fl-text">{text}</p> : <span className="sr-only">Lädt …</span>}
    </div>
  );
}
