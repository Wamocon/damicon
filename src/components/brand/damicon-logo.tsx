import { cn } from "@/lib/utils";

// Bildmarke Damicon - Sonnensiegel: die Sonne über der Steppe in einem
// Siegelring. Sonne mit Strahlen und Horizontlinie sind die Motive der
// kasachischen Flagge, das Siegel ist die Form, in der Prüfungen bestätigt
// werden - genau das Versprechen des Systems. Die Sonnenscheibe trägt das
// Himbeerrot, damit die Frucht im Zeichen bleibt.
//
// Wie zuvor als Code-generiertes SVG und nicht als Bilddatei, damit die
// Farbwerte aus den Design-Tokens kommen: Auf der Petrol-Kachel steht der
// Ring in der Vordergrundfarbe, die Strahlen im Flaggengold, die Scheibe im
// hellen Himbeerrot. Die feine Steppenlinie des Entwurfs fehlt hier
// absichtlich - sie verschwindet unter 24 Pixeln und macht das Zeichen nur
// unruhig (docs/design/logo-vorschlaege).
//
// Strahlen: elf Striche um den Mittelpunkt der Scheibe (64|68), von Radius 21
// nach 30, gleichmäßig über die obere Hälfte.
const STRAHLEN = [
  "M43 68 L34 68",
  "M44 61.5 L35.5 58.7",
  "M47 55.7 L39.7 50.4",
  "M51.7 51 L46.4 43.7",
  "M57.5 48 L54.7 39.5",
  "M64 47 L64 38",
  "M70.5 48 L73.3 39.5",
  "M76.3 51 L81.6 43.7",
  "M81 55.7 L88.3 50.4",
  "M84 61.5 L92.5 58.7",
  "M85 68 L94 68",
];

export function DamiconLogo({
  className,
  title = "Damicon",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox="0 0 128 128"
      className={cn("h-9 w-9 shrink-0", className)}
    >
      <rect width="128" height="128" rx="28" className="fill-primary" />

      <circle
        cx="64"
        cy="64"
        r="46"
        fill="none"
        strokeWidth="4.5"
        className="stroke-primary-foreground/85"
      />

      <g fill="none" strokeWidth="4.5" strokeLinecap="round" className="stroke-brand-altyn">
        {STRAHLEN.map((strahl) => (
          <path key={strahl} d={strahl} />
        ))}
      </g>

      <circle cx="64" cy="68" r="15" className="fill-himbeere-leuchtend" />

      <path
        d="M32 92H96"
        fill="none"
        strokeWidth="5.5"
        strokeLinecap="round"
        className="stroke-primary-foreground/85"
      />
    </svg>
  );
}
