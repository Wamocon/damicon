"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  kundeGruppeSetzen,
  preisListeAktivSchalten,
  preisListeErstellen,
  preislistenPositionHinzufuegen,
  preislistenPositionLoeschen,
} from "@/lib/actions/preislisten";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, Auswahl, Feld, FormularKarte, PfadFeld, SubmitKnopf } from "@/components/db/formular-kit";
import { kundengruppen, type AuswahlZeile } from "@/lib/domain/vorbestellungen";

// Formulare der Preisstaffelung (Anforderung 5.1/5.2): Preisliste anlegen,
// Position hinzufuegen/entfernen, Preisliste aktiv/inaktiv schalten,
// Kundengruppe je B2B-Kunde setzen.

function kundengruppenOptionen(t: (key: string) => string, mitStandard: boolean) {
  const optionen = kundengruppen.map((g) => ({ wert: g, text: t(g) }));
  return mitStandard ? [{ wert: "", text: t("standard") }, ...optionen] : optionen;
}

export function PreisListeErstellenFormular() {
  const [status, action] = useActionState(preisListeErstellen, leer);
  const t = useTranslations("preislistenAnsicht.formular.erstellen");
  const kg = useTranslations("kundengruppen");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="space-y-2.5">
        <PfadFeld />
        <Feld label={t("name")} name="name" required placeholder={t("namePlatzhalter")} />
        <div className="flex flex-wrap gap-2.5">
          <div className="w-40">
            <Feld label={t("gueltigAb")} name="gueltig_ab" type="date" required />
          </div>
          <div className="w-40">
            <Feld label={t("gueltigBis")} name="gueltig_bis" type="date" />
          </div>
          <div className="w-48">
            <Auswahl label={t("kundengruppe")} name="kundengruppe" options={kundengruppenOptionen(kg, true)} />
          </div>
        </div>
        <SubmitKnopf label={t("knopf")} />
        <AktionsMeldung status={status} />
      </form>
    </FormularKarte>
  );
}

export function PreislistenPositionHinzufuegenFormular({
  preislisteId,
  sorten,
}: {
  preislisteId: string;
  sorten: AuswahlZeile[];
}) {
  const [status, action] = useActionState(preislistenPositionHinzufuegen, leer);
  const t = useTranslations("preislistenAnsicht.formular.position");

  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2.5 border-t border-border pt-2">
      <PfadFeld />
      <input type="hidden" name="preisliste_id" value={preislisteId} />
      <div className="w-40">
        <Auswahl
          label={t("sorte")}
          name="sorte_id"
          required
          options={sorten.map((s) => ({ wert: s.id, text: s.label }))}
        />
      </div>
      <div className="w-32">
        <Feld label={t("preis")} name="preis_tenge_kg" inputMode="decimal" required />
      </div>
      <div className="w-32">
        <Feld label={t("mindestmenge")} name="min_menge_kg" inputMode="decimal" placeholder="0" />
      </div>
      <SubmitKnopf label={t("knopf")} variante="leise" />
      <div className="w-full">
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}

export function PreislistenPositionLoeschenKnopf({ positionId }: { positionId: string }) {
  const [status, action] = useActionState(preislistenPositionLoeschen, leer);
  const t = useTranslations("preislistenAnsicht");

  return (
    <form action={action} className="inline">
      <PfadFeld />
      <input type="hidden" name="id" value={positionId} />
      <button type="submit" className="text-[11px] font-semibold text-destructive hover:underline">
        {t("positionLoeschen")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

export function PreisListeAktivSchaltenKnopf({ preislisteId, aktiv }: { preislisteId: string; aktiv: boolean }) {
  const [status, action] = useActionState(preisListeAktivSchalten, leer);
  const t = useTranslations("preislistenAnsicht");

  return (
    <form action={action}>
      <PfadFeld />
      <input type="hidden" name="id" value={preislisteId} />
      <input type="hidden" name="naechster_wert" value={(!aktiv).toString()} />
      <button type="submit" className="text-[11px] font-semibold text-primary hover:underline">
        {aktiv ? t("deaktivieren") : t("aktivieren")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

export function KundeGruppeFormular({
  kundeId,
  kundengruppe,
}: {
  kundeId: string;
  kundengruppe: string | null;
}) {
  const [status, action] = useActionState(kundeGruppeSetzen, leer);
  const t = useTranslations("preislistenAnsicht.formular.gruppe");
  const kg = useTranslations("kundengruppen");

  return (
    <form action={action} className="flex flex-wrap items-end gap-2.5">
      <PfadFeld />
      <input type="hidden" name="kunde_id" value={kundeId} />
      <div className="w-48">
        <Auswahl
          label={t("label")}
          name="kundengruppe"
          defaultValue={kundengruppe ?? ""}
          options={kundengruppenOptionen(kg, true)}
        />
      </div>
      <SubmitKnopf label={t("knopf")} variante="leise" />
      <div className="w-full">
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}
