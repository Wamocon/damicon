"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageSquarePlus } from "lucide-react";
import {
  reklamationAnlegen,
  reklamationNachrichtHinzufuegen,
  reklamationStatusSetzen,
} from "@/lib/actions/reklamationen";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  SubmitKnopf,
} from "@/components/db/formular-kit";
import type { AuswahlOption } from "@/components/db/standort-formulare";
import { reklamationGruende, type ReklamationStatus } from "@/lib/domain/reklamationen";

// Formulare des Reklamationsmanagements (WMCNL-1455): Reklamation melden,
// Status setzen inklusive Loesung/Gutschrift, Nachricht an den Verlauf.

function PfadFeld() {
  const pfad = usePathname();
  return <input type="hidden" name="pfad" value={pfad} />;
}

// Neue Reklamation. Ein Kunde legt ausschliesslich fuer die eigene Firma an -
// die Kundenauswahl erscheint deshalb nur fuer Buero-Rollen (die Action
// ignoriert eine mitgeschickte Kundenauswahl fuer die Rolle kunde ohnehin).
export function ReklamationAnlegenFormular({
  istBuero,
  b2bKunden,
  chargen,
}: {
  istBuero: boolean;
  b2bKunden: AuswahlOption[];
  chargen: AuswahlOption[];
}) {
  const [status, action] = useActionState(reklamationAnlegen, leer);
  const t = useTranslations("reklamationenAnsicht.formular.anlegen");
  const f = useTranslations("reklamationenAnsicht.formular.feld");
  const grundT = useTranslations("reklamationGrund");

  return (
    <FormularKarte titel={t("titel")} beschreibung={istBuero ? t("leadBuero") : t("leadKunde")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PfadFeld />
        {istBuero ? (
          <Auswahl label={f("kunde")} name="b2b_kunde_id" options={b2bKunden} required />
        ) : null}
        <Auswahl
          label={f("charge")}
          name="charge_id"
          options={[{ wert: "", text: f("ohneCharge") }, ...chargen]}
        />
        <Auswahl
          label={f("grund")}
          name="grund"
          options={reklamationGruende.map((wert) => ({ wert, text: grundT(wert) }))}
        />
        <Feld label={f("betreff")} name="betreff" required />
        <Feld label={f("beschreibung")} name="beschreibung" />
        <Feld label={f("menge")} name="betroffene_menge_kg" inputMode="decimal" />
        {istBuero ? <Feld label={f("frist")} name="frist_am" type="date" /> : null}
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

// Statuswechsel ohne Entscheidung (offen -> in_pruefung): kein Begruendungsfeld
// noetig, die Datenbank verlangt es erst ab einer Endlage.
export function ReklamationInPruefungFormular({ id }: { id: string }) {
  const [status, action] = useActionState(reklamationStatusSetzen, leer);
  const t = useTranslations("reklamationenAnsicht.ablauf");

  return (
    <form action={action} className="space-y-2">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value="in_pruefung" />
      <button
        type="submit"
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-semibold text-foreground transition hover:bg-muted"
      >
        {t("inPruefungKnopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

// Entscheidung ueber eine Reklamation: annehmen, ablehnen oder abschliessen -
// jeweils mit Pflicht-Loesungstext, Gutschrift nur bei Annahme/Abschluss
// sichtbar (die Datenbank weist alles andere ohnehin per Check-Constraint ab).
export function ReklamationEntscheidungFormular({
  id,
  ziel,
  label,
  mitGutschrift,
}: {
  id: string;
  ziel: Extract<ReklamationStatus, "angenommen" | "abgelehnt" | "erledigt">;
  label: string;
  mitGutschrift: boolean;
}) {
  const [status, action] = useActionState(reklamationStatusSetzen, leer);
  const t = useTranslations("reklamationenAnsicht.formular.entscheidung");

  return (
    <form action={action} className="space-y-2">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={ziel} />
      <Feld label={t("loesung")} name="loesung" required />
      {mitGutschrift ? (
        <Feld label={t("gutschrift")} name="gutschrift_tenge" inputMode="decimal" />
      ) : null}
      <button
        type="submit"
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-primary-foreground transition hover:brightness-110"
      >
        {label}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

// Nachricht an den Verlauf, ohne Statuswechsel. "Intern" gibt es nur fuer das
// Buero - eine Kunde-Nachricht ist immer fuer die eigene Firma sichtbar.
export function ReklamationNachrichtFormular({
  reklamationId,
  istBuero,
}: {
  reklamationId: string;
  istBuero: boolean;
}) {
  const [status, action] = useActionState(reklamationNachrichtHinzufuegen, leer);
  const t = useTranslations("reklamationenAnsicht.formular.nachricht");

  return (
    <form action={action} className="space-y-2">
      <PfadFeld />
      <input type="hidden" name="reklamation_id" value={reklamationId} />
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold text-card-foreground">{t("titel")}</span>
        <textarea
          name="text"
          required
          placeholder={t("platzhalter")}
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground outline-none transition focus:border-primary"
        />
      </label>
      {istBuero ? (
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-card-foreground">
          <input type="checkbox" name="intern" className="h-3.5 w-3.5" />
          {t("intern")}
        </label>
      ) : null}
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition hover:border-primary"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        {t("knopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}
