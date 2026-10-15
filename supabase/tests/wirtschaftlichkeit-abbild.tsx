import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createFormatter, createTranslator } from "next-intl";
import { ersetzeModule } from "./hilfen/modul-ersatz";
import { rendere, texteVon, SPRACHEN } from "./hilfen/ansicht-probe";
import type { DokumentKontext, Uebersetzer } from "../../src/lib/dokument/kontext";
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
//   * WirtschaftlichkeitErfassung (components/db/wirtschaftlichkeit-erfassung.tsx), das Markup in Deutsch.
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
    return { stand, annahmen, istPunkte };
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
