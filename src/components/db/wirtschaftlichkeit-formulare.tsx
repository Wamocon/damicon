"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  annahmenSetzen,
  istEntfernen,
  istErfassen,
  modellwerteUebernehmen,
  postenEntfernen,
  postenSpeichern,
  schwundNutzenUebernehmen,
  standFesthalten,
} from "@/lib/actions/wirtschaftlichkeit";
import { AktionsMeldung, Auswahl, Feld, MiniAktion, PfadFeld, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";
import type { Annahmen, Posten } from "@/lib/domain/wirtschaftlichkeit-erfassung";
import { rundeKaufmaennisch } from "@/lib/domain/runden";

// Die Bedienung der Erfassung (WMCNL-2470): Posten anlegen und aendern, Ist-Werte erfassen, Annahmen setzen, einen Stand
// festhalten und mit den Modellwerten beginnen. Die Pruefung der Eingaben macht die Server Action (und die Datenbank
// ein zweites Mal); die Formulare verlangen Pflichtfelder nur als Hinweis.

/** Zahl fuer ein Eingabefeld: ohne Gleitkommareste (0,12 mal 100 ergibt sonst 12,000000000000002). */
// Die Stellen sind eine Obergrenze fuer den Gleitkommafehler, nicht fuer die Genauigkeit der Eingabe: Ein Zins von 6,125 % erscheint als 6,125, nicht als 6,13. Sonst
// wuerde das Speichern ohne Aenderung den Wert veraendern (Pruefung PR #156, 15.10.2026).
const eingabeZahl = (wert: number | null, stellen = 4): string => (wert === null ? "" : String(rundeKaufmaennisch(wert, stellen)));

function WaehrungAuswahl({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations("wirtschaftlichkeitErfassung");
  return (
    <Auswahl
      label={t("form.waehrung")}
      name="waehrung"
      defaultValue={defaultValue}
      options={[
        { wert: "EUR", text: t("waehrung.EUR") },
        { wert: "KZT", text: t("waehrung.KZT") },
        { wert: "RUB", text: t("waehrung.RUB") },
      ]}
    />
  );
}

function HerkunftAuswahl({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  const t = useTranslations("wirtschaftlichkeitErfassung");
  return (
    <Auswahl
      label={label}
      name={name}
      defaultValue={defaultValue}
      options={[
        { wert: "belegt", text: t("herkunft.belegt") },
        { wert: "geschaetzt", text: t("herkunft.geschaetzt") },
      ]}
    />
  );
}

function KategorieAuswahl({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations("wirtschaftlichkeitErfassung");
  return (
    <Auswahl
      label={t("form.kategorie")}
      name="kategorie"
      defaultValue={defaultValue}
      options={[
        { wert: "schwund", text: t("kategorie.schwund") },
        { wert: "handarbeit", text: t("kategorie.handarbeit") },
        { wert: "audit", text: t("kategorie.audit") },
        { wert: "sonstiges", text: t("kategorie.sonstiges") },
      ]}
    />
  );
}

export function PostenFormular({ posten, heute }: { posten?: Posten; heute: string }) {
  const t = useTranslations("wirtschaftlichkeitErfassung");
  // Beim Aendern zeigt das Formular den gespeicherten Stand auch nach dem Speichern, beim Anlegen leert es sich.
  const { status, formProps } = useBehalteEingaben(postenSpeichern, posten ? "immer" : "fehler");
  const [art, setArt] = useState<string>(posten?.art ?? "investition");

  return (
    <form {...formProps} className="grid gap-2 p-4 sm:grid-cols-2">
      <PfadFeld />
      {posten ? <input type="hidden" name="id" value={posten.id} /> : null}
      <Auswahl
        label={t("form.art")}
        name="art"
        defaultValue={art}
        beiAenderung={setArt}
        options={[
          { wert: "investition", text: t("posten.art.investition") },
          { wert: "betrieb", text: t("posten.art.betrieb") },
          { wert: "nutzen", text: t("posten.art.nutzen") },
        ]}
      />
      {art === "nutzen" ? (
        <KategorieAuswahl defaultValue={posten?.art === "nutzen" ? posten.kategorie : "schwund"} />
      ) : (
        <Feld label={t("form.kategorie")} name="kategorie" required defaultValue={posten && posten.art !== "nutzen" ? posten.kategorie : ""} placeholder={t("form.kategorieBeispiel")} />
      )}
      <div className="sm:col-span-2">
        <Feld label={t("form.bezeichnung")} name="bezeichnung" required defaultValue={posten?.bezeichnung ?? ""} />
      </div>
      <Feld label={t("form.betrag")} name="betrag" required inputMode="decimal" defaultValue={eingabeZahl(posten?.betrag ?? null, 2)} />
      <WaehrungAuswahl defaultValue={posten?.waehrung ?? "EUR"} />
      <Feld label={t("form.datum")} name="datum" type="date" required defaultValue={posten?.datum ?? heute} />
      <HerkunftAuswahl name="herkunft" label={t("form.herkunft")} defaultValue={posten?.herkunft ?? "belegt"} />
      <div className="sm:col-span-2">
        <Feld label={t("form.notiz")} name="notiz" defaultValue={posten?.notiz ?? ""} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitKnopf label={posten ? t("form.speichern") : t("form.anlegen")} status={status} />
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}

export function PostenEntfernenKnopf({ id }: { id: string }) {
  const t = useTranslations("wirtschaftlichkeitErfassung");
  return <MiniAktion aktion={postenEntfernen} felder={{ id }} label={t("posten.entfernen")} warnend />;
}

export function IstEntfernenKnopf({ id }: { id: string }) {
  const t = useTranslations("wirtschaftlichkeitErfassung");
  return <MiniAktion aktion={istEntfernen} felder={{ id }} label={t("posten.entfernen")} warnend />;
}

export function ModellKnopf() {
  const t = useTranslations("wirtschaftlichkeitErfassung");
  return <MiniAktion aktion={modellwerteUebernehmen} felder={{}} label={t("modell.knopf")} />;
}

export function SchwundKnopf() {
  const t = useTranslations("wirtschaftlichkeitErfassung");
  return <MiniAktion aktion={schwundNutzenUebernehmen} felder={{}} label={t("schwund.knopf")} />;
}

export function IstFormular({ monat }: { monat: string }) {
  const t = useTranslations("wirtschaftlichkeitErfassung");
  const { status, formProps } = useBehalteEingaben(istErfassen);
  return (
    <form {...formProps} className="grid gap-2 p-4 sm:grid-cols-2">
      <PfadFeld />
      <Feld label={t("form.monat")} name="monat" type="month" required defaultValue={monat} />
      <KategorieAuswahl defaultValue="schwund" />
      <Feld label={t("form.betrag")} name="betrag" required inputMode="decimal" />
      <WaehrungAuswahl defaultValue="EUR" />
      <div className="sm:col-span-2">
        <Feld label={t("form.notiz")} name="notiz" />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitKnopf label={t("planIst.erfassen")} status={status} />
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}

export function AnnahmenFormular({ annahmen }: { annahmen: Annahmen }) {
  const t = useTranslations("wirtschaftlichkeitErfassung");
  const { status, formProps } = useBehalteEingaben(annahmenSetzen, "immer");
  const h = (schluessel: keyof Annahmen["herkunft"]) => annahmen.herkunft[schluessel] ?? "geschaetzt";
  return (
    <form {...formProps} className="grid gap-2 p-4 sm:grid-cols-2">
      <PfadFeld />
      <Feld label={t("annahmen.form.zins")} name="zins" required inputMode="decimal" defaultValue={eingabeZahl(annahmen.kalkulationszins * 100, 6)} />
      <HerkunftAuswahl name="herkunft_kalkulationszins" label={t("annahmen.form.herkunft")} defaultValue={h("kalkulationszins")} />
      <Feld label={t("annahmen.form.kursEur")} name="kurs_eur" required inputMode="decimal" defaultValue={eingabeZahl(annahmen.kurse.eurTenge)} />
      <Feld label={t("annahmen.form.kursRub")} name="kurs_rub" required inputMode="decimal" defaultValue={eingabeZahl(annahmen.kurse.rubTenge)} />
      <Feld label={t("annahmen.form.kursStichtag")} name="kurs_stichtag" type="date" required defaultValue={annahmen.kursStichtag} />
      <HerkunftAuswahl name="herkunft_kurs" label={t("annahmen.form.herkunft")} defaultValue={h("kurs")} />
      <div className="sm:col-span-2">
        <Feld label={t("annahmen.form.kursQuelle")} name="kurs_quelle" defaultValue={annahmen.kursQuelle ?? ""} />
      </div>
      <Feld label={t("annahmen.form.vollkosten")} name="vollkosten" inputMode="decimal" defaultValue={eingabeZahl(annahmen.vollkostenVorherTenge, 2)} />
      <HerkunftAuswahl name="herkunft_vollkosten" label={t("annahmen.form.herkunft")} defaultValue={h("vollkosten")} />
      <Feld label={t("annahmen.form.menge")} name="menge" inputMode="decimal" defaultValue={eingabeZahl(annahmen.vermarkteteMengeKg, 2)} hinweis={t("annahmen.form.mengeHinweis")} />
      <HerkunftAuswahl name="herkunft_menge" label={t("annahmen.form.herkunft")} defaultValue={h("menge")} />
      <Feld label={t("annahmen.form.wochenVon")} name="wochen_von" inputMode="decimal" defaultValue={eingabeZahl(annahmen.nutzenbeginnWochen?.von ?? null, 0)} />
      <Feld label={t("annahmen.form.wochenBis")} name="wochen_bis" inputMode="decimal" defaultValue={eingabeZahl(annahmen.nutzenbeginnWochen?.bis ?? null, 0)} />
      <HerkunftAuswahl name="herkunft_nutzenbeginn" label={t("annahmen.form.herkunft")} defaultValue={h("nutzenbeginn")} />
      <Feld label={t("annahmen.form.echtbetrieb")} name="echtbetrieb" type="month" defaultValue={annahmen.echtbetriebBeginn?.slice(0, 7) ?? ""} hinweis={t("annahmen.form.echtbetriebHinweis")} />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitKnopf label={t("form.speichern")} status={status} />
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}

export function StandFormular() {
  const t = useTranslations("wirtschaftlichkeitErfassung");
  const { status, formProps } = useBehalteEingaben(standFesthalten);
  return (
    <form {...formProps} className="grid gap-2 p-4 sm:grid-cols-2">
      <PfadFeld />
      <div className="sm:col-span-2">
        <Feld label={t("staende.name")} name="stand_name" required placeholder={t("staende.nameBeispiel")} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitKnopf label={t("staende.festhalten")} status={status} />
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}
