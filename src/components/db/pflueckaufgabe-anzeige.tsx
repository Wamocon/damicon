import { getFormatter, getTranslations } from "next-intl/server";
import { StatusPill } from "@/components/ui/kit";
import { FaelligkeitAnzeige } from "@/components/db/faelligkeit-anzeige";
import { aufgabenStatusMeta, type AufgabenStatus } from "@/lib/domain/pflueckaufgaben";
import { faelligkeitZaehlt } from "@/lib/domain/pflueckaufgaben-liste";
import { cn } from "@/lib/utils";

// Was Liste und Detailansicht der Pflueckaufgaben gleich zeigen (Cleanup
// WMCNL-2488): Status mit Faelligkeit, Mengen, Q-Faktor, Fortschritt. Vorher
// stand jedes davon zwei- bis dreimal im Code und konnte auseinanderlaufen.

type Formatierer = Awaited<ReturnType<typeof getFormatter>>;

/**
 * Eine Menge in Kilogramm, mit der Einheit der Sprache: "51,4 kg", auf
 * Russisch und Kasachisch "51,4 кг" - die Beschriftungen dort sagen "кг".
 */
export function kg(format: Formatierer, wert: number): string {
  return format.number(wert, { style: "unit", unit: "kilogram", maximumFractionDigits: 1 });
}

/** "17,9 / 30 kg": gemeldet gegen Ziel. */
export function istGegenZiel(format: Formatierer, ist: number, ziel: number): string {
  return `${format.number(ist, { maximumFractionDigits: 1 })} / ${kg(format, ziel)}`;
}

/** Der Qualitaetsfaktor mit zwei Nachkommastellen, "–" solange er fehlt. */
export function qFaktor(format: Formatierer, wert: number | null): string {
  return wert === null
    ? "–"
    : format.number(wert, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Status und Faelligkeit einer Aufgabe. Die Faelligkeit nur, solange die
 * Brigade noch pflueckt - in der Belegpruefung hat sie geliefert, dort ist
 * nichts mehr "ueberfaellig" (faelligkeitZaehlt).
 */
export async function AufgabenMarken({
  status,
  faelligkeit,
}: {
  status: AufgabenStatus;
  faelligkeit: string | null;
}) {
  const st = await getTranslations("aufgabenStatus");
  return (
    <>
      {faelligkeitZaehlt(status) ? <FaelligkeitAnzeige faelligkeit={faelligkeit} /> : null}
      <StatusPill tone={aufgabenStatusMeta[status].tone}>{st(status)}</StatusPill>
    </>
  );
}

/** Fortschrittsbalken, Breite in Prozent (fortschrittProzent). */
export function Fortschrittsbalken({ prozent, dick }: { prozent: number; dick?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-full bg-muted", dick ? "h-2" : "h-1.5")}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${prozent}%` }} />
    </div>
  );
}
