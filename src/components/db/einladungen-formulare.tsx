"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { KeyRound, Undo2 } from "lucide-react";
import { einladungErstellen, einladungZurueckziehen } from "@/lib/actions/einladungen";
import { leer, type AktionsStatus } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  SubmitKnopf,
} from "@/components/db/formular-kit";

// Formulare der Einladungsverwaltung (Anforderung E.20).

function PfadFeld() {
  const pfad = usePathname();
  return <input type="hidden" name="pfad" value={pfad} />;
}

/**
 * Anzeige des frisch erzeugten Codes. Bewusst gross, monospaced und mit
 * ausgeschriebenem Hinweis: Der Server kennt nur noch den Hash, diese Anzeige
 * ist die einzige Gelegenheit, den Code zu sichern. Ein Kopierknopf waere
 * bequemer, braucht aber Clipboard-Rechte, die im eingebetteten Browser des
 * Kunden nicht ueberall greifen - Markieren und Abschreiben funktioniert
 * immer.
 */
function CodeAnzeige({ status }: { status: AktionsStatus }) {
  const t = useTranslations("einladungenAnsicht.code");
  const locale = useLocale();
  if (status.stand !== "ok" || !status.wert) return null;

  // Der Code allein nuetzt dem Kunden nichts, wenn niemand ihm sagt, wo er
  // ihn eingibt: die Seite /einladung ist bewusst nirgends verlinkt. Die
  // Adresse wird hier ausgeschrieben und bewusst OHNE ?code=-Parameter -
  // ein Berechtigungsnachweis gehoert nicht in eine URL, die im Verlauf, in
  // Zugriffsprotokollen und im Service-Worker-Cache (public/sw.js) landet.
  const url =
    typeof window === "undefined"
      ? `/${locale}/einladung`
      : `${window.location.origin}/${locale}/einladung`;

  return (
    <div className="rounded-xl border border-success/30 bg-success/[0.06] p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-success">
        <KeyRound className="h-3.5 w-3.5" />
        {t("titel")}
      </p>
      <p className="mt-2 select-all break-all font-mono text-lg font-bold tracking-widest text-foreground">
        {status.wert}
      </p>
      <p className="mt-2 text-[11px] leading-4 text-foreground">{t("wo", { url })}</p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t("hinweis")}</p>
    </div>
  );
}

export function EinladungErstellenFormular({
  kunden,
}: {
  kunden: { wert: string; text: string }[];
}) {
  const [status, action] = useActionState(einladungErstellen, leer);
  const t = useTranslations("einladungenAnsicht.formular");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PfadFeld />
        <Auswahl label={t("kunde")} name="kundeId" options={kunden} required />
        <Feld label={t("name")} name="fullName" required />
        <Feld label={t("email")} name="email" type="email" required />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} />
        </div>
        <div className="space-y-2 sm:col-span-2 lg:col-span-4">
          {/* Die Erfolgsmeldung nennt den Code im Platzhalter; die Anzeige
              darunter wiederholt ihn gross. Beides zusammen, weil die kleine
              Statuszeile beim Abschreiben zu leicht zu uebersehen ist. */}
          <AktionsMeldung status={status} />
          <CodeAnzeige status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

function ZurueckziehenKnopf() {
  const { pending } = useFormStatus();
  const t = useTranslations("einladungenAnsicht");
  const a = useTranslations("aktionen");
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-destructive hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60 lg:h-8 lg:px-2.5 md:text-[11px]"
    >
      <Undo2 className="h-3 w-3" />
      {pending ? a("laeuft") : t("zurueckziehen")}
    </button>
  );
}

export function EinladungZurueckziehenKnopf({ id }: { id: string }) {
  const [status, action] = useActionState(einladungZurueckziehen, leer);

  return (
    <form action={action} className="space-y-1">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <ZurueckziehenKnopf />
      <AktionsMeldung status={status} />
    </form>
  );
}
