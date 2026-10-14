"use client";

import { useTranslations } from "next-intl";
import { esfEntwurfErstellen, esfEntwurfVerwerfen, esfStatusSetzen } from "@/lib/actions/esf";
import { AktionsMeldung, Feld, MiniAktion, PfadFeld, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";
import { Aufklapper } from "@/components/ui/kit";

// Die Bedienung des Belegregisters (WMCNL-1440): Entwurf erstellen, neu berechnen oder verwerfen, und
// den naechsten Schritt festhalten (ausgestellt, bestaetigt, abgelehnt, Papier). Die Pflichtangaben
// pruefen Anwendung und Datenbank, das Formular verlangt sie nur als Hinweis.

export function EsfEntwurfKnopf({ lieferungId, label }: { lieferungId: string; label: string }) {
  return <MiniAktion aktion={esfEntwurfErstellen} felder={{ lieferung_id: lieferungId }} label={label} />;
}

export function EsfEntwurfVerwerfenKnopf({ belegId }: { belegId: string }) {
  const t = useTranslations("esfAnsicht.aktion");
  return <MiniAktion aktion={esfEntwurfVerwerfen} felder={{ beleg_id: belegId }} label={t("entwurfVerwerfen")} warnend />;
}

export type EsfSchritt = "ausgestellt" | "bestaetigt" | "abgelehnt" | "papier";

/** Ein Schritt mit seinen Angaben, aufklappbar: die Karte eines Belegs bleibt schmal. */
export function EsfSchrittFormular({ belegId, schritt, heute }: { belegId: string; schritt: EsfSchritt; heute: string }) {
  const t = useTranslations(`esfAnsicht.aktion.${schritt}`);
  const { status, formProps } = useBehalteEingaben(esfStatusSetzen);

  return (
    <Aufklapper titel={t("titel")}>
      <form {...formProps} className="grid gap-2 p-4 sm:grid-cols-2">
        <PfadFeld />
        <input type="hidden" name="beleg_id" value={belegId} />
        <input type="hidden" name="nach" value={schritt} />
        {schritt === "ausgestellt" ? (
          <>
            <Feld label={t("nummer")} name="esf_nummer" required />
            <Feld label={t("datum")} name="ausgestellt_am" type="date" required defaultValue={heute} />
          </>
        ) : null}
        {schritt === "bestaetigt" ? <Feld label={t("datum")} name="bestaetigt_am" type="date" required defaultValue={heute} /> : null}
        {schritt === "abgelehnt" || schritt === "papier" ? <Feld label={t("grund")} name="bemerkung" required /> : null}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <SubmitKnopf label={t("knopf")} status={status} />
          <AktionsMeldung status={status} />
        </div>
      </form>
    </Aufklapper>
  );
}
