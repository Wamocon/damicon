import { useId } from "react";
import { cn } from "@/lib/utils";

// Maskottchen des KI-Assistenten: eine Himbeere aus Steinfruechtchen mit
// Blattkrone und zwei "KI-Funken". Damicon baut Himbeeren an - der Assistent
// soll aussehen, als gehoere er auf dieses Feld, nicht in ein Standard-Chatfenster.
// Reines SVG, ohne Bild-Datei: skaliert von 16 px (Kopfzeilenknopf) bis 80 px
// (Leerzustand) und erbt die Bewegung aus ki-pane.css (prefers-reduced-motion
// wird dort beachtet).

// Steinfruechtchen-Reihen (y, x-Mitten) - oben breit, nach unten spitz zulaufend.
const REIHEN: { y: number; xs: number[]; r: number }[] = [
  { y: 27, xs: [22, 32, 42], r: 5.6 },
  { y: 35, xs: [17, 27, 37, 47], r: 5.6 },
  { y: 43, xs: [22, 32, 42], r: 5.6 },
  { y: 51, xs: [27, 37], r: 5.4 },
  { y: 58, xs: [32], r: 4.4 },
];

/** Vierzackiger, nach innen geschwungener Funke. */
function funke(x: number, y: number, s: number): string {
  return `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`;
}

export function Himbeere({
  groesse = 24,
  denkt = false,
  schweben = false,
  className,
}: {
  groesse?: number;
  /** Steinfruechtchen pulsieren der Reihe nach - der Agent arbeitet gerade. */
  denkt?: boolean;
  schweben?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  let index = 0;

  return (
    <svg
      viewBox="0 0 64 68"
      width={groesse}
      height={groesse * (68 / 64)}
      aria-hidden="true"
      focusable="false"
      className={cn("himbeere", denkt && "himbeere--denkt", schweben && "himbeere--schweben", className)}
    >
      <defs>
        <radialGradient id={`${id}-b`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ff9db8" />
          <stop offset="0.5" stopColor="#e5195e" />
          <stop offset="1" stopColor="#9c0f3d" />
        </radialGradient>
        <linearGradient id={`${id}-l`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4fe08e" />
          <stop offset="1" stopColor="#1b9a55" />
        </linearGradient>
      </defs>

      {REIHEN.map((reihe) =>
        reihe.xs.map((x) => {
          const i = index++;
          return (
            <g key={`${reihe.y}-${x}`} className="himbeere__kern" style={{ ["--i" as string]: i }}>
              <circle cx={x} cy={reihe.y} r={reihe.r} fill={`url(#${id}-b)`} stroke="#7d0c33" strokeOpacity="0.28" strokeWidth="0.7" />
              <circle cx={x - 1.7} cy={reihe.y - 1.9} r={reihe.r * 0.26} fill="#fff" fillOpacity="0.6" />
            </g>
          );
        }),
      )}

      <g fill={`url(#${id}-l)`}>
        <path d="M32 24C25 18 19 17 13 19C18 25 26 27 32 24Z" />
        <path d="M32 24C39 18 45 17 51 19C46 25 38 27 32 24Z" />
        <path d="M32 24C27 16 29 10 32 6C35 10 37 16 32 24Z" />
      </g>

      <path className="himbeere__funke" d={funke(53, 13, 8.5)} fill="#ffe28a" />
      <path className="himbeere__funke himbeere__funke--klein" d={funke(11, 25, 4.6)} fill="#fff3c4" />
    </svg>
  );
}
