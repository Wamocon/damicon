"use client";

import { useTranslations } from "next-intl";
import { StatusPill } from "@/components/ui/kit";
import type { Tagesbericht } from "@/lib/domain/tagesbericht";

// "Das Wichtigste heute": Reifegrad, ein Satz, bis zu drei Punkte, die Zahlen und was sich
// seit dem letzten Bericht geaendert hat. Alles aus dem gespeicherten Bericht abgeleitet
// (lib/domain/tagesbericht.ts), kein Modellaufruf beim Oeffnen der Seite.
//
// Der Ring und die Zahlenleiste sind dieselben Bausteine wie im vollen Bericht
// (components/pruefung/pruefung.css), nur mit dem Modifikator --kompakt: die Startseite
// traegt darunter noch fuenf Kacheln und die vier Zonen.

function Ring({ reife, stufe, label }: { reife: number; stufe: string; label: string }) {
  // 301.6 ist der Umfang des Kreises mit r=48 - derselbe Wert wie in Kopfkarte().
  const ziel = 301.6 * (1 - reife / 100);
  return (
    <div className="pr-messer" style={{ ["--ziel" as string]: ziel }} data-stufe={stufe}>
      <svg viewBox="0 0 110 110" aria-hidden>
        <circle className="pr-messer__spur" cx="55" cy="55" r="48" />
        <circle className="pr-messer__wert" cx="55" cy="55" r="48" />
      </svg>
      <div className="pr-messer__mitte">
        <span className="pr-messer__zahl">{reife}</span>
        <span className="pr-messer__label">{label}</span>
      </div>
    </div>
  );
}

export function TagesZusammenfassung({ stand }: { stand: Tagesbericht }) {
  const t = useTranslations("ceoUebersicht");
  const tp = useTranslations("pruefung");

  if (!stand.vorhanden) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-xs leading-5 text-muted-foreground">
        {t("nochKeinBericht")}
      </p>
    );
  }

  const { zahlen } = stand;
  // Traegt der Bericht keine Zusammenfassung, steht hier ein Satz aus seinen eigenen Zahlen -
  // nie eine leere Karte, und kein zweiter Modellaufruf nur fuer einen Satz.
  const satz =
    stand.zusammenfassung !== ""
      ? stand.zusammenfassung
      : t("ohneZusammenfassung", { punkte: zahlen.verstoesse + zahlen.luecken });

  return (
    <div className="space-y-4">
      <div className="pr-kopfkarte pr-kopfkarte--kompakt" data-stufe={stand.stufe}>
        <Ring reife={stand.reife} stufe={stand.stufe} label={tp("bericht.reife")} />
        <div>
          <p className="pr-urteil">{tp(`stufe.${stand.stufe}`)}</p>
          <p className="pr-zusammenfassung">{satz}</p>
          <div className="pr-zahlenleiste">
            {zahlen.verstoesse > 0 ? (
              <span className="pr-status" data-status="verstoss">
                {zahlen.verstoesse} {tp("status.verstoss")}
              </span>
            ) : null}
            {zahlen.luecken > 0 ? (
              <span className="pr-status" data-status="luecke">
                {zahlen.luecken} {tp("status.luecke")}
              </span>
            ) : null}
            {zahlen.sofort > 0 ? <span className="pr-wert">{t("zahlen.sofort", { anzahl: zahlen.sofort })}</span> : null}
            {/* Fuer wie viele Pruefpunkte gar keine Betriebsdaten vorlagen. Das gehoert sichtbar
                daneben: eine hohe Reife bedeutet sonst etwas anderes, als sie aussieht. */}
            {zahlen.ohneDaten > 0 ? (
              <span className="pr-wert">{t("zahlen.ohneDaten", { anzahl: zahlen.ohneDaten })}</span>
            ) : null}
          </div>
        </div>
      </div>

      {stand.punkte.length > 0 ? (
        <div>
          <h3 className="pr-abschnitt__titel">{t("punkteTitel")}</h3>
          <ol className="tages-punkte">
            {stand.punkte.map((p, i) => (
              <li key={`${p.art}-${p.befundId ?? i}`}>
                {p.bereich ? <span className="tages-punkte__bereich">{tp(`bereich.${p.bereich}.name`)}: </span> : null}
                {p.text}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="schrift-dense text-muted-foreground">{t("keinePunkte")}</p>
      )}

      {zahlen.aenderungen === 0 ? (
        <p className="text-xs text-muted-foreground">{t("keineAenderung")}</p>
      ) : (
        <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-xs font-semibold text-foreground">{t("aenderungenAnzahl", { anzahl: zahlen.aenderungen })}</p>
          <ul className="space-y-1 text-[11px] leading-5 text-muted-foreground">
            {stand.aenderungen.map((a) => (
              <li key={a.befundId}>
                <span className="font-medium text-foreground">{a.titel}</span>:{" "}
                {a.art === "neu"
                  ? t("aenderungArt.neu")
                  : a.art === "status_veraendert"
                    ? t("aenderungArt.statusVeraendert", {
                        vorher: tp(`status.${a.vorherStatus}`),
                        jetzt: tp(`status.${a.status}`),
                      })
                    : t("aenderungArt.schwereVeraendert", {
                        vorher: tp(`schwere.${a.vorherSchwere}`),
                        jetzt: tp(`schwere.${a.schwere}`),
                      })}
              </li>
            ))}
            {stand.weitereAenderungen > 0 ? (
              <li className="text-muted-foreground">{t("weitereAenderungen", { anzahl: stand.weitereAenderungen })}</li>
            ) : null}
          </ul>
        </div>
      )}

      {stand.veraltet ? <StatusPill tone="warning">{t("veraltet")}</StatusPill> : null}
    </div>
  );
}
