"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { kostentraegerAnlegen, ledgerBuchungErfassen } from "@/lib/actions/finanzen";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";
import type {
  B2bKundeOption,
  ChargeOption,
  KostentraegerOption,
  ReihenblockOption,
  SorteOption,
} from "@/lib/domain/finanzen";

// Formulare der Finanzen-Anbindung (Anforderung 4.2, P0): Kostentraeger
// anlegen, Ledger-Buchung erfassen. Wie lohn-formulare.tsx: eigenes verstecktes
// Pfad-Feld je Formular fuer revalidatePath() nach dem Schreiben.

const leerOption = { wert: "", text: "" };

export function KostentraegerAnlegenFormular({
  reihenbloecke,
  sorten,
  kunden,
}: {
  reihenbloecke: ReihenblockOption[];
  sorten: SorteOption[];
  kunden: B2bKundeOption[];
}) {
  const [status, action] = useActionState(kostentraegerAnlegen, leer);
  const t = useTranslations("finanzenAnsicht.formular.kostentraeger");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <PfadFeld />
        <Feld label={t("bezeichnung")} name="bezeichnung" required />
        <Auswahl
          label={t("reihenblock")}
          name="reihenblock_id"
          options={[
            { wert: leerOption.wert, text: t("keinBezug") },
            ...reihenbloecke.map((r) => ({ wert: r.id, text: r.code })),
          ]}
        />
        <Auswahl
          label={t("sorte")}
          name="sorte_id"
          options={[
            { wert: leerOption.wert, text: t("keinBezug") },
            ...sorten.map((s) => ({ wert: s.id, text: s.name })),
          ]}
        />
        <Auswahl
          label={t("kunde")}
          name="b2b_kunde_id"
          options={[
            { wert: leerOption.wert, text: t("keinBezug") },
            ...kunden.map((k) => ({ wert: k.id, text: k.name })),
          ]}
        />
        <Feld label={t("erntetag")} name="erntetag" type="date" />
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

export function BuchungErfassenFormular({
  kostentraeger,
  chargen,
}: {
  kostentraeger: KostentraegerOption[];
  /** Anforderung 3.3: optionaler direkter Chargenbezug. */
  chargen: ChargeOption[];
}) {
  const [status, action] = useActionState(ledgerBuchungErfassen, leer);
  const t = useTranslations("finanzenAnsicht.formular.buchung");
  const heute = new Date().toISOString().slice(0, 10);

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
        <PfadFeld />
        <Auswahl
          label={t("kostentraeger")}
          name="kostentraeger_id"
          required
          options={[
            { wert: leerOption.wert, text: t("bitteWaehlen") },
            ...kostentraeger.map((k) => ({ wert: k.id, text: k.bezeichnung })),
          ]}
        />
        <Auswahl
          label={t("charge")}
          name="charge_id"
          options={[
            { wert: leerOption.wert, text: t("keinBezug") },
            ...chargen.map((c) => ({ wert: c.id, text: c.code })),
          ]}
        />
        <Auswahl
          label={t("typ")}
          name="typ"
          required
          options={[
            { wert: "erloes", text: t("erloes") },
            { wert: "kosten", text: t("kosten") },
          ]}
        />
        <Feld label={t("kategorie")} name="kategorie" required placeholder={t("kategoriePlatzhalter")} />
        <Feld label={t("betrag")} name="betrag_tenge" inputMode="decimal" required />
        <Feld label={t("buchungsdatum")} name="buchungsdatum" type="date" defaultValue={heute} required />
        <Feld label={t("beschreibung")} name="beschreibung" />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-6">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}
