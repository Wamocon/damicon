"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { stammdatenAktualisieren } from "@/lib/actions/stammdaten";
import { RECHTSFORMEN, istRechtsform, nummernartFuer } from "@/lib/domain/rechtsform";
import type { StammdatenZeile } from "@/lib/domain/stammdaten";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  PfadFeld,
  SubmitKnopf,
  useBehalteEingaben,
} from "@/components/db/formular-kit";

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
//
// Die Eingaben bleiben nach dem Absenden stehen (useBehalteEingaben): eine
// abgelehnte Nummer muss sichtbar bleiben, damit man den Zahlendreher findet
// (WMCNL-2383), und die gespeicherte Rechtsform darf nicht auf "noch nicht
// erhoben" zurueckspringen (WMCNL-2310). Die Beschriftung des Nummernfelds
// folgt der gewaehlten Rechtsform (WMCNL-2307, WMCNL-2480): ИИН oder БИН, erst
// ohne Rechtsform steht der allgemeine Text.

export function StammdatenZeileFormular({ zeile }: { zeile: StammdatenZeile }) {
  const { status, pending, formProps } = useBehalteEingaben(stammdatenAktualisieren, "immer");
  const t = useTranslations("stammdatenAnsicht");
  const [rechtsform, setRechtsform] = useState(zeile.rechtsform ?? "");
  const nummernLabel = istRechtsform(rechtsform)
    ? t(`nummernart.${nummernartFuer(rechtsform)}`)
    : t("col.nummer");

  return (
    <form {...formProps} className="space-y-2.5 rounded-xl border border-border bg-card p-4">
      <PfadFeld />
      <input type="hidden" name="id" value={zeile.id} />
      <input type="hidden" name="gruppe" value={zeile.gruppe} />

      <p className="text-sm font-semibold text-card-foreground">{zeile.name}</p>

      <Auswahl
        label={t("col.rechtsform")}
        name="rechtsform"
        defaultValue={zeile.rechtsform ?? ""}
        beiAenderung={setRechtsform}
        options={[
          { wert: "", text: t("rechtsformOffen") },
          ...RECHTSFORMEN.map((r) => ({
            wert: r,
            text: `${t(`rechtsform.${r}`)} (${t(`nummernart.${nummernartFuer(r)}`)})`,
          })),
        ]}
      />

      <Feld
        label={nummernLabel}
        name="identifikationsnummer"
        defaultValue={zeile.identifikationsnummer ?? ""}
        placeholder={t("nummerPlatzhalter")}
        inputMode="decimal"
      />

      <SubmitKnopf label={t("speichern")} variante="leise" status={status} pending={pending} />
      <AktionsMeldung status={status} />
    </form>
  );
}
