"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { mwstAlsRegistriertMarkieren, mwstSchwellePruefen } from "@/lib/actions/mwst";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, Feld, FormularKarte, PfadFeld, SubmitKnopf } from "@/components/db/formular-kit";

// Formulare der MwSt-Registrierung (Migration 20261025000000): Schwelle
// pruefen (RPC-Aufruf, bewusst ein Knopfdruck statt eines automatischen
// Laufs, siehe actions/mwst.ts), und den tatsaechlich vollzogenen
// Registrierungsvorgang nachtragen.

export function MwstSchwellePruefenFormular() {
  const [status, action] = useActionState(mwstSchwellePruefen, leer);
  const t = useTranslations("complianceAnsicht.mwst.formular.pruefen");

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <PfadFeld />
      <SubmitKnopf label={t("knopf")} />
      <AktionsMeldung status={status} />
    </form>
  );
}

export function MwstRegistriertMarkierenFormular() {
  const [status, action] = useActionState(mwstAlsRegistriertMarkieren, leer);
  const t = useTranslations("complianceAnsicht.mwst.formular.registrieren");
  const heute = new Date().toISOString().slice(0, 10);

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PfadFeld />
        <Feld label={t("registriertAm")} name="registriert_am" type="date" defaultValue={heute} required />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-2">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}
