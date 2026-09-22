import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Section, Stat, knopfKlassen } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { ladeFinanzVorschau } from "@/lib/data/finanzen";

// Finanzen auf der Uebersichtsseite: Erloese und Kosten des laufenden Monats.
//
// Die Zahlen kommen direkt aus dem Journal, gefiltert nach Buchungsdatum -
// nicht aus deckungsbeitrag_je_kostentraeger, die nach Erntetag eingrenzt und
// dabei trotzdem ueber die ganze Laufzeit summiert. Auf einer Kachel ohne
// Platz fuer eine Erklaerung waere das irrefuehrend. Begruendung ausfuehrlich
// in lib/data/finanzen.ts bei ladeFinanzVorschau().
//
// Server Component und von der Seite als Element durchgereicht, nicht in
// DashboardHome importiert: die ist "use client" (usePersona), dort laesst
// sich eine Server Component nicht einbinden. Dasselbe Vorgehen wie bei der
// CEO-Uebersicht daneben.
export async function FinanzVorschau() {
  const [vorschau, t] = await Promise.all([
    ladeFinanzVorschau(),
    getTranslations("finanzVorschau"),
  ]);
  const format = await getFormatter();

  const geld = (n: number) => `${format.number(Math.round(n))} ₸`;
  const monat = format.dateTime(new Date(`${vorschau.von}T00:00:00Z`), {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const deckungsbeitrag = vorschau.erloesTenge - vorschau.kostenTenge;

  return (
    <Section
      title={t("titel")}
      description={t("lead", { monat })}
      action={<DatenquelleBadge quelle={vorschau.quelle} />}
    >
      {vorschau.buchungen === 0 ? (
        <p className="schrift-dense text-muted-foreground">{t("leer", { monat })}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label={t("erloes")}
            value={geld(vorschau.erloesTenge)}
            helper={t("buchungen", { anzahl: vorschau.buchungen })}
          />
          <Stat label={t("kosten")} value={geld(vorschau.kostenTenge)} />
          {/* Ein negativer Deckungsbeitrag ist kein Fehler, aber er soll ins
              Auge fallen - dieselbe Toneinteilung wie in der Tabelle auf der
              Finanzseite. */}
          <Stat
            label={t("deckungsbeitrag")}
            value={geld(deckungsbeitrag)}
            tone={deckungsbeitrag >= 0 ? "success" : "warning"}
          />
        </div>
      )}

      <div className="mt-4">
        <Link
          href="/dashboard/buero/finanzen"
          className={knopfKlassen({
            variante: "leise",
            rundung: "schmal",
            groesse: "formular",
          })}
        >
          {t("link")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </Section>
  );
}
