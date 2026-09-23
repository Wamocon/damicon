import { getFormatter, getTranslations } from "next-intl/server";
import { Startkarte } from "@/components/dashboard/startkarte";
import { ladeNaechsteLieferung } from "@/lib/data/startkarte";

// Rechte Haelfte der Begruessungskarte fuer die Rolle kunde: die naechste zugesagte
// Lieferung. Das ist die Frage, mit der ein Kunde die Seite oeffnet.
//
// Nur bestaetigte Vorbestellungen - eine angefragte ist noch keine Zusage, und auf der
// Startseite soll kein Termin stehen, auf den sich niemand festgelegt hat.
export async function StartkarteKunde({ b2bKundeId }: { b2bKundeId: string | null }) {
  const [lieferung, t] = await Promise.all([
    ladeNaechsteLieferung(b2bKundeId),
    getTranslations("startkarte.kunde"),
  ]);
  if (!lieferung) return null;

  const format = await getFormatter();
  const termin = format.dateTime(new Date(`${lieferung.liefertermin}T00:00:00Z`), {
    dateStyle: "full",
    timeZone: "UTC",
  });

  return (
    <Startkarte
      label={t("label")}
      wert={`${format.number(lieferung.mengeKg, { maximumFractionDigits: 0 })} kg`}
      kontext={
        lieferung.posten > 1
          ? t("kontextMehrere", { termin, anzahl: lieferung.posten })
          : t("kontext", { termin })
      }
      href="/dashboard/markt/b2b_portal"
      ziel={t("weiter")}
    />
  );
}
