"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  kontingentErstellen,
  kontingentMengeAktualisieren,
  sorteAktualisieren,
  sorteErstellen,
} from "@/lib/actions/sortenkatalog";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, Auswahl, Feld, FormularKarte, PfadFeld, SubmitKnopf } from "@/components/db/formular-kit";
import { sorteTypen, type SorteZeile } from "@/lib/domain/sortenkatalog";
import type { AuswahlZeile } from "@/lib/domain/vorbestellungen";

// Formulare des Sorten- und Kontingentkatalogs: Sorte anlegen/bearbeiten,
// Kontingent anlegen, vereinbarte Menge eines bestehenden Kontingents aendern.

function typOptionen(t: (key: string) => string) {
  return sorteTypen.map((typ) => ({ wert: typ, text: t(typ) }));
}

export function SorteErstellenFormular() {
  const [status, action] = useActionState(sorteErstellen, leer);
  const t = useTranslations("sortenkatalogAnsicht.formular.sorteErstellen");
  const st = useTranslations("sorteTypen");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="space-y-2.5">
        <PfadFeld />
        <Feld label={t("name")} name="name" required placeholder={t("namePlatzhalter")} />
        <div className="flex flex-wrap gap-2.5">
          <div className="w-40">
            <Auswahl label={t("typ")} name="typ" required options={typOptionen(st)} />
          </div>
          <div className="w-48">
            <Feld label={t("erntefenster")} name="erntefenster" placeholder={t("erntefensterPlatzhalter")} />
          </div>
          <div className="w-32">
            <Feld label={t("schaleG")} name="schale_g" inputMode="decimal" placeholder="125" />
          </div>
        </div>
        <SubmitKnopf label={t("knopf")} />
        <AktionsMeldung status={status} />
      </form>
    </FormularKarte>
  );
}

export function SorteBearbeitenFormular({ sorte }: { sorte: SorteZeile }) {
  const [status, action] = useActionState(sorteAktualisieren, leer);
  const t = useTranslations("sortenkatalogAnsicht.formular.sorteErstellen");
  const st = useTranslations("sorteTypen");

  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2.5 border-t border-border pt-2">
      <PfadFeld />
      <input type="hidden" name="id" value={sorte.id} />
      <div className="w-40">
        <Feld label={t("name")} name="name" required defaultValue={sorte.name} />
      </div>
      <div className="w-36">
        <Auswahl label={t("typ")} name="typ" required defaultValue={sorte.typ} options={typOptionen(st)} />
      </div>
      <div className="w-44">
        <Feld label={t("erntefenster")} name="erntefenster" defaultValue={sorte.erntefenster ?? ""} />
      </div>
      <div className="w-28">
        <Feld
          label={t("schaleG")}
          name="schale_g"
          inputMode="decimal"
          defaultValue={sorte.schaleG?.toString() ?? ""}
        />
      </div>
      <SubmitKnopf label={t("speichernKnopf")} variante="leise" />
      <div className="w-full">
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}

export function KontingentErstellenFormular({
  kunden,
  sorten,
}: {
  kunden: AuswahlZeile[];
  sorten: AuswahlZeile[];
}) {
  const [status, action] = useActionState(kontingentErstellen, leer);
  const t = useTranslations("sortenkatalogAnsicht.formular.kontingentErstellen");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="space-y-2.5">
        <PfadFeld />
        <div className="flex flex-wrap gap-2.5">
          <div className="w-48">
            <Auswahl label={t("kunde")} name="b2b_kunde_id" required options={kunden.map((k) => ({ wert: k.id, text: k.label }))} />
          </div>
          <div className="w-40">
            <Auswahl label={t("sorte")} name="sorte_id" required options={sorten.map((s) => ({ wert: s.id, text: s.label }))} />
          </div>
          <div className="w-28">
            <Feld label={t("saison")} name="saison" placeholder="2026" />
          </div>
          <div className="w-32">
            <Feld label={t("menge")} name="menge_kg" inputMode="decimal" required />
          </div>
        </div>
        <SubmitKnopf label={t("knopf")} />
        <AktionsMeldung status={status} />
      </form>
    </FormularKarte>
  );
}

export function KontingentMengeFormular({ kontingentId, mengeKg }: { kontingentId: string; mengeKg: number }) {
  const [status, action] = useActionState(kontingentMengeAktualisieren, leer);
  const t = useTranslations("sortenkatalogAnsicht.formular.kontingentMenge");

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <PfadFeld />
      <input type="hidden" name="id" value={kontingentId} />
      <div className="w-28">
        <Feld label={t("label")} name="menge_kg" inputMode="decimal" required defaultValue={mengeKg.toString()} />
      </div>
      <SubmitKnopf label={t("knopf")} variante="leise" />
      <div className="w-full">
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}
