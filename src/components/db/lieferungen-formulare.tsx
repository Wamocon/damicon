"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Thermometer } from "lucide-react";
import {
  lieferungAnlegen,
  lieferungStornieren,
  transportMessungErfassen,
  uebergabeErfassen,
} from "@/lib/actions/lieferungen";
import { transportLoggerImportieren } from "@/lib/actions/logger-import";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, Auswahl, Feld, FormularKarte, PfadFeld, StornoKnopf, SubmitKnopf } from "@/components/db/formular-kit";
import type { AuswahlZeile } from "@/lib/domain/lieferungen";
import { formularZiel } from "@/lib/formular-ziele";

// Formulare der Uebergabequittung (Anforderung 3.5 Teil 2). Anlegen einer
// geplanten Lieferung wie finanzen-formulare.tsx, die Uebergabe selbst nach
// dem Geraete-Zeitstempel-Muster aus nachweiskette-formulare.tsx - bewusst
// ohne den vollen useOfflineFormular()-Apparat: die Uebergabequittung ist
// nicht Teil der Offline-Sync-Warteschlange (Anforderung 2.5), das waere ein
// eigener, hier nicht angeforderter Ausbauschritt.

function GeraetZeitpunktFeld() {
  return (
    <input
      type="hidden"
      name="geraet_zeitpunkt"
      ref={(el) => {
        if (el) el.value = new Date().toISOString();
      }}
    />
  );
}

const leerOption = { wert: "", text: "" };

export function LieferungAnlegenFormular({
  kunden,
  chargen,
}: {
  kunden: AuswahlZeile[];
  chargen: AuswahlZeile[];
}) {
  const [status, action] = useActionState(lieferungAnlegen, leer);
  const t = useTranslations("lieferungenAnsicht.formular.anlegen");

  return (
    <FormularKarte id={formularZiel.lieferung} titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PfadFeld />
        <Auswahl
          label={t("kunde")}
          name="b2b_kunde_id"
          required
          options={[
            { wert: leerOption.wert, text: t("bitteWaehlen") },
            ...kunden.map((k) => ({ wert: k.id, text: k.label })),
          ]}
        />
        <Feld label={t("menge")} name="menge_kg" inputMode="decimal" required />
        <Auswahl
          label={t("charge")}
          name="charge_id"
          options={[
            { wert: leerOption.wert, text: t("keinBezug") },
            ...chargen.map((c) => ({ wert: c.id, text: c.label })),
          ]}
        />
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

export function UebergabeErfassenFormular({
  lieferungId,
  kundeName,
}: {
  lieferungId: string;
  /** Kunde der Lieferung: der Hinweis nennt ihn, damit klar ist, wessen Person gemeint ist (WMCNL-2391). */
  kundeName: string;
}) {
  const [status, action] = useActionState(uebergabeErfassen, leer);
  const t = useTranslations("lieferungenAnsicht");

  return (
    <form action={action} className="mt-2 space-y-1.5 border-t border-border pt-2">
      <PfadFeld />
      <GeraetZeitpunktFeld />
      <input type="hidden" name="id" value={lieferungId} />
      <Feld
        label={t("empfaengerName")}
        name="empfaenger_name"
        required
        placeholder={t("empfaengerNamePlatzhalter")}
        hinweis={t("empfaengerHinweis", { kunde: kundeName })}
      />
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold text-card-foreground">{t("beleg")}</span>
        <input
          type="file"
          name="beleg"
          accept="image/jpeg,image/png,image/webp"
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
        />
      </label>
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:border-success hover:text-success"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t("uebergabeErfassen")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

// Transportphase-Temperaturmessung (Anforderung 3.2). Bewusst ein eigenes,
// minimales Formular statt Wiederverwendung von KuehlmessungFormular
// (nachweiskette-formulare.tsx): dort haengt die Messung an einer
// Pfleuckaufgabe, hier an einer Lieferung - andere Kernfunktion, anderer
// Geraete-Zeitstempel-Kontext. Bewusst ebenfalls ohne useOfflineFormular()
// (wie UebergabeErfassenFormular oben) - die Transportphase waere fachlich
// der naheliegendste Kandidat fuer die Offline-Warteschlange (Fahrzeug, oft
// ohne Netz), das ist aber ein eigener, hier nicht angeforderter
// Ausbauschritt (Anforderung 2.5), keine Voraussetzung fuer diese Funktion.
export function TransportMessungFormular({ lieferungId }: { lieferungId: string }) {
  const [status, action] = useActionState(transportMessungErfassen, leer);
  const t = useTranslations("lieferungenAnsicht");

  return (
    <form action={action} className="mt-2 space-y-1.5 border-t border-border pt-2">
      <PfadFeld />
      <GeraetZeitpunktFeld />
      <input type="hidden" name="lieferung_id" value={lieferungId} />
      <div className="flex items-end gap-2">
        <Feld
          label={t("transportTemperatur")}
          name="temperatur_c"
          inputMode="decimal"
          required
          placeholder="3,5"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary"
        >
          <Thermometer className="h-3.5 w-3.5" />
          {t("transportMessungErfassen")}
        </button>
      </div>
      <AktionsMeldung status={status} />
    </form>
  );
}

// Temperaturlogger-Datei importieren (WMCNL-1517, Stufe 1): die CSV-Datei des Loggers waehlen, die
// Messwerte kommen als Transportmessungen mit Herkunft "logger" in die Lieferung. Aufklappbar, damit
// die Karte der Lieferung schmal bleibt.
export function TransportLoggerFormular({ lieferungId }: { lieferungId: string }) {
  const [status, action] = useActionState(transportLoggerImportieren, leer);
  const t = useTranslations("lieferungenAnsicht.loggerImport");

  return (
    <details className="mt-2 border-t border-border pt-2">
      <summary className="cursor-pointer text-xs font-semibold text-primary">{t("titel")}</summary>
      <form action={action} className="mt-2 space-y-2">
        <PfadFeld />
        <input type="hidden" name="lieferung_id" value={lieferungId} />
        <label className="block space-y-1">
          <span className="schrift-label font-semibold text-card-foreground">{t("datei")}</span>
          <input
            type="file"
            name="datei"
            required
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
        </label>
        <Feld label={t("kennung")} name="logger_kennung" placeholder={t("kennungBeispiel")} hinweis={t("hinweis")} />
        <div className="flex flex-wrap items-center gap-3">
          <SubmitKnopf label={t("knopf")} status={status} />
          <AktionsMeldung status={status} />
        </div>
      </form>
    </details>
  );
}

export function LieferungStornierenKnopf({ lieferungId }: { lieferungId: string }) {
  const t = useTranslations("lieferungenAnsicht");
  return <StornoKnopf id={lieferungId} aktion={lieferungStornieren} label={t("stornieren")} />;
}
