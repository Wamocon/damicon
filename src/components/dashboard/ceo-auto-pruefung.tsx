"use client";

import { useTranslations } from "next-intl";
import { PruefungAblauf } from "@/components/pruefung/pruefung-ablauf";
import "@/components/pruefung/pruefung.css";
import "@/components/pruefung/pruefung-ablauf.css";
import "@/components/dashboard/tages.css";
import { TagesKacheln } from "@/components/dashboard/tages-kacheln";
import { TagesZusammenfassung } from "@/components/dashboard/tages-zusammenfassung";
import { useCeoPruefung } from "@/components/dashboard/ceo-pruefung-kontext";
import { tagesbericht } from "@/lib/domain/tagesbericht";
import type { FinanzVorschau } from "@/lib/data/finanzen";
import type { BefundAenderung, Bericht } from "@/lib/pruefung/typen";

// Zeigt den geteilten Stand aus ceo-pruefung-kontext.tsx (Provider haengt am
// Dashboard-Layout, siehe dortiger Kommentar) - laeuft ein Check wirklich
// (etwas hat sich geaendert oder es gibt noch keinen Bericht), sieht man hier
// live, was Himbi gerade in welchem der vier Bereiche prueft, statt eines
// toten "in ein paar Minuten neu laden". Ein Seitenwechsel innerhalb des
// Dashboards unterbricht das nicht mehr: der Strom haengt nicht an dieser
// Komponente. Stellt sich beim guenstigen Vorab-Check heraus, dass sich
// nichts geaendert hat, kommt sofort derselbe Bericht wie zuvor zurueck.
//
// Seit dem 23.09.2026 steht darunter nicht mehr der volle Bericht, sondern seine
// Kurzfassung: Zusammenfassung plus fuenf Kacheln. Massnahmenplan, Hinweise und
// Siegel stehen auf /dashboard/compliance, wohin jede Kachel fuehrt.

export function CeoAutoPruefung({
  initialBericht,
  initialAenderungen,
  vorschau,
}: {
  /** Serverseitig geladener letzter Stand (lib/data/compliance-ceo.ts) - zu sehen, solange
   *  der eigene Live-Strom entweder noch nicht gestartet oder ohne eigenen Bericht (Fehler) endet. */
  initialBericht: Bericht | null;
  initialAenderungen: BefundAenderung[];
  /** Finanzen des laufenden Monats fuer die fuenfte Kachel. null, wenn die Rolle sie nicht sehen darf. */
  vorschau: FinanzVorschau | null;
}) {
  const stand = useCeoPruefung();

  if (stand?.phase === "laeuft") {
    return <PruefungAblauf stand={stand} />;
  }

  // stand kommt aus dem geteilten Kontext (kann ein aelterer automatischer Lauf sein) und
  // initialBericht aus der Server-Komponente (kann durch den manuellen Knopf frischer sein,
  // ohne dass der geteilte Strom davon je erfahren haette) - hier gewinnt schlicht das juengere
  // erstelltAm, unabhaengig davon, welcher der beiden Wege es zuletzt geliefert hat.
  const kandidaten = [
    stand?.bericht ? { bericht: stand.bericht, aenderungen: stand.aenderungen ?? [] } : null,
    initialBericht ? { bericht: initialBericht, aenderungen: initialAenderungen } : null,
  ].filter((k): k is { bericht: Bericht; aenderungen: BefundAenderung[] } => k !== null);
  const aktuell = kandidaten.length === 0
    ? null
    : kandidaten.reduce((a, b) => (new Date(b.bericht.erstelltAm) > new Date(a.bericht.erstelltAm) ? b : a));

  const bericht = aktuell?.bericht ?? null;
  const zusammenfassung = tagesbericht(bericht, aktuell?.aenderungen ?? []);

  return (
    <div className="tages-flaeche">
      <Fehlerhinweis phase={stand?.phase} />
      <TagesZusammenfassung stand={zusammenfassung} />
      <TagesKacheln bericht={bericht} vorschau={vorschau} />
    </div>
  );
}

// Ein gescheiterter Lauf darf nicht als "noch kein Bericht" durchgehen, und ein vorhandener
// aelterer Bericht darf dabei nicht verschwinden - deshalb eine eigene Zeile darueber statt
// eines Austauschs des ganzen Blocks.
function Fehlerhinweis({ phase }: { phase: string | undefined }) {
  const tp = useTranslations("pruefung");
  if (phase !== "fehler") return null;
  return (
    <p className="rounded-xl border border-dashed border-destructive/40 p-3 text-xs leading-5 text-muted-foreground">
      {tp("fehler.allgemein")}
    </p>
  );
}
