"use client";

import { useTranslations } from "next-intl";
import { passwortAendern } from "@/lib/actions/passwort";
import { AktionsMeldung, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";
import { Card } from "@/components/ui/kit";
import { feldKlassen } from "@/components/ui/kit";
import { PASSWORT_MIN } from "@/lib/domain/rollen-zuweisung";

// Das eigene Passwort aendern. Bei einem vorlaeufigen Passwort (Konto von der Administration angelegt) steht oben ein Hinweis, dass es jetzt zu aendern ist.
export function PasswortAendern({ vorlaeufig }: { vorlaeufig: boolean }) {
  const t = useTranslations("passwort");
  const { status, formProps } = useBehalteEingaben(passwortAendern);
  return (
    <Card ton="box" className="space-y-3 p-5">
      <div>
        <h2 className="text-sm font-black text-card-foreground">{t("titel")}</h2>
        <p className="text-xs text-muted-foreground">{t("lead", { min: PASSWORT_MIN })}</p>
      </div>
      {vorlaeufig ? (
        <p role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">
          {t("vorlaeufig")}
        </p>
      ) : null}
      <form {...formProps} className="grid gap-2.5 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="schrift-label font-semibold text-card-foreground">{t("neu")}</span>
          <input name="neu" type="password" required minLength={PASSWORT_MIN} autoComplete="new-password" className={feldKlassen} />
        </label>
        <label className="block space-y-1">
          <span className="schrift-label font-semibold text-card-foreground">{t("wiederholung")}</span>
          <input name="wiederholung" type="password" required minLength={PASSWORT_MIN} autoComplete="new-password" className={feldKlassen} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <SubmitKnopf label={t("knopf")} status={status} />
          <AktionsMeldung status={status} />
        </div>
      </form>
    </Card>
  );
}
