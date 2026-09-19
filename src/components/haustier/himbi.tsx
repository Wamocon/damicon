import { useId } from "react";
import type { HaustierZustand } from "@/lib/haustier";

// Himbi: die Himbeere als Begleiter. Reines SVG mit Gesicht - Augen mit Pupillen, die
// ueber die CSS-Variablen --bx/--by ueberall hinsehen koennen, Lidern zum Blinzeln,
// Wangen, Augenbrauen und einem Mund je Zustand. Alles, was sich bewegt, ist eine
// Transformation oder eine Deckkraft (haustier.css): laeuft auf der Grafikkarte,
// ohne Layout und ohne Neuzeichnen von React.

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

function blatt(winkel: number, laenge: number): string {
  // Ein Blatt als Spitzoval, nach oben gerichtet, um den Ansatzpunkt gedreht (per transform).
  const b = laenge * 0.34;
  return `M0 0C${b} ${-laenge * 0.32} ${b * 0.9} ${-laenge * 0.78} 0 ${-laenge}C${-b * 0.9} ${-laenge * 0.78} ${-b} ${-laenge * 0.32} 0 0Z`;
}

function funke(x: number, y: number, s: number): string {
  return `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`;
}

export function Himbi({ zustand, groesse = 88 }: { zustand: HaustierZustand; groesse?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className="hb-svg"
      data-zustand={zustand}
      width={groesse}
      height={(groesse * 116) / 96}
      viewBox="0 0 96 116"
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
        <clipPath id={`${id}-auge-l`}>
          <ellipse cx="36" cy="68" rx="8.4" ry="9.6" />
        </clipPath>
        <clipPath id={`${id}-auge-r`}>
          <ellipse cx="60" cy="68" rx="8.4" ry="9.6" />
        </clipPath>
      </defs>

      <g className="hb-figur">
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
        <path
          d="M48 38C76 38 88 58 82 77C76 96 62 108 48 108C34 108 20 96 14 77C8 58 20 38 48 38Z"
          fill={`url(#${id}-koerper)`}
        />
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

        {/* Wangen */}
        <circle cx="27" cy="80" r="4.8" fill="#ff9cbd" opacity="0.55" />
        <circle cx="69" cy="80" r="4.8" fill="#ff9cbd" opacity="0.55" />

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
      </g>
    </svg>
  );
}
