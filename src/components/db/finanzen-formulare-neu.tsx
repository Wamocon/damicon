"use client";

import { useActionState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { kostentraegerAnlegen, ledgerBuchungErfassen } from "@/lib/actions/finanzen";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";
import { Button } from "@/components/ui/kit";
import type {
  B2bKundeOption,
  ChargeOption,
  KostentraegerOption,
  ReihenblockOption,
  SorteOption,
} from "@/lib/domain/finanzen";

// Entwurfsfassung der beiden Finanzformulare fuer die Laborseite
// (/dashboard/finanz-labor). Die bestehende finanzen-formulare.tsx bleibt
// unveraendert, bis der Entwurf sie ersetzt.
//
// Zwei Unterschiede zur bestehenden Fassung:
//
//   1. vorschau. Das Labor laeuft gegen die gehostete, geteilte Datenbank
//      (.github/instructions/supabase-workflow.instructions.md), und
//      finance_ledger_entries ist nur anfuegbar - ein Trigger verhindert
//      Aendern und Loeschen. Eine Probebuchung waere also fuer immer drin.
//      Deshalb sind die Felder bedienbar, das Absenden aber nicht: nur so
//      laesst sich beurteilen, wie das Formular im Reiter wirkt.
//   2. Die Kostentraeger stehen im Auswahlfeld unter Erntetagen statt in
//      einer einzigen Liste. Mit den Jahresdaten sind das rund 138 Eintraege;
//      ungegliedert findet man darin nichts. Begrenzt wird nicht - ein
//      aelterer Kostentraeger muss bebuchbar bleiben.
//
// Es gibt keine FormularKarte mehr um das Formular: Im Labor steht es bereits
// in einem aufklappbaren Abschnitt, eine zweite Karte darum waere Karte auf
// Karte.

const LEER = "";

/**
 * Kostentraeger nach Erntetag gruppieren. Die Liste kommt bereits absteigend
 * sortiert aus ladeKostentraegerOptionen(), Eintraege ohne Erntetag stehen
 * dort am Ende - die Gruppen entstehen deshalb allein durch Weiterlaufen,
 * ohne zweites Sortieren.
 */
function nachErntetag(
  liste: KostentraegerOption[],
  ohneTitel: string,
  datum: (iso: string) => string,
) {
  const gruppen: { titel: string; options: { wert: string; text: string }[] }[] = [];
  let letzter: string | null | undefined;

  for (const eintrag of liste) {
    if (gruppen.length === 0 || eintrag.erntetag !== letzter) {
      gruppen.push({
        titel: eintrag.erntetag ? datum(eintrag.erntetag) : ohneTitel,
        options: [],
      });
      letzter = eintrag.erntetag;
    }
    gruppen[gruppen.length - 1].options.push({
      wert: eintrag.id,
      text: eintrag.bezeichnung,
    });
  }

  return gruppen;
}

function Absenden({ label, vorschau }: { label: string; vorschau: boolean }) {
  const t = useTranslations("finanzenAnsicht");
  if (!vorschau) return <SubmitKnopf label={label} />;

  return (
    <Button
      type="button"
      disabled
      rundung="schmal"
      groesse="formular"
      title={t("vorschauHinweis")}
    >
      {label}
    </Button>
  );
}

function VorschauHinweis({ vorschau }: { vorschau: boolean }) {
  const t = useTranslations("finanzenAnsicht");
  if (!vorschau) return null;
  return (
    <p className="schrift-label font-semibold text-muted-foreground">
      {t("vorschauHinweis")}
    </p>
  );
}

export function KostentraegerAnlegenFormularNeu({
  reihenbloecke,
  sorten,
  kunden,
  vorschau = false,
}: {
  reihenbloecke: ReihenblockOption[];
  sorten: SorteOption[];
  kunden: B2bKundeOption[];
  vorschau?: boolean;
}) {
  const [status, action] = useActionState(kostentraegerAnlegen, leer);
  const t = useTranslations("finanzenAnsicht.formular.kostentraeger");

  return (
    <form
      action={vorschau ? undefined : action}
      onSubmit={vorschau ? (event) => event.preventDefault() : undefined}
      className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5"
    >
      <PfadFeld />
      <Feld label={t("bezeichnung")} name="bezeichnung" required />
      <Auswahl
        label={t("reihenblock")}
        name="reihenblock_id"
        options={[
          { wert: LEER, text: t("keinBezug") },
          ...reihenbloecke.map((r) => ({ wert: r.id, text: r.code })),
        ]}
      />
      <Auswahl
        label={t("sorte")}
        name="sorte_id"
        options={[
          { wert: LEER, text: t("keinBezug") },
          ...sorten.map((s) => ({ wert: s.id, text: s.name })),
        ]}
      />
      <Auswahl
        label={t("kunde")}
        name="b2b_kunde_id"
        options={[
          { wert: LEER, text: t("keinBezug") },
          ...kunden.map((k) => ({ wert: k.id, text: k.name })),
        ]}
      />
      <Feld label={t("erntetag")} name="erntetag" type="date" />
      <div className="flex items-end">
        <Absenden label={t("knopf")} vorschau={vorschau} />
      </div>
      <div className="space-y-2 sm:col-span-2 lg:col-span-5">
        <VorschauHinweis vorschau={vorschau} />
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}

export function BuchungErfassenFormularNeu({
  kostentraeger,
  chargen,
  vorschau = false,
}: {
  kostentraeger: KostentraegerOption[];
  /** Anforderung 3.3: optionaler direkter Chargenbezug. */
  chargen: ChargeOption[];
  vorschau?: boolean;
}) {
  const [status, action] = useActionState(ledgerBuchungErfassen, leer);
  const t = useTranslations("finanzenAnsicht.formular.buchung");
  const format = useFormatter();
  const heute = new Date().toISOString().slice(0, 10);

  const gruppen = nachErntetag(kostentraeger, t("ohneErntetag"), (iso) =>
    format.dateTime(new Date(iso), { dateStyle: "medium" }),
  );

  return (
    <form
      action={vorschau ? undefined : action}
      onSubmit={vorschau ? (event) => event.preventDefault() : undefined}
      className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6"
    >
      <PfadFeld />
      <Auswahl
        label={t("kostentraeger")}
        name="kostentraeger_id"
        required
        options={[{ wert: LEER, text: t("bitteWaehlen") }]}
        gruppen={gruppen}
      />
      <Auswahl
        label={t("charge")}
        name="charge_id"
        options={[
          { wert: LEER, text: t("keinBezug") },
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
      <Feld
        label={t("kategorie")}
        name="kategorie"
        required
        placeholder={t("kategoriePlatzhalter")}
      />
      <Feld label={t("betrag")} name="betrag_tenge" inputMode="decimal" required />
      <Feld
        label={t("buchungsdatum")}
        name="buchungsdatum"
        type="date"
        defaultValue={heute}
        required
      />
      <Feld label={t("beschreibung")} name="beschreibung" />
      <div className="flex items-end">
        <Absenden label={t("knopf")} vorschau={vorschau} />
      </div>
      <div className="space-y-2 sm:col-span-2 lg:col-span-6">
        <VorschauHinweis vorschau={vorschau} />
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}
