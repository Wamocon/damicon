import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { Reiter, StatusPill, type Ziel } from "@/components/ui/kit";
import { Detailpanel } from "@/components/ui/detailpanel";
import { LadeMelder } from "@/components/ui/lade-status";
import { BelegUploadFormular } from "@/components/db/pflueckaufgaben-formulare";
import { NachweiskettenKarte } from "@/components/db/nachweiskette-ansicht";
import { PflueckaufgabeSchritt } from "@/components/db/pflueckaufgabe-schritt";
import {
  AufgabenMarken,
  Fortschrittsbalken,
  istGegenZiel,
  kg,
  qFaktor,
} from "@/components/db/pflueckaufgabe-anzeige";
import type { Parameterwert } from "@/lib/listen/parameter";
import { betriebsZeitzone } from "@/lib/domain/tageszeit";
import {
  fortschrittProzent,
  type PanelReiter,
  type PflueckRechte,
} from "@/lib/domain/pflueckaufgaben-liste";
import type { AufgabeDetail } from "@/lib/data/pflueckaufgaben";
import type { Nachweiskette, PflueckerOption } from "@/lib/data/nachweiskette";

// Detailansicht einer Pflueckaufgabe (WMCNL-2488) mit drei Reitern:
// Uebersicht mit dem naechsten Schritt, Fotobelege, Nachweiskette. Vorher
// standen diese Teile als fuenf Karten dauerhaft in der rechten Haelfte der
// Seite.

type Query = (aenderung: Record<string, Parameterwert>) => Record<string, string>;

export async function PflueckaufgabeDetail({
  pfad,
  query,
  aufgabe,
  ladefehler,
  live,
  reiter,
  nachbarn,
  kette,
  pfluecker,
  rechte,
  belegeSichtbar,
}: {
  pfad: string;
  /** Links auf diese Liste, gebaut in der Ansicht (listenQuery). */
  query: Query;
  /** null: nicht vorhanden, fuer diese Rolle nicht lesbar oder nicht ladbar. */
  aufgabe: AufgabeDetail | null;
  /** Die Datenbank hat mit einem Fehler geantwortet - nicht "nicht gefunden". */
  ladefehler: boolean;
  live: boolean;
  reiter: PanelReiter;
  nachbarn: { vorher?: string; nachher?: string };
  /** Nur geladen, wenn der Reiter Nachweiskette offen ist. */
  kette: Nachweiskette | null;
  pfluecker: PflueckerOption[];
  rechte: PflueckRechte;
  /** Ohne Leserecht auf Fotobelege entfaellt ihr Reiter (darfBelegeSehen). */
  belegeSichtbar: boolean;
}) {
  const [v, l] = await Promise.all([
    getTranslations("pflueckaufgabenVerwaltung"),
    getTranslations("liste.panel"),
  ]);

  const zurListe = {
    pathname: pfad,
    query: query({ aufgabe: undefined, reiter: undefined }),
    // Ohne Skript springt der Browser damit zurueck zum Eintrag.
    hash: aufgabe ? `eintrag-${aufgabe.id}` : "liste",
  };

  if (!aufgabe) {
    return (
      <Detailpanel
        titel={ladefehler ? v("panel.ladefehlerTitel") : v("panel.nichtGefundenTitel")}
        schliessenZiel={zurListe}
        inhaltSchluessel={ladefehler ? "ladefehler" : "nicht-gefunden"}
      >
        <p className="schrift-dense text-muted-foreground">
          {ladefehler ? l("ladefehler") : l("nichtGefunden")}
        </p>
      </Detailpanel>
    );
  }

  // Die Nachweiskette gibt es nur mit Datenbank, die Fotobelege nur mit
  // Leserecht; ein Link auf einen fehlenden Reiter faellt auf die Uebersicht.
  const vorhanden: PanelReiter[] = [
    "uebersicht",
    ...(belegeSichtbar ? (["fotos"] as const) : []),
    ...(live ? (["kette"] as const) : []),
  ];
  const aktiv: PanelReiter = vorhanden.includes(reiter) ? reiter : "uebersicht";
  const zuReiter = (wert: string) => ({ pathname: pfad, query: query({ reiter: wert }) });
  const zuAufgabe = (id: string | undefined) =>
    id ? { pathname: pfad, query: query({ aufgabe: id }) } : undefined;

  const inhalt =
    aktiv === "fotos" ? (
      <FotosReiter aufgabe={aufgabe} darfHochladen={rechte.handeln} />
    ) : aktiv === "kette" ? (
      kette ? (
        <NachweiskettenKarte
          kette={kette}
          aufgabeId={aufgabe.id}
          aufgabeStatus={aufgabe.status}
          pfluecker={pfluecker}
          darfErfassen={rechte.handeln}
          darfKontrollieren={rechte.kontrollieren}
        />
      ) : (
        <p className="schrift-dense text-muted-foreground">{v("panel.ketteNurLive")}</p>
      )
    ) : (
      <UebersichtReiter aufgabe={aufgabe} live={live} rechte={rechte} fotoZiel={zuReiter("fotos")} />
    );

  const reiterText: Record<PanelReiter, string> = {
    uebersicht: v("panel.uebersicht"),
    fotos: v("panel.fotos"),
    kette: v("panel.kette"),
  };

  return (
    <Detailpanel
      titel={v("panel.titel", { code: aufgabe.code })}
      kopfZusatz={<AufgabenMarken status={aufgabe.status} faelligkeit={aufgabe.faelligkeit} />}
      schliessenZiel={zurListe}
      vorher={zuAufgabe(nachbarn.vorher)}
      nachher={zuAufgabe(nachbarn.nachher)}
      reiter={
        <Reiter
          label={v("panel.reiterLabel")}
          dicht
          ersetzen
          vorladen={false}
          melder={<LadeMelder bereich="detailpanel" className="right-1 top-1" />}
          eintraege={vorhanden.map((wert) => ({
            wert,
            text: reiterText[wert],
            anzahl: wert === "fotos" ? String(aufgabe.belegAnzahl) : undefined,
          }))}
          aktiv={aktiv}
          ziel={zuReiter}
        />
      }
      inhaltSchluessel={`${aufgabe.id}:${aktiv}`}
    >
      {inhalt}
    </Detailpanel>
  );
}

// Ab 42rem zweispaltig: links die Angaben, rechts der naechste Schritt.
// Angedockt ist die Detailansicht auf breiten Bildschirmen bis 60rem breit,
// einspaltig stuenden die Teile dort nur weiter auseinander.
async function UebersichtReiter({
  aufgabe,
  live,
  rechte,
  fotoZiel,
}: {
  aufgabe: AufgabeDetail;
  live: boolean;
  rechte: PflueckRechte;
  fotoZiel: Ziel;
}) {
  const [t, v, format] = await Promise.all([
    getTranslations("pflueckaufgabenDemo"),
    getTranslations("pflueckaufgabenVerwaltung"),
    getFormatter(),
  ]);

  const angaben: [string, string][] = [
    [v("feld.brigade"), aufgabe.brigadeId === null ? v("ohneBrigade") : aufgabe.brigade || "–"],
    [v("feld.block"), aufgabe.reihenblock],
    [v("panel.sorte"), aufgabe.sorte || "–"],
    [
      v("panel.faellig"),
      aufgabe.faelligkeit
        ? format.dateTime(new Date(aufgabe.faelligkeit), {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: betriebsZeitzone,
          })
        : v("panel.ohneFaelligkeit"),
    ],
  ];
  const zahlen: [string, string][] = [
    [v("panel.ziel"), kg(format, aufgabe.zielmengeKg)],
    [v("panel.ist"), kg(format, aufgabe.istMengeKg)],
    [v("panel.ausschuss"), kg(format, aufgabe.ausschussKg)],
    [v("feld.pfluecker"), format.number(aufgabe.pflueckerAnzahl)],
    [t("qFactor"), qFaktor(format, aufgabe.qualitaetsfaktor)],
  ];

  return (
    <div className="@container/uebersicht">
      <div className="grid gap-4 @2xl/uebersicht:grid-cols-2 @2xl/uebersicht:items-start @2xl/uebersicht:gap-6">
        <div className="min-w-0 space-y-4">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 @xs/uebersicht:grid-cols-2">
            {angaben.map(([name, wert]) => (
              <div key={name} className="min-w-0">
                <dt className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
                  {name}
                </dt>
                <dd className="text-sm font-semibold text-card-foreground">{wert}</dd>
              </div>
            ))}
          </dl>
          <div>
            <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground tabular-nums">
              <span>{v("panel.fortschritt")}</span>
              <span>{istGegenZiel(format, aufgabe.istMengeKg, aufgabe.zielmengeKg)}</span>
            </div>
            <div className="mt-1.5">
              <Fortschrittsbalken
                prozent={fortschrittProzent(aufgabe.istMengeKg, aufgabe.zielmengeKg)}
                dick
              />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 @xs/uebersicht:grid-cols-3">
            {zahlen.map(([name, wert]) => (
              <div key={name} className="rounded-lg border border-border bg-card px-3 py-2">
                <dt className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
                  {name}
                </dt>
                <dd className="text-sm font-black text-card-foreground tabular-nums">{wert}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="min-w-0">
          <PflueckaufgabeSchritt aufgabe={aufgabe} live={live} rechte={rechte} fotoZiel={fotoZiel} />
        </div>
      </div>
    </div>
  );
}

// Breit: Bilder zu zweit nebeneinander, Hochladen und Hinweis in einer
// schmalen Spalte daneben statt darunter. 18rem passen die Formularfelder,
// die Qualitaetsreferenz rueckt dort in drei Spalten.
async function FotosReiter({
  aufgabe,
  darfHochladen,
}: {
  aufgabe: AufgabeDetail;
  darfHochladen: boolean;
}) {
  const [t, v, format] = await Promise.all([
    getTranslations("pflueckaufgabenDemo"),
    getTranslations("pflueckaufgabenVerwaltung"),
    getFormatter(),
  ]);

  return (
    <div className="@container/fotos">
      <div className="grid gap-4 @2xl/fotos:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] @2xl/fotos:items-start @2xl/fotos:gap-6">
        {aufgabe.belege.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {t("noProof")}
          </p>
        ) : (
          <div className="grid min-w-0 gap-3 @md/fotos:grid-cols-2">
            {aufgabe.belege.map((beleg) => (
              <figure
                key={beleg.id}
                className="overflow-hidden rounded-xl border border-border bg-muted/30"
              >
                <div className="relative h-44 w-full">
                  <Image
                    src={beleg.bildUrl}
                    // Der Hinweis steht darunter in der Bildunterschrift;
                    // als alt wuerde er doppelt vorgelesen.
                    alt=""
                    fill
                    // Signierte Storage-URLs und SVG-Platzhalter laufen beide
                    // nicht durch den Bildoptimierer.
                    unoptimized
                    className="object-cover"
                  />
                </div>
                <figcaption className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <StatusPill tone="info">{t(`art.${beleg.art}`)}</StatusPill>
                    <span className="schrift-label text-muted-foreground tabular-nums">
                      {format.dateTime(new Date(beleg.aufgenommen), {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: betriebsZeitzone,
                      })}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-foreground">{beleg.hinweis}</p>
                  {!beleg.hochgeladen ? (
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {v("platzhalterBild")}
                    </p>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <div className="min-w-0 space-y-4">
          {darfHochladen ? (
            <div className="border-t border-border pt-4 @2xl/fotos:border-t-0 @2xl/fotos:pt-0">
              <BelegUploadFormular aufgabeId={aufgabe.id} />
            </div>
          ) : null}
          <p className="rounded-xl bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
            {t("note")}
          </p>
        </div>
      </div>
    </div>
  );
}
