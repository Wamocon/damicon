import { getFormatter, getTranslations } from "next-intl/server";
import { Camera } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { FilterPillen, Section, textVerweisKlassen, type Ziel } from "@/components/ui/kit";
import { Blaettern, LeererZustand, ListenEintrag } from "@/components/ui/liste";
import { Listenfilter, type FilterFeld } from "@/components/ui/listen-filter";
import { LadeMelder, ListenInhalt } from "@/components/ui/lade-status";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { AufgabeAnlegenFormular } from "@/components/db/pflueckaufgaben-formulare";
import {
  AufgabenMarken,
  Fortschrittsbalken,
  istGegenZiel,
  qFaktor,
} from "@/components/db/pflueckaufgabe-anzeige";
import type { AuswahlOption } from "@/components/db/standort-formulare";
import { aktiveFilter, type ListenWerte, type Parameterwert } from "@/lib/listen/parameter";
import { zeitraumStufen } from "@/lib/listen/zeitraum";
import {
  fortschrittProzent,
  pflueckFilterSchluessel,
  statusFilter,
  type StatusFilter,
} from "@/lib/domain/pflueckaufgaben-liste";
import type { AufgabenSeite } from "@/lib/data/pflueckaufgaben-liste";
import type { AufgabeZeile, BrigadeOption } from "@/lib/data/pflueckaufgaben";
import type { Role } from "@/lib/rbac";

// Die Liste der Pflueckaufgaben mit Filterleiste und Neuanlage (WMCNL-2488).
// Die Karten behalten ihre bisherige Form (Entscheidung vom 24.09.2026):
// "nicht so gross" hiess weniger Eintraege auf einmal, nicht kleinere.

const pillenSchluessel: Record<StatusFilter, string> = {
  alle: "alle",
  "zu-erledigen": "zuErledigen",
  ueberfaellig: "ueberfaellig",
  belegpruefung: "belegpruefung",
  abgeschlossen: "abgeschlossen",
};

type Query = (aenderung: Record<string, Parameterwert>) => Record<string, string>;

export async function PflueckaufgabenListe({
  pfad,
  werte,
  standard,
  query,
  seite,
  brigaden,
  rolle,
  belegeSichtbar,
  neuanlage,
}: {
  pfad: string;
  werte: ListenWerte;
  standard: ListenWerte;
  /** Links auf diese Liste, gebaut in der Ansicht (listenQuery). */
  query: Query;
  seite: AufgabenSeite;
  brigaden: BrigadeOption[];
  rolle: Role | null;
  /** Ohne Leserecht auf Fotobelege entfaellt ihre Anzahl (darfBelegeSehen). */
  belegeSichtbar: boolean;
  /** Nur mit Recht zum Anlegen und mindestens einem freien Reihenblock. */
  neuanlage: { bloecke: AuswahlOption[] } | null;
}) {
  const [t, v, z, format] = await Promise.all([
    getTranslations("pflueckaufgabenDemo"),
    getTranslations("pflueckaufgabenVerwaltung"),
    getTranslations("liste.zeitraum"),
    getFormatter(),
  ]);

  const offen = typeof werte.aufgabe === "string" ? werte.aufgabe : null;

  const brigadeOptionen = [
    { wert: "alle", text: v("filter.brigadeAlle") },
    ...(rolle === "brigade" ? [{ wert: "meine", text: v("filter.brigadeMeine") }] : []),
    ...brigaden.map((brigade) => ({ wert: brigade.id, text: brigade.name })),
    { wert: "ohne", text: v("filter.brigadeOhne") },
  ];

  const felder: FilterFeld[] = [
    {
      typ: "suche",
      name: "suche",
      label: v("filter.suche"),
      platzhalter: v("filter.suchePlatzhalter"),
    },
    // Ohne lesbare Brigaden (Rolle erzeuger) gaebe es nichts zu waehlen.
    ...(brigaden.length > 0
      ? [
          {
            typ: "auswahl" as const,
            name: "brigade",
            label: v("filter.brigade"),
            optionen: brigadeOptionen,
          },
        ]
      : []),
    {
      typ: "zeitraum",
      name: "zeitraum",
      // "Faellig im Zeitraum": gefiltert wird nach der Faelligkeit, nicht
      // nach dem Anlagedatum.
      label: v("filter.zeitraum"),
      optionen: zeitraumStufen.map((stufe) => ({ wert: stufe, text: z(stufe) })),
      eigenWert: "eigen",
      von: { name: "von", label: z("von") },
      bis: { name: "bis", label: z("bis") },
    },
  ];
  const aktive = aktiveFilter(
    werte,
    standard,
    felder.map((feld) => feld.name),
  );
  const gefiltert = aktive > 0 || werte.status !== standard.status;
  // Alle Filter zurueck auf den Standard, die Auswahl bleibt offen.
  const ohneFilter = query(
    Object.fromEntries(pflueckFilterSchluessel.map((schluessel) => [schluessel, standard[schluessel]])),
  );

  const pillen = (
    <FilterPillen
      label={v("filter.status")}
      rollen
      vorladen={false}
      melder={<LadeMelder bereich="liste" className="right-1 top-1" />}
      eintraege={statusFilter.map((wert) => ({
        wert,
        text: v(`filter.${pillenSchluessel[wert]}`),
        anzahl: format.number(seite.zaehler[wert]),
      }))}
      aktiv={String(werte.status)}
      ziel={(wert) => ({ pathname: pfad, query: query({ status: wert }) })}
    />
  );

  return (
    <Section
      id="liste"
      title={t("listTitle")}
      description={t("listLead")}
      action={<DatenquelleBadge quelle={seite.quelle} />}
    >
      <div className="space-y-4">
        <Listenfilter
          pfad={pfad}
          werte={werte}
          standard={standard}
          filterSchluessel={pflueckFilterSchluessel}
          felder={felder}
          pillen={pillen}
          aktiveAnzahl={aktive}
        />

        {neuanlage ? (
          <AufgabeAnlegenFormular
            bloecke={neuanlage.bloecke}
            brigaden={brigaden.map((brigade) => ({ wert: brigade.id, text: brigade.name }))}
            pfad={pfad}
            query={query({ aufgabe: undefined, reiter: undefined })}
          />
        ) : null}

        <ListenInhalt>
          <p aria-live="polite" className="schrift-label text-muted-foreground tabular-nums">
            {v("liste.treffer", { anzahl: seite.gesamt })}
          </p>

          {seite.zeilen.length > 0 ? (
            <ul className="space-y-2">
              {seite.zeilen.map((aufgabe) => (
                <li key={aufgabe.id}>
                  <AufgabenKarte
                    aufgabe={aufgabe}
                    ziel={{ pathname: pfad, query: query({ aufgabe: aufgabe.id }) }}
                    aktiv={aufgabe.id === offen}
                    ersetzen={offen !== null}
                    belegeSichtbar={belegeSichtbar}
                  />
                </li>
              ))}
            </ul>
          ) : gefiltert ? (
            <LeererZustand
              titel={v("liste.leerGefiltertTitel")}
              text={v("liste.leerGefiltert")}
              aktion={
                <Link href={{ pathname: pfad, query: ohneFilter }} scroll={false} className={textVerweisKlassen}>
                  {v("liste.filterZuruecksetzen")}
                </Link>
              }
            />
          ) : (
            <LeererZustand titel={v("liste.leerTitel")} text={v("liste.leerText")} />
          )}

          <Blaettern
            seite={seite.seite}
            seiten={seite.seiten}
            ziel={(nummer) => ({ pathname: pfad, query: query({ seite: nummer }), hash: "liste" })}
          />
        </ListenInhalt>
      </div>
    </Section>
  );
}

/** Eine Zeile der Liste: Code, Status, Brigade und Block, Mengen, Fortschritt. */
async function AufgabenKarte({
  aufgabe,
  ziel,
  aktiv,
  ersetzen,
  belegeSichtbar,
}: {
  aufgabe: AufgabeZeile;
  ziel: Ziel;
  aktiv: boolean;
  ersetzen: boolean;
  belegeSichtbar: boolean;
}) {
  const [t, v, format] = await Promise.all([
    getTranslations("pflueckaufgabenDemo"),
    getTranslations("pflueckaufgabenVerwaltung"),
    getFormatter(),
  ]);
  // Ohne Leserecht auf die Brigaden (erzeuger) fehlt der Name, obwohl die
  // Aufgabe zugeteilt ist - dann steht dort nichts statt "ohne Zuordnung".
  const brigade = aufgabe.brigadeId === null ? v("ohneBrigade") : aufgabe.brigade;
  const ort = [brigade, `${t("block")} ${aufgabe.reihenblock}`, aufgabe.sorte]
    .filter(Boolean)
    .join(" · ");

  return (
    <ListenEintrag id={aufgabe.id} ziel={ziel} aktiv={aktiv} ersetzen={ersetzen}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground">{aufgabe.code}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <AufgabenMarken status={aufgabe.status} faelligkeit={aufgabe.faelligkeit} />
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold text-card-foreground">{ort}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span>{istGegenZiel(format, aufgabe.istMengeKg, aufgabe.zielmengeKg)}</span>
        {belegeSichtbar ? (
          <span className="inline-flex items-center gap-1">
            <Camera className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">{v("panel.fotos")}</span>
            {aufgabe.belegAnzahl}
          </span>
        ) : null}
        {aufgabe.qualitaetsfaktor !== null ? (
          <span>
            {t("qFactor")} {qFaktor(format, aufgabe.qualitaetsfaktor)}
          </span>
        ) : null}
      </div>
      <div className="mt-2">
        <Fortschrittsbalken prozent={fortschrittProzent(aufgabe.istMengeKg, aufgabe.zielmengeKg)} />
      </div>
    </ListenEintrag>
  );
}
