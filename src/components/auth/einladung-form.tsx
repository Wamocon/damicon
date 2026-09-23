"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, UserPlus } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Link } from "@/i18n/navigation";
import { einladungEinloesen } from "@/lib/actions/einladungen";
import { leer } from "@/lib/actions/status";
import { Button, knopfKlassen } from "@/components/ui/kit";

// Einloesen einer Kundeneinladung (Anforderung E.20). Oeffentlich erreichbar,
// ohne Anmeldung - der Code ist der Nachweis.

const feldKlassen =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary";

function SubmitKnopf() {
  const { pending } = useFormStatus();
  const t = useTranslations("einladungSeite");
  return (
    <Button type="submit" laedt={pending} breit>
      <UserPlus className="h-4 w-4" />
      {t("knopf")}
    </Button>
  );
}

export function EinladungForm() {
  const [status, action] = useActionState(einladungEinloesen, leer);
  const t = useTranslations("einladungSeite");
  const a = useTranslations("aktionen");

  // Nach dem Einloesen steht das Konto - ab hier fuehrt der Weg ueber die
  // regulaere Anmeldung. Das Formular verschwindet, damit niemand denselben
  // Code ein zweites Mal abschickt und die unspezifische Fehlermeldung
  // ("ungueltig") ihn an seinem Erfolg zweifeln laesst.
  if (status.stand === "ok") {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-xl border border-success/25 bg-success/[0.08] p-3 text-xs font-semibold leading-5 text-success">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {a(status.meldung ?? "", { wert: "" })}
        </p>
        <Link href="/login" className={knopfKlassen({ breit: true })}>
          {t("zurAnmeldung")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="code" className="text-xs font-semibold text-card-foreground">
          {t("code")}
        </label>
        <input
          id="code"
          name="code"
          type="text"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          className={`${feldKlassen} font-mono uppercase tracking-widest`}
        />
        <p className="text-[11px] leading-4 text-muted-foreground">{t("codeHinweis")}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-xs font-semibold text-card-foreground">
          {t("email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={feldKlassen}
        />
        <p className="text-[11px] leading-4 text-muted-foreground">{t("emailHinweis")}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="passwort" className="text-xs font-semibold text-card-foreground">
          {t("passwort")}
        </label>
        <input
          id="passwort"
          name="passwort"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={feldKlassen}
        />
        <p className="text-[11px] leading-4 text-muted-foreground">{t("passwortHinweis")}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="passwortWdh" className="text-xs font-semibold text-card-foreground">
          {t("passwortWdh")}
        </label>
        <input
          id="passwortWdh"
          name="passwortWdh"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={feldKlassen}
        />
      </div>

      {status.stand === "fehler" && status.meldung ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/[0.06] p-3 text-xs font-semibold leading-5 text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {a(status.meldung, { wert: status.wert ?? "" })}
        </p>
      ) : null}

      <SubmitKnopf />
    </form>
  );
}
