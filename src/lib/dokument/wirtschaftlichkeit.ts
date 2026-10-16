import { absatz, definitionen, esc, kasten, leerHinweis, marke, tabelle, type Kennzahl, type Ton } from "@/lib/dokument/damicon-dokument";
import type { DokumentEingabe, Zelle } from "@/lib/dokument/damicon-dokument";
import { dateinameFuer, kennungFuer, monatText, tagText, tengeText, versiegeln, zahlText, zeitText, type DokumentKontext } from "@/lib/dokument/kontext";
import { tagInZone } from "@/lib/domain/tageszeit";
import { HORIZONT_JAHRE, type Herkunft, type Kennzahlschluessel } from "@/lib/domain/wirtschaftlichkeit";
import {
  SYSTEM_POSTEN_ARTEN,
  euroInRubelMit,
  euroInTengeMit,
  planIst,
  rechneStand,
  summiere,
  tengeInRubelMit,
  type Annahmen,
  type IstEintrag,
  type MengeAbgeleitet,
  type Posten,
  type Rechenstand,
} from "@/lib/domain/wirtschaftlichkeit-erfassung";

// Die Investitionsrechnung als Dokument (WMCNL-2470): Kennzahlen mit Herkunft, die Posten, aus denen sie gerechnet sind, die
// Annahmen und der Plan-Ist-Vergleich. Gedruckt zeigt es, was die Seite zeigte, mit dem Kurs des Standes. Rein: Daten und
// Texte kommen von aussen.

export interface WirtschaftlichkeitDokumentDaten {
  posten: Posten[];
  ist: IstEintrag[];
  annahmen: Annahmen;
  menge: MengeAbgeleitet | null;
  /** "modell": Modellwerte ohne Datenbank; "stand": ein festgehaltener Stand; sonst die laufende Rechnung. */
  quelle: "modell" | "erfasst" | "stand";
  stand?: { name: string; standAm: string };
  /** Heute als "JJJJ-MM-TT" in der Zeitzone des Betriebs. */
  heute: string;
  /** Id des Standes, falls einer gedruckt wird: macht die Kennung eindeutig. */
  standId?: string;
}

const TON: Record<Herkunft, Ton> = { belegt: "gut", geschaetzt: "warnung", offen: "neutral" };

type Uebersetzer = ReturnType<DokumentKontext["t"]>;

/** Was alle Abschnitte brauchen: die drei Namensräume der Texte, die Sprache, die Kurse des Standes und die Formate für Prozent, Geld und Herkunft. */
interface Hilfen {
  t: Uebersetzer;
  a: Uebersetzer;
  e: Uebersetzer;
  sprache: string;
  kurse: Annahmen["kurse"];
  offen: string;
  herkunftMarke: (h: Herkunft) => { html: string };
  prozent: (v: number | null) => string;
  euroAlsTenge: (euro: number | null) => string;
}

function hilfenFuer(d: WirtschaftlichkeitDokumentDaten, x: DokumentKontext): Hilfen {
  const t = x.t("dokument.wirtschaftlichkeit");
  const a = x.t("wirtschaftlichkeitAnsicht");
  const e = x.t("wirtschaftlichkeitErfassung");
  const sprache = x.sprache;
  const kurse = d.annahmen.kurse;
  const offen = a("offen");
  const herkunftText = (h: Herkunft): string => (h === "belegt" ? e("herkunft.belegt") : h === "geschaetzt" ? a("geschaetzt") : a("offen"));
  return {
    t,
    a,
    e,
    sprache,
    kurse,
    offen,
    herkunftMarke: (h) => marke(herkunftText(h), TON[h]),
    prozent: (v) => (v === null ? offen : `${zahlText(v * 100, sprache, 0)} %`),
    euroAlsTenge: (euro) => (euro === null ? offen : `${zahlText(euroInTengeMit(euro, kurse), sprache, 0)} ₸ (${zahlText(euroInRubelMit(euro, kurse), sprache, 0)} ₽)`),
  };
}

/** Namen der Kennzahlen: literale Schluessel, damit der Test jeden in allen Sprachen findet. */
function kennzahlLabels(a: Uebersetzer): Record<Kennzahlschluessel, string> {
  return {
    roiJahr1: a("kennzahl.roiJahr1.label"),
    roiHorizont: a("kennzahl.roiHorizont.label", { jahre: HORIZONT_JAHRE }),
    capex: a("kennzahl.capex.label"),
    opex: a("kennzahl.opex.label"),
    kapitalwert: a("kennzahl.kapitalwert.label"),
    kostenJeKilogramm: a("kennzahl.kostenJeKilogramm.label"),
    amortisation: a("kennzahl.amortisation.label"),
    tco: a("kennzahl.tco.label", { jahre: HORIZONT_JAHRE }),
    vermiedeneKosten: a("kennzahl.vermiedeneKosten.label"),
    nutzenbeginn: a("kennzahl.nutzenbeginn.label"),
  };
}

type Kennzahlzeile = { schluessel: Kennzahlschluessel; wert: string };

function kennzahlZeilenVon(d: WirtschaftlichkeitDokumentDaten, stand: Rechenstand, h: Hilfen): Kennzahlzeile[] {
  const { a, offen, kurse, sprache, prozent, euroAlsTenge } = h;
  const k = stand.kennzahlen;
  const kg = (v: number | null): string => (v === null ? offen : `${zahlText(v, sprache, 0)} ₸/${a("einheit.kilogramm")} (${zahlText(tengeInRubelMit(v, kurse), sprache, 0)} ₽/${a("einheit.kilogramm")})`);
  const amortisation = k.amortisationMonate === null ? offen : a("einheit.monate", { anzahl: Math.round(k.amortisationMonate) });
  return [
    { schluessel: "roiJahr1", wert: prozent(k.roiJahr1) },
    { schluessel: "roiHorizont", wert: prozent(k.roiHorizont) },
    { schluessel: "capex", wert: euroAlsTenge(stand.capexEur) },
    { schluessel: "opex", wert: euroAlsTenge(stand.opexEur) },
    { schluessel: "kapitalwert", wert: euroAlsTenge(k.kapitalwert) },
    { schluessel: "kostenJeKilogramm", wert: kg(k.kostenJeKgNachherTenge) },
    { schluessel: "amortisation", wert: amortisation },
    { schluessel: "tco", wert: euroAlsTenge(k.tcoHorizont) },
    { schluessel: "vermiedeneKosten", wert: euroAlsTenge(stand.nutzenEur) },
    { schluessel: "nutzenbeginn", wert: d.annahmen.nutzenbeginnWochen === null ? offen : a("einheit.wochenSpanne", d.annahmen.nutzenbeginnWochen) },
  ];
}

/** Die Tabelle der Kennzahlen mit ihrer Herkunft. */
function kennzahlTabelle(h: Hilfen, zeilen: Kennzahlzeile[], labels: Record<Kennzahlschluessel, string>, stand: Rechenstand): string {
  return tabelle(
    [h.t("col.kennzahl"), h.t("col.wert"), h.t("col.herkunft")],
    zeilen.map((z) => [labels[z.schluessel], z.wert, h.herkunftMarke(stand.herkunft[z.schluessel])]),
  );
}

/** Die Posten nach Art, darunter die Summen je Art. */
function postenAbschnitt(d: WirtschaftlichkeitDokumentDaten, h: Hilfen): string {
  const { t, e, sprache, kurse } = h;
  const artTexte = { investition: e("posten.art.investition"), betrieb: e("posten.art.betrieb"), nutzen: e("posten.art.nutzen") };
  const kategorieTexte: Record<string, string> = {
    schwund: e("kategorie.schwund"),
    handarbeit: e("kategorie.handarbeit"),
    audit: e("kategorie.audit"),
    sonstiges: e("kategorie.sonstiges"),
  };
  const kategorieText = (kategorie: string, nutzen: boolean) => (nutzen ? (kategorieTexte[kategorie] ?? kategorie) : kategorie);
  const zeilen: Zelle[][] = SYSTEM_POSTEN_ARTEN.flatMap((art) =>
    d.posten
      .filter((p) => p.art === art)
      .map((p) => [
        artTexte[art],
        kategorieText(p.kategorie, art === "nutzen"),
        p.bezeichnung,
        tagText(p.datum, sprache),
        { html: `${zahlText(p.betrag, sprache)} ${p.waehrung}`, zahl: true },
        h.herkunftMarke(p.herkunft),
      ]),
  );
  const summen = SYSTEM_POSTEN_ARTEN.map((art) => {
    const s = summiere(d.posten, art, kurse).summe;
    return { label: artTexte[art], wert: s === null ? e("posten.nichtErfasst") : h.euroAlsTenge(s) };
  });
  return (
    (zeilen.length > 0
      ? tabelle([e("form.art"), e("form.kategorie"), e("form.bezeichnung"), e("form.datum"), e("form.betrag"), e("form.herkunft")], zeilen, [4])
      : leerHinweis(t("leerPosten"))) + definitionen(summen)
  );
}

/** Die Annahmen als Liste, jede mit ihrer Herkunft. */
function annahmenAbschnitt(d: WirtschaftlichkeitDokumentDaten, stand: Rechenstand, h: Hilfen): string {
  const { a, e, sprache, kurse, offen } = h;
  const herkunft = (s: keyof Annahmen["herkunft"]): Herkunft => d.annahmen.herkunft[s] ?? "geschaetzt";
  const mitHerkunft = (wert: string, hk: Herkunft) => ({ html: `${esc(wert)} ${h.herkunftMarke(hk).html}` });
  const mengeWert = stand.mengeKg === null ? offen : `${zahlText(stand.mengeKg, sprache, 0)} kg`;
  return definitionen([
    { label: e("annahmen.zins"), wert: mitHerkunft(`${zahlText(d.annahmen.kalkulationszins * 100, sprache, 2)} %`, herkunft("kalkulationszins")) },
    {
      label: e("annahmen.kurs"),
      wert: mitHerkunft(`1 EUR = ${zahlText(kurse.eurTenge, sprache)} ₸, 1 RUB = ${zahlText(kurse.rubTenge, sprache)} ₸ (${tagText(d.annahmen.kursStichtag, sprache)})`, herkunft("kurs")),
    },
    ...(d.annahmen.kursQuelle ? [{ label: e("annahmen.form.kursQuelle"), wert: d.annahmen.kursQuelle }] : []),
    { label: e("annahmen.vollkosten"), wert: d.annahmen.vollkostenVorherTenge === null ? offen : mitHerkunft(`${zahlText(d.annahmen.vollkostenVorherTenge, sprache, 0)} ₸/${a("einheit.kilogramm")}`, herkunft("vollkosten")) },
    {
      label: e("annahmen.menge"),
      wert: stand.mengeQuelle === "annahme" ? mitHerkunft(mengeWert, herkunft("menge")) : stand.mengeQuelle === "lieferungen" ? mitHerkunft(mengeWert, "belegt") : mengeWert,
    },
    { label: e("annahmen.nutzenbeginn"), wert: d.annahmen.nutzenbeginnWochen === null ? offen : mitHerkunft(a("einheit.wochenSpanne", d.annahmen.nutzenbeginnWochen), herkunft("nutzenbeginn")) },
    { label: e("annahmen.echtbetrieb"), wert: d.annahmen.echtbetriebBeginn === null ? offen : tagText(d.annahmen.echtbetriebBeginn, sprache) },
  ]);
}

/** Plan gegen Ist je Monat, bis zum Monat des Standes (oder heute). */
function planIstAbschnitt(d: WirtschaftlichkeitDokumentDaten, stand: Rechenstand, h: Hilfen): string {
  const { e, sprache, kurse, offen } = h;
  const vergleich = planIst(stand.nutzenEur, d.ist, d.annahmen, (d.stand ? tagInZone(new Date(d.stand.standAm)) : d.heute).slice(0, 7));
  const tengeAusEuro = (euro: number | null): string => (euro === null ? offen : tengeText(euroInTengeMit(euro, kurse), sprache));
  const tabelleHtml =
    vergleich.zeilen.length === 0
      ? leerHinweis(e("planIst.leer"))
      : tabelle(
          [e("planIst.col.monat"), e("planIst.col.plan"), e("planIst.col.ist"), e("planIst.col.abweichung"), e("planIst.col.istKumuliert")],
          vergleich.zeilen.map((z) => [
            monatText(z.monat, sprache),
            { html: tengeAusEuro(z.planEur), zahl: true },
            { html: tengeAusEuro(z.istEur), zahl: true },
            { html: z.abweichungEur === null ? offen : `${z.abweichungEur > 0 ? "+" : ""}${tengeAusEuro(z.abweichungEur)}`, zahl: true },
            { html: tengeAusEuro(z.istKumuliertEur), zahl: true },
          ]),
          [1, 2, 3, 4],
        );
  return absatz(e("planIst.lead")) + tabelleHtml;
}

/** Namen der geschaetzten und der offenen Kennzahlen, fuer die Hinweise und die Zusammenfassung. */
function geschaetztUndOffen(zeilen: Kennzahlzeile[], stand: Rechenstand, labels: Record<Kennzahlschluessel, string>): { geschaetzt: string[]; offen: string[] } {
  const stufe = (art: Herkunft) => zeilen.filter((z) => stand.herkunft[z.schluessel] === art).map((z) => labels[z.schluessel]);
  return { geschaetzt: stufe("geschaetzt"), offen: stufe("offen") };
}

function hinweiseVon(d: WirtschaftlichkeitDokumentDaten, h: Hilfen, g: { geschaetzt: string[]; offen: string[] }): string[] {
  const hinweise: string[] = [];
  if (d.quelle === "modell") hinweise.push(h.t("hinweis.modell"));
  if (d.quelle === "stand") hinweise.push(h.t("hinweis.stand"));
  if (g.geschaetzt.length > 0) hinweise.push(h.t("hinweis.geschaetzt", { liste: g.geschaetzt.join(", ") }));
  if (g.offen.length > 0) hinweise.push(h.t("hinweis.offen", { liste: g.offen.join(", ") }));
  return hinweise;
}

/** Die drei Kennzahlen auf dem Deckblatt. */
function kennzahlKarten(stand: Rechenstand, h: Hilfen, labels: Record<Kennzahlschluessel, string>): Kennzahl[] {
  const k = stand.kennzahlen;
  return [
    { label: labels.amortisation, wert: k.amortisationMonate === null ? h.offen : h.a("einheit.monate", { anzahl: Math.round(k.amortisationMonate) }), ton: TON[stand.herkunft.amortisation] },
    { label: labels.roiHorizont, wert: h.prozent(k.roiHorizont), ton: TON[stand.herkunft.roiHorizont] },
    { label: labels.kapitalwert, wert: h.euroAlsTenge(k.kapitalwert).split(" (")[0], ton: TON[stand.herkunft.kapitalwert] },
  ];
}

export function baueWirtschaftlichkeitDokument(d: WirtschaftlichkeitDokumentDaten, x: DokumentKontext): DokumentEingabe {
  const h = hilfenFuer(d, x);
  const { t, sprache, kurse } = h;
  const stand = rechneStand(d.posten, d.annahmen, d.menge);
  // Das Dokument zeigt die Rechnung des Systems; die Fixkosten des Betriebs gehören zur Betriebsrechnung und zählen hier nicht mit.
  const systemPosten = d.posten.filter((p) => p.art !== "fixkosten");
  const labels = kennzahlLabels(h.a);
  const zeilen = kennzahlZeilenVon(d, stand, h);
  const g = geschaetztUndOffen(zeilen, stand, labels);
  const hinweise = hinweiseVon(d, h, g);

  const untertitel = d.stand ? t("untertitelStand", { name: d.stand.name }) : d.quelle === "modell" ? t("untertitelModell") : t("untertitelLaufend");
  const zusammenfassung =
    d.quelle === "modell"
      ? t("zusammenfassungModell")
      : systemPosten.length === 0
        ? t("zusammenfassungLeer")
        : t("zusammenfassung", { anzahl: systemPosten.length, offen: g.offen.length, geschaetzt: g.geschaetzt.length });

  return versiegeln({
    kennung: kennungFuer(
      "WIRT",
      x.jetzt,
      `${d.standId ?? "laufend"}|${d.posten.map((p) => `${p.id}:${p.betrag}${p.waehrung}${p.herkunft}`).join(",")}|${d.ist.map((i) => `${i.monat}${i.kategorie}${i.betrag}${i.waehrung}`).join(",")}|${kurse.eurTenge}:${kurse.rubTenge}:${d.annahmen.kalkulationszins}`,
    ),
    dateiname: dateinameFuer(t("dateiname"), x.jetzt),
    art: t("art"),
    titel: t("titel"),
    untertitel,
    erstelltAm: x.jetzt.toISOString(),
    ersteller: x.ersteller,
    meta: [
      { label: t("meta.stand"), wert: d.stand ? zeitText(d.stand.standAm, sprache) : tagText(d.heute, sprache) },
      { label: t("meta.kurs"), wert: `1 EUR = ${zahlText(kurse.eurTenge, sprache)} ₸ (${tagText(d.annahmen.kursStichtag, sprache)})` },
      { label: t("meta.zins"), wert: `${zahlText(d.annahmen.kalkulationszins * 100, sprache, 2)} %` },
      { label: t("meta.posten"), wert: String(systemPosten.length) },
    ],
    kennzahlen: kennzahlKarten(stand, h, labels),
    zusammenfassung,
    abschnitte: [
      { titel: t("abschnittKennzahlen"), html: kennzahlTabelle(h, zeilen, labels, stand) },
      { titel: t("abschnittPosten"), html: postenAbschnitt(d, h) },
      { titel: t("abschnittAnnahmen"), html: annahmenAbschnitt(d, stand, h) },
      { titel: t("abschnittPlanIst"), html: planIstAbschnitt(d, stand, h) },
      ...(hinweise.length > 0 ? [{ titel: t("abschnittHinweise"), html: kasten(t("hinweiseTitel"), hinweise, "warnung") }] : []),
    ],
    freigabe: [x.t("roles")("ceo"), x.t("roles")("buchhaltung")],
  });
}
