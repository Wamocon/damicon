"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { dokumentAendern, dokumentAnlegen } from "@/lib/actions/dokumente";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";
import type { DokumentZeile, NachweisOptionen } from "@/lib/data/dokumente";
import { WARNUNG_TAGE_MAX, WARNUNG_TAGE_MIN, WARNUNG_TAGE_STANDARD } from "@/lib/domain/nachweise";

const kategorien = [
  "spritzmittelprotokoll",
  "esutd_nachweis",
  "liefervertrag",
  "foerderdossier",
  "zertifikat",
  "sonstiges",
] as const;

/** Die Werte, mit denen das Formular beim Aendern vorbelegt wird. */
type Vorbelegung = Pick<
  DokumentZeile,
  | "gueltigVon"
  | "gueltigBis"
  | "unbefristet"
  | "warnungTage"
  | "verantwortlichId"
  | "rechtsgrundlage"
  | "partnerArt"
  | "partnerId"
>;

// Die Felder des Registers, die beim Anlegen und beim Aendern gleich sind:
// Gueltigkeit, Vorwarnzeit, Verantwortlicher, Rechtsgrundlage und Partner. Der
// Status steht nicht darunter, er folgt aus dem Zeitraum. Jedes Feld traegt
// seinen aktuellen Wert als key: aendert sich der Wert nach einem
// revalidatePath(), wird das Feld neu aufgebaut und zeigt nicht den Stand von
// vor dem Speichern.
function NachweisFelder({ werte, optionen }: { werte?: Vorbelegung; optionen: NachweisOptionen }) {
  const t = useTranslations("dokumenteVerwaltung");
  const partnerWert = werte?.partnerArt && werte.partnerId ? `${werte.partnerArt}:${werte.partnerId}` : "";
  return (
    <>
      <Feld key={`von-${werte?.gueltigVon ?? ""}`} label={t("feld.gueltigVon")} name="gueltig_von" type="date" defaultValue={werte?.gueltigVon ?? ""} />
      <Feld key={`bis-${werte?.gueltigBis ?? ""}`} label={t("feld.gueltigBis")} name="gueltig_bis" type="date" defaultValue={werte?.gueltigBis ?? ""} />
      <label className="flex items-end gap-2 pb-2 schrift-label font-semibold text-card-foreground">
        <input key={`unbef-${werte?.unbefristet}`} type="checkbox" name="unbefristet" defaultChecked={werte?.unbefristet ?? false} className="h-3.5 w-3.5" />
        {t("feld.unbefristet")}
      </label>
      <Feld
        key={`warn-${werte?.warnungTage ?? ""}`}
        label={t("feld.warnungTage")}
        name="warnung_tage"
        type="number"
        defaultValue={String(werte?.warnungTage ?? WARNUNG_TAGE_STANDARD)}
        hinweis={t("hinweis.warnungTage", { min: WARNUNG_TAGE_MIN, max: WARNUNG_TAGE_MAX })}
      />
      <Auswahl
        key={`verantw-${werte?.verantwortlichId ?? ""}`}
        label={t("feld.verantwortlich")}
        name="verantwortlich_id"
        defaultValue={werte?.verantwortlichId ?? ""}
        options={[{ wert: "", text: t("keinVerantwortlicher") }, ...optionen.verantwortliche.map((p) => ({ wert: p.id, text: p.label }))]}
      />
      <Auswahl
        key={`partner-${partnerWert}`}
        label={t("feld.partner")}
        name="partner"
        defaultValue={partnerWert}
        options={[{ wert: "", text: t("keinPartner") }, ...optionen.partner]}
      />
      <Feld key={`recht-${werte?.rechtsgrundlage ?? ""}`} label={t("feld.rechtsgrundlage")} name="rechtsgrundlage" defaultValue={werte?.rechtsgrundlage ?? ""} placeholder={t("beispiel.rechtsgrundlage")} />
    </>
  );
}

export function DokumentFormular({
  dossiers = [],
  optionen,
}: {
  /** Foerderdossiers zur Auswahl (Anforderung 4.12). Leer im Demo-Modus. */
  dossiers?: { id: string; bezeichnung: string }[];
  optionen: NachweisOptionen;
}) {
  const [status, action] = useActionState(dokumentAnlegen, leer);
  const pfad = usePathname();
  const t = useTranslations("dokumenteVerwaltung");
  const k = useTranslations("dokumentKategorie");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="pfad" value={pfad} />
        <Feld label={t("feld.name")} name="name" required placeholder={t("beispiel.name")} />
        <Auswahl label={t("feld.kategorie")} name="kategorie" options={kategorien.map((wert) => ({ wert, text: k(wert) }))} />
        <Feld label={t("feld.bezug")} name="bezug" placeholder="T-N-A-04" />
        <Feld label={t("feld.stand")} name="stand" type="date" />
        <NachweisFelder optionen={optionen} />
        {dossiers.length > 0 ? (
          <Auswahl
            label={t("feld.foerderdossier")}
            name="foerderdossier_id"
            options={[{ wert: "", text: t("keinDossier") }, ...dossiers.map((d) => ({ wert: d.id, text: d.bezeichnung }))]}
          />
        ) : null}
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-card-foreground">{t("feld.datei")}</span>
          <input
            type="file"
            name="datei"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
        </label>
        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-3">
          <SubmitKnopf label={t("knopf")} status={status} />
          <span className="text-[11px] text-muted-foreground">{t("dateiHinweis")}</span>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

// Aendern: Bezeichnung, Bezug, Stand und alle Felder des Registers eines
// vorhandenen Dokuments. Steht in einer aufklappbaren Zeile der Tabelle, mit
// eigener Rueckmeldung je Dokument. Die Datei bleibt unangetastet.
export function DokumentAendernFormular({
  dokument,
  optionen,
}: {
  dokument: Pick<DokumentZeile, "id" | "name" | "bezugRoh" | "stand"> & Vorbelegung & { bezug: string };
  optionen: NachweisOptionen;
}) {
  const [zustand, action] = useActionState(dokumentAendern, leer);
  const t = useTranslations("dokumenteVerwaltung");

  return (
    <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      <PfadFeld />
      <input type="hidden" name="id" value={dokument.id} />
      <Feld key={`name-${dokument.name}`} label={t("feld.name")} name="name" required defaultValue={dokument.name} />
      <Feld
        key={`bezug-${dokument.bezugRoh ?? ""}`}
        label={t("feld.bezug")}
        name="bezug"
        defaultValue={dokument.bezugRoh ?? ""}
        placeholder={dokument.bezugRoh ? undefined : dokument.bezug || undefined}
      />
      <Feld key={`stand-${dokument.stand ?? ""}`} label={t("feld.stand")} name="stand" type="date" defaultValue={dokument.stand ?? ""} />
      <NachweisFelder werte={dokument} optionen={optionen} />
      <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-3">
        <SubmitKnopf label={t("aendernKnopf")} status={zustand} />
        <AktionsMeldung status={zustand} />
      </div>
    </form>
  );
}
