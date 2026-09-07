import { cn } from "@/lib/utils";

// Bildmarke Damicon - Himbeere aus Drupeln plus Blatt. Analog zu 1Cati
// `cati-logo.tsx` bewusst als Code-generiertes SVG (kein eingebranntes Foto),
// damit sich Farbwerte ueber die Design-Tokens tauschen lassen.
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
      <path
        d="M64 30c14 2 24 6 24 6s-2 10-8 16c7 3 12 9 12 9s-9 7-20 7c2 8-2 18-2 18s-11-6-14-14c-8 4-20 3-20 3s3-11 11-16c-8-4-13-13-13-13s11-4 21-2c-2-9 2-17 2-17s8 6 10 13Z"
        className="fill-primary-foreground/20"
      />
      <g className="fill-primary-foreground">
        <circle cx="54" cy="74" r="9" />
        <circle cx="72" cy="74" r="9" />
        <circle cx="63" cy="60" r="9" />
        <circle cx="45" cy="61" r="8" />
        <circle cx="81" cy="61" r="8" />
        <circle cx="63" cy="90" r="8" />
      </g>
      <path
        d="M63 50c0-12 9-22 22-24-1 13-10 23-22 24Z"
        className="fill-accent"
      />
    </svg>
  );
}
