"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { ceoBerichtAktualisieren } from "@/lib/actions/compliance-ceo";

// Erzwingt einen sofortigen, vollen Lauf (ueberspringt Aenderungserkennung und
// Abkuehlzeit, siehe lib/pruefung/ceo-auto.ts) - anders als der stille
// Login-Ausloeser wartet hier jemand aktiv auf ein Ergebnis, revalidatePath()
// in der Server Action zeigt den neuen Bericht danach ohne weiteres Zutun
// dieser Komponente.
//
// "laeuft-bereits" bekommt eine eigene Meldung: seit ceo und admin beide
// ausloesen duerfen, ist die Sperre in ceo-auto.ts betriebsweit. Ohne diesen
// Hinweis saehe ein Klick waehrend eines fremden Laufs wie ein kaputter Knopf
// aus.
type Meldung = null | "fehler" | "laeuft-bereits";

export function CeoAktualisierenKnopf() {
  const t = useTranslations("ceoUebersicht");
  const [isPending, startTransition] = useTransition();
  const [meldung, setMeldung] = useState<Meldung>(null);

  return (
    <div className="flex items-center gap-2">
      {meldung ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <TriangleAlert
            className={meldung === "fehler" ? "h-3.5 w-3.5 text-destructive" : "h-3.5 w-3.5 text-warning"}
            aria-hidden
          />
          {meldung === "laeuft-bereits" ? t("laeuftBereits") : null}
        </span>
      ) : null}
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setMeldung(null);
            const ergebnis = await ceoBerichtAktualisieren();
            if (ergebnis.status === "fehler") setMeldung("fehler");
            else if (ergebnis.status === "laeuft-bereits") setMeldung("laeuft-bereits");
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
