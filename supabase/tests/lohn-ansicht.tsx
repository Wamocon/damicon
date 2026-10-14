import { NextIntlClientProvider, createFormatter, createTranslator } from "next-intl";
import { prerender } from "react-dom/static";
import type { SessionProfile } from "../../src/lib/auth";
import type { LohnUebersicht } from "../../src/lib/data/lohn";
import type { LohnAbrechnung, LohnMonatsabzug, LohnSatz, LohnSteuersatzKz } from "../../src/lib/domain/lohn";
import type { Role } from "../../src/lib/rbac";
import { ersetzeModule } from "./hilfen/modul-ersatz";
import { imMarkup, pruefer, texteVon } from "./hilfen/ansicht-probe";
import { abschnitt, kacheln, knoepfe, leerzustaende, pillen, tabellenKoepfe, tabellenZeilen, versteckt, zeilenKlassen } from "./hilfen/markup-auszug";

// Charakterisierung der Lohnansicht (db/lohn-ansicht.tsx), ohne Browser und ohne Datenbank (seit 14.10.2026):
//   * Datenladen: Übersicht und Anmeldung gemeinsam, danach nichts mehr.
//   * Lohnsatz mit und ohne Gültigkeitsbeginn und Notiz, ohne Satz der Leerzustand mit und ohne Knopf zum Formular.
//   * Verlauf der Sätze mit markiertem gültigem Satz, Hinweis auf wirkungslosen Faktor (nur ab zwei Abrechnungen), Aufgaben ohne Steige.
//   * Abrechnungen: Ton des Faktors (über, unter, genau 1, außerhalb des Korridors mit Titel und Ausrufezeichen, ohne Satz nie
//     außerhalb), Ausschuss fehlt, Status, Freigeben, Auszahlen und Zurückziehen je Status und Recht.
//   * Positionen, gesetzliche Abzüge mit Kacheln, Quelle, Formularen und Monatsabzügen (steuerfrei, Monatsname, genaue Beträge).
//   * Leere Tabellen, Rechte je Rolle, Demo und Lesefehler.
// Server-Bausteine sind ersetzt (hilfen/modul-ersatz.ts): next-intl/server liefert Übersetzer und Formatierer aus den echten Texten,
// getSessionProfile die Anmeldung der Lage, ladeLohnUebersicht feste Daten. Gerendert wird mit prerender (asynchrone
// Server-Komponenten). Abschicken der Formulare und der Bestätigungsdialog vor einem Statuswechsel bleiben Prüfpunkte im Browser.
// Aufruf: npm run test:lohn-ansicht

const { pruefe, ende } = pruefer();

const de = texteVon("de") as Record<string, Record<string, unknown>>;
type Texte = Record<string, string>;
const t = de.lohnAnsicht as unknown as Texte & {
  stat: Texte;
  col: Texte;
  abschlussLuecke: Texte;
  kz: Texte & { stat: Texte; col: Texte };
  formular: Record<string, Texte>;
};
const st = de.lohnStatus as unknown as Texte;
const quelleText = (de.dashboard as { dataSource: Record<string, string> }).dataSource;
const ZEITZONE = "Europe/Berlin";

// ---- Lage und Ersatzmodule ---------------------------------------------------------------------------------------------------------
interface Lage {
  profil: SessionProfile | null;
  uebersicht: LohnUebersicht;
}
let lage: Lage;
let protokoll: string[] = [];
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
  },
  "@/lib/auth": {
    getSessionProfile: () => spaeter("getSessionProfile", lage.profil),
  },
  "@/lib/data/lohn": {
    ladeLohnUebersicht: () => spaeter("ladeLohnUebersicht", lage.uebersicht),
  },
});

async function ansicht(): Promise<{ html: string; fehler: string[] }> {
  protokoll = [];
  textFehler = [];
  const konsole: string[] = [];
  const echt = console.error;
  console.error = (...a: unknown[]) => konsole.push(a.map(String).join(" "));
  try {
    const { LohnAnsicht } = await import("../../src/components/db/lohn-ansicht");
    const element = await LohnAnsicht();
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
const SATZ: LohnSatz = { id: "s2", gueltigAb: "2026-01-01", gueltigBis: null, stundenlohnTenge: 900, kgSatzTenge: 850.4, qualitaetsZielAusschussquote: 5, qualitaetsfaktorMin: 0.9, qualitaetsfaktorMax: 1.1, notiz: "Annahme für den Prototyp" };
const ALTER_SATZ: LohnSatz = { id: "s1", gueltigAb: "2025-01-01", gueltigBis: "2025-12-31", stundenlohnTenge: 800, kgSatzTenge: 800, qualitaetsZielAusschussquote: 4.5, qualitaetsfaktorMin: 0.85, qualitaetsfaktorMax: 1.15, notiz: null };
const abrechnung = (teil: Partial<LohnAbrechnung> & { id: string; pfluecker: string }): LohnAbrechnung => ({
  pfleuckerAusweis: `A-${teil.id}`,
  periodeStart: "2026-08-01",
  periodeEnde: "2026-08-15",
  stunden: 80.25,
  mengeKg: 412.35,
  ausschussquote: 3.21,
  grundlohnTenge: 72000,
  mengenKomponenteTenge: 350000.6,
  qualitaetsfaktor: 1,
  gesamtTenge: 422000.6,
  status: "entwurf",
  ...teil,
});
const ABRECHNUNGEN: LohnAbrechnung[] = [
  abrechnung({ id: "a1", pfluecker: "Aliya", qualitaetsfaktor: 1.05 }),
  abrechnung({ id: "a2", pfluecker: "Bek", qualitaetsfaktor: 0.95, ausschussquote: null, status: "freigegeben" }),
  abrechnung({ id: "a3", pfluecker: "Dana", qualitaetsfaktor: 1, status: "ausgezahlt" }),
  abrechnung({ id: "a4", pfluecker: "Erlan", qualitaetsfaktor: 1.2 }),
  abrechnung({ id: "a5", pfluecker: "Farida", qualitaetsfaktor: 0.85, status: "freigegeben" }),
  abrechnung({ id: "a6", pfluecker: "Gulnar", qualitaetsfaktor: 1.1, status: "ausgezahlt" }),
];
const STEUER: LohnSteuersatzKz = {
  id: "kz1",
  gueltigAb: "2026-01-01",
  gueltigBis: null,
  opvProzent: 10,
  opvBemessungsgrenzeTenge: 4250000,
  vosmsProzent: 2,
  vosmsBemessungsgrenzeTenge: 1700000,
  ipnProzent: 10,
  ipnFreibetragTenge: 129750,
  opvrProzent: 3.5,
  soProzent: 5,
  snProzent: 6,
  osmsProzent: 3,
  quelle: "Steuerkodex RK 2026",
  notiz: null,
};
const monatsabzug = (teil: Partial<LohnMonatsabzug> & { id: string }): LohnMonatsabzug => ({
  pfluecker: "Aliya",
  pfleuckerAusweis: "A-1",
  jahr: 2026,
  monat: 8,
  bruttoGesamtTenge: 422000.6,
  opvTenge: 42200.06,
  vosmsTenge: 8440.01,
  ipnBemessungsgrundlageTenge: 241610.53,
  ipnTenge: 24161.05,
  nettoTenge: 347199.48,
  opvrTenge: 14770.02,
  soTenge: 18989.99,
  snTenge: 25320.04,
  osmsTenge: 12660.02,
  arbeitgeberkostenGesamtTenge: 493740.67,
  ...teil,
});
const uebersicht = (teil: Partial<LohnUebersicht> = {}): LohnUebersicht => ({
  quelle: "db",
  satz: SATZ,
  historie: [SATZ, ALTER_SATZ],
  abrechnungen: ABRECHNUNGEN,
  positionen: [
    { id: "p1", pfluecker: "Aliya", periodeStart: "2026-08-01", periodeEnde: "2026-08-15", aufgabeCode: "PA-1", mengeKg: 210.55, ausschussAnteiligKg: 6.75, qualitaetsfaktor: 1.05, betragTenge: 179000.4 },
    { id: "p2", pfluecker: "Bek", periodeStart: "2026-08-01", periodeEnde: "2026-08-15", aufgabeCode: null, mengeKg: 99, ausschussAnteiligKg: 0, qualitaetsfaktor: 1, betragTenge: 84150 },
  ],
  steuersatzKz: STEUER,
  monatsabzuege: [monatsabzug({ id: "m1" }), monatsabzug({ id: "m2", pfluecker: "Bek", pfleuckerAusweis: "B-3", monat: 1, ipnTenge: 0 })],
  abschlussLuecken: [{ id: "l1", code: "PA-7", istMengeKg: 12.34 }],
  ...teil,
});
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
const LADER = ["ladeLohnUebersicht", "getSessionProfile"];
const WIRKUNGSLOS = `<div class="rounded-2xl border p-5 border-warning/30 bg-warning/[0.06] text-xs leading-5 text-warning">${imMarkup(t.wirkungslos!)}</div>`;
const LUECKE = '<div class="rounded-2xl border p-5 space-y-2 border-warning/30 bg-warning/[0.06] text-xs leading-5 text-warning">';
/** Was in welcher Reihenfolge auf der Seite steht: Abschnitte (§), Formularkarten (+), Warnkarten (!). */
const gliederung = (html: string) =>
  [
    ...html.matchAll(
      new RegExp(
        `<h2 class="text-sm font-bold text-card-foreground">([^<]*)</h2>|<p class="schrift-dense font-black text-card-foreground">([^<]*)</p>|(${WIRKUNGSLOS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})|(${LUECKE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
        "g",
      ),
    ),
  ]
    .map((m) => (m[1] !== undefined ? `§${m[1]}` : m[2] !== undefined ? `+${m[2]}` : m[3] ? "!wirkungslos" : "!Lücke"))
    .join(" | ");
const zeilenText = (html: string) => tabellenZeilen(html).map((z) => z.join(" ; "));
const PERIODE = "01.08.2026 – 15.08.2026";
const SATZ_TITEL = t.satzTitel!;
const KZ_TITEL = t.kz.titel!;

async function main() {
  // ---- 1. Buchhaltung, Live-Daten, alles da -----------------------------------------------------------------------------------------
  setze();
  {
    const { html, fehler } = await ansicht();
    pruefe("Buchhaltung: baut ohne Fehler, Warnung und fehlenden Schlüssel auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
    pruefe("Datenladen: Übersicht und Anmeldung gemeinsam, danach nichts", protokoll.join(",") === [...LADER, ...LADER.map((l) => `fertig ${l}`)].join(","), protokoll.join(","));
    pruefe(
      "Gliederung: Satz, zwei Formulare, Verlauf, Lücke, Abrechnungen, Positionen, Abzüge mit zwei Formularen",
      gliederung(html) ===
        [`§${SATZ_TITEL}`, `+${t.formular.satz!.titel}`, `+${t.formular.berechnen!.titel}`, `§${t.historieTitel}`, "!Lücke", `§${t.abrechnungenTitel}`, `§${t.positionenTitel}`, `§${KZ_TITEL}`, `+${t.formular.abzuegeBerechnen!.titel}`, `+${t.formular.vorschau!.titel}`].join(" | "),
      gliederung(html),
    );
    const satz = abschnitt(html, SATZ_TITEL);
    pruefe("Satz: Einleitung und Live-Abzeichen", satz.includes(imMarkup(t.satzLead!)) && pillen(satz)[0] === `success:${quelleText.db}`, pillen(satz)[0]);
    pruefe(
      "Satz: vier Kacheln, Faktor mit zwei Stellen, gültig ab",
      kacheln(satz).join(" ; ") === `${t.stat.stundenlohn}=900 ₸ [neutral] ; ${t.stat.kgSatz}=850 ₸ [neutral] ; ${t.stat.ziel}=5 % (${t.stat.zielHinweis}) [neutral] ; ${t.stat.korridor}=0,90 – 1,10 (${t.stat.gueltigAb} 01.01.2026) [neutral]`,
      kacheln(satz).join(" ; "),
    );
    pruefe("Satz: Notiz unter den Kacheln", satz.includes('<p class="text-[11px] leading-4 text-muted-foreground">Annahme für den Prototyp</p>'));
    pruefe("Formulare: Lohnsatz mit Sprungziel, danach Periode", html.includes(`id="${"anlegen-lohnsatz"}"`) && html.indexOf('id="anlegen-lohnsatz"') < html.indexOf(`>${t.formular.berechnen!.titel}</p>`));
    const verlauf = abschnitt(html, t.historieTitel!);
    pruefe("Verlauf: Spaltenköpfe", tabellenKoepfe(verlauf).join("") === [t.col.gueltigAb, t.col.gueltigBis, t.stat.stundenlohn, t.stat.kgSatz, t.stat.ziel, t.stat.korridor].join(" | "), tabellenKoepfe(verlauf).join(""));
    pruefe(
      "Verlauf: gültiger Satz markiert, offenes Ende als Strich",
      zeilenKlassen(verlauf).join(",") === "bg-primary/5," &&
        zeilenText(verlauf).join(" / ") ===
          "Gültig ab=01.01.2026 ; Gültig bis=- ; Stundenlohn=900 ₸ ; kg-Satz=850 ₸ ; Ziel-Ausschussquote=5 % ; Faktor-Korridor=0,90 – 1,10 / Gültig ab=01.01.2025 ; Gültig bis=31.12.2025 ; Stundenlohn=800 ₸ ; kg-Satz=800 ₸ ; Ziel-Ausschussquote=4,5 % ; Faktor-Korridor=0,85 – 1,15",
      `${zeilenKlassen(verlauf).join(",")} / ${zeilenText(verlauf).join(" / ")}`,
    );
    pruefe("Kein Hinweis auf wirkungslosen Faktor bei bewegten Faktoren", !html.includes(WIRKUNGSLOS));
    pruefe(
      "Lücke: Titel und Eintrag mit Menge auf eine Stelle",
      html.includes(`${LUECKE}<p class="font-semibold">${imMarkup(t.abschlussLuecke.titel!)}</p><ul class="list-disc space-y-0.5 pl-4"><li>PA-7: 12,3 kg gemeldet, aber keine Steige erfasst`),
    );
    const abr = abschnitt(html, t.abrechnungenTitel!);
    pruefe("Abrechnungen: elf Spaltenköpfe", tabellenKoepfe(abr).join("") === ["pfluecker", "periode", "stunden", "menge", "ausschussquote", "faktor", "grundlohn", "mengenKomponente", "gesamt", "status", "aktion"].map((k) => t.col[k]).join(" | "), tabellenKoepfe(abr).join(""));
    const zeilen = zeilenText(abr);
    pruefe(
      "Abrechnungen: volle Zeile mit Ausweis, Periode, Zahlen auf eine Stelle, Beträge gerundet",
      zeilen[0] === `Pflücker=Aliya | A-a1 ; Periode=${PERIODE} ; Std.=80,3 ; Menge=412,4 kg ; Ausschuss=3,2 % ; Faktor=1,05 ; Grundlohn=72.000 ₸ ; Menge (₸)=350.001 ₸ ; Gesamt=422.001 ₸ ; Status=Entwurf ; Aktion=${t.freigebenKnopf}`,
      zeilen[0],
    );
    pruefe("Abrechnungen: ohne Ausschuss ein Strich", zeilen[1]?.includes("; Ausschuss=– ;") === true, zeilen[1]);
    pruefe(
      "Abrechnungen: Aktion je Status (Freigeben; Auszahlen und Zurückziehen; ausgezahlt Strich)",
      zeilen.map((z) => z.split(" ; Aktion=")[1]).join(" / ") === [t.freigebenKnopf, `${t.auszahlenKnopf} | ${t.zurueckziehenKnopf}`, "–", t.freigebenKnopf, `${t.auszahlenKnopf} | ${t.zurueckziehenKnopf}`, "–"].join(" / "),
      zeilen.map((z) => z.split(" ; Aktion=")[1]).join(" / "),
    );
    pruefe(
      "Abrechnungen: Statusformulare mit Id und Ziel",
      versteckt(abr).filter((v) => !v.startsWith("pfad=")).join(",") === "id=a1,status=freigegeben,id=a2,status=ausgezahlt,id=a2,status=entwurf,id=a4,status=freigegeben,id=a5,status=ausgezahlt,id=a5,status=entwurf",
      versteckt(abr).join(","),
    );
    pruefe(
      "Abrechnungen: Faktor grün über 1, gelb unter 1, neutral bei 1, rot mit Ausrufezeichen außerhalb, Korridorgrenze grün",
      pillen(abr, true).filter((p) => !Object.values(st).some((s) => p.endsWith(`:${s}`))).join(" ; ") ===
        ["success:1,05", "warning:0,95", "neutral:1,00", `danger:1,20 ! [${t.ausserhalbKorridor}]`, `danger:0,85 ! [${t.ausserhalbKorridor}]`, "success:1,10"].join(" ; "),
      pillen(abr, true).join(" ; "),
    );
    pruefe("Abrechnungen: Status-Pillen je Ton", pillen(abr).filter((p) => Object.values(st).some((s) => p.endsWith(`:${s}`))).join(",") === "neutral:Entwurf,info:Freigegeben,success:Ausgezahlt,neutral:Entwurf,info:Freigegeben,success:Ausgezahlt", pillen(abr).join(","));
    pruefe("Abrechnungen: Strich der Aktion klein und grau", abr.includes('<td class="px-3 py-2.5" data-kopf="Aktion"><span class="text-[11px] text-muted-foreground">–</span></td>'));
    const pos = abschnitt(html, t.positionenTitel!);
    pruefe("Positionen: Spaltenköpfe", tabellenKoepfe(pos).join("") === ["pfluecker", "periode", "aufgabe", "menge", "ausschussAnteilig", "faktor", "betrag"].map((k) => t.col[k]).join(" | "));
    pruefe(
      "Positionen: mit und ohne Aufgabe, Faktor mit zwei Stellen",
      zeilenText(pos).join(" / ") === `Pflücker=Aliya ; Periode=${PERIODE} ; Aufgabe=PA-1 ; Menge=210,6 kg ; Ausschuss (anteilig)=6,8 kg ; Faktor=1,05 ; Betrag=179.000 ₸ / Pflücker=Bek ; Periode=${PERIODE} ; Aufgabe=– ; Menge=99 kg ; Ausschuss (anteilig)=0 kg ; Faktor=1,00 ; Betrag=84.150 ₸`,
      zeilenText(pos).join(" / "),
    );
    const kz = abschnitt(html, KZ_TITEL);
    pruefe("Abzüge: Einleitung und Live-Abzeichen", kz.includes(imMarkup(t.kz.lead!)) && pillen(kz)[0] === `success:${quelleText.db}`);
    pruefe(
      "Abzüge: vier Kacheln, Arbeitgeberlast als Summe",
      kacheln(kz).join(" ; ") === `${t.kz.stat.opv}=10 % (${t.kz.stat.opvHinweis}) [neutral] ; ${t.kz.stat.vosms}=2 % (${t.kz.stat.vosmsHinweis}) [neutral] ; ${t.kz.stat.ipn}=10 % (${t.kz.stat.freibetrag} 129.750 ₸) [neutral] ; ${t.kz.stat.arbeitgeberlast}=17,5 % (${t.kz.stat.arbeitgeberlastHinweis}) [neutral]`,
      kacheln(kz).join(" ; "),
    );
    pruefe("Abzüge: Quelle, dann zwei Formulare, dann Tabelle, dann Hinweis", (() => {
      const quelle = kz.indexOf(`<p class="text-[11px] leading-4 text-muted-foreground">${t.kz.quelle}<!-- --> <!-- -->Steuerkodex RK 2026</p>`);
      const formular1 = kz.indexOf(`>${t.formular.abzuegeBerechnen!.titel}</p>`);
      const formular2 = kz.indexOf(`>${t.formular.vorschau!.titel}</p>`);
      const tabelle = kz.indexOf("<table");
      const hinweis = kz.indexOf(`<div class="rounded-2xl border border-border p-5 bg-muted/30 text-xs leading-5 text-muted-foreground">${imMarkup(t.kz.note!)}</div>`);
      return quelle > 0 && quelle < formular1 && formular1 < formular2 && formular2 < tabelle && tabelle < hinweis;
    })());
    pruefe("Abzüge: Spaltenköpfe", tabellenKoepfe(kz).join("") === ["pfluecker", "monat", "brutto", "opv", "vosms", "ipn", "netto", "arbeitgeberkosten"].map((k) => t.kz.col[k]).join(" | "));
    pruefe(
      "Abzüge: Beträge auf zwei Stellen, Monatsname, steuerfrei als Pille",
      zeilenText(kz).join(" / ") ===
        "Pflücker=Aliya | A-1 ; Monat=August 2026 ; Brutto=422.000,60 ₸ ; ОПВ=42.200,06 ₸ ; ВОСМС=8.440,01 ₸ ; ИПН=24.161,05 ₸ ; Netto=347.199,48 ₸ ; Kosten Arbeitgeber=493.740,67 ₸ / Pflücker=Bek | B-3 ; Monat=Januar 2026 ; Brutto=422.000,60 ₸ ; ОПВ=42.200,06 ₸ ; ВОСМС=8.440,01 ₸ ; ИПН=steuerfrei ; Netto=347.199,48 ₸ ; Kosten Arbeitgeber=493.740,67 ₸",
      zeilenText(kz).join(" / "),
    );
    pruefe("Abzüge: steuerfrei grün", pillen(kz).slice(1).join(",") === `success:${t.kz.steuerfrei}`, pillen(kz).join(","));
    pruefe("Hinweis als letzte Karte", html.includes(`<div class="rounded-2xl border border-border p-5 bg-muted/30 text-xs leading-5 text-muted-foreground">${imMarkup(t.note!)}</div></div>`));
  }

  // ---- 2. Ohne Satz und mit Satz ohne Beginn und Notiz ------------------------------------------------------------------------------
  {
    setze({ uebersicht: uebersicht({ satz: null }) });
    const { html, fehler } = await ansicht();
    pruefe("Ohne Satz: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
    const satz = abschnitt(html, SATZ_TITEL);
    pruefe("Ohne Satz: Leerzustand mit Hinweis und Knopf zum Formular, keine Kacheln, keine Notiz", leerzustaende(satz).join(",") === `${t.keinSatz} / ${t.keinSatzHinweis} -> #anlegen-lohnsatz` && kacheln(satz).length === 0 && !satz.includes("leading-4 text-muted-foreground"), leerzustaende(satz).join(","));
    pruefe("Ohne Satz: kein Satz im Verlauf markiert", zeilenKlassen(abschnitt(html, t.historieTitel!)).join(",") === ",");
    pruefe(
      "Ohne Satz: kein Faktor außerhalb des Korridors",
      pillen(abschnitt(html, t.abrechnungenTitel!), true).filter((p) => !Object.values(st).some((s) => p.endsWith(`:${s}`))).join(" ; ") === "success:1,05 ; warning:0,95 ; neutral:1,00 ; success:1,20 ; warning:0,85 ; success:1,10",
      pillen(abschnitt(html, t.abrechnungenTitel!), true).join(" ; "),
    );
  }
  {
    setze({ uebersicht: uebersicht({ satz: null }), profil: profil("betriebsleitung") });
    const { html } = await ansicht();
    pruefe("Ohne Satz und ohne Recht: Leerzustand ohne Knopf", leerzustaende(abschnitt(html, SATZ_TITEL)).join(",") === `${t.keinSatz} / ${t.keinSatzHinweis}`);
  }
  {
    setze({ uebersicht: uebersicht({ satz: { ...SATZ, gueltigAb: "", notiz: null } }) });
    const { html } = await ansicht();
    const satz = abschnitt(html, SATZ_TITEL);
    pruefe("Satz ohne Beginn und Notiz: Korridor ohne Hilfstext, keine Notiz", kacheln(satz)[3] === `${t.stat.korridor}=0,90 – 1,10 [neutral]` && !satz.includes('<p class="text-[11px] leading-4 text-muted-foreground">'), kacheln(satz)[3]);
  }

  // ---- 3. Wirkungsloser Faktor -------------------------------------------------------------------------------------------------------
  const wirkungslos = async (faktoren: number[]) => {
    setze({ uebersicht: uebersicht({ abrechnungen: faktoren.map((f, i) => abrechnung({ id: `w${i}`, pfluecker: `P${i}`, qualitaetsfaktor: f })) }) });
    const { html } = await ansicht();
    return { html, karte: html.includes(WIRKUNGSLOS) };
  };
  {
    const zwei = await wirkungslos([1, 1]);
    pruefe("Wirkungslos: ab zwei Abrechnungen mit Faktor 1 die Warnkarte nach dem Verlauf", zwei.karte && gliederung(zwei.html).includes(`§${t.historieTitel} | !wirkungslos | !Lücke | §${t.abrechnungenTitel}`), gliederung(zwei.html));
    pruefe("Wirkungslos: eine einzelne Abrechnung reicht nicht", !(await wirkungslos([1])).karte);
    pruefe("Wirkungslos: ein bewegter Faktor reicht, um sie zu verbergen", !(await wirkungslos([1, 1, 1.01])).karte);
  }

  // ---- 4. Leere Listen und kein Abzugssatz -----------------------------------------------------------------------------------------
  {
    setze({ uebersicht: uebersicht({ historie: [], abrechnungen: [], positionen: [], monatsabzuege: [], abschlussLuecken: [], steuersatzKz: null }) });
    const { html, fehler } = await ansicht();
    pruefe("Leer: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
    pruefe("Leer: Verlauf ohne Zeilen, keine Lücke, keine Warnkarte", tabellenZeilen(abschnitt(html, t.historieTitel!)).length === 0 && !html.includes(LUECKE) && !html.includes(WIRKUNGSLOS));
    pruefe("Leer: Abrechnungen mit Leerzustand über elf Spalten", leerzustaende(abschnitt(html, t.abrechnungenTitel!)).join(",") === t.keineAbrechnungen && abschnitt(html, t.abrechnungenTitel!).includes('<td colSpan="11" class="px-3 py-2">'));
    pruefe("Leer: Positionen mit Leerzustand über sieben Spalten", leerzustaende(abschnitt(html, t.positionenTitel!)).join(",") === t.keinePositionen && abschnitt(html, t.positionenTitel!).includes('<td colSpan="7" class="px-3 py-2">'));
    const kz = abschnitt(html, KZ_TITEL);
    pruefe("Leer: Abzüge ohne Satz und ohne Monatsabzüge, keine Quelle, Formulare bleiben", leerzustaende(kz).join(",") === `${t.kz.keinSatz},${t.kz.keineAbzuege}` && kz.includes('<td colSpan="8" class="px-3 py-2">') && kacheln(kz).length === 0 && !kz.includes(`${t.kz.quelle}<!-- -->`) && knoepfe(kz).length === 2, leerzustaende(kz).join(","));
  }

  // ---- 5. Rechte je Rolle ----------------------------------------------------------------------------------------------------------
  const rechteVon = async (p: SessionProfile | null, quelle: LohnUebersicht["quelle"] = "db") => {
    setze({ profil: p, uebersicht: uebersicht({ quelle }) });
    const { html } = await ansicht();
    return { html, knoepfe: knoepfe(html).join(","), lader: protokoll.join(",") };
  };
  const ALLE_KNOEPFE = [
    t.formular.satz!.knopf,
    t.formular.berechnen!.knopf,
    t.freigebenKnopf,
    t.auszahlenKnopf,
    t.zurueckziehenKnopf,
    t.freigebenKnopf,
    t.auszahlenKnopf,
    t.zurueckziehenKnopf,
    t.formular.abzuegeBerechnen!.knopf,
    t.formular.vorschau!.knopf,
  ].join(",");
  for (const rolle of ["admin", "ceo", "buchhaltung"] as const) {
    const ergebnis = await rechteVon(profil(rolle));
    pruefe(`Rechte ${rolle}: alle Formulare und Statusknöpfe`, ergebnis.knoepfe === ALLE_KNOEPFE, ergebnis.knoepfe);
  }
  const nurLesen = (html: string) =>
    knoepfe(html).length === 0 &&
    !html.includes("schrift-dense font-black text-card-foreground") &&
    zeilenText(abschnitt(html, t.abrechnungenTitel!)).every((z) => z.endsWith("; Aktion=–"));
  for (const rolle of ["betriebsleitung", "picker", "brigade", "erzeuger", "kunde"] as const) {
    const ergebnis = await rechteVon(profil(rolle));
    pruefe(`Rechte ${rolle}: nur lesen, Aktion überall ein Strich`, nurLesen(ergebnis.html) && ergebnis.lader === [...LADER, ...LADER.map((l) => `fertig ${l}`)].join(","), ergebnis.knoepfe);
  }
  {
    const ergebnis = await rechteVon(null);
    pruefe("Rechte ohne Anmeldung: nur lesen", nurLesen(ergebnis.html), ergebnis.knoepfe);
  }

  // ---- 6. Demo und Lesefehler -------------------------------------------------------------------------------------------------------
  for (const quelle of ["demo", "fehler"] as const) {
    const { html } = await rechteVon(profil("buchhaltung"), quelle);
    const erwartet = `${quelle === "demo" ? "warning" : "danger"}:${quelleText[quelle]}`;
    pruefe(`Quelle ${quelle}: beide Abzeichen, nur lesen`, nurLesen(html) && pillen(abschnitt(html, SATZ_TITEL))[0] === erwartet && pillen(abschnitt(html, KZ_TITEL))[0] === erwartet, pillen(abschnitt(html, SATZ_TITEL))[0]);
  }

  ende();
}

main().catch((e) => {
  console.error("FAIL  Ausnahme", e);
  process.exit(1);
});
