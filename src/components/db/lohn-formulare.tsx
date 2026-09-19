"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  lohnMonatAbzuegeBerechnen,
  lohnPeriodeBerechnen,
  lohnSatzAnlegen,
  lohnStatusSetzen,
} from "@/lib/actions/lohn";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Feld,
  FormularKarte,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";
import type { LohnStatus } from "@/lib/domain/lohn";

// Formulare der Lohnabrechnung mit Qualitaetsfaktor (WMCNL-1444): Lohnsatz
// anlegen, Periode berechnen, Status setzen (Freigeben/Auszahlen).

// Neuer Lohnsatz. Ein vorheriger, noch offener Satz wird von der Datenbank
// automatisch zum neuen Gueltigkeitsbeginn geschlossen - kein Feld dafuer noetig.
export function LohnSatzAnlegenFormular() {
  const [status, action] = useActionState(lohnSatzAnlegen, leer);
  const t = useTranslations("lohnAnsicht.formular.satz");
  const heute = new Date().toISOString().slice(0, 10);

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PfadFeld />
        <Feld label={t("gueltigAb")} name="gueltig_ab" type="date" defaultValue={heute} required />
        <Feld label={t("stundenlohn")} name="stundenlohn_tenge" inputMode="decimal" required />
        <Feld label={t("kgSatz")} name="kg_satz_tenge" inputMode="decimal" required />
        <Feld
          label={t("ziel")}
          name="qualitaets_ziel_ausschussquote"
          inputMode="decimal"
          defaultValue="5"
        />
        <Feld label={t("min")} name="qualitaetsfaktor_min" inputMode="decimal" defaultValue="0.90" />
        <Feld label={t("max")} name="qualitaetsfaktor_max" inputMode="decimal" defaultValue="1.10" />
        <Feld label={t("notiz")} name="notiz" />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

// Periode berechnen: loest public.lohn_periode_berechnen() aus. Bereits
// freigegebene/ausgezahlte Abrechnungen der gewaehlten Periode bleiben
// unangetastet (siehe Erfolgsmeldung und Hinweistext im Formular).
export function LohnPeriodeBerechnenFormular() {
  const [status, action] = useActionState(lohnPeriodeBerechnen, leer);
  const t = useTranslations("lohnAnsicht.formular.berechnen");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PfadFeld />
        <Feld label={t("periodeStart")} name="periode_start" type="date" required />
        <Feld label={t("periodeEnde")} name="periode_ende" type="date" required />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

// Gesetzliche Monatsabzuege berechnen (Migration 20261024000000): loest
// public.lohn_monat_abzuege_berechnen() aus. Jahr/Monat statt eines
// Datumsbereichs wie beim Lohnsatz oben - ОПВ/ВОСМС/ИПН sind gesetzlich
// Monatsgroessen, siehe Migrationskopf.
export function LohnMonatAbzuegeBerechnenFormular() {
  const [status, action] = useActionState(lohnMonatAbzuegeBerechnen, leer);
  const t = useTranslations("lohnAnsicht.formular.abzuegeBerechnen");
  const heute = new Date();

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PfadFeld />
        <Feld
          label={t("jahr")}
          name="jahr"
          inputMode="decimal"
          defaultValue={String(heute.getFullYear())}
          required
        />
        <Feld
          label={t("monat")}
          name="monat"
          inputMode="decimal"
          defaultValue={String(heute.getMonth() + 1)}
          required
        />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

// Statuswechsel einer einzelnen Abrechnung (entwurf -> freigegeben ->
// ausgezahlt). Bewusst ein eigenes kleines Formular je Zeile, analog
// ReklamationInPruefungFormular - kein Mehrfachauswahl-Mechanismus, jede
// Freigabe ist ein bewusster Einzelschritt.
export function LohnStatusFormular({
  id,
  ziel,
  label,
}: {
  id: string;
  ziel: Extract<LohnStatus, "freigegeben" | "ausgezahlt">;
  label: string;
}) {
  const [status, action] = useActionState(lohnStatusSetzen, leer);

  return (
    <form action={action} className="space-y-1">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={ziel} />
      <button
        type="submit"
        className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-card px-2 text-[11px] font-bold text-foreground transition hover:border-primary"
      >
        {label}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}
