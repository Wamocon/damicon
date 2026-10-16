// Das Kachelmodell der Wirtschaftlichkeitsseite: rechnet einmal, formatiert
// einmal, und liefert fertige Kacheln an die Ansicht.
//
// Warum getrennt von der Ansicht: Die Rechnung und ihre Formatierung sind das
// Empfindliche an dieser Seite, das Layout ist es nicht. Getrennt laesst sich
// die Darstellung umbauen, ohne dass jemand versehentlich eine Zahl anfasst.
//
// Seit WMCNL-2470 rechnet die Seite aus erfassten Posten (lib/domain/
// wirtschaftlichkeit-erfassung.ts) statt aus Konstanten. Die Konstanten sind
// nur noch der Rueckfall ohne Datenbank: dort rechnet dieselbe Funktion aus den
// Modellwerten, der Test haelt fest, dass dabei die Vorgabewerte herauskommen.
// Was nicht erfasst ist, steht auf "offen", nie auf null.

import type { ReactNode } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { kalendertag } from "@/lib/format/datum";
import {
  Barwert,
  KostenJeKilogramm,
  RoiKurve,
  TcoStapel,
  type Diagrammtexte,
} from "@/components/db/wirtschaftlichkeit-diagramme";
import {
  barwertReihe,
  roiReihe,
  tcoBausteine,
  type Herkunft,
  type Kennzahlschluessel,
  type Monatspunkt,
} from "@/lib/domain/wirtschaftlichkeit";
import {
  euroInRubelMit,
  euroInTengeMit,
  tengeInRubelMit,
  type Annahmen,
  type Rechenstand,
} from "@/lib/domain/wirtschaftlichkeit-erfassung";
import type { Tone } from "@/components/ui/kit";
import type { Kachelfelder } from "@/components/db/kennzahl-karte";

export type Diagrammart =
  | "roiJahr1"
  | "roiHorizont"
  | "tcoCapex"
  | "tcoOpex"
  | "barwert"
  | "kostenJeKilogramm"
  | "keines";

export interface Kachel extends Kachelfelder {
  /** Zugleich der Schluessel der Herkunft in Rechenstand - ein Tippfehler faellt beim Typecheck auf. */
  schluessel: Kennzahlschluessel;
  rechenweg: string;
  diagramm: Diagrammart;
}

/** Woher die Zahlen kommen: Modellwerte ohne Datenbank, erfasste Posten oder ein festgehaltener Stand. */
export type Rechenquelle = "modell" | "erfasst" | "stand";

/** Die Eingabe der Kacheln und Diagramme: ein Rechenstand mit den Annahmen, mit denen er gerechnet wurde (Kurs, Zins). */
export interface Rechnung {
  stand: Rechenstand;
  annahmen: Annahmen;
  /** Jahre des Horizonts der Rechnung (drei bis fuenf): wie lang Rendite, Gesamtkosten und Kapitalwert laufen. */
  jahre: number;
  /** ROI und Kapitalwert der erfassten Ist-Werte auf der Achse der Plankurven; null ohne Ist-Werte. */
  istPunkte: { roi: Monatspunkt[]; barwert: Monatspunkt[] } | null;
}

export interface Modell {
  /** Die sechs eingerahmten Kennzahlen, je mit eigenem Diagramm. */
  fokus: Kachel[];
  /** Die vier kleineren, im Aufklapper, ohne Diagramm. */
  weitere: Kachel[];
  /** Der Satz ueber dem Raster: die Annahme, auf der alles steht. */
  jahresnutzenSatz: string;
  /** Kennzeichnung der Seite: woher die Zahlen kommen und wie belastbar sie sind. */
  pille: { text: string; ton: Tone };
  hinweis: string;
  kursHinweis: string;
  geschaetztLabel: string;
  offenLabel: string;
}

/**
 * Eine Kachel, bevor ihre Herkunft angehaengt wird. Die Stufe kommt aus dem
 * Rechenstand - eine Quelle, nicht zwei.
 */
type Kachelentwurf = Omit<Kachel, "herkunft">;

type Uebersetzer = Awaited<ReturnType<typeof getTranslations>>;

/** Der Satz ueber dem Kachelraster: die Annahme, auf der alles steht, und ob sie belegt ist. */
function jahresnutzenSatzFuer(t: Uebersetzer, werte: { tenge: string; rubel: string } | null, modellrechnung: boolean, herkunft: Herkunft): string {
  if (werte === null) return t("jahresnutzenOffen");
  if (modellrechnung) return t("jahresnutzenSatz", werte);
  return herkunft === "belegt" ? t("jahresnutzenBelegt", werte) : t("jahresnutzenGeschaetzt", werte);
}

/** Kennzeichnung der ganzen Seite: die schwaechste Stufe aller Kacheln bestimmt sie. */
function pilleFuer(t: Uebersetzer, modellrechnung: boolean, kacheln: Kachel[]): Modell["pille"] {
  if (modellrechnung) return { text: t("modellPille"), ton: "warning" };
  if (kacheln.some((x) => x.herkunft === "offen")) return { text: t("pille.offen"), ton: "neutral" };
  if (kacheln.some((x) => x.herkunft === "geschaetzt")) return { text: t("pille.geschaetzt"), ton: "warning" };
  return { text: t("pille.belegt"), ton: "success" };
}

function hinweisFuer(t: Uebersetzer, k: { quelle: Rechenquelle; postenAnzahl: number; standName?: string; standDatum?: string }, stichtag: string): string {
  if (k.quelle === "modell") return t("modellHinweis", { stichtag });
  if (k.quelle === "stand") return t("standHinweis", { name: k.standName ?? "", datum: k.standDatum ?? "" });
  return k.postenAnzahl === 0 ? t("erfasstLeer") : t("erfasstHinweis", { anzahl: k.postenAnzahl });
}

/** Was die Kacheln brauchen: Texte, die Rechenergebnisse und die Formate (Tenge, Rubel, Prozent), einmal in baueModell aufgebaut. */
interface Formate {
  t: Uebersetzer;
  stand: Rechenstand;
  annahmen: Annahmen;
  kurse: Annahmen["kurse"];
  modellrechnung: boolean;
  /** Jahre des Horizonts; steht in den Namen und Rechenwegen der Horizont-Kennzahlen. */
  jahre: number;
  anteil: (wert: number) => string;
  genau: (n: number) => string;
  geld: (euro: number | null) => Pick<Kachelentwurf, "wert" | "klammer" | "genau">;
  prozent: (wert: number | null) => string;
  mitHerkunft: (entwuerfe: Kachelentwurf[]) => Kachel[];
}

/** Die sechs eingerahmten Kennzahlen, je mit Diagramm. */
function fokusKacheln(f: Formate): Kachel[] {
  const { t, stand, annahmen, kurse, modellrechnung, jahre, anteil, genau, geld, prozent, mitHerkunft } = f;
  const k = stand.kennzahlen;
  return mitHerkunft([
    {
      schluessel: "roiJahr1",
      label: t("kennzahl.roiJahr1.label"),
      frage: t("kennzahl.roiJahr1.frage"),
      wert: prozent(k.roiJahr1),
      rechenweg: t("kennzahl.roiJahr1.rechenweg"),
      diagramm: k.roiJahr1 === null ? "keines" : "roiJahr1",
    },
    {
      schluessel: "roiHorizont",
      label: t("kennzahl.roiHorizont.label", { jahre }),
      frage: t("kennzahl.roiHorizont.frage"),
      wert: prozent(k.roiHorizont),
      rechenweg: t("kennzahl.roiHorizont.rechenweg", { jahre }),
      diagramm: k.roiHorizont === null ? "keines" : "roiHorizont",
    },
    {
      schluessel: "capex",
      label: t("kennzahl.capex.label"),
      frage: t("kennzahl.capex.frage"),
      ...geld(stand.capexEur),
      rechenweg: modellrechnung ? t("kennzahl.capex.rechenweg") : t("kennzahl.capex.rechenwegErfasst"),
      diagramm: k.tcoHorizont === null ? "keines" : "tcoCapex",
    },
    {
      schluessel: "opex",
      label: t("kennzahl.opex.label"),
      frage: t("kennzahl.opex.frage"),
      ...geld(stand.opexEur),
      rechenweg: modellrechnung ? t("kennzahl.opex.rechenweg") : t("kennzahl.opex.rechenwegErfasst"),
      diagramm: k.tcoHorizont === null ? "keines" : "tcoOpex",
    },
    {
      schluessel: "kapitalwert",
      label: t("kennzahl.kapitalwert.label"),
      frage: t("kennzahl.kapitalwert.frage"),
      ...geld(k.kapitalwert),
      rechenweg: t("kennzahl.kapitalwert.rechenweg", { zins: anteil(annahmen.kalkulationszins), jahre }),
      diagramm: k.kapitalwert === null ? "keines" : "barwert",
    },
    {
      schluessel: "kostenJeKilogramm",
      label: t("kennzahl.kostenJeKilogramm.label"),
      frage: t("kennzahl.kostenJeKilogramm.frage"),
      // Betriebszahl, entsteht in Tenge und durchlaeuft den Euro nie.
      wert: k.kostenJeKgNachherTenge === null ? t("offen") : `${genau(k.kostenJeKgNachherTenge)} ₸/${t("einheit.kilogramm")}`,
      klammer: k.kostenJeKgNachherTenge === null ? undefined : `${genau(tengeInRubelMit(k.kostenJeKgNachherTenge, kurse))} ₽/${t("einheit.kilogramm")}`,
      rechenweg:
        k.ersparnisJeKgTenge !== null && stand.vollkostenVorherTenge !== null && stand.mengeKg !== null
          ? t("kennzahl.kostenJeKilogramm.rechenwegMitWerten", {
              vorher: genau(stand.vollkostenVorherTenge),
              ersparnis: genau(k.ersparnisJeKgTenge),
              menge: genau(stand.mengeKg),
            })
          : stand.mengeKg === null
            ? t("kennzahl.kostenJeKilogramm.rechenwegMengeOffen")
            : t("kennzahl.kostenJeKilogramm.rechenweg"),
      diagramm: k.kostenJeKgNachherTenge === null ? "keines" : "kostenJeKilogramm",
    },
  ]);
}

/** Die vier kleineren Kennzahlen im Aufklapper, ohne Diagramm. */
function weitereKacheln(f: Formate): Kachel[] {
  const { t, stand, annahmen, modellrechnung, jahre, geld, mitHerkunft } = f;
  const k = stand.kennzahlen;
  return mitHerkunft([
    {
      schluessel: "amortisation",
      label: t("kennzahl.amortisation.label"),
      frage: t("kennzahl.amortisation.frage"),
      wert: k.amortisationMonate === null ? t("offen") : t("einheit.monate", { anzahl: Math.round(k.amortisationMonate) }),
      rechenweg: t("kennzahl.amortisation.rechenweg"),
      diagramm: "keines",
    },
    {
      schluessel: "tco",
      label: t("kennzahl.tco.label", { jahre }),
      frage: t("kennzahl.tco.frage"),
      ...geld(k.tcoHorizont),
      rechenweg: t("kennzahl.tco.rechenweg", { jahre }),
      diagramm: "keines",
    },
    {
      schluessel: "vermiedeneKosten",
      label: t("kennzahl.vermiedeneKosten.label"),
      frage: t("kennzahl.vermiedeneKosten.frage"),
      ...geld(stand.nutzenEur),
      rechenweg: modellrechnung ? t("kennzahl.vermiedeneKosten.rechenweg") : t("kennzahl.vermiedeneKosten.rechenwegErfasst"),
      diagramm: "keines",
    },
    {
      schluessel: "nutzenbeginn",
      label: t("kennzahl.nutzenbeginn.label"),
      frage: t("kennzahl.nutzenbeginn.frage"),
      wert: annahmen.nutzenbeginnWochen === null ? t("offen") : t("einheit.wochenSpanne", annahmen.nutzenbeginnWochen),
      rechenweg: t("kennzahl.nutzenbeginn.rechenweg"),
      diagramm: "keines",
    },
  ]);
}

/** Baut das Modell. Server Component, holt Uebersetzungen und Formatter selbst. */
export async function baueModell(
  rechnung: Rechnung,
  kontext: { quelle: Rechenquelle; postenAnzahl: number; standName?: string; standDatum?: string },
): Promise<Modell> {
  const t = await getTranslations("wirtschaftlichkeitAnsicht");
  const format = await getFormatter();
  const { stand, annahmen } = rechnung;
  const kurse = annahmen.kurse;
  const modellrechnung = kontext.quelle === "modell";

  // Tenge fuehrend, Rubel in Klammern - beide aus demselben Euro-Wert und
  // demselben Stichtagskurs, sonst stimmt das Verhaeltnis nicht. Kompakt,
  // weil ein CAPEX von 154.000 EUR in Tenge achtstellig wird und eine
  // achtstellige Zahl in einer Kachel niemand liest.
  const kurz = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const genau = (n: number) => format.number(Math.round(n));
  const tenge = (euro: number) => `${kurz(euroInTengeMit(euro, kurse))} ₸`;
  const rubel = (euro: number) => `${kurz(euroInRubelMit(euro, kurse))} ₽`;
  const tengeGenau = (euro: number) => `${genau(euroInTengeMit(euro, kurse))} ₸`;
  const rubelGenau = (euro: number) => `${genau(euroInRubelMit(euro, kurse))} ₽`;
  const anteil = (wert: number) => format.number(wert, { style: "percent", maximumFractionDigits: 0 });
  const stichtag = kalendertag(format, annahmen.kursStichtag);

  /** Ein Geldbetrag in Euro als Kachelfelder; ohne Wert "offen". */
  const geld = (euro: number | null): Pick<Kachelentwurf, "wert" | "klammer" | "genau"> =>
    euro === null ? { wert: t("offen") } : { wert: tenge(euro), klammer: rubel(euro), genau: tengeGenau(euro) };
  const prozent = (wert: number | null): string => (wert === null ? t("offen") : anteil(wert));
  const mitHerkunft = (entwuerfe: Kachelentwurf[]): Kachel[] => entwuerfe.map((e) => ({ ...e, herkunft: stand.herkunft[e.schluessel] }));

  const formate: Formate = { t, stand, annahmen, kurse, modellrechnung, jahre: rechnung.jahre, anteil, genau, geld, prozent, mitHerkunft };
  const fokus = fokusKacheln(formate);
  const weitere = weitereKacheln(formate);

  // Beide Betraege ungekuerzt: das ist die Annahme, auf der die ganze Rechnung steht. Ein "102,7 Mio." daneben
  // wuerde sie beilaeufig aussehen lassen, und gekuerzt neben ungekuerzt liest sich wie ein Fehler.
  const nutzenWerte = stand.nutzenEur === null ? null : { tenge: tengeGenau(stand.nutzenEur), rubel: rubelGenau(stand.nutzenEur) };

  return {
    fokus,
    weitere,
    jahresnutzenSatz: jahresnutzenSatzFuer(t, nutzenWerte, modellrechnung, stand.herkunft.vermiedeneKosten),
    pille: pilleFuer(t, modellrechnung, [...fokus, ...weitere]),
    hinweis: hinweisFuer(t, kontext, stichtag),
    // Die Quelle des Kurses steht in den Annahmen und ist frei erfasst; ohne Angabe (Modellwerte) gilt der Wortlaut der Nationalbank.
    kursHinweis:
      annahmen.kursQuelle && !modellrechnung
        ? t("kursHinweisQuelle", { stichtag, euro: format.number(kurse.eurTenge, { maximumFractionDigits: 2 }), rubel: format.number(kurse.rubTenge, { maximumFractionDigits: 2 }), quelle: annahmen.kursQuelle })
        : t("kursHinweis", { stichtag, euro: format.number(kurse.eurTenge, { maximumFractionDigits: 2 }), rubel: format.number(kurse.rubTenge, { maximumFractionDigits: 2 }) }),
    geschaetztLabel: t("geschaetzt"),
    offenLabel: t("offen"),
  };
}

/**
 * Waehlt das Diagramm zur Kachel. Server Component, die eine Client-Insel
 * rendert - die recharts-Kinder liegen alle drueben in
 * wirtschaftlichkeit-diagramme.tsx.
 */
export async function Diagramm({ art, rechnung }: { art: Diagrammart; rechnung: Rechnung }): Promise<ReactNode> {
  if (art === "keines") return null;

  const { stand, annahmen, istPunkte, jahre } = rechnung;
  const horizontMonate = jahre * 12;
  const { capexEur: capex, opexEur: opex, nutzenEur: nutzen } = stand;
  const t = await getTranslations("wirtschaftlichkeitAnsicht");
  const locale = await getLocale();
  const texte: Diagrammtexte = {
    wert: t("diagramm.wert"),
    nulllinie: t("diagramm.nulllinie"),
    ist: t("diagramm.ist"),
  };
  const bisMonat = (reihe: Monatspunkt[] | undefined, monate: number) => reihe?.filter((p) => p.monat <= monate);

  switch (art) {
    case "roiJahr1":
      // Nur bis Monat 12: sonst zeigt die Jahr-1-Kachel dieselbe Kurve wie
      // die Drei-Jahres-Kachel daneben, und die Marke bei 12 ist der einzige
      // Unterschied. Zwei Bilder, die gleich aussehen, erklaeren nichts.
      if (capex === null || opex === null || nutzen === null) return null;
      return <RoiKurve punkte={roiReihe(12, capex, opex, nutzen)} ist={bisMonat(istPunkte?.roi, 12)} markeMonat={12} locale={locale} texte={texte} />;
    case "roiHorizont":
      if (capex === null || opex === null || nutzen === null) return null;
      return <RoiKurve punkte={roiReihe(horizontMonate, capex, opex, nutzen)} ist={istPunkte?.roi} markeMonat={horizontMonate} locale={locale} texte={texte} />;
    case "barwert": {
      if (capex === null || opex === null || nutzen === null) return null;
      const reihe = barwertReihe(horizontMonate, capex, opex, nutzen, annahmen.kalkulationszins);
      const durchgang = reihe.findIndex((p) => p.wert >= 0);
      return (
        <Barwert
          punkte={reihe.map((p) => ({ monat: p.monat, wert: euroInTengeMit(p.wert, annahmen.kurse) }))}
          ist={istPunkte?.barwert.map((p) => ({ monat: p.monat, wert: euroInTengeMit(p.wert, annahmen.kurse) }))}
          nulldurchgang={durchgang === -1 ? null : durchgang}
          locale={locale}
          texte={texte}
        />
      );
    }
    case "tcoCapex":
    case "tcoOpex":
      if (capex === null || opex === null) return null;
      return (
        <TcoStapel
          teile={tcoBausteine(jahre, capex, opex).map((b) => ({
            name: b.name === "capex" ? t("stapel.capex") : t("stapel.opexJahr", { jahr: b.jahr }),
            wert: euroInTengeMit(b.wert, annahmen.kurse),
            betont: art === "tcoCapex" ? b.name === "capex" : b.name === "opex",
          }))}
          locale={locale}
          texte={texte}
        />
      );
    case "kostenJeKilogramm": {
      const nachher = stand.kennzahlen.kostenJeKgNachherTenge;
      if (nachher === null || stand.vollkostenVorherTenge === null) return null;
      return (
        <KostenJeKilogramm
          vorher={stand.vollkostenVorherTenge}
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
