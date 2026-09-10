"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Package, Snowflake, Timer } from "lucide-react";
import {
  arbeitszeitErfassen,
  kuehlmessungErfassen,
  steigeErfassen,
  steigeKontrollieren,
} from "@/lib/actions/nachweiskette";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, Feld } from "@/components/db/formular-kit";
import { useOfflineFormular } from "@/components/db/use-offline-formular";
import { AusweisScanFeld } from "@/components/db/ausweis-scan-feld";
import type { PflueckerOption } from "@/lib/domain/ausweis-scan";

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
  pfluecker: PflueckerOption[];
}) {
  // Anforderung 2.5, Phase 5: online unveraendertes Verhalten, offline
  // puffert der Hook den Eintrag in IndexedDB statt die Server Action
  // aufzurufen. Die Steigen-Nummer bleibt dabei unbekannt, bis der Eintrag
  // tatsaechlich beim Server ankommt (Trigger steige_nummer_vergeben(),
  // Migration 20260915000000) - dieselbe "kein Ergebnis bis zur
  // Synchronisierung"-Erfahrung wie bei Kuehlmessung/Arbeitszeit, keine
  // eigene Vorab-Nummerierung noetig.
  const { status, action, onSubmit } = useOfflineFormular(
    steigeErfassen,
    "steige_erfassen",
    "geraet_zeitpunkt",
    ["aufgabe_id", "pfluecker_id", "gewicht_kg"],
  );
  const t = useTranslations("nachweiskette");

  return (
    <form action={action} className="space-y-2" onSubmit={onSubmit}>
      <PfadFeld />
      <input type="hidden" name="aufgabe_id" value={aufgabeId} />
      {/* Anforderung 2.6: Moment des Scans, nicht des Servereingangs. */}
      <input type="hidden" name="geraet_zeitpunkt" />
      <AusweisScanFeld name="pfluecker_id" pfluecker={pfluecker} />
      <Feld
        label={t("feld.gewicht")}
        name="gewicht_kg"
        inputMode="decimal"
        defaultValue="2"
      />
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
  pfluecker: PflueckerOption[];
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
      <AusweisScanFeld name="pfluecker_id" pfluecker={pfluecker} />
      <Feld label={t("feld.minuten")} name="minuten" inputMode="decimal" required placeholder="90" />
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

// Anforderung 2.10: Stichprobenkontrolle einer einzelnen Steige, ein Klick.
// Kein Offline-Formular - die Kontrolle ist ein Buero-/Leitungsvorgang, keine
// Feldtaetigkeit unter Netzausfall.
export function SteigeKontrollierenKnopf({ id, code }: { id: string; code: string }) {
  const [status, action] = useActionState(steigeKontrollieren, leer);
  const t = useTranslations("nachweiskette");

  return (
    <form action={action} className="inline-flex items-center gap-1">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition hover:border-primary hover:text-primary"
        aria-label={t("steigenKontrollierenAria", { code })}
      >
        <CheckCircle2 className="h-3 w-3" />
        {t("steigenKontrollieren")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}
