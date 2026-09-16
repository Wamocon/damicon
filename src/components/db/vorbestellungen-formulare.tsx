"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Ban } from "lucide-react";
import {
  vorbestellungAnlegen,
  vorbestellungStatusSetzen,
  vorbestellungStornieren,
} from "@/lib/actions/vorbestellungen";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";
import type { AuswahlZeile } from "@/lib/domain/vorbestellungen";

// Formulare fuer das B2B-Portal (Anforderung 5.1, Teil 2 von 2) - Anlegen wie
// LieferungAnlegenFormular (lieferungen-formulare.tsx), Statuspflege getrennt
// nach Buero (bestaetigen/ablehnen) und Kunde (nur Storno der eigenen, noch
// nicht bestaetigten Anfrage).

const leerOption = { wert: "", text: "" };

export function VorbestellungAnlegenFormular({
  kunden,
  sorten,
  fuerBuero,
}: {
  kunden: AuswahlZeile[];
  sorten: AuswahlZeile[];
  /** Buero waehlt die Firma selbst, ein Kunde bestellt immer fuer sich. */
  fuerBuero: boolean;
}) {
  const [status, action] = useActionState(vorbestellungAnlegen, leer);
  const t = useTranslations("b2bPortalAnsicht.formular.anlegen");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PfadFeld />
        {fuerBuero ? (
          <Auswahl
            label={t("kunde")}
            name="b2b_kunde_id"
            required
            options={[
              { wert: leerOption.wert, text: t("bitteWaehlen") },
              ...kunden.map((k) => ({ wert: k.id, text: k.label })),
            ]}
          />
        ) : null}
        <Auswahl
          label={t("sorte")}
          name="sorte_id"
          required
          options={[
            { wert: leerOption.wert, text: t("bitteWaehlen") },
            ...sorten.map((s) => ({ wert: s.id, text: s.label })),
          ]}
        />
        <Feld label={t("menge")} name="menge_kg" inputMode="decimal" required />
        <Feld label={t("liefertermin")} name="liefertermin" type="date" />
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

export function VorbestellungStatusFormular({ vorbestellungId }: { vorbestellungId: string }) {
  const [status, action] = useActionState(vorbestellungStatusSetzen, leer);
  const t = useTranslations("b2bPortalAnsicht");

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-1.5">
      <PfadFeld />
      <input type="hidden" name="id" value={vorbestellungId} />
      <button
        type="submit"
        name="status"
        value="bestaetigt"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:border-success hover:text-success"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t("bestaetigen")}
      </button>
      <button
        type="submit"
        name="status"
        value="storniert"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:border-destructive hover:text-destructive"
      >
        <Ban className="h-3.5 w-3.5" />
        {t("ablehnen")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

export function VorbestellungStornierenKnopf({ vorbestellungId }: { vorbestellungId: string }) {
  const [status, action] = useActionState(vorbestellungStornieren, leer);
  const t = useTranslations("b2bPortalAnsicht");

  return (
    <form action={action} className="mt-2">
      <PfadFeld />
      <input type="hidden" name="id" value={vorbestellungId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:border-destructive hover:text-destructive"
      >
        <Ban className="h-3.5 w-3.5" />
        {t("stornieren")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}
