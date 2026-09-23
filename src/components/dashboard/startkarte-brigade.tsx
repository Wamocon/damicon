import { getTranslations } from "next-intl/server";
import { Startkarte } from "@/components/dashboard/startkarte";
import { ladeOffenePflueckaufgaben } from "@/lib/data/startkarte";

// Rechte Haelfte der Begruessungskarte fuer die Rolle brigade: wie viele Pflueckaufgaben
// noch offen oder angenommen sind. Das ist die Zahl, mit der eine Brigade den Tag beginnt.
export async function StartkarteBrigade() {
  const [anzahl, t] = await Promise.all([
    ladeOffenePflueckaufgaben(),
    getTranslations("startkarte.brigade"),
  ]);
  if (anzahl === null) return null;

  return (
    <Startkarte
      label={t("label")}
      wert={String(anzahl)}
      // Null offene Aufgaben ist ein guter Zustand, nicht ein leerer.
      ton={anzahl === 0 ? "gut" : "neutral"}
      kontext={anzahl === 0 ? t("keine") : t("kontext")}
      href="/dashboard/feld/pflueckaufgaben"
      ziel={t("weiter")}
    />
  );
}
