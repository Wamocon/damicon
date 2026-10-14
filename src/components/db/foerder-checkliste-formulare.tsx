"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  checklisteVorschlagUebernehmen,
  checkpunktAnlegen,
  checkpunktEntfernen,
  checkpunktUmschalten,
} from "@/lib/actions/foerder-checkliste";
import { leer, type AktionsStatus } from "@/lib/actions/status";
import { AktionsMeldung, Feld, PfadFeld, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";

// Die Bedienung der Checkliste eines Foerderdossiers (WMCNL-1448): Punkte abhaken, eigene Punkte
// anlegen, entfernen, den allgemeinen Vorschlag uebernehmen. Jede Aktion ist ein kleines Formular
// mit eigener Rueckmeldung; Erfolg zeigt schon die neu gezeichnete Liste, deshalb meldet sich eine
// Aktion nur, wenn sie misslingt.

type Aktion = (status: AktionsStatus, formData: FormData) => Promise<AktionsStatus>;

function MiniAktion({
  aktion,
  felder,
  label,
  warnend = false,
}: {
  aktion: Aktion;
  felder: Record<string, string>;
  label: string;
  warnend?: boolean;
}) {
  const [status, action] = useActionState(aktion, leer);
  return (
    <form action={action} className="inline-flex flex-col items-start gap-1">
      <PfadFeld />
      {Object.entries(felder).map(([name, wert]) => (
        <input key={name} type="hidden" name={name} value={wert} />
      ))}
      <button
        type="submit"
        className={`rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold text-foreground transition ${
          warnend ? "hover:border-destructive hover:text-destructive" : "hover:border-primary hover:text-primary"
        }`}
      >
        {label}
      </button>
      {status.stand === "fehler" ? <AktionsMeldung status={status} /> : null}
    </form>
  );
}

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
