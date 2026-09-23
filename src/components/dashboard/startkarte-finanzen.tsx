import { getFormatter, getTranslations } from "next-intl/server";
import { Startkarte, StartkarteChip } from "@/components/dashboard/startkarte";
import { ladeFinanzVorschau } from "@/lib/data/finanzen";

// Rechte Haelfte der Begruessungskarte fuer admin, ceo, betriebsleitung und buchhaltung:
// der Deckungsbeitrag des laufenden Monats, darunter Erloese und Kosten als Chips.
//
// Bis zum 23.09.2026 war das eine von fuenf Kacheln in der Lage-Reihe und musste seine
// Betraege auf rund 200 px kompakt schreiben. Hier ist Platz fuer die ausgeschriebene Zahl.
export async function StartkarteFinanzen() {
  const [vorschau, t] = await Promise.all([ladeFinanzVorschau(), getTranslations("finanzVorschau")]);
  const format = await getFormatter();

  const geld = (n: number) => `${format.number(Math.round(n))} ₸`;
  const kurz = (n: number) => `${format.number(Math.round(n), { notation: "compact" })} ₸`;
  const monat = format.dateTime(new Date(`${vorschau.von}T00:00:00Z`), {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const deckungsbeitrag = vorschau.erloesTenge - vorschau.kostenTenge;
  const leer = vorschau.buchungen === 0;

  return (
    <Startkarte
      label={t("deckungsbeitrag")}
      // Ein negativer Deckungsbeitrag ist kein Fehler, aber er soll ins Auge fallen. Das
      // Vorzeichen steht in der Zahl, die Farbe ist nicht der einzige Traeger.
      wert={leer ? "–" : geld(deckungsbeitrag)}
      ton={leer ? "neutral" : deckungsbeitrag >= 0 ? "gut" : "achtung"}
      kontext={leer ? t("leer", { monat }) : `${monat} · ${t("buchungen", { anzahl: vorschau.buchungen })}`}
      chips={
        leer ? null : (
          <>
            <StartkarteChip>
              {t("erloes")} {kurz(vorschau.erloesTenge)}
            </StartkarteChip>
            <StartkarteChip>
              {t("kosten")} {kurz(vorschau.kostenTenge)}
            </StartkarteChip>
          </>
        )
      }
      href="/dashboard/buero/finanzen"
      ziel={t("link")}
    />
  );
}
