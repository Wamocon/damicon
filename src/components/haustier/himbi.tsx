import { useId } from "react";
import type { HaustierZustand, Stimmung } from "@/lib/haustier";

// Himbi: die Himbeere als Begleiter. Reines SVG mit Gesicht - Augen mit Pupillen, die
// ueber die CSS-Variablen --bx/--by ueberall hinsehen koennen, Lidern zum Blinzeln,
// Wangen, Augenbrauen und einem Mund je Zustand. Alles, was sich bewegt, ist eine
// Transformation oder eine Deckkraft (haustier.css): laeuft auf der Grafikkarte,
// ohne Layout und ohne Neuzeichnen von React.
//
// Tracht: Damicon baut in Kasachstan an, darum traegt Himbi einen kurzen Chapan mit
// Koschkar-Muiis-Borte (dem Widderhorn-Ornament) und Etik-Stiefel mit hochgebogener
// Spitze. Die Beere ist Kopf UND Rumpf zugleich - das Gesicht liegt zwischen y 51 und
// y 98 und laesst darueber keinen Platz, deshalb sitzt die Kleidung unterhalb der
// Beere statt als Weste davor. Arme und Beine setzen hinter dem Koerper an, damit der
// Ansatz verdeckt bleibt, wenn sie sich bewegen.

// Steinfruechtchen als Textur: zeilenweise, nach unten spitz zulaufend.
const FRUECHTCHEN: Array<[number, number]> = [
  [34, 47], [48, 45], [62, 47],
  [26, 58], [40, 57], [56, 57], [70, 58],
  [22, 70], [35, 70], [48, 70], [61, 70], [74, 70],
  [26, 82], [39, 83], [57, 83], [70, 82],
  [33, 93], [48, 95], [63, 93],
  [41, 102], [55, 102],
];

// Blattkrone: Winkel (Grad) und Laenge.
const BLAETTER: Array<[number, number]> = [
  [-72, 21],
  [-38, 25],
  [0, 26],
  [38, 25],
  [72, 21],
];

/** Umriss der Beere. Dient zugleich als Bezugsform fuer alles, was daran haengt. */
const KOERPER = "M48 38C76 38 88 58 82 77C76 96 62 108 48 108C34 108 20 96 14 77C8 58 20 38 48 38Z";

/** Der Chapan (Rock): oben schmal unter der Beere, nach unten ausgestellt. Die obere
 *  Kante bei y 99 liegt hinter dem Koerper und ist nie zu sehen. */
const CHAPAN =
  "M38 99C35.5 107 31.5 114 27 119.6C26.2 120.9 27.1 122.2 28.8 122.2L67.2 122.2C68.9 122.2 69.8 120.9 69 119.6C64.5 114 60.5 107 58 99Z";

/** Etik-Stiefel, gezeichnet mit der Spitze nach rechts; der linke Fuss ist dieselbe
 *  Form, gespiegelt. Ursprung: Mitte des Schafts, oben. */
const STIEFEL =
  "M-5.2 0L5.2 0L5.2 7.2C9.2 7.8 12.2 7.2 14.2 5.8C17.4 7 18 10.2 16.2 12C14.6 13.6 12 14.2 9 14.2L-1.8 14.2C-4.2 14.2 -5.2 13 -5.2 11.2Z";

function blatt(winkel: number, laenge: number): string {
  // Ein Blatt als Spitzoval, nach oben gerichtet, um den Ansatzpunkt gedreht (per transform).
  const b = laenge * 0.34;
  return `M0 0C${b} ${-laenge * 0.32} ${b * 0.9} ${-laenge * 0.78} 0 ${-laenge}C${-b * 0.9} ${-laenge * 0.78} ${-b} ${-laenge * 0.32} 0 0Z`;
}

function funke(x: number, y: number, s: number): string {
  return `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`;
}

/** Fuenfzackiger Stern auf dem Chapan - ein Knopf zum Abzeichen, keine Bewertung. */
function stern(cx: number, cy: number, r: number): string {
  const innen = r * 0.42;
  let d = "";
  for (let i = 0; i < 10; i++) {
    const winkel = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : innen;
    const x = cx + Math.cos(winkel) * radius;
    const y = cy + Math.sin(winkel) * radius;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

/** x-Position der drei Sterne auf dem Chapan - alle drei tun dasselbe. */
const STERN_X = [34, 48, 62];

/** Drei Trachten: Chapan, Aermel, Kappe und Stiefel teilen sich eine Farbe (dieselbe
 *  Gradient-ID), darum reicht ein Farbpaar je Tracht fuer den ganzen Auftritt. Die
 *  goldene Borte (Koschkar-Muiis, Saum) bleibt in jeder Tracht gleich - das ist der Teil,
 *  an dem man die Kleidung als kasachisch erkennt, nicht die Grundfarbe. */
export const TRACHTEN = [
  { name: "steppenblau", chapanHell: "#2a90b8", chapanDunkel: "#0f4d68", stiefelHell: "#23789a", stiefelDunkel: "#0d465e" },
  { name: "granat", chapanHell: "#c9435a", chapanDunkel: "#6e1626", stiefelHell: "#a8324a", stiefelDunkel: "#5e1220" },
  { name: "jade", chapanHell: "#22a06f", chapanDunkel: "#0c5c40", stiefelHell: "#1c8a63", stiefelDunkel: "#0a4f38" },
] as const;

/** Koschkar-Muiis, das kasachische Widderhorn: zwei gegenlaeufige Spiralen. Auf eine
 *  Strichzeichnung reduziert, damit das Muster auch bei 64 px noch als Muster liest
 *  und nicht als Fleck. */
function horn(x: number, y: number, s: number): string {
  const seite = (r: 1 | -1) =>
    `M${x} ${y + s * 0.55}C${x} ${y - s * 0.6} ${x + r * s * 1.5} ${y - s * 0.7} ${x + r * s * 1.5} ${y + s * 0.15}` +
    `C${x + r * s * 1.5} ${y + s * 0.85} ${x + r * s * 0.68} ${y + s * 0.85} ${x + r * s * 0.7} ${y + s * 0.1}`;
  return `${seite(-1)}${seite(1)}`;
}

/** Takyia, die bestickte Kappe. Sie sitzt auf dem Scheitel und die Blattkrone waechst
 *  hindurch: die Blaetter sind das, woran man die Himbeere erkennt, die duerfen nicht weg.
 *  Darum eine flache Kappe und kein Kalpak. */
const TAKYIA = "M32.4 41.8C32.4 30 38.6 24.6 48 24.6C57.4 24.6 63.6 30 63.6 41.8Z";
const TAKYIA_BAND = "M30.6 39.6L65.4 39.6L65.4 43.8C65.4 44.9 64.5 45.6 63.2 45.6L32.8 45.6C31.5 45.6 30.6 44.9 30.6 43.8Z";

/** Arme: Unterarm, Aermel des Chapans (die obere Haelfte derselben Kurve), Saum am
 *  Aermelende, Mitte der Hand, Mitte des Daumens, Bund am Handgelenk. */
const ARME = [
  {
    seite: "l",
    arm: "M26 68C13 73 6 84 7.2 95",
    aermel: "M26 68C19.5 70.5 14.5 74.5 11.3 79.3",
    saum: "M7.5 76.7L15.1 81.9",
    hx: 7.2,
    dx: 12.2,
    bund: "M2.6 89.2Q6.8 91.4 11 88.8",
  },
  {
    seite: "r",
    arm: "M70 68C83 73 90 84 88.8 95",
    aermel: "M70 68C76.5 70.5 81.5 74.5 84.7 79.3",
    saum: "M88.5 76.7L80.9 81.9",
    hx: 88.8,
    dx: 83.8,
    bund: "M93.4 89.2Q89.2 91.4 85 88.8",
  },
] as const;

/** Beine: Mitte des Schafts. richtung = Blickrichtung der Stiefelspitze. */
const BEINE = [
  { seite: "l", x: 38, richtung: -1 },
  { seite: "r", x: 58, richtung: 1 },
] as const;

export function Himbi({
  zustand,
  stimmung = "neutral",
  groesse = 88,
  tracht = 0,
  brille = true,
  aufAbzeichen,
}: {
  zustand: HaustierZustand;
  /** Faerbt nur Brauen, Wangen und eine kurze Reaktion - der Zustand bleibt der Zustand. */
  stimmung?: Stimmung;
  groesse?: number;
  /** Welche der drei Trachten (TRACHTEN) Chapan, Aermel, Kappe und Stiefel tragen. */
  tracht?: 0 | 1 | 2;
  /** Die gelbe Spassbrille - abschaltbar in den Einstellungen. */
  brille?: boolean;
  /** Gesetzt: die drei Sterne auf dem Chapan werden klickbar - alle drei rufen sie auf.
   *  Ohne sie bleiben die Sterne unsichtbar - ein Knopf ohne Wirkung waere nur Attrappe. */
  aufAbzeichen?: () => void;
}) {
  const id = useId().replace(/:/g, "");
  const t = TRACHTEN[tracht];
  return (
    <svg
      className="hb-svg"
      data-zustand={zustand}
      data-stimmung={stimmung}
      width={groesse}
      height={(groesse * 144) / 96}
      viewBox="0 0 96 144"
      role="img"
      aria-hidden
    >
      <defs>
        <radialGradient id={`${id}-koerper`} cx="34%" cy="28%" r="80%">
          <stop offset="0" stopColor="#ff6f9a" />
          <stop offset="0.45" stopColor="#e2205f" />
          <stop offset="1" stopColor="#8f0f3a" />
        </radialGradient>
        <linearGradient id={`${id}-blatt`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#1f9d59" />
          <stop offset="1" stopColor="#5be39a" />
        </linearGradient>
        <radialGradient id={`${id}-glanz`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-chapan`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.chapanHell} />
          <stop offset="1" stopColor={t.chapanDunkel} />
        </linearGradient>
        <linearGradient id={`${id}-stiefel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.stiefelHell} />
          <stop offset="1" stopColor={t.stiefelDunkel} />
        </linearGradient>
        <clipPath id={`${id}-chapan-clip`}>
          <path d={CHAPAN} />
        </clipPath>
        <clipPath id={`${id}-stiefel-clip`}>
          <path d={STIEFEL} />
        </clipPath>
        <clipPath id={`${id}-auge-l`}>
          <ellipse cx="36" cy="68" rx="8.4" ry="9.6" />
        </clipPath>
        <clipPath id={`${id}-auge-r`}>
          <ellipse cx="60" cy="68" rx="8.4" ry="9.6" />
        </clipPath>
      </defs>

      <g className="hb-figur">
        {/* Beine mit Stiefeln - zuerst, damit Chapan und Koerper den Ansatz decken */}
        {BEINE.map(({ seite, x, richtung }) => (
          <g key={seite} className={`hb-bein hb-bein--${seite}`}>
            <path d={`M${x} 114L${x} 130`} stroke="#8f0f3a" strokeWidth="7.4" strokeLinecap="round" />
            <g transform={`translate(${x} 128)${richtung < 0 ? " scale(-1 1)" : ""}`}>
              <path d={STIEFEL} fill={`url(#${id}-stiefel)`} />
              <g clipPath={`url(#${id}-stiefel-clip)`}>
                <path d="M-7 2.8L7 2.8" stroke="#f2c14e" strokeWidth="2.6" />
                <path d="M-7 12.4L19 12.4" stroke="#082f40" strokeWidth="3" />
                <path d={horn(0.6, 8.2, 2.1)} fill="none" stroke="#f6cf72" strokeWidth="0.9" strokeLinecap="round" />
              </g>
            </g>
          </g>
        ))}

        {/* Chapan mit Koschkar-Muiis-Borte */}
        <g className="hb-chapan">
          <path d={CHAPAN} fill={`url(#${id}-chapan)`} />
          <g clipPath={`url(#${id}-chapan-clip)`}>
            <path d="M42 99L42 123" stroke="#f6cf72" strokeWidth="1.3" opacity="0.65" />
            <path d="M54 99L54 123" stroke="#f6cf72" strokeWidth="1.3" opacity="0.65" />
            {[36.5, 48, 59.5].map((x) => (
              <path key={x} d={horn(x, 110, 3)} fill="none" stroke="#f6cf72" strokeWidth="1.3" strokeLinecap="round" />
            ))}
            <path d="M18 116.2L78 116.2" stroke="#0a3d54" strokeWidth="1.6" />
            <path d="M18 119.8L78 119.8" stroke="#f2c14e" strokeWidth="5" />
          </g>
        </g>

        {/* Arme mit Haenden - ebenfalls hinter dem Koerper angesetzt */}
        {ARME.map(({ seite, arm, aermel, saum, hx, dx, bund }) => (
          <g key={seite} className={`hb-arm hb-arm--${seite}`}>
            <path d={arm} fill="none" stroke="#b8154b" strokeWidth="7.4" strokeLinecap="round" />
            <path d={aermel} fill="none" stroke={`url(#${id}-chapan)`} strokeWidth="8.6" strokeLinecap="round" />
            <path d={saum} stroke="#f2c14e" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx={dx} cy="92.6" r="2.9" fill={`url(#${id}-koerper)`} />
            <circle cx={hx} cy="97.5" r="6.4" fill={`url(#${id}-koerper)`} stroke="#7d0c33" strokeOpacity="0.3" strokeWidth="0.8" />
            <circle cx={hx - 1.6} cy="95.4" r="1.7" fill="#fff" fillOpacity="0.45" />
            <path d={bund} fill="none" stroke="#f2c14e" strokeWidth="2.6" strokeLinecap="round" />
          </g>
        ))}

        {/* Blattkrone, jedes Blatt wiegt sich einzeln */}
        <g className="hb-krone" transform="translate(48 40)">
          {BLAETTER.map(([w, l], i) => (
            <g key={i} transform={`rotate(${w})`}>
              <path className="hb-blatt" style={{ animationDelay: `${i * -0.7}s` }} d={blatt(w, l)} fill={`url(#${id}-blatt)`} />
            </g>
          ))}
          <path d="M-2 4 L-1.4 -9 Q0 -11 1.4 -9 L2 4Z" fill="#2c8f56" />
        </g>

        {/* Koerper */}
        <path d={KOERPER} fill={`url(#${id}-koerper)`} />
        <g className="hb-fruechtchen">
          {FRUECHTCHEN.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="7.2"
              fill="none"
              stroke="#5a0d27"
              strokeOpacity="0.22"
              strokeWidth="1.1"
              style={{ animationDelay: `${(i % 7) * 0.09}s` }}
            />
          ))}
        </g>
        <ellipse cx="34" cy="50" rx="13" ry="9" fill={`url(#${id}-glanz)`} transform="rotate(-24 34 50)" />

        {/* Takyia: Kappe mit Band, die Blattkrone waechst hindurch */}
        <g className="hb-kappe">
          <path d={TAKYIA} fill={`url(#${id}-chapan)`} />
          <path d={horn(48, 33, 2.6)} fill="none" stroke="#f6cf72" strokeWidth="1.1" strokeLinecap="round" />
          <path d={TAKYIA_BAND} fill="#0f4d68" />
          <path d="M30.6 42.6L65.4 42.6" stroke="#f2c14e" strokeWidth="2.4" />
        </g>

        {/* Wangen - werden bei guter Stimmung kraeftiger */}
        <circle className="hb-wange" cx="27" cy="80" r="4.8" fill="#ff9cbd" opacity="0.55" />
        <circle className="hb-wange" cx="69" cy="80" r="4.8" fill="#ff9cbd" opacity="0.55" />

        {/* Augenbrauen: Neigung je Zustand ueber CSS */}
        <path className="hb-braue hb-braue--l" d="M29 55Q36 51 43 55" fill="none" stroke="#5a0d27" strokeWidth="2.2" strokeLinecap="round" />
        <path className="hb-braue hb-braue--r" d="M53 55Q60 51 67 55" fill="none" stroke="#5a0d27" strokeWidth="2.2" strokeLinecap="round" />

        {/* Augen */}
        {[
          { cx: 36, clip: `${id}-auge-l` },
          { cx: 60, clip: `${id}-auge-r` },
        ].map((a) => (
          <g key={a.cx}>
            <ellipse cx={a.cx} cy="68" rx="8.4" ry="9.6" fill="#fff" />
            <g clipPath={`url(#${a.clip})`}>
              <g className="hb-pupille">
                <circle cx={a.cx} cy="69" r="5.2" fill="#3b0a1a" />
                <circle cx={a.cx + 1.9} cy="66.4" r="1.9" fill="#fff" />
                <circle cx={a.cx - 1.6} cy="71.6" r="0.9" fill="#fff" opacity="0.8" />
              </g>
              <ellipse className="hb-lid" cx={a.cx} cy="68" rx="9.2" ry="10.4" fill="#c2185b" />
            </g>
            <path className="hb-lidlinie" d={`M${a.cx - 7} 69Q${a.cx} 74 ${a.cx + 7} 69`} fill="none" stroke="#3b0a1a" strokeWidth="2" strokeLinecap="round" />
          </g>
        ))}

        {/* Gelbe Spassbrille: rein dekorativ, abschaltbar in den Einstellungen */}
        {brille ? (
          <g className="hb-brille">
            <path d="M40 66Q48 62 56 66" fill="none" stroke="#ffce00" strokeWidth="3.2" strokeLinecap="round" />
            {[36, 60].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy="68" r="11" fill="#ffe680" fillOpacity="0.4" stroke="#ffce00" strokeWidth="3" />
                <path d={`M${cx - 5} 62Q${cx} 59 ${cx + 5} 62`} fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="1.6" strokeLinecap="round" />
              </g>
            ))}
          </g>
        ) : null}

        {/* Traenen: nur beim Abschied */}
        <path className="hb-traene hb-traene--l" d="M29.5 76C27.2 80.2 27.6 83.4 29.5 84.6C31.4 83.4 31.8 80.2 29.5 76Z" fill="#9adcf7" stroke="#e8f8ff" strokeWidth="0.8" />
        <path className="hb-traene hb-traene--r" d="M66.5 76C64.2 80.2 64.6 83.4 66.5 84.6C68.4 83.4 68.8 80.2 66.5 76Z" fill="#9adcf7" stroke="#e8f8ff" strokeWidth="0.8" />

        {/* Mund: je Zustand einer sichtbar */}
        <g className="hb-mund">
          <path className="hb-mund--lachen" d="M40 82Q48 90 56 82" fill="none" stroke="#5a0d27" strokeWidth="2.6" strokeLinecap="round" />
          <g className="hb-mund--offen">
            <ellipse cx="48" cy="85" rx="5" ry="4.2" fill="#5a0d27" />
            <ellipse cx="48" cy="87.2" rx="3" ry="1.7" fill="#ff7aa2" />
          </g>
          <g className="hb-mund--jubel">
            <path d="M38 80Q48 98 58 80Z" fill="#5a0d27" />
            <ellipse cx="48" cy="89" rx="4.6" ry="2.3" fill="#ff7aa2" />
          </g>
          <path className="hb-mund--traurig" d="M41 87Q48 80 55 87" fill="none" stroke="#5a0d27" strokeWidth="2.6" strokeLinecap="round" />
          <circle className="hb-mund--schlaf" cx="48" cy="85" r="2.4" fill="#5a0d27" />
        </g>

        {/* KI-Funken: kreisen, solange der Agent arbeitet */}
        <g className="hb-funken">
          <path d={funke(10, 52, 5.6)} fill="#ffd166" />
          <path d={funke(88, 62, 4.6)} fill="#fff" />
          <path d={funke(78, 30, 4)} fill="#ffd166" />
        </g>

        {/* Damicon-Siegel als kleine Anstecknadel am Kragen, oben auf dem Chapan. Dieselbe
         *  Bildmarke wie im Kopf der Seite (components/brand/damicon-logo.tsx), nur ohne die
         *  Sonnenstrahlen und die Steppenlinie - die verschwinden schon im Siegel selbst
         *  unter 24 Pixeln (siehe Kommentar dort) und hier ist die Nadel kaum 8 Pixel breit.
         *  Nach dem Koerper gezeichnet, sonst deckt die Beere sie zu. */}
        <g transform="translate(48 101)">
          <rect x="-4.4" y="-4.4" width="8.8" height="8.8" rx="1.9" fill="#00768f" />
          <circle r="3.1" fill="none" stroke="#f4f1ea" strokeWidth="0.9" />
          <circle r="1.6" fill="#ff5c7a" />
        </g>

        {/* Drei Sterne auf dem Chapan, nur klickbar mit aufAbzeichen - alle drei oeffnen
         *  dasselbe Abzeichen (abzeichen-modal.tsx). Ganz zuletzt gezeichnet, damit sie ueber
         *  allem liegen und der Klick nie an Koerper oder Aermel haengen bleibt.
         *  onPointerDown stoppt die Weitergabe, bevor der Ziehen-Griff der Huelle
         *  (haustier-huelle.tsx) daraus einen Zug oder einen Buehnen-Klick macht. */}
        {aufAbzeichen ? (
          <g className="hb-sterne">
            {STERN_X.map((x) => (
              <g
                key={x}
                className="hb-stern"
                role="button"
                tabIndex={0}
                aria-label="DamiAI Abzeichen"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  aufAbzeichen();
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  aufAbzeichen();
                }}
              >
                <circle cx={x} cy="109" r="8.6" fill="transparent" />
                <path d={stern(x, 109, 5.8)} />
              </g>
            ))}
          </g>
        ) : null}
      </g>
    </svg>
  );
}
