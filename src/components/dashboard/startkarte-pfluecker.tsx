import { getFormatter, getTranslations } from "next-intl/server";
import { Startkarte } from "@/components/dashboard/startkarte";
import { ladeLetztenLohn } from "@/lib/data/startkarte";

// Rechte Haelfte der Begruessungskarte fuer die Rolle picker: der letzte Lohnlauf.
//
// Nebenbei ein erster Schritt gegen einen seit Runde 1 offenen Punkt - fuer Pfluecker war die
// Startseite bisher vollstaendig leer, keine einzige Zahl. Das eigentliche Ticket dazu bleibt
// offen; hier steht jetzt wenigstens das, was sie am haeufigsten suchen.
export async function StartkartePfluecker({ pflueckerId }: { pflueckerId: string | null }) {
  const [lohn, t] = await Promise.all([
    ladeLetztenLohn(pflueckerId),
    getTranslations("startkarte.pfluecker"),
  ]);
  if (!lohn) return null;

  const format = await getFormatter();
  const bis = format.dateTime(new Date(`${lohn.periodeEnde}T00:00:00Z`), {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  return (
    <Startkarte
      label={t("label")}
      wert={`${format.number(Math.round(lohn.gesamtTenge))} ₸`}
      // Ausgezahlt ist erledigt, alles davor steht noch aus. Das Wort steht daneben, die
      // Farbe traegt die Aussage nicht allein.
      ton={lohn.status === "ausgezahlt" ? "gut" : "neutral"}
      kontext={t("kontext", { bis, status: t(`status.${lohn.status}`) })}
      href="/dashboard/buero/lohn"
      ziel={t("weiter")}
    />
  );
}
