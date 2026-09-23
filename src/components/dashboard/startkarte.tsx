import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Die gemeinsame Darstellung aller vier Startkarten-Panels: Beschriftung, eine grosse Zahl,
// eine Kontextzeile, optional Chips.
//
// Eine Form fuer alle vier, damit die Begruessungskarte nicht je nach Rolle anders aussieht.
// Welches Panel eine Rolle bekommt, entscheidet startkarteFuer() in lib/domain/startkarte.ts.
//
// Die Zahl SELBST ist der Weg weiter - kein ausgeschriebener "Zur Finanzseite"-Link darunter
// (Auftrag vom 23.09.2026). Das spart eine Zeile und trifft die Erwartung: wer auf eine Summe
// klickt, will sehen, woraus sie besteht. Damit das erkennbar bleibt, unterstreicht die Zahl
// beim Ueberfahren und traegt einen Hover-Text, der das Ziel nennt.

export function Startkarte({
  label,
  wert,
  ton = "neutral",
  kontext,
  chips,
  href,
  ziel,
  titel,
}: {
  /** Was die Zahl ist, klein darueber. */
  label: string;
  /** Die Zahl selbst. Gross, das Auge faengt hier an, und zugleich der Weg weiter. */
  wert: string;
  /** Faerbt nur die Zahl. Nie der einzige Bedeutungstraeger - der Kontext sagt es auch (DESIGN.md Regel 7). */
  ton?: "neutral" | "gut" | "achtung";
  /** Eine Zeile unter der Zahl: Monat, Zeitraum, Zustand. */
  kontext?: string;
  /** Kleine Werte daneben, etwa Erloese und Kosten. */
  chips?: ReactNode;
  href: string;
  /** Wohin die Zahl fuehrt, als Hover- und Vorlesetext. Sichtbar steht dort nur die Zahl. */
  ziel: string;
  /** Vollstaendiger Wert als Hover-Text, wenn die Zahl gekuerzt dasteht. */
  titel?: string;
}) {
  const farbe =
    ton === "gut" ? "text-success" : ton === "achtung" ? "text-warning" : "text-foreground";

  return (
    <div className="flex h-full flex-col">
      <p className="text-[11px] font-bold uppercase leading-4 tracking-wide text-muted-foreground">
        {label}
      </p>
      <Link
        href={href}
        title={titel ? `${titel} — ${ziel}` : ziel}
        aria-label={`${wert} — ${ziel}`}
        className={cn(
          "mt-1 inline-block text-2xl font-black leading-tight tabular-nums underline-offset-4 hover:underline md:text-3xl",
          farbe,
        )}
      >
        {wert}
      </Link>
      {kontext ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{kontext}</p> : null}
      {/* Zwei gleich breite Zellen statt linksbuendiger Pillen: sonst steht rechts neben
          "Erloese" und "Kosten" leerer Platz, am Handy ueber die halbe Kartenbreite. Das
          Raster gilt in beiden Lagen - auch die rechte Haelfte am Schirm ist mit 352 px
          schmal genug, dass zwei Zellen besser sitzen als zwei Pillen. */}
      {chips ? <div className="mt-2 grid grid-cols-2 gap-1.5">{chips}</div> : null}
    </div>
  );
}

/** Ein kleiner Wert neben der grossen Zahl. Wie .pr-wert im Pruefbericht, nur ohne dessen CSS. */
export function StartkarteChip({ children }: { children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center justify-center truncate rounded-full bg-muted px-2 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}
