"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  rotationsplanGenerieren,
  rotationsplanReaktivieren,
  rotationsplanUeberspringen,
} from "@/lib/actions/rotationsplan";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Feld,
  FormularKarte,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";

// Formulare des Rotationsplans (Anforderung 2.2, P1): Plan erzeugen/erweitern,
// einzelnen Termin ueberspringen oder reaktivieren.

export function RotationsplanGenerierenFormular() {
  const [status, action] = useActionState(rotationsplanGenerieren, leer);
  const t = useTranslations("rotationsplanAnsicht.formular.generieren");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="flex flex-wrap items-end gap-2.5">
        <PfadFeld />
        <div className="w-28">
          <Feld label={t("wochen")} name="wochen" inputMode="decimal" defaultValue="4" required />
        </div>
        <SubmitKnopf label={t("knopf")} />
        <div className="w-full">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

export function RotationsplanUeberspringenFormular({ id }: { id: string }) {
  const [status, action] = useActionState(rotationsplanUeberspringen, leer);
  const t = useTranslations("rotationsplanAnsicht");

  return (
    <form action={action} className="space-y-1">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-card px-2 text-[11px] font-bold text-foreground transition hover:border-primary"
      >
        {t("ueberspringenKnopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

export function RotationsplanReaktivierenFormular({ id }: { id: string }) {
  const [status, action] = useActionState(rotationsplanReaktivieren, leer);
  const t = useTranslations("rotationsplanAnsicht");

  return (
    <form action={action} className="space-y-1">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-card px-2 text-[11px] font-bold text-foreground transition hover:border-primary"
      >
        {t("reaktivierenKnopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}
