"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { rotationsplanBrigadeZuweisen } from "@/lib/actions/rotationsplan";
import { pfleuckerBrigadeZuweisen } from "@/lib/actions/personal";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, Auswahl, SubmitKnopf } from "@/components/db/formular-kit";
import type { BrigadeOption } from "@/lib/domain/personal";

// Formulare der Brigadenplanung (Anforderung 2.11): einen offenen
// Rotationsplan-Termin (Bedarfsrechnung) oder einen Reserve-Pflücker einer
// Brigade zuweisen - dieselbe kompakte Inline-Auswahl an beiden Stellen.

function PfadFeld() {
  const pfad = usePathname();
  return <input type="hidden" name="pfad" value={pfad} />;
}

export function TerminBrigadeZuweisenFormular({
  terminId,
  brigaden,
}: {
  terminId: string;
  brigaden: BrigadeOption[];
}) {
  const [status, action] = useActionState(rotationsplanBrigadeZuweisen, leer);
  const t = useTranslations("personalAnsicht");

  return (
    <form action={action} className="mt-1.5 flex flex-wrap items-end gap-1.5">
      <PfadFeld />
      <input type="hidden" name="id" value={terminId} />
      <Auswahl
        label={t("brigade")}
        name="brigade_id"
        required
        options={[
          { wert: "", text: t("bitteWaehlen") },
          ...brigaden.map((b) => ({ wert: b.id, text: b.name })),
        ]}
      />
      <SubmitKnopf label={t("zuweisen")} />
      <AktionsMeldung status={status} />
    </form>
  );
}

export function PfleuckerBrigadeZuweisenFormular({
  pflueckerId,
  brigaden,
}: {
  pflueckerId: string;
  brigaden: BrigadeOption[];
}) {
  const [status, action] = useActionState(pfleuckerBrigadeZuweisen, leer);
  const t = useTranslations("personalAnsicht");

  return (
    <form action={action} className="mt-1.5 flex flex-wrap items-end gap-1.5">
      <PfadFeld />
      <input type="hidden" name="id" value={pflueckerId} />
      <Auswahl
        label={t("brigade")}
        name="brigade_id"
        required
        options={[
          { wert: "", text: t("bitteWaehlen") },
          ...brigaden.map((b) => ({ wert: b.id, text: b.name })),
        ]}
      />
      <SubmitKnopf label={t("zuweisen")} />
      <AktionsMeldung status={status} />
    </form>
  );
}
