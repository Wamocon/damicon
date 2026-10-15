"use client";

import { useTranslations } from "next-intl";
import { risikoParameterSetzen } from "@/lib/actions/einstellungen";
import { AktionsMeldung, Feld, PfadFeld, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";

// Einen Parameter der Block-Risiko-Bewertung aendern (Wert, optional ein Grund fuer den Verlauf). Ein Parameter hat immer einen Wert.
export function RisikoParameterFormular({ schluessel, wert, einheit }: { schluessel: string; wert: number; einheit: string }) {
  const t = useTranslations("einstellungen.formular");
  const { status, formProps } = useBehalteEingaben(risikoParameterSetzen);
  return (
    <form {...formProps} className="grid gap-2.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-end">
      <PfadFeld />
      <input type="hidden" name="schluessel" value={schluessel} />
      <Feld label={`${t("wert")} (${einheit})`} name="wert" inputMode="decimal" required defaultValue={String(wert)} />
      <Feld label={t("grund")} name="grund" />
      <SubmitKnopf label={t("speichern")} status={status} />
      <div className="sm:col-span-3">
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}
