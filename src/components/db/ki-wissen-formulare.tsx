"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { kiWissenDokumentHochladen, kiWissenDokumentLoeschen } from "@/lib/actions/ki-wissen";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Feld,
  FormularKarte,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";
import { Card, StatusPill } from "@/components/ui/kit";
import { alleRollen, type KiWissenDokumentZeile } from "@/lib/domain/ki-assistent";

// Verwaltung der Wissensdokumente (RAG-Ergaenzung zum KI-Assistenten,
// Anforderung 5.4/5.5) - dasselbe Layout-Muster wie KiAnbieterVerwaltung in
// ki-assistent-formulare.tsx (Karten-Grid + Anlegen-Formular darunter).
// Eigene Datei statt dort ergaenzt, weil beide Bereiche fachlich getrennt
// bleiben (Anbieter vs. Wissensbasis) und die Datei sonst unuebersichtlich
// wuerde.

export function KiWissenVerwaltung({ dokumente }: { dokumente: KiWissenDokumentZeile[] }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");

  return (
    <div className="space-y-3">
      {dokumente.length === 0 ? (
        <Card className="text-center text-xs text-muted-foreground">{t("keineDokumente")}</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {dokumente.map((d) => (
            <KiWissenDokumentKarte key={d.id} dokument={d} />
          ))}
        </div>
      )}
      <KiWissenHochladenFormular />
    </div>
  );
}

function KiWissenDokumentKarte({ dokument }: { dokument: KiWissenDokumentZeile }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");
  const s = useTranslations("kiAssistentAnsicht.wissensVerwaltung.status");
  const [status, action] = useActionState(kiWissenDokumentLoeschen, leer);
  const pfad = usePathname();

  const tone = dokument.status === "bereit" ? "success" : dokument.status === "fehler" ? "danger" : "info";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black text-card-foreground">{dokument.titel}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{dokument.dateiname}</p>
        </div>
        <StatusPill tone={tone}>{s(dokument.status)}</StatusPill>
      </div>
      {dokument.fehlermeldung ? (
        <p className="mt-1.5 text-[11px] text-destructive">{dokument.fehlermeldung}</p>
      ) : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t("rollen")}: {dokument.erlaubteRollen.join(", ")}
      </p>
      <form
        action={action}
        className="mt-3 border-t border-border pt-2.5"
        onSubmit={(event) => {
          if (!window.confirm(t("loeschenSicher", { titel: dokument.titel }))) event.preventDefault();
        }}
      >
        <PfadFeld />
        <input type="hidden" name="pfad" value={pfad} />
        <input type="hidden" name="id" value={dokument.id} />
        <button
          type="submit"
          className="inline-flex h-7 items-center rounded-lg border border-destructive/30 px-2.5 text-[11px] font-semibold text-destructive transition hover:border-destructive"
        >
          {t("loeschen")}
        </button>
      </form>
      <AktionsMeldung status={status} />
    </Card>
  );
}

function KiWissenHochladenFormular() {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.formular");
  const pfad = usePathname();
  const [status, action] = useActionState(kiWissenDokumentHochladen, leer);

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2">
        <PfadFeld />
        <input type="hidden" name="pfad" value={pfad} />
        <Feld label={t("dokumentTitel")} name="titel" required placeholder={t("titelPlatzhalter")} />
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-card-foreground">{t("datei")}</span>
          <input
            type="file"
            name="datei"
            required
            accept=".txt,.md,text/plain,text/markdown,application/pdf"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-[11px] font-semibold text-card-foreground">{t("rollenLabel")}</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
            {alleRollen.map((rolle) => (
              <label key={rolle} className="flex items-center gap-1.5 text-[11px] text-foreground">
                <input type="checkbox" name="erlaubte_rollen" value={rolle} />
                {rolle}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <SubmitKnopf label={t("knopf")} />
          <span className="text-[11px] text-muted-foreground">{t("hinweis")}</span>
        </div>
        <div className="sm:col-span-2">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}
