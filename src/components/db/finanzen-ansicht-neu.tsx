import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ChevronDown } from "lucide-react";
import {
  Card,
  DataTable,
  FilterPillen,
  Reiter,
  Section,
  Stat,
  StatusPill,
  TabellenFuss,
  knopfKlassen,
} from "@/components/ui/kit";
import { Auswahl } from "@/components/db/formular-kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  BuchungErfassenFormularNeu,
  KostentraegerAnlegenFormularNeu,
} from "@/components/db/finanzen-formulare-neu";
import {
  ladeB2bKundeOptionen,
  ladeChargeOptionen,
  ladeFinanzenUebersicht,
  ladeKostentraegerOptionen,
  ladeReihenblockOptionen,
  ladeSorteOptionen,
} from "@/lib/data/finanzen";
import {
  ZEILEN_SCHRITT,
  finanzBereichAusText,
  finanzBereiche,
  istMonatsWert,
  ledgerTypAusText,
  zeilenAusText,
  zeitraumAusText,
  zeitraumStufen,
} from "@/lib/domain/finanzen";
import { getPathname } from "@/i18n/navigation";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import type { ReactNode } from "react";

// Entwurfsfassung der Finanzseite fuer /dashboard/finanz-labor. Die
// bestehende finanzen-ansicht.tsx bleibt unveraendert, bis dieser Entwurf sie
// ersetzt.
//
// Die alte Seite stapelte vier Abschnitte, zwei Formulare und drei Tabellen
// untereinander - die Kostentraegertabelle ohne jede Begrenzung, mit den
// Jahresdaten also rund 138 Zeilen zu acht Spalten am Stueck. Hier stehen die
// drei Tabellen in Reitern, ein Zeitraum begrenzt sie, und der Rest wird
// nachgeladen. Alles ueber die Adresszeile, damit die Seite Server Component
// bleibt.
//
// ZWEI DATEN, EIN FILTER. Die Buchungen haengen an buchungsdatum, die beiden
// Deckungsbeitragssichten am Erntetag. Derselbe gewaehlte Monat trifft also in
// den Reitern verschiedene Zeilen. Dazu kommt, dass die View
// deckungsbeitrag_je_kostentraeger ALLE Buchungen eines Kostentraegers
// summiert, unabhaengig vom Buchungsdatum: ein Filter nach Erntetag waehlt
// Kostentraeger aus, rechnet ihre Summen aber ueber die ganze Laufzeit.
// Umgerechnet wird deshalb nichts - stattdessen sagt die Beschriftung ueber
// den Pillen, welches Datum gerade gilt.

const ALLE = "alle";

/**
 * Aufklappbarer Abschnitt fuer die Erfassungsformulare.
 *
 * <details> statt eines eigenen Zustands: Das Formular soll den Blick auf die
 * Tabelle nicht verstellen, aber die Seite bleibt Server Component, und ohne
 * JavaScript muss das Aufklappen trotzdem gehen (DESIGN.md Regel 6). Das
 * Sidebar-Muster mit aria-expanded braucht beides nicht zu leisten, es laeuft
 * ohnehin im Browser.
 */
function Aufklapper({
  titel,
  beschreibung,
  children,
}: {
  titel: string;
  beschreibung?: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition duration-knapp hover:bg-muted/30 lg:min-h-9 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="schrift-dense font-black text-card-foreground">{titel}</span>
          {beschreibung ? (
            <span className="mt-0.5 block schrift-label text-muted-foreground">
              {beschreibung}
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground transition duration-knapp group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

export async function FinanzenAnsichtNeu({
  pfad,
  suche,
}: {
  pfad: string;
  suche: { bereich?: string; zeitraum?: string; typ?: string; zeilen?: string };
}) {
  const bereich = finanzBereichAusText(suche.bereich);
  const zeitraum = zeitraumAusText(suche.zeitraum);
  // Den Typ gibt es nur bei den Buchungen, gefiltert wird also nur dort. In
  // der Adresse bleibt er trotzdem stehen, auch waehrend ein anderer Reiter
  // offen ist - sonst waere er nach einem Hin und Her wieder verloren.
  const typRoh = ledgerTypAusText(suche.typ);
  const typ = bereich === "buchungen" ? typRoh : undefined;
  const zeilen = zeilenAusText(suche.zeilen);
  // Solange niemand nachgeladen hat, zeigt das Handy nur die ersten fuenf
  // Zeilen - das entscheidet globals.css, der Server kennt die Schirmbreite
  // nicht.
  const startzeilen = suche.zeilen === undefined;

  const [uebersicht, profil, t] = await Promise.all([
    ladeFinanzenUebersicht({ zeitraum, typ, zeilen }),
    getSessionProfile(),
    getTranslations("finanzenAnsicht"),
  ]);
  const format = await getFormatter();
  const locale = await getLocale();

  const live = uebersicht.quelle === "db";
  const darfBuchen = live && hasPermission(profil?.role, "finanzen", "create");

  // Nur die Auswahllisten des offenen Reiters holen. Wer die Buchungen
  // ansieht, braucht keine Sortenliste.
  const [reihenbloecke, sorten, kunden] =
    darfBuchen && bereich === "kostentraeger"
      ? await Promise.all([ladeReihenblockOptionen(), ladeSorteOptionen(), ladeB2bKundeOptionen()])
      : [[], [], []];
  const [kostentraegerListe, chargen] =
    darfBuchen && bereich === "buchungen"
      ? await Promise.all([ladeKostentraegerOptionen(), ladeChargeOptionen()])
      : [[], []];

  const geld = (n: number) => `${format.number(Math.round(n))} ₸`;
  const datum = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });
  const monatText = (wert: string) => {
    const [jahr, monat] = wert.split("-").map(Number);
    return format.dateTime(new Date(Date.UTC(jahr, monat - 1, 1)), {
      year: "numeric",
      month: "long",
    });
  };

  const { deckungsbeitrag, deckungsbeitragJeCharge, ledger, mehr, summe, monate } = uebersicht;

  // Leere Werte fallen raus, damit /finanz-labor?bereich=buchungen nicht zu
  // ?bereich=buchungen&typ= wird.
  const ziel = (werte: Record<string, string | undefined>) => {
    const query: Record<string, string> = {};
    for (const [schluessel, wert] of Object.entries(werte)) {
      if (wert !== undefined) query[schluessel] = wert;
    }
    return { pathname: pfad, query };
  };

  // Ein Reiterwechsel nimmt den Filter mit, aber nicht die Zeilenzahl.
  //
  // Der Unterschied: Zeitraum und Typ sagen, WAS man sehen will - das gilt
  // weiter, auch wenn der Zeitraum im naechsten Reiter auf ein anderes Datum
  // wirkt (die Beschriftung ueber den Pillen sagt, auf welches). Die
  // Zeilenzahl sagt dagegen, wie weit man sich in EINER Tabelle vorgearbeitet
  // hat, und das laesst sich auf die naechste nicht uebertragen.
  const reiterZiel = (wert: string) => ziel({ bereich: wert, zeitraum, typ: typRoh });
  const zeitraumZiel = (wert: string) => ziel({ bereich, zeitraum: wert, typ: typRoh });
  const typZiel = (wert: string) =>
    ziel({ bereich, zeitraum, typ: wert === ALLE ? undefined : wert });
  const mehrZiel = ziel({
    bereich,
    zeitraum,
    typ: typRoh,
    zeilen: String(zeilen + ZEILEN_SCHRITT),
  });

  const nachErntetag = bereich !== "buchungen";
  const summeDbZeitraum = summe.zeitraum.erloesTenge - summe.zeitraum.kostenTenge;
  const summeDbGesamt = summe.gesamt.erloesTenge - summe.gesamt.kostenTenge;

  // Die Tabelle steht in einem eigenen Behaelter: an ihm haengt die
  // Handy-Regel fuer die Startzeilen (globals.css).
  const tabelle = (inhalt: ReactNode) => (
    <div data-startzeilen={startzeilen ? "" : undefined}>{inhalt}</div>
  );

  return (
    <div className="space-y-6">
      <Section
        title={t("uebersichtTitel")}
        description={t("uebersichtLead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        <div className="space-y-3">
          <p className="schrift-label font-semibold text-muted-foreground">
            {nachErntetag ? t("zeitraum.nachErntetag") : t("zeitraum.nachBuchungsdatum")}
          </p>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <FilterPillen
              label={t("zeitraum.label")}
              aktiv={zeitraum}
              eintraege={zeitraumStufen.map((stufe) => ({
                wert: stufe,
                text: t(`zeitraum.${stufe}`),
              }))}
              ziel={zeitraumZiel}
            />
            {monate.length > 0 ? (
              // Ein GET-Formular verwirft alles, was nicht drinsteht. Bereich
              // und Typ laufen deshalb als versteckte Felder mit, sonst
              // sprang der Reiter beim Monatswechsel zurueck.
              <form
                method="get"
                action={getPathname({ href: pfad, locale })}
                className="flex items-end gap-2"
              >
                <input type="hidden" name="bereich" value={bereich} />
                {typRoh ? <input type="hidden" name="typ" value={typRoh} /> : null}
                <Auswahl
                  label={t("monatsListe.label")}
                  name="zeitraum"
                  defaultValue={istMonatsWert(zeitraum) ? zeitraum : ""}
                  options={[
                    { wert: "", text: t("monatsListe.bitte") },
                    ...monate.map((monat) => ({ wert: monat, text: monatText(monat) })),
                  ]}
                />
                <button
                  type="submit"
                  className={knopfKlassen({
                    variante: "leise",
                    rundung: "schmal",
                    groesse: "formular",
                  })}
                >
                  {t("monatsListe.knopf")}
                </button>
              </form>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {/* Nicht stat.erloes: Der bestehende Schluessel heisst "Erloese
                gesamt" und stimmte, solange die Kachel ueber alles summierte.
                Die grosse Zahl traegt jetzt den Zeitraum, das Gesamte steht
                darunter - die alte Beschriftung waere ueber ihr falsch. */}
            <Stat
              label={t("stat.zeitraumErloes")}
              value={geld(summe.zeitraum.erloesTenge)}
              helper={t("stat.gesamt", { wert: geld(summe.gesamt.erloesTenge) })}
            />
            <Stat
              label={t("stat.zeitraumKosten")}
              value={geld(summe.zeitraum.kostenTenge)}
              helper={t("stat.gesamt", { wert: geld(summe.gesamt.kostenTenge) })}
            />
            <Stat
              label={t("stat.zeitraumDeckungsbeitrag")}
              value={geld(summeDbZeitraum)}
              helper={t("stat.gesamt", { wert: geld(summeDbGesamt) })}
            />
          </div>
        </div>
      </Section>

      <Reiter
        label={t("bereich.label")}
        aktiv={bereich}
        eintraege={finanzBereiche.map((wert) => ({ wert, text: t(`bereich.${wert}`) }))}
        ziel={reiterZiel}
      />

      {bereich === "kostentraeger" ? (
        <Section title={t("kostentraegerTitel")} description={t("kostentraegerLead")}>
          <div className="space-y-3">
            {darfBuchen ? (
              <Aufklapper
                titel={t("formular.kostentraeger.titel")}
                beschreibung={t("formular.kostentraeger.lead")}
              >
                <KostentraegerAnlegenFormularNeu
                  reihenbloecke={reihenbloecke}
                  sorten={sorten}
                  kunden={kunden}
                />
              </Aufklapper>
            ) : null}

            {tabelle(
              <DataTable
                matrix
                head={[
                  t("col.bezeichnung"),
                  t("col.reihenblock"),
                  t("col.sorte"),
                  t("col.kunde"),
                  t("col.erloes"),
                  t("col.kosten"),
                  t("col.deckungsbeitrag"),
                  t("col.deckungsbeitragJeKg"),
                ]}
              >
                {deckungsbeitrag.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {t("keineKostentraeger")}
                    </td>
                  </tr>
                ) : (
                  deckungsbeitrag.map((z) => (
                    <tr key={z.kostentraegerId}>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-foreground">{z.bezeichnung}</p>
                        {z.erntetag ? (
                          <p className="text-[11px] text-muted-foreground">{datum(z.erntetag)}</p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            {t("ohneErntetag")}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {z.reihenblockCode ?? "–"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{z.sorteName ?? "–"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{z.b2bKundeName ?? "–"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{geld(z.erloesTenge)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{geld(z.kostenTenge)}</td>
                      <td className="px-3 py-2.5">
                        <StatusPill tone={z.deckungsbeitragTenge >= 0 ? "success" : "warning"}>
                          {geld(z.deckungsbeitragTenge)}
                        </StatusPill>
                      </td>
                      {/* Anforderung 4.3: Deckungsbeitrag je Kilogramm, null bei
                          Zukauf-Kostentraegern ohne eigene Pflueckaufgabe. */}
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {z.deckungsbeitragJeKgTenge === null
                          ? "–"
                          : `${format.number(z.deckungsbeitragJeKgTenge, { maximumFractionDigits: 0 })} ₸/kg`}
                      </td>
                    </tr>
                  ))
                )}
                {mehr.deckungsbeitrag ? (
                  <TabellenFuss spalten={8} text={t("mehrAnzeigen")} ziel={mehrZiel} />
                ) : null}
              </DataTable>,
            )}
          </div>
        </Section>
      ) : null}

      {bereich === "charge" ? (
        <Section title={t("chargeTitel")} description={t("chargeLead")}>
          {tabelle(
            <DataTable
              matrix
              head={[
                t("col.charge"),
                t("col.reihenblock"),
                t("col.sorte"),
                t("col.menge"),
                t("col.erloes"),
                t("col.kosten"),
                t("col.deckungsbeitrag"),
                t("col.deckungsbeitragJeKg"),
              ]}
            >
              {deckungsbeitragJeCharge.length === 0 ? (
                // Anforderung 3.3: Der Reiter bleibt stehen, auch wenn er leer
                // ist. Ein Reiter, der mal da ist und mal nicht, verwirrt mehr
                // als eine Erklaerung, warum nichts drinsteht.
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center text-xs text-muted-foreground">
                    {t("keineChargen")}
                  </td>
                </tr>
              ) : (
                deckungsbeitragJeCharge.map((z) => (
                  <tr key={z.chargeId}>
                    <td className="px-3 py-2.5">
                      <p className="font-mono text-[11px] font-semibold text-foreground">
                        {z.chargeCode}
                      </p>
                      {z.ernteDatum ? (
                        <p className="text-[11px] text-muted-foreground">{datum(z.ernteDatum)}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {z.reihenblockCode ?? "–"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{z.sorteName ?? "–"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {z.mengeKg === null ? "–" : `${format.number(z.mengeKg)} kg`}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{geld(z.erloesTenge)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{geld(z.kostenTenge)}</td>
                    <td className="px-3 py-2.5">
                      <StatusPill tone={z.deckungsbeitragTenge >= 0 ? "success" : "warning"}>
                        {geld(z.deckungsbeitragTenge)}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {z.deckungsbeitragJeKgTenge === null
                        ? "–"
                        : `${format.number(z.deckungsbeitragJeKgTenge, { maximumFractionDigits: 0 })} ₸/kg`}
                    </td>
                  </tr>
                ))
              )}
              {mehr.charge ? (
                <TabellenFuss spalten={8} text={t("mehrAnzeigen")} ziel={mehrZiel} />
              ) : null}
            </DataTable>,
          )}
        </Section>
      ) : null}

      {bereich === "buchungen" ? (
        <Section title={t("ledgerTitel")} description={t("ledgerLead")}>
          <div className="space-y-3">
            <FilterPillen
              label={t("typFilter.label")}
              aktiv={typ ?? ALLE}
              eintraege={[
                { wert: ALLE, text: t("typFilter.alle") },
                { wert: "erloes", text: t("erloes") },
                { wert: "kosten", text: t("kosten") },
              ]}
              ziel={typZiel}
            />

            {darfBuchen ? (
              <Aufklapper
                titel={t("formular.buchung.titel")}
                beschreibung={t("formular.buchung.lead")}
              >
                <BuchungErfassenFormularNeu
                  kostentraeger={kostentraegerListe}
                  chargen={chargen}
                />
              </Aufklapper>
            ) : null}

            {tabelle(
              <DataTable
                head={[
                  t("col.datum"),
                  t("col.kostentraegerSpalte"),
                  t("col.typ"),
                  t("col.kategorie"),
                  t("col.betrag"),
                ]}
              >
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {t("keineBuchungen")}
                    </td>
                  </tr>
                ) : (
                  ledger.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2.5 text-muted-foreground">{datum(l.buchungsdatum)}</td>
                      <td className="px-3 py-2.5 text-foreground">{l.kostentraegerBezeichnung}</td>
                      <td className="px-3 py-2.5">
                        <StatusPill tone={l.typ === "erloes" ? "success" : "neutral"}>
                          {t(l.typ)}
                        </StatusPill>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {l.kategorie}
                        {l.beschreibung ? (
                          <span className="block text-[11px] text-muted-foreground/80">
                            {l.beschreibung}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-foreground">
                        {geld(l.betragTenge)}
                      </td>
                    </tr>
                  ))
                )}
                {mehr.ledger ? (
                  <TabellenFuss spalten={5} text={t("mehrAnzeigen")} ziel={mehrZiel} />
                ) : null}
              </DataTable>,
            )}
          </div>
        </Section>
      ) : null}

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
