"use client";

import { useTranslations } from "next-intl";
import { Kopfkarte, Prioritaeten } from "@/components/pruefung/pruefung-bericht";
import { PruefungAblauf } from "@/components/pruefung/pruefung-ablauf";
import "@/components/pruefung/pruefung.css";
import "@/components/pruefung/pruefung-ablauf.css";
import "@/components/dashboard/tages.css";
import { useAktuellerBericht } from "@/components/dashboard/use-aktueller-bericht";
import type { BefundAenderung, Bericht } from "@/lib/pruefung/typen";

// "Das Wichtigste heute", oberhalb der Reiterleiste und damit in jedem Reiter sichtbar.
//
// Zusammenfassung und Aenderungsliste sind 1:1 die Fassung aus main (ceo-auto-pruefung.tsx,
// PR #115) - Reifegrad-Ring, Urteil, der Satz des Modells, die Zahlenleiste und darunter die
// Prioritaeten. Eine eigene, knappere Ableitung stand hier kurzzeitig; sie ist auf Wunsch des
// Auftraggebers vom 23.09.2026 wieder der Originalfassung gewichen.
//
// Was hier NICHT mehr steht: die vier Bereichskacheln und der zugeklappte Rest des Berichts.
// Die liegen im Reiter "CEO-Compliance" (tages-compliance.tsx).
//
// Laeuft gerade ein Check, steht hier stattdessen der Live-Ablauf: man sieht, was Himbi
// gerade in welchem der vier Bereiche prueft. Ein Reiterwechsel unterbricht das nicht - der
// Strom haengt am Layout, nicht an dieser Komponente. Der Anker compliance-live-lauf ist
// Himbis Ziel fuer den Live-Hinweis (haustier-dashboard.tsx) und existiert nur hier.

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

export function TagesKopf({
  initialBericht,
  initialAenderungen,
}: {
  initialBericht: Bericht | null;
  initialAenderungen: BefundAenderung[];
}) {
  const t = useTranslations("ceoUebersicht");
  const tp = useTranslations("pruefung");
  const { bericht, aenderungen, stand } = useAktuellerBericht(initialBericht, initialAenderungen);

  if (stand?.phase === "laeuft") {
    return (
      <div id="compliance-live-lauf">
        <PruefungAblauf stand={stand} kompakt />
      </div>
    );
  }

  if (!bericht) {
    const text = stand?.phase === "fehler" ? tp("fehler.allgemein") : t("nochKeinBericht");
    return <p className="rounded-xl border border-dashed border-border p-4 text-xs leading-5 text-muted-foreground">{text}</p>;
  }

  // Auf schmalen Karten steht das Pruefungsergebnis oben, die Aenderungsliste darunter: sonst
  // schiebt eine Liste mit fuenf Eintraegen den Reifegrad unter die Falz, und man scrollt an
  // der Antwort vorbei, die man sucht. Ab @3xl kehrt die Reihenfolge in den Quelltextstand aus
  // main zurueck, wo die Aenderungen zuerst stehen - dort ist beides ohne Scrollen sichtbar.
  //
  // .tages-flaeche ist ein Grid (tages.css); order wirkt dort wie im Flexlayout.
  return (
    <div className="tages-flaeche">
      <div className="order-2 @3xl:order-1">
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
      </div>
      <div id="compliance-kopf" className="order-1 @3xl:order-2">
        <Kopfkarte bericht={bericht} />
      </div>
      <div className="order-3">
        <Prioritaeten bericht={bericht} />
      </div>
    </div>
  );
}
