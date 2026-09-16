"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { kundeAdresseAktualisieren, tourErstellen, tourLoeschen } from "@/lib/actions/tourenplanung";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, Feld, FormularKarte, PfadFeld, SubmitKnopf } from "@/components/db/formular-kit";
import type { LieferungOhneTour } from "@/lib/domain/tourenplanung";

// Formulare der Tourenplanung (Anforderung 3.5, Teil 1): Kundenadresse
// pflegen (wird beim Speichern automatisch geokodiert), Tour aus mehreren
// noch nicht zugeordneten Lieferungen bilden, Tour verwerfen.

export function KundeAdresseFormular({
  kundeId,
  adresse,
}: {
  kundeId: string;
  adresse: string | null;
}) {
  const [status, action] = useActionState(kundeAdresseAktualisieren, leer);
  const t = useTranslations("tourenplanungAnsicht.formular.adresse");

  return (
    <form action={action} className="flex flex-wrap items-end gap-2.5">
      <PfadFeld />
      <input type="hidden" name="id" value={kundeId} />
      <div className="w-64">
        <Feld label={t("label")} name="adresse" defaultValue={adresse ?? ""} placeholder={t("platzhalter")} required />
      </div>
      <SubmitKnopf label={t("knopf")} variante="leise" />
      <div className="w-full">
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}

export function TourErstellenFormular({ lieferungen }: { lieferungen: LieferungOhneTour[] }) {
  const [status, action, pending] = useActionState(tourErstellen, leer);
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  const t = useTranslations("tourenplanungAnsicht.formular.erstellen");
  const formularId = "tour-erstellen-formular";

  function umschalten(id: string) {
    setAusgewaehlt((bisher) => {
      const neu = new Set(bisher);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });
  }

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      {/* HTML erlaubt kein <form> im <form> - jede Lieferung ohne Adresse
          zeigt aber ihr eigenes KundeAdresseFormular (eigenes <form>) direkt
          in der Liste. Deshalb bleibt dieses <form> auf den Pfad-Hinweis
          beschraenkt, alle sichtbaren Feldelemente haengen sich per
          form-Attribut ein, statt DOM-Nachfahren zu sein. */}
      <form id={formularId} action={action}>
        <PfadFeld />
      </form>
      <div className="w-40">
        <Feld label={t("datum")} name="datum" type="date" required form={formularId} />
      </div>
      <ul className="space-y-1.5">
        {lieferungen.map((l) => (
          <li key={l.id} className="rounded-lg border border-border p-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="lieferung_id"
                value={l.id}
                form={formularId}
                checked={ausgewaehlt.has(l.id)}
                onChange={() => umschalten(l.id)}
                disabled={l.breitengrad === null || l.laengengrad === null}
              />
              <span className="font-semibold text-foreground">{l.kunde}</span>
              <span className="text-muted-foreground">{l.mengeKg} kg</span>
              {l.breitengrad === null ? (
                <span className="text-[11px] text-warning">{t("keineKoordinaten")}</span>
              ) : null}
            </label>
            {l.breitengrad === null ? (
              <div className="mt-1.5">
                <KundeAdresseFormular kundeId={l.kundeId} adresse={l.adresse} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <SubmitKnopf label={t("knopf")} form={formularId} pending={pending} />
      <AktionsMeldung status={status} />
    </FormularKarte>
  );
}

export function TourLoeschenFormular({ tourId }: { tourId: string }) {
  const [status, action] = useActionState(tourLoeschen, leer);
  const t = useTranslations("tourenplanungAnsicht");

  return (
    <form action={action}>
      <PfadFeld />
      <input type="hidden" name="id" value={tourId} />
      <button type="submit" className="text-[11px] font-semibold text-destructive hover:underline">
        {t("tourLoeschen")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}
