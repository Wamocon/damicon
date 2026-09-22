"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { ceoBerichtAktualisieren } from "@/lib/actions/compliance-ceo";

// Erzwingt einen sofortigen, vollen Lauf (ueberspringt die Aenderungserkennung,
// siehe lib/pruefung/ceo-auto.ts) - anders als der stille Login-Ausloeser
// wartet hier jemand aktiv auf ein Ergebnis, revalidatePath() in der Server
// Action zeigt den neuen Bericht danach ohne weiteres Zutun dieser Komponente.
export function CeoAktualisierenKnopf() {
  const t = useTranslations("ceoUebersicht");
  const [isPending, startTransition] = useTransition();
  const [fehler, setFehler] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {fehler ? <TriangleAlert className="h-3.5 w-3.5 text-destructive" aria-hidden /> : null}
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setFehler(false);
            const ergebnis = await ceoBerichtAktualisieren();
            if (ergebnis.status === "fehler") setFehler(true);
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition hover:border-primary disabled:cursor-wait disabled:opacity-70"
      >
        <RefreshCw className={isPending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden />
        {isPending ? t("aktualisiertGerade") : t("aktualisieren")}
      </button>
    </div>
  );
}
