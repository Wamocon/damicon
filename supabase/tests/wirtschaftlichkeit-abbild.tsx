import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createFormatter, createTranslator } from "next-intl";
import { ersetzeModule } from "./hilfen/modul-ersatz";
import { rendere, texteVon, SPRACHEN } from "./hilfen/ansicht-probe";
import type { DokumentKontext, Uebersetzer } from "../../src/lib/dokument/kontext";
import type { BetriebIst, BetriebsAnnahmen } from "../../src/lib/domain/betriebsrechnung";
import {
  barwertIstPunkte,
  modellAnnahmen,
  modellPosten,
  planIst,
  rechneStand,
  roiIstPunkte,
  zeilenBisLetzteErfassung,
  type Annahmen,
  type IstEintrag,
  type MengeAbgeleitet,
  type Posten,
} from "../../src/lib/domain/wirtschaftlichkeit-erfassung";

// Charakterisierung der drei langen Funktionen der Wirtschaftlichkeit (15.10.2026), bevor sie zerlegt werden:
//   * baueWirtschaftlichkeitDokument (lib/dokument/wirtschaftlichkeit.ts), in vier Sprachen,
//   * baueModell (components/db/wirtschaftlichkeit-modell.tsx), in Deutsch und Russisch,
//   * WirtschaftlichkeitErfassung (components/db/wirtschaftlichkeit-erfassung.tsx), das Markup in Deutsch,
//   * BetriebsrechnungAnsicht (components/db/betriebsrechnung-ansicht.tsx, seit 16.10.2026), das Markup in vier Sprachen.
// Festgehalten wird je Fall ein Fingerabdruck der Ausgabe (SHA-256) in supabase/tests/fixtures/wirtschaftlichkeit-abbild.json. Ein Umbau, der die Ausgabe
// ändert, macht den Test rot; ein gewollter Unterschied wird mit "--schreiben" neu festgehalten und im Pull Request begründet.
//
// Aufruf: npm run test:wirtschaftlichkeit-abbild   (neu festhalten: npm run test:wirtschaftlichkeit-abbild -- --schreiben)

const DATEI = "supabase/tests/fixtures/wirtschaftlichkeit-abbild.json";
const schreiben = process.argv.includes("--schreiben");
const sha = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

const abdruck: Record<string, string> = {};
const festgehalten: Record<string, string> = existsSync(DATEI) ? JSON.parse(readFileSync(DATEI, "utf8")) : {};
let fehler = 0;
function pruefe(name: string, text: string) {
  const h = sha(text);
  abdruck[name] = h;
  if (schreiben) {
    console.log(`SCHREIBE  ${name}  ${h}`);
    return;
  }
  const soll = festgehalten[name];
  const ok = soll === h;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  - Abdruck ${h}, festgehalten ${soll ?? "(fehlt)"}`}`);
}

// --- Ersatz der Server-Bausteine ---------------------------------------------------------------------------------------------------
let sprache: (typeof SPRACHEN)[number] = "de";
let einstellungen: Record<string, number | null> = {};
const katalog = (loc: string) => texteVon(loc);

ersetzeModule({
  "next-intl/server": {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: sprache, messages: katalog(sprache) as never, namespace: namespace as never, getMessageFallback: ({ namespace: n, key }) => `!!${n}.${key}!!`, onError: () => undefined }),
    getFormatter: async () => createFormatter({ locale: sprache, timeZone: "Europe/Berlin" }),
    getLocale: async () => sprache,
  },
  "@/lib/data/einstellungen": {
    einstellungWert: async (schluessel: string) => einstellungen[schluessel] ?? null,
  },
});

// --- Beispieldaten -------------------------------------------------------------------------------------------------------------------
const MODELL_TEXTE = {
  investition: { bezeichnung: "Einführung <Damicon>", kategorie: "Einführung" },
  betrieb: { bezeichnung: "Hosting", kategorie: "Betrieb" },
  nutzen: { bezeichnung: "Vermiedene Kosten", kategorie: "egal" },
};
const POSTEN: Posten[] = [
  ...modellPosten(MODELL_TEXTE, "2026-09-23"),
  { id: "p-schwund", art: "nutzen", kategorie: "schwund", bezeichnung: "Schwund (aus der Verlustquote hergeleitet)", betrag: 7500, waehrung: "EUR", datum: "2026-10-01", herkunft: "geschaetzt", notiz: "Notiz <wichtig> & mehr" },
  { id: "p-kzt", art: "betrieb", kategorie: "Wartung", bezeichnung: "Wartung in Tenge", betrag: 1_200_000, waehrung: "KZT", datum: "2026-10-05", herkunft: "belegt", notiz: null },
];
const IST: IstEintrag[] = [
  { id: "i1", monat: "2026-11-01", kategorie: "schwund", betrag: 12000, waehrung: "EUR", notiz: null },
  { id: "i2", monat: "2026-12-01", kategorie: "audit", betrag: 3_000_000, waehrung: "KZT", notiz: "Audit <Q4>" },
];
const ANNAHMEN = { ...modellAnnahmen(), echtbetriebBeginn: "2026-11-01", kursQuelle: "Nationalbank", vollkostenVorherTenge: 1500 };
const ANNAHMEN_LEER = { ...modellAnnahmen(), vollkostenVorherTenge: null, nutzenbeginnWochen: null, echtbetriebBeginn: null, herkunft: { menge: "belegt" as const } };
const MENGE_GUT: MengeAbgeleitet = { mengeKg12Monate: 82_000, erste: "2025-10-20", tageAbdeckung: 360, belastbar: true };
const MENGE_KURZ: MengeAbgeleitet = { mengeKg12Monate: 9_000, erste: "2026-08-01", tageAbdeckung: 74, belastbar: false };
const HEUTE = "2026-10-14";
const STAENDE = [
  { id: "s1", bezeichnung: "Stand <Oktober>", standAm: "2026-10-01T08:00:00Z" },
  { id: "s2", bezeichnung: "Stand Januar", standAm: "2027-01-15T08:00:00Z" },
];

// --- 1. Dokument ---------------------------------------------------------------------------------------------------------------------
function kontext(loc: (typeof SPRACHEN)[number]): DokumentKontext {
  return {
    sprache: loc,
    jetzt: new Date("2026-10-14T09:00:00Z"),
    ersteller: { name: "Test Person", rolle: "Administration" },
    t: (namensraum) =>
      createTranslator({ locale: loc, messages: katalog(loc) as never, namespace: namensraum as never, getMessageFallback: ({ namespace: n, key }) => `!!${n}.${key}!!`, onError: () => undefined }) as unknown as Uebersetzer,
  };
}

const DOK = { posten: POSTEN, ist: IST, annahmen: ANNAHMEN, menge: null, quelle: "erfasst" as const, heute: HEUTE };
const DOKUMENT_FAELLE = {
  erfasst: DOK,
  "erfasst-menge-gut": { ...DOK, menge: MENGE_GUT },
  "ohne-posten": { ...DOK, posten: [], ist: [] },
  "leere-annahmen": { ...DOK, annahmen: ANNAHMEN_LEER },
  modell: { ...DOK, posten: modellPosten(MODELL_TEXTE, "2026-09-23"), ist: [], annahmen: modellAnnahmen(), quelle: "modell" as const },
  stand: { ...DOK, quelle: "stand" as const, stand: { name: "Stand <Januar>", standAm: "2027-01-15T08:00:00Z" }, standId: "s1" },
};

async function main() {
  const { baueWirtschaftlichkeitDokument } = await import("../../src/lib/dokument/wirtschaftlichkeit");
  for (const loc of SPRACHEN) {
    for (const [name, daten] of Object.entries(DOKUMENT_FAELLE)) {
      const dokument = baueWirtschaftlichkeitDokument(daten, kontext(loc));
      pruefe(`dokument/${name}/${loc}`, JSON.stringify(dokument));
    }
  }

  // Übersetzungen der Freitexte (Spalte i18n, seit 16.10.2026): das Dokument zeigt Bezeichnung und Kategorie in seiner Sprache, fehlt eine, das Original.
  const uebersetzt = {
    ...DOK,
    posten: POSTEN.map((p) =>
      p.id === "p-kzt" ? { ...p, i18n: { bezeichnung: { en: "Maintenance in tenge", ru: "Обслуживание в тенге", kk: "Теңгедегі қызмет" }, kategorie: { en: "Service", ru: "Сервис" } } } : p,
    ),
  };
  const erwartet: Record<(typeof SPRACHEN)[number], { bezeichnung: string; kategorie: string }> = {
    de: { bezeichnung: "Wartung in Tenge", kategorie: "Wartung" },
    en: { bezeichnung: "Maintenance in tenge", kategorie: "Service" },
    ru: { bezeichnung: "Обслуживание в тенге", kategorie: "Сервис" },
    kk: { bezeichnung: "Теңгедегі қызмет", kategorie: "Wartung" },
  };
  for (const loc of SPRACHEN) {
    const text = JSON.stringify(baueWirtschaftlichkeitDokument(uebersetzt, kontext(loc)));
    pruefe(`dokument/uebersetzt/${loc}`, text);
    const soll = erwartet[loc];
    if (!text.includes(soll.bezeichnung) || !text.includes(soll.kategorie) || (loc !== "de" && text.includes("Wartung in Tenge"))) {
      fehler++;
      console.log(`FAIL  dokument/uebersetzt/${loc}: erwartet ${soll.bezeichnung} und ${soll.kategorie}`);
    }
  }

  // --- 2. Kachelmodell -----------------------------------------------------------------------------------------------------------------
  const { baueModell } = await import("../../src/components/db/wirtschaftlichkeit-modell");
  function rechnung(posten: Posten[], ist: IstEintrag[], annahmen: Annahmen, menge: MengeAbgeleitet | null, bisMonat: string) {
    const stand = rechneStand(posten, annahmen, menge);
    const vergleich = planIst(stand.nutzenEur, ist, annahmen, bisMonat);
    const erfasst = zeilenBisLetzteErfassung(vergleich.zeilen, ist);
    const istPunkte =
      erfasst.length > 0 && stand.capexEur !== null && stand.opexEur !== null
        ? { roi: roiIstPunkte(erfasst, stand.capexEur, stand.opexEur), barwert: barwertIstPunkte(erfasst, stand.capexEur, stand.opexEur, annahmen.kalkulationszins) }
        : null;
    return { stand, annahmen, istPunkte, jahre: 3 };
  }
  const MODELL_FAELLE = [
    { name: "erfasst", r: rechnung(POSTEN, IST, ANNAHMEN, MENGE_GUT, "2026-12"), k: { quelle: "erfasst" as const, postenAnzahl: POSTEN.length } },
    { name: "erfasst-ohne-ist", r: rechnung(POSTEN, [], ANNAHMEN, null, "2026-10"), k: { quelle: "erfasst" as const, postenAnzahl: POSTEN.length } },
    { name: "leer", r: rechnung([], [], ANNAHMEN_LEER, null, "2026-10"), k: { quelle: "erfasst" as const, postenAnzahl: 0 } },
    { name: "modell", r: rechnung(modellPosten(MODELL_TEXTE, "2026-09-23"), [], modellAnnahmen(), null, "2026-10"), k: { quelle: "modell" as const, postenAnzahl: 3 } },
    { name: "stand", r: rechnung(POSTEN, IST, ANNAHMEN, MENGE_KURZ, "2027-01"), k: { quelle: "stand" as const, postenAnzahl: POSTEN.length, standName: "Stand <Oktober>", standDatum: "1. Okt. 2026" } },
  ];
  for (const loc of ["de", "ru"] as const) {
    sprache = loc;
    for (const f of MODELL_FAELLE) {
      const modell = await baueModell(f.r, f.k);
      pruefe(`modell/${f.name}/${loc}`, JSON.stringify(modell));
    }
  }

  // --- 3. Erfassung --------------------------------------------------------------------------------------------------------------------
  sprache = "de";
  const { WirtschaftlichkeitErfassung } = await import("../../src/components/db/wirtschaftlichkeit-erfassung");
  function eingabe(posten: Posten[], ist: IstEintrag[], annahmen: Annahmen, menge: MengeAbgeleitet | null, staende: typeof STAENDE, extra: { darfSchreiben: boolean; aktiverStand?: string }) {
    const stand = rechneStand(posten, annahmen, menge);
    return { pfad: "/de/dashboard/buero/wirtschaftlichkeit", posten, ist, annahmen, menge, staende, stand, planIst: planIst(stand.nutzenEur, ist, annahmen, "2026-12"), heute: HEUTE, ...extra };
  }
  const EINSTELLUNGEN_VOLL = { "wirtschaftlichkeit.kalkulationszins_richtwert": 20, "wirtschaftlichkeit.zins_sensitivitaet_niedrig": 16, "wirtschaftlichkeit.zins_sensitivitaet_hoch": 24 };
  const ERFASSUNG_FAELLE = [
    { name: "schreiben-voll", e: eingabe(POSTEN, IST, ANNAHMEN, MENGE_GUT, STAENDE, { darfSchreiben: true }), s: EINSTELLUNGEN_VOLL },
    { name: "lesen-voll", e: eingabe(POSTEN, IST, ANNAHMEN, MENGE_GUT, STAENDE, { darfSchreiben: false }), s: EINSTELLUNGEN_VOLL },
    { name: "lesen-aktiver-stand", e: eingabe(POSTEN, IST, ANNAHMEN, MENGE_KURZ, STAENDE, { darfSchreiben: false, aktiverStand: "s1" }), s: EINSTELLUNGEN_VOLL },
    { name: "schreiben-leer", e: eingabe([], [], ANNAHMEN_LEER, null, [], { darfSchreiben: true }), s: EINSTELLUNGEN_VOLL },
    { name: "lesen-leer", e: eingabe([], [], ANNAHMEN_LEER, null, [], { darfSchreiben: false }), s: {} },
    { name: "schreiben-menge-aus-annahme", e: eingabe(POSTEN, IST, { ...ANNAHMEN, vermarkteteMengeKg: 70000 }, MENGE_KURZ, STAENDE, { darfSchreiben: true }), s: { "wirtschaftlichkeit.kalkulationszins_richtwert": 20 } },
  ];
  for (const f of ERFASSUNG_FAELLE) {
    einstellungen = f.s as Record<string, number | null>;
    const element = await WirtschaftlichkeitErfassung(f.e);
    const { html, fehler: textFehler } = rendere(element, "de");
    if (textFehler.some((z) => !z.includes("value"))) {
      fehler++;
      console.log(`FAIL  erfassung/${f.name}: Textfehler ${textFehler.slice(0, 2).join(" | ")}`);
    }
    pruefe(`erfassung/${f.name}/de`, html);
  }

  // --- 4. Wirtschaftlichkeit des Betriebs ---------------------------------------------------------------------------------------------
  const { BetriebsrechnungAnsicht } = await import("../../src/components/db/betriebsrechnung-ansicht");
  const BETRIEB: BetriebsAnnahmen = {
    mengeKg: 350_000,
    preisTengeKg: 1850,
    variableKostenTengeKg: 1100,
    mengeEntwicklung: 0.06,
    preisEntwicklung: 0.06,
    kostenEntwicklung: 0.08,
    fixkostenEntwicklung: 0.07,
    abschreibungJahre: 5,
    herkunft: { menge: "geschaetzt", preis: "belegt", kosten: "geschaetzt", entwicklung: "geschaetzt" },
  };
  const BETRIEB_LEER: BetriebsAnnahmen = { ...BETRIEB, mengeKg: null, preisTengeKg: null, variableKostenTengeKg: null, mengeEntwicklung: null, preisEntwicklung: null, kostenEntwicklung: null, fixkostenEntwicklung: null, abschreibungJahre: null, herkunft: {} };
  const BETRIEB_IST: BetriebIst = { erloesTenge: 3_068_545, kostenTenge: 1_841_876, mengeKg: 1738.6, buchungen: 98, von: "2025-10-17", bis: "2026-10-16" };
  const FIXKOSTEN: Posten[] = [
    { id: "f1", art: "fixkosten", kategorie: "Personal <fest>", bezeichnung: "Festes Personal (14 Stellen)", betrag: 58_800_000, waehrung: "KZT", datum: "2026-09-01", herkunft: "belegt", notiz: null },
    { id: "f2", art: "fixkosten", kategorie: "Verwaltung", bezeichnung: "Beratung & Bank", betrag: 40_000, waehrung: "EUR", datum: "2026-09-01", herkunft: "geschaetzt", notiz: "Notiz <wichtig>" },
  ];
  const STANDARD = { pfad: "/de/dashboard/buero/wirtschaftlichkeit", jahre: 5 as const, betriebIst: BETRIEB_IST, heute: HEUTE, kursHinweis: "Umgerechnet zum Kurs vom Stichtag", herkunftTexte: { geschaetztLabel: "geschätzt", offenLabel: "offen" } };
  function betriebEingabe(modus: "modell" | "erfasst" | "stand", posten: Posten[], betrieb: BetriebsAnnahmen, extra: { darfSchreiben?: boolean; jahre?: 3 | 4 | 5; standId?: string; betriebIst?: BetriebIst | null } = {}) {
    const jahre = extra.jahre ?? STANDARD.jahre;
    return { ...STANDARD, modus, betrieb, posten, annahmen: ANNAHMEN, stand: rechneStand(posten, ANNAHMEN, null, jahre), darfSchreiben: extra.darfSchreiben ?? true, ...extra, jahre };
  }
  const SYSTEM_POSTEN = modellPosten(MODELL_TEXTE, "2026-09-23");
  const BETRIEB_FAELLE = [
    { name: "voll-schreiben", e: betriebEingabe("erfasst", [...SYSTEM_POSTEN, ...FIXKOSTEN], BETRIEB), sprachen: SPRACHEN },
    { name: "voll-lesen-drei-jahre", e: betriebEingabe("erfasst", [...SYSTEM_POSTEN, ...FIXKOSTEN], BETRIEB, { darfSchreiben: false, jahre: 3 }), sprachen: ["de", "ru"] as const },
    { name: "ohne-system", e: betriebEingabe("erfasst", FIXKOSTEN, BETRIEB, { jahre: 4 }), sprachen: ["de", "ru"] as const },
    { name: "ohne-fixkosten", e: betriebEingabe("erfasst", SYSTEM_POSTEN, BETRIEB), sprachen: ["de"] as const },
    { name: "leer", e: betriebEingabe("erfasst", [], BETRIEB_LEER, { betriebIst: null }), sprachen: ["de", "ru"] as const },
    { name: "stand", e: betriebEingabe("stand", [...SYSTEM_POSTEN, ...FIXKOSTEN], BETRIEB, { darfSchreiben: false, standId: "s1" }), sprachen: ["de", "ru"] as const },
    { name: "modell", e: betriebEingabe("modell", SYSTEM_POSTEN, BETRIEB_LEER, { darfSchreiben: false, betriebIst: null }), sprachen: ["de"] as const },
  ];
  for (const f of BETRIEB_FAELLE) {
    for (const loc of f.sprachen) {
      sprache = loc;
      const { html, fehler: textFehler } = rendere(await BetriebsrechnungAnsicht(f.e), loc);
      if (textFehler.some((z) => !z.includes("value"))) {
        fehler++;
        console.log(`FAIL  betrieb/${f.name}/${loc}: Textfehler ${textFehler.slice(0, 2).join(" | ")}`);
      }
      pruefe(`betrieb/${f.name}/${loc}`, html);
    }
  }

  if (schreiben) {
    writeFileSync(DATEI, JSON.stringify(abdruck, Object.keys(abdruck).sort(), 2) + "\n");
    console.log(`\n${Object.keys(abdruck).length} Abdrücke festgehalten in ${DATEI}.`);
    return;
  }
  const unbekannt = Object.keys(festgehalten).filter((k) => !(k in abdruck));
  if (unbekannt.length > 0) {
    fehler++;
    console.log(`FAIL  festgehaltene Fälle ohne Prüfung: ${unbekannt.join(", ")}`);
  }
  console.log("");
  if (fehler > 0) {
    console.error(`${fehler} Pruefung(en) fehlgeschlagen.`);
    process.exit(1);
  }
  console.log(`Alle ${Object.keys(abdruck).length} Abdrücke stimmen mit dem festgehaltenen Stand überein.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
