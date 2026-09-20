import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonCard } from "@/components/ui/kit";

// Ladezustand der Bereichsseite. Gleicher Grund wie eine Ebene tiefer: das
// dashboard/loading.tsx greift nur beim Eintritt ins Dashboard, nicht beim
// Wechsel darunter.
//
// Der Aufbau folgt ZonePageBody (Brotkrumen, Titel, Beschreibung, danach die
// Modulkacheln in zwei Spalten).
export default async function BereichLaedt() {
  const t = await getTranslations("dashboard");
  return (
    <div className="space-y-8" aria-busy="true">
      <header className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-3 bg-muted/60" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="mt-2 h-8 w-40" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl bg-muted/70" />
        <Skeleton className="mt-1.5 h-4 w-2/3 max-w-xl bg-muted/70" />
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonCard key={i} className="h-40 rounded-2xl" />
        ))}
      </div>

      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
