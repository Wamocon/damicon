import type { ReactNode } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { kalendermonat, kalendertag } from "@/lib/format/datum";
import { Link } from "@/i18n/navigation";
import { Aufklapper, Card, DataTable, Section, StatusPill, textVerweisKlassen } from "@/components/ui/kit";
import {
  AnnahmenFormular,
  IstEntfernenKnopf,
  IstFormular,
  ModellKnopf,
  PostenEntfernenKnopf,
  PostenFormular,
  StandFormular,
} from "@/components/db/wirtschaftlichkeit-formulare";
import type { StandKopf } from "@/lib/data/wirtschaftlichkeit";
import { einstellungWert } from "@/lib/data/einstellungen";
import { uebersetzt, uebersetztOderNull, type I18nSpalte } from "@/lib/i18n-daten";
import {
  SYSTEM_POSTEN_ARTEN,
  euroInTengeMit,
  kapitalwertBeiZinsen,
  summiere,
  type Annahmen,
  type IstEintrag,
  type MengeAbgeleitet,
  type PlanIst,
  type Posten,
  type Rechenstand,
} from "@/lib/domain/wirtschaftlichkeit-erfassung";

// Die Erfassung unter den Kennzahlen (WMCNL-2470): woraus die Zahlen oben gerechnet sind (Posten und Annahmen), was in der
// Wirklichkeit eingetreten ist (Ist-Werte gegen den Plan) und welche Staende festgehalten wurden. Schreiben duerfen
// Administration, Geschaeftsfuehrung und Buchhaltung; in der Ansicht eines festgehaltenen Standes ist alles nur zum Lesen.

type Uebersetzer = Awaited<ReturnType<typeof getTranslations>>;

export function Zeile({ label, children, hinweis }: { label: string; children: ReactNode; hinweis?: string }) {
  return (
    <div className="border-b border-border/60 py-1.5 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="flex items-center gap-2 font-semibold text-foreground">{children}</dd>
      </div>
      {hinweis ? <p className="mt-0.5 schrift-label text-muted-foreground">{hinweis}</p> : null}
    </div>
  );
}

export interface ErfassungsEingabe {
  pfad: string;
  posten: Posten[];
  ist: IstEintrag[];
  annahmen: Annahmen;
  menge: MengeAbgeleitet | null;
  staende: StandKopf[];
  stand: Rechenstand;
  planIst: PlanIst;
  /** Id des angezeigten festgehaltenen Standes; ohne Angabe die laufende Rechnung. */
  aktiverStand?: string;
  /** Darf die Rolle schreiben (nicht in der Ansicht eines festgehaltenen Standes). */
  darfSchreiben: boolean;
  /** Heute als "JJJJ-MM-TT" in der Zeitzone des Betriebs. */
  heute: string;
}

export function HerkunftPille({ herkunft, t }: { herkunft: "belegt" | "geschaetzt"; t: Uebersetzer }) {
  return <StatusPill tone={herkunft === "belegt" ? "success" : "warning"}>{herkunft === "belegt" ? t("herkunft.belegt") : t("herkunft.geschaetzt")}</StatusPill>;
}

type Format = Awaited<ReturnType<typeof getFormatter>>;

/** Texte und Formate, die alle Abschnitte teilen: einmal in WirtschaftlichkeitErfassung aufgebaut. */
export interface Anzeige {
  t: Uebersetzer;
  format: Format;
  zahl: (n: number, stellen?: number) => string;
  tenge: (euro: number) => string;
  tag: (iso: string) => string;
  monat: (iso: string) => string;
  zeitpunkt: (iso: string) => string;
  betrag: (p: { betrag: number; waehrung: string }) => string;
  kategorieText: (p: Posten | IstEintrag) => string;
  /** Der Text einer Freitextspalte in der Sprache der Oberflaeche; ohne Uebersetzung das Original. */
  text: (i18n: I18nSpalte | undefined, spalte: string, original: string) => string;
  textOderNull: (i18n: I18nSpalte | undefined, spalte: string, original: string | null) => string | null;
}

export function anzeigeFuer(t: Uebersetzer, format: Format, annahmen: Annahmen, sprache: string): Anzeige {
  const kategorieTexte: Record<string, string> = {
    schwund: t("kategorie.schwund"),
    handarbeit: t("kategorie.handarbeit"),
    audit: t("kategorie.audit"),
    sonstiges: t("kategorie.sonstiges"),
  };
  const zahl = (n: number, stellen = 2) => format.number(n, { maximumFractionDigits: stellen });
  return {
    t,
    format,
    zahl,
    tenge: (euro) => `${format.number(euroInTengeMit(euro, annahmen.kurse))} ₸`,
    tag: (iso) => kalendertag(format, iso),
    monat: (iso) => kalendermonat(format, iso),
    zeitpunkt: (iso) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }),
    betrag: (p) => `${zahl(p.betrag)} ${p.waehrung}`,
    // Die Kategorie des Nutzens ist ein Schluessel mit festen Texten, die der anderen Arten ist frei erfasst und hat Uebersetzungen.
    kategorieText: (p) => (("art" in p ? p.art === "nutzen" : true) ? (kategorieTexte[p.kategorie] ?? p.kategorie) : uebersetzt(p.i18n, "kategorie", sprache, p.kategorie)),
    text: (i18n, spalte, original) => uebersetzt(i18n, spalte, sprache, original),
    textOderNull: (i18n, spalte, original) => uebersetztOderNull(i18n, spalte, sprache, original),
  };
}

// --- Posten ---------------------------------------------------------------------------------------------------------------

/** Die Zeilen einer Art: eine Tabelle zum Lesen, sonst je Posten ein Aufklapper mit Formular. Auch für die Fixkosten des Betriebs. */
export function PostenListe({ a, zeilen, lesend, heute, leerText }: { a: Anzeige; zeilen: Posten[]; lesend: boolean; heute: string; leerText: string }) {
  const { t, tag, betrag, kategorieText, text, textOderNull } = a;
  if (zeilen.length === 0) return <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{leerText}</p>;
  if (lesend) {
    return (
      <DataTable head={[t("posten.col.kategorie"), t("posten.col.bezeichnung"), t("posten.col.datum"), t("posten.col.betrag"), t("posten.col.herkunft")]}>
        {zeilen.map((p) => (
          <tr key={p.id}>
            <td className="px-3 py-2.5 text-muted-foreground">{kategorieText(p)}</td>
            <td className="px-3 py-2.5 font-semibold text-foreground">
              {text(p.i18n, "bezeichnung", p.bezeichnung)}
              {p.notiz ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{textOderNull(p.i18n, "notiz", p.notiz)}</span> : null}
            </td>
            <td className="px-3 py-2.5 text-muted-foreground">{tag(p.datum)}</td>
            <td className="px-3 py-2.5 text-foreground">{betrag(p)}</td>
            <td className="px-3 py-2.5">
              <HerkunftPille herkunft={p.herkunft} t={t} />
            </td>
          </tr>
        ))}
      </DataTable>
    );
  }
  return (
    <div className="space-y-2">
      {zeilen.map((p) => (
        // Der Schluessel enthaelt den Stand der Zeile: nach dem Speichern baut sich das Formular mit den neuen Werten auf.
        <Aufklapper key={`${p.id}-${p.betrag}-${p.bezeichnung}-${p.herkunft}-${p.datum}-${p.waehrung}-${p.kategorie}-${p.notiz}`} titel={`${text(p.i18n, "bezeichnung", p.bezeichnung)} · ${betrag(p)}`} beschreibung={`${kategorieText(p)} · ${tag(p.datum)} · ${p.herkunft === "belegt" ? t("herkunft.belegt") : t("herkunft.geschaetzt")}`}>
          <div className="-m-4">
            <PostenFormular posten={p} heute={heute} />
          </div>
          <div className="mt-2">
            <PostenEntfernenKnopf id={p.id} />
          </div>
        </Aufklapper>
      ))}
    </div>
  );
}

function PostenAnsicht({ a, posten, annahmen, lesend, heute }: { a: Anzeige; posten: Posten[]; annahmen: Annahmen; lesend: boolean; heute: string }) {
  const { t, tenge } = a;
  const artTexte: Record<(typeof SYSTEM_POSTEN_ARTEN)[number], string> = {
    investition: t("posten.art.investition"),
    betrieb: t("posten.art.betrieb"),
    nutzen: t("posten.art.nutzen"),
  };
  const gruppen = SYSTEM_POSTEN_ARTEN.map((art) => ({ art, zeilen: posten.filter((p) => p.art === art), summe: summiere(posten, art, annahmen.kurse).summe }));
  return (
    <div className="space-y-4">
      {gruppen.map((g) => (
        <div key={g.art}>
          <p className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-xs font-semibold text-card-foreground">
            <span>{artTexte[g.art]}</span>
            <span className="text-muted-foreground">{g.summe === null ? t("posten.nichtErfasst") : t("posten.summe", { betrag: tenge(g.summe) })}</span>
          </p>
          <PostenListe a={a} zeilen={g.zeilen} lesend={lesend} heute={heute} leerText={t("posten.keineZeile")} />
        </div>
      ))}
    </div>
  );
}

// --- Annahmen -------------------------------------------------------------------------------------------------------------

/** Der Hinweis zur Jahresmenge: woher sie kommt oder warum es keine gibt. */
function mengeHinweisFuer(a: Anzeige, stand: Rechenstand, menge: MengeAbgeleitet | null): string {
  const { t, zahl } = a;
  if (stand.mengeQuelle === "annahme") return t("annahmen.mengeAusAnnahme");
  if (stand.mengeQuelle === "lieferungen") return t("annahmen.mengeAusLieferungen");
  return menge && menge.tageAbdeckung > 0 ? t("annahmen.mengeZuKurz", { tage: menge.tageAbdeckung, menge: zahl(menge.mengeKg12Monate, 0) }) : t("annahmen.mengeKeine");
}

/** Zins-Check: der Kapitalwert bei dem unteren und dem oberen Vergleichszins und beim Richtwert (Einstellungen, Quelle in docs/ENTSCHEIDUNGSGRUNDLAGEN.md). */
async function zinsCheckFuer(a: Anzeige, stand: Rechenstand): Promise<{ saetze: number[]; richtwert: number | null; text: string }> {
  const [richtwert, niedrig, hoch] = await Promise.all([
    einstellungWert("wirtschaftlichkeit.kalkulationszins_richtwert"),
    einstellungWert("wirtschaftlichkeit.zins_sensitivitaet_niedrig"),
    einstellungWert("wirtschaftlichkeit.zins_sensitivitaet_hoch"),
  ]);
  const saetze = [niedrig, richtwert, hoch].filter((z): z is number => z !== null);
  const kapitalwerte = kapitalwertBeiZinsen(stand, saetze.map((z) => z / 100));
  const text = saetze.map((z, i) => `${a.format.number(z, { maximumFractionDigits: 2 })} %: ${kapitalwerte[i] === null ? "-" : `${a.zahl(kapitalwerte[i] as number, 0)} €`}`).join(" · ");
  return { saetze, richtwert, text };
}

function AnnahmenAnsicht({ a, annahmen, stand, menge, zins }: { a: Anzeige; annahmen: Annahmen; stand: Rechenstand; menge: MengeAbgeleitet | null; zins: { saetze: number[]; richtwert: number | null; text: string } }) {
  const { t, format, zahl, tag, monat } = a;
  const h = (s: keyof Annahmen["herkunft"]): "belegt" | "geschaetzt" => annahmen.herkunft[s] ?? "geschaetzt";
  const mengeText = stand.mengeKg === null ? t("annahmen.offen") : `${zahl(stand.mengeKg, 0)} kg`;
  return (
    <dl className="rounded-lg border border-border bg-background px-3 py-1 text-xs">
      <Zeile label={t("annahmen.zins")}>
        {format.number(annahmen.kalkulationszins, { style: "percent", maximumFractionDigits: 2 })}
        <HerkunftPille herkunft={h("kalkulationszins")} t={t} />
      </Zeile>
      {zins.saetze.length > 0 ? (
        <Zeile label={t("annahmen.zinsCheck")} hinweis={zins.richtwert !== null ? t("annahmen.zinsCheckHinweis", { richtwert: format.number(zins.richtwert, { maximumFractionDigits: 2 }) }) : undefined}>
          {zins.text}
        </Zeile>
      ) : null}
      <Zeile label={t("annahmen.kurs")} hinweis={[annahmen.kursQuelle, t("annahmen.stichtag", { datum: tag(annahmen.kursStichtag) })].filter(Boolean).join(" · ")}>
        1 EUR = {zahl(annahmen.kurse.eurTenge)} ₸, 1 RUB = {zahl(annahmen.kurse.rubTenge)} ₸
        <HerkunftPille herkunft={h("kurs")} t={t} />
      </Zeile>
      <Zeile label={t("annahmen.vollkosten")}>
        {annahmen.vollkostenVorherTenge === null ? t("annahmen.offen") : `${zahl(annahmen.vollkostenVorherTenge, 0)} ₸/kg`}
        <HerkunftPille herkunft={h("vollkosten")} t={t} />
      </Zeile>
      <Zeile label={t("annahmen.menge")} hinweis={mengeHinweisFuer(a, stand, menge)}>
        {mengeText}
        {stand.mengeQuelle === "annahme" ? <HerkunftPille herkunft={h("menge")} t={t} /> : null}
      </Zeile>
      <Zeile label={t("annahmen.nutzenbeginn")}>
        {annahmen.nutzenbeginnWochen === null ? t("annahmen.offen") : t("annahmen.wochen", annahmen.nutzenbeginnWochen)}
        <HerkunftPille herkunft={h("nutzenbeginn")} t={t} />
      </Zeile>
      <Zeile label={t("annahmen.echtbetrieb")}>{annahmen.echtbetriebBeginn === null ? t("annahmen.offen") : monat(annahmen.echtbetriebBeginn)}</Zeile>
    </dl>
  );
}

// --- Plan und Ist ---------------------------------------------------------------------------------------------------------

function PlanIstAnsicht({ a, planIst }: { a: Anzeige; planIst: PlanIst }) {
  const { t, tenge, monat } = a;
  const abweichung = (euro: number | null) => (euro === null ? t("annahmen.offen") : `${euro > 0 ? "+" : ""}${tenge(euro)}`);
  if (planIst.zeilen.length === 0) return <p className="text-xs text-muted-foreground">{t("planIst.leer")}</p>;
  return (
    <DataTable head={[t("planIst.col.monat"), t("planIst.col.plan"), t("planIst.col.ist"), t("planIst.col.abweichung"), t("planIst.col.istKumuliert")]}>
      {planIst.zeilen.map((z) => (
        <tr key={z.monat}>
          <td className="px-3 py-2.5 font-semibold text-foreground">{monat(z.monat)}</td>
          <td className="px-3 py-2.5 text-muted-foreground">{z.planEur === null ? t("annahmen.offen") : tenge(z.planEur)}</td>
          <td className="px-3 py-2.5 text-foreground">{tenge(z.istEur)}</td>
          <td className={z.abweichungEur !== null && z.abweichungEur < 0 ? "px-3 py-2.5 text-destructive" : "px-3 py-2.5 text-muted-foreground"}>{abweichung(z.abweichungEur)}</td>
          <td className="px-3 py-2.5 text-muted-foreground">{tenge(z.istKumuliertEur)}</td>
        </tr>
      ))}
    </DataTable>
  );
}

function IstEintraege({ a, ist, darfSchreiben }: { a: Anzeige; ist: IstEintrag[]; darfSchreiben: boolean }) {
  const { t, monat, betrag, kategorieText, textOderNull } = a;
  if (ist.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-semibold text-card-foreground">{t("planIst.eintraege")}</p>
      <DataTable head={[t("planIst.col.monat"), t("form.kategorie"), t("form.betrag"), t("planIst.col.notiz"), ...(darfSchreiben ? [""] : [])]}>
        {[...ist].reverse().map((e) => (
          <tr key={e.id}>
            <td className="px-3 py-2.5 font-semibold text-foreground">{monat(e.monat)}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{kategorieText(e)}</td>
            <td className="px-3 py-2.5 text-foreground">{betrag(e)}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{textOderNull(e.i18n, "notiz", e.notiz) ?? ""}</td>
            {darfSchreiben ? (
              <td className="px-3 py-2.5">
                <IstEntfernenKnopf id={e.id} />
              </td>
            ) : null}
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

// --- Staende --------------------------------------------------------------------------------------------------------------

function StaendeAnsicht({ a, pfad, staende, aktiverStand, darfSchreiben }: { a: Anzeige; pfad: string; staende: StandKopf[]; aktiverStand?: string; darfSchreiben: boolean }) {
  const { t, zeitpunkt, text } = a;
  return (
    <div className="space-y-3">
      {aktiverStand ? (
        <Link href={pfad} className={textVerweisKlassen}>
          {t("staende.zumAktuellen")}
        </Link>
      ) : null}
      {staende.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("staende.leer")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-background">
          {staende.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
              <span>
                <span className="font-semibold text-foreground">{text(s.i18n, "bezeichnung", s.bezeichnung)}</span>
                <span className="ml-2 text-muted-foreground">{zeitpunkt(s.standAm)}</span>
              </span>
              {s.id === aktiverStand ? (
                <StatusPill tone="info">{t("staende.angezeigt")}</StatusPill>
              ) : (
                <Link href={{ pathname: pfad, query: { stand: s.id } }} className={textVerweisKlassen}>
                  {t("staende.ansehen")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {darfSchreiben ? (
        <Aufklapper titel={t("staende.festhaltenTitel")} beschreibung={t("staende.festhaltenLead")}>
          <div className="-m-4">
            <StandFormular />
          </div>
        </Aufklapper>
      ) : null}
    </div>
  );
}

export async function WirtschaftlichkeitErfassung({ pfad, posten, ist, annahmen, menge, staende, stand, planIst, aktiverStand, darfSchreiben, heute }: ErfassungsEingabe) {
  const [t, format, locale] = await Promise.all([getTranslations("wirtschaftlichkeitErfassung"), getFormatter(), getLocale()]);
  const a = anzeigeFuer(t, format, annahmen, locale);
  const zins = await zinsCheckFuer(a, stand);

  return (
    <>
      <Section title={t("posten.titel")} description={t("posten.lead")}>
        {posten.every((p) => p.art === "fixkosten") && darfSchreiben ? (
          <Card ton="innen" className="mb-4 space-y-2 p-4">
            <p className="schrift-dense font-semibold text-card-foreground">{t("modell.titel")}</p>
            <p className="schrift-dense text-muted-foreground">{t("modell.lead")}</p>
            <ModellKnopf />
          </Card>
        ) : null}
        <PostenAnsicht a={a} posten={posten} annahmen={annahmen} lesend={!darfSchreiben} heute={heute} />
        {darfSchreiben ? (
          <div className="mt-4">
            <Aufklapper titel={t("posten.neu")} variante="aktion">
              <div className="-m-4">
                <PostenFormular heute={heute} />
              </div>
            </Aufklapper>
          </div>
        ) : null}
      </Section>

      <Section title={t("annahmen.titel")} description={t("annahmen.lead")}>
        <AnnahmenAnsicht a={a} annahmen={annahmen} stand={stand} menge={menge} zins={zins} />
        {darfSchreiben ? (
          <div className="mt-4">
            <Aufklapper titel={t("annahmen.aendern")} variante="aktion">
              <div className="-m-4">
                <AnnahmenFormular annahmen={annahmen} />
              </div>
            </Aufklapper>
          </div>
        ) : null}
      </Section>

      <Section title={t("planIst.titel")} description={t("planIst.lead")}>
        <PlanIstAnsicht a={a} planIst={planIst} />
        <IstEintraege a={a} ist={ist} darfSchreiben={darfSchreiben} />
        {darfSchreiben ? (
          <div className="mt-4">
            <Aufklapper titel={t("planIst.neu")} variante="aktion">
              <div className="-m-4">
                <IstFormular monat={heute.slice(0, 7)} />
              </div>
            </Aufklapper>
          </div>
        ) : null}
      </Section>

      <Section title={t("staende.titel")} description={t("staende.lead")}>
        <StaendeAnsicht a={a} pfad={pfad} staende={staende} aktiverStand={aktiverStand} darfSchreiben={darfSchreiben} />
      </Section>
    </>
  );
}
