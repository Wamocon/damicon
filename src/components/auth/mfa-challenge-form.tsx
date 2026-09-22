"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { mfaAnmeldenBestaetigen, type MfaChallengeStatus } from "@/app/[locale]/login/mfa/actions";
import { Button } from "@/components/ui/kit";

const initialStatus: MfaChallengeStatus = { fehler: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("auth.mfaChallenge");
  return (
    <Button type="submit" laedt={pending} breit>
      <ShieldCheck className="h-4 w-4" />
      {t("submit")}
    </Button>
  );
}

export function MfaChallengeForm({ weiter }: { weiter?: string }) {
  const [status, formAction] = useActionState(mfaAnmeldenBestaetigen, initialStatus);
  const locale = useLocale();
  const t = useTranslations("auth.mfaChallenge");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      {weiter ? <input type="hidden" name="weiter" value={weiter} /> : null}

      <div className="space-y-1.5">
        <label htmlFor="code" className="text-xs font-semibold text-card-foreground">
          {t("codeLabel")}
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          placeholder="123456"
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-center text-lg font-mono tracking-[0.3em] text-foreground outline-none transition focus:border-primary"
        />
      </div>

      {status.fehler ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/[0.06] p-3 text-xs font-semibold text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t(`error.${status.fehler}`)}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
