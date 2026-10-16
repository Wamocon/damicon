"use client";

import { useTranslations } from "next-intl";
import { betriebAnnahmenSetzen } from "@/lib/actions/wirtschaftlichkeit";
import { AktionsMeldung, Feld, PfadFeld, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";
import { HerkunftAuswahl, eingabeZahl } from "@/components/db/wirtschaftlichkeit-formulare";
import type { BetriebsAnnahmen } from "@/lib/domain/betriebsrechnung";

// Die Bedienung der Planung des Betriebs (Entscheidung vom 16.10.2026). Die Prüfung der Eingaben macht die Server Action (und die Datenbank ein zweites Mal);
// das Formular verlangt nichts als Pflicht: leere Felder bleiben "nicht gesetzt", und die Seite zeigt dann "offen".

/** Die Planung des Betriebs: Werte des ersten Jahres, jährliche Entwicklung, Abschreibung. Jede Gruppe trägt ihre Herkunft (belegt oder geschätzt). */
export function BetriebAnnahmenFormular({ betrieb }: { betrieb: BetriebsAnnahmen }) {
  const t = useTranslations("betriebsrechnung.annahmen.form");
  const te = useTranslations("wirtschaftlichkeitErfassung");
  const { status, formProps } = useBehalteEingaben(betriebAnnahmenSetzen, "immer");
  const herkunft = (schluessel: keyof BetriebsAnnahmen["herkunft"]) => betrieb.herkunft[schluessel] ?? "geschaetzt";
  const prozent = (anteil: number | null) => eingabeZahl(anteil === null ? null : anteil * 100);
  return (
    <form {...formProps} className="grid gap-2 p-4 sm:grid-cols-2">
      <PfadFeld />
      <Feld label={t("menge")} name="menge" inputMode="decimal" defaultValue={eingabeZahl(betrieb.mengeKg, 2)} hinweis={t("mengeHinweis")} />
      <HerkunftAuswahl name="herkunft_menge" label={t("herkunft")} defaultValue={herkunft("menge")} />
      <Feld label={t("preis")} name="preis" inputMode="decimal" defaultValue={eingabeZahl(betrieb.preisTengeKg, 2)} />
      <HerkunftAuswahl name="herkunft_preis" label={t("herkunft")} defaultValue={herkunft("preis")} />
      <Feld label={t("kosten")} name="kosten" inputMode="decimal" defaultValue={eingabeZahl(betrieb.variableKostenTengeKg, 2)} />
      <HerkunftAuswahl name="herkunft_kosten" label={t("herkunft")} defaultValue={herkunft("kosten")} />
      <Feld label={t("mengeProzent")} name="menge_prozent" inputMode="decimal" defaultValue={prozent(betrieb.mengeEntwicklung)} hinweis={t("entwicklungHinweis")} />
      <Feld label={t("preisProzent")} name="preis_prozent" inputMode="decimal" defaultValue={prozent(betrieb.preisEntwicklung)} />
      <Feld label={t("kostenProzent")} name="kosten_prozent" inputMode="decimal" defaultValue={prozent(betrieb.kostenEntwicklung)} />
      <Feld label={t("fixkostenProzent")} name="fixkosten_prozent" inputMode="decimal" defaultValue={prozent(betrieb.fixkostenEntwicklung)} />
      <HerkunftAuswahl name="herkunft_entwicklung" label={t("herkunft")} defaultValue={herkunft("entwicklung")} />
      <Feld label={t("abschreibung")} name="abschreibung" inputMode="decimal" defaultValue={eingabeZahl(betrieb.abschreibungJahre, 0)} hinweis={t("abschreibungHinweis")} />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitKnopf label={te("form.speichern")} status={status} />
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}
