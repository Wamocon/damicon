"use client";

import { useTranslations } from "next-intl";
import { kontoAnlegen, kontoSperren } from "@/lib/actions/rollen";
import { AktionsMeldung, Auswahl, Feld, FormularKarte, PfadFeld, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";
import { ANLEGBARE_ROLLEN } from "@/lib/domain/rollen-zuweisung";

// Konten anlegen und sperren (15.10.2026), nur fuer die Administration. Das vorlaeufige Passwort eines neuen Kontos steht nur in der Antwort der Aktion.

export function KontoAnlegenFormular() {
  const t = useTranslations("rollenZuweisung.anlegen");
  const rollenT = useTranslations("roles");
  const { status, formProps } = useBehalteEingaben(kontoAnlegen);
  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form {...formProps} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PfadFeld />
        <Feld label={t("name")} name="name" required />
        <Feld label={t("email")} name="email" type="email" required />
        <Auswahl label={t("rolle")} name="rolle" required options={ANLEGBARE_ROLLEN.map((r) => ({ wert: r, text: rollenT(r) }))} />
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

/** Sperren braucht einen Grund, Entsperren nicht. Eingeklappt, damit die Zeile der Liste ruhig bleibt. */
export function KontoSperreFormular({ profilId, gesperrt }: { profilId: string; gesperrt: boolean }) {
  const t = useTranslations("rollenZuweisung.sperre");
  const { status, formProps } = useBehalteEingaben(kontoSperren, "immer");
  return (
    <details className="text-[11px]">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{gesperrt ? t("entsperren") : t("sperren")}</summary>
      <form {...formProps} className="mt-1.5 flex flex-wrap items-end gap-2">
        <PfadFeld />
        <input type="hidden" name="profil_id" value={profilId} />
        <input type="hidden" name="aktion" value={gesperrt ? "entsperren" : "sperren"} />
        {!gesperrt ? (
          <div className="w-56">
            <Feld label={t("grund")} name="grund" required />
          </div>
        ) : null}
        <SubmitKnopf label={gesperrt ? t("entsperrenKnopf") : t("sperrenKnopf")} variante="leise" status={status} />
        <div className="w-full">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </details>
  );
}
