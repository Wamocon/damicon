"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Package, Snowflake, Timer } from "lucide-react";
import {
  arbeitszeitErfassen,
  kuehlmessungErfassen,
  steigeErfassen,
} from "@/lib/actions/nachweiskette";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  mitGeraetZeitstempel,
} from "@/components/db/formular-kit";
import { useOfflineFormular } from "@/components/db/use-offline-formular";
import type { AuswahlOption } from "@/components/db/standort-formulare";

function PfadFeld() {
  const pfad = usePathname();
  return <input type="hidden" name="pfad" value={pfad} />;
}

const knopf =
  "inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-xs font-bold text-foreground transition hover:bg-muted";

// Steige mit Person: der Vorgang, an dem die Kette bis zum Pflücker reicht.
export function SteigeFormular({
  aufgabeId,
  pfluecker,
}: {
  aufgabeId: string;
  pfluecker: AuswahlOption[];
}) {
  const [status, action] = useActionState(steigeErfassen, leer);
  const t = useTranslations("nachweiskette");

  return (
    <form
      action={action}
      className="space-y-2"
      onSubmit={mitGeraetZeitstempel("geraet_zeitpunkt")}
    >
      <PfadFeld />
      <input type="hidden" name="aufgabe_id" value={aufgabeId} />
      {/* Anforderung 2.6: Moment des Scans, nicht des Servereingangs. */}
      <input type="hidden" name="geraet_zeitpunkt" />
      <div className="grid grid-cols-2 gap-2">
        <Auswahl label={t("feld.pfluecker")} name="pfluecker_id" options={pfluecker} required />
        <Feld
          label={t("feld.gewicht")}
          name="gewicht_kg"
          inputMode="decimal"
          defaultValue="2"
        />
      </div>
      <button type="submit" className={knopf}>
        <Package className="h-4 w-4" />
        {t("steige.knopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

// Arbeitszeit: der Nenner der Pflückleistung in kg/h.
export function ArbeitszeitFormular({
  aufgabeId,
  pfluecker,
}: {
  aufgabeId: string;
  pfluecker: AuswahlOption[];
}) {
  // Anforderung 2.5: online unveraendertes Verhalten, offline puffert der
  // Hook den Eintrag in IndexedDB statt die Server Action aufzurufen.
  const { status, action, onSubmit } = useOfflineFormular(
    arbeitszeitErfassen,
    "arbeitszeit_erfassen",
    "geraet_zeitpunkt",
    ["aufgabe_id", "pfluecker_id", "minuten"],
  );
  const t = useTranslations("nachweiskette");

  return (
    <form action={action} className="space-y-2" onSubmit={onSubmit}>
      <PfadFeld />
      <input type="hidden" name="aufgabe_id" value={aufgabeId} />
      {/* Anforderung 2.6: Moment der Meldung, nicht des Servereingangs -
          sonst zeichnet eine verzoegert synchronisierte Meldung die
          Sync-Zeit statt der tatsaechlichen Arbeitszeit auf. */}
      <input type="hidden" name="geraet_zeitpunkt" />
      <div className="grid grid-cols-2 gap-2">
        <Auswahl label={t("feld.pfluecker")} name="pfluecker_id" options={pfluecker} required />
        <Feld label={t("feld.minuten")} name="minuten" inputMode="decimal" required placeholder="90" />
      </div>
      <button type="submit" className={knopf}>
        <Timer className="h-4 w-4" />
        {t("arbeitszeit.knopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

// Kühlmessung: Minuten und Urteil rechnet die Datenbank.
export function KuehlmessungFormular({ aufgabeId }: { aufgabeId: string }) {
  // Anforderung 2.5: online unveraendertes Verhalten, offline puffert der
  // Hook den Eintrag in IndexedDB statt die Server Action aufzurufen.
  const { status, action, onSubmit } = useOfflineFormular(
    kuehlmessungErfassen,
    "kuehlmessung_erfassen",
    "geraet_zeitpunkt",
    ["aufgabe_id", "temperatur_c"],
  );
  const t = useTranslations("nachweiskette");

  return (
    <form action={action} className="space-y-2" onSubmit={onSubmit}>
      <PfadFeld />
      <input type="hidden" name="aufgabe_id" value={aufgabeId} />
      {/* Anforderung 2.6: Moment der Messung, nicht des Servereingangs -
          sonst ist die 60-Minuten-Kennzahl bei verzoegerter Synchronisierung
          nicht verlaesslich. */}
      <input type="hidden" name="geraet_zeitpunkt" />
      <Feld
        label={t("feld.temperatur")}
        name="temperatur_c"
        inputMode="decimal"
        required
        placeholder="3,5"
      />
      <button type="submit" className={knopf}>
        <Snowflake className="h-4 w-4" />
        {t("kuehlung.knopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}
