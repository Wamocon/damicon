import { Himbi } from "@/components/haustier/himbi";
import "@/components/haustier/haustier.css";

// Ladebild: ein Kuehl-LKW mit Himbeere am Koffer faehrt, solange Next.js die
// Seite nachlaedt.
//
// Der Trick der ganzen Animation ist, dass der LKW sich nicht von der Stelle
// bewegt. Die Welt bewegt sich: Die Fahrbahnstriche laufen nach links, der
// Aufbau federt auf und ab, die Raeder drehen sich. Erst zusammen liest sich
// das als Fahrt. Bewegt wird ausschliesslich ueber transform, damit die
// Animation im Compositor laeuft und kein Layout anfasst.
//
// Alles steckt in einem einzigen SVG, damit die Teile im selben
// Koordinatensystem liegen und die ganze Zeichnung ueber eine einzige Breite
// skaliert. Die Vorlage (uiverse.io/vinodjangid07, MIT) setzt dafuer mehrere
// HTML-Elemente mit festen Pixelwerten nebeneinander; uebernommen sind von
// dort die Pfade von Kabine, Scheibe und Koffer, nicht der Aufbau.
//
// Gegenueber der Vorlage drehen sich hier die Raeder, und zwar passend zur
// Strasse: ein Rad mit r = 12 hat 75,4 Einheiten Umfang, die Strasse laeuft
// 40 Einheiten in 0,9 s, also 44,4 Einheiten je Sekunde - eine Umdrehung
// dauert damit 1,7 s. Ohne diese Rechnung rutschen die Raeder sichtbar.

// Fahrbahnstriche, Abstand 40. Gezeichnet wird von -40 bis 280, also eine
// Periode vor und eine hinter dem sichtbaren Bereich (0 bis 240). Die Gruppe
// wandert um genau eine Periode; danach steht wieder ein Strich dort, wo zu
// Beginn einer stand, und der Sprung zurueck faellt nicht auf.
const STRICHE = Array.from({ length: 9 }, (_, i) => -40 + i * 40);

// Laternen, Abstand 180. Dieselbe Rechnung wie bei den Strichen, nur mit
// groesserer Periode: Die Gruppe wandert um genau 180 Einheiten, danach steht
// wieder eine Laterne dort, wo zu Beginn eine stand. Bei 44,4 Einheiten je
// Sekunde dauert das 4,05 s - dieselbe Geschwindigkeit wie die Fahrbahn, sonst
// zoege die Strasse unter den Laternen weg.
const LATERNEN = [0, 180, 360];

// Fuenf Speichen je Rad. Ein Kreuz aus vier Speichen sieht nach einer
// Vierteldrehung wieder gleich aus und wirkt dann, als stuende das Rad.
const SPEICHEN = Array.from({ length: 5 }, (_, i) => (i / 5) * 2 * Math.PI);

const RAEDER = [54, 179] as const;
const RADMITTE = 104;
const RADIUS = 12;

// Der LKW behaelt in beiden Farbschemata seine Objektfarben, wie es die
// Illustrationsregel oben in globals.css vorgibt: Er ist eine Abbildung, kein
// Markenzeichen. Das traegt hier auch praktisch, denn der Koffer ist hell und
// hebt sich sowohl vom weissen als auch vom nachtblauen Seitengrund ab.
//
// currentColor nimmt nur die Welt um ihn herum - die Fahrbahn. Sie muss
// kippen, sonst laege im Dark Mode eine dunkle Strasse auf dunklem Grund.
// Fuer alles, was auf dem hellen Koffer sitzt, waere currentColor sogar
// schaedlich: Im Dark Mode stuende es weiss auf weiss.
const KOFFER = "#f2f6f7";
const SCHEIBE = "#bfe3ec";
const KABINE = "#00768f";
const SCHEINWERFER = "#fec50c";
const KONTUR = "#12222a";
const REIFEN = "#24343b";
// Heller Ring um den Reifen. Im hellen Schema faellt er kaum auf, im dunklen
// ist er das Einzige, was den dunklen Reifen vom dunklen Seitengrund trennt.
const FELGE = "#e6edef";

export function LkwLader({ groesse = 280 }: { groesse?: number }) {
  return (
    <svg
      viewBox="0 -36 240 160"
      width={groesse}
      height={(groesse / 240) * 160}
      aria-hidden
      className="max-w-full text-foreground"
    >
      {/* Fahrbahn. Die ruhige Linie liegt unter den wandernden Strichen. */}
      <rect x="0" y="116" width="240" height="2.5" rx="1.25" fill="currentColor" fillOpacity="0.22" />
      <g className="motion-safe:animate-[lkw-strasse_0.9s_linear_infinite]">
        {STRICHE.map((x) => (
          <rect key={x} x={x} y="116" width="18" height="2.5" rx="1.25" fill="currentColor" fillOpacity="0.8" />
        ))}
      </g>

      {/* Laternen. Sie stehen hinter dem LKW, damit die Zeichnung auf dem Koffer
          frei bleibt; im Original laufen sie davor. Sichtbar ist vor allem der
          Mast oberhalb des Kuehlkoffers - genau das macht die Fahrt lesbar. Sie
          gehoeren zur Welt und nicht zum Fahrzeug, nehmen also currentColor und
          kippen mit dem Farbschema. */}
      <g className="motion-safe:animate-[lkw-laterne_4.05s_linear_infinite]">
        {LATERNEN.map((x) => (
          <g key={x} transform={`translate(${x} 0)`} fill="currentColor" fillOpacity="0.3">
            <rect x="-5" y="108" width="10" height="8" rx="2" />
            <path
              d="M0 110 L0 -18 Q0 -26 8 -26 L19 -26"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.3"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path d="M12 -25 L26 -25 L23.5 -16 L14.5 -16 Z" />
            <path d="M13.6 -20 L24.4 -20 L23.5 -16 L14.5 -16 Z" fill={SCHEINWERFER} fillOpacity="0.55" />
          </g>
        ))}
      </g>

      {/* Aufbau. Er federt, die Raeder bleiben auf der Strasse - genau diese
          Differenz von 2,5 Einheiten liest sich als Federung. */}
      <g className="motion-safe:animate-[lkw-federung_1.05s_ease-in-out_infinite]">
        <g transform="translate(14 8)">
          {/* Kabine */}
          <path
            fill={KABINE}
            stroke={KONTUR}
            strokeWidth="3"
            d="M135 22.5H177.264C178.295 22.5 179.22 23.133 179.594 24.0939L192.33 56.8443C192.442 57.1332 192.5 57.4404 192.5 57.7504V89C192.5 90.3807 191.381 91.5 190 91.5H135C133.619 91.5 132.5 90.3807 132.5 89V25C132.5 23.6193 133.619 22.5 135 22.5Z"
          />
          {/* Windschutzscheibe */}
          <path
            fill={SCHEIBE}
            stroke={KONTUR}
            strokeWidth="2"
            d="M146 33.5H181.741C182.779 33.5 183.709 34.1415 184.078 35.112L190.538 52.112C191.16 53.748 189.951 55.5 188.201 55.5H146C144.619 55.5 143.5 54.3807 143.5 53V36C143.5 34.6193 144.619 33.5 146 33.5Z"
          />
          {/* Tuergriff */}
          <path
            fill={KONTUR}
            stroke={KONTUR}
            strokeWidth="2"
            d="M150 65C150 65.39 149.763 65.8656 149.127 66.2893C148.499 66.7083 147.573 67 146.5 67C145.427 67 144.501 66.7083 143.873 66.2893C143.237 65.8656 143 65.39 143 65C143 64.61 143.237 64.1344 143.873 63.7107C144.501 63.2917 145.427 63 146.5 63C147.573 63 148.499 63.2917 149.127 63.7107C149.763 64.1344 150 64.61 150 65Z"
          />
          {/* Scheinwerfer im Altyn-Gold und der vordere Stossfaenger */}
          <rect fill={SCHEINWERFER} stroke={KONTUR} strokeWidth="2" rx="1" x="187" y="63" width="5" height="7" />
          <rect fill={KONTUR} stroke={KONTUR} strokeWidth="2" rx="1" x="193" y="81" width="4" height="11" />

          {/* Kuehlkoffer und hinterer Stossfaenger */}
          <rect fill={KOFFER} stroke={KONTUR} strokeWidth="3" rx="2.5" x="6.5" y="1.5" width="121" height="90" />
          <rect fill={KOFFER} stroke={KONTUR} strokeWidth="2" rx="2" x="1" y="84" width="6" height="4" />

          {/* Kuehlaggregat an der Stirnwand. Die Ladung muss innerhalb einer
              Stunde auf 0 bis 1 Grad - ohne Aggregat waere es ein
              Trockenfracht-LKW und die Zeichnung erzaehlte das Falsche. */}
          <rect
            fill={KONTUR}
            fillOpacity="0.12"
            stroke={KONTUR}
            strokeWidth="2"
            rx="1.5"
            x="104"
            y="8"
            width="18"
            height="14"
          />
          {/* Schneeflocke auf dem Aggregat, drei gekreuzte Striche um (113 | 15).
              Drei waagerechte Linien standen hier zuerst, die lasen sich aber wie
              ein Textsymbol und nicht wie Kuehlung. */}
          {[0, 60, 120].map((grad) => {
            const dx = Math.cos((grad * Math.PI) / 180) * 4.6;
            const dy = Math.sin((grad * Math.PI) / 180) * 4.6;
            return (
              <line
                key={grad}
                x1={113 - dx}
                y1={15 - dy}
                x2={113 + dx}
                y2={15 + dy}
                stroke={KONTUR}
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            );
          })}

          {/* Himbi faehrt mit. Der Koffer misst 121 x 90 ab (6.5 | 1.5), seine
              Mitte liegt also auf (67 | 46.5); Himbi ist 46 x 69 gross, daher der
              Versatz um die halbe Groesse. Zustand "ruhe", weil die Figur hier
              nichts meldet - das Lebenszeichen gibt der fahrende LKW. */}
          <g transform="translate(44 12)">
            <Himbi zustand="ruhe" groesse={46} />
          </g>
        </g>
      </g>

      {/* Raeder. Die Drehung laeuft als CSS-transform, deshalb darf die Gruppe
          kein transform-Attribut tragen: In SVG schlaegt die CSS-Eigenschaft
          das Praesentationsattribut, das Rad spraenge sonst in den Ursprung.
          Der Drehpunkt kommt ueber transform-box: fill-box aus der eigenen
          Bounding Box, die dank der Nabe symmetrisch um die Radmitte liegt. */}
      {RAEDER.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={RADMITTE} r={RADIUS} fill={REIFEN} stroke={FELGE} strokeWidth="1.5" />
          <g
            className="motion-safe:animate-[lkw-rad_1.7s_linear_infinite]"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          >
            <circle cx={cx} cy={RADMITTE} r="6.5" fill={FELGE} />
            {SPEICHEN.map((winkel) => (
              <line
                key={winkel}
                x1={cx}
                y1={RADMITTE}
                x2={cx + Math.cos(winkel) * 6}
                y2={RADMITTE + Math.sin(winkel) * 6}
                stroke={REIFEN}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            ))}
          </g>
        </g>
      ))}
    </svg>
  );
}
