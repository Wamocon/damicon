"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { dokumentAnlegen } from "@/lib/actions/dokumente";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  SubmitKnopf,
} from "@/components/db/formular-kit";

const kategorien = [
  "spritzmittelprotokoll",
  "esutd_nachweis",
  "liefervertrag",
  "foerderdossier",
  "zertifikat",
  "sonstiges",
] as const;

const statusWerte = ["gueltig", "prueflauf", "abgelaufen"] as const;

export function DokumentFormular() {
  const [status, action] = useActionState(dokumentAnlegen, leer);
  const pfad = usePathname();
  const t = useTranslations("dokumenteVerwaltung");
  const k = useTranslations("dokumentKategorie");
  const s = useTranslations("dokumenteDemo.status");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="pfad" value={pfad} />
        <Feld
          label={t("feld.name")}
          name="name"
          required
          placeholder={t("beispiel.name")}
        />
        <Auswahl
          label={t("feld.kategorie")}
          name="kategorie"
          options={kategorien.map((wert) => ({ wert, text: k(wert) }))}
        />
        <Feld label={t("feld.bezug")} name="bezug" placeholder="T-N-A-04" />
        <Feld label={t("feld.stand")} name="stand" type="date" />
        <Auswahl
          label={t("feld.status")}
          name="status"
          options={statusWerte.map((wert) => ({ wert, text: s(wert) }))}
        />
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-card-foreground">
            {t("feld.datei")}
          </span>
          <input
            type="file"
            name="datei"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
        </label>
        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-3">
          <SubmitKnopf label={t("knopf")} />
          <span className="text-[11px] text-muted-foreground">{t("dateiHinweis")}</span>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}
