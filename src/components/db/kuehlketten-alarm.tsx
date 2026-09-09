"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Snowflake, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusPill } from "@/components/ui/kit";

// Anforderung 3.1: die bisherige Kuehlketten-Bewertung urteilt ausschliesslich
// rueckblickend, beim Eintreffen einer Messung (kuehlkette_bewerten() in der
// Datenbank). Die Anforderung verlangt eine Warnung VOR Ablauf der
// 60-Minuten-Grenze, nicht erst danach. Ohne Push-/Cron-Infrastruktur im
// Projekt (siehe Masterplan-Audit: kein pg_cron, keine Benachrichtigungen)
// ist eine live mitlaufende, sich selbst aktualisierende Anzeige der
// verhaeltnismaessige Weg dahin: solange die Seite offen ist, zaehlt die
// Anzeige sichtbar herunter und eskaliert farblich, statt einen einmalig
// beim Serverrendering berechneten, sofort veraltenden Wert zu zeigen.
const GRENZE_MINUTEN = 60;
const WARN_AB_MINUTEN = 45;
const AKTUALISIERUNG_MS = 15_000;

function minutenSeit(zeitpunkt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(zeitpunkt).getTime()) / 60_000));
}

export function KuehlkettenAlarm({ pflueckZeitpunkt }: { pflueckZeitpunkt: string }) {
  const [vergangen, setVergangen] = useState(() => minutenSeit(pflueckZeitpunkt));
  const t = useTranslations("nachweiskette");

  useEffect(() => {
    const intervall = setInterval(
      () => setVergangen(minutenSeit(pflueckZeitpunkt)),
      AKTUALISIERUNG_MS,
    );
    return () => clearInterval(intervall);
  }, [pflueckZeitpunkt]);

  const ueberschritten = vergangen >= GRENZE_MINUTEN;
  const kritisch = !ueberschritten && vergangen >= WARN_AB_MINUTEN;
  const verbleibend = Math.max(0, GRENZE_MINUTEN - vergangen);

  const ton = ueberschritten ? "danger" : kritisch ? "warning" : "success";
  const Symbol = ueberschritten ? AlertTriangle : kritisch ? Timer : Snowflake;

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border p-3 ${
        ueberschritten
          ? "border-destructive/25 bg-destructive/[0.06]"
          : kritisch
            ? "border-warning/25 bg-warning/[0.08]"
            : "border-success/25 bg-success/[0.06]"
      }`}
      role="status"
      aria-live="polite"
    >
      <Symbol
        className={`h-4 w-4 shrink-0 ${
          ueberschritten
            ? "text-destructive"
            : kritisch
              ? "animate-pulse text-warning"
              : "text-success"
        }`}
      />
      <p className="text-xs font-black text-foreground">
        {ueberschritten
          ? t("kuehlung.fristUeberschritten", { minuten: vergangen - GRENZE_MINUTEN })
          : t("kuehlung.verbleibend", { minuten: verbleibend })}
      </p>
      <StatusPill tone={ton}>
        {ueberschritten
          ? t("kuehlung.alarm")
          : kritisch
            ? t("kuehlung.grenzwertig")
            : t("kuehlung.laeuft")}
      </StatusPill>
    </div>
  );
}
