"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { BefundKarte, Hinweise, Kopfkarte, Massnahmenplan, Prioritaeten, Siegel } from "@/components/pruefung/pruefung-bericht";
import { BEREICH_SYMBOL } from "@/components/pruefung/symbole";
import "@/components/pruefung/pruefung.css";
import { Sheet } from "@/components/ui/sheet";
import { kennzahlen } from "@/lib/pruefung/befund";
import { PRUEFBEREICHE, type Pruefbereich } from "@/lib/pruefung/rollen";
import type { Bericht } from "@/lib/pruefung/typen";

// CEO-Fassung des Berichts (siehe pruefung-bericht.tsx: dieselben Bausteine, Kopfkarte bis
// Siegel, nur "Befunde" ersetzt): statt einer langen, filterbaren Liste ein Vierer-Raster,
// ein Bereich eine Kachel mit eigener Reife. Ein Klick oeffnet die vollen Befunde dieses
// Bereichs in einem Sheet (components/ui/sheet.tsx), der Rest der Seite bleibt sichtbar
// dahinter.

export function CeoBereichsKacheln({ bericht }: { bericht: Bericht }) {
  const t = useTranslations("pruefung");
  const tc = useTranslations("ceoUebersicht");
  const [offenerBereich, setOffenerBereich] = useState<Pruefbereich | null>(null);

  const bereiche = PRUEFBEREICHE.filter((b) => bericht.bereiche.includes(b)).map((bereich) => {
    const befunde = bericht.befunde.filter((b) => b.bereich === bereich);
    return { bereich, befunde, kz: kennzahlen(befunde) };
  });
  const aktiv = bereiche.find((b) => b.bereich === offenerBereich) ?? null;

  return (
    <>
      <Kopfkarte bericht={bericht} />
      <Prioritaeten bericht={bericht} />

      <div>
        <h3 className="pr-abschnitt__titel">{t("bericht.befunde")}</h3>
        <div className="pr-kacheln">
          {bereiche.map(({ bereich, befunde, kz }) => {
            const Symbol = BEREICH_SYMBOL[bereich];
            return (
              <button
                key={bereich}
                type="button"
                className="pr-kachel"
                data-bereich={bereich}
                data-stufe={kz.stufe}
                onClick={() => setOffenerBereich(bereich)}
              >
                <span className="pr-kachel__kopf">
                  <span className="pr-kachel__symbol" aria-hidden>
                    <Symbol className="h-4 w-4" />
                  </span>
                  <span className="pr-kachel__name">{t(`bereich.${bereich}.name`)}</span>
                  <ChevronRight className="pr-kachel__pfeil h-4 w-4" aria-hidden />
                </span>
                <span className="pr-kachel__reife">
                  <span className="pr-kachel__zahl">{kz.reife}</span>
                  <span className="pr-kachel__label">{t("bericht.reife")}</span>
                </span>
                <span className="pr-kachel__urteil">{t(`stufe.${kz.stufe}`)}</span>
                <span className="pr-zahlenleiste">
                  {(["verstoss", "luecke", "hinweis", "konform"] as const)
                    .filter((s) => kz.nachStatus[s] > 0)
                    .map((s) => (
                      <span key={s} className="pr-status" data-status={s}>
                        {kz.nachStatus[s]} {t(`status.${s}`)}
                      </span>
                    ))}
                </span>
                <span className="pr-kachel__fuss">{tc("kachelOeffnen", { anzahl: befunde.length })}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Massnahmenplan bericht={bericht} />
      <Hinweise bericht={bericht} />
      <Siegel bericht={bericht} />

      <Sheet offen={aktiv !== null} onSchliessen={() => setOffenerBereich(null)} titel={aktiv ? t(`bereich.${aktiv.bereich}.name`) : ""}>
        {aktiv ? (
          <div className="p-4 sm:p-5">
            <p className="pr-bereich-detail__kz">
              {t(`stufe.${aktiv.kz.stufe}`)} · {t("bericht.reife")} {aktiv.kz.reife}/100
            </p>
            <ul className="pr-befunde">
              {aktiv.befunde.map((b, i) => (
                <BefundKarte key={b.id} b={b} belege={bericht.belege} index={i} />
              ))}
            </ul>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
