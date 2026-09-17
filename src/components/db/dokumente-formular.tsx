"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { dokumentAendern, dokumentAnlegen } from "@/lib/actions/dokumente";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  PfadFeld,
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

export function DokumentFormular({
  dossiers = [],
}: {
  /** Foerderdossiers zur Auswahl (Anforderung 4.12). Leer im Demo-Modus. */
  dossiers?: { id: string; bezeichnung: string }[];
}) {
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
        {dossiers.length > 0 ? (
          <Auswahl
            label={t("feld.foerderdossier")}
            name="foerderdossier_id"
            options={[
              { wert: "", text: t("keinDossier") },
              ...dossiers.map((d) => ({ wert: d.id, text: d.bezeichnung })),
            ]}
          />
        ) : null}
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

// Zeilenformular: Bezeichnung, Bezug, Stand und Status eines vorhandenen
// Dokuments nachfuehren. Aufbau wie ZukaufPreisNachtragenFormular - schmal
// genug fuer eine Tabellenzelle, mit eigener Rueckmeldung je Zeile.
export function DokumentAendernFormular({
  id,
  name,
  bezug,
  stand,
  status,
}: {
  id: string;
  name: string;
  bezug: string | null;
  stand: string | null;
  status: string;
}) {
  const [zustand, action] = useActionState(dokumentAendern, leer);
  const t = useTranslations("dokumenteVerwaltung");
  const s = useTranslations("dokumenteDemo.status");

  return (
    <form action={action} className="flex flex-wrap items-end gap-1.5">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <input
        name="name"
        defaultValue={name}
        required
        aria-label={t("feld.name")}
        className="h-7 w-36 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground outline-none transition focus:border-primary"
      />
      <input
        name="bezug"
        defaultValue={bezug ?? ""}
        aria-label={t("feld.bezug")}
        className="h-7 w-24 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground outline-none transition focus:border-primary"
      />
      <input
        name="stand"
        type="date"
        defaultValue={stand ?? ""}
        aria-label={t("feld.stand")}
        className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground outline-none transition focus:border-primary"
      />
      <select
        name="status"
        defaultValue={status}
        aria-label={t("feld.status")}
        className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground outline-none transition focus:border-primary"
      >
        {statusWerte.map((wert) => (
          <option key={wert} value={wert}>
            {s(wert)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-card px-2 text-[11px] font-bold text-foreground transition hover:border-primary"
      >
        {t("aendernKnopf")}
      </button>
      <AktionsMeldung status={zustand} />
    </form>
  );
}
