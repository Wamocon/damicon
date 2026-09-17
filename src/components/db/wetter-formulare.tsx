"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { wetterAktualisieren } from "@/lib/actions/wetter";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, FormularKarte, PfadFeld, SubmitKnopf } from "@/components/db/formular-kit";

// Formular des Wetter-Moduls (Anforderung 2.13): ein einziger Knopf, kein
// Formularfeld - die Aktion holt Koordinaten und Saisonstart selbst aus
// domain/wetter.ts. Kein Cron im Projekt (siehe Masterplan-Audit), deshalb
// manueller Anstoss statt eines taeglichen Hintergrundjobs.
export function WetterAktualisierenFormular() {
  const [status, action] = useActionState(wetterAktualisieren, leer);
  const t = useTranslations("wetterAnsicht.formular");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="flex flex-wrap items-end gap-2.5">
        <PfadFeld />
        <SubmitKnopf label={t("knopf")} />
        <div className="w-full">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}
