"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck, Sprout } from "lucide-react";
import {
  behandlungErfassen,
  sperreFreigeben,
  stammdatenBearbeiten,
  statusSetzen,
} from "@/lib/actions/reihenbloecke";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";
import { reihenblockStatus } from "@/lib/domain/reihenbloecke";
import type { AuswahlOption } from "@/components/db/standort-formulare";

// Statuswechsel direkt in der Tabellenzeile. Die Datenbank laesst den Wechsel
// weg von "wartezeitgesperrt" nur zu, wenn keine Wartezeit mehr laeuft.
export function StatusWechsel({
  id,
  code,
  status,
}: {
  id: string;
  code: string;
  status: string;
}) {
  const [ergebnis, action] = useActionState(statusSetzen, leer);
  const t = useTranslations("reihenblockStatus");
  const a = useTranslations("aktionen");

  return (
    <form action={action} className="space-y-1">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="code" value={code} />
      <div className="flex items-center gap-1.5">
        <select
          name="status"
          defaultValue={status}
          aria-label={a("statusLabel")}
          className="h-11 rounded-lg border border-border bg-background px-3 text-base font-semibold text-foreground outline-none transition focus:border-primary md:h-9 md:px-2 md:text-[11px]"
        >
          {reihenblockStatus.map((wert) => (
            <option key={wert} value={wert}>
              {t(wert)}
            </option>
          ))}
        </select>
        <SubmitKnopf label={a("speichern")} variante="leise" />
      </div>
      <AktionsMeldung status={ergebnis} />
    </form>
  );
}

// Anforderung 2.1: Code und Sortenprofil eines bestehenden Reihenblocks
// waren bisher nur beim Anlegen setzbar. Unabhaengig vom Sperrzustand
// verfuegbar - Umbenennung/Sortenkorrektur ist keine Ernteaktion.
export function StammdatenBearbeiten({
  id,
  code,
  sorteId,
  sorten,
}: {
  id: string;
  code: string;
  sorteId: string | null;
  sorten: AuswahlOption[];
}) {
  const [ergebnis, action] = useActionState(stammdatenBearbeiten, leer);
  const t = useTranslations("standortVerwaltung");
  const a = useTranslations("aktionen");

  return (
    <form action={action} className="space-y-1">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <div className="flex items-center gap-1.5">
        <input
          name="code"
          defaultValue={code}
          aria-label={t("feld.code")}
          className="h-11 w-28 rounded-lg border border-border bg-background px-3 font-mono text-base font-semibold uppercase text-foreground outline-none transition focus:border-primary md:h-9 md:w-24 md:px-2 md:text-[11px]"
        />
        <select
          name="sorte_id"
          defaultValue={sorteId ?? ""}
          aria-label={t("feld.sorte")}
          className="h-9 rounded-lg border border-border bg-background px-2 text-[11px] font-semibold text-foreground outline-none transition focus:border-primary"
        >
          <option value="">{t("feld.ohneSorte")}</option>
          {sorten.map((sorte) => (
            <option key={sorte.wert} value={sorte.wert}>
              {sorte.text}
            </option>
          ))}
        </select>
        <SubmitKnopf label={a("bearbeiten")} variante="leise" />
      </div>
      <AktionsMeldung status={ergebnis} />
    </form>
  );
}

// Freigabe nach Ablauf der Wartezeit - ruft die Datenbankfunktion
// public.reihenblock_freigeben() auf.
export function FreigabeKnopf({ id }: { id: string }) {
  const [ergebnis, action] = useActionState(sperreFreigeben, leer);
  const a = useTranslations("aktionen");

  return (
    <form action={action} className="space-y-1">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-success px-3 text-sm font-bold text-white transition hover:brightness-110 md:h-9 md:px-2.5 md:text-[11px]"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        {a("freigeben")}
      </button>
      <AktionsMeldung status={ergebnis} />
    </form>
  );
}

// Neue Pflanzenschutzbehandlung: sperrt den Block ueber den Datenbank-Trigger
// automatisch bis zum Ablauf der mittelspezifischen Wartezeit.
export function BehandlungFormular({
  bloecke,
  mittel,
  heute,
  profile,
}: {
  bloecke: AuswahlOption[];
  mittel: AuswahlOption[];
  heute: string;
  profile: AuswahlOption[];
}) {
  const [ergebnis, action] = useActionState(behandlungErfassen, leer);
  const t = useTranslations("pflanzenschutzVerwaltung");
  const einheiten: AuswahlOption[] = [
    { wert: "l_ha", text: "l/ha" },
    { wert: "kg_ha", text: "kg/ha" },
  ];

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <PfadFeld />
        <Auswahl
          label={t("feld.block")}
          name="reihenblock_id"
          options={bloecke}
          required
        />
        <Auswahl
          label={t("feld.mittel")}
          name="psm_mittel_id"
          options={mittel}
          required
        />
        <Feld
          label={t("feld.datum")}
          name="behandelt_am"
          type="date"
          defaultValue={heute}
        />
        {/* Anforderung 2.4: Aufwandmenge und durchfuehrende Person sind
            Pflichtfelder, nicht erst nachtraeglich zu erfassen. */}
        <Feld
          label={t("feld.menge")}
          name="aufwandmenge"
          inputMode="decimal"
          placeholder="1,5"
          required
        />
        <Auswahl
          label={t("feld.einheit")}
          name="aufwandmenge_einheit"
          options={einheiten}
          required
        />
        <Auswahl
          label={t("feld.person")}
          name="durchgefuehrt_von_profil_id"
          options={profile}
          required
        />
        <div className="flex items-end">
          <SubmitKnopf label={t("erfassen")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <AktionsMeldung status={ergebnis} />
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
            <Sprout className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            {t("hinweis")}
          </p>
        </div>
      </form>
    </FormularKarte>
  );
}
