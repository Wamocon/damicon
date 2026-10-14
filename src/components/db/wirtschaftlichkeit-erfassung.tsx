import type { ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
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
import {
  POSTEN_ARTEN,
  euroInTengeMit,
  summiere,
  type Annahmen,
  type IstEintrag,
  type MengeAbgeleitet,
  type PlanIst,
  type Posten,
  type PostenArt,
  type Rechenstand,
} from "@/lib/domain/wirtschaftlichkeit-erfassung";

// Die Erfassung unter den Kennzahlen (WMCNL-2470): woraus die Zahlen oben gerechnet sind (Posten und Annahmen), was in der
// Wirklichkeit eingetreten ist (Ist-Werte gegen den Plan) und welche Staende festgehalten wurden. Schreiben duerfen
// Administration, Geschaeftsfuehrung und Buchhaltung; in der Ansicht eines festgehaltenen Standes ist alles nur zum Lesen.

type Uebersetzer = Awaited<ReturnType<typeof getTranslations>>;

function Zeile({ label, children, hinweis }: { label: string; children: ReactNode; hinweis?: string }) {
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

function HerkunftPille({ herkunft, t }: { herkunft: "belegt" | "geschaetzt"; t: Uebersetzer }) {
  return <StatusPill tone={herkunft === "belegt" ? "success" : "warning"}>{herkunft === "belegt" ? t("herkunft.belegt") : t("herkunft.geschaetzt")}</StatusPill>;
}

export async function WirtschaftlichkeitErfassung({ pfad, posten, ist, annahmen, menge, staende, stand, planIst, aktiverStand, darfSchreiben, heute }: ErfassungsEingabe) {
  const [t, format] = await Promise.all([getTranslations("wirtschaftlichkeitErfassung"), getFormatter()]);
  const zahl = (n: number, stellen = 2) => format.number(n, { maximumFractionDigits: stellen });
  const tenge = (euro: number) => `${format.number(euroInTengeMit(euro, annahmen.kurse))} ₸`;
  const tag = (iso: string) => format.dateTime(new Date(`${iso.slice(0, 10)}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const monat = (iso: string) => format.dateTime(new Date(`${iso.slice(0, 10)}T00:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" });
  const zeitpunkt = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  const betrag = (p: { betrag: number; waehrung: string }) => `${zahl(p.betrag)} ${p.waehrung}`;

  const artTexte: Record<PostenArt, string> = {
    investition: t("posten.art.investition"),
    betrieb: t("posten.art.betrieb"),
    nutzen: t("posten.art.nutzen"),
  };
  const kategorieTexte: Record<string, string> = {
    schwund: t("kategorie.schwund"),
    handarbeit: t("kategorie.handarbeit"),
    audit: t("kategorie.audit"),
    sonstiges: t("kategorie.sonstiges"),
  };
  const kategorieText = (p: Posten | IstEintrag) => (("art" in p ? p.art === "nutzen" : true) ? (kategorieTexte[p.kategorie] ?? p.kategorie) : p.kategorie);
  const lesend = !darfSchreiben;

  // --- Posten -------------------------------------------------------------------------------------------------------
  const postenGruppen = POSTEN_ARTEN.map((art) => ({ art, zeilen: posten.filter((p) => p.art === art), summe: summiere(posten, art, annahmen.kurse).summe }));

  const postenAnsicht = (
    <div className="space-y-4">
      {postenGruppen.map((g) => (
        <div key={g.art}>
          <p className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-xs font-semibold text-card-foreground">
            <span>{artTexte[g.art]}</span>
            <span className="text-muted-foreground">{g.summe === null ? t("posten.nichtErfasst") : t("posten.summe", { betrag: tenge(g.summe) })}</span>
          </p>
          {g.zeilen.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{t("posten.keineZeile")}</p>
          ) : lesend ? (
            <DataTable head={[t("posten.col.kategorie"), t("posten.col.bezeichnung"), t("posten.col.datum"), t("posten.col.betrag"), t("posten.col.herkunft")]}>
              {g.zeilen.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2.5 text-muted-foreground">{kategorieText(p)}</td>
                  <td className="px-3 py-2.5 font-semibold text-foreground">
                    {p.bezeichnung}
                    {p.notiz ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{p.notiz}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{tag(p.datum)}</td>
                  <td className="px-3 py-2.5 text-foreground">{betrag(p)}</td>
                  <td className="px-3 py-2.5">
                    <HerkunftPille herkunft={p.herkunft} t={t} />
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <div className="space-y-2">
              {g.zeilen.map((p) => (
                // Der Schluessel enthaelt den Stand der Zeile: nach dem Speichern baut sich das Formular mit den neuen Werten auf.
                <Aufklapper key={`${p.id}-${p.betrag}-${p.bezeichnung}-${p.herkunft}-${p.datum}-${p.waehrung}-${p.kategorie}-${p.notiz}`} titel={`${p.bezeichnung} · ${betrag(p)}`} beschreibung={`${kategorieText(p)} · ${tag(p.datum)} · ${p.herkunft === "belegt" ? t("herkunft.belegt") : t("herkunft.geschaetzt")}`}>
                  <div className="-m-4">
                    <PostenFormular posten={p} heute={heute} />
                  </div>
                  <div className="mt-2">
                    <PostenEntfernenKnopf id={p.id} />
                  </div>
                </Aufklapper>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  // --- Annahmen -----------------------------------------------------------------------------------------------------
  const h = (s: keyof Annahmen["herkunft"]): "belegt" | "geschaetzt" => annahmen.herkunft[s] ?? "geschaetzt";
  const mengeText =
    stand.mengeKg === null ? t("annahmen.offen") : `${zahl(stand.mengeKg, 0)} kg`;
  const mengeHinweis =
    stand.mengeQuelle === "annahme"
      ? t("annahmen.mengeAusAnnahme")
      : stand.mengeQuelle === "lieferungen"
        ? t("annahmen.mengeAusLieferungen")
        : menge && menge.tageAbdeckung > 0
          ? t("annahmen.mengeZuKurz", { tage: menge.tageAbdeckung, menge: zahl(menge.mengeKg12Monate, 0) })
          : t("annahmen.mengeKeine");

  const annahmenAnsicht = (
    <dl className="rounded-lg border border-border bg-background px-3 py-1 text-xs">
      <Zeile label={t("annahmen.zins")}>
        {format.number(annahmen.kalkulationszins, { style: "percent", maximumFractionDigits: 2 })}
        <HerkunftPille herkunft={h("kalkulationszins")} t={t} />
      </Zeile>
      <Zeile label={t("annahmen.kurs")} hinweis={[annahmen.kursQuelle, t("annahmen.stichtag", { datum: tag(annahmen.kursStichtag) })].filter(Boolean).join(" · ")}>
        1 EUR = {zahl(annahmen.kurse.eurTenge)} ₸, 1 RUB = {zahl(annahmen.kurse.rubTenge)} ₸
        <HerkunftPille herkunft={h("kurs")} t={t} />
      </Zeile>
      <Zeile label={t("annahmen.vollkosten")}>
        {annahmen.vollkostenVorherTenge === null ? t("annahmen.offen") : `${zahl(annahmen.vollkostenVorherTenge, 0)} ₸/kg`}
        <HerkunftPille herkunft={h("vollkosten")} t={t} />
      </Zeile>
      <Zeile label={t("annahmen.menge")} hinweis={mengeHinweis}>
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

  // --- Plan-Ist -----------------------------------------------------------------------------------------------------
  const abweichung = (euro: number | null) => (euro === null ? t("annahmen.offen") : `${euro > 0 ? "+" : ""}${tenge(euro)}`);
  const planIstAnsicht =
    planIst.zeilen.length === 0 ? (
      <p className="text-xs text-muted-foreground">{t("planIst.leer")}</p>
    ) : (
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

  const istEintraege =
    ist.length === 0 ? null : (
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold text-card-foreground">{t("planIst.eintraege")}</p>
        <DataTable head={[t("planIst.col.monat"), t("form.kategorie"), t("form.betrag"), t("planIst.col.notiz"), ...(darfSchreiben ? [""] : [])]}>
          {[...ist].reverse().map((e) => (
            <tr key={e.id}>
              <td className="px-3 py-2.5 font-semibold text-foreground">{monat(e.monat)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{kategorieText(e)}</td>
              <td className="px-3 py-2.5 text-foreground">{betrag(e)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{e.notiz ?? ""}</td>
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

  // --- Staende ------------------------------------------------------------------------------------------------------
  const staendeAnsicht = (
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
                <span className="font-semibold text-foreground">{s.bezeichnung}</span>
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

  return (
    <>
      <Section title={t("posten.titel")} description={t("posten.lead")}>
        {posten.length === 0 && darfSchreiben ? (
          <Card ton="innen" className="mb-4 space-y-2 p-4">
            <p className="schrift-dense font-semibold text-card-foreground">{t("modell.titel")}</p>
            <p className="schrift-dense text-muted-foreground">{t("modell.lead")}</p>
            <ModellKnopf />
          </Card>
        ) : null}
        {postenAnsicht}
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
        {annahmenAnsicht}
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
        {planIstAnsicht}
        {istEintraege}
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
        {staendeAnsicht}
      </Section>
    </>
  );
}
