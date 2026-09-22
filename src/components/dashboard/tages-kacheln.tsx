"use client";

import { useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronRight, Wallet } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BefundKarte } from "@/components/pruefung/pruefung-bericht";
import { BEREICH_SYMBOL } from "@/components/pruefung/symbole";
import { Sheet } from "@/components/ui/sheet";
import { bereichskacheln } from "@/lib/domain/tagesbericht";
import type { Pruefbereich } from "@/lib/pruefung/rollen";
import type { Bericht } from "@/lib/pruefung/typen";
import type { FinanzVorschau } from "@/lib/data/finanzen";

// Die fuenf Kacheln unter der Zusammenfassung: Audit, Steuern, Recht, Risiko und Finanzen,
// gleichrangig nebeneinander. Die Reihenfolge der vier Pruefbereiche ist fest (PRUEFBEREICHE,
// siehe bereichskacheln()) - eine Kachel, die taeglich die Position wechselt, macht die Seite
// unlesbar.
//
// Jede Kachel ist ein Link und funktioniert damit ohne JavaScript (DESIGN.md Regel 6):
// die vier Pruefkacheln fuehren auf /dashboard/compliance, die Finanzkachel auf die
// Finanzseite. Ist JavaScript da, faengt onClick die vier Pruefkacheln ab und oeffnet
// stattdessen das Blatt mit den Befunden dieses Bereichs - schneller als eine Navigation,
// und der Rest der Seite bleibt sichtbar dahinter. Vorher waren es Knoepfe, die ohne
// JavaScript ins Leere fuehrten.

function Kachel({
  href,
  stufe,
  bereich,
  symbol,
  name,
  zahl,
  zahlLabel,
  urteil,
  chips,
  fuss,
  onClick,
}: {
  href: string;
  stufe: string;
  bereich?: string;
  symbol: ReactNode;
  name: string;
  zahl: string;
  zahlLabel: string;
  urteil: string;
  chips: ReactNode;
  fuss: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <Link
      href={href}
      className="pr-kachel pr-kachel--verweis"
      data-bereich={bereich}
      data-stufe={stufe}
      onClick={onClick}
    >
      <span className="pr-kachel__kopf">
        <span className="pr-kachel__symbol" aria-hidden>
          {symbol}
        </span>
        <span className="pr-kachel__name">{name}</span>
        <ChevronRight className="pr-kachel__pfeil h-4 w-4" aria-hidden />
      </span>
      <span className="pr-kachel__reife">
        <span className="pr-kachel__zahl">{zahl}</span>
        <span className="pr-kachel__label">{zahlLabel}</span>
      </span>
      <span className="pr-kachel__urteil">{urteil}</span>
      <span className="pr-zahlenleiste">{chips}</span>
      <span className="pr-kachel__fuss">{fuss}</span>
    </Link>
  );
}

function FinanzKachel({ vorschau }: { vorschau: FinanzVorschau }) {
  const t = useTranslations("finanzVorschau");
  const format = useFormatter();

  // Kompakte Schreibweise, weil die Kachel rund 200 px breit ist und drei Betraege traegt.
  // Intl deckt de, en, kk und ru ab. Der genaue Wert steht auf der Finanzseite, auf die die
  // Kachel fuehrt, und im title-Attribut.
  const kurz = (n: number) => `${format.number(Math.round(n), { notation: "compact" })} ₸`;
  const genau = (n: number) => `${format.number(Math.round(n))} ₸`;
  const monat = format.dateTime(new Date(`${vorschau.von}T00:00:00Z`), {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const deckungsbeitrag = vorschau.erloesTenge - vorschau.kostenTenge;
  const leer = vorschau.buchungen === 0;

  return (
    <Link
      href="/dashboard/buero/finanzen"
      className="pr-kachel pr-kachel--verweis"
      data-stufe="neutral"
      title={leer ? undefined : genau(deckungsbeitrag)}
    >
      <span className="pr-kachel__kopf">
        <span className="pr-kachel__symbol" aria-hidden>
          <Wallet className="h-4 w-4" />
        </span>
        <span className="pr-kachel__name">{t("kurz")}</span>
        <ChevronRight className="pr-kachel__pfeil h-4 w-4" aria-hidden />
      </span>
      <span className="pr-kachel__reife">
        {/* Ein negativer Deckungsbeitrag ist kein Fehler, aber er soll ins Auge fallen -
            dieselbe Toneinteilung wie auf der Finanzseite. Das Vorzeichen steht in der Zahl,
            die Farbe ist nicht der einzige Traeger. */}
        <span
          className="pr-kachel__zahl"
          style={leer ? undefined : { color: deckungsbeitrag >= 0 ? "var(--success)" : "var(--warning)" }}
        >
          {leer ? "–" : kurz(deckungsbeitrag)}
        </span>
        <span className="pr-kachel__label">{t("deckungsbeitrag")}</span>
      </span>
      <span className="pr-kachel__urteil">{monat}</span>
      <span className="pr-zahlenleiste">
        {leer ? null : (
          <>
            <span className="pr-wert" title={genau(vorschau.erloesTenge)}>
              {t("erloes")} {kurz(vorschau.erloesTenge)}
            </span>
            <span className="pr-wert" title={genau(vorschau.kostenTenge)}>
              {t("kosten")} {kurz(vorschau.kostenTenge)}
            </span>
          </>
        )}
      </span>
      <span className="pr-kachel__fuss">
        {leer ? t("leer", { monat }) : t("kachelHinweis", { anzahl: vorschau.buchungen })}
      </span>
    </Link>
  );
}

export function TagesKacheln({ bericht, vorschau }: { bericht: Bericht | null; vorschau: FinanzVorschau | null }) {
  const t = useTranslations("pruefung");
  const tc = useTranslations("ceoUebersicht");
  const [offenerBereich, setOffenerBereich] = useState<Pruefbereich | null>(null);

  const kacheln = bereichskacheln(bericht);
  const aktiv = kacheln.find((k) => k.bereich === offenerBereich) ?? null;
  const aktiveBefunde = aktiv && bericht ? bericht.befunde.filter((b) => b.bereich === aktiv.bereich) : [];

  return (
    <>
      {/* Das Fuenfer-Raster nur, wenn die Finanzkachel wirklich dabei ist - sonst bliebe ab
          1280 px eine leere Spalte stehen. */}
      <div className={vorschau ? "pr-kacheln pr-kacheln--fuenf" : "pr-kacheln"}>
        {kacheln.map((k) => {
          const Symbol = BEREICH_SYMBOL[k.bereich];
          const name = t(`bereich.${k.bereich}.name`);

          // Nicht geprueft, oder fuer jeden Punkt fehlten die Betriebsdaten: dann steht hier
          // kein Reifegrad. Eine 100 waere in beiden Faellen eine erfundene Zahl.
          if (!k.geprueft || k.ohneDaten) {
            return (
              <Kachel
                key={k.bereich}
                href="/dashboard/compliance"
                stufe="offen"
                bereich={k.bereich}
                symbol={<Symbol className="h-4 w-4" />}
                name={name}
                zahl="–"
                zahlLabel={t("bericht.reife")}
                urteil={k.geprueft ? tc("ohneDaten") : tc("nichtGeprueft")}
                chips={null}
                fuss={tc("vollerBericht")}
              />
            );
          }

          const kz = k.kz!;
          return (
            <Kachel
              key={k.bereich}
              href="/dashboard/compliance"
              stufe={kz.stufe}
              bereich={k.bereich}
              symbol={<Symbol className="h-4 w-4" />}
              name={name}
              zahl={String(kz.reife)}
              zahlLabel={t("bericht.reife")}
              urteil={t(`stufe.${kz.stufe}`)}
              chips={(["verstoss", "luecke", "hinweis", "konform"] as const)
                .filter((s) => kz.nachStatus[s] > 0)
                .map((s) => (
                  <span key={s} className="pr-status" data-status={s}>
                    {kz.nachStatus[s]} {t(`status.${s}`)}
                  </span>
                ))}
              fuss={tc("kachelOeffnen", { anzahl: k.anzahl })}
              onClick={(e) => {
                e.preventDefault();
                setOffenerBereich(k.bereich);
              }}
            />
          );
        })}

        {vorschau ? <FinanzKachel vorschau={vorschau} /> : null}
      </div>

      <Sheet
        offen={aktiv !== null}
        onSchliessen={() => setOffenerBereich(null)}
        titel={aktiv ? t(`bereich.${aktiv.bereich}.name`) : ""}
      >
        {aktiv && aktiv.kz && bericht ? (
          <div className="p-4 sm:p-5">
            <p className="pr-bereich-detail__kz">
              {t(`stufe.${aktiv.kz.stufe}`)} · {t("bericht.reife")} {aktiv.kz.reife}/100
            </p>
            <ul className="pr-befunde">
              {aktiveBefunde.map((b, i) => (
                <BefundKarte key={b.id} b={b} belege={bericht.belege} index={i} />
              ))}
            </ul>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
