"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { MessageSquareWarning, Sparkles } from "lucide-react";
import { Card, StatusPill } from "@/components/ui/kit";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  SubmitKnopf,
} from "@/components/db/formular-kit";
import { kiEskalationAnfordern, kiNachrichtSenden } from "@/lib/actions/ki-assistent";
import {
  kiAnbieterAktivSetzen,
  kiAnbieterAnlegen,
  kiAnbieterLoeschen,
  kiAnbieterStandardSetzen,
} from "@/lib/actions/ki-anbieter";
import { leer } from "@/lib/actions/status";
import {
  kiAnbieterTypen,
  MAX_NACHRICHT_LAENGE,
  type KiAnbieterZeile,
  type KiChatNachrichtZeile,
} from "@/lib/domain/ki-assistent";

function PfadFeld() {
  const pfad = usePathname();
  return <input type="hidden" name="pfad" value={pfad} />;
}

// --- Chatfenster -------------------------------------------------------------

export function KiChatFenster({ verlauf }: { verlauf: KiChatNachrichtZeile[] }) {
  const t = useTranslations("kiAssistentAnsicht");
  const format = useFormatter();
  const [sendenStatus, sendenAction] = useActionState(kiNachrichtSenden, leer);
  const [eskalationStatus, eskalationAction] = useActionState(kiEskalationAnfordern, leer);
  const istErsteNachricht = verlauf.length === 0;

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-2.5 text-[11px] leading-4 text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("transparenzHinweis")}
      </p>

      <Card className="p-0">
        <div className="max-h-96 space-y-3 overflow-y-auto p-4">
          {verlauf.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">{t("keinVerlauf")}</p>
          ) : (
            verlauf.map((n) => {
              if (n.rolle === "system") {
                return (
                  <p
                    key={n.id}
                    className="mx-auto flex max-w-[90%] items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-center text-[11px] font-semibold text-warning"
                  >
                    <MessageSquareWarning className="h-3 w-3 shrink-0" />
                    {n.inhalt}
                  </p>
                );
              }
              return (
                <div
                  key={n.id}
                  className={n.rolle === "nutzer" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      n.rolle === "nutzer"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p>{n.inhalt}</p>
                    <p className="mt-1 text-[10px] opacity-70">
                      {n.rolle === "assistent" ? (n.fallback ? t("fallback.badge") : n.anbieterName) : null}{" "}
                      {format.dateTime(new Date(n.erstelltAm), { timeStyle: "short" })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form action={sendenAction} className="space-y-2 border-t border-border p-3">
          <PfadFeld />
          <div className="flex gap-2">
            <input
              name="nachricht"
              required
              maxLength={MAX_NACHRICHT_LAENGE}
              placeholder={t("inputPlaceholder")}
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <SubmitKnopf label={t("senden")} />
          </div>
          {istErsteNachricht ? (
            <label className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
              <input type="checkbox" name="einwilligung" required className="mt-0.5" />
              {t("einwilligungText")}
            </label>
          ) : null}
          <AktionsMeldung status={sendenStatus} />
        </form>
      </Card>

      <form action={eskalationAction} className="flex items-center gap-2">
        <PfadFeld />
        <button
          type="submit"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[11px] font-semibold text-foreground transition hover:border-primary"
        >
          <MessageSquareWarning className="h-3.5 w-3.5" />
          {t("eskalationKnopf")}
        </button>
        <AktionsMeldung status={eskalationStatus} />
      </form>
    </div>
  );
}

// --- Admin: Anbieterverwaltung ------------------------------------------------

export function KiAnbieterVerwaltung({ anbieter }: { anbieter: KiAnbieterZeile[] }) {
  const t = useTranslations("kiAssistentAnsicht.anbieterVerwaltung");
  const format = useFormatter();

  return (
    <div className="space-y-3">
      {anbieter.length === 0 ? (
        <Card className="text-center text-xs text-muted-foreground">{t("keineAnbieter")}</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {anbieter.map((a) => (
            <KiAnbieterZeileKarte key={a.id} anbieter={a} />
          ))}
        </div>
      )}
      <KiAnbieterAnlegenFormular />
      <Card className="bg-muted/30 text-[11px] leading-5 text-muted-foreground">{t("hinweis")}</Card>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {t("letzteAenderung", { datum: format.dateTime(new Date(), { dateStyle: "medium" }) })}
      </p>
    </div>
  );
}

// Vibecode-Cleanup: fasst die drei fast identischen Formulare (PfadFeld,
// versteckte id, ein Knopf) zusammen. Bewusst NUR das Formular-Markup
// zusammengefasst, nicht die useActionState-Aufrufe oder die Platzierung der
// AktionsMeldung - beides bleibt in KiAnbieterZeileKarte, damit sich am
// bestehenden Layout (drei Knoepfe nebeneinander, drei Meldungen darunter
// gestapelt) nichts aendert.
function AnbieterAktionsKnopf({
  action,
  anbieterId,
  zusatzFeld,
  label,
  destruktiv,
  bestaetigung,
}: {
  // Bereits an useActionState gebundener Dispatcher aus dem Aufrufer
  // (KiAnbieterZeileKarte), NICHT die rohe Server Action - siehe Kommentar
  // dort, wieso das der eigentliche useActionState-Aufruf bleibt.
  action: (payload: FormData) => void;
  anbieterId: string;
  zusatzFeld?: { name: string; wert: string };
  label: string;
  destruktiv?: boolean;
  bestaetigung?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={
        bestaetigung
          ? (event) => {
              if (!window.confirm(bestaetigung)) event.preventDefault();
            }
          : undefined
      }
    >
      <PfadFeld />
      <input type="hidden" name="id" value={anbieterId} />
      {zusatzFeld ? <input type="hidden" name={zusatzFeld.name} value={zusatzFeld.wert} /> : null}
      <button
        type="submit"
        className={
          destruktiv
            ? "inline-flex h-7 items-center rounded-lg border border-destructive/30 px-2.5 text-[11px] font-semibold text-destructive transition hover:border-destructive"
            : "inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[11px] font-semibold text-foreground transition hover:border-primary"
        }
      >
        {label}
      </button>
    </form>
  );
}

function KiAnbieterZeileKarte({ anbieter }: { anbieter: KiAnbieterZeile }) {
  const t = useTranslations("kiAssistentAnsicht.anbieterVerwaltung");
  const [aktivStatus, aktivAction] = useActionState(kiAnbieterAktivSetzen, leer);
  const [standardStatus, standardAction] = useActionState(kiAnbieterStandardSetzen, leer);
  const [loeschenStatus, loeschenAction] = useActionState(kiAnbieterLoeschen, leer);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black text-card-foreground">{anbieter.anzeigeName}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{anbieter.modell}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {anbieter.istStandard ? (
            <StatusPill tone="success">{t("standard")}</StatusPill>
          ) : null}
          <StatusPill tone={anbieter.aktiv ? "info" : "neutral"}>
            {anbieter.aktiv ? t("aktiv") : t("inaktiv")}
          </StatusPill>
        </div>
      </div>
      <p className="mt-2 truncate text-[11px] text-muted-foreground" title={anbieter.basisUrl}>
        {anbieter.basisUrl}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
        {!anbieter.istStandard ? (
          <AnbieterAktionsKnopf
            action={standardAction}
            anbieterId={anbieter.id}
            label={t("alsStandard")}
          />
        ) : null}
        <AnbieterAktionsKnopf
          action={aktivAction}
          anbieterId={anbieter.id}
          zusatzFeld={{ name: "aktiv", wert: (!anbieter.aktiv).toString() }}
          label={anbieter.aktiv ? t("deaktivieren") : t("aktivieren")}
        />
        <AnbieterAktionsKnopf
          action={loeschenAction}
          anbieterId={anbieter.id}
          label={t("loeschen")}
          destruktiv
          bestaetigung={t("loeschenSicher", { name: anbieter.anzeigeName })}
        />
      </div>
      <AktionsMeldung status={aktivStatus} />
      <AktionsMeldung status={standardStatus} />
      <AktionsMeldung status={loeschenStatus} />
    </Card>
  );
}

function KiAnbieterAnlegenFormular() {
  const t = useTranslations("kiAssistentAnsicht.anbieterVerwaltung.formular");
  // typOptionen liegt in messages/*.json eine Ebene hoeher, als Geschwister
  // von "formular" statt darunter - eigener, weiter gefasster Uebersetzer statt
  // eines falsch aufgeloesten Schluessels (t("typOptionen...") haette
  // "...formular.typOptionen..." gesucht, live im Browser als
  // MISSING_MESSAGE aufgefallen, von der statischen Pruefung nicht erkannt).
  const tTyp = useTranslations("kiAssistentAnsicht.anbieterVerwaltung");
  const [status, action] = useActionState(kiAnbieterAnlegen, leer);

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2">
        <PfadFeld />
        <Feld label={t("anzeigeName")} name="anzeige_name" required placeholder={t("anzeigeNamePlatzhalter")} />
        <Feld label={t("name")} name="name" required placeholder="sokrates-prod" />
        <Auswahl
          label={t("typ")}
          name="typ"
          required
          options={[
            { wert: "", text: t("bitteWaehlen") },
            ...kiAnbieterTypen.map((typ) => ({ wert: typ, text: tTyp(`typOptionen.${typ}`) })),
          ]}
        />
        <Feld label={t("modell")} name="modell" required placeholder={t("modellPlatzhalter")} />
        <Feld label={t("basisUrl")} name="basis_url" required placeholder="https://api.beispiel.kz/v1" />
        <Feld label={t("apiKey")} name="api_key" type="password" required />
        <div className="flex items-end sm:col-span-2">
          <SubmitKnopf label={t("knopf")} />
        </div>
        <div className="sm:col-span-2">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}
