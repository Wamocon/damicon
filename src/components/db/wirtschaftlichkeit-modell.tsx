// Das Kachelmodell der Wirtschaftlichkeitsseite: rechnet einmal, formatiert
// einmal, und liefert fertige Kacheln an die Ansicht.
//
// Warum getrennt von der Ansicht: Die Rechnung und ihre Formatierung sind das
// Empfindliche an dieser Seite, das Layout ist es nicht. Getrennt laesst sich
// die Darstellung umbauen, ohne dass jemand versehentlich eine Zahl anfasst.

import type { ReactNode } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import {
  Barwert,
  KostenJeKilogramm,
  RoiKurve,
  TcoStapel,
  type Diagrammtexte,
} from "@/components/db/wirtschaftlichkeit-diagramme";
import {
  CAPEX_EUR,
  HORIZONT_JAHRE,
  HORIZONT_MONATE,
  JAHRESNUTZEN_EUR,
  KURS_EUR_TENGE,
  KURS_RUB_TENGE,
  KURS_STICHTAG,
  NUTZENBEGINN_WOCHEN,
  OPEX_EUR_PRO_JAHR,
  VERMARKTETE_MENGE_KG,
  VOLLKOSTEN_JE_KG_VORHER_TENGE,
  amortisationMonate,
  barwertReihe,
  ersparnisJeKilogramm,
  euroInRubel,
  euroInTenge,
  kapitalwert,
  kostenJeKilogrammNachher,
  roi,
  roiReihe,
  tco,
  tcoBausteine,
  tengeInRubel,
  type Herkunft,
} from "@/lib/domain/wirtschaftlichkeit";

export type Diagrammart =
  | "roiJahr1"
  | "roiDreiJahre"
  | "tcoCapex"
  | "tcoOpex"
  | "barwert"
  | "kostenJeKilogramm"
  | "keines";

export interface Kachel {
  schluessel: string;
  /** Kurzer Name der Kennzahl. */
  label: string;
  /** Die Frage, die sie beantwortet - aus der Vorgabe der Geschaeftsfuehrung. */
  frage: string;
  /** Fertig formatierter Hauptwert: Tenge, Prozent, Monate oder Wochen. */
  wert: string;
  /** Derselbe Betrag in Rubel, ohne Klammern. Nur bei Geldbetraegen gesetzt. */
  klammer?: string;
  /** Genauer Wert fuer das title-Attribut, wenn der Hauptwert gekuerzt ist. */
  genau?: string;
  rechenweg: string;
  herkunft: Herkunft;
  diagramm: Diagrammart;
}

export interface Modell {
  /** Die sechs eingerahmten Kennzahlen, je mit eigenem Diagramm. */
  fokus: Kachel[];
  /** Die vier kleineren, im Aufklapper, ohne Diagramm. */
  weitere: Kachel[];
  /** Der Satz ueber dem Raster: die Annahme, auf der alles steht. */
  jahresnutzenSatz: string;
  modellHinweis: string;
  kursHinweis: string;
  geschaetztLabel: string;
  offenLabel: string;
}

/** Baut das Modell. Server Component, holt Uebersetzungen und Formatter selbst. */
export async function baueModell(): Promise<Modell> {
  const t = await getTranslations("wirtschaftlichkeitAnsicht");
  const format = await getFormatter();

  // Tenge fuehrend, Rubel in Klammern - beide aus demselben Euro-Wert und
  // demselben Stichtagskurs, sonst stimmt das Verhaeltnis nicht. Kompakt,
  // weil ein CAPEX von 154.000 EUR in Tenge achtstellig wird und eine
  // achtstellige Zahl in einer Kachel niemand liest.
  const kurz = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const genau = (n: number) => format.number(Math.round(n));
  const tenge = (euro: number) => `${kurz(euroInTenge(euro))} ₸`;
  const rubel = (euro: number) => `${kurz(euroInRubel(euro))} ₽`;
  const tengeGenau = (euro: number) => `${genau(euroInTenge(euro))} ₸`;
  const rubelGenau = (euro: number) => `${genau(euroInRubel(euro))} ₽`;
  const anteil = (wert: number) => format.number(wert, { style: "percent", maximumFractionDigits: 0 });

  const monate = amortisationMonate();
  const kapital = kapitalwert();
  const jeKgNachher = kostenJeKilogrammNachher();
  const ersparnis = ersparnisJeKilogramm();

  const fokus: Kachel[] = [
    {
      schluessel: "roiJahr1",
      label: t("kennzahl.roiJahr1.label"),
      frage: t("kennzahl.roiJahr1.frage"),
      wert: anteil(roi(1) ?? 0),
      rechenweg: t("kennzahl.roiJahr1.rechenweg"),
      herkunft: "belegt",
      diagramm: "roiJahr1",
    },
    {
      schluessel: "roiDreiJahre",
      label: t("kennzahl.roiDreiJahre.label"),
      frage: t("kennzahl.roiDreiJahre.frage"),
      wert: anteil(roi(HORIZONT_JAHRE) ?? 0),
      rechenweg: t("kennzahl.roiDreiJahre.rechenweg"),
      herkunft: "belegt",
      diagramm: "roiDreiJahre",
    },
    {
      schluessel: "capex",
      label: t("kennzahl.capex.label"),
      frage: t("kennzahl.capex.frage"),
      wert: tenge(CAPEX_EUR),
      klammer: rubel(CAPEX_EUR),
      genau: tengeGenau(CAPEX_EUR),
      rechenweg: t("kennzahl.capex.rechenweg"),
      herkunft: "belegt",
      diagramm: "tcoCapex",
    },
    {
      schluessel: "opex",
      label: t("kennzahl.opex.label"),
      frage: t("kennzahl.opex.frage"),
      wert: tenge(OPEX_EUR_PRO_JAHR),
      klammer: rubel(OPEX_EUR_PRO_JAHR),
      genau: tengeGenau(OPEX_EUR_PRO_JAHR),
      rechenweg: t("kennzahl.opex.rechenweg"),
      herkunft: "belegt",
      diagramm: "tcoOpex",
    },
    {
      schluessel: "kapitalwert",
      label: t("kennzahl.kapitalwert.label"),
      frage: t("kennzahl.kapitalwert.frage"),
      wert: tenge(kapital),
      klammer: rubel(kapital),
      genau: tengeGenau(kapital),
      rechenweg: t("kennzahl.kapitalwert.rechenweg"),
      herkunft: "geschaetzt",
      diagramm: "barwert",
    },
    {
      schluessel: "kostenJeKilogramm",
      label: t("kennzahl.kostenJeKilogramm.label"),
      frage: t("kennzahl.kostenJeKilogramm.frage"),
      // Betriebszahl, entsteht in Tenge und durchlaeuft den Euro nie.
      wert:
        jeKgNachher === null
          ? t("offen")
          : `${genau(jeKgNachher)} ₸/${t("einheit.kilogramm")}`,
      klammer:
        jeKgNachher === null
          ? undefined
          : `${genau(tengeInRubel(jeKgNachher))} ₽/${t("einheit.kilogramm")}`,
      rechenweg:
        ersparnis === null
          ? t("kennzahl.kostenJeKilogramm.rechenweg")
          : t("kennzahl.kostenJeKilogramm.rechenwegMitWerten", {
              vorher: genau(VOLLKOSTEN_JE_KG_VORHER_TENGE),
              ersparnis: genau(ersparnis),
              menge: genau(VERMARKTETE_MENGE_KG),
            }),
      herkunft: "geschaetzt",
      diagramm: "kostenJeKilogramm",
    },
  ];

  const weitere: Kachel[] = [
    {
      schluessel: "amortisation",
      label: t("kennzahl.amortisation.label"),
      frage: t("kennzahl.amortisation.frage"),
      wert: monate === null ? t("offen") : t("einheit.monate", { anzahl: Math.round(monate) }),
      rechenweg: t("kennzahl.amortisation.rechenweg"),
      herkunft: "belegt",
      diagramm: "keines",
    },
    {
      schluessel: "tco",
      label: t("kennzahl.tco.label"),
      frage: t("kennzahl.tco.frage"),
      wert: tenge(tco(HORIZONT_JAHRE)),
      klammer: rubel(tco(HORIZONT_JAHRE)),
      genau: tengeGenau(tco(HORIZONT_JAHRE)),
      rechenweg: t("kennzahl.tco.rechenweg"),
      herkunft: "belegt",
      diagramm: "keines",
    },
    {
      schluessel: "vermiedeneKosten",
      label: t("kennzahl.vermiedeneKosten.label"),
      frage: t("kennzahl.vermiedeneKosten.frage"),
      wert: tenge(JAHRESNUTZEN_EUR),
      klammer: rubel(JAHRESNUTZEN_EUR),
      genau: tengeGenau(JAHRESNUTZEN_EUR),
      rechenweg: t("kennzahl.vermiedeneKosten.rechenweg"),
      herkunft: "geschaetzt",
      diagramm: "keines",
    },
    {
      schluessel: "nutzenbeginn",
      label: t("kennzahl.nutzenbeginn.label"),
      frage: t("kennzahl.nutzenbeginn.frage"),
      wert: t("einheit.wochenSpanne", { von: NUTZENBEGINN_WOCHEN.von, bis: NUTZENBEGINN_WOCHEN.bis }),
      rechenweg: t("kennzahl.nutzenbeginn.rechenweg"),
      herkunft: "belegt",
      diagramm: "keines",
    },
  ];

  return {
    fokus,
    weitere,
    // Beide Betraege ungekuerzt: das ist die Annahme, auf der die ganze
    // Rechnung steht. Ein "102,7 Mio." daneben wuerde sie beilaeufig
    // aussehen lassen, und gekuerzt neben ungekuerzt liest sich wie ein
    // Fehler.
    jahresnutzenSatz: t("jahresnutzenSatz", {
      tenge: tengeGenau(JAHRESNUTZEN_EUR),
      rubel: rubelGenau(JAHRESNUTZEN_EUR),
    }),
    modellHinweis: t("modellHinweis", { stichtag: KURS_STICHTAG }),
    kursHinweis: t("kursHinweis", {
      stichtag: KURS_STICHTAG,
      euro: format.number(KURS_EUR_TENGE, { maximumFractionDigits: 2 }),
      rubel: format.number(KURS_RUB_TENGE, { maximumFractionDigits: 2 }),
    }),
    geschaetztLabel: t("geschaetzt"),
    offenLabel: t("offen"),
  };
}

/**
 * Waehlt das Diagramm zur Kachel. Server Component, die eine Client-Insel
 * rendert - die recharts-Kinder liegen alle drueben in
 * wirtschaftlichkeit-diagramme.tsx.
 */
export async function Diagramm({ art }: { art: Diagrammart }): Promise<ReactNode> {
  if (art === "keines") return null;

  const t = await getTranslations("wirtschaftlichkeitAnsicht");
  const locale = await getLocale();
  const texte: Diagrammtexte = {
    monat: t("diagramm.monat"),
    wert: t("diagramm.wert"),
    jahr: t("diagramm.jahr"),
    nulllinie: t("diagramm.nulllinie"),
  };

  switch (art) {
    case "roiJahr1":
      // Nur bis Monat 12: sonst zeigt die Jahr-1-Kachel dieselbe Kurve wie
      // die Drei-Jahres-Kachel daneben, und die Marke bei 12 ist der einzige
      // Unterschied. Zwei Bilder, die gleich aussehen, erklaeren nichts.
      return <RoiKurve punkte={roiReihe(12)} markeMonat={12} locale={locale} texte={texte} />;
    case "roiDreiJahre":
      return (
        <RoiKurve punkte={roiReihe()} markeMonat={HORIZONT_MONATE} locale={locale} texte={texte} />
      );
    case "barwert": {
      const reihe = barwertReihe();
      const durchgang = reihe.findIndex((p) => p.wert >= 0);
      return (
        <Barwert
          punkte={reihe.map((p) => ({ monat: p.monat, wert: euroInTenge(p.wert) }))}
          nulldurchgang={durchgang === -1 ? null : durchgang}
          locale={locale}
          texte={texte}
        />
      );
    }
    case "tcoCapex":
    case "tcoOpex":
      return (
        <TcoStapel
          teile={tcoBausteine().map((b) => ({
            name: b.name === "capex" ? t("stapel.capex") : t("stapel.opexJahr", { jahr: b.jahr }),
            wert: euroInTenge(b.wert),
            betont: art === "tcoCapex" ? b.name === "capex" : b.name === "opex",
          }))}
          locale={locale}
          texte={texte}
        />
      );
    case "kostenJeKilogramm": {
      const nachher = kostenJeKilogrammNachher();
      if (nachher === null) return null;
      return (
        <KostenJeKilogramm
          vorher={VOLLKOSTEN_JE_KG_VORHER_TENGE}
          nachher={nachher}
          locale={locale}
          texte={texte}
          beschriftung={{ vorher: t("jeKilogramm.vorher"), nachher: t("jeKilogramm.nachher") }}
        />
      );
    }
    default:
      return null;
  }
}
