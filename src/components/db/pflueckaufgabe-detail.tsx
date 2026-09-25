import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { Reiter, StatusPill, type Tone } from "@/components/ui/kit";
import { Detailpanel } from "@/components/ui/detailpanel";
import { LadeMelder } from "@/components/ui/detailpanel-steuerung";
import { BelegUploadFormular } from "@/components/db/pflueckaufgaben-formulare";
import { NachweiskettenKarte } from "@/components/db/nachweiskette-ansicht";
import { FaelligkeitAnzeige } from "@/components/db/faelligkeit-anzeige";
import { PflueckaufgabeSchritt } from "@/components/db/pflueckaufgabe-schritt";
import { listenQuery, type Parameterwert } from "@/lib/listen/parameter";
import { aufgabenStatusMeta } from "@/lib/domain/pflueckaufgaben";
import { betriebsZeitzone } from "@/lib/domain/tageszeit";
import {
  pflueckFilterSchluessel,
  type PanelReiter,
} from "@/lib/domain/pflueckaufgaben-liste";
import type { AufgabeDetail } from "@/lib/data/pflueckaufgaben";
import type { Nachweiskette, PflueckerOption } from "@/lib/data/nachweiskette";

// Detailansicht einer Pflueckaufgabe (WMCNL-2488) mit drei Reitern:
// Uebersicht mit dem naechsten Schritt, Fotobelege, Nachweiskette. Vorher
// standen diese Teile als fuenf Karten dauerhaft in der rechten Haelfte der
// Seite.

type Werte = Readonly<Record<string, Parameterwert>>;

export async function PflueckaufgabeDetail({
  pfad,
  werte,
  standard,
  aufgabe,
  live,
  reiter,
  nachbarn,
  kette,
  pfluecker,
  rechte,
}: {
  pfad: string;
  werte: Werte;
  standard: Werte;
  /** null: nicht vorhanden oder fuer diese Rolle nicht lesbar. */
  aufgabe: AufgabeDetail | null;
  live: boolean;
  reiter: PanelReiter;
  nachbarn: { vorher?: string; nachher?: string };
  /** Nur geladen, wenn der Reiter Nachweiskette offen ist. */
  kette: Nachweiskette | null;
  pfluecker: PflueckerOption[];
  rechte: {
    darfHandeln: boolean;
    fremdeBrigade: boolean;
    darfAbschliessen: boolean;
    darfKontrollieren: boolean;
  };
}) {
  const [t, v, st, l, format] = await Promise.all([
    getTranslations("pflueckaufgabenDemo"),
    getTranslations("pflueckaufgabenVerwaltung"),
    getTranslations("aufgabenStatus"),
    getTranslations("liste.panel"),
    getFormatter(),
  ]);

  const query = (aenderung: Record<string, Parameterwert>) =>
    listenQuery({ werte, standard, aenderung, filterSchluessel: pflueckFilterSchluessel });
  const zurListe = {
    pathname: pfad,
    query: query({ aufgabe: undefined, reiter: undefined }),
    // Ohne Skript springt der Browser damit zurueck zum Eintrag.
    hash: aufgabe ? `eintrag-${aufgabe.id}` : "liste",
  };

  if (!aufgabe) {
    return (
      <Detailpanel
        titel={v("panel.nichtGefundenTitel")}
        schliessenZiel={zurListe}
        inhaltSchluessel="nicht-gefunden"
      >
        <p className="schrift-dense text-muted-foreground">{l("nichtGefunden")}</p>
      </Detailpanel>
    );
  }

  // Die Nachweiskette gibt es nur mit Datenbank; im Demo-Modus faellt ein
  // Link auf den Reiter auf die Uebersicht zurueck.
  const aktiv: PanelReiter = !live && reiter === "kette" ? "uebersicht" : reiter;
  const zuReiter = (wert: string) => ({ pathname: pfad, query: query({ reiter: wert }) });
  const zuAufgabe = (id: string | undefined) =>
    id ? { pathname: pfad, query: query({ aufgabe: id }) } : undefined;

  const fortschritt =
    aufgabe.zielmengeKg > 0
      ? Math.min(100, Math.round((aufgabe.istMengeKg / aufgabe.zielmengeKg) * 100))
      : 0;
  const kg = (wert: number) => `${format.number(wert, { maximumFractionDigits: 1 })} kg`;

  let inhalt;
  if (aktiv === "uebersicht") {
    const zeilen: [string, string][] = [
      [v("feld.brigade"), aufgabe.brigade || v("ohneBrigade")],
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
      [v("panel.ziel"), kg(aufgabe.zielmengeKg)],
      [v("panel.ist"), kg(aufgabe.istMengeKg)],
      [v("panel.ausschuss"), kg(aufgabe.ausschussKg)],
      [v("feld.pfluecker"), format.number(aufgabe.pflueckerAnzahl)],
      [
        t("qFactor"),
        aufgabe.qualitaetsfaktor === null
          ? "–"
          : format.number(aufgabe.qualitaetsfaktor, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
      ],
    ];
    // Ab 42rem zweispaltig: links die Angaben, rechts der naechste Schritt.
    // Angedockt ist die Detailansicht auf breiten Bildschirmen bis 60rem breit,
    // einspaltig stuenden die Teile dort nur weiter auseinander.
    inhalt = (
      <div className="@container/uebersicht">
        <div className="grid gap-4 @2xl/uebersicht:grid-cols-2 @2xl/uebersicht:items-start @2xl/uebersicht:gap-6">
          <div className="min-w-0 space-y-4">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 @xs/uebersicht:grid-cols-2">
              {zeilen.map(([name, wert]) => (
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
                <span>
                  {format.number(aufgabe.istMengeKg, { maximumFractionDigits: 1 })} /{" "}
                  {kg(aufgabe.zielmengeKg)}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${fortschritt}%` }} />
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
            <PflueckaufgabeSchritt
              aufgabe={aufgabe}
              live={live}
              darfHandeln={rechte.darfHandeln}
              fremdeBrigade={rechte.fremdeBrigade}
              darfAbschliessen={rechte.darfAbschliessen}
              fotoZiel={zuReiter("fotos")}
            />
          </div>
        </div>
      </div>
    );
  } else if (aktiv === "fotos") {
    // Breit: Bilder zu zweit nebeneinander, Hochladen und Hinweis in einer
    // schmalen Spalte daneben statt darunter.
    inhalt = (
      <div className="@container/fotos">
        <div className="grid gap-4 @2xl/fotos:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] @2xl/fotos:items-start @2xl/fotos:gap-6">
          {aufgabe.belege.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              {t("noProof")}
            </p>
          ) : (
            <div className="grid min-w-0 gap-3 @md/fotos:grid-cols-2">
              {aufgabe.belege.map((beleg, index) => (
                <figure
                  key={beleg.id}
                  className="overflow-hidden rounded-xl border border-border bg-muted/30"
                >
                  <div className="relative h-44 w-full">
                    <Image
                      src={beleg.bildUrl}
                      alt={beleg.hinweis}
                      fill
                      sizes="(min-width: 768px) 26rem, 100vw"
                      priority={index === 0}
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
            {live && rechte.darfHandeln ? (
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
  } else {
    inhalt = kette ? (
      <NachweiskettenKarte
        kette={kette}
        aufgabeId={aufgabe.id}
        pfluecker={pfluecker}
        darfErfassen={rechte.darfHandeln}
        darfKontrollieren={rechte.darfKontrollieren}
      />
    ) : (
      <p className="schrift-dense text-muted-foreground">{v("panel.ketteNurLive")}</p>
    );
  }

  return (
    <Detailpanel
      titel={v("panel.titel", { code: aufgabe.code })}
      kopfZusatz={
        <>
          <StatusPill tone={aufgabenStatusMeta[aufgabe.status].tone as Tone}>
            {st(aufgabe.status)}
          </StatusPill>
          {aufgabe.status !== "abgeschlossen" ? (
            <FaelligkeitAnzeige faelligkeit={aufgabe.faelligkeit} />
          ) : null}
        </>
      }
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
          eintraege={[
            { wert: "uebersicht", text: v("panel.uebersicht") },
            { wert: "fotos", text: v("panel.fotos"), anzahl: String(aufgabe.belegAnzahl) },
            ...(live ? [{ wert: "kette", text: v("panel.kette") }] : []),
          ]}
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
