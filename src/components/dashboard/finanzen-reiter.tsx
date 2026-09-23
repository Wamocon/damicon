import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Section, Stat, StatusPill, knopfKlassen } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { ladeFinanzReiter, type FinanzSpanne } from "@/lib/data/finanzen";

// Der Reiter "Finanzen": der laufende Monat, verglichen mit dem Vormonat, dazu das
// laufende Jahr.
//
// Vorher war das eine von fuenf Kacheln in der Lage-Reihe, mit kompakt geschriebenen
// Betraegen ("1,0 M ₸") auf rund 200 px Breite. Mit eigenem Reiter steht die ganze Zeile zur
// Verfuegung - also stehen die Betraege wieder ausgeschrieben, und es ist Platz fuer das,
// was drei nackte Zahlen nicht sagen: ob sie gut oder schlecht sind. Der Vormonat traegt die
// Richtung, das Jahr ordnet den Monat ein.
//
// Die Zahlen kommen direkt aus dem Journal, gefiltert nach Buchungsdatum - nicht aus
// deckungsbeitrag_je_kostentraeger, die nach Erntetag eingrenzt und dabei trotzdem ueber die
// ganze Laufzeit summiert. Begruendung ausfuehrlich in lib/data/finanzen.ts.

const db = (s: FinanzSpanne) => s.erloesTenge - s.kostenTenge;

export async function FinanzenReiter() {
  const [daten, t] = await Promise.all([ladeFinanzReiter(), getTranslations("finanzVorschau")]);
  const format = await getFormatter();

  const geld = (n: number) => `${format.number(Math.round(n))} ₸`;
  const monatName = format.dateTime(new Date(`${daten.von}T00:00:00Z`), {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const deckungsbeitrag = db(daten.monat);

  // Nur vergleichen, wenn es etwas zu vergleichen gibt. Ein Vormonat mit einem
  // Deckungsbeitrag von null ergaebe eine Veraenderung von unendlich Prozent.
  const vorDb = daten.vormonat ? db(daten.vormonat) : null;
  const veraenderung =
    vorDb !== null && vorDb !== 0 ? (deckungsbeitrag - vorDb) / Math.abs(vorDb) : null;
  const besser = veraenderung !== null && veraenderung >= 0;

  return (
    <Section
      title={t("titel")}
      description={t("lead", { monat: monatName })}
      action={<DatenquelleBadge quelle={daten.quelle} />}
    >
      {daten.monat.buchungen === 0 ? (
        <p className="schrift-dense text-muted-foreground">{t("leer", { monat: monatName })}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label={t("erloes")}
              value={geld(daten.monat.erloesTenge)}
              helper={t("buchungen", { anzahl: daten.monat.buchungen })}
            />
            <Stat label={t("kosten")} value={geld(daten.monat.kostenTenge)} />
            {/* Ein negativer Deckungsbeitrag ist kein Fehler, aber er soll ins Auge fallen -
                dieselbe Toneinteilung wie in der Tabelle auf der Finanzseite. Das Vorzeichen
                steht in der Zahl, die Farbe ist nicht der einzige Traeger. */}
            <Stat
              label={t("deckungsbeitrag")}
              value={geld(deckungsbeitrag)}
              helper={
                veraenderung !== null
                  ? t("gegenVormonat", { anteil: format.number(Math.abs(veraenderung), { style: "percent", maximumFractionDigits: 0 }) })
                  : undefined
              }
              tone={deckungsbeitrag >= 0 ? "success" : "warning"}
            />
          </div>

          {/* Der Vergleich als eigene Zeile und nicht nur als Farbe: "12 % unter dem
              Vormonat" sagt etwas, das keine Ampel sagen kann. Das Symbol ist Beiwerk,
              die Aussage steht im Text (DESIGN.md Regel 7). */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {veraenderung !== null && daten.vormonat ? (
              <StatusPill tone={besser ? "success" : "warning"}>
                {besser ? (
                  <TrendingUp className="mr-1 inline h-3 w-3" aria-hidden />
                ) : (
                  <TrendingDown className="mr-1 inline h-3 w-3" aria-hidden />
                )}
                {t(besser ? "ueberVormonat" : "unterVormonat", {
                  anteil: format.number(Math.abs(veraenderung), { style: "percent", maximumFractionDigits: 0 }),
                  betrag: geld(vorDb ?? 0),
                })}
              </StatusPill>
            ) : (
              <span>{t("ohneVormonat")}</span>
            )}
            <span>
              {t("imJahr", {
                deckungsbeitrag: geld(db(daten.jahr)),
                anzahl: daten.jahr.buchungen,
              })}
            </span>
          </div>
        </div>
      )}

      <div className="mt-4">
        <Link
          href="/dashboard/buero/finanzen"
          className={knopfKlassen({ variante: "leise", rundung: "schmal", groesse: "formular" })}
        >
          {t("link")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </Section>
  );
}
