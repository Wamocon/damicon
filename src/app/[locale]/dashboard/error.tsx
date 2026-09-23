"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/kit";

// Fehlergrenze fuer das gesamte Dashboard. Wichtiger als die Optik ist die
// Aussage: hier ist etwas ausgefallen. Ohne diese Grenze zeigt Next.js im
// Produktionsbetrieb eine leere Seite - und niemand weiss, ob die Daten fehlen
// oder der Betrieb wirklich nichts geerntet hat.
export default function DashboardFehler({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("fehlerseite");

  useEffect(() => {
    console.error("[damicon] Dashboard-Fehler:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-destructive/25 bg-destructive/[0.06] p-8 text-center">
      <AlertTriangle className="mx-auto h-7 w-7 text-destructive" />
      <h1 className="mt-3 text-lg font-black text-foreground">{t("titel")}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("lead")}</p>
      {error.digest ? (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">
          {t("kennung")}: {error.digest}
        </p>
      ) : null}
      <Button type="button" onClick={reset} groesse="mittel" className="mt-5">
        <RotateCcw className="h-4 w-4" />
        {t("erneut")}
      </Button>
    </div>
  );
}
