"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { teilnahmeErfassen } from "@/lib/actions/pflichtschulungen";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, PfadFeld } from "@/components/db/formular-kit";

// Anforderung 4.10: ein Klick je Zeile der Fristueberwachungstabelle. Ohne
// profilId ist es die eigene Selbstauskunft, mit profilId erfasst das Buero
// fuer eine andere Person (siehe teilnahmeErfassen() und die zugehoerige RLS-
// Policy schulungsteilnahmen_insert_own). Dieselbe kompakte Interaktion wie
// SchrittAbhakenKnopf aus Anforderung 2.12.
export function TeilnahmeErfassenKnopf({
  schulungsvideoId,
  profilId,
}: {
  schulungsvideoId: string;
  /** Nur gesetzt, wenn fuer eine fremde Person erfasst wird. */
  profilId?: string;
}) {
  const [status, action] = useActionState(teilnahmeErfassen, leer);
  const t = useTranslations("pflichtschulungenAnsicht");

  return (
    <form action={action} className="mt-1">
      <PfadFeld />
      <input type="hidden" name="schulungsvideo_id" value={schulungsvideoId} />
      {profilId ? <input type="hidden" name="profil_id" value={profilId} /> : null}
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:border-success hover:text-success"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t("nachweisen")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}
