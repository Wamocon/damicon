"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Camera, Check, Plus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import {
  aufgabeAnlegen,
  aufgabeStatusSetzen,
  belegHochladen,
  mengeMelden,
} from "@/lib/actions/pflueckaufgaben";
import { fehler, leer, ok, type AktionsStatus } from "@/lib/actions/status";
import { Aufklapper, Button } from "@/components/ui/kit";
import { QualitaetsReferenz } from "@/components/db/qualitaets-referenz";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  mitGeraetZeitstempel,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";
import { useOfflineFormular } from "@/components/db/use-offline-formular";
import { eintragen } from "@/lib/offline/warteschlange";
import { bildFuerWarteschlangeVerkleinern } from "@/lib/offline/bild";
import type { AktionTyp } from "@/lib/offline/db";
import type { AuswahlOption } from "@/components/db/standort-formulare";

// Neue Pflueckaufgabe, aufklappbar direkt ueber der Liste (Entscheidung vom
// 24.09.2026, WMCNL-2488; vorher ein Formular ganz unten auf der Seite).
// Der Aufklapper aus ui/kit.tsx in der Variante "aktion": ein <details>, ohne
// JavaScript bedienbar, und derselbe Baustein fuer die Neuanlage der
// uebrigen Module (WMCNL-2490).
//
// Gesperrte Reihenbloecke stehen gar nicht erst zur Wahl - und die Datenbank
// weist sie zusaetzlich ab (Trigger trg_pflueckaufgabe_sperre). Die
// Faelligkeit ist Pflicht, mit Datum und Uhrzeit in Betriebszeit Almaty; die
// Server-Aktion prueft das ebenfalls.
//
// Nach dem Anlegen klappt das Formular zu, und die neue Aufgabe oeffnet in der
// Detailansicht: die Brigade kann sie gleich annehmen, und wer plant, sieht
// sofort, ob Block und Brigade stimmen.
export function AufgabeAnlegenFormular({
  bloecke,
  brigaden,
  pfad,
  query,
}: {
  bloecke: AuswahlOption[];
  brigaden: AuswahlOption[];
  /** Pfad der Liste ohne Sprache. */
  pfad: string;
  /** Aktueller Zustand der Liste, die neue Aufgabe oeffnet darin. */
  query: Record<string, string>;
}) {
  const [status, action] = useActionState(aufgabeAnlegen, leer);
  const t = useTranslations("pflueckaufgabenVerwaltung");
  const router = useRouter();
  const aufklapper = useRef<HTMLDetailsElement>(null);
  const formular = useRef<HTMLFormElement>(null);
  const erledigt = useRef<string | null>(null);

  useEffect(() => {
    if (status.stand !== "ok" || !status.id || erledigt.current === status.id) return;
    erledigt.current = status.id;
    formular.current?.reset();
    if (aufklapper.current) aufklapper.current.open = false;
    const suche = new URLSearchParams({ ...query, aufgabe: status.id }).toString();
    router.push(`${pfad}?${suche}`, { scroll: false });
  }, [status, router, pfad, query]);

  return (
    <div className="space-y-2">
      <Aufklapper
        ref={aufklapper}
        titel={t("neu.titel")}
        symbol={<Plus className="h-4 w-4" aria-hidden="true" />}
        variante="aktion"
      >
        <div className="@container/neu">
          <p className="schrift-label text-muted-foreground">{t("neu.lead")}</p>
          <form
            ref={formular}
            action={action}
            className="mt-3 grid gap-2.5 @lg/neu:grid-cols-2 @3xl/neu:grid-cols-3"
          >
            <PfadFeld />
            <Auswahl label={t("feld.block")} name="reihenblock_id" options={bloecke} required />
            <Auswahl
              label={t("feld.brigade")}
              name="brigade_id"
              options={[{ wert: "", text: t("feld.ohneBrigade") }, ...brigaden]}
            />
            <Feld
              label={t("feld.faelligkeit")}
              name="faelligkeit"
              type="datetime-local"
              required
              hinweis={t("feld.faelligkeitHinweis")}
            />
            <Feld
              label={t("feld.zielmenge")}
              name="zielmenge_kg"
              inputMode="decimal"
              required
              placeholder="30"
            />
            <Feld
              label={t("feld.pfluecker")}
              name="pfluecker_anzahl"
              inputMode="decimal"
              placeholder="4"
            />
            <div className="flex items-end">
              <SubmitKnopf label={t("neu.knopf")} />
            </div>
          </form>
        </div>
      </Aufklapper>
      {/* Ausserhalb des Aufklappers: die Meldung bleibt sichtbar, wenn das
          Formular nach dem Anlegen zuklappt. */}
      <AktionsMeldung status={status} />
    </div>
  );
}

// Erntemenge melden - setzt die Aufgabe auf Belegpruefung.
export function MengeFormular({
  id,
  istMenge,
  ausschussKg,
  pflueckerAnzahl,
}: {
  id: string;
  istMenge: number;
  ausschussKg: number;
  pflueckerAnzahl: number;
}) {
  // Anforderung 2.5: online unveraendertes Verhalten, offline puffert der
  // Hook den Eintrag in IndexedDB statt die Server Action aufzurufen. Kein
  // eigenes Geraete-Zeitstempelfeld noetig (anders als bei den zeitkritischen
  // Nachweiskette-Formularen) - der Zeitpunkt des Einreihens reicht fuer die
  // Sync-Panel-Anzeige.
  const { status, action, onSubmit } = useOfflineFormular(
    mengeMelden,
    "menge_melden",
    null,
    ["id", "ist_menge_kg", "ausschuss_kg", "pfluecker_anzahl"],
  );
  const t = useTranslations("pflueckaufgabenVerwaltung");

  return (
    // Steht nur in der Detailansicht, deren Breite nicht am Fenster haengt:
    // die Spalten richten sich nach dem Formular selbst.
    <form action={action} className="@container/menge space-y-2.5" onSubmit={onSubmit}>
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-1 gap-2.5 @sm/menge:grid-cols-2 @lg/menge:grid-cols-3">
        <Feld
          label={t("feld.istMenge")}
          name="ist_menge_kg"
          inputMode="decimal"
          required
          defaultValue={String(istMenge)}
        />
        <Feld
          label={t("feld.ausschuss")}
          name="ausschuss_kg"
          inputMode="decimal"
          defaultValue={String(ausschussKg)}
        />
        <Feld
          label={t("feld.pfluecker")}
          name="pfluecker_anzahl"
          inputMode="decimal"
          defaultValue={String(pflueckerAnzahl)}
        />
      </div>
      <SubmitKnopf label={t("menge.knopf")} />
      <AktionsMeldung status={status} />
    </form>
  );
}

// Fotobeleg hochladen. Auf dem Telefon oeffnet capture="environment" direkt die
// Kamera - der Beleg entsteht dort, wo gepflueckt wird.
//
// Anforderung 2.5, Phase 6: passt nicht in useOfflineFormular() - das
// generische Muster liest jedes Warteschlangenfeld direkt als JSON-Wert aus
// dem FormData, eine Bilddatei ist aber weder JSON-serialisierbar noch ohne
// Weiteres puffergerecht (Handyfotos oft 5-15 MB). Deshalb eigene
// Offline-Verzweigung: die Datei wird vor dem Einreihen clientseitig
// verkleinert (bildFuerWarteschlangeVerkleinern(), Canvas-basiert) und als
// Blob mitgegeben.
export function BelegUploadFormular({ aufgabeId }: { aufgabeId: string }) {
  const [status, dispatch] = useActionState(belegHochladen, leer);
  const [lokalerStatus, setLokalerStatus] = useState<AktionsStatus | null>(null);
  const t = useTranslations("pflueckaufgabenVerwaltung");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    mitGeraetZeitstempel("geraet_zeitpunkt")(event);
    setLokalerStatus(null);

    if (typeof navigator === "undefined" || navigator.onLine) return;

    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const datei = formData.get("datei");
    if (!(datei instanceof File) || datei.size === 0) {
      setLokalerStatus(fehler("fehler.keineDatei"));
      return;
    }

    void bildFuerWarteschlangeVerkleinern(datei)
      .then((verkleinert) =>
        eintragen({
          aktionId: crypto.randomUUID(),
          aktionTyp: "beleg_hochladen",
          nutzlast: {
            aufgabe_id: aufgabeId,
            art: String(formData.get("art") ?? ""),
            hinweis: String(formData.get("hinweis") ?? ""),
          },
          geraetZeitpunkt: String(formData.get("geraet_zeitpunkt") ?? ""),
          datei: verkleinert,
        }),
      )
      .then(() => {
        setLokalerStatus(ok("ok.offlineEingereiht"));
        form.reset();
      });
  }

  return (
    <form action={dispatch} className="space-y-2.5" onSubmit={onSubmit}>
      <PfadFeld />
      <input type="hidden" name="aufgabe_id" value={aufgabeId} />
      {/* Anforderung 2.6: Moment der Aufnahme, nicht des Servereingangs. */}
      <input type="hidden" name="geraet_zeitpunkt" />
      <Auswahl
        label={t("feld.art")}
        name="art"
        options={[
          { wert: "schale", text: t("art.schale") },
          { wert: "reihenblock", text: t("art.reihenblock") },
          { wert: "steige", text: t("art.steige") },
        ]}
      />
      <QualitaetsReferenz />
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold text-card-foreground">
          {t("feld.datei")}
        </span>
        <input
          type="file"
          name="datei"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          required
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
        />
      </label>
      <Feld label={t("feld.hinweis")} name="hinweis" placeholder={t("feld.hinweisBeispiel")} />
      <button
        type="submit"
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-semibold text-foreground transition hover:bg-muted lg:h-9"
      >
        <Camera className="h-4 w-4" />
        {t("beleg.knopf")}
      </button>
      <AktionsMeldung status={lokalerStatus ?? status} />
    </form>
  );
}

// Statuswechsel der Aufgabe: annehmen, starten, abschliessen.
export function AufgabeStatusFormular({
  id,
  ziel,
  label,
  mitQualitaet = false,
}: {
  id: string;
  ziel: string;
  label: string;
  mitQualitaet?: boolean;
}) {
  // Anforderung 2.6: nur beim Start der Arbeit relevant - der Wechsel auf
  // in_arbeit startet die Kuehlkettenuhr, dafuer zaehlt der Moment auf dem
  // Feld, nicht der Moment, in dem die Anfrage beim Server ankommt.
  const brauchtGeraetZeit = ziel === "in_arbeit";
  // Anforderung 2.5, Phase 4: "annehmen" und "starten" sind Feld-Workflows,
  // offline-faehig. "abgeschlossen" (mitQualitaet) ist ein Buero/Leitung-
  // Vorgang - aktionTyp null haelt dieses eine Formular fuer diesen Fall
  // dauerhaft im Online-Pfad, ohne die Komponente aufzuspalten.
  const aktionTyp: AktionTyp | null =
    ziel === "angenommen" ? "aufgabe_annehmen" : ziel === "in_arbeit" ? "aufgabe_arbeit_starten" : null;

  const { status, action, onSubmit } = useOfflineFormular(
    aufgabeStatusSetzen,
    aktionTyp,
    brauchtGeraetZeit ? "arbeitsbeginn_geraet_zeitpunkt" : null,
    ["id"],
  );
  const t = useTranslations("pflueckaufgabenVerwaltung");

  return (
    <form action={action} className="space-y-2" onSubmit={onSubmit}>
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={ziel} />
      {brauchtGeraetZeit ? (
        <input type="hidden" name="arbeitsbeginn_geraet_zeitpunkt" />
      ) : null}
      {mitQualitaet ? (
        <Feld
          label={t("feld.qualitaet")}
          name="qualitaetsfaktor"
          inputMode="decimal"
          placeholder="1,05"
          defaultValue="1,00"
          required
        />
      ) : null}
      <Button type="submit" rundung="schmal" breit className="lg:h-9">
        <Check className="h-4 w-4" />
        {label}
      </Button>
      <AktionsMeldung status={status} />
    </form>
  );
}
