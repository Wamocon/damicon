"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { nachbarbetriebAnlegen, zukaufImportieren, zukaufPreisNachtragen } from "@/lib/actions/zukauf";
import { leerZukaufImport, type ZukaufImportStatus } from "@/lib/actions/zukauf-status";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Feld,
  FormularKarte,
  PfadFeld,
  SubmitKnopf,
  useBehalteEingaben,
} from "@/components/db/formular-kit";
import type { ZukaufBefund } from "@/lib/import/zukauf-parser";
import { formularZiel } from "@/lib/formular-ziele";

// Formulare des Aggregator-Zukaufs (WMCNL-1453): CSV-Import mit Befundliste,
// Preis nachtragen sobald die Rechnung des Nachbarbetriebs vorliegt.

const STUFE_SYMBOL = { fehler: AlertCircle, warnung: AlertTriangle, hinweis: Info } as const;
const STUFE_KLASSE = {
  fehler: "border-destructive/25 bg-destructive/[0.06] text-destructive",
  warnung: "border-warning/25 bg-warning/[0.08] text-warning",
  hinweis: "border-border bg-muted/40 text-muted-foreground",
} as const;

// Uebersetzt jeden Befund ueber `code` (siehe zukaufAnsicht.import.befund.*),
// nicht ueber das deutsche `meldung`-Feld aus dem Parser - das bleibt reines
// Server-Log-/Testmaterial (siehe Kommentar an ZukaufBefund).
function ZukaufBefundeListe({ befunde }: { befunde: ZukaufBefund[] }) {
  const t = useTranslations("zukaufAnsicht.import");

  if (befunde.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-card-foreground">{t("befundeTitle")}</p>
      <div className="space-y-1">
        {befunde.map((b, i) => {
          const Symbol = STUFE_SYMBOL[b.stufe];
          const spalte = b.spalte ? t(`spalte.${b.spalte}`) : t("spalteAllgemein");
          return (
            <p
              key={`${b.code}-${b.zeile ?? "-"}-${i}`}
              className={`flex items-start gap-1.5 rounded-lg border p-2 text-[11px] leading-4 ${STUFE_KLASSE[b.stufe]}`}
            >
              <Symbol className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {t(`befund.${b.code}`, {
                  spalte,
                  wert: b.wert ?? "",
                  zeile: b.zeile ?? 0,
                })}
              </span>
            </p>
          );
        })}
      </div>
    </div>
  );
}

// Nach einer bestandenen Pruefung bleibt der Text stehen, damit "Importieren"
// genau ihn uebernimmt. Nach dem Import und im Leerzustand wird er geleert.
function behalteNachPruefung(ergebnis: ZukaufImportStatus): boolean {
  return ergebnis.stand === "fehler" || ergebnis.vorschau === true;
}

export function ZukaufImportFormular({
  nachbarbetriebe,
  sorten,
}: {
  nachbarbetriebe: string[];
  sorten: string[];
}) {
  // Zwei Schritte (WMCNL-2378): erst pruefen, dann bewusst importieren. Der Text
  // bleibt nach einer Pruefung und nach einem Fehler stehen (WMCNL-2297-Muster);
  // nach dem Import leert sich das Feld.
  const { status, pending, formProps } = useBehalteEingaben(
    zukaufImportieren,
    behalteNachPruefung,
    leerZukaufImport,
  );
  const [verworfen, setVerworfen] = useState<typeof status | null>(null);
  const t = useTranslations("zukaufAnsicht.import");
  const at = useTranslations("aktionen");
  // "Importieren" gilt nur fuer den Text, der geprueft wurde: jede Aenderung
  // am Text macht die Vorschau ungueltig.
  const darfImportieren = status.vorschau === true && verworfen !== status;

  return (
    <FormularKarte id={formularZiel.zukauf} titel={t("titel")} beschreibung={t("lead")}>
      <form {...formProps} className="space-y-2.5">
        <PfadFeld />

        <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-[11px] leading-4 text-muted-foreground">
          <p>{t("hilfe")}</p>
          {nachbarbetriebe.length > 0 ? (
            <p className="mt-1">
              <span className="font-semibold text-foreground">{t("bekannteBetriebe")}: </span>
              {nachbarbetriebe.join(", ")}
            </p>
          ) : null}
          {sorten.length > 0 ? (
            <p className="mt-1">
              <span className="font-semibold text-foreground">{t("bekannteSorten")}: </span>
              {sorten.join(", ")}
            </p>
          ) : null}
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-card-foreground">{t("feldLabel")}</span>
          <textarea
            name="csv"
            required
            rows={6}
            placeholder={t("platzhalter")}
            onChange={() => setVerworfen(status)}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-2 font-mono text-xs text-foreground outline-none transition focus:border-primary"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <SubmitKnopf
            label={t("knopf")}
            variante={darfImportieren ? "leise" : "primaer"}
            status={status}
            pending={pending}
            name="schritt"
            wert="pruefen"
          />
          {darfImportieren ? (
            <SubmitKnopf
              label={t("importKnopf")}
              status={status}
              pending={pending}
              name="schritt"
              wert="importieren"
            />
          ) : null}
        </div>

        {status.stand !== "leer" && status.meldung ? (
          <p
            role="status"
            className={`flex items-start gap-1.5 rounded-lg border p-2 text-[11px] font-semibold leading-4 ${
              status.stand === "ok"
                ? "border-success/25 bg-success/[0.08] text-success"
                : "border-destructive/25 bg-destructive/[0.06] text-destructive"
            }`}
          >
            {status.stand === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            {at(status.meldung, { wert: status.wert ?? "" })}
          </p>
        ) : null}

        <ZukaufBefundeListe befunde={status.befunde} />
      </form>
    </FormularKarte>
  );
}

// Kompaktes Inline-Formular je Tabellenzeile, analog LohnStatusFormular -
// bewusst kein Feld-Baustein (voller Breite gedacht), sondern schmale Felder
// fuer eine einzelne Tabellenzelle.
export function ZukaufPreisNachtragenFormular({ id }: { id: string }) {
  const [status, action] = useActionState(zukaufPreisNachtragen, leer);
  const t = useTranslations("zukaufAnsicht.preisNachtragen");

  return (
    <form action={action} className="flex flex-wrap items-end gap-1.5">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <label className="block space-y-0.5">
        <span className="text-[10px] font-semibold text-muted-foreground">{t("preis")}</span>
        <input
          name="preis_tenge_kg"
          type="text"
          inputMode="decimal"
          required
          placeholder="0"
          className="h-7 w-20 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground outline-none transition focus:border-primary"
        />
      </label>
      <label className="block space-y-0.5">
        <span className="text-[10px] font-semibold text-muted-foreground">{t("rechnungsdatum")}</span>
        <input
          name="rechnungsdatum"
          type="date"
          className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground outline-none transition focus:border-primary"
        />
      </label>
      <button
        type="submit"
        className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-card px-2 text-[11px] font-bold text-foreground transition hover:border-primary"
      >
        {t("knopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

// Nachbarbetrieb aufnehmen (Aggregator). Bewusst neben dem Import-Formular:
// wer beim Import auf "unbekannter Betrieb" stoesst, legt ihn genau hier an
// und laedt die Datei erneut, ohne die Seite zu verlassen.
export function NachbarbetriebFormular() {
  const { status, pending, formProps } = useBehalteEingaben(nachbarbetriebAnlegen);
  const t = useTranslations("zukaufAnsicht.betriebAufnehmen");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form {...formProps} className="grid gap-2.5 sm:grid-cols-3">
        <PfadFeld />
        <Feld label={t("name")} name="name" required placeholder="Nachbarbetrieb Kaskelen" />
        <Feld label={t("ort")} name="ort" placeholder="Kaskelen" />
        <Feld label={t("kontakt")} name="kontakt" placeholder="+7 ..." />
        <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
          <SubmitKnopf label={t("knopf")} status={status} pending={pending} />
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}
