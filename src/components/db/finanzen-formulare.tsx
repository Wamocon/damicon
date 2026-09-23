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
import type {
  B2bKundeOption,
  ChargeOption,
  KostentraegerOption,
  ReihenblockOption,
  SorteOption,
} from "@/lib/domain/finanzen";

// Formulare der Finanzen-Anbindung (Anforderung 4.2, P0): Kostentraeger
// anlegen, Ledger-Buchung erfassen. Wie lohn-formulare.tsx: eigenes
// verstecktes Pfad-Feld je Formular fuer revalidatePath() nach dem Schreiben.
//
// Die Kostentraeger stehen im
// Auswahlfeld unter Erntetagen statt in einer einzigen Liste. Es sind
// inzwischen ueber 250 Eintraege; ungegliedert findet man darin nichts.
// Begrenzt wird die Liste nicht - ein aelterer Kostentraeger muss bebuchbar
// bleiben, sonst ist das Aufraeumen der Oberflaeche ein Funktionsverlust.
//
// Die Formulare schreiben wirklich. Das war eine Weile anders: solange
// angenommen war, das Labor laufe gegen die geteilte gehostete Datenbank, war
// das Absenden gesperrt - finance_ledger_entries ist nur anfuegbar, eine
// Probebuchung waere dort fuer immer drin. Tatsaechlich zeigt .env.local auf
// eine lokale Instanz, wo ein db reset alles wieder wegraeumt. Wer das
// umstellt, sollte die Sperre wieder einbauen.
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
    <form
      action={action}
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
        <SubmitKnopf label={t("knopf")} />
      </div>
      <div className="sm:col-span-2 lg:col-span-5">
        <AktionsMeldung status={status} />
      </div>
    </form>
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
  const format = useFormatter();
  const heute = new Date().toISOString().slice(0, 10);

  const gruppen = nachErntetag(kostentraeger, t("ohneErntetag"), (iso) =>
    format.dateTime(new Date(iso), { dateStyle: "medium" }),
  );

  return (
    <form
      action={action}
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
        <SubmitKnopf label={t("knopf")} />
      </div>
      <div className="sm:col-span-2 lg:col-span-6">
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}
