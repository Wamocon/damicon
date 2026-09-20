import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonCard } from "@/components/ui/kit";

// Ladezustand der Modulseite.
//
// Das dashboard/loading.tsx eine Ebene hoeher reicht dafuer nicht: es greift
// nur beim Eintritt in das Dashboard-Segment. Wer innerhalb des Dashboards von
// Modul zu Modul wechselt, bekam bis hierher gar keine Rueckmeldung - die alte
// Seite blieb stehen, bis die Datenbank geantwortet hatte. Nachgemessen im
// Browser: beim Wechsel Standort -> Reihenbloecke erschien kein einziger
// Ladezustand.
//
// Der Aufbau folgt ModulePageBody (Brotkrumen, Titel, Beschreibung, zwei
// Abzeichen rechts), damit beim Umschalten nichts springt.
export default async function ModulLaedt() {
  const t = await getTranslations("dashboard");
  return (
    <div className="space-y-8" aria-busy="true">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-3 bg-muted/60" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-3 bg-muted/60" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="mt-2 h-8 w-2/3 max-w-md" />
          <Skeleton className="mt-3 h-4 w-full max-w-2xl bg-muted/70" />
          <Skeleton className="mt-1.5 h-4 w-1/2 max-w-md bg-muted/70" />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Skeleton className="h-6 w-36 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </header>

      <div className="space-y-4">
        <SkeletonCard className="h-44" />
        <SkeletonCard className="h-72" />
      </div>

      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
