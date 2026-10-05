"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Card, StatusPill } from "@/components/ui/kit";
import { AktionsMeldung, Auswahl, Feld, FormularKarte, PfadFeld, SubmitKnopf } from "@/components/db/formular-kit";
import { wissenDokumenteLaden, wissenDokumentHochladen, wissenDokumentLoeschen } from "@/lib/actions/wissen";
import { leer, type AktionsStatus } from "@/lib/actions/status";
import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";
import { bereichSchluessel, UPLOAD_BEREICHE, UPLOAD_ROLLEN } from "@/lib/wissen/upload-konstanten";

// Wissensverwaltung im KI-Panel (Einstellungen, unter dem Ratenlimit). Admin-only: Das Panel reicht das Element nur
// an Rollen mit ki_assistent:manage weiter, und beide Server Actions pruefen die Berechtigung noch einmal selbst.
// Die Liste wird erst beim Oeffnen der Ansicht geladen (nicht im Layout): Sie liest alle Textstellen der Wissensbasis.

export function WissenVerwaltung() {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");
  const [dokumente, setDokumente] = useState<WissenDokumentZeile[] | null>(null);
  const [ladefehler, setLadefehler] = useState(false);
  const [loeschMeldung, setLoeschMeldung] = useState<AktionsStatus>(leer);
  const [, starte] = useTransition();

  const lade = useCallback(() => {
    starte(async () => {
      const antwort = await wissenDokumenteLaden();
      setDokumente(antwort.dokumente);
      setLadefehler(antwort.fehler);
    });
  }, []);

  useEffect(() => {
    lade();
  }, [lade]);

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-4 text-muted-foreground">{t("lead")}</p>
      <WissenHochladenFormular beiErfolg={lade} />
      <div>
        <p className="mb-2 text-[11px] font-semibold text-card-foreground">{t("liste.titel")}</p>
        <AktionsMeldung status={loeschMeldung} />
        {ladefehler ? (
          <Card className="text-center text-xs text-destructive">{t("liste.fehler")}</Card>
        ) : dokumente === null ? (
          <Card className="text-center text-xs text-muted-foreground">{t("liste.laedt")}</Card>
        ) : dokumente.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("liste.leer")}</Card>
        ) : (
          <ul className="space-y-2">
            {dokumente.map((d) => (
              <WissenDokumentKarte key={d.schluessel} dokument={d} beiLoeschen={(status) => { setLoeschMeldung(status); lade(); }} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WissenDokumentKarte({ dokument, beiLoeschen }: { dokument: WissenDokumentZeile; beiLoeschen: (status: AktionsStatus) => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");
  const tRolle = useTranslations("roles");
  const format = useFormatter();
  const datum = dokument.datum && !Number.isNaN(Date.parse(dokument.datum))
    ? format.dateTime(new Date(dokument.datum), { dateStyle: "medium" })
    : t("liste.keinDatum");
  // Gespeichert ist "legal", angezeigt wird die Bezeichnung "Recht".
  const bereichKey = bereichSchluessel(dokument.bereich);
  const bereichName = (UPLOAD_BEREICHE as readonly string[]).includes(bereichKey)
    ? t(`bereich.${bereichKey}` as never)
    : dokument.bereich || t("liste.keinBereich");

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-black text-card-foreground">{dokument.titel}</p>
          <div className="flex shrink-0 gap-1.5">
            <StatusPill tone="info">{bereichName}</StatusPill>
            <StatusPill tone={dokument.herkunft === "upload" ? "success" : "neutral"}>
              {t(`herkunft.${dokument.herkunft}`)}
            </StatusPill>
          </div>
        </div>
        <dl className="mt-2 grid gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="inline font-semibold">{t("liste.rollen")}: </dt>
            <dd className="inline">{dokument.rollen.map((r) => tRolle(r as never)).join(", ") || "-"}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">{t("liste.datum")}: </dt>
            <dd className="inline">{datum}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">{t("liste.von")}: </dt>
            <dd className="inline">{dokument.hochgeladenVon ?? t("liste.vonSkript")}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">{t("liste.abschnitte")}: </dt>
            <dd className="inline">{dokument.chunks}</dd>
          </div>
        </dl>
        {/* Nur Uploads sind loeschbar. Skript-Dokumente haben keinen Knopf (und der Server lehnt sie ohnehin ab). */}
        {dokument.loeschbar ? (
          <WissenLoeschenKnopf dokument={dokument} bereichName={bereichName} beiErgebnis={beiLoeschen} />
        ) : null}
      </Card>
    </li>
  );
}

function WissenHochladenFormular({ beiErfolg }: { beiErfolg: () => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.formular");
  const tBereich = useTranslations("kiAssistentAnsicht.wissensVerwaltung.bereich");
  const tRolle = useTranslations("roles");
  const [status, action] = useActionState(wissenDokumentHochladen, leer);
  const zuletzt = useRef(status);

  // Nach einem erfolgreichen Upload die Liste neu laden (einmal je Rueckmeldung).
  useEffect(() => {
    if (status !== zuletzt.current && status.stand === "ok") beiErfolg();
    zuletzt.current = status;
  }, [status, beiErfolg]);

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2">
        <PfadFeld />
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[11px] font-semibold text-card-foreground">{t("datei")}</span>
          <input
            type="file"
            name="datei"
            required
            accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
          <span className="block text-[11px] text-muted-foreground">{t("dateiHinweis")}</span>
        </label>
        <Feld label={t("titelFeld")} name="titel" required placeholder={t("titelPlatzhalter")} />
        <Auswahl
          label={t("bereich")}
          name="bereich"
          required
          options={[
            { wert: "", text: t("bitteWaehlen") },
            ...UPLOAD_BEREICHE.map((b) => ({ wert: b, text: tBereich(b) })),
          ]}
        />
        <fieldset className="space-y-1 sm:col-span-2">
          <legend className="text-[11px] font-semibold text-card-foreground">{t("rollen")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {UPLOAD_ROLLEN.map((rolle) => (
              <label key={rolle} className="inline-flex items-center gap-1.5 text-xs text-card-foreground">
                {rolle === "admin" ? (
                  // Der Admin ist immer dabei: ein deaktiviertes Feld wird nicht gesendet, der Server ergaenzt ihn.
                  <input type="checkbox" checked disabled aria-describedby="wissen-admin-immer" />
                ) : (
                  <input type="checkbox" name="rollen" value={rolle} />
                )}
                {tRolle(rolle)}
              </label>
            ))}
          </div>
          <span id="wissen-admin-immer" className="block text-[11px] text-muted-foreground">
            {t("adminImmer")}
          </span>
        </fieldset>
        <div className="flex items-end sm:col-span-2">
          <SubmitKnopf label={t("knopf")} status={status} />
        </div>
        <div className="sm:col-span-2">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

// Loeschen mit Bestaetigungsfenster (natives <dialog>, modal: Tastatur und Fokus bleiben im Fenster, Esc bricht ab).
// Das Fenster nennt Titel, Bereich und Zahl der Abschnitte und warnt, dass es nicht rueckgaengig zu machen ist.
function WissenLoeschenKnopf({
  dokument,
  bereichName,
  beiErgebnis,
}: {
  dokument: WissenDokumentZeile;
  bereichName: string;
  beiErgebnis: (status: AktionsStatus) => void;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.loeschen");
  const [status, action] = useActionState(wissenDokumentLoeschen, leer);
  const dialog = useRef<HTMLDialogElement>(null);
  const zuletzt = useRef(status);

  // Nach der Antwort (Erfolg, "schon geloescht" oder Fehler): Fenster zu, Meldung und Neuladen beim Eltern-Element.
  useEffect(() => {
    if (status !== zuletzt.current && status.stand !== "leer") {
      dialog.current?.close();
      beiErgebnis(status);
    }
    zuletzt.current = status;
  }, [status, beiErgebnis]);

  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex h-7 items-center rounded-lg border border-destructive/30 px-2.5 text-[11px] font-semibold text-destructive transition hover:border-destructive"
      >
        {t("knopf")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`loeschen-titel-${dokument.schluessel}`}
        className="m-auto w-[min(92vw,28rem)] rounded-xl border border-border bg-card p-0 text-card-foreground backdrop:bg-black/50"
      >
        <form action={action} className="space-y-3 p-4">
          <PfadFeld />
          <input type="hidden" name="quelle_id" value={dokument.schluessel} />
          <h3 id={`loeschen-titel-${dokument.schluessel}`} className="text-sm font-black">
            {t("titel")}
          </h3>
          <dl className="space-y-0.5 text-xs">
            <div>
              <dt className="inline font-semibold">{t("dokument")}: </dt>
              <dd className="inline break-words">{dokument.titel}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">{t("bereich")}: </dt>
              <dd className="inline">{bereichName}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">{t("abschnitte")}: </dt>
              <dd className="inline">{dokument.chunks}</dd>
            </div>
          </dl>
          <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[0.06] p-2 text-xs font-semibold text-destructive">
            {t("warnung")}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold"
            >
              {t("abbrechen")}
            </button>
            <SubmitKnopf label={t("bestaetigen")} variante="leise" />
          </div>
        </form>
      </dialog>
    </div>
  );
}
