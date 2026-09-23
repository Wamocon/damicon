"use client";

import { useTranslations } from "next-intl";
import { PruefungAblauf } from "@/components/pruefung/pruefung-ablauf";
import "@/components/pruefung/pruefung.css";
import "@/components/pruefung/pruefung-ablauf.css";
import "@/components/dashboard/tages.css";
import { TagesZusammenfassung } from "@/components/dashboard/tages-zusammenfassung";
import { useAktuellerBericht } from "@/components/dashboard/use-aktueller-bericht";
import { tagesbericht } from "@/lib/domain/tagesbericht";
import type { BefundAenderung, Bericht } from "@/lib/pruefung/typen";

// "Das Wichtigste heute", oberhalb der Reiterleiste und damit in jedem Reiter sichtbar.
//
// Laeuft gerade ein Check (etwas hat sich geaendert oder es gibt noch keinen Bericht), steht
// hier stattdessen der Live-Ablauf: man sieht, was Himbi gerade in welchem der vier Bereiche
// prueft, statt eines toten "in ein paar Minuten neu laden". Ein Seitenwechsel innerhalb des
// Dashboards unterbricht das nicht - der Strom haengt am Layout, nicht an dieser Komponente.
// Das gilt auch fuer einen Reiterwechsel, der nichts anderes ist als eine Navigation
// innerhalb desselben Layouts.
//
// Der Anker compliance-live-lauf ist Himbis Ziel fuer den Live-Hinweis
// (haustier-dashboard.tsx) und existiert nur hier.
export function TagesKopf({
  initialBericht,
  initialAenderungen,
}: {
  initialBericht: Bericht | null;
  initialAenderungen: BefundAenderung[];
}) {
  const tp = useTranslations("pruefung");
  const { bericht, aenderungen, stand } = useAktuellerBericht(initialBericht, initialAenderungen);

  if (stand?.phase === "laeuft") {
    return (
      <div id="compliance-live-lauf">
        <PruefungAblauf stand={stand} kompakt />
      </div>
    );
  }

  return (
    <div className="tages-flaeche">
      {/* Ein gescheiterter Lauf darf nicht als "noch kein Bericht" durchgehen, und ein
          vorhandener aelterer Bericht darf dabei nicht verschwinden - deshalb eine eigene
          Zeile darueber statt eines Austauschs des ganzen Blocks. */}
      {stand?.phase === "fehler" ? (
        <p className="rounded-xl border border-dashed border-destructive/40 p-3 text-xs leading-5 text-muted-foreground">
          {tp("fehler.allgemein")}
        </p>
      ) : null}
      <TagesZusammenfassung stand={tagesbericht(bericht, aenderungen)} />
    </div>
  );
}
