"use client";

import type { FormEvent, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { AktionsStatus } from "@/lib/actions/status";

// Kleine Bausteine fuer die Verwaltungsformulare der DB-gestuetzten Module.
// Bewusst schlicht gehalten: gleiche Hoehe, gleiche Radien wie im uebrigen
// Dashboard, keine eigene Formularbibliothek.

const feldKlassen =
  "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none transition focus:border-primary";

// WMC-Vibecode-Cleanup-Fund: bis hierher praktisch wortgleich in rund 15
// *-formulare.tsx-Dateien einzeln neu geschrieben (immer derselbe versteckte
// "pfad"-Pfad, den aktualisiere() in den jeweiligen Server Actions ausliest,
// um gezielt revalidatePath() aufzurufen). Jetzt eine einzige Stelle.
export function PfadFeld() {
  const pfad = usePathname();
  return <input type="hidden" name="pfad" value={pfad} />;
}

// Anforderung 2.6: bei zeitkritischen Aktionen (Pflueckbeginn, Kuehlmessung,
// Steigen-Scan) muss die lokale Geraeteuhr im Moment des Tippens in ein
// verstecktes Feld geschrieben werden - nicht die Serverzeit beim Eintreffen
// der Anfrage, die bei verzoegerter Synchronisierung (kein Netz im Feld) weit
// vom tatsaechlichen Ereignis abweichen kann. onSubmit statt onClick: laeuft
// synchron unmittelbar vor dem Absenden, auch bei Enter-Bestaetigung im
// Formular, nicht nur bei Klick auf den Knopf.
export function mitGeraetZeitstempel(feld: string) {
  return (event: FormEvent<HTMLFormElement>) => {
    const eingabe = event.currentTarget.elements.namedItem(feld);
    if (eingabe instanceof HTMLInputElement) {
      eingabe.value = new Date().toISOString();
    }
  };
}

export function Feld({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
  inputMode,
  form,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  inputMode?: "text" | "decimal";
  form?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold text-card-foreground">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        inputMode={inputMode}
        form={form}
        className={feldKlassen}
      />
    </label>
  );
}

export function Auswahl({
  label,
  name,
  options,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  options: { wert: string; text: string }[];
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold text-card-foreground">
        {label}
      </span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        className={feldKlassen}
      >
        {options.map((option) => (
          <option key={option.wert} value={option.wert}>
            {option.text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SubmitKnopf({
  label,
  variante = "primaer",
  form,
  pending: pendingProp,
}: {
  label?: string;
  variante?: "primaer" | "leise";
  // Nur gesetzt, wenn der Knopf ausserhalb des eigenen <form> steht (per
  // form-Attribut verknuepft) - dann greift useFormStatus() nicht, da es den
  // umschliessenden <form>-Vorfahren im Baum braucht, keine HTML-Verknuepfung
  // per form="...". Ohne form-Prop bleibt das bisherige Verhalten unveraendert.
  form?: string;
  pending?: boolean;
}) {
  const { pending: kontextPending } = useFormStatus();
  const pending = form ? (pendingProp ?? false) : kontextPending;
  const t = useTranslations("aktionen");
  const text = label ?? t("anlegen");

  return (
    <button
      type="submit"
      form={form}
      disabled={pending}
      className={
        variante === "primaer"
          ? "inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
          : "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition hover:border-primary disabled:opacity-60"
      }
    >
      {pending ? t("laeuft") : text}
    </button>
  );
}

export function AktionsMeldung({ status }: { status: AktionsStatus }) {
  const t = useTranslations("aktionen");
  if (status.stand === "leer" || !status.meldung) return null;

  const gut = status.stand === "ok";
  const Symbol = gut ? CheckCircle2 : AlertCircle;

  return (
    <p
      role="status"
      className={`flex items-start gap-1.5 rounded-lg border p-2 text-[11px] font-semibold leading-4 ${
        gut
          ? "border-success/25 bg-success/[0.08] text-success"
          : "border-destructive/25 bg-destructive/[0.06] text-destructive"
      }`}
    >
      <Symbol className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {t(status.meldung, { wert: status.wert ?? "" })}
    </p>
  );
}

export function FormularKarte({
  titel,
  beschreibung,
  children,
}: {
  titel: string;
  beschreibung?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-black text-card-foreground">{titel}</p>
      {beschreibung ? (
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          {beschreibung}
        </p>
      ) : null}
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}
