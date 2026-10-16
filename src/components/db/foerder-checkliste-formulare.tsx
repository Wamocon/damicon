"use client";

import { useTranslations } from "next-intl";
import {
  checklisteVorschlagUebernehmen,
  checkpunktAnlegen,
  checkpunktEntfernen,
  checkpunktUmschalten,
} from "@/lib/actions/foerder-checkliste";
import { AktionsMeldung, Feld, MiniAktion, PfadFeld, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";

// Die Bedienung der Checkliste eines Foerderdossiers (WMCNL-1448): Punkte abhaken, eigene Punkte
// anlegen, entfernen, den allgemeinen Vorschlag uebernehmen. Die kleinen Aktionen sind MiniAktion aus
// dem Formular-Kit.

export function CheckpunktUmschaltenKnopf({ id, erledigt }: { id: string; erledigt: boolean }) {
  const t = useTranslations("foerdermittelCheckliste");
  return <MiniAktion aktion={checkpunktUmschalten} felder={{ id, erledigen: erledigt ? "nein" : "ja" }} label={erledigt ? t("oeffnen") : t("erledigen")} />;
}

export function CheckpunktEntfernenKnopf({ id }: { id: string }) {
  const t = useTranslations("foerdermittelCheckliste");
  return <MiniAktion aktion={checkpunktEntfernen} felder={{ id }} label={t("entfernen")} warnend />;
}

export function VorschlagUebernehmenKnopf({ dossierId }: { dossierId: string }) {
  const t = useTranslations("foerdermittelCheckliste");
  return <MiniAktion aktion={checklisteVorschlagUebernehmen} felder={{ dossier_id: dossierId }} label={t("vorschlagUebernehmen")} />;
}

export function CheckpunktAnlegenFormular({ dossierId }: { dossierId: string }) {
  const t = useTranslations("foerdermittelCheckliste");
  const { status, formProps } = useBehalteEingaben(checkpunktAnlegen);
  return (
    <form {...formProps} className="grid gap-2 sm:grid-cols-2">
      <PfadFeld />
      <input type="hidden" name="dossier_id" value={dossierId} />
      <Feld label={t("feld.bezeichnung")} name="bezeichnung" required placeholder={t("beispiel")} />
      <Feld label={t("feld.frist")} name="frist_am" type="date" />
      <label className="flex items-center gap-2 schrift-label font-semibold text-card-foreground">
        <input type="checkbox" name="pflicht" defaultChecked className="h-3.5 w-3.5" />
        {t("feld.pflicht")}
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitKnopf label={t("hinzufuegen")} status={status} />
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}
