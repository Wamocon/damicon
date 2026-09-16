"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  parzelleAnlegen,
  plantageAnlegen,
  reihenblockAnlegen,
  reihengruppeAnlegen,
} from "@/lib/actions/standort";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";

export interface AuswahlOption {
  wert: string;
  text: string;
}

// Vier Formulare fuer die vier Ebenen unter dem Betrieb. Jedes schickt den
// aktuellen Pfad mit, damit die Server Action die Seite gezielt neu laden kann.

export function PlantageFormular({ betriebId }: { betriebId: string }) {
  const [status, action] = useActionState(plantageAnlegen, leer);
  const t = useTranslations("standortVerwaltung");

  return (
    <FormularKarte titel={t("plantage.titel")} beschreibung={t("plantage.lead")}>
      <form action={action} className="space-y-2.5">
        <PfadFeld />
        <input type="hidden" name="betrieb_id" value={betriebId} />
        <Feld label={t("feld.name")} name="name" required placeholder={t("beispiel.plantageName")} />
        <Feld label={t("feld.ort")} name="ort" placeholder={t("beispiel.plantageOrt")} />
        <Auswahl
          label={t("feld.typ")}
          name="typ"
          options={[
            { wert: "eigen", text: t("typ.eigen") },
            { wert: "nachbarbetrieb", text: t("typ.nachbarbetrieb") },
          ]}
        />
        <SubmitKnopf />
        <AktionsMeldung status={status} />
      </form>
    </FormularKarte>
  );
}

export function ParzelleFormular({
  plantagen,
  sorten,
}: {
  plantagen: AuswahlOption[];
  sorten: AuswahlOption[];
}) {
  const [status, action] = useActionState(parzelleAnlegen, leer);
  const t = useTranslations("standortVerwaltung");

  return (
    <FormularKarte titel={t("parzelle.titel")} beschreibung={t("parzelle.lead")}>
      <form action={action} className="space-y-2.5">
        <PfadFeld />
        <Auswahl
          label={t("feld.plantage")}
          name="plantage_id"
          options={plantagen}
          required
        />
        <Feld label={t("feld.name")} name="name" required placeholder={t("beispiel.parzelleName")} />
        <Feld
          label={t("feld.flaeche")}
          name="flaeche_ha"
          inputMode="decimal"
          placeholder={t("beispiel.flaeche")}
        />
        <Auswahl
          label={t("feld.sorte")}
          name="sorte_id"
          options={[{ wert: "", text: t("feld.ohneSorte") }, ...sorten]}
        />
        <SubmitKnopf />
        <AktionsMeldung status={status} />
      </form>
    </FormularKarte>
  );
}

export function ReihengruppeFormular({
  parzellen,
}: {
  parzellen: AuswahlOption[];
}) {
  const [status, action] = useActionState(reihengruppeAnlegen, leer);
  const t = useTranslations("standortVerwaltung");

  return (
    <FormularKarte
      titel={t("reihengruppe.titel")}
      beschreibung={t("reihengruppe.lead")}
    >
      <form action={action} className="space-y-2.5">
        <PfadFeld />
        <Auswahl
          label={t("feld.parzelle")}
          name="feldparzelle_id"
          options={parzellen}
          required
        />
        <Feld
          label={t("feld.name")}
          name="name"
          required
          placeholder={t("beispiel.reihengruppeName")}
        />
        <Auswahl
          label={t("feld.spalier")}
          name="spalierrichtung"
          options={[
            { wert: "n_s", text: t("spalier.n_s") },
            { wert: "o_w", text: t("spalier.o_w") },
          ]}
        />
        <SubmitKnopf />
        <AktionsMeldung status={status} />
      </form>
    </FormularKarte>
  );
}

export function ReihenblockFormular({
  gruppen,
  sorten,
}: {
  gruppen: AuswahlOption[];
  sorten: AuswahlOption[];
}) {
  const [status, action] = useActionState(reihenblockAnlegen, leer);
  const t = useTranslations("standortVerwaltung");

  return (
    <FormularKarte
      titel={t("reihenblock.titel")}
      beschreibung={t("reihenblock.lead")}
    >
      <form action={action} className="space-y-2.5">
        <PfadFeld />
        <Auswahl
          label={t("feld.reihengruppe")}
          name="reihengruppe_id"
          options={gruppen}
          required
        />
        <Feld label={t("feld.code")} name="code" required placeholder="T-N-A-09" />
        <Feld
          label={t("feld.laenge")}
          name="laenge_m"
          inputMode="decimal"
          placeholder="42"
        />
        <Auswahl
          label={t("feld.sorte")}
          name="sorte_id"
          options={[{ wert: "", text: t("feld.ohneSorte") }, ...sorten]}
        />
        <SubmitKnopf />
        <AktionsMeldung status={status} />
      </form>
    </FormularKarte>
  );
}
