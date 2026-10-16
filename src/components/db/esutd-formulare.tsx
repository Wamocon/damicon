"use client";

import { useTranslations } from "next-intl";
import {
  esutdEreignisAnlegen,
  esutdMeldungEntfernen,
  esutdMeldungErfassen,
  esutdMeldungOeffnen,
  esutdVertragAnlegen,
} from "@/lib/actions/esutd";
import { AktionsMeldung, Auswahl, Feld, FormularKarte, MiniAktion, PfadFeld, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";
import { Aufklapper } from "@/components/ui/kit";
import type { EsutdOptionen } from "@/lib/data/esutd";

// Die Bedienung des Meldeprozesses (WMCNL-1447): Abschluss anlegen, Aenderung oder Beendigung anlegen,
// eine Meldung als gemeldet erfassen, wieder oeffnen oder entfernen. Pflichtangaben pruefen Anwendung
// und Datenbank, die Formulare verlangen sie nur als Hinweis.

export function EsutdAbschlussFormular({ pfluecker }: { pfluecker: EsutdOptionen["pfluecker"] }) {
  const t = useTranslations("esutdAnsicht.neu.abschluss");
  const { status, formProps } = useBehalteEingaben(esutdVertragAnlegen);
  return (
    <FormularKarte titel={t("titel")}>
      {pfluecker.length === 0 ? <p className="text-xs text-muted-foreground">{t("keinePersonen")}</p> : null}
      <form {...formProps} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PfadFeld />
        <Auswahl
          label={t("person")}
          name="pfluecker_id"
          required
          options={[{ wert: "", text: t("bitteWaehlen") }, ...pfluecker.map((p) => ({ wert: p.id, text: `${p.name} (${p.ausweis})` }))]}
        />
        <Feld label={t("beginn")} name="vertrag_beginn_am" type="date" required />
        <Feld label={t("unterschrift")} name="unterzeichnet_am" type="date" hinweis={t("unterschriftHinweis")} />
        <Feld label={t("nummer")} name="vertragsnummer" />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} status={status} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

/** Die Beschriftungen kommen fertig vom Server: eine Funktion laesst sich nicht an eine Client-Komponente uebergeben. */
export function EsutdEreignisFormular({ vertraege, artLabel }: { vertraege: { id: string; label: string }[]; artLabel: { aenderung: string; beendigung: string } }) {
  const t = useTranslations("esutdAnsicht.neu.ereignis");
  const { status, formProps } = useBehalteEingaben(esutdEreignisAnlegen);
  return (
    <FormularKarte titel={t("titel")}>
      {vertraege.length === 0 ? <p className="text-xs text-muted-foreground">{t("keineVertraege")}</p> : null}
      <form {...formProps} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <PfadFeld />
        <Auswahl label={t("vertrag")} name="vertrag_id" required options={vertraege.map((v) => ({ wert: v.id, text: v.label }))} />
        <Auswahl
          label={t("art")}
          name="art"
          required
          options={[
            { wert: "aenderung", text: artLabel.aenderung },
            { wert: "beendigung", text: artLabel.beendigung },
          ]}
        />
        <Feld label={t("datum")} name="ereignis_am" type="date" required />
        <div className="sm:col-span-2 lg:col-span-3">
          <Feld label={t("beschreibung")} name="beschreibung" />
        </div>
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} status={status} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

/** Erledigt: Meldedatum, optional Bestaetigungsnummer und Beleg aus dem Nachweisregister. */
export function EsutdErfassenFormular({
  quelle,
  id,
  heute,
  belege,
}: {
  quelle: "vertrag" | "ereignis";
  id: string;
  heute: string;
  belege: EsutdOptionen["belege"];
}) {
  const t = useTranslations("esutdAnsicht.aktion.erfassen");
  const { status, formProps } = useBehalteEingaben(esutdMeldungErfassen);
  return (
    <Aufklapper titel={t("titel")}>
      <form {...formProps} className="grid gap-2 p-4 sm:grid-cols-3">
        <PfadFeld />
        <input type="hidden" name="quelle" value={quelle} />
        <input type="hidden" name="id" value={id} />
        <Feld label={t("datum")} name="erfasst_am" type="date" required defaultValue={heute} />
        <Feld label={t("bestaetigung")} name="bestaetigung" />
        <Auswahl label={t("beleg")} name="beleg_dokument_id" options={[{ wert: "", text: t("keinBeleg") }, ...belege.map((b) => ({ wert: b.id, text: b.name }))]} />
        <p className="text-xs text-muted-foreground sm:col-span-3">{t("hinweis")}</p>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
          <SubmitKnopf label={t("knopf")} status={status} />
          <AktionsMeldung status={status} />
        </div>
      </form>
    </Aufklapper>
  );
}

export function EsutdOeffnenKnopf({ quelle, id }: { quelle: "vertrag" | "ereignis"; id: string }) {
  const t = useTranslations("esutdAnsicht.aktion");
  return <MiniAktion aktion={esutdMeldungOeffnen} felder={{ quelle, id }} label={t("oeffnen")} />;
}

export function EsutdEntfernenKnopf({ quelle, id }: { quelle: "vertrag" | "ereignis"; id: string }) {
  const t = useTranslations("esutdAnsicht.aktion");
  return <MiniAktion aktion={esutdMeldungEntfernen} felder={{ quelle, id }} label={t("entfernen")} warnend />;
}
