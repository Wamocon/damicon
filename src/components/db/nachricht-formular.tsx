"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { nachrichtSenden } from "@/lib/actions/nachrichten";
import { AktionsMeldung, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";
import { NACHRICHT_MAX_ZEICHEN } from "@/lib/domain/nachrichten";
import { feldKlassen } from "@/components/ui/kit";

// Eine Nachricht zu einer Vorbestellung schreiben (WMCNL-1472). Nach einem Fehler
// bleibt der Text stehen, nach dem Senden leert sich das Feld.
export function NachrichtFormular({ vorbestellungId }: { vorbestellungId: string }) {
  const t = useTranslations("nachrichten");
  const pfad = usePathname();
  const { status, formProps } = useBehalteEingaben(nachrichtSenden);

  return (
    <form {...formProps} className="space-y-2">
      <input type="hidden" name="pfad" value={pfad} />
      <input type="hidden" name="vorbestellung_id" value={vorbestellungId} />
      <label className="block space-y-1">
        <span className="schrift-label font-semibold text-card-foreground">{t("feld")}</span>
        <textarea
          name="text"
          required
          rows={3}
          maxLength={NACHRICHT_MAX_ZEICHEN}
          placeholder={t("platzhalter")}
          className={`${feldKlassen} h-auto min-h-16 py-2`}
        />
        <span className="block schrift-label text-muted-foreground">{t("hinweis", { max: NACHRICHT_MAX_ZEICHEN })}</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitKnopf label={t("senden")} status={status} />
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}
