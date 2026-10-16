"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { nachrichtAnonymisieren } from "@/lib/actions/nachrichten";
import { AktionsMeldung, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";
import { ANONYMISIERUNG_GRUND_MAX } from "@/lib/domain/nachrichten";
import { feldKlassen } from "@/components/ui/kit";

// Eine Nachricht auf Anweisung anonymisieren (Datenschutz). Eingeklappt, damit sie nicht zum Alltag der Liste gehoert.
export function NachrichtAnonymisieren({ nachrichtId }: { nachrichtId: string }) {
  const t = useTranslations("nachrichten.anonymisieren");
  const pfad = usePathname();
  const { status, formProps } = useBehalteEingaben(nachrichtAnonymisieren);

  return (
    <details className="mt-1 text-[11px]">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t("knopf")}</summary>
      <form {...formProps} className="mt-2 space-y-2">
        <input type="hidden" name="pfad" value={pfad} />
        <input type="hidden" name="nachricht_id" value={nachrichtId} />
        <label className="block space-y-1">
          <span className="schrift-label font-semibold text-card-foreground">{t("grund")}</span>
          <input name="grund" required minLength={3} maxLength={ANONYMISIERUNG_GRUND_MAX} className={feldKlassen} />
        </label>
        <p className="schrift-label text-muted-foreground">{t("hinweis")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitKnopf label={t("bestaetigen")} variante="leise" status={status} />
          <AktionsMeldung status={status} />
        </div>
      </form>
    </details>
  );
}
