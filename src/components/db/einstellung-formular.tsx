"use client";

import { useTranslations } from "next-intl";
import { einstellungSetzen } from "@/lib/actions/einstellungen";
import { AktionsMeldung, Feld, PfadFeld, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";

// Eine Einstellung aendern (Wert, optional ein Grund fuer den Verlauf). Ein leeres Wertfeld heisst "nicht gesetzt".
export function EinstellungFormular({ schluessel, wert, einheit }: { schluessel: string; wert: number | null; einheit: string }) {
  const t = useTranslations("einstellungen.formular");
  const { status, formProps } = useBehalteEingaben(einstellungSetzen);
  return (
    <form {...formProps} className="grid gap-2.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-end">
      <PfadFeld />
      <input type="hidden" name="schluessel" value={schluessel} />
      <Feld label={`${t("wert")} (${einheit})`} name="wert" inputMode="decimal" defaultValue={wert === null ? "" : String(wert)} hinweis={t("leerHinweis")} />
      <Feld label={t("grund")} name="grund" />
      <SubmitKnopf label={t("speichern")} status={status} />
      <div className="sm:col-span-3">
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}
