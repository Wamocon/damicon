"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { stammdatenAktualisieren } from "@/lib/actions/stammdaten";
import { leer } from "@/lib/actions/status";
import { RECHTSFORMEN, nummernartFuer } from "@/lib/domain/rechtsform";
import type { StammdatenZeile } from "@/lib/domain/stammdaten";
import { AktionsMeldung, Auswahl, Feld, PfadFeld, SubmitKnopf } from "@/components/db/formular-kit";

// Ein Formular je Zeile (Anforderung E.11).
//
// ИИН und БИН sehen gleich aus - zwoelf Ziffern - und genau daraus entsteht
// der Fehler, den diese Anforderung verhindern soll. Die Zuordnung steht
// deshalb in der Auswahl selbst ("ТОО (БИН)", "КХ/ФХ (ИИН)"): wer die
// Rechtsform waehlt, liest im selben Moment, welche Nummer gefragt ist.
//
// Bewusst ohne Sofortpruefung im Browser: Das Formular-Kit arbeitet mit
// unkontrollierten Feldern, und es fuer ein einzelnes Formular auf React-State
// umzubauen waere Ueberbau. Die Server Action prueft dieselbe Regel und
// antwortet uebersetzt; darunter faengt der check-Constraint der Migration
// 20261021000000 auch den direkten Zugriff ab.

export function StammdatenZeileFormular({ zeile }: { zeile: StammdatenZeile }) {
  const [status, action] = useActionState(stammdatenAktualisieren, leer);
  const t = useTranslations("stammdatenAnsicht");

  return (
    <form action={action} className="space-y-2.5 rounded-xl border border-border bg-card p-4">
      <PfadFeld />
      <input type="hidden" name="id" value={zeile.id} />
      <input type="hidden" name="gruppe" value={zeile.gruppe} />

      <p className="text-sm font-semibold text-card-foreground">{zeile.name}</p>

      <Auswahl
        label={t("col.rechtsform")}
        name="rechtsform"
        defaultValue={zeile.rechtsform ?? ""}
        options={[
          { wert: "", text: t("rechtsformOffen") },
          ...RECHTSFORMEN.map((r) => ({
            wert: r,
            text: `${t(`rechtsform.${r}`)} (${t(`nummernart.${nummernartFuer(r)}`)})`,
          })),
        ]}
      />

      <Feld
        label={t("col.nummer")}
        name="identifikationsnummer"
        defaultValue={zeile.identifikationsnummer ?? ""}
        placeholder={t("nummerPlatzhalter")}
        inputMode="decimal"
      />

      <SubmitKnopf label={t("speichern")} variante="leise" />
      <AktionsMeldung status={status} />
    </form>
  );
}
