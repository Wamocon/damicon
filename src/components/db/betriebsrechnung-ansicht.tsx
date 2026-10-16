// Wirtschaftlichkeit des Betriebs: der erste Teil der Seite Wirtschaftlichkeit (Entscheidung vom 16.10.2026).
//
// Die Frage dieses Teils ist, was der Betrieb verdient: Erlöse, variable Kosten, Fixkosten und Ergebnis, Jahr für Jahr über drei bis fünf Jahre. Das System
// (Damicon) steht darin als Effekt: sein Nutzen, seine laufenden Kosten und seine Abschreibung, sobald alle drei erfasst sind. Die Rechnung, ob das System
// sich lohnt, folgt als zweiter Teil darunter (wirtschaftlichkeit-ansicht.tsx).
//
// Gerechnet wird rein in lib/domain/betriebsrechnung.ts. Fehlt eine Eingabe, steht die Rechnung auf "offen" und sagt, was fehlt, statt mit Nullen zu rechnen.
// Jede Annahme trägt ihre Herkunft (belegt oder geschätzt), die schwächste bestimmt die Kennzeichnung des Ergebnisses.

import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Aufklapper, Card, DataTable, FilterPillen, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import { BetriebsDiagramm } from "@/components/db/wirtschaftlichkeit-diagramme";
import { Kennzahlfelder, type Herkunftstexte, type Kachelfelder } from "@/components/db/kennzahl-karte";
import { HerkunftPille, PostenListe, Zeile, anzeigeFuer, type Anzeige } from "@/components/db/wirtschaftlichkeit-erfassung";
import { BetriebAnnahmenFormular } from "@/components/db/betriebsrechnung-formulare";
import { PostenFormular } from "@/components/db/wirtschaftlichkeit-formulare";
import {
  ABSCHREIBUNG_JAHRE_STANDARD,
  PLAN_JAHRE,
  betriebsEingabe,
  istJeKg,
  rechneBetrieb,
  type BetriebFehlt,
  type BetriebIst,
  type BetriebsAnnahmen,
  type Betriebsplan,
  type PlanJahre,
  type PlanJahr,
} from "@/lib/domain/betriebsrechnung";
import type { Herkunft } from "@/lib/domain/wirtschaftlichkeit";
import { summiereTenge, type Annahmen, type Posten, type Rechenstand } from "@/lib/domain/wirtschaftlichkeit-erfassung";

type Uebersetzer = Awaited<ReturnType<typeof getTranslations>>;
type Format = Awaited<ReturnType<typeof getFormatter>>;

/** Woher die Zahlen kommen: Modellwerte ohne Datenbank, laufende Erfassung oder ein festgehaltener Stand (der nur das System festhält). */
export type BetriebModus = "modell" | "erfasst" | "stand";

const PILLEN_TON: Record<Herkunft, Tone> = { belegt: "success", geschaetzt: "warning", offen: "neutral" };

/** Zahlen und Beträge, die alle Abschnitte teilen: einmal aufgebaut. */
interface Hilfen {
  t: Uebersetzer;
  format: Format;
  /** Kompakt, für Kacheln: 12,3 Mio. */
  kurz: (n: number) => string;
  /** Ganze Zahl mit Tausenderpunkten. */
  genau: (n: number) => string;
  /** Millionen mit einer Stelle, für die Tabelle. */
  mio: (n: number) => string;
  anteil: (wert: number, stellen?: number) => string;
  rubelProTenge: number;
}

function hilfenFuer(t: Uebersetzer, format: Format, rubTenge: number): Hilfen {
  return {
    t,
    format,
    kurz: (n) => format.number(n, { notation: "compact", maximumFractionDigits: 1 }),
    genau: (n) => format.number(Math.round(n)),
    mio: (n) => format.number(n / 1_000_000, { maximumFractionDigits: 1 }),
    anteil: (wert, stellen = 1) => format.number(wert, { style: "percent", maximumFractionDigits: stellen }),
    rubelProTenge: rubTenge,
  };
}

// --- Zeitraum -------------------------------------------------------------------------------------------------------------------

function ZeitraumWahl({ t, pfad, standId, jahre }: { t: Uebersetzer; pfad: string; standId?: string; jahre: PlanJahre }) {
  return (
    <FilterPillen
      label={t("zeitraum.label")}
      eintraege={PLAN_JAHRE.map((j) => ({ wert: String(j), text: t("zeitraum.jahre", { jahre: j }) }))}
      aktiv={String(jahre)}
      ziel={(wert) => ({ pathname: pfad, query: { ...(standId ? { stand: standId } : {}), jahre: wert } })}
    />
  );
}

// --- Kennzahlen ------------------------------------------------------------------------------------------------------------------

interface BetriebKachel extends Kachelfelder {
  rechenweg: string;
  /** Eine Zeile unter dem Rechenweg, die die Zahl einordnet (bei der Gewinnschwelle: wie viel Luft die Planmenge hat). */
  zusatz?: string;
}

/** Ein Betrag in Tenge mit dem Rubelbetrag daneben, beide aus demselben Kurs. */
function geld(h: Hilfen, tenge: number): Pick<Kachelfelder, "wert" | "klammer" | "genau"> {
  return { wert: `${h.kurz(tenge)} ₸`, klammer: `${h.kurz(tenge / h.rubelProTenge)} ₽`, genau: `${h.genau(tenge)} ₸` };
}

function gewinnschwelleKachel(h: Hilfen, plan: Betriebsplan, herkunft: Herkunft): BetriebKachel {
  const { t, format, genau, anteil } = h;
  const k = plan.kennzahlen;
  const kg = k?.gewinnschwelleKg ?? null;
  const puffer = k?.puffer ?? null;
  return {
    label: t("kennzahl.gewinnschwelle.label"),
    frage: t("kennzahl.gewinnschwelle.frage"),
    wert: kg === null ? t("gewinnschwelle.nie") : kg === 0 ? t("gewinnschwelle.gedeckt") : `${format.number(kg / 1000, { maximumFractionDigits: 0 })} ${t("einheit.tonnen")}`,
    genau: kg === null ? undefined : `${genau(kg)} ${t("einheit.kilogramm")}`,
    rechenweg: plan.systemEnthalten ? t("kennzahl.gewinnschwelle.rechenwegMitSystem") : t("kennzahl.gewinnschwelle.rechenweg"),
    zusatz:
      puffer === null
        ? t("gewinnschwelle.keinDeckungsbeitrag")
        : puffer >= 0
          ? t("gewinnschwelle.puffer", { anteil: anteil(puffer, 0) })
          : t("gewinnschwelle.unterSchwelle", { anteil: anteil(-puffer, 0) }),
    herkunft,
  };
}

/** Die sechs Kennzahlen des Betriebs. Nur mit stehender Rechnung (plan.kennzahlen gesetzt). */
function kennzahlKacheln(h: Hilfen, plan: Betriebsplan, jahre: number): BetriebKachel[] {
  const { t, genau, anteil } = h;
  const k = plan.kennzahlen;
  if (k === null) return [];
  const herkunft = plan.herkunft;
  return [
    {
      label: t("kennzahl.ergebnisErstesJahr.label"),
      frage: t("kennzahl.ergebnisErstesJahr.frage"),
      ...geld(h, k.ergebnisErstesJahr),
      rechenweg: plan.systemEnthalten ? t("kennzahl.ergebnisErstesJahr.rechenwegMitSystem") : t("kennzahl.ergebnisErstesJahr.rechenweg"),
      herkunft,
    },
    {
      label: t("kennzahl.ergebnisLetztesJahr.label", { jahr: jahre }),
      frage: t("kennzahl.ergebnisLetztesJahr.frage"),
      ...geld(h, k.ergebnisLetztesJahr),
      rechenweg: t("kennzahl.ergebnisLetztesJahr.rechenweg", { jahr: jahre }),
      herkunft,
    },
    {
      label: t("kennzahl.ergebnisSumme.label", { jahre }),
      frage: t("kennzahl.ergebnisSumme.frage"),
      ...geld(h, k.ergebnisSumme),
      rechenweg: t("kennzahl.ergebnisSumme.rechenweg", { jahre }),
      herkunft,
    },
    {
      label: t("kennzahl.umsatzrendite.label", { jahr: jahre }),
      frage: t("kennzahl.umsatzrendite.frage"),
      wert: k.umsatzrenditeLetztesJahr === null ? "-" : anteil(k.umsatzrenditeLetztesJahr),
      rechenweg: t("kennzahl.umsatzrendite.rechenweg"),
      herkunft,
    },
    {
      label: t("kennzahl.deckungsbeitrag.label"),
      frage: t("kennzahl.deckungsbeitrag.frage"),
      wert: `${genau(k.deckungsbeitragJeKg)} ₸/${t("einheit.kilogramm")}`,
      klammer: `${genau(k.deckungsbeitragJeKg / h.rubelProTenge)} ₽/${t("einheit.kilogramm")}`,
      rechenweg: t("kennzahl.deckungsbeitrag.rechenweg"),
      herkunft,
    },
    gewinnschwelleKachel(h, plan, herkunft),
  ];
}

function BetriebKachelKarte({ kachel, texte }: { kachel: BetriebKachel; texte: Herkunftstexte }) {
  return (
    <Card ton="daten" className={cn("p-4", kachel.herkunft !== "belegt" && "border-dashed border-warning/45")}>
      <Kennzahlfelder kachel={kachel} texte={texte} groesse="gross" />
      <p className="mt-2 border-t border-border pt-2 schrift-label text-muted-foreground">{kachel.rechenweg}</p>
      {kachel.zusatz ? <p className="mt-1 schrift-label font-semibold text-card-foreground">{kachel.zusatz}</p> : null}
    </Card>
  );
}

// --- Die Rechnung Jahr für Jahr --------------------------------------------------------------------------------------------------

type ZeilenArt = "info" | "posten" | "summe";

/** Eine Zeile der Jahrestabelle: Name, Art (Summenzeilen sind hervorgehoben) und der Wert je Jahr. */
interface Tabellenzeile {
  schluessel: string;
  name: string;
  art: ZeilenArt;
  wert: (z: PlanJahr) => number;
  /** Eigene Formatierung, wenn die Zeile nicht in Millionen Tenge steht (Menge, Preis). */
  format?: (n: number) => string;
}

function tabellenZeilen(h: Hilfen, plan: Betriebsplan): Tabellenzeile[] {
  const { t, format } = h;
  const system: Tabellenzeile[] = plan.systemEnthalten
    ? [
        { schluessel: "nutzen", name: t("tabelle.zeile.nutzen"), art: "posten", wert: (z) => z.nutzen },
        { schluessel: "systemKosten", name: t("tabelle.zeile.systemKosten"), art: "posten", wert: (z) => -z.systemKosten },
        { schluessel: "abschreibung", name: t("tabelle.zeile.abschreibung"), art: "posten", wert: (z) => -z.abschreibung },
      ]
    : [];
  return [
    { schluessel: "menge", name: t("tabelle.zeile.menge"), art: "info", wert: (z) => z.mengeKg / 1000, format: (n) => format.number(n, { maximumFractionDigits: 1 }) },
    { schluessel: "preis", name: t("tabelle.zeile.preis"), art: "info", wert: (z) => z.preisTengeKg, format: (n) => format.number(n, { maximumFractionDigits: 0 }) },
    { schluessel: "erloes", name: t("tabelle.zeile.erloes"), art: "posten", wert: (z) => z.erloes },
    { schluessel: "variableKosten", name: t("tabelle.zeile.variableKosten"), art: "posten", wert: (z) => -z.variableKosten },
    { schluessel: "deckungsbeitrag", name: t("tabelle.zeile.deckungsbeitrag"), art: "summe", wert: (z) => z.deckungsbeitrag },
    { schluessel: "fixkosten", name: t("tabelle.zeile.fixkosten"), art: "posten", wert: (z) => -z.fixkosten },
    { schluessel: "betriebsergebnis", name: t("tabelle.zeile.betriebsergebnis"), art: "summe", wert: (z) => z.betriebsergebnis },
    ...system,
    { schluessel: "ergebnis", name: t("tabelle.zeile.ergebnis"), art: "summe", wert: (z) => z.ergebnis },
    { schluessel: "kumuliert", name: t("tabelle.zeile.kumuliert"), art: "info", wert: (z) => z.ergebnisKumuliert },
  ];
}

function Jahrestabelle({ h, plan }: { h: Hilfen; plan: Betriebsplan }) {
  const { t, mio } = h;
  const kopf = [t("tabelle.position"), ...plan.zeilen.map((z) => t("tabelle.jahr", { jahr: z.jahr }))];
  return (
    <DataTable head={kopf}>
      {tabellenZeilen(h, plan).map((zeile) => (
        <tr key={zeile.schluessel} className={cn(zeile.art === "summe" && "bg-muted/30")}>
          <td className={cn("px-3 py-2.5", zeile.art === "summe" ? "font-bold text-foreground" : zeile.art === "info" ? "text-muted-foreground" : "font-semibold text-foreground")}>{zeile.name}</td>
          {plan.zeilen.map((z) => {
            const wert = zeile.wert(z);
            return (
              <td
                key={z.jahr}
                className={cn(
                  "px-3 py-2.5 tabular-nums",
                  zeile.art === "summe" ? "font-bold" : "",
                  zeile.art === "info" ? "text-muted-foreground" : wert < 0 && zeile.art === "summe" ? "text-destructive" : "text-foreground",
                )}
              >
                {(zeile.format ?? mio)(wert)}
              </td>
            );
          })}
        </tr>
      ))}
    </DataTable>
  );
}

// --- Annahmen und Fixkosten ----------------------------------------------------------------------------------------------------

function AnnahmenAnsicht({ a, h, betrieb, ist }: { a: Anzeige; h: Hilfen; betrieb: BetriebsAnnahmen; ist: BetriebIst | null }) {
  const { t, genau, anteil, format } = h;
  const herkunft = (schluessel: keyof BetriebsAnnahmen["herkunft"]) => betrieb.herkunft[schluessel] ?? "geschaetzt";
  const nichtGesetzt = t("annahmen.nichtGesetzt");
  const wertOderLeer = (wert: number | null, einheit: string) => (wert === null ? nichtGesetzt : `${genau(wert)} ${einheit}`);
  const entwicklung = (satz: number | null) => (satz === null ? t("annahmen.ohneVeraenderung") : anteil(satz));
  const jeKg = istJeKg(ist);
  return (
    <>
      <dl className="rounded-lg border border-border bg-background px-3 py-1 text-xs">
        <Zeile label={t("annahmen.menge")}>
          {wertOderLeer(betrieb.mengeKg, t("einheit.kilogramm"))}
          <HerkunftPille herkunft={herkunft("menge")} t={a.t} />
        </Zeile>
        <Zeile label={t("annahmen.preis")}>
          {wertOderLeer(betrieb.preisTengeKg, `₸/${t("einheit.kilogramm")}`)}
          <HerkunftPille herkunft={herkunft("preis")} t={a.t} />
        </Zeile>
        <Zeile label={t("annahmen.kosten")}>
          {wertOderLeer(betrieb.variableKostenTengeKg, `₸/${t("einheit.kilogramm")}`)}
          <HerkunftPille herkunft={herkunft("kosten")} t={a.t} />
        </Zeile>
        <Zeile label={t("annahmen.mengeEntwicklung")}>
          {entwicklung(betrieb.mengeEntwicklung)}
          <HerkunftPille herkunft={herkunft("entwicklung")} t={a.t} />
        </Zeile>
        <Zeile label={t("annahmen.preisEntwicklung")}>
          {entwicklung(betrieb.preisEntwicklung)}
          <HerkunftPille herkunft={herkunft("entwicklung")} t={a.t} />
        </Zeile>
        <Zeile label={t("annahmen.kostenEntwicklung")}>
          {entwicklung(betrieb.kostenEntwicklung)}
          <HerkunftPille herkunft={herkunft("entwicklung")} t={a.t} />
        </Zeile>
        <Zeile label={t("annahmen.fixkostenEntwicklung")}>
          {entwicklung(betrieb.fixkostenEntwicklung)}
          <HerkunftPille herkunft={herkunft("entwicklung")} t={a.t} />
        </Zeile>
        <Zeile label={t("annahmen.abschreibung")}>{t("annahmen.abschreibungWert", { jahre: betrieb.abschreibungJahre ?? ABSCHREIBUNG_JAHRE_STANDARD })}</Zeile>
      </dl>
      <p className="mt-2 schrift-label text-muted-foreground">
        {jeKg && ist
          ? t("annahmen.journal", {
              preis: genau(jeKg.preisTengeKg),
              kosten: genau(jeKg.kostenTengeKg),
              deckungsbeitrag: genau(jeKg.deckungsbeitragTengeKg),
              menge: format.number(Math.round(ist.mengeKg)),
              buchungen: ist.buchungen,
            })
          : t("annahmen.journalLeer")}
      </p>
    </>
  );
}

function FixkostenAbschnitt({ a, h, posten, kurse, darfSchreiben, heute }: { a: Anzeige; h: Hilfen; posten: Posten[]; kurse: Annahmen["kurse"]; darfSchreiben: boolean; heute: string }) {
  const { t, genau } = h;
  const zeilen = posten.filter((p) => p.art === "fixkosten");
  const summe = summiereTenge(zeilen, "fixkosten", kurse).summe;
  return (
    <Section title={t("fixkosten.titel")} description={t("fixkosten.lead")}>
      {summe !== null ? <p className="mb-2 text-xs font-semibold text-card-foreground">{t("fixkosten.summe", { betrag: `${genau(summe)} ₸` })}</p> : null}
      <PostenListe a={a} zeilen={zeilen} lesend={!darfSchreiben} heute={heute} leerText={t("fixkosten.leer")} />
      {darfSchreiben ? (
        <div className="mt-4">
          <Aufklapper titel={t("fixkosten.neu")} variante="aktion">
            <div className="-m-4">
              <PostenFormular heute={heute} festeArt="fixkosten" />
            </div>
          </Aufklapper>
        </div>
      ) : null}
    </Section>
  );
}

// --- Der erste Teil der Seite ----------------------------------------------------------------------------------------------------

export interface BetriebsrechnungEingabe {
  modus: BetriebModus;
  pfad: string;
  /** Id eines festgehaltenen Standes, wenn einer angezeigt wird; bleibt beim Wechsel des Zeitraums erhalten. */
  standId?: string;
  jahre: PlanJahre;
  /** Die Planung des Betriebs, wie sie in der Datenbank steht. */
  betrieb: BetriebsAnnahmen;
  betriebIst: BetriebIst | null;
  /** Der Rechenstand des Systems zum selben Horizont, mit dem Kurs vom Stichtag. */
  stand: Rechenstand;
  annahmen: Annahmen;
  posten: Posten[];
  darfSchreiben: boolean;
  /** Heute als "JJJJ-MM-TT" in der Zeitzone des Betriebs. */
  heute: string;
  kursHinweis: string;
  herkunftTexte: Herkunftstexte;
}

/** Wählt die Pille der Seite aus der Herkunft der Rechnung; ohne Rechnung (festgehaltener Stand) gibt es keine. */
function pilleFuer(t: Uebersetzer, plan: Betriebsplan | null): { text: string; ton: Tone } | null {
  if (plan === null) return null;
  const text = plan.herkunft === "belegt" ? t("pille.belegt") : plan.herkunft === "geschaetzt" ? t("pille.geschaetzt") : t("pille.offen");
  return { text, ton: PILLEN_TON[plan.herkunft] };
}

function hinweisFuer(t: Uebersetzer, plan: Betriebsplan): string {
  return plan.herkunft === "belegt" ? t("hinweis.belegt") : plan.herkunft === "geschaetzt" ? t("hinweis.geschaetzt") : t("hinweis.offen");
}

export async function BetriebsrechnungAnsicht(e: BetriebsrechnungEingabe) {
  const [t, te, format, locale] = await Promise.all([getTranslations("betriebsrechnung"), getTranslations("wirtschaftlichkeitErfassung"), getFormatter(), getLocale()]);
  const h = hilfenFuer(t, format, e.annahmen.kurse.rubTenge);
  const a = anzeigeFuer(te, format, e.annahmen);
  const stand = e.modus === "stand";
  const eingabe = betriebsEingabe({ betrieb: e.betrieb, stand: e.stand, annahmen: e.annahmen, posten: e.posten, jahre: e.jahre });
  // Ein festgehaltener Stand hält nur das System fest. Die Betriebsrechnung zeigt immer die laufenden Werte und fehlt dort.
  const plan = stand ? null : rechneBetrieb(eingabe);
  const pille = pilleFuer(t, plan);
  const fehltTexte: Record<BetriebFehlt, string> = {
    menge: t("fehlt.menge"),
    preis: t("fehlt.preis"),
    variableKosten: t("fehlt.variableKosten"),
    fixkosten: t("fehlt.fixkosten"),
  };
  const kacheln = plan ? kennzahlKacheln(h, plan, e.jahre) : [];
  const erfassbar = e.modus === "erfasst";

  return (
    <>
      {/* Titel und Beschreibung der Seite stehen im Rahmen des Moduls (modules.wirtschaftlichkeit), wie bei allen Modulen: hier folgt gleich die Rechnung. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ZeitraumWahl t={t} pfad={e.pfad} standId={e.standId} jahre={e.jahre} />
        {pille ? <StatusPill tone={pille.ton}>{pille.text}</StatusPill> : null}
      </div>

      {plan === null ? (
        <Card ton="innen" className="p-4">
          <p className="schrift-dense text-card-foreground">{t("standHinweis")}</p>
        </Card>
      ) : (
        <Card ton="innen" className="space-y-2 p-4">
          <p className="schrift-dense text-card-foreground">{hinweisFuer(t, plan)}</p>
          {plan.fehlt.length === 0 ? <p className="schrift-label text-muted-foreground">{plan.systemEnthalten ? t("hinweis.mitSystem") : t("hinweis.ohneSystem")}</p> : null}
          {plan.fehlt.length > 0 ? (
            <div>
              <p className="schrift-label font-semibold text-card-foreground">{t("fehlt.titel")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 schrift-dense text-muted-foreground">
                {plan.fehlt.map((code) => (
                  <li key={code}>{fehltTexte[code]}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="schrift-label text-muted-foreground">{e.kursHinweis}</p>
          {erfassbar && !e.darfSchreiben ? <p className="schrift-label text-muted-foreground">{t("nurLesen")}</p> : null}
        </Card>
      )}

      {plan && plan.kennzahlen ? (
        <>
          <Section title={t("abschnitt.titel", { jahre: e.jahre })} description={t("abschnitt.lead")}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {kacheln.map((kachel, i) => (
                <BetriebKachelKarte key={i} kachel={kachel} texte={e.herkunftTexte} />
              ))}
            </div>
          </Section>

          <Section title={t("diagramm.titel")} description={plan.systemEnthalten ? t("diagramm.lead") : t("diagramm.leadOhneSystem")}>
            <BetriebsDiagramm
              punkte={plan.zeilen.map((z) => ({ name: t("diagramm.jahr", { jahr: z.jahr }), erloes: z.erloes, kosten: z.erloes - z.ergebnis, ergebnis: z.ergebnis }))}
              locale={locale}
              texte={{ erloes: t("diagramm.erloes"), kosten: t("diagramm.kosten"), ergebnis: t("diagramm.ergebnis") }}
            />
          </Section>

          <Section title={t("tabelle.titel")} description={t("tabelle.lead")}>
            <Jahrestabelle h={h} plan={plan} />
          </Section>
        </>
      ) : null}

      {erfassbar ? (
        <>
          <Section title={t("annahmen.titel")} description={t("annahmen.lead")}>
            <AnnahmenAnsicht a={a} h={h} betrieb={eingabe.annahmen} ist={e.betriebIst} />
            {e.darfSchreiben ? (
              <div className="mt-4">
                <Aufklapper titel={t("annahmen.aendern")} variante="aktion">
                  <div className="-m-4">
                    <BetriebAnnahmenFormular betrieb={e.betrieb} />
                  </div>
                </Aufklapper>
              </div>
            ) : null}
          </Section>

          <FixkostenAbschnitt a={a} h={h} posten={e.posten} kurse={e.annahmen.kurse} darfSchreiben={e.darfSchreiben} heute={e.heute} />
        </>
      ) : null}
    </>
  );
}
