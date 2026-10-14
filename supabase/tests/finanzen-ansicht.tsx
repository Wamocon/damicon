import { NextIntlClientProvider, createFormatter, createTranslator } from "next-intl";
import { prerender } from "react-dom/static";
import type { SessionProfile } from "../../src/lib/auth";
import type { FinanzenFilter, FinanzenUebersicht } from "../../src/lib/data/finanzen";
import type { DeckungsbeitragChargeZeile, DeckungsbeitragZeile, LedgerEintrag } from "../../src/lib/domain/finanzen";
import type { Role } from "../../src/lib/rbac";
import { ersetzeModule } from "./hilfen/modul-ersatz";
import { pruefer, texteVon } from "./hilfen/ansicht-probe";
import {
  abschnitt,
  abschnittTitel,
  aufklapper,
  kacheln,
  knoepfe,
  leerzustaende,
  leiste,
  optionen,
  pillen,
  tabellenKoepfe,
  tabellenZeilen,
  textVon,
  versteckt,
} from "./hilfen/markup-auszug";

// Charakterisierung der Finanzansicht (db/finanzen-ansicht.tsx), ohne Browser und ohne Datenbank (seit 14.10.2026):
//   * Datenladen: Übersicht mit Zeitraum, Typ und Zeilenzahl aus der Adresszeile, parallel zur Anmeldung; danach nur die
//     Auswahllisten des offenen Reiters und nur mit Buchungsrecht bei Live-Daten.
//   * Kopf: Zeitraum-Pillen, Monatsliste mit versteckten Feldern, drei Kennzahlkacheln mit Zeitraum und Gesamtwert.
//   * Reiter Kostenträger, Je Charge und Buchungen: Tabellenzeilen mit fehlenden Werten, Ton des Deckungsbeitrags, Wert je
//     Kilogramm, Nachladezeile, Startzeilen am Handy, Typfilter, Anlegen-Formulare, leere Tabellen mit und ohne Anlegen-Knopf.
//   * Verweise: Reiter nehmen Zeitraum und Typ mit, nicht die Zeilenzahl; "Alle" entfernt den Typ.
//   * Rechte je Rolle, Demo und Lesefehler.
// Server-Bausteine sind ersetzt (hilfen/modul-ersatz.ts): next-intl/server liefert Übersetzer, Formatierer und Sprache aus den echten
// Texten, getSessionProfile die Anmeldung der Lage, die Lader aus lib/data/finanzen feste Daten. Gerendert wird mit prerender, weil
// Ansicht und Quellen-Abzeichen asynchrone Server-Komponenten sind. Abschicken der Formulare bleibt ein Prüfpunkt im Browser.
// Aufruf: npm run test:finanzen-ansicht

const { pruefe, ende } = pruefer();

const de = texteVon("de") as Record<string, Record<string, unknown>>;
const t = de.finanzenAnsicht as Record<string, string> & {
  col: Record<string, string>;
  zeitraum: Record<string, string>;
  formular: Record<"kostentraeger" | "buchung", Record<string, string>>;
};
const quelleText = (de.dashboard as { dataSource: Record<string, string> }).dataSource;
const ZEITZONE = "Europe/Berlin";
const PFAD = "/dashboard/buero/finanzen";

// ---- Lage und Ersatzmodule ---------------------------------------------------------------------------------------------------------
interface Lage {
  profil: SessionProfile | null;
  uebersicht: FinanzenUebersicht;
}
let lage: Lage;
let protokoll: string[] = [];
let filter: FinanzenFilter[] = [];
let textFehler: string[] = [];

/** Antwortet nach einem Zeitgeber-Takt, damit das Protokoll zeigt, was vor und nach dem Eintreffen gestartet wurde. */
function spaeter<T>(name: string, wert: T): Promise<T> {
  protokoll.push(name);
  return new Promise((fertig) =>
    setTimeout(() => {
      protokoll.push(`fertig ${name}`);
      fertig(wert);
    }, 1),
  );
}
const ersatzText = ({ namespace, key }: { namespace?: string; key: string }) => `!!${namespace ? `${namespace}.` : ""}${key}!!`;

ersetzeModule({
  "next-intl/server": {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "de", messages: de, namespace: namespace as never, onError: (e) => textFehler.push(e.message), getMessageFallback: ersatzText }),
    getFormatter: async () => createFormatter({ locale: "de", timeZone: ZEITZONE }),
    getLocale: async () => "de",
  },
  "@/lib/auth": {
    getSessionProfile: () => spaeter("getSessionProfile", lage.profil),
  },
  "@/lib/data/finanzen": {
    ladeFinanzenUebersicht: (f: FinanzenFilter) => {
      filter.push(f);
      return spaeter("ladeFinanzenUebersicht", lage.uebersicht);
    },
    ladeReihenblockOptionen: () => spaeter("ladeReihenblockOptionen", [{ id: "rb1", code: "T-N-A-01" }]),
    ladeSorteOptionen: () => spaeter("ladeSorteOptionen", [{ id: "s1", name: "Polka" }]),
    ladeB2bKundeOptionen: () => spaeter("ladeB2bKundeOptionen", [{ id: "k1", name: "Handelskette A" }]),
    ladeKostentraegerOptionen: () => spaeter("ladeKostentraegerOptionen", [{ id: "kt1", bezeichnung: "T-N-A-01 / 2026-08-30", erntetag: "2026-08-30" }]),
    ladeChargeOptionen: () => spaeter("ladeChargeOptionen", [{ id: "c1", code: "CH-0830-1" }]),
  },
});

type Suche = { bereich?: string; zeitraum?: string; typ?: string; zeilen?: string };

async function ansicht(suche: Suche = {}): Promise<{ html: string; fehler: string[] }> {
  protokoll = [];
  filter = [];
  textFehler = [];
  const konsole: string[] = [];
  const echt = console.error;
  console.error = (...a: unknown[]) => konsole.push(a.map(String).join(" "));
  try {
    const { FinanzenAnsicht } = await import("../../src/components/db/finanzen-ansicht");
    const element = await FinanzenAnsicht({ pfad: PFAD, suche });
    const { prelude } = await prerender(
      <NextIntlClientProvider locale="de" timeZone={ZEITZONE} messages={de} onError={(e) => textFehler.push(e.message)} getMessageFallback={ersatzText}>
        {element}
      </NextIntlClientProvider>,
    );
    const html = await new Response(prelude).text();
    // Bekannt und hier ohne Belang: das Pfadfeld der Formulare meldet ohne Router value={null}.
    const fehler = [...textFehler, ...konsole.filter((z) => !z.includes("`value` prop on `%s` should not be null")), ...(html.match(/!![^!]+!!/g) ?? [])];
    return { html, fehler };
  } finally {
    console.error = echt;
  }
}

// ---- Testdaten ---------------------------------------------------------------------------------------------------------------------
const KOSTENTRAEGER: DeckungsbeitragZeile[] = [
  { kostentraegerId: "kt1", bezeichnung: "T-N-A-01 / 2026-08-30", erntetag: "2026-08-30", reihenblockCode: "T-N-A-01", sorteName: "Polka", b2bKundeName: "Handelskette A", erloesTenge: 108780, kostenTenge: 41200, deckungsbeitragTenge: 67580, buchungen: 2, mengeKg: 145.5, deckungsbeitragJeKgTenge: 464.47 },
  { kostentraegerId: "kt2", bezeichnung: "K-A-01 ohne alles", erntetag: null, reihenblockCode: null, sorteName: null, b2bKundeName: null, erloesTenge: 1000.4, kostenTenge: 2500.6, deckungsbeitragTenge: -1500.2, buchungen: 1, mengeKg: null, deckungsbeitragJeKgTenge: null },
  { kostentraegerId: "kt3", bezeichnung: "T-O-A-01 / null", erntetag: "2026-08-31", reihenblockCode: "T-O-A-01", sorteName: "Polana", b2bKundeName: null, erloesTenge: 500, kostenTenge: 500, deckungsbeitragTenge: 0, buchungen: 2, mengeKg: 10, deckungsbeitragJeKgTenge: 0 },
];
const CHARGEN: DeckungsbeitragChargeZeile[] = [
  { chargeId: "c1", chargeCode: "CH-0830-1", ernteDatum: "2026-08-30", reihenblockCode: "T-N-A-01", sorteName: "Polka", mengeKg: 82.25, erloesTenge: 61200, kostenTenge: 23100, deckungsbeitragTenge: 38100, deckungsbeitragJeKgTenge: 464.63, buchungen: 2 },
  { chargeId: "c2", chargeCode: "CH-ohne", ernteDatum: null, reihenblockCode: null, sorteName: null, mengeKg: null, erloesTenge: 100, kostenTenge: 300, deckungsbeitragTenge: -200, deckungsbeitragJeKgTenge: null, buchungen: 1 },
];
const BUCHUNGEN: LedgerEintrag[] = [
  { id: "l1", kostentraegerBezeichnung: "T-N-A-01 / 2026-08-30", typ: "erloes", kategorie: "B2B-Verkauf", betragTenge: 108780, buchungsdatum: "2026-08-30", beschreibung: "Lieferung Handelskette A" },
  { id: "l2", kostentraegerBezeichnung: "K-A-01 ohne alles", typ: "kosten", kategorie: "Zukauf + Handling", betragTenge: 44100.5, buchungsdatum: "2026-08-29", beschreibung: null },
];
const uebersicht = (teil: Partial<FinanzenUebersicht> = {}): FinanzenUebersicht => ({
  quelle: "db",
  deckungsbeitrag: KOSTENTRAEGER,
  deckungsbeitragJeCharge: CHARGEN,
  ledger: BUCHUNGEN,
  mehr: { deckungsbeitrag: true, charge: true, ledger: true },
  summe: { zeitraum: { erloesTenge: 1000, kostenTenge: 2500.5 }, gesamt: { erloesTenge: 50000, kostenTenge: 30000 } },
  monate: ["2026-10", "2026-09", "2026-08"],
  ...teil,
});
const LEER = uebersicht({ deckungsbeitrag: [], deckungsbeitragJeCharge: [], ledger: [], mehr: { deckungsbeitrag: false, charge: false, ledger: false }, monate: [] });
const profil = (role: Role): SessionProfile => ({
  id: `p-${role}`,
  authUserId: `a-${role}`,
  fullName: `Probe ${role}`,
  email: null,
  role,
  brigadeId: null,
  b2bKundeId: null,
  pflueckerId: null,
  darfKontrollieren: false,
});
const setze = (teil: Partial<Lage> = {}) => {
  lage = { profil: profil("buchhaltung"), uebersicht: uebersicht(), ...teil };
};

// ---- Auszüge -----------------------------------------------------------------------------------------------------------------------
const ERSTE_LADUNG = ["ladeFinanzenUebersicht", "getSessionProfile", "fertig ladeFinanzenUebersicht", "fertig getSessionProfile"];
const AUSWAHL_KOSTENTRAEGER = ["ladeReihenblockOptionen", "ladeSorteOptionen", "ladeB2bKundeOptionen"];
const AUSWAHL_BUCHUNGEN = ["ladeKostentraegerOptionen", "ladeChargeOptionen"];
/** Nur die Starts der Lader, ohne die Zeilen "fertig ...". */
const gestartet = () => protokoll.filter((z) => !z.startsWith("fertig "));
const ziel = (query: string) => `/de${PFAD}?${query}`;
const filterText = (f: FinanzenFilter | undefined) => (f ? `zeitraum=${f.zeitraum} typ=${f.typ ?? "-"} zeilen=${f.zeilen}` : "kein Aufruf");
const monatsFormular = (html: string) => html.match(/<form class="flex items-end gap-2"[\s\S]*?<\/form>/)?.[0] ?? null;
const KOSTENTRAEGER_KOPF = [t.col.bezeichnung, t.col.reihenblock, t.col.sorte, t.col.kunde, t.col.erloes, t.col.kosten, t.col.deckungsbeitrag, t.col.deckungsbeitragJeKg].join(" | ");
const CHARGE_KOPF = [t.col.charge, t.col.reihenblock, t.col.sorte, t.col.menge, t.col.erloes, t.col.kosten, t.col.deckungsbeitrag, t.col.deckungsbeitragJeKg].join(" | ");
const BUCHUNG_KOPF = [t.col.datum, t.col.kostentraegerSpalte, t.col.typ, t.col.kategorie, t.col.betrag].join(" | ");

async function main() {
  // ---- 1. Buchhaltung, Live-Daten, Kostenträger ohne Adressparameter ----------------------------------------------------------------
  setze();
  {
    const { html, fehler } = await ansicht();
    pruefe("Kostenträger: baut ohne Fehler, Warnung und fehlenden Schlüssel auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
    pruefe(
      "Datenladen: Übersicht und Anmeldung parallel, danach die drei Auswahllisten des Kostenträger-Formulars parallel",
      protokoll.slice(0, 7).join(",") === [...ERSTE_LADUNG, ...AUSWAHL_KOSTENTRAEGER].join(",") && gestartet().length === 5,
      protokoll.join(","),
    );
    pruefe("Datenladen: Standardfilter Dieser Monat, ohne Typ, zehn Zeilen", filter.length === 1 && filterText(filter[0]) === "zeitraum=monat typ=- zeilen=10", filterText(filter[0]));
    pruefe("Aufbau: Übersicht, Kostenträger, sonst kein Abschnitt", abschnittTitel(html).join(" | ") === `${t.uebersichtTitel} | ${t.kostentraegerTitel}`, abschnittTitel(html).join(" | "));
    const kopf = abschnitt(html, t.uebersichtTitel!);
    pruefe("Übersicht: Einleitung und Live-Abzeichen", kopf.includes(t.uebersichtLead!) && pillen(kopf)[0] === `success:${quelleText.db}`, pillen(kopf)[0]);
    pruefe(
      "Übersicht: Zeitraum-Pillen, Dieser Monat aktiv, Verweise mit Bereich und Zeitraum",
      leiste(html, t.zeitraum.label!).join(" ; ") ===
        [`*${t.zeitraum.monat} -> ${ziel("bereich=kostentraeger&zeitraum=monat")}`, `${t.zeitraum.vormonat} -> ${ziel("bereich=kostentraeger&zeitraum=vormonat")}`, `${t.zeitraum.jahr} -> ${ziel("bereich=kostentraeger&zeitraum=jahr")}`, `${t.zeitraum.alles} -> ${ziel("bereich=kostentraeger&zeitraum=alles")}`].join(" ; "),
      leiste(html, t.zeitraum.label!).join(" ; "),
    );
    const monat = monatsFormular(html) ?? "";
    pruefe("Monatsliste: GET an die Seite, nur der Bereich als verstecktes Feld", monat.includes(`action="/de${PFAD}" method="get"`) && versteckt(monat).join(",") === "bereich=kostentraeger", versteckt(monat).join(","));
    pruefe("Monatsliste: Bitte-Eintrag gewählt, dann die Monate mit Namen", optionen(monat, "zeitraum")?.join(",") === "*:Monat wählen,2026-10:Oktober 2026,2026-09:September 2026,2026-08:August 2026", optionen(monat, "zeitraum")?.join(","));
    pruefe("Monatsliste: Knopf Anzeigen", knoepfe(monat).join(",") === "Anzeigen");
    pruefe(
      "Kacheln: Zeitraum gerundet groß, Gesamtwert darunter, Deckungsbeitrag auch negativ ohne Ton",
      kacheln(html).join(" ; ") === "Erlöse=1.000 ₸ (insgesamt 50.000 ₸) [neutral] ; Kosten=2.501 ₸ (insgesamt 30.000 ₸) [neutral] ; Deckungsbeitrag=-1.500 ₸ (insgesamt 20.000 ₸) [neutral]",
      kacheln(html).join(" ; "),
    );
    pruefe(
      "Reiter: drei Bereiche, Kostenträger aktiv, Verweise mit Zeitraum, ohne Zeilenzahl",
      leiste(html, "Bereiche der Finanzseite").join(" ; ") === [`*Kostenträger -> ${ziel("bereich=kostentraeger&zeitraum=monat")}`, `Je Charge -> ${ziel("bereich=charge&zeitraum=monat")}`, `Buchungen -> ${ziel("bereich=buchungen&zeitraum=monat")}`].join(" ; "),
      leiste(html, "Bereiche der Finanzseite").join(" ; "),
    );
    pruefe("Reiter: aktiver Reiter mit aria-current=page", html.includes(`<a aria-current="page" class="relative inline-flex flex-1`));
    const kt = abschnitt(html, t.kostentraegerTitel!);
    pruefe("Kostenträger: Einleitung mit dem Hinweis auf den Erntetag", kt.includes(`${t.kostentraegerLead} ${t.zeitraum.gefiltertErntetag}`));
    pruefe("Kostenträger: Formular im Aufklapper vor der Tabelle", aufklapper(kt).join(",") === "anlegen-kostentraeger" && kt.indexOf("<details") < kt.indexOf("<table") && kt.includes(t.formular.kostentraeger.titel!) && kt.includes(t.formular.kostentraeger.lead!));
    pruefe(
      "Kostenträger-Formular: die drei geladenen Auswahllisten",
      [optionen(kt, "reihenblock_id"), optionen(kt, "sorte_id"), optionen(kt, "b2b_kunde_id")].map((o) => o?.join(",")).join(" / ") === ":kein Bezug,rb1:T-N-A-01 / :kein Bezug,s1:Polka / :kein Bezug,k1:Handelskette A",
    );
    pruefe("Kostenträger: Startzeilen am Handy und Matrix-Tabelle", kt.includes('<div data-startzeilen=""><div data-matrix="" class="datentabelle'));
    pruefe("Kostenträger: Spaltenköpfe", tabellenKoepfe(kt).join(" / ") === KOSTENTRAEGER_KOPF, tabellenKoepfe(kt).join(" / "));
    const zeilen = tabellenZeilen(kt).map((z) => z.join(" ; "));
    pruefe(
      "Kostenträger: Zeile mit allen Werten, Erntetag als Datum, Wert je Kilogramm ganzzahlig",
      zeilen[0] === "Bezeichnung=T-N-A-01 / 2026-08-30 | 30.08.2026 ; Reihenblock=T-N-A-01 ; Sorte=Polka ; Kunde=Handelskette A ; Erlös=108.780 ₸ ; Kosten=41.200 ₸ ; Deckungsbeitrag=67.580 ₸ ; je Kilogramm=464 ₸/kg",
      zeilen[0],
    );
    pruefe(
      "Kostenträger: fehlende Werte als Strich, ohne Erntetag, Beträge gerundet",
      zeilen[1] === `Bezeichnung=K-A-01 ohne alles | ${t.ohneErntetag} ; Reihenblock=– ; Sorte=– ; Kunde=– ; Erlös=1.000 ₸ ; Kosten=2.501 ₸ ; Deckungsbeitrag=-1.500 ₸ ; je Kilogramm=–`,
      zeilen[1],
    );
    pruefe("Kostenträger: Null als Wert je Kilogramm bleibt eine Zahl", zeilen[2]?.endsWith("je Kilogramm=0 ₸/kg"), zeilen[2]);
    pruefe("Kostenträger: Deckungsbeitrag ab null grün, darunter gelb", pillen(kt).join(",") === "success:67.580 ₸,warning:-1.500 ₸,success:0 ₸", pillen(kt).join(","));
    pruefe("Kostenträger: Nachladezeile über acht Spalten, 25 Zeilen mehr, ohne Typ", zeilen[3] === "*Mehr anzeigen" && kt.includes(`<td colSpan="8" class="px-3 py-2"><a`) && kt.includes(`href="${ziel("bereich=kostentraeger&amp;zeitraum=monat&amp;zeilen=35")}"`));
    pruefe("Hinweis als letzte Karte der Seite", html.includes(`<div class="rounded-2xl border border-border p-5 bg-muted/30 text-xs leading-5 text-muted-foreground">${t.note}</div></div><script>`) && textVon(html).endsWith(t.note!));
  }

  // ---- 2. Zeilenzahl aus der Adresse ----------------------------------------------------------------------------------------------
  {
    setze();
    const { html } = await ansicht({ zeilen: "35" });
    pruefe("Zeilen 35: an den Lader, keine Startzeilen, Nachladen auf 60", filterText(filter[0]) === "zeitraum=monat typ=- zeilen=35" && !html.includes("data-startzeilen") && html.includes("zeilen=60"), filterText(filter[0]));
    pruefe("Zeilen 35: Reiter und Zeitraum-Pillen verlieren die Zeilenzahl", !leiste(html, "Bereiche der Finanzseite").some((v) => v.includes("zeilen")) && !leiste(html, t.zeitraum.label!).some((v) => v.includes("zeilen")));
  }

  // ---- 3. Je Charge mit Monat und Typ in der Adresse -------------------------------------------------------------------------------
  {
    setze();
    const { html, fehler } = await ansicht({ bereich: "charge", zeitraum: "2026-09", typ: "kosten" });
    pruefe("Je Charge: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
    pruefe("Je Charge: der Typ geht nicht an den Lader, keine Auswahllisten", filterText(filter[0]) === "zeitraum=2026-09 typ=- zeilen=10" && gestartet().join(",") === "ladeFinanzenUebersicht,getSessionProfile", `${filterText(filter[0])} / ${protokoll.join(",")}`);
    pruefe("Je Charge: nur Übersicht und Chargen-Abschnitt", abschnittTitel(html).join(" | ") === `${t.uebersichtTitel} | ${t.chargeTitel}`, abschnittTitel(html).join(" | "));
    pruefe(
      "Je Charge: Zeitraum-Pillen ohne aktive, mit Typ im Verweis",
      leiste(html, t.zeitraum.label!).join(" ; ") === ["monat", "vormonat", "jahr", "alles"].map((s) => `${t.zeitraum[s]} -> ${ziel(`bereich=charge&zeitraum=${s}&typ=kosten`)}`).join(" ; "),
      leiste(html, t.zeitraum.label!).join(" ; "),
    );
    const monat = monatsFormular(html) ?? "";
    pruefe("Je Charge: Monatsliste mit Bereich und Typ, der Monat gewählt", versteckt(monat).join(",") === "bereich=charge,typ=kosten" && optionen(monat, "zeitraum")?.includes("*2026-09:September 2026") === true, `${versteckt(monat).join(",")} / ${optionen(monat, "zeitraum")?.join(",")}`);
    pruefe(
      "Je Charge: Reiter nehmen Monat und Typ mit",
      leiste(html, "Bereiche der Finanzseite").join(" ; ") === [`Kostenträger -> ${ziel("bereich=kostentraeger&zeitraum=2026-09&typ=kosten")}`, `*Je Charge -> ${ziel("bereich=charge&zeitraum=2026-09&typ=kosten")}`, `Buchungen -> ${ziel("bereich=buchungen&zeitraum=2026-09&typ=kosten")}`].join(" ; "),
      leiste(html, "Bereiche der Finanzseite").join(" ; "),
    );
    const ch = abschnitt(html, t.chargeTitel!);
    pruefe("Je Charge: Einleitung mit Erntetag-Hinweis, kein Formular, Startzeilen, Matrix", ch.includes(`${t.chargeLead} ${t.zeitraum.gefiltertErntetag}`) && aufklapper(ch).length === 0 && knoepfe(ch).length === 0 && ch.includes('<div data-startzeilen=""><div data-matrix=""'));
    pruefe("Je Charge: Spaltenköpfe", tabellenKoepfe(ch).join(" / ") === CHARGE_KOPF, tabellenKoepfe(ch).join(" / "));
    const zeilen = tabellenZeilen(ch).map((z) => z.join(" ; "));
    pruefe(
      "Je Charge: Zeile mit Erntedatum und Menge",
      zeilen[0] === "Charge=CH-0830-1 | 30.08.2026 ; Reihenblock=T-N-A-01 ; Sorte=Polka ; Menge=82,25 kg ; Erlös=61.200 ₸ ; Kosten=23.100 ₸ ; Deckungsbeitrag=38.100 ₸ ; je Kilogramm=465 ₸/kg",
      zeilen[0],
    );
    pruefe("Je Charge: ohne Erntedatum, Reihenblock, Sorte, Menge und Wert je Kilogramm", zeilen[1] === "Charge=CH-ohne ; Reihenblock=– ; Sorte=– ; Menge=– ; Erlös=100 ₸ ; Kosten=300 ₸ ; Deckungsbeitrag=-200 ₸ ; je Kilogramm=–", zeilen[1]);
    pruefe("Je Charge: Code in Monospace, Töne des Deckungsbeitrags", ch.includes('<p class="font-mono text-[11px] font-semibold text-foreground">CH-0830-1</p>') && pillen(ch).join(",") === "success:38.100 ₸,warning:-200 ₸", pillen(ch).join(","));
    pruefe("Je Charge: Nachladezeile mit Monat und Typ", zeilen[2] === "*Mehr anzeigen" && ch.includes(`href="${ziel("bereich=charge&amp;zeitraum=2026-09&amp;typ=kosten&amp;zeilen=35")}"`));
  }

  // ---- 4. Buchungen mit Typ --------------------------------------------------------------------------------------------------------
  {
    setze();
    const { html, fehler } = await ansicht({ bereich: "buchungen", typ: "erloes", zeitraum: "jahr" });
    pruefe("Buchungen: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
    pruefe(
      "Buchungen: Typ an den Lader, danach Kostenträger- und Chargenauswahl parallel",
      filterText(filter[0]) === "zeitraum=jahr typ=erloes zeilen=10" && protokoll.slice(0, 6).join(",") === [...ERSTE_LADUNG, ...AUSWAHL_BUCHUNGEN].join(",") && gestartet().length === 4,
      `${filterText(filter[0])} / ${protokoll.join(",")}`,
    );
    pruefe("Buchungen: nur Übersicht und Buchungen", abschnittTitel(html).join(" | ") === `${t.uebersichtTitel} | ${t.ledgerTitel}`, abschnittTitel(html).join(" | "));
    pruefe("Buchungen: Dieses Jahr aktiv, in der Monatsliste der Bitte-Eintrag gewählt", leiste(html, t.zeitraum.label!)[2]?.startsWith(`*${t.zeitraum.jahr}`) === true && (optionen(monatsFormular(html) ?? "", "zeitraum") ?? []).filter((o) => o.startsWith("*")).join(",") === "*:Monat wählen");
    const bu = abschnitt(html, t.ledgerTitel!);
    pruefe("Buchungen: Einleitung mit dem Hinweis auf das Buchungsdatum", bu.includes(`${t.ledgerLead} ${t.zeitraum.gefiltertBuchungsdatum}`));
    pruefe(
      "Buchungen: Typfilter Alle, Erlös, Kosten; Erlös aktiv; Alle ohne Typ",
      leiste(bu, "Art der Buchung").join(" ; ") === [`Alle -> ${ziel("bereich=buchungen&zeitraum=jahr")}`, `*Erlös -> ${ziel("bereich=buchungen&zeitraum=jahr&typ=erloes")}`, `Kosten -> ${ziel("bereich=buchungen&zeitraum=jahr&typ=kosten")}`].join(" ; "),
      leiste(bu, "Art der Buchung").join(" ; "),
    );
    pruefe("Buchungen: Typfilter vor dem Formular, Formular vor der Tabelle", bu.indexOf('aria-label="Art der Buchung"') < bu.indexOf("<details") && bu.indexOf("<details") < bu.indexOf("<table") && aufklapper(bu).join(",") === "anlegen-buchung");
    pruefe("Buchungs-Formular: Titel, Einleitung, Kostenträger und Chargen aus den Ladern", bu.includes(t.formular.buchung.titel!) && bu.includes(t.formular.buchung.lead!) && bu.includes("T-N-A-01 / 2026-08-30") && bu.includes("CH-0830-1"));
    pruefe("Buchungen: keine Matrix, aber Startzeilen", bu.includes('<div data-startzeilen=""><div class="datentabelle'));
    pruefe("Buchungen: Spaltenköpfe", tabellenKoepfe(bu).join(" / ") === BUCHUNG_KOPF, tabellenKoepfe(bu).join(" / "));
    const zeilen = tabellenZeilen(bu).map((z) => z.join(" ; "));
    pruefe("Buchungen: Erlös mit Beschreibung", zeilen[0] === "Datum=30.08.2026 ; Kostenträger=T-N-A-01 / 2026-08-30 ; Typ=Erlös ; Kategorie=B2B-Verkauf | Lieferung Handelskette A ; Betrag=108.780 ₸", zeilen[0]);
    pruefe("Buchungen: Kosten ohne Beschreibung, Betrag gerundet", zeilen[1] === "Datum=29.08.2026 ; Kostenträger=K-A-01 ohne alles ; Typ=Kosten ; Kategorie=Zukauf + Handling ; Betrag=44.101 ₸", zeilen[1]);
    pruefe("Buchungen: Erlös grün, Kosten neutral, Beschreibung klein", pillen(bu).join(",") === "success:Erlös,neutral:Kosten" && bu.includes('<span class="block text-[11px] text-muted-foreground/80">Lieferung Handelskette A</span>'), pillen(bu).join(","));
    pruefe("Buchungen: Nachladezeile über fünf Spalten mit Typ", zeilen[2] === "*Mehr anzeigen" && bu.includes(`<td colSpan="5" class="px-3 py-2"><a`) && bu.includes(`href="${ziel("bereich=buchungen&amp;zeitraum=jahr&amp;typ=erloes&amp;zeilen=35")}"`));
  }
  {
    setze();
    const { html } = await ansicht({ bereich: "buchungen" });
    pruefe("Buchungen ohne Typ: Alle aktiv, kein Typ an den Lader", leiste(html, "Art der Buchung")[0]?.startsWith("*Alle") === true && filterText(filter[0]) === "zeitraum=monat typ=- zeilen=10");
  }
  {
    setze();
    await ansicht({ bereich: "unbekannt", typ: "falsch", zeitraum: "2026-13", zeilen: "abc" });
    pruefe("Ungültige Adresse: Kostenträger, Dieser Monat, ohne Typ, zehn Zeilen", filterText(filter[0]) === "zeitraum=monat typ=- zeilen=10" && gestartet().includes("ladeReihenblockOptionen"), `${filterText(filter[0])} / ${protokoll.join(",")}`);
  }

  // ---- 5. Leere Tabellen -----------------------------------------------------------------------------------------------------------
  {
    setze({ uebersicht: LEER });
    const kt = await ansicht();
    pruefe("Leer: baut ohne Fehler auf", kt.fehler.length === 0, kt.fehler.slice(0, 3).join(" | "));
    pruefe("Leer: ohne Monate keine Monatsliste", monatsFormular(kt.html) === null);
    pruefe("Leer Kostenträger: Leerzustand mit Knopf zum Formular, keine Nachladezeile", leerzustaende(kt.html).join(",") === `${t.keineKostentraeger} -> #anlegen-kostentraeger` && !kt.html.includes(t.mehrAnzeigen!), leerzustaende(kt.html).join(","));
    pruefe("Leer Kostenträger: Meldung über acht Spalten", tabellenZeilen(abschnitt(kt.html, t.kostentraegerTitel!)).length === 1 && kt.html.includes('<td colSpan="8" class="px-3 py-2"><div class="px-6 py-8 text-center">'));
    const ch = await ansicht({ bereich: "charge" });
    pruefe("Leer Je Charge: Leerzustand ohne Knopf, auch mit Buchungsrecht", leerzustaende(ch.html).join(",") === t.keineChargen && !ch.html.includes(t.mehrAnzeigen!), leerzustaende(ch.html).join(","));
    const bu = await ansicht({ bereich: "buchungen" });
    pruefe("Leer Buchungen: Leerzustand mit Knopf zum Formular über fünf Spalten", leerzustaende(bu.html).join(",") === `${t.keineBuchungen} -> #anlegen-buchung` && bu.html.includes('<td colSpan="5" class="px-3 py-2"><div class="px-6 py-8 text-center">'), leerzustaende(bu.html).join(","));
  }
  {
    setze({ uebersicht: LEER, profil: profil("betriebsleitung") });
    const kt = await ansicht();
    const bu = await ansicht({ bereich: "buchungen" });
    pruefe("Leer ohne Buchungsrecht: Leerzustände ohne Knopf", leerzustaende(kt.html).join(",") === t.keineKostentraeger && leerzustaende(bu.html).join(",") === t.keineBuchungen);
  }

  // ---- 6. Rechte je Rolle ----------------------------------------------------------------------------------------------------------
  const rechteVon = async (p: SessionProfile | null, quelle: FinanzenUebersicht["quelle"] = "db") => {
    setze({ profil: p, uebersicht: uebersicht({ quelle }) });
    const kt = await ansicht();
    const ktLader = gestartet().slice(2).join("+") || "keine";
    const bu = await ansicht({ bereich: "buchungen" });
    const buLader = gestartet().slice(2).join("+") || "keine";
    return `Kostenträger: ${aufklapper(kt.html).join("+") || "kein Formular"} ${ktLader} / Buchungen: ${aufklapper(bu.html).join("+") || "kein Formular"} ${buLader}`;
  };
  const MIT = `Kostenträger: anlegen-kostentraeger ${AUSWAHL_KOSTENTRAEGER.join("+")} / Buchungen: anlegen-buchung ${AUSWAHL_BUCHUNGEN.join("+")}`;
  const OHNE = "Kostenträger: kein Formular keine / Buchungen: kein Formular keine";
  for (const rolle of ["admin", "ceo", "buchhaltung"] as const) {
    const ergebnis = await rechteVon(profil(rolle));
    pruefe(`Rechte ${rolle}: Formulare und Auswahllisten`, ergebnis === MIT, ergebnis);
  }
  for (const rolle of ["betriebsleitung", "erzeuger", "brigade", "picker", "kunde"] as const) {
    const ergebnis = await rechteVon(profil(rolle));
    pruefe(`Rechte ${rolle}: nur lesen, nichts nachgeladen`, ergebnis === OHNE, ergebnis);
  }
  {
    const ergebnis = await rechteVon(null);
    pruefe("Rechte ohne Anmeldung: nur lesen", ergebnis === OHNE, ergebnis);
  }

  // ---- 7. Demo und Lesefehler: Abzeichen, keine Formulare, auch für die Buchhaltung -------------------------------------------------
  for (const quelle of ["demo", "fehler"] as const) {
    const ergebnis = await rechteVon(profil("buchhaltung"), quelle);
    const { html } = await ansicht();
    pruefe(`Quelle ${quelle}: Abzeichen, keine Formulare, nichts nachgeladen`, ergebnis === OHNE && pillen(html)[0] === `${quelle === "demo" ? "warning" : "danger"}:${quelleText[quelle]}`, `${ergebnis} / ${pillen(html)[0]}`);
  }

  ende();
}

main().catch((e) => {
  console.error("FAIL  Ausnahme", e);
  process.exit(1);
});
