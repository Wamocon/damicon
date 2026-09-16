"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { dossierAktualisieren, dossierAnlegen } from "@/lib/actions/foerdermittel";
import { foerderdossierStatus, type FoerderdossierZeile } from "@/lib/domain/foerdermittel";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";

// Formulare des Foerdermitteldossiers (Anforderung 4.12). Wie bei
// finanzen-formulare.tsx: "Anlegen" fuer ein neues Dossier, "Aktualisieren"
// verweist per Auswahl auf ein bestehendes statt eines Inline-Formulars je
// Tabellenzeile.

export function DossierAnlegenFormular() {
  const [status, action] = useActionState(dossierAnlegen, leer);
  const t = useTranslations("foerdermittelAnsicht.formular.anlegen");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <PfadFeld />
        <Feld label={t("portal")} name="portal" required placeholder="gosagro.kz" />
        <Feld label={t("dossierTitel")} name="titel" required />
        <Feld label={t("antragsnummer")} name="antragsnummer" />
        <Feld label={t("fristAm")} name="frist_am" type="date" />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-5">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

export function DossierAktualisierenFormular({ dossiers }: { dossiers: FoerderdossierZeile[] }) {
  const [status, action] = useActionState(dossierAktualisieren, leer);
  const t = useTranslations("foerdermittelAnsicht.formular.aktualisieren");
  const statusT = useTranslations("foerdermittelAnsicht.status");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <PfadFeld />
        <Auswahl
          label={t("dossier")}
          name="id"
          required
          options={[
            { wert: "", text: t("bitteWaehlen") },
            ...dossiers.map((d) => ({ wert: d.id, text: `${d.titel} (${d.antragsnummer ?? d.portal})` })),
          ]}
        />
        <Auswahl
          label={t("status")}
          name="status"
          required
          options={foerderdossierStatus.map((wert) => ({ wert, text: statusT(wert) }))}
        />
        <Feld label={t("eingereichtAm")} name="eingereicht_am" type="date" />
        <Feld label={t("fristAm")} name="frist_am" type="date" />
        <Feld label={t("notizen")} name="notizen" />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-5">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}
