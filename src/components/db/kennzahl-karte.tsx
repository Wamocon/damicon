// Die Felder einer Kennzahl in der Kachel: Name, Herkunft, Wert, Rubelbetrag und Frage. Gemeinsam für die Kennzahlen des Betriebs und die des Systems auf der
// Wirtschaftlichkeitsseite: zwei Fassungen liefen auseinander, ohne dass eine von beiden falsch aussähe.

import { StatusPill } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import type { Herkunft } from "@/lib/domain/wirtschaftlichkeit";

/** Gross im Raster, klein im Aufklapper. Sonst ist die Kachel dieselbe. */
export type Groesse = "gross" | "klein";

/** Was die Kachel von einer Kennzahl zeigt. Die Kennzahlen des Systems und die des Betriebs liefern beide diese Felder. */
export interface Kachelfelder {
  label: string;
  frage: string;
  /** Fertig formatierter Hauptwert; "offen", wenn die Angaben fehlen. */
  wert: string;
  /** Derselbe Betrag in Rubel, ohne Klammern. Nur bei Geldbeträgen gesetzt. */
  klammer?: string;
  /** Genauer Wert für das title-Attribut, wenn der Hauptwert gekürzt ist. */
  genau?: string;
  herkunft: Herkunft;
}

export interface Herkunftstexte {
  geschaetztLabel: string;
  offenLabel: string;
}

export function Herkunftspille({ herkunft, texte }: { herkunft: Herkunft; texte: Herkunftstexte }) {
  if (herkunft === "belegt") return null;
  return <StatusPill tone={herkunft === "offen" ? "neutral" : "warning"}>{herkunft === "offen" ? texte.offenLabel : texte.geschaetztLabel}</StatusPill>;
}

/**
 * Label, Wert, Rubelbetrag und Frage einer Kennzahl.
 *
 * Eine Fassung für alle Stellen, nicht mehrere: Raster und Aufklapper zeigen dieselben Felder in derselben Reihenfolge. Standen sie mehrfach da, würde ein
 * weiteres Feld irgendwann nur an einer der Stellen ankommen, und niemandem fällt auf, an welcher.
 */
export function Kennzahlfelder({ kachel, texte, groesse }: { kachel: Kachelfelder; texte: Herkunftstexte; groesse: Groesse }) {
  return (
    <>
      {/* Kopfzeile: Name links, Markierung rechts. Der Flex-Container gehört hierher und nicht um den ganzen Block: liegt der Wert mit darin, stellt er sich
          neben das Label statt darunter. */}
      <div className="flex items-start justify-between gap-2">
        <p className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">{kachel.label}</p>
        <Herkunftspille herkunft={kachel.herkunft} texte={texte} />
      </div>
      <p className={cn("mt-1 font-black text-foreground", groesse === "gross" ? "text-2xl" : "text-xl")} title={kachel.genau}>
        {kachel.wert}
        {kachel.klammer ? <span className={cn("ml-1.5 font-bold text-muted-foreground", groesse === "gross" ? "text-base" : "text-sm")}>({kachel.klammer})</span> : null}
      </p>
      <p className="mt-0.5 schrift-dense text-muted-foreground">{kachel.frage}</p>
    </>
  );
}
