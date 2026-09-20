import { getTranslations } from "next-intl/server";

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
            <div className="h-3 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-3 w-3 animate-pulse rounded bg-muted/60 motion-reduce:animate-none" />
            <div className="h-3 w-12 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-3 w-3 animate-pulse rounded bg-muted/60 motion-reduce:animate-none" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
          <div className="mt-2 h-8 w-2/3 max-w-md animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
          <div className="mt-1.5 h-4 w-1/2 max-w-md animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="h-6 w-36 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          <div className="h-6 w-24 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        </div>
      </header>

      <div className="space-y-4">
        <div className="h-44 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none" />
        <div className="h-72 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none" />
      </div>

      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
