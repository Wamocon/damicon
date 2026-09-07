"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck, ShieldPlus, Trash2 } from "lucide-react";
import { mfaEnrollmentSchritt, mfaFaktorEntfernen } from "@/lib/actions/mfa";
import { mfaEnrollLeer, type MfaEnrollStatus } from "@/lib/domain/mfa";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, Feld, FormularKarte, SubmitKnopf } from "@/components/db/formular-kit";
import { Card, Section, StatusPill } from "@/components/ui/kit";

// Mehrfaktor-Authentifizierung (Anforderung 4.9, P0). Zwei getrennte
// useActionState-Formulare fuer den Enrollment-Ablauf: "Starten" liefert QR-
// Code und Secret aus Schritt 1 in seinen eigenen Status - "Bestaetigen"
// braucht diesen Status als verstecktes Feld, weil Supabase QR/Secret nach
// Schritt 1 nicht erneut herausgibt.

function EntfernenFormular({ faktorId, name }: { faktorId: string; name: string }) {
  const [status, action] = useActionState(mfaFaktorEntfernen, leer);
  const t = useTranslations("mfa");

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="faktor_id" value={faktorId} />
      <span className="flex-1 text-xs font-semibold text-foreground">{name}</span>
      <button
        type="submit"
        aria-label={t("entfernen")}
        title={t("entfernen")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-destructive transition hover:border-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

function EnrollmentFormular() {
  const [status, action] = useActionState<MfaEnrollStatus, FormData>(
    mfaEnrollmentSchritt,
    mfaEnrollLeer,
  );
  const t = useTranslations("mfa");

  if (status.schritt === "fertig") {
    return (
      <Card className="flex items-center gap-2 border-success/25 bg-success/[0.06] text-xs font-semibold text-success">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        {t("erfolg")}
      </Card>
    );
  }

  if (status.schritt === "qr" && status.qrCodeSvg && status.faktorId) {
    return (
      <FormularKarte titel={t("schrittZweiTitel")} beschreibung={t("schrittZweiLead")}>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- data:-URI von Supabase, kein optimierbares Asset */}
          <img
            src={status.qrCodeSvg}
            alt={t("qrAlt")}
            className="h-40 w-40 shrink-0 rounded-lg border border-border bg-white p-2"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[11px] leading-4 text-muted-foreground">{t("qrHinweis")}</p>
            <p className="rounded-lg bg-muted/50 px-2.5 py-1.5 font-mono text-[11px] break-all text-foreground">
              {status.secret}
            </p>
            <form action={action} className="flex items-end gap-2">
              <input type="hidden" name="faktor_id" value={status.faktorId} />
              <div className="flex-1">
                <Feld
                  label={t("codeLabel")}
                  name="code"
                  inputMode="decimal"
                  placeholder="123456"
                  required
                />
              </div>
              <SubmitKnopf label={t("bestaetigenKnopf")} />
            </form>
            {status.fehler ? (
              <AktionsMeldung status={{ stand: "fehler", meldung: status.fehler }} />
            ) : null}
          </div>
        </div>
      </FormularKarte>
    );
  }

  return (
    <form action={action}>
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition hover:border-primary"
      >
        <ShieldPlus className="h-4 w-4" />
        {t("hinzufuegenKnopf")}
      </button>
      {status.fehler ? (
        <div className="mt-2">
          <AktionsMeldung status={{ stand: "fehler", meldung: status.fehler }} />
        </div>
      ) : null}
    </form>
  );
}

export function MfaVerwaltung({
  bestehend,
}: {
  bestehend: { id: string; name: string }[];
}) {
  const t = useTranslations("mfa");

  return (
    <div className="space-y-6">
      <Section title={t("faktorenTitel")} description={t("faktorenLead")}>
        {bestehend.length === 0 ? (
          <Card className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{t("keinFaktor")}</span>
            <StatusPill tone="warning">{t("nichtGeschuetzt")}</StatusPill>
          </Card>
        ) : (
          <div className="space-y-2">
            {bestehend.map((f) => (
              <Card key={f.id} className="py-2.5">
                <EntfernenFormular faktorId={f.id} name={f.name} />
              </Card>
            ))}
          </div>
        )}
      </Section>

      <EnrollmentFormular />

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
