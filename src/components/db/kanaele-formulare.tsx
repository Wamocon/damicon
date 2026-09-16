"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { kanalAktualisieren, kanalAnlegen, kanalLoeschen } from "@/lib/actions/kanaele";
import { kontaktkanalTypen, type KontaktkanalZeile } from "@/lib/domain/kanaele";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";

// Verwaltung der Kontaktkanaele (Anforderung 5.6): ein Formular je Kanal fuer
// Bezeichnung/Wert/aktiv, ein Anlegen-Formular fuer einen neuen Kanal.

export function KanalBearbeitenFormular({ kanal }: { kanal: KontaktkanalZeile }) {
  const [status, action] = useActionState(kanalAktualisieren, leer);
  const [loeschStatus, loeschAction] = useActionState(kanalLoeschen, leer);
  const t = useTranslations("kanaeleAnsicht");

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <form action={action} className="space-y-2.5">
        <PfadFeld />
        <input type="hidden" name="id" value={kanal.id} />
        <Feld label={t("col.bezeichnung")} name="bezeichnung" defaultValue={kanal.bezeichnung} required />
        <Feld label={t("col.wert")} name="wert" defaultValue={kanal.wert ?? ""} placeholder={t("wertPlatzhalter")} />
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-card-foreground">
          <input type="checkbox" name="aktiv" defaultChecked={kanal.aktiv} />
          {t("aktivLabel")}
        </label>
        <div className="flex items-center gap-2">
          <SubmitKnopf label={t("speichern")} variante="leise" />
        </div>
        <AktionsMeldung status={status} />
      </form>
      <form action={loeschAction} className="mt-2">
        <PfadFeld />
        <input type="hidden" name="id" value={kanal.id} />
        <button
          type="submit"
          className="text-[11px] font-semibold text-destructive hover:underline"
        >
          {t("loeschen")}
        </button>
        <AktionsMeldung status={loeschStatus} />
      </form>
    </div>
  );
}

export function KanalAnlegenFormular() {
  const [status, action] = useActionState(kanalAnlegen, leer);
  const t = useTranslations("kanaeleAnsicht");

  return (
    <FormularKarte titel={t("anlegenTitel")} beschreibung={t("anlegenLead")}>
      <form action={action} className="flex flex-wrap items-end gap-2.5">
        <PfadFeld />
        <div className="w-40">
          <Auswahl
            label={t("col.typ")}
            name="typ"
            required
            options={kontaktkanalTypen.map((typ) => ({ wert: typ, text: t(`typ.${typ}`) }))}
          />
        </div>
        <div className="w-48">
          <Feld label={t("col.bezeichnung")} name="bezeichnung" required />
        </div>
        <div className="w-56">
          <Feld label={t("col.wert")} name="wert" placeholder={t("wertPlatzhalter")} />
        </div>
        <SubmitKnopf label={t("anlegenKnopf")} />
        <div className="w-full">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}
