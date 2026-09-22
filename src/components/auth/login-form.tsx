"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, LogIn } from "lucide-react";
import { anmelden, type AnmeldeStatus } from "@/app/[locale]/login/actions";
import { Button } from "@/components/ui/kit";

const initialStatus: AnmeldeStatus = { fehler: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("auth");
  return (
    <Button type="submit" laedt={pending} breit>
      <LogIn className="h-4 w-4" />
      {t("submit")}
    </Button>
  );
}

export function LoginForm({ weiter }: { weiter?: string }) {
  const [status, formAction] = useActionState(anmelden, initialStatus);
  const locale = useLocale();
  const t = useTranslations("auth");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      {weiter ? <input type="hidden" name="weiter" value={weiter} /> : null}

      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="text-xs font-semibold text-card-foreground"
        >
          {t("email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="leitung@damicon.demo"
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="passwort"
          className="text-xs font-semibold text-card-foreground"
        >
          {t("password")}
        </label>
        <input
          id="passwort"
          name="passwort"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary"
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
