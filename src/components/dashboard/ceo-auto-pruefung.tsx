"use client";

import { useTranslations } from "next-intl";
import { PruefungAblauf } from "@/components/pruefung/pruefung-ablauf";
import "@/components/pruefung/pruefung.css";
import "@/components/pruefung/pruefung-ablauf.css";
import { CeoBereichsKacheln } from "@/components/dashboard/ceo-bereichs-kacheln";
import { useCeoPruefung } from "@/components/dashboard/ceo-pruefung-kontext";
import type { BefundAenderung, Bericht } from "@/lib/pruefung/typen";

// Zeigt den geteilten Stand aus ceo-pruefung-kontext.tsx (Provider haengt am
// Dashboard-Layout, siehe dortiger Kommentar) - laeuft ein Check wirklich
// (etwas hat sich geaendert oder es gibt noch keinen Bericht), sieht man hier
// live, was Himbi gerade in welchem der vier Bereiche prueft, statt eines
// toten "in ein paar Minuten neu laden". Ein Seitenwechsel innerhalb des
// Dashboards unterbricht das nicht mehr: der Strom haengt nicht an dieser
// Komponente. Stellt sich beim guenstigen Vorab-Check heraus, dass sich
// nichts geaendert hat, kommt sofort derselbe Bericht wie zuvor zurueck.

function AenderungsZeile({ a }: { a: BefundAenderung }) {
  const t = useTranslations("ceoUebersicht");
  const tp = useTranslations("pruefung");
  return (
    <li>
      <span className="font-medium text-foreground">{a.titel}</span>:{" "}
      {a.art === "neu"
        ? t("aenderungArt.neu")
        : a.art === "status_veraendert"
          ? t("aenderungArt.statusVeraendert", { vorher: tp(`status.${a.vorherStatus}`), jetzt: tp(`status.${a.status}`) })
          : t("aenderungArt.schwereVeraendert", { vorher: tp(`schwere.${a.vorherSchwere}`), jetzt: tp(`schwere.${a.schwere}`) })}
    </li>
  );
}

function BerichtMitAenderungen({ bericht, aenderungen }: { bericht: Bericht; aenderungen: BefundAenderung[] }) {
  const t = useTranslations("ceoUebersicht");
  return (
    <div className="space-y-4">
      {aenderungen.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("keineAenderung")}</p>
      ) : (
        <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-xs font-semibold text-foreground">{t("aenderungenAnzahl", { anzahl: aenderungen.length })}</p>
          <ul className="space-y-1 text-[11px] leading-5 text-muted-foreground">
            {aenderungen.map((a) => (
              <AenderungsZeile key={a.befundId} a={a} />
            ))}
          </ul>
        </div>
      )}
      <CeoBereichsKacheln bericht={bericht} />
    </div>
  );
}

export function CeoAutoPruefung({
  initialBericht,
  initialAenderungen,
}: {
  /** Serverseitig geladener letzter Stand (lib/data/compliance-ceo.ts) - zu sehen, solange
   *  der eigene Live-Strom entweder noch nicht gestartet oder ohne eigenen Bericht (Fehler) endet. */
  initialBericht: Bericht | null;
  initialAenderungen: BefundAenderung[];
}) {
  const t = useTranslations("ceoUebersicht");
  const tp = useTranslations("pruefung");
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
  const aenderungen = aktuell?.aenderungen ?? [];

  if (!bericht) {
    const text = stand?.phase === "fehler" ? tp("fehler.allgemein") : t("nochKeinBericht");
    return <p className="rounded-xl border border-dashed border-border p-4 text-xs leading-5 text-muted-foreground">{text}</p>;
  }
  return <BerichtMitAenderungen bericht={bericht} aenderungen={aenderungen} />;
}
