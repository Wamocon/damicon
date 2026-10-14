"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  abholrundeAbschliessen,
  abholrundeErstellen,
  abholrundeStarten,
  abholrundeVerwerfen,
  abholungErfassen,
  nachbarAdresseSetzen,
  stoppEntfaellt,
} from "@/lib/actions/abholrunden";
import { AktionsMeldung, Feld, FormularKarte, MiniAktion, PfadFeld, SubmitKnopf, mitGeraetZeitstempel, useBehalteEingaben } from "@/components/db/formular-kit";
import type { AbholStoppZeile, NachbarbetriebOption } from "@/lib/domain/abholrunden";

// Die Bedienung der Abholrunden (WMCNL-1577): planen (Buero), starten, Abholungen erfassen und die Ankunft im Kuehlhaus melden
// (Buero und Brigade). Zeiten kommen von der Uhr des Geraets und gehen mit; die Datenbank prueft sie auf Plausibilitaet.

export function NachbarAdresseFormular({ id, adresse }: { id: string; adresse: string | null }) {
  const t = useTranslations("abholrundenAnsicht.adresse");
  const { status, formProps } = useBehalteEingaben(nachbarAdresseSetzen, "immer");
  return (
    <form {...formProps} className="flex flex-wrap items-end gap-2.5">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <div className="w-64">
        <Feld label={t("label")} name="adresse" defaultValue={adresse ?? ""} placeholder={t("platzhalter")} required />
      </div>
      <SubmitKnopf label={t("knopf")} variante="leise" status={status} />
      <div className="w-full">
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}

export function AbholrundePlanenFormular({ betriebe, heute }: { betriebe: NachbarbetriebOption[]; heute: string }) {
  const t = useTranslations("abholrundenAnsicht.planen");
  const { status, formProps } = useBehalteEingaben(abholrundeErstellen);
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const formularId = "abholrunde-planen-formular";

  // Nach dem Anlegen setzt React das Formular zurueck; die gesteuerten Haken wuerden sonst gesetzt bleiben, obwohl das Feld leer ist.
  const [gesehen, setGesehen] = useState(status);
  if (status !== gesehen) {
    setGesehen(status);
    if (status.stand === "ok") setGewaehlt(new Set());
  }

  const umschalten = (id: string) =>
    setGewaehlt((bisher) => {
      const neu = new Set(bisher);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      {/* HTML erlaubt kein <form> im <form>: jeder Nachbarbetrieb ohne Anschrift zeigt sein eigenes Adressformular direkt in der
          Liste. Deshalb bleibt dieses <form> auf den Pfad beschraenkt, alle Felder haengen sich per form-Attribut ein. */}
      <form id={formularId} {...formProps}>
        <PfadFeld />
      </form>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <Feld label={t("datum")} name="datum" type="date" required defaultValue={heute} form={formularId} />
        <Feld label={t("fahrzeug")} name="fahrzeug" form={formularId} placeholder={t("fahrzeugBeispiel")} />
        <Feld label={t("notiz")} name="notiz" form={formularId} />
      </div>
      {betriebe.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("keineBetriebe")}</p>
      ) : (
        <ul className="space-y-1.5">
          {betriebe.map((b) => (
            <li key={b.id} className="rounded-lg border border-border p-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="betrieb_id" value={b.id} form={formularId} checked={gewaehlt.has(b.id)} onChange={() => umschalten(b.id)} />
                  <span className="font-semibold text-foreground">{b.name}</span>
                  {b.ort ? <span className="text-muted-foreground">{b.ort}</span> : null}
                </label>
                {gewaehlt.has(b.id) ? (
                  <div className="w-36">
                    <Feld label={t("menge")} name={`menge_${b.id}`} required inputMode="decimal" form={formularId} placeholder="100" />
                  </div>
                ) : null}
                {b.breitengrad === null ? <span className="text-[11px] text-warning">{t("keineKoordinaten")}</span> : null}
              </div>
              {b.breitengrad === null ? (
                <div className="mt-1.5">
                  <NachbarAdresseFormular id={b.id} adresse={b.adresse} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitKnopf label={t("knopf")} form={formularId} status={status} />
        <AktionsMeldung status={status} />
      </div>
    </FormularKarte>
  );
}

export function AbholrundeStartenKnopf({ id }: { id: string }) {
  const t = useTranslations("abholrundenAnsicht.aktion");
  return <MiniAktion aktion={abholrundeStarten} felder={{ id }} label={t("starten")} />;
}

export function AbholrundeVerwerfenKnopf({ id }: { id: string }) {
  const t = useTranslations("abholrundenAnsicht.aktion");
  return <MiniAktion aktion={abholrundeVerwerfen} felder={{ id }} label={t("verwerfen")} warnend />;
}

export function StoppEntfaelltKnopf({ stoppId }: { stoppId: string }) {
  const t = useTranslations("abholrundenAnsicht.aktion");
  return <MiniAktion aktion={stoppEntfaellt} felder={{ stopp_id: stoppId }} label={t("entfaellt")} warnend />;
}

export function AbholungFormular({ stopp }: { stopp: AbholStoppZeile }) {
  const t = useTranslations("abholrundenAnsicht.abholung");
  const { status, formProps } = useBehalteEingaben(abholungErfassen);
  return (
    <form {...formProps} onSubmit={mitGeraetZeitstempel("geraet_zeitpunkt")} className="grid gap-2 sm:grid-cols-2">
      <PfadFeld />
      <input type="hidden" name="stopp_id" value={stopp.id} />
      <input type="hidden" name="geraet_zeitpunkt" />
      <Feld label={t("menge")} name="menge_ist_kg" required inputMode="decimal" defaultValue={String(stopp.mengeGeplantKg)} />
      <Feld label={t("pflueckVor")} name="pflueck_vor_minuten" inputMode="decimal" hinweis={t("pflueckVorHinweis")} placeholder="30" />
      <div className="sm:col-span-2">
        <Feld label={t("bemerkung")} name="bemerkung" />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitKnopf label={t("knopf")} status={status} />
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}

export function AbholrundeAbschliessenFormular({ id, offen }: { id: string; offen: number }) {
  const t = useTranslations("abholrundenAnsicht.abschluss");
  const { status, formProps } = useBehalteEingaben(abholrundeAbschliessen);
  return (
    <form {...formProps} onSubmit={mitGeraetZeitstempel("geraet_zeitpunkt")} className="space-y-1.5">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="geraet_zeitpunkt" />
      {offen > 0 ? <p className="text-xs text-muted-foreground">{t("offen", { anzahl: offen })}</p> : <p className="text-xs text-muted-foreground">{t("bereit")}</p>}
      <SubmitKnopf label={t("knopf")} status={status} />
      <AktionsMeldung status={status} />
    </form>
  );
}
