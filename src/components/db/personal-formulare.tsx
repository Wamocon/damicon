"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { rotationsplanBrigadeZuweisen } from "@/lib/actions/rotationsplan";
import { pfleuckerBrigadeZuweisen } from "@/lib/actions/personal";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, Auswahl, PfadFeld, SubmitKnopf } from "@/components/db/formular-kit";
import type { BrigadeOption } from "@/lib/domain/personal";

// Formulare der Brigadenplanung (Anforderung 2.11): einen offenen
// Rotationsplan-Termin (Bedarfsrechnung) oder einen Reserve-Pflücker einer
// Brigade zuweisen - dieselbe kompakte Inline-Auswahl an beiden Stellen.

export function TerminBrigadeZuweisenFormular({ terminId, brigaden }: { terminId: string; brigaden: BrigadeOption[] }) {
  return <BrigadeZuweisenFormular id={terminId} brigaden={brigaden} aktion={rotationsplanBrigadeZuweisen} />;
}

export function PfleuckerBrigadeZuweisenFormular({ pflueckerId, brigaden }: { pflueckerId: string; brigaden: BrigadeOption[] }) {
  return <BrigadeZuweisenFormular id={pflueckerId} brigaden={brigaden} aktion={pfleuckerBrigadeZuweisen} />;
}

function BrigadeZuweisenFormular({
  id,
  brigaden,
  aktion,
}: {
  id: string;
  brigaden: BrigadeOption[];
  aktion: typeof rotationsplanBrigadeZuweisen;
}) {
  const [status, action] = useActionState(aktion, leer);
  const t = useTranslations("personalAnsicht");

  return (
    <form action={action} className="mt-1.5 flex flex-wrap items-end gap-1.5">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <Auswahl
        label={t("brigade")}
        name="brigade_id"
        required
        options={[
          { wert: "", text: t("bitteWaehlen") },
          ...brigaden.map((b) => ({ wert: b.id, text: b.name })),
        ]}
      />
      <SubmitKnopf label={t("zuweisen")} status={status} />
      <AktionsMeldung status={status} />
    </form>
  );
}
