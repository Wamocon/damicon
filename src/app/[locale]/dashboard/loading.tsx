import { getTranslations } from "next-intl/server";

// Ladezustand des Dashboards. Ohne ihn bleibt beim Wechsel zwischen Modulen
// die alte Seite stehen, bis die Datenbank geantwortet hat - in einer
// Vorfuehrung sieht das aus, als reagiere die Anwendung nicht.
export default async function DashboardLaedt() {
  const t = await getTranslations("dashboard");
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-3">
        <div className="h-3 w-24 animate-pulse motion-reduce:animate-none rounded bg-muted" />
        <div className="h-8 w-2/3 max-w-md animate-pulse motion-reduce:animate-none rounded bg-muted" />
        <div className="h-4 w-full max-w-2xl animate-pulse motion-reduce:animate-none rounded bg-muted/70" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse motion-reduce:animate-none rounded-xl border border-border bg-card"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse motion-reduce:animate-none rounded-xl border border-border bg-card" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
