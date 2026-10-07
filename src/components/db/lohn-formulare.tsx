"use client";

import { useActionState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  lohnAbzuegeVorschau,
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
  useBehalteEingaben,
} from "@/components/db/formular-kit";
import { leerAbzugsVorschau, type AbzugsVorschauStatus, type LohnStatus } from "@/lib/domain/lohn";
import { formularZiel } from "@/lib/formular-ziele";

// Formulare der Lohnabrechnung mit Qualitaetsfaktor (WMCNL-1444): Lohnsatz
// anlegen, Periode berechnen, Status setzen (Freigeben/Auszahlen).

// Neuer Lohnsatz. Ein vorheriger, noch offener Satz wird von der Datenbank
// automatisch zum neuen Gueltigkeitsbeginn geschlossen - kein Feld dafuer noetig.
export function LohnSatzAnlegenFormular() {
  const { status, pending, formProps } = useBehalteEingaben(lohnSatzAnlegen);
  const t = useTranslations("lohnAnsicht.formular.satz");
  const heute = new Date().toISOString().slice(0, 10);

  return (
    <FormularKarte id={formularZiel.lohnsatz} titel={t("titel")} beschreibung={t("lead")}>
      <form {...formProps} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
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
          <SubmitKnopf label={t("knopf")} status={status} pending={pending} />
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
  const { status, pending, formProps } = useBehalteEingaben(lohnPeriodeBerechnen);
  const t = useTranslations("lohnAnsicht.formular.berechnen");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form {...formProps} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PfadFeld />
        <Feld label={t("periodeStart")} name="periode_start" type="date" required />
        <Feld label={t("periodeEnde")} name="periode_ende" type="date" required />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} status={status} pending={pending} />
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
  const { status, pending, formProps } = useBehalteEingaben(lohnMonatAbzuegeBerechnen);
  const t = useTranslations("lohnAnsicht.formular.abzuegeBerechnen");
  const heute = new Date();

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form {...formProps} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
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
          <SubmitKnopf label={t("knopf")} status={status} pending={pending} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

// Abzuege fuer ein frei eingegebenes Monatsbrutto vorrechnen (WMCNL-2304). Reine
// Vorschau: so laesst sich jeder Zweig der Rechenregel gezielt pruefen, auch der
// mit positivem ИПН, den die vorhandenen Abrechnungen nie erreichen (alle
// Monatsbruttos liegen unter dem Freibetrag).
export function LohnAbzuegeVorschauFormular() {
  const { status, pending, formProps } = useBehalteEingaben<AbzugsVorschauStatus>(
    lohnAbzuegeVorschau,
    "immer",
    leerAbzugsVorschau,
  );
  const t = useTranslations("lohnAnsicht.formular.vorschau");
  const kzt = useTranslations("lohnAnsicht.kz");
  const at = useTranslations("aktionen");
  const format = useFormatter();
  const geld = (n: number) =>
    `${format.number(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₸`;
  const v = status.vorschau;

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form {...formProps} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Feld label={t("brutto")} name="brutto" inputMode="decimal" placeholder="300000" required />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} status={status} pending={pending} />
        </div>
        {status.stand === "fehler" && status.meldung ? (
          <p
            role="status"
            className="sm:col-span-2 lg:col-span-4 rounded-lg border border-destructive/25 bg-destructive/[0.06] p-2 schrift-label font-semibold text-destructive"
          >
            {at(status.meldung, { wert: "" })}
          </p>
        ) : null}
      </form>
      {v ? (
        <div className="space-y-1.5">
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                [kzt("col.brutto"), geld(v.bruttoTenge)],
                [kzt("col.opv"), geld(v.opvTenge)],
                [kzt("col.vosms"), geld(v.vosmsTenge)],
                [t("ipnGrundlage"), geld(v.ipnBemessungsgrundlageTenge)],
                [kzt("col.ipn"), v.ipnTenge === 0 ? kzt("steuerfrei") : geld(v.ipnTenge)],
                [kzt("col.netto"), geld(v.nettoTenge)],
                [kzt("stat.arbeitgeberlast"), geld(v.arbeitgeberlastTenge)],
                [kzt("col.arbeitgeberkosten"), geld(v.arbeitgeberkostenGesamtTenge)],
              ] satisfies [string, string][]
            ).map(([label, wert]) => (
              <div key={label} className="rounded-lg border border-border bg-muted/30 p-2">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="text-sm font-black text-foreground">{wert}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[11px] leading-4 text-muted-foreground">
            {t("satzStand", {
              datum: format.dateTime(new Date(v.satzGueltigAb), { dateStyle: "medium" }),
            })}
          </p>
        </div>
      ) : null}
    </FormularKarte>
  );
}

// Statuswechsel einer einzelnen Abrechnung (entwurf -> freigegeben ->
// ausgezahlt, sowie die Ruecknahme freigegeben -> entwurf, siehe
// lohn_abrechnung_freigabe_pruefen()/Migration 20261017000000 - eine
// Buchhaltungsperson nimmt eine ANDERE Freigabe zurueck, nicht die eigene).
// Bewusst ein eigenes kleines Formular je Zeile, analog
// ReklamationInPruefungFormular - kein Mehrfachauswahl-Mechanismus, jede
// Aktion ist ein bewusster Einzelschritt. Ein geldrelevanter Schritt (jedes
// Ziel hier) verlangt zusaetzlich eine Bestaetigung - WMCNL-2301: bisher
// buchte ein Fehlklick sofort und endgueltig.
export function LohnStatusFormular({
  id,
  ziel,
  label,
  bestaetigung,
}: {
  id: string;
  ziel: LohnStatus;
  label: string;
  bestaetigung: string;
}) {
  const [status, action] = useActionState(lohnStatusSetzen, leer);

  return (
    <form
      action={action}
      className="space-y-1"
      onSubmit={(event) => {
        if (!window.confirm(bestaetigung)) event.preventDefault();
      }}
    >
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
