import { getTranslations } from "next-intl/server";

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
          <div className="h-3 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-3 w-3 animate-pulse rounded bg-muted/60 motion-reduce:animate-none" />
          <div className="h-3 w-12 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
        <div className="mt-2 h-8 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
        <div className="mt-1.5 h-4 w-2/3 max-w-xl animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-2xl border border-border bg-card motion-reduce:animate-none"
          />
        ))}
      </div>

      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
