"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { type ComplianceTourSchritt, useRegistriereComplianceTour } from "@/components/dashboard/compliance-tour-kontext";
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
//
// Massnahmenplan/Hinweise/Siegel bleiben unveraendert (siehe pruefung-bericht.tsx), stehen
// hier aber zugeklappt: fuer eine Fuehrungsrolle sind das selten die ersten Zahlen, die
// zaehlen, und bei einem sauberen Bericht ohne Massnahmen fraessen drei leere Abschnitte
// nur Platz auf der Startseite. Die eigene UEberschrift der jeweiligen Komponente wird dabei
// per CSS ausgeblendet (.pr-aufklappbar__innen), der Aufklapp-Kopf hier traegt denselben Text.
function Aufklappbar({ titel, anzahl, symbol, children }: { titel: string; anzahl?: number; symbol?: ReactNode; children: ReactNode }) {
  const [offen, setOffen] = useState(false);
  return (
    <div className="pr-aufklappbar" data-offen={offen}>
      <button type="button" className="pr-aufklappbar__kopf" onClick={() => setOffen((v) => !v)} aria-expanded={offen}>
        {symbol}
        <span className="pr-aufklappbar__titel">{titel}</span>
        {typeof anzahl === "number" ? <span className="pr-chip">{anzahl}</span> : null}
        <ChevronDown className="pr-aufklappbar__pfeil h-4 w-4" aria-hidden />
      </button>
      <div className="pr-aufklappbar__koerper">
        <div className="pr-aufklappbar__innen">
          <div className="pr-aufklappbar__polster">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function CeoBereichsKacheln({ bericht }: { bericht: Bericht }) {
  const t = useTranslations("pruefung");
  const tc = useTranslations("ceoUebersicht");
  const [offenerBereich, setOffenerBereich] = useState<Pruefbereich | null>(null);

  const bereiche = PRUEFBEREICHE.filter((b) => bericht.bereiche.includes(b)).map((bereich) => {
    const befunde = bericht.befunde.filter((b) => b.bereich === bereich);
    return { bereich, befunde, kz: kennzahlen(befunde) };
  });
  const aktiv = bereiche.find((b) => b.bereich === offenerBereich) ?? null;
  const AktivSymbol = aktiv ? BEREICH_SYMBOL[aktiv.bereich] : null;
  const hatHinweise = bericht.hinweise.length > 0 || !bericht.vollstaendig;

  // Himbis Fuehrung durch den Bericht (compliance-tour-kontext.tsx): eine Station fuer das
  // Gesamtbild, dann eine je Bereich, aus denselben Kennzahlen wie die Kacheln selbst.
  const tourSchritte: ComplianceTourSchritt[] = [
    { anker: "compliance-kopf", titel: tc("tour.kopfTitel"), text: bericht.zusammenfassung },
    ...bereiche.map(({ bereich, befunde, kz }) => ({
      anker: `compliance-kachel-${bereich}`,
      titel: t(`bereich.${bereich}.name`),
      text: tc("tour.bereich", { reife: kz.reife, stufe: t(`stufe.${kz.stufe}`), anzahl: befunde.length }),
    })),
  ];
  useRegistriereComplianceTour(tourSchritte);

  return (
    <>
      <div id="compliance-kopf">
        <Kopfkarte bericht={bericht} />
      </div>
      <Prioritaeten bericht={bericht} />

      <div className="pr-kacheln-bereich">
        <h3 className="pr-abschnitt__titel">{t("bericht.befunde")}</h3>
        <div className="pr-kacheln">
          {bereiche.map(({ bereich, befunde, kz }) => {
            const Symbol = BEREICH_SYMBOL[bereich];
            return (
              <button
                key={bereich}
                id={`compliance-kachel-${bereich}`}
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

      {bericht.massnahmen.length === 0 ? (
        <p className="pr-leer-hinweis">{tc("keineMassnahmen")}</p>
      ) : (
        <Aufklappbar titel={t("bericht.massnahmen")} anzahl={bericht.massnahmen.length}>
          <Massnahmenplan bericht={bericht} />
        </Aufklappbar>
      )}
      {hatHinweise ? (
        <Aufklappbar titel={t("bericht.hinweise")} anzahl={bericht.hinweise.length || undefined}>
          <Hinweise bericht={bericht} />
        </Aufklappbar>
      ) : null}
      <Aufklappbar titel={t("siegel.titel")} symbol={<ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />}>
        <Siegel bericht={bericht} />
      </Aufklappbar>

      <Sheet
        offen={aktiv !== null}
        onSchliessen={() => setOffenerBereich(null)}
        titel={aktiv ? t(`bereich.${aktiv.bereich}.name`) : ""}
        position="mitte"
      >
        {aktiv ? (
          <div className="pr-bereich-detail p-4 sm:p-6">
            <div className="pr-bereich-detail__kopf" data-stufe={aktiv.kz.stufe}>
              {AktivSymbol ? (
                <span className="pr-bereich-detail__symbol" data-bereich={aktiv.bereich} aria-hidden>
                  <AktivSymbol className="h-5 w-5" />
                </span>
              ) : null}
              <span className="pr-bereich-detail__zahl">{aktiv.kz.reife}</span>
              <span className="pr-bereich-detail__meta">
                <span className="pr-bereich-detail__urteil">{t(`stufe.${aktiv.kz.stufe}`)}</span>
                <span className="pr-bereich-detail__hinweis">
                  {t("bericht.reife")} {aktiv.kz.reife}/100 · {aktiv.befunde.length} {t("bericht.befunde")}
                </span>
              </span>
              <span className="pr-zahlenleiste pr-bereich-detail__zahlenleiste">
                {(["verstoss", "luecke", "hinweis", "konform"] as const)
                  .filter((s) => aktiv.kz.nachStatus[s] > 0)
                  .map((s) => (
                    <span key={s} className="pr-status" data-status={s}>
                      {aktiv.kz.nachStatus[s]} {t(`status.${s}`)}
                    </span>
                  ))}
              </span>
            </div>
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
