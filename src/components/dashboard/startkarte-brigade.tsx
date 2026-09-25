import { getTranslations } from "next-intl/server";
import { Startkarte } from "@/components/dashboard/startkarte";
import { getSessionProfile } from "@/lib/auth";
import { ladeOffenePflueckaufgaben } from "@/lib/data/startkarte";

// Rechte Haelfte der Begruessungskarte fuer die Rolle brigade: wie viele
// Pflueckaufgaben der eigenen Brigade und ohne Zuordnung noch nicht
// abgeschlossen sind. Das ist die Zahl, mit der eine Brigade den Tag beginnt -
// und der Link oeffnet genau diese Liste (Pille "Zu erledigen", Brigade mit
// ihrer Vorbelegung).
export async function StartkarteBrigade() {
  const profil = await getSessionProfile();
  const [anzahl, t] = await Promise.all([
    ladeOffenePflueckaufgaben(profil?.brigadeId ?? null),
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
      href="/dashboard/feld/pflueckaufgaben?status=zu-erledigen"
      ziel={t("weiter")}
    />
  );
}
