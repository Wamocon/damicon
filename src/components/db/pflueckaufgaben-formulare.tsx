"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, Check } from "lucide-react";
import {
  aufgabeAnlegen,
  aufgabeStatusSetzen,
  belegHochladen,
  mengeMelden,
} from "@/lib/actions/pflueckaufgaben";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  mitGeraetZeitstempel,
  SubmitKnopf,
} from "@/components/db/formular-kit";
import type { AuswahlOption } from "@/components/db/standort-formulare";

function PfadFeld() {
  const pfad = usePathname();
  return <input type="hidden" name="pfad" value={pfad} />;
}

// Neue Pflueckaufgabe. Gesperrte Reihenbloecke stehen gar nicht erst zur Wahl -
// und die Datenbank weist sie zusaetzlich ab (Trigger trg_pflueckaufgabe_sperre).
export function AufgabeAnlegenFormular({
  bloecke,
  brigaden,
}: {
  bloecke: AuswahlOption[];
  brigaden: AuswahlOption[];
}) {
  const [status, action] = useActionState(aufgabeAnlegen, leer);
  const t = useTranslations("pflueckaufgabenVerwaltung");

  return (
    <FormularKarte titel={t("neu.titel")} beschreibung={t("neu.lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <PfadFeld />
        <Auswahl
          label={t("feld.block")}
          name="reihenblock_id"
          options={bloecke}
          required
        />
        <Auswahl
          label={t("feld.brigade")}
          name="brigade_id"
          options={[{ wert: "", text: t("feld.ohneBrigade") }, ...brigaden]}
        />
        <Feld
          label={t("feld.zielmenge")}
          name="zielmenge_kg"
          inputMode="decimal"
          required
          placeholder="30"
        />
        <Feld
          label={t("feld.pfluecker")}
          name="pfluecker_anzahl"
          inputMode="decimal"
          placeholder="4"
        />
        <div className="flex items-end">
          <SubmitKnopf label={t("neu.knopf")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-5">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

// Erntemenge melden - setzt die Aufgabe auf Belegpruefung.
export function MengeFormular({
  id,
  istMenge,
  ausschussKg,
  pflueckerAnzahl,
}: {
  id: string;
  istMenge: number;
  ausschussKg: number;
  pflueckerAnzahl: number;
}) {
  const [status, action] = useActionState(mengeMelden, leer);
  const t = useTranslations("pflueckaufgabenVerwaltung");

  return (
    <form action={action} className="space-y-2.5">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-2.5">
        <Feld
          label={t("feld.istMenge")}
          name="ist_menge_kg"
          inputMode="decimal"
          required
          defaultValue={String(istMenge)}
        />
        <Feld
          label={t("feld.ausschuss")}
          name="ausschuss_kg"
          inputMode="decimal"
          defaultValue={String(ausschussKg)}
        />
        <Feld
          label={t("feld.pfluecker")}
          name="pfluecker_anzahl"
          inputMode="decimal"
          defaultValue={String(pflueckerAnzahl)}
        />
      </div>
      <SubmitKnopf label={t("menge.knopf")} />
      <AktionsMeldung status={status} />
    </form>
  );
}

// Fotobeleg hochladen. Auf dem Telefon oeffnet capture="environment" direkt die
// Kamera - der Beleg entsteht dort, wo gepflueckt wird.
export function BelegUploadFormular({ aufgabeId }: { aufgabeId: string }) {
  const [status, action] = useActionState(belegHochladen, leer);
  const t = useTranslations("pflueckaufgabenVerwaltung");

  return (
    <form
      action={action}
      className="space-y-2.5"
      onSubmit={mitGeraetZeitstempel("geraet_zeitpunkt")}
    >
      <PfadFeld />
      <input type="hidden" name="aufgabe_id" value={aufgabeId} />
      {/* Anforderung 2.6: Moment der Aufnahme, nicht des Servereingangs. */}
      <input type="hidden" name="geraet_zeitpunkt" />
      <Auswahl
        label={t("feld.art")}
        name="art"
        options={[
          { wert: "schale", text: t("art.schale") },
          { wert: "reihenblock", text: t("art.reihenblock") },
          { wert: "steige", text: t("art.steige") },
        ]}
      />
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold text-card-foreground">
          {t("feld.datei")}
        </span>
        <input
          type="file"
          name="datei"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          required
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
        />
      </label>
      <Feld label={t("feld.hinweis")} name="hinweis" placeholder={t("feld.hinweisBeispiel")} />
      <button
        type="submit"
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-semibold text-foreground transition hover:bg-muted"
      >
        <Camera className="h-4 w-4" />
        {t("beleg.knopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

// Statuswechsel der Aufgabe: annehmen, starten, abschliessen.
export function AufgabeStatusFormular({
  id,
  ziel,
  label,
  mitQualitaet = false,
}: {
  id: string;
  ziel: string;
  label: string;
  mitQualitaet?: boolean;
}) {
  const [status, action] = useActionState(aufgabeStatusSetzen, leer);
  const t = useTranslations("pflueckaufgabenVerwaltung");
  // Anforderung 2.6: nur beim Start der Arbeit relevant - der Wechsel auf
  // in_arbeit startet die Kuehlkettenuhr, dafuer zaehlt der Moment auf dem
  // Feld, nicht der Moment, in dem die Anfrage beim Server ankommt.
  const brauchtGeraetZeit = ziel === "in_arbeit";

  return (
    <form
      action={action}
      className="space-y-2"
      onSubmit={brauchtGeraetZeit ? mitGeraetZeitstempel("arbeitsbeginn_geraet_zeitpunkt") : undefined}
    >
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={ziel} />
      {brauchtGeraetZeit ? (
        <input type="hidden" name="arbeitsbeginn_geraet_zeitpunkt" />
      ) : null}
      {mitQualitaet ? (
        <Feld
          label={t("feld.qualitaet")}
          name="qualitaetsfaktor"
          inputMode="decimal"
          placeholder="1,05"
        />
      ) : null}
      <button
        type="submit"
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-primary-foreground transition hover:brightness-110"
      >
        <Check className="h-4 w-4" />
        {label}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}
