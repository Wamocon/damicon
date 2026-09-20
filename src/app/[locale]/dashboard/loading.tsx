import { getTranslations } from "next-intl/server";
import { FeldLader } from "@/components/haustier/feld-lader";

// Ladezustand beim Einstieg ins Dashboard (einmal je Sitzung, nach der Anmeldung) - anders
// als beim Wechsel zwischen Modulen (dashboard/[zone]/loading.tsx u.a.), wo ein Raster aus
// Skelett-Karten die kommende Seite andeutet. Hier gibt es noch keine Seite anzudeuten,
// darum DamiAI auf dem Feldweg statt Platzhalter-Kacheln.
export default async function DashboardLaedt() {
  const t = await getTranslations("dashboard");
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-10" aria-busy="true">
      <FeldLader text={t("loading")} />
    </div>
  );
}
