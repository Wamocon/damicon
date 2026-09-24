"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Eine Zeile in einer Flaeche, die von unten aufgeht: Symbol links, Text
// daneben, Pfeil rechts, 56 px hoch. Mit `href` ist sie ein Link, ohne einen
// Knopf.
//
// Zusammengefuehrt aus zwei Fassungen, die bis auf die Symbolfarbe
// buchstabengleich waren - der Bereichsliste im Menue-Blatt
// (dashboard/untere-leiste.tsx) und der Mehr-Ansicht im KI-Panel
// (ki/ki-pane.tsx). Beide Blaetter gehen vom selben Knopfband am unteren Rand
// auf, der Nutzer sieht sie unmittelbar nacheinander, und sie sahen
// unterschiedlich aus. Genau das richten zwei Kopien derselben Zeile an: sie
// laufen auseinander, und niemand merkt es, weil keine der beiden Stellen
// falsch aussieht - nur eben anders als die andere.
//
// Die 56 px sind kein runder Zufallswert, sondern 44 px Beruehrungsflaeche
// nach WCAG 2.5.5 plus den Innenabstand, der das Symbol traegt. Sie stehen als
// --blatt-zeile-h in globals.css statt als h-14 hier, weil die Menue-Schiene
// im Blatt (dashboard/untere-leiste.tsx) ihre Hoehe daraus rechnet - zwei
// Kopien derselben Zahl waeren genau die Art Kopplung, die leise auseinander
// laeuft: das Blatt waere ein paar Pixel zu kurz, und niemand rechnet nach.
//
// Klassen und Inhalt stehen zusaetzlich einzeln bereit, fuer Zeilen, die
// weder Link noch Knopf sein duerfen: die Treffer der globalen Suche sind
// Optionen einer Liste (suche/such-dialog.tsx) und sollen trotzdem genau so
// aussehen wie die Zeilen im Menue-Blatt.
export function blattZeilenKlassen(aktiv: boolean): string {
  return cn(
    "flex h-[var(--blatt-zeile-h)] w-full items-center gap-3 rounded-xl border px-3 text-left text-base font-bold transition-colors",
    aktiv
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-border text-foreground hover:bg-muted",
  );
}

export function BlattZeilenInhalt({
  symbol,
  text,
  untertitel,
  aktiv = false,
}: {
  symbol: ReactNode;
  text: string;
  /** Kleine zweite Zeile unter dem Text, etwa der Bereich eines Moduls. */
  untertitel?: string | null;
  aktiv?: boolean;
}) {
  return (
    <>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          // Im aktiven Zustand erbt das Symbol das Primaer der Zeile, sonst
          // steht es zurueck: gelesen wird der Text daneben, das Symbol hilft
          // nur beim Wiederfinden.
          aktiv ? "bg-primary/15" : "bg-muted text-muted-foreground",
        )}
      >
        {symbol}
      </span>
      {untertitel ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate">{text}</span>
          <span className="block truncate text-xs font-medium text-muted-foreground">
            {untertitel}
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{text}</span>
      )}
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </>
  );
}

export function BlattZeile({
  symbol,
  text,
  href,
  onClick,
  aktiv = false,
  aktuelleSeite = false,
}: {
  symbol: ReactNode;
  text: string;
  /** Gesetzt: die Zeile fuehrt auf eine Seite. Fehlt: sie loest etwas aus. */
  href?: string;
  onClick?: () => void;
  /** Die geoeffnete Seite liegt in diesem Ziel, auch eine Ebene darunter. */
  aktiv?: boolean;
  /** Genau diese Seite ist offen - traegt aria-current="page". */
  aktuelleSeite?: boolean;
}) {
  const klassen = blattZeilenKlassen(aktiv);
  const inhalt = <BlattZeilenInhalt symbol={symbol} text={text} aktiv={aktiv} />;

  if (href) {
    return (
      <Link
        href={href}
        onClick={onClick}
        aria-current={aktuelleSeite ? "page" : aktiv ? "true" : undefined}
        className={klassen}
      >
        {inhalt}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={klassen}>
      {inhalt}
    </button>
  );
}
