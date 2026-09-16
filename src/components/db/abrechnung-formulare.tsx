"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { spanneAktualisieren } from "@/lib/actions/abrechnung";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, Feld, PfadFeld, SubmitKnopf } from "@/components/db/formular-kit";

// Anforderung 6.4: die einzige Einstellung dieses Bausteins - eine globale
// Prozent-Spanne fuer die Abrechnung gegenueber Lieferbetrieben.
export function SpanneFormular({ spanneProzent }: { spanneProzent: number }) {
  const [status, action] = useActionState(spanneAktualisieren, leer);
  const t = useTranslations("abrechnungAnsicht.formular");

  return (
    <form action={action} className="flex flex-wrap items-end gap-2.5">
      <PfadFeld />
      <div className="w-32">
        <Feld
          label={t("spanne")}
          name="spanne_prozent"
          inputMode="decimal"
          defaultValue={String(spanneProzent)}
          required
        />
      </div>
      <SubmitKnopf label={t("knopf")} variante="leise" />
      <div className="w-full">
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}
