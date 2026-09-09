"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { schrittAbhaken } from "@/lib/actions/einarbeitung";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung } from "@/components/db/formular-kit";

function PfadFeld() {
  const pfad = usePathname();
  return <input type="hidden" name="pfad" value={pfad} />;
}

// Anforderung 2.12: ein Klick je Schritt, kein Formular mit mehreren Feldern -
// dieselbe kompakte Interaktion wie SteigeKontrollierenKnopf (Anforderung 2.10).
export function SchrittAbhakenKnopf({ schrittId }: { schrittId: string }) {
  const [status, action] = useActionState(schrittAbhaken, leer);
  const t = useTranslations("einarbeitungAnsicht");

  return (
    <form action={action} className="mt-2">
      <PfadFeld />
      <input type="hidden" name="schritt_id" value={schrittId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:border-success hover:text-success"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t("abhaken")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}
