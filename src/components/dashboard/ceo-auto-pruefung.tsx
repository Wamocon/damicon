"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { PruefungAblauf } from "@/components/pruefung/pruefung-ablauf";
import { PruefungBericht } from "@/components/pruefung/pruefung-bericht";
import "@/components/pruefung/pruefung.css";
import "@/components/pruefung/pruefung-ablauf.css";
import { usePruefung } from "@/components/pruefung/use-pruefung";
import type { BefundAenderung, Bericht } from "@/lib/pruefung/typen";

// Live-Ansicht des automatischen CEO-Compliance-Laufs. Startet bei jedem Aufruf der
// Startseite einen Strom gegen /api/ki-pruefung/auto (usePruefung(), derselbe Reducer
// und dieselbe Ablauf-Ansicht wie die manuelle Pruefung im KI-Panel): laeuft er wirklich
// (etwas hat sich geaendert oder es gibt noch keinen Bericht), sieht man hier live, was
// Himbi gerade in welchem der vier Bereiche prueft, statt eines toten "in ein paar
// Minuten neu laden". Stellt sich beim guenstigen Vorab-Check heraus, dass sich nichts
// geaendert hat, kommt sofort derselbe Bericht wie zuvor zurueck.

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
      <PruefungBericht bericht={bericht} />
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
  const sprache = useLocale();
  const router = useRouter();
  const { stand, starten } = usePruefung("/api/ki-pruefung/auto");
  const gestartet = useRef(false);

  useEffect(() => {
    if (gestartet.current) return;
    gestartet.current = true;
    void starten([], sprache);
  }, [sprache, starten]);

  // Server-Momentaufnahme (Zeitstempel-Pille im Kopf der Section, kommt von der
  // Elternkomponente) nach einem frischen Bericht nachziehen - der Inhalt hier ist
  // dank stand.bericht bereits sofort aktuell, unabhaengig davon.
  useEffect(() => {
    if (stand.phase === "fertig") router.refresh();
  }, [stand.phase, router]);

  if (stand.phase === "laeuft") {
    return <PruefungAblauf stand={stand} />;
  }

  const bericht = stand.bericht ?? initialBericht;
  const aenderungen = stand.bericht ? (stand.aenderungen ?? []) : initialAenderungen;

  if (!bericht) {
    const text = stand.phase === "fehler" ? tp("fehler.allgemein") : t("nochKeinBericht");
    return <p className="rounded-xl border border-dashed border-border p-4 text-xs leading-5 text-muted-foreground">{text}</p>;
  }
  return <BerichtMitAenderungen bericht={bericht} aenderungen={aenderungen} />;
}
