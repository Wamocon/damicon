"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Package, Snowflake, Timer, TriangleAlert } from "lucide-react";
import {
  arbeitszeitErfassen,
  kuehlmessungErfassen,
  steigeErfassen,
  steigeKontrollieren,
} from "@/lib/actions/nachweiskette";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, Feld, PfadFeld } from "@/components/db/formular-kit";
import { useOfflineFormular } from "@/components/db/use-offline-formular";
import { AusweisScanFeld } from "@/components/db/ausweis-scan-feld";
import type { PflueckerOption } from "@/lib/domain/ausweis-scan";

const knopf =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-bold text-foreground transition hover:bg-muted md:h-9 md:text-xs";

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

// Anforderung 2.10: Stichprobenkontrolle einer einzelnen Steige.
//
// Das Abnahmekriterium verlangt zweierlei, das sich widerspricht, wenn man es
// wortwoertlich in ein Formular uebersetzt: "ein Klick je Steige" und "eine
// Abweichung verlangt eine Begruendung". Deshalb zwei Wege statt eines
// Auswahlfelds - der Regelfall bleibt ein Klick, nur die Ausnahme fragt nach.
// Ein Auswahlfeld mit anschliessendem Absenden haette auch den Regelfall auf
// drei Handgriffe gebracht, und der ist am Sammelpunkt der haeufige.
//
// Kein Offline-Formular: Die Kontrolle braucht die Vier-Augen-Pruefung der
// Datenbank (steige_kontrolle_pruefen(), Migration 20261014000000), und die
// laesst sich auf dem Geraet nicht nachbilden. Eine offline gepufferte
// Kontrolle koennte beim spaeteren Abgleich abgewiesen werden, nachdem der
// Vorarbeiter sie laengst fuer erledigt haelt.
export function SteigeKontrollierenKnopf({ id, code }: { id: string; code: string }) {
  const [status, action] = useActionState(steigeKontrollieren, leer);
  const [fragtNachGrund, setFragtNachGrund] = useState(false);
  const t = useTranslations("nachweiskette");

  const kleinerKnopf =
    "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold transition";

  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-1">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />

      {fragtNachGrund ? (
        <>
          {/* Sichtbares Pflichtfeld statt stiller Ablehnung: required faengt den
              leeren Fall im Browser ab, die Server Action und der Trigger
              pruefen ihn noch einmal. */}
          <input
            type="text"
            name="begruendung"
            required
            autoFocus
            maxLength={500}
            placeholder={t("kontrolle.grundPlatzhalter")}
            aria-label={t("kontrolle.grundAria", { code })}
            className="h-7 w-48 rounded-lg border border-border bg-card px-2 text-[11px] text-foreground"
          />
          <button
            type="submit"
            name="befund"
            value="abweichung"
            className={`${kleinerKnopf} border-destructive text-destructive hover:bg-destructive/10`}
          >
            <TriangleAlert className="h-3 w-3" />
            {t("kontrolle.abweichungMelden")}
          </button>
          <button
            type="button"
            onClick={() => setFragtNachGrund(false)}
            className={`${kleinerKnopf} text-muted-foreground hover:text-foreground`}
          >
            {t("kontrolle.abbrechen")}
          </button>
        </>
      ) : (
        <>
          <button
            type="submit"
            name="befund"
            value="in_ordnung"
            className={`${kleinerKnopf} text-foreground hover:border-primary hover:text-primary`}
            aria-label={t("steigenKontrollierenAria", { code })}
          >
            <CheckCircle2 className="h-3 w-3" />
            {t("steigenKontrollieren")}
          </button>
          <button
            type="button"
            onClick={() => setFragtNachGrund(true)}
            className={`${kleinerKnopf} text-muted-foreground hover:border-destructive hover:text-destructive`}
            aria-label={t("kontrolle.abweichungAria", { code })}
          >
            <TriangleAlert className="h-3 w-3" />
            {t("kontrolle.abweichung")}
          </button>
        </>
      )}

      <AktionsMeldung status={status} />
    </form>
  );
}
