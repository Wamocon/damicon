import type { ReactElement } from "react";
import { NextIntlClientProvider, createFormatter, createTranslator } from "next-intl";
import { prerender } from "react-dom/static";
import type { SessionProfile } from "../../src/lib/auth";
import type { AuswahlZeile, ReklamationDetail, ReklamationListenEintrag, ReklamationenListe } from "../../src/lib/data/reklamationen";
import type { Role } from "../../src/lib/rbac";
import { istAbschliessbar, istOffen, istUeberfaellig, reklamationsRechte, type ReklamationsRechte } from "../../src/lib/domain/reklamationen";
import { ersetzeModule } from "./hilfen/modul-ersatz";
import { imMarkup, pruefer, texteVon } from "./hilfen/ansicht-probe";

// Charakterisierung der Reklamationsansicht (db/reklamationen-ansicht.tsx), ohne Browser und ohne Datenbank (seit 14.10.2026):
//   * Datenladen: welche Lader in welcher Reihenfolge und mit welchem Argument laufen, je Rolle und Datenquelle, und dass die
//     Auswahlfelder und das Detail erst nach Liste und Anmeldung geladen werden.
//   * Rechte: Büro, Kunde mit und ohne Firma, Rollen ohne Reklamationsrecht, nicht angemeldet, Demo und Lesefehler.
//   * Liste: aktive Reklamation (auch bei unbekannter Auswahl), Frist nur für offene, überfällig rot, genau heute nicht, Kunde nur fürs Büro.
//   * Detail: jede Angabe mit und ohne Wert, Lösung erst nach dem Abschluss, Rückverfolgung je Block nur fürs Büro, Bearbeitung je
//     Status (offen, in Prüfung, angenommen, Endlage), Verlauf mit und ohne Einträge, intern markiert, Nachrichtenformular.
//   * leere Liste und fehlendes Detail mit und ohne Anlegen-Link, Anlegen-Formular mit Kunden- und Chargenauswahl.
//   * Grenzwerte: Menge, Gutschrift und Minuten 0 erscheinen (Prüfung auf null, nicht auf Wahrheitswert), Charge ohne Reihenblock.
//   * seit dem Zerlegen (14.10.2026) die Teile einzeln: Statusregeln und reklamationsRechte (lib/domain/reklamationen.ts),
//     zeitpunkt, hatRueckverfolgung und die Detailkarten (db/reklamation-detail.tsx) mit festen Daten, die Karten auch mit
//     Rechten, die keine Rolle heute so hat (Prüfen ohne Entscheiden und umgekehrt).
// Server-Bausteine sind ersetzt (hilfen/modul-ersatz.ts): next-intl/server liefert Übersetzer und Formatierer aus den echten
// Texten, getSessionProfile die Anmeldung der Lage, die vier Lader feste Daten. Gerendert wird mit prerender, weil die Ansicht und
// das Quellen-Abzeichen asynchrone Server-Komponenten sind. Abschicken der Formulare bleibt ein Prüfpunkt im Browser.
// Aufruf: npm run test:reklamationen-ansicht

const { pruefe, ende } = pruefer();

const de = texteVon("de") as Record<string, Record<string, unknown>>;
const t = de.reklamationenAnsicht as Record<string, string> & {
  rueckverfolgung: Record<string, string>;
  ablauf: Record<string, string>;
  formular: { anlegen: Record<string, string>; nachricht: Record<string, string> };
};
const quelleText = (de.dashboard as { dataSource: Record<string, string> }).dataSource;
const ZEITZONE = "Europe/Berlin";

// ---- Lage und Ersatzmodule ---------------------------------------------------------------------------------------------------------
interface Lage {
  profil: SessionProfile | null;
  liste: ReklamationenListe;
  details: Record<string, ReklamationDetail>;
  kunden: AuswahlZeile[];
  chargen: AuswahlZeile[];
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
    requirePermission: () => {
      throw new Error("requirePermission ist in der Ansicht nicht erwartet");
    },
  },
  "@/lib/data/reklamationen": {
    ladeReklamationen: () => spaeter("ladeReklamationen", lage.liste),
    ladeB2bKundenOptionen: () => spaeter("ladeB2bKundenOptionen", lage.kunden),
    ladeChargenOptionen: (kundeId: string | null) => spaeter(`ladeChargenOptionen(${kundeId})`, lage.chargen),
    ladeReklamation: (id: string) => spaeter(`ladeReklamation(${id})`, lage.details[id] ?? null),
  },
});

/** Baut ein Element wie die Seite (prerender mit den echten Texten) und sammelt Textfehler, Konsolenmeldungen und fehlende Schlüssel. */
async function baue(erzeuge: () => ReactElement | Promise<ReactElement>): Promise<{ html: string; fehler: string[] }> {
  textFehler = [];
  const konsole: string[] = [];
  const echt = console.error;
  console.error = (...a: unknown[]) => konsole.push(a.map(String).join(" "));
  try {
    const element = await erzeuge();
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

async function ansicht(auswahl?: string): Promise<{ html: string; fehler: string[] }> {
  protokoll = [];
  const { ReklamationenAnsicht } = await import("../../src/components/db/reklamationen-ansicht");
  return baue(() => ReklamationenAnsicht({ pfad: "/reklamationen", auswahl }));
}

// ---- Testdaten ---------------------------------------------------------------------------------------------------------------------
const HEUTE = new Date().toISOString().slice(0, 10);
const eintrag = (teil: Partial<ReklamationListenEintrag> & { id: string }): ReklamationListenEintrag => ({
  code: `REK-${teil.id}`,
  kunde: "Handelskette A",
  kundeId: "k1",
  chargeCode: "CH-0902-12",
  reihenblock: "T-N-A-03",
  grund: "temperatur",
  betreff: `Betreff ${teil.id}`,
  status: "offen",
  betroffeneMengeKg: 44.2,
  gemeldetAm: "2026-09-03T05:10:00Z",
  fristAm: null,
  gutschriftTenge: null,
  ...teil,
});
const LISTE: ReklamationListenEintrag[] = [
  eintrag({ id: "r1", status: "offen", fristAm: "2020-01-01" }),
  eintrag({ id: "r2", status: "in_pruefung", fristAm: "2099-12-31", grund: "menge", kunde: "Almaty Fresh" }),
  eintrag({ id: "r3", status: "angenommen", fristAm: "2020-01-01", chargeCode: null, reihenblock: null, gutschriftTenge: 15000 }),
  eintrag({ id: "r4", status: "offen", fristAm: null, chargeCode: null, reihenblock: null, betroffeneMengeKg: null }),
  eintrag({ id: "r5", status: "offen", fristAm: HEUTE }),
  eintrag({ id: "r6", status: "erledigt", fristAm: "2020-01-01" }),
  eintrag({ id: "r7", status: "abgelehnt" }),
];
const leereRueckverfolgung = { pflueckerListe: [], kuehlmessungen: [], nachbarbetrieb: null, transportMessungen: [] };
const detailVon = (e: ReklamationListenEintrag, teil: Partial<ReklamationDetail> = {}): ReklamationDetail => ({
  ...e,
  beschreibung: `Beschreibung ${e.id}`,
  chargeId: e.chargeCode ? "c1" : null,
  gemeldetVon: "Aigerim Sadykova",
  erledigtAm: null,
  loesung: null,
  ereignisse: [],
  ...leereRueckverfolgung,
  ...teil,
});
const RUECKVERFOLGUNG = {
  pflueckerListe: [
    { name: "Aliya", ausweis: "A-1" },
    { name: "Bek", ausweis: "B-3" },
  ],
  kuehlmessungen: [
    { id: "k1", minutenSeitPfluecken: 72, ergebnis: "verstoss", gemessenAm: "2026-09-02T08:00:00Z" },
    { id: "k2", minutenSeitPfluecken: null, ergebnis: "unbekannt", gemessenAm: "2026-09-02T09:00:00Z" },
  ],
  nachbarbetrieb: { name: "Ferma Talgar", ort: "Talgar" },
  transportMessungen: [{ id: "t1", temperaturC: 6.5, ergebnis: "warnung", gemessenAm: "2026-09-03T04:00:00Z" }],
};
const DETAILS: Record<string, ReklamationDetail> = {
  r1: detailVon(LISTE[0]!, {
    ...RUECKVERFOLGUNG,
    loesung: "noch offen, darf nicht erscheinen",
    ereignisse: [
      { id: "e1", neuerStatus: null, text: "Gemeldet", sichtbarFuerKunde: true, autor: null, erstelltAm: "2026-09-03T05:10:00Z" },
      { id: "e2", neuerStatus: null, text: "Kühlkurve prüfen", sichtbarFuerKunde: false, autor: "Daniyar Omarov (betriebsleitung)", erstelltAm: "2026-09-03T09:00:00Z" },
    ],
  }),
  r2: detailVon(LISTE[1]!),
  r3: detailVon(LISTE[2]!, { erledigtAm: "2026-09-05T08:00:00Z", loesung: "Gutschrift erteilt" }),
  r4: detailVon(LISTE[3]!, { beschreibung: null, gemeldetVon: null, loesung: "darf bei offen nicht erscheinen" }),
  r5: detailVon(LISTE[4]!),
  r6: detailVon(LISTE[5]!, { erledigtAm: null, loesung: "Ersatzlieferung" }),
  r7: detailVon(LISTE[6]!, { loesung: null }),
};
const profil = (role: Role, b2bKundeId: string | null = null): SessionProfile => ({
  id: `p-${role}`,
  authUserId: `a-${role}`,
  fullName: `Probe ${role}`,
  email: null,
  role,
  brigadeId: null,
  b2bKundeId,
  pflueckerId: null,
  darfKontrollieren: false,
});
const KUNDEN: AuswahlZeile[] = [
  { id: "k1", label: "Handelskette A" },
  { id: "k2", label: "Almaty Fresh" },
];
const CHARGEN: AuswahlZeile[] = [{ id: "c1", label: "CH-0902-12" }];
const setze = (teil: Partial<Lage> = {}) => {
  lage = { profil: profil("betriebsleitung"), liste: { quelle: "db", reklamationen: LISTE }, details: DETAILS, kunden: KUNDEN, chargen: CHARGEN, ...teil };
};

// ---- Auszüge aus dem Markup ---------------------------------------------------------------------------------------------------------
const ohneTrenner = (s: string) => s.replace(/<!-- -->/g, "");
const TOENE: Record<string, string> = {
  "bg-success/10 text-success border-success/25": "success",
  "bg-primary/10 text-primary border-primary/25": "info",
  "bg-muted text-muted-foreground border-border": "neutral",
  "bg-warning/12 text-warning border-warning/25": "warning",
  "bg-destructive/10 text-destructive border-destructive/25": "danger",
};
const pillen = (html: string) =>
  [...html.matchAll(/<span (?:title="[^"]*" )?class="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0\.5 text-\[11px\] font-semibold leading-4 ([^"]+)">((?:(?!<\/span>).)*)<\/span>/g)].map(
    (m) => `${TOENE[m[1]!] ?? m[1]}:${ohneTrenner(m[2]!).replace(/<svg.*<\/svg>/, "")}`,
  );
/** Die Einträge der Liste: aktiv, Ziel, Code, Pillen, Titelzeile, Fußzeile. */
const eintraege = (html: string) =>
  [...html.matchAll(/<a class="block w-full rounded-xl border p-4 text-left transition ([^"]+)" href="([^"]*)">(.*?)<\/a>/g)].map((m) => {
    const inhalt = m[3]!;
    return {
      aktiv: m[1] === "border-primary bg-primary/5" ? true : m[1] === "border-border bg-card hover:border-primary/40" ? false : m[1],
      ziel: m[2],
      code: inhalt.match(/<span class="font-mono text-xs font-semibold text-foreground">([^<]*)<\/span>/)?.[1],
      pillen: pillen(inhalt).join(","),
      titel: ohneTrenner(inhalt.match(/<p class="mt-1 text-sm font-semibold text-card-foreground">(.*?)<\/p>/)?.[1] ?? ""),
      fuss: [...(inhalt.match(/<div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">(.*?)<\/div>/)?.[1] ?? "").matchAll(/<span>(.*?)<\/span>/g)].map((s) => ohneTrenner(s[1]!)).join("|"),
    };
  });
/** Die rechte Spalte, ohne das Anlegen-Formular darunter. */
const rechts = (html: string) => {
  const start = html.indexOf('<div class="space-y-3">');
  const ende = html.indexOf('id="anlegen-reklamation"');
  return html.slice(start, ende === -1 ? undefined : ende);
};
/** Die Karten der rechten Spalte in ihrer Reihenfolge. */
const karten = (html: string) =>
  rechts(html)
    .split('<div class="rounded-2xl border border-border p-5 ')
    .slice(1)
    .map((k) =>
      k.includes("font-mono text-xs font-semibold text-muted-foreground")
        ? "Kopf"
        : k.includes(imMarkup(t.rueckverfolgung.titel!))
          ? "Rückverfolgung"
          : k.includes('value="in_pruefung"')
            ? "Prüfen"
            : k.includes('name="status"')
              ? "Entscheidung"
              : k.includes(`>${t.verlaufTitel}</p>`)
                ? "Verlauf"
                : k.includes(imMarkup(t.note!))
                  ? "Hinweis"
                  : "?",
    )
    .join("|");
const angaben = (html: string) =>
  [...(html.match(/<dl class="mt-3 grid grid-cols-1 gap-x-3 gap-y-2 text-xs sm:grid-cols-2">(.*?)<\/dl>/)?.[1] ?? "").matchAll(/<div><dt class="text-muted-foreground">([^<]*)<\/dt><dd class="([^"]*)">(.*?)<\/dd><\/div>/g)].map(
    (m) => `${m[1]}=${ohneTrenner(m[3]!)}${m[2] === "font-semibold text-foreground" ? "" : ` [${m[2]}]`}`,
  );
const statusZiele = (html: string) => [...rechts(html).matchAll(/<input type="hidden" name="status" value="([^"]+)"\/>/g)].map((m) => m[1]).join(",");
const gutschriftFelder = (html: string) => (rechts(html).match(/name="gutschrift_tenge"/g) ?? []).length;
const verlauf = (html: string) =>
  [...html.matchAll(/<div class="rounded-lg border border-border p-2\.5 text-xs"><div class="flex flex-wrap items-center justify-between gap-1\.5"><span class="font-semibold text-foreground">([^<]*)<\/span><div class="flex items-center gap-1\.5">(.*?)<\/div><\/div><p class="mt-1 leading-5 text-foreground">([^<]*)<\/p><\/div>/g)].map(
    (m) => `${m[1]}${pillen(m[2]!).length ? ` (${pillen(m[2]!).join(",")})` : ""}: ${m[3]} @ ${m[2]!.match(/<span class="text-\[11px\] text-muted-foreground">([^<]*)<\/span>/)?.[1]}`,
  );
const nachricht = (html: string) => {
  const m = html.match(/<input type="hidden" name="reklamation_id" value="([^"]*)"\/>/);
  return m ? `${m[1]}${html.includes('name="intern"') ? "+intern" : ""}` : null;
};
const anlegen = (html: string) => {
  const start = html.indexOf('id="anlegen-reklamation"');
  if (start === -1) return null;
  const formular = html.slice(start);
  const optionen = (name: string) => {
    const auswahl = formular.match(new RegExp(`<select[^>]*name="${name}"[^>]*>(.*?)</select>`))?.[1];
    return auswahl === undefined ? "-" : [...auswahl.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map((o) => `${o[1]}:${o[2]}`).join(",");
  };
  return `kunden=${optionen("b2b_kunde_id")} chargen=${optionen("charge_id")} frist=${formular.includes('name="frist_am"')}`;
};
const leer = (html: string) => [...html.matchAll(/<div class="px-6 py-8 text-center">(.*?)<\/div><\/div>|<div class="px-6 py-8 text-center">(.*?)$/g)].length;

const DATUM = "03.09.2026, 07:10";
/** Der Absatz mit der Lösung, wie die Ansicht ihn schreibt. */
const loesung = (text: string) => `<p class="mt-3 rounded-lg border border-border bg-muted/30 p-2.5 text-xs leading-5 text-foreground"><span class="font-semibold">${imMarkup(t.loesung!)}<!-- -->: </span>${text}</p>`;
const LOESUNG_KOPF = `<span class="font-semibold">${imMarkup(t.loesung!)}<!-- -->: </span>`;
// Ein Messergebnis außerhalb von ok, warnung und verstoss hat keinen Text; die Probe nutzt eines, um den neutralen Ton zu prüfen.
const UNBEKANNT = "nachweiskette.ergebnis.unbekannt";
const ERSTE_LADUNG = ["ladeReklamationen", "getSessionProfile", "fertig ladeReklamationen", "fertig getSessionProfile"];

async function main() {
  // ---- 1. Büro, Live-Daten, ohne Auswahl ------------------------------------------------------------------------------------------
  setze();
  {
    const { html, fehler } = await ansicht();
    const unerwartet = fehler.filter((f) => !f.includes(UNBEKANNT));
    pruefe("Büro: baut ohne Fehler, Warnung und fehlenden Schlüssel auf (bis auf das absichtlich unbekannte Messergebnis)", unerwartet.length === 0, unerwartet.slice(0, 3).join(" | "));
    pruefe(
      "Büro: erst Liste und Anmeldung, danach Kunden, Chargen fürs Büro (null) und das erste Detail",
      protokoll.slice(0, 7).join(",") === [...ERSTE_LADUNG, "ladeB2bKundenOptionen", "ladeChargenOptionen(null)", "ladeReklamation(r1)"].join(","),
      protokoll.join(","),
    );
    pruefe("Büro: Abschnitt mit Titel, Einleitung und Live-Abzeichen", html.includes(`<h2 class="text-sm font-bold text-card-foreground">${t.listTitle}</h2>`) && html.includes(imMarkup(t.listLead!)) && pillen(html)[0] === `success:${quelleText.db}`, pillen(html)[0]);
    const liste = eintraege(html);
    pruefe("Liste: sieben Einträge, Ziel über die Adresszeile", liste.length === 7 && liste.every((e, i) => e.ziel === `/de/reklamationen?reklamation=r${i + 1}`), liste.map((e) => e.ziel).join(","));
    pruefe("Liste: ohne Auswahl ist die erste aktiv", liste.map((e) => e.aktiv).join(",") === "true,false,false,false,false,false,false");
    pruefe(
      "Liste: Frist nur bei offen und in Prüfung, überfällig rot, genau heute und künftig neutral",
      liste.map((e) => e.pillen).join(" / ") ===
        ["danger:Frist: 01.01.20,neutral:offen", "neutral:Frist: 31.12.99,info:In Prüfung", "success:Angenommen", "neutral:offen", `neutral:Frist: ${HEUTE.slice(8, 10)}.${HEUTE.slice(5, 7)}.${HEUTE.slice(2, 4)},neutral:offen`, "success:Erledigt", "danger:Abgelehnt"].join(" / "),
      liste.map((e) => e.pillen).join(" / "),
    );
    pruefe("Liste: das Büro sieht den Kunden vor dem Betreff", liste[0]!.titel === "Handelskette A · Betreff r1" && liste[1]!.titel === "Almaty Fresh · Betreff r2", liste[0]!.titel);
    pruefe("Liste: Grund, Charge nur mit Code, Meldezeitpunkt", liste[0]!.fuss === `Temperatur|Charge CH-0902-12|${DATUM}` && liste[2]!.fuss === `Temperatur|${DATUM}` && liste[1]!.fuss.startsWith("Menge|"), `${liste[0]!.fuss} / ${liste[2]!.fuss}`);

    pruefe("Detail offen: Kopf, Rückverfolgung, Prüfen, Entscheidung, Verlauf, Hinweis", karten(html) === "Kopf|Rückverfolgung|Prüfen|Entscheidung|Verlauf|Hinweis", karten(html));
    pruefe(
      "Detail: Code, Betreff, Status und Beschreibung",
      rechts(html).includes('<span class="font-mono text-xs font-semibold text-muted-foreground">REK-r1</span><p class="mt-0.5 text-sm font-black text-card-foreground">Betreff r1</p>') &&
        pillen(rechts(html))[0] === "neutral:offen" &&
        rechts(html).includes('<p class="mt-2 text-xs leading-5 text-muted-foreground">Beschreibung r1</p>'),
    );
    pruefe(
      "Detail offen: Angaben mit Charge und Reihenblock, Menge, Melder und überfälliger Frist, ohne Abschluss und Gutschrift",
      angaben(html).join(" | ") === `Kunde=Handelskette A | Grund=Temperatur | Charge=CH-0902-12 · Reihenblock T-N-A-03 | Betroffene Menge=44.2 kg | Gemeldet am=${DATUM} | Gemeldet von=Aigerim Sadykova | Frist=01.01.2020 [font-semibold text-destructive]`,
      angaben(html).join(" | "),
    );
    pruefe("Detail offen: die Lösung bleibt verborgen", !html.includes(LOESUNG_KOPF) && !html.includes("noch offen, darf nicht erscheinen"));
    const rv = rechts(html);
    pruefe(
      "Rückverfolgung: Titel, Einleitung und alle vier Blöcke in Reihenfolge",
      [t.rueckverfolgung.titel, t.rueckverfolgung.lead, t.rueckverfolgung.pfluecker, t.rueckverfolgung.kuehlkette, t.rueckverfolgung.transport, t.rueckverfolgung.nachbarbetrieb]
        .map((s) => rv.indexOf(imMarkup(s!)))
        .every((stelle, i, alle) => stelle > 0 && (i === 0 || stelle > alle[i - 1]!)),
    );
    pruefe("Rückverfolgung: je Pflücker ein Abzeichen mit Ausweis", rv.includes('class="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground">Aliya<!-- --> · <!-- -->A-1</span>') && rv.includes(">Bek<!-- --> · <!-- -->B-3</span>"));
    pruefe(
      "Rückverfolgung: Kühlmessungen mit Ergebnis, Minuten oder ohne Zeitpunkt, unbekanntes Ergebnis neutral",
      pillen(rv).includes("danger:Verstoß") && pillen(rv).includes(`neutral:!!${UNBEKANNT}!!`) &&
        rv.includes(`<span class="text-foreground">72 Minuten nach dem Pflücken</span><span class="text-muted-foreground">· <!-- -->02.09.2026, 10:00</span>`) &&
        rv.includes(`<span class="text-foreground">${imMarkup(t.rueckverfolgung.ohneZeitpunkt!)}</span>`),
      pillen(rv).join(","),
    );
    pruefe("Rückverfolgung: Transportmessung mit Temperatur und Ergebnis", pillen(rv).includes("warning:6.5 °C · Warnung") && rv.includes('<span class="text-muted-foreground">03.09.2026, 06:00</span>'), pillen(rv).join(","));
    pruefe("Rückverfolgung: Nachbarbetrieb mit Ort", rv.includes('<dd class="mt-1 text-xs font-semibold text-foreground">Ferma Talgar<!-- --> · Talgar</dd>'));
    pruefe("Bearbeitung offen: in Prüfung nehmen, dann annehmen, abschließen, ablehnen", statusZiele(html) === "in_pruefung,angenommen,erledigt,abgelehnt" && gutschriftFelder(html) === 2, statusZiele(html));
    pruefe("Bearbeitung: Knopftexte in der Reihenfolge", ["inPruefungKnopf", "annehmenKnopf", "erledigtKnopf", "ablehnenKnopf"].map((s) => rv.indexOf(imMarkup(t.ablauf[s]!))).every((stelle, i, alle) => stelle > 0 && (i === 0 || stelle > alle[i - 1]!)));
    pruefe(
      "Verlauf: ohne Autor der Kunde, intern markiert, mit Zeitpunkt",
      verlauf(html).join(" | ") === `Handelskette A: Gemeldet @ ${DATUM} | Daniyar Omarov (betriebsleitung) (neutral:${t.internMarkierung}): Kühlkurve prüfen @ 03.09.2026, 11:00`,
      verlauf(html).join(" | "),
    );
    pruefe("Verlauf: Nachricht mit Intern-Schalter fürs Büro", nachricht(html) === "r1+intern", nachricht(html) ?? "");
    pruefe("Anlegen: Kunden- und Chargenauswahl, Frist fürs Büro", anlegen(html) === "kunden=k1:Handelskette A,k2:Almaty Fresh chargen=:ohne Chargenbezug,c1:CH-0902-12 frist=true", anlegen(html) ?? "");
    pruefe("Hinweis steht unter dem Detail", rechts(html).includes(`<div class="rounded-2xl border border-border p-5 bg-muted/30 text-xs leading-5 text-muted-foreground">${imMarkup(t.note!)}</div>`));
  }

  // ---- 2. Detail je Status --------------------------------------------------------------------------------------------------------
  {
    setze();
    const { html } = await ansicht("r2");
    pruefe("Auswahl r2: die zweite ist aktiv und wird geladen", eintraege(html).map((e) => e.aktiv).join(",") === "false,true,false,false,false,false,false" && protokoll.includes("ladeReklamation(r2)") && !protokoll.includes("ladeReklamation(r1)"));
    pruefe("In Prüfung: keine Rückverfolgung ohne Daten, kein Prüfen, Entscheidung mit allen drei", karten(html) === "Kopf|Entscheidung|Verlauf|Hinweis" && statusZiele(html) === "angenommen,erledigt,abgelehnt", `${karten(html)} ${statusZiele(html)}`);
    pruefe("In Prüfung: künftige Frist nicht rot", angaben(html).includes("Frist=31.12.2099"), angaben(html).join(" | "));
    pruefe("Verlauf leer: Hinweis statt Einträgen", rechts(html).includes(`<p class="text-xs text-muted-foreground">${imMarkup(t.verlaufLeer!)}</p>`) && verlauf(html).length === 0);
  }
  {
    setze();
    const { html } = await ansicht("r3");
    pruefe("Angenommen: nur noch abschließen, mit Gutschrift", karten(html) === "Kopf|Entscheidung|Verlauf|Hinweis" && statusZiele(html) === "erledigt" && gutschriftFelder(html) === 1, `${karten(html)} ${statusZiele(html)}`);
    pruefe(
      "Angenommen: ohne Charge, ohne Frist, mit Abschluss und Gutschrift",
      angaben(html).join(" | ") === `Kunde=Handelskette A | Grund=Temperatur | Charge=${t.ohneCharge} | Betroffene Menge=44.2 kg | Gemeldet am=${DATUM} | Gemeldet von=Aigerim Sadykova | Abgeschlossen am=05.09.2026, 10:00 | Gutschrift=15.000 ₸`,
      angaben(html).join(" | "),
    );
    pruefe("Angenommen: die Lösung erscheint", rechts(html).includes(loesung("Gutschrift erteilt")));
  }
  {
    setze();
    const { html } = await ansicht("r6");
    pruefe("Erledigt: keine Bearbeitung mehr", karten(html) === "Kopf|Verlauf|Hinweis" && statusZiele(html) === "", karten(html));
    pruefe("Erledigt ohne Abschlusszeit: Strich", angaben(html).includes("Abgeschlossen am=-") && rechts(html).includes(loesung("Ersatzlieferung")), angaben(html).join(" | "));
  }
  {
    setze();
    const { html } = await ansicht("r7");
    pruefe("Abgelehnt ohne Lösung: keine Bearbeitung, kein Lösungsabsatz", karten(html) === "Kopf|Verlauf|Hinweis" && !rechts(html).includes(LOESUNG_KOPF), karten(html));
  }
  {
    setze();
    const { html } = await ansicht("r4");
    pruefe(
      "Offen ohne Beschreibung, Charge, Menge, Melder und Frist",
      angaben(html).join(" | ") === `Kunde=Handelskette A | Grund=Temperatur | Charge=${t.ohneCharge} | Gemeldet am=${DATUM}` && !rechts(html).includes('<p class="mt-2 text-xs leading-5 text-muted-foreground">'),
      angaben(html).join(" | "),
    );
    pruefe("Offen: Lösung bleibt verborgen, auch wenn eine gespeichert ist", !html.includes("darf bei offen nicht erscheinen") && !html.includes(LOESUNG_KOPF));
  }
  {
    setze();
    const { html } = await ansicht("r5");
    pruefe("Frist genau heute: nicht rot", angaben(html).some((a) => a.startsWith("Frist=") && !a.includes("text-destructive")), angaben(html).join(" | "));
  }
  {
    setze();
    const { html } = await ansicht("gibt-es-nicht");
    pruefe("Unbekannte Auswahl: die erste ist aktiv und wird geladen", eintraege(html)[0]!.aktiv === true && protokoll.includes("ladeReklamation(r1)"));
  }

  // ---- 3. Rückverfolgung je Block -------------------------------------------------------------------------------------------------
  const nurBlock = async (teil: Partial<ReklamationDetail>) => {
    setze({ details: { ...DETAILS, r2: detailVon(LISTE[1]!, teil) } });
    return rechts((await ansicht("r2")).html);
  };
  {
    const pfluecker = await nurBlock({ pflueckerListe: [{ name: "Aliya", ausweis: "A-1" }] });
    pruefe("Nur Pflücker: Karte nur mit diesem Block", karten(pfluecker) === "Kopf|Rückverfolgung|Entscheidung|Verlauf|Hinweis" && pfluecker.includes(t.rueckverfolgung.pfluecker!) && !pfluecker.includes(t.rueckverfolgung.kuehlkette!) && !pfluecker.includes(t.rueckverfolgung.transport!) && !pfluecker.includes(t.rueckverfolgung.nachbarbetrieb!));
    const kuehl = await nurBlock({ kuehlmessungen: [{ id: "k1", minutenSeitPfluecken: 30, ergebnis: "ok", gemessenAm: "2026-09-02T08:00:00Z" }] });
    pruefe("Nur Kühlmessung: Karte nur mit diesem Block", karten(kuehl).includes("Rückverfolgung") && kuehl.includes(t.rueckverfolgung.kuehlkette!) && !kuehl.includes(t.rueckverfolgung.pfluecker!) && pillen(kuehl).includes("success:ok"));
    const transport = await nurBlock({ transportMessungen: [{ id: "t1", temperaturC: 4, ergebnis: "ok", gemessenAm: "2026-09-03T04:00:00Z" }] });
    pruefe("Nur Transport: Karte nur mit diesem Block", karten(transport).includes("Rückverfolgung") && transport.includes(t.rueckverfolgung.transport!) && !transport.includes(t.rueckverfolgung.kuehlkette!) && pillen(transport).includes("success:4 °C · ok"));
    const nachbar = await nurBlock({ nachbarbetrieb: { name: "Bauer Nurlan", ort: null } });
    pruefe("Nur Nachbarbetrieb ohne Ort: Name ohne Trenner", karten(nachbar).includes("Rückverfolgung") && nachbar.includes('<dd class="mt-1 text-xs font-semibold text-foreground">Bauer Nurlan</dd>') && !nachbar.includes(t.rueckverfolgung.pfluecker!));
  }

  // ---- 4. Kunde ------------------------------------------------------------------------------------------------------------------
  {
    setze({ profil: profil("kunde", "k1") });
    const { html, fehler } = await ansicht();
    pruefe("Kunde: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
    pruefe("Kunde: keine Kundenauswahl, Chargen der eigenen Firma", protokoll.slice(0, 6).join(",") === [...ERSTE_LADUNG, "ladeChargenOptionen(k1)", "ladeReklamation(r1)"].join(","), protokoll.join(","));
    pruefe("Kunde: Betreff ohne Kundennamen", eintraege(html)[0]!.titel === "Betreff r1", eintraege(html)[0]!.titel);
    pruefe("Kunde: keine Rückverfolgung trotz Daten, keine Bearbeitung", karten(html) === "Kopf|Verlauf|Hinweis", karten(html));
    pruefe("Kunde: Nachricht ohne Intern-Schalter", nachricht(html) === "r1", nachricht(html) ?? "");
    pruefe("Kunde: Anlegen ohne Kundenauswahl und ohne Frist", anlegen(html) === "kunden=- chargen=:ohne Chargenbezug,c1:CH-0902-12 frist=false", anlegen(html) ?? "");
  }
  {
    setze({ profil: profil("kunde", null) });
    await ansicht();
    pruefe("Kunde ohne Firma: Chargen mit null", protokoll.includes("ladeChargenOptionen(null)") && !protokoll.includes("ladeB2bKundenOptionen"), protokoll.join(","));
  }

  // ---- 5. Rechte je Rolle --------------------------------------------------------------------------------------------------------
  const rechteVon = async (p: SessionProfile | null) => {
    setze({ profil: p });
    const { html } = await ansicht();
    return [
      protokoll.includes("ladeB2bKundenOptionen") ? "kunden" : "",
      protokoll.some((z) => z.startsWith("ladeChargenOptionen")) ? "chargen" : "",
      eintraege(html)[0]!.titel.includes(" · ") ? "kundenname" : "",
      karten(html),
      nachricht(html) ?? "keine-nachricht",
      anlegen(html) ? "anlegen" : "kein-anlegen",
    ]
      .filter(Boolean)
      .join(" ");
  };
  const BUERO = "kunden chargen kundenname Kopf|Rückverfolgung|Prüfen|Entscheidung|Verlauf|Hinweis r1+intern anlegen";
  const OHNE = "Kopf|Verlauf|Hinweis keine-nachricht kein-anlegen";
  for (const rolle of ["admin", "ceo", "betriebsleitung", "buchhaltung"] as const) {
    const ergebnis = await rechteVon(profil(rolle));
    pruefe(`Rechte ${rolle}: Büro mit allem`, ergebnis === BUERO, ergebnis);
  }
  for (const rolle of ["brigade", "picker", "erzeuger"] as const) {
    const ergebnis = await rechteVon(profil(rolle));
    pruefe(`Rechte ${rolle}: nur lesen, nichts nachladen außer dem Detail`, ergebnis === OHNE && protokoll.join(",") === [...ERSTE_LADUNG, "ladeReklamation(r1)", "fertig ladeReklamation(r1)"].join(","), `${ergebnis} / ${protokoll.join(",")}`);
  }
  {
    const ergebnis = await rechteVon(null);
    pruefe("Rechte ohne Anmeldung: nur lesen", ergebnis === OHNE, ergebnis);
  }

  // ---- 6. Demo und Lesefehler: keine Formulare, Büro sieht trotzdem Kunde und Rückverfolgung ----------------------------------
  for (const quelle of ["demo", "fehler"] as const) {
    setze({ liste: { quelle, reklamationen: LISTE } });
    const { html } = await ansicht();
    pruefe(
      `Quelle ${quelle}: Abzeichen, keine Formulare, nichts nachgeladen außer dem Detail`,
      pillen(html)[0] === `${quelle === "demo" ? "warning" : "danger"}:${quelleText[quelle]}` &&
        karten(html) === "Kopf|Rückverfolgung|Verlauf|Hinweis" && nachricht(html) === null && anlegen(html) === null && eintraege(html)[0]!.titel.includes(" · ") &&
        protokoll.join(",") === [...ERSTE_LADUNG, "ladeReklamation(r1)", "fertig ladeReklamation(r1)"].join(","),
      `${pillen(html)[0]} ${karten(html)} ${protokoll.join(",")}`,
    );
  }

  // ---- 7. Leere Liste und fehlendes Detail ---------------------------------------------------------------------------------------
  const anlegenLink = `href="/de/reklamationen#anlegen-reklamation"`;
  {
    setze({ liste: { quelle: "db", reklamationen: [] } });
    const { html, fehler } = await ansicht();
    pruefe("Leer Büro: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
    pruefe("Leer Büro: kein Detail geladen", !protokoll.some((z) => z.startsWith("ladeReklamation(")) && protokoll.includes("ladeB2bKundenOptionen"), protokoll.join(","));
    pruefe("Leer Büro: leere Liste mit Anlegen, leeres Detail, Hinweis, Formular", html.includes(imMarkup(t.empty!)) && html.includes(imMarkup(t.detailEmpty!)) && html.includes(imMarkup(t.formular.anlegen.titel!)) && karten(html) === "Hinweis" && anlegen(html) !== null && leer(html) === 2);
    pruefe("Leer Büro: der leere Zustand verweist auf das Formular", html.includes(anlegenLink) || html.includes("#anlegen-reklamation"), html.match(/href="[^"]*anlegen[^"]*"/)?.[0] ?? "kein Link");
  }
  {
    setze({ liste: { quelle: "db", reklamationen: [] }, profil: profil("brigade") });
    const { html } = await ansicht();
    pruefe("Leer ohne Recht: kein Verweis auf das Formular, kein Formular", !html.includes("#anlegen-reklamation") && anlegen(html) === null && html.includes(imMarkup(t.empty!)));
  }
  {
    setze({ details: {} });
    const { html } = await ansicht();
    pruefe("Detail nicht gefunden: leerer Zustand statt Karten, Liste bleibt", karten(html) === "Hinweis" && html.includes(imMarkup(t.detailEmpty!)) && eintraege(html).length === 7 && anlegen(html) !== null);
  }

  // ---- 8. Grenzwerte: 0 ist ein Wert, Charge ohne Reihenblock ----------------------------------------------------------------------
  {
    const rv = await nurBlock({
      reihenblock: null,
      betroffeneMengeKg: 0,
      gutschriftTenge: 0,
      kuehlmessungen: [{ id: "k1", minutenSeitPfluecken: 0, ergebnis: "ok", gemessenAm: "2026-09-02T08:00:00Z" }],
    });
    pruefe(
      "Grenzwerte: Charge ohne Reihenblock, Menge 0 kg und Gutschrift 0 ₸ erscheinen",
      angaben(rv).join(" | ") === `Kunde=Almaty Fresh | Grund=Menge | Charge=CH-0902-12 | Betroffene Menge=0 kg | Gemeldet am=${DATUM} | Gemeldet von=Aigerim Sadykova | Frist=31.12.2099 | Gutschrift=0 ₸`,
      angaben(rv).join(" | "),
    );
    pruefe("Grenzwerte: 0 Minuten nach dem Pflücken statt ohne Zeitpunkt", rv.includes('<span class="text-foreground">0 Minuten nach dem Pflücken</span>') && !rv.includes(imMarkup(t.rueckverfolgung.ohneZeitpunkt!)));
  }

  // ---- 9. Teile ohne die Ansicht: Statusregeln, Rechte, Zeitpunkt und Detailkarten (seit dem Zerlegen, 14.10.2026) ----------------
  {
    const { ReklamationDetailKarten, hatRueckverfolgung, zeitpunkt } = await import("../../src/components/db/reklamation-detail");
    const alle = ["offen", "in_pruefung", "angenommen", "abgelehnt", "erledigt"] as const;
    pruefe("Status: offen sind nur gemeldet und in Prüfung", alle.filter(istOffen).join(",") === "offen,in_pruefung");
    pruefe("Status: abschließbar ist zusätzlich angenommen", alle.filter(istAbschliessbar).join(",") === "offen,in_pruefung,angenommen");
    pruefe(
      "Frist: überfällig nur offen oder in Prüfung und vor heute",
      istUeberfaellig({ status: "offen", fristAm: "2026-10-13" }, "2026-10-14") &&
        istUeberfaellig({ status: "in_pruefung", fristAm: "2026-10-01" }, "2026-10-14") &&
        !istUeberfaellig({ status: "offen", fristAm: "2026-10-14" }, "2026-10-14") &&
        !istUeberfaellig({ status: "offen", fristAm: null }, "2026-10-14") &&
        !istUeberfaellig({ status: "angenommen", fristAm: "2026-10-01" }, "2026-10-14"),
    );

    const rechte = (rolle: Role | null | undefined, live: boolean) =>
      Object.entries(reklamationsRechte(rolle, live))
        .filter(([, darf]) => darf)
        .map(([name]) => name)
        .join(",");
    pruefe("Rechte: Büro mit Live-Daten darf alles", rechte("betriebsleitung", true) === "istBuero,darfAnlegen,darfInPruefungNehmen,darfEntscheiden", rechte("betriebsleitung", true));
    pruefe("Rechte: Büro ohne Live-Daten bleibt Büro, schreibt aber nichts", rechte("admin", false) === "istBuero", rechte("admin", false));
    pruefe("Rechte: Kunde legt nur an, und nur mit Live-Daten", rechte("kunde", true) === "darfAnlegen" && rechte("kunde", false) === "");
    pruefe("Rechte: Brigade und ohne Anmeldung nichts", rechte("brigade", true) === "" && rechte(null, true) === "" && rechte(undefined, true) === "");

    const ohne = detailVon(LISTE[1]!);
    pruefe(
      "Rückverfolgung: jeder Block allein reicht, ohne alle keine",
      !hatRueckverfolgung(ohne) &&
        hatRueckverfolgung({ ...ohne, pflueckerListe: RUECKVERFOLGUNG.pflueckerListe }) &&
        hatRueckverfolgung({ ...ohne, kuehlmessungen: RUECKVERFOLGUNG.kuehlmessungen }) &&
        hatRueckverfolgung({ ...ohne, transportMessungen: RUECKVERFOLGUNG.transportMessungen }) &&
        hatRueckverfolgung({ ...ohne, nachbarbetrieb: RUECKVERFOLGUNG.nachbarbetrieb }),
    );
    const format = createFormatter({ locale: "de", timeZone: ZEITZONE });
    pruefe("Zeitpunkt: Datum mittel mit Uhrzeit, ohne Angabe ein Strich", zeitpunkt(format, "2026-09-03T05:10:00Z") === DATUM && zeitpunkt(format, null) === "-");

    // Die Detailkarten allein mit festen Daten, ohne Ansicht und ohne Lader. In derselben Spalte gebaut wie in der Ansicht, damit
    // die Auszüge (karten, statusZiele, nachricht) greifen; das Markup der Karten steht Zeichen für Zeichen auch in der ganzen Ansicht.
    // React hängt bei Formularen mit Aktion ein Skript für vorzeitiges Abschicken hinter die Wurzel; es gehört nicht zu den Karten.
    const spalte = (detail: ReklamationDetail, rechte: ReklamationsRechte) =>
      baue(() => (
        <div className="space-y-3">
          <ReklamationDetailKarten detail={detail} rechte={rechte} heuteIso={HEUTE} />
        </div>
      ));
    const kartenMarkup = (html: string) => html.replace(/<script>[\s\S]*?<\/script>$/, "").slice('<div class="space-y-3">'.length, -"</div>".length);
    for (const [id, rolle] of [["r1", "betriebsleitung"], ["r3", "betriebsleitung"], ["r1", "kunde"], ["r6", "brigade"]] as const) {
      setze({ profil: profil(rolle, rolle === "kunde" ? "k1" : null) });
      const ganz = (await ansicht(id)).html;
      const allein = await spalte(DETAILS[id]!, reklamationsRechte(rolle, true));
      const fehler = allein.fehler.filter((f) => !f.includes(UNBEKANNT));
      pruefe(
        `Detailkarten allein (${id}, ${rolle}): ohne Fehler und Zeichen für Zeichen wie in der Ansicht`,
        fehler.length === 0 && kartenMarkup(allein.html).startsWith('<div class="rounded-2xl border border-border p-5 bg-muted/20">') && ganz.includes(kartenMarkup(allein.html)),
        fehler.slice(0, 2).join(" | "),
      );
    }

    // Bearbeitung je Recht, auch in Kombinationen, die heute keine Rolle hat (wer update hat, hat auch approve).
    const ohneRechte: ReklamationsRechte = { istBuero: false, darfAnlegen: false, darfInPruefungNehmen: false, darfEntscheiden: false };
    const bearbeitung = async (status: ReklamationDetail["status"], rechte: Partial<ReklamationsRechte>) => {
      const { html } = await spalte({ ...DETAILS.r4!, status }, { ...ohneRechte, ...rechte });
      return `${karten(html)} ${statusZiele(html) || "-"}`;
    };
    const faelle: [string, ReklamationDetail["status"], Partial<ReklamationsRechte>, string][] = [
      ["nur in Prüfung nehmen, offen", "offen", { darfInPruefungNehmen: true }, "Kopf|Prüfen|Verlauf in_pruefung"],
      ["nur in Prüfung nehmen, schon in Prüfung", "in_pruefung", { darfInPruefungNehmen: true }, "Kopf|Verlauf -"],
      ["nur entscheiden, offen", "offen", { darfEntscheiden: true }, "Kopf|Entscheidung|Verlauf angenommen,erledigt,abgelehnt"],
      ["nur entscheiden, angenommen", "angenommen", { darfEntscheiden: true }, "Kopf|Entscheidung|Verlauf erledigt"],
      ["nur entscheiden, abgelehnt", "abgelehnt", { darfEntscheiden: true }, "Kopf|Verlauf -"],
    ];
    for (const [name, status, rechte, erwartet] of faelle) {
      const ergebnis = await bearbeitung(status, rechte);
      pruefe(`Teile: ${name}`, ergebnis === erwartet, ergebnis);
    }
    const nurBuero = await spalte(DETAILS.r1!, { ...ohneRechte, istBuero: true });
    pruefe("Teile: Büro ohne Schreibrecht sieht Rückverfolgung, schreibt aber keine Nachricht", karten(nurBuero.html) === "Kopf|Rückverfolgung|Verlauf" && nachricht(nurBuero.html) === null, karten(nurBuero.html));
    const nurAnlegen = await spalte(DETAILS.r1!, { ...ohneRechte, darfAnlegen: true });
    pruefe("Teile: Anlegen ohne Büro schreibt Nachrichten ohne Intern-Schalter, ohne Rückverfolgung", karten(nurAnlegen.html) === "Kopf|Verlauf" && nachricht(nurAnlegen.html) === "r1", karten(nurAnlegen.html));
  }

  ende();
}

main().catch((e) => {
  console.error("FAIL  Ausnahme", e);
  process.exit(1);
});
