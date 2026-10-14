import { absatz, definitionen, esc, kasten, leerHinweis, marke, tabelle, type Kennzahl, type Ton } from "@/lib/dokument/damicon-dokument";
import type { DokumentEingabe, Zelle } from "@/lib/dokument/damicon-dokument";
import { dateinameFuer, kennungFuer, monatText, tagText, tengeText, versiegeln, zahlText, zeitText, type DokumentKontext } from "@/lib/dokument/kontext";
import { tagInZone } from "@/lib/domain/tageszeit";
import type { Herkunft, Kennzahlschluessel } from "@/lib/domain/wirtschaftlichkeit";
import {
  POSTEN_ARTEN,
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

export function baueWirtschaftlichkeitDokument(d: WirtschaftlichkeitDokumentDaten, x: DokumentKontext): DokumentEingabe {
  const t = x.t("dokument.wirtschaftlichkeit");
  const a = x.t("wirtschaftlichkeitAnsicht");
  const e = x.t("wirtschaftlichkeitErfassung");
  const sprache = x.sprache;
  const kurse = d.annahmen.kurse;
  const stand = rechneStand(d.posten, d.annahmen, d.menge);
  const k = stand.kennzahlen;

  const herkunftText = (h: Herkunft): string => (h === "belegt" ? e("herkunft.belegt") : h === "geschaetzt" ? a("geschaetzt") : a("offen"));
  const herkunftMarke = (h: Herkunft) => marke(herkunftText(h), TON[h]);
  const offen = a("offen");

  const prozent = (v: number | null): string => (v === null ? offen : `${zahlText(v * 100, sprache, 0)} %`);
  const euroAlsTenge = (euro: number | null): string => (euro === null ? offen : `${zahlText(euroInTengeMit(euro, kurse), sprache, 0)} ₸ (${zahlText(euroInRubelMit(euro, kurse), sprache, 0)} ₽)`);
  const kg = (v: number | null): string => (v === null ? offen : `${zahlText(v, sprache, 0)} ₸/${a("einheit.kilogramm")} (${zahlText(tengeInRubelMit(v, kurse), sprache, 0)} ₽/${a("einheit.kilogramm")})`);

  const kennzahlZeilen: { schluessel: Kennzahlschluessel; wert: string }[] = [
    { schluessel: "roiJahr1", wert: prozent(k.roiJahr1) },
    { schluessel: "roiDreiJahre", wert: prozent(k.roiHorizont) },
    { schluessel: "capex", wert: euroAlsTenge(stand.capexEur) },
    { schluessel: "opex", wert: euroAlsTenge(stand.opexEur) },
    { schluessel: "kapitalwert", wert: euroAlsTenge(k.kapitalwert) },
    { schluessel: "kostenJeKilogramm", wert: kg(k.kostenJeKgNachherTenge) },
    { schluessel: "amortisation", wert: k.amortisationMonate === null ? offen : a("einheit.monate", { anzahl: Math.round(k.amortisationMonate) }) },
    { schluessel: "tco", wert: euroAlsTenge(k.tcoHorizont) },
    { schluessel: "vermiedeneKosten", wert: euroAlsTenge(stand.nutzenEur) },
    { schluessel: "nutzenbeginn", wert: d.annahmen.nutzenbeginnWochen === null ? offen : a("einheit.wochenSpanne", d.annahmen.nutzenbeginnWochen) },
  ];

  // Namen der Kennzahlen: literale Schluessel, damit der Test jeden in allen Sprachen findet.
  const labels: Record<Kennzahlschluessel, string> = {
    roiJahr1: a("kennzahl.roiJahr1.label"),
    roiDreiJahre: a("kennzahl.roiDreiJahre.label"),
    capex: a("kennzahl.capex.label"),
    opex: a("kennzahl.opex.label"),
    kapitalwert: a("kennzahl.kapitalwert.label"),
    kostenJeKilogramm: a("kennzahl.kostenJeKilogramm.label"),
    amortisation: a("kennzahl.amortisation.label"),
    tco: a("kennzahl.tco.label"),
    vermiedeneKosten: a("kennzahl.vermiedeneKosten.label"),
    nutzenbeginn: a("kennzahl.nutzenbeginn.label"),
  };

  const kennzahlTabelle = tabelle(
    [t("col.kennzahl"), t("col.wert"), t("col.herkunft")],
    kennzahlZeilen.map((z) => [labels[z.schluessel], z.wert, herkunftMarke(stand.herkunft[z.schluessel])]),
  );

  // --- Posten ---------------------------------------------------------------------------------------------------------
  const artTexte = { investition: e("posten.art.investition"), betrieb: e("posten.art.betrieb"), nutzen: e("posten.art.nutzen") };
  const kategorieTexte: Record<string, string> = {
    schwund: e("kategorie.schwund"),
    handarbeit: e("kategorie.handarbeit"),
    audit: e("kategorie.audit"),
    sonstiges: e("kategorie.sonstiges"),
  };
  const kategorieText = (kategorie: string, nutzen: boolean) => (nutzen ? (kategorieTexte[kategorie] ?? kategorie) : kategorie);
  const postenZeilen: Zelle[][] = POSTEN_ARTEN.flatMap((art) =>
    d.posten
      .filter((p) => p.art === art)
      .map((p) => [
        artTexte[art],
        kategorieText(p.kategorie, art === "nutzen"),
        p.bezeichnung,
        tagText(p.datum, sprache),
        { html: `${zahlText(p.betrag, sprache)} ${p.waehrung}`, zahl: true },
        herkunftMarke(p.herkunft),
      ]),
  );
  const summen = POSTEN_ARTEN.map((art) => {
    const s = summiere(d.posten, art, kurse).summe;
    return { label: artTexte[art], wert: s === null ? e("posten.nichtErfasst") : euroAlsTenge(s) };
  });

  // --- Annahmen -------------------------------------------------------------------------------------------------------
  const h = (s: keyof Annahmen["herkunft"]): Herkunft => d.annahmen.herkunft[s] ?? "geschaetzt";
  const mitHerkunft = (wert: string, hk: Herkunft) => ({ html: `${esc(wert)} ${herkunftMarke(hk).html}` });
  const mengeWert = stand.mengeKg === null ? offen : `${zahlText(stand.mengeKg, sprache, 0)} kg`;
  const annahmenHtml = definitionen([
    { label: e("annahmen.zins"), wert: mitHerkunft(`${zahlText(d.annahmen.kalkulationszins * 100, sprache, 2)} %`, h("kalkulationszins")) },
    {
      label: e("annahmen.kurs"),
      wert: mitHerkunft(`1 EUR = ${zahlText(kurse.eurTenge, sprache)} ₸, 1 RUB = ${zahlText(kurse.rubTenge, sprache)} ₸ (${tagText(d.annahmen.kursStichtag, sprache)})`, h("kurs")),
    },
    ...(d.annahmen.kursQuelle ? [{ label: e("annahmen.form.kursQuelle"), wert: d.annahmen.kursQuelle }] : []),
    { label: e("annahmen.vollkosten"), wert: d.annahmen.vollkostenVorherTenge === null ? offen : mitHerkunft(`${zahlText(d.annahmen.vollkostenVorherTenge, sprache, 0)} ₸/${a("einheit.kilogramm")}`, h("vollkosten")) },
    {
      label: e("annahmen.menge"),
      wert: stand.mengeQuelle === "annahme" ? mitHerkunft(mengeWert, h("menge")) : stand.mengeQuelle === "lieferungen" ? mitHerkunft(mengeWert, "belegt") : mengeWert,
    },
    { label: e("annahmen.nutzenbeginn"), wert: d.annahmen.nutzenbeginnWochen === null ? offen : mitHerkunft(a("einheit.wochenSpanne", d.annahmen.nutzenbeginnWochen), h("nutzenbeginn")) },
    { label: e("annahmen.echtbetrieb"), wert: d.annahmen.echtbetriebBeginn === null ? offen : tagText(d.annahmen.echtbetriebBeginn, sprache) },
  ]);

  // --- Plan und Ist -----------------------------------------------------------------------------------------------------
  const vergleich = planIst(stand.nutzenEur, d.ist, d.annahmen, (d.stand ? tagInZone(new Date(d.stand.standAm)) : d.heute).slice(0, 7));
  const tengeAusEuro = (euro: number | null): string => (euro === null ? offen : tengeText(euroInTengeMit(euro, kurse), sprache));
  const planIstHtml =
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

  // --- Hinweise ---------------------------------------------------------------------------------------------------------
  const alle = kennzahlZeilen.map((z) => ({ schluessel: z.schluessel, h: stand.herkunft[z.schluessel] }));
  const offene = alle.filter((z) => z.h === "offen").map((z) => labels[z.schluessel]);
  const geschaetzte = alle.filter((z) => z.h === "geschaetzt").map((z) => labels[z.schluessel]);
  const hinweise: string[] = [];
  if (d.quelle === "modell") hinweise.push(t("hinweis.modell"));
  if (d.quelle === "stand") hinweise.push(t("hinweis.stand"));
  if (geschaetzte.length > 0) hinweise.push(t("hinweis.geschaetzt", { liste: geschaetzte.join(", ") }));
  if (offene.length > 0) hinweise.push(t("hinweis.offen", { liste: offene.join(", ") }));

  const kennzahlKarten: Kennzahl[] = [
    { label: labels.amortisation, wert: k.amortisationMonate === null ? offen : a("einheit.monate", { anzahl: Math.round(k.amortisationMonate) }), ton: TON[stand.herkunft.amortisation] },
    { label: labels.roiDreiJahre, wert: prozent(k.roiHorizont), ton: TON[stand.herkunft.roiDreiJahre] },
    { label: labels.kapitalwert, wert: euroAlsTenge(k.kapitalwert).split(" (")[0], ton: TON[stand.herkunft.kapitalwert] },
  ];

  const untertitel = d.stand ? t("untertitelStand", { name: d.stand.name }) : d.quelle === "modell" ? t("untertitelModell") : t("untertitelLaufend");
  const zusammenfassung =
    d.quelle === "modell"
      ? t("zusammenfassungModell")
      : d.posten.length === 0
        ? t("zusammenfassungLeer")
        : t("zusammenfassung", { anzahl: d.posten.length, offen: offene.length, geschaetzt: geschaetzte.length });

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
      { label: t("meta.posten"), wert: String(d.posten.length) },
    ],
    kennzahlen: kennzahlKarten,
    zusammenfassung,
    abschnitte: [
      { titel: t("abschnittKennzahlen"), html: kennzahlTabelle },
      {
        titel: t("abschnittPosten"),
        html:
          (postenZeilen.length > 0
            ? tabelle([e("form.art"), e("form.kategorie"), e("form.bezeichnung"), e("form.datum"), e("form.betrag"), e("form.herkunft")], postenZeilen, [4])
            : leerHinweis(t("leerPosten"))) + definitionen(summen),
      },
      { titel: t("abschnittAnnahmen"), html: annahmenHtml },
      { titel: t("abschnittPlanIst"), html: absatz(e("planIst.lead")) + planIstHtml },
      ...(hinweise.length > 0 ? [{ titel: t("abschnittHinweise"), html: kasten(t("hinweiseTitel"), hinweise, "warnung") }] : []),
    ],
    freigabe: [x.t("roles")("ceo"), x.t("roles")("buchhaltung")],
  });
}
