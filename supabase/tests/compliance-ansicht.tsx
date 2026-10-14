import { NextIntlClientProvider, createFormatter, createTranslator } from "next-intl";
import { prerender } from "react-dom/static";
import type { SessionProfile } from "../../src/lib/auth";
import type { BetroffenenOptionen, ComplianceCockpit } from "../../src/lib/data/compliance";
import type { OffeneEsutdFrist } from "../../src/lib/data/esutd";
import type { MwstUebersicht } from "../../src/lib/data/mwst";
import type { DrittweitergabeZeile, EinwilligungZeile, VorfallZeile } from "../../src/lib/domain/compliance";
import type { MwstStatus } from "../../src/lib/domain/mwst";
import type { Role } from "../../src/lib/rbac";
import { ersetzeModule } from "./hilfen/modul-ersatz";
import { imMarkup, pruefer, texteVon } from "./hilfen/ansicht-probe";
import { abschnitt, kacheln, knoepfe, leerzustaende, optionen, pillen, tabellenKoepfe, tabellenZeilen, textVon, versteckt } from "./hilfen/markup-auszug";

// Charakterisierung des Compliance-Cockpits (db/compliance-ansicht.tsx), ohne Browser und ohne Datenbank (seit 14.10.2026):
//   * Datenladen: die fünf Lader und die Anmeldung starten gemeinsam, danach lädt die Ansicht nichts mehr nach.
//   * Risiko-Radar nur bei Live-Daten, gespeist aus MwSt-Frist, ESUTD-Fristen und nur den überfälligen Vorfällen und Weitergaben.
//   * Kennzahlen mit Ton, MwSt-Abschnitt je Stand (registriert oder nicht, Umsatz fehlt, unter, auf und über der Schwelle, Schwelle
//     überschritten, nie geprüft, kein Satz), MwSt-Formulare nur mit Stammdatenrecht bei Live-Daten des Cockpits.
//   * Prüfprotokoll mit und ohne Einträge, Einwilligungen, Vorfälle, Drittweitergaben und Zwecke je Zeilenstand mit Formular oder
//     Anzeige je Recht, die drei Anlegen-Formulare samt Auswahllisten.
//   * Rechte je Rolle, Demo und Lesefehler des Cockpits und der MwSt-Quelle.
// Server-Bausteine sind ersetzt (hilfen/modul-ersatz.ts): next-intl/server liefert Übersetzer und Formatierer aus den echten Texten,
// getSessionProfile die Anmeldung der Lage, die Lader aus lib/data/compliance, lib/data/mwst und lib/data/esutd feste Daten. Der
// Risiko-Radar und baueRisikoEintraege laufen echt. Gerendert wird mit prerender (asynchrone Server-Komponenten). Abschicken der
// Formulare und die Fälligkeitsanzeige, die erst im Browser erscheint, bleiben Prüfpunkte im Browser.
// Aufruf: npm run test:compliance-ansicht

const { pruefe, ende } = pruefer();

const de = texteVon("de") as Record<string, Record<string, unknown>>;
type Texte = Record<string, string>;
const t = de.complianceAnsicht as unknown as Texte & {
  mwst: Texte & { stat: Texte; messer: Texte; horizontalesMonitoring: Texte; formular: Record<string, Texte> };
  risikoRadar: Texte;
  stat: Texte;
  col: Texte;
  status: Texte;
  einwilligungen: Texte;
  vorfaelle: Texte;
  drittweitergaben: Texte;
  zwecke: Texte;
  audit: Texte;
  formular: Record<string, Texte>;
};
const quelleText = (de.dashboard as { dataSource: Record<string, string> }).dataSource;
const ZEITZONE = "Europe/Berlin";

// ---- Lage und Ersatzmodule ---------------------------------------------------------------------------------------------------------
interface Lage {
  profil: SessionProfile | null;
  cockpit: ComplianceCockpit;
  mwst: MwstUebersicht;
  esutd: OffeneEsutdFrist[];
  betroffene: BetroffenenOptionen;
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
  "@/lib/data/compliance": {
    ladeCompliance: () => spaeter("ladeCompliance", lage.cockpit),
    ladeBetroffenenOptionen: () => spaeter("ladeBetroffenenOptionen", lage.betroffene),
  },
  "@/lib/data/mwst": {
    ladeMwstStatus: () => spaeter("ladeMwstStatus", lage.mwst),
  },
  "@/lib/data/esutd": {
    ladeOffeneEsutdFristen: () => spaeter("ladeOffeneEsutdFristen", lage.esutd),
  },
});

async function ansicht(): Promise<{ html: string; fehler: string[] }> {
  protokoll = [];
  textFehler = [];
  const konsole: string[] = [];
  const echt = console.error;
  console.error = (...a: unknown[]) => konsole.push(a.map(String).join(" "));
  try {
    const { ComplianceAnsicht } = await import("../../src/components/db/compliance-ansicht");
    const element = await ComplianceAnsicht();
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
const einwilligung = (teil: Partial<EinwilligungZeile> & { id: string }): EinwilligungZeile => ({
  betroffener: `Person ${teil.id}`,
  zweck: "Personaleinsatz und Lohnabrechnung",
  kanal: "papier",
  erteiltAm: "2026-08-20T08:00:00Z",
  widerrufenAm: null,
  widerrufGrund: null,
  ...teil,
});
const vorfall = (teil: Partial<VorfallZeile> & { id: string }): VorfallZeile => ({
  festgestelltAm: "2026-08-25T08:00:00Z",
  art: "unbefugter_zugriff",
  beschreibung: `Vorfall ${teil.id}`,
  betroffeneAnzahl: 1,
  meldefristAm: "2026-08-26T08:00:00Z",
  gemeldetAm: null,
  meldereferenz: null,
  behobenAm: null,
  ueberfaellig: false,
  verantwortlichProfilId: "pr1",
  verantwortlicher: "N. Amanschajewa",
  ...teil,
});
const weitergabe = (teil: Partial<DrittweitergabeZeile> & { id: string }): DrittweitergabeZeile => ({
  betroffener: `Person ${teil.id}`,
  empfaenger: `Empfänger ${teil.id}`,
  zweck: null,
  weitergegebenAm: "2026-08-05T08:00:00Z",
  benachrichtigungsfristAm: "2026-08-19T08:00:00Z",
  benachrichtigtAm: null,
  ueberfaellig: false,
  ...teil,
});
const COCKPIT: ComplianceCockpit = {
  quelle: "db",
  kennzahlen: { einwilligungenAktiv: 2, einwilligungenWiderrufen: 1, vorfaelleUeberfaellig: 1, drittweitergabenUeberfaellig: 0 },
  zwecke: [
    { id: "z1", code: "personal", bezeichnung: "Personaleinsatz", rechtsgrundlage: "vertrag", aufbewahrungMonate: 36, automatisierteEntscheidung: true, verantwortlichProfilId: "pr1", verantwortlicher: "N. Amanschajewa" },
    { id: "z2", code: "esutd", bezeichnung: "ESUTD-Meldung", rechtsgrundlage: "gesetzliche_pflicht", aufbewahrungMonate: 1, automatisierteEntscheidung: false, verantwortlichProfilId: null, verantwortlicher: null },
  ],
  einwilligungen: [
    einwilligung({ id: "e1" }),
    einwilligung({ id: "e2", kanal: "web", widerrufenAm: "2026-08-30T08:00:00Z", widerrufGrund: "Vertrag beendet" }),
  ],
  vorfaelle: [
    vorfall({ id: "v1", ueberfaellig: true, verantwortlichProfilId: null, verantwortlicher: null }),
    vorfall({ id: "v2", art: "verlust", gemeldetAm: "2026-08-26T07:00:00Z" }),
    vorfall({ id: "v3", art: "offenlegung", meldefristAm: "2099-12-31T08:00:00Z" }),
    vorfall({ id: "v4", art: "sonstiges", meldefristAm: null, verantwortlichProfilId: null, verantwortlicher: null }),
  ],
  drittweitergaben: [
    weitergabe({ id: "d1", ueberfaellig: true }),
    weitergabe({ id: "d2", benachrichtigtAm: "2026-08-10T08:00:00Z" }),
    weitergabe({ id: "d3", benachrichtigungsfristAm: "2099-12-31T08:00:00Z" }),
    weitergabe({ id: "d4", benachrichtigungsfristAm: null }),
  ],
  auditEreignisse: [
    { id: "a1", actor: "S. Nurlan (buchhaltung)", aktion: "lohn.freigegeben", ressource: "lohn", ressourceId: null, erstelltAm: "2026-08-28T07:40:00Z" },
    { id: "a2", actor: null, aktion: "system.lauf", ressource: "kpi", ressourceId: null, erstelltAm: "2026-08-28T05:00:00Z" },
  ],
};
const SCHWELLE = 43250000;
const mwstStatus = (teil: Partial<MwstStatus> = {}): MwstStatus => ({
  standardProzent: 16,
  schwelleTenge: SCHWELLE,
  quelle: "Steuerkodex RK 2026",
  registriert: false,
  registriertAm: null,
  schwelleUeberschrittenAm: "2026-09-01T08:00:00Z",
  meldefristAm: "2026-09-08",
  letzterUmsatzTenge: 50000000,
  letztePruefungAm: "2026-09-01T08:00:00Z",
  ...teil,
});
const BETROFFENE: BetroffenenOptionen = {
  pfluecker: [{ id: "pf1", label: "Aliya" }],
  profile: [
    { id: "pr1", label: "N. Amanschajewa" },
    { id: "pr2", label: "S. Nurlan" },
  ],
  b2bKunden: [{ id: "b1", label: "Handelskette A" }],
};
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
  lage = {
    profil: profil("buchhaltung"),
    cockpit: COCKPIT,
    mwst: { quelle: "db", status: mwstStatus() },
    esutd: [{ id: "f1", pfluecker: "Aliya", meldefristAm: "2099-01-01" }],
    betroffene: BETROFFENE,
    ...teil,
  };
};

// ---- Auszüge -----------------------------------------------------------------------------------------------------------------------
const LADER = ["ladeCompliance", "ladeMwstStatus", "ladeOffeneEsutdFristen", "ladeBetroffenenOptionen", "getSessionProfile"];
/** Was in welcher Reihenfolge auf der Seite steht: Radar, Abschnitte (§) und Formularkarten (+). */
const gliederung = (html: string) =>
  [...html.matchAll(/id="risiko-radar"|<h2 class="text-sm font-bold text-card-foreground">([^<]*)<\/h2>|<p class="schrift-dense font-black text-card-foreground">([^<]*)<\/p>/g)]
    .map((m) => (m[1] !== undefined ? `§${m[1]}` : m[2] !== undefined ? `+${m[2]}` : "Radar"))
    .join(" | ");
const radar = (html: string) => {
  const start = html.indexOf('id="risiko-radar"');
  if (start === -1) return null;
  const block = html.slice(start, html.indexOf("<section", start));
  const eintraege = [...block.matchAll(/<li class="risiko-radar-eintrag[^"]*(border-danger\/30)?[^"]*"[\s\S]*?<\/li>/g)].map((m) => {
    const ueber = m[0].includes("border-danger/30 bg-danger/[0.05]") ? "!" : "";
    const label = m[0].match(/<p class="text-xs font-semibold text-foreground">([^<]*)<\/p>/)?.[1];
    const ziel = m[0].match(/href="([^"]*)"/)?.[1];
    return `${ueber}${label} -> ${ziel}`;
  });
  const zaehler = block.match(/<span class="inline-flex shrink-0 items-center gap-1\.5 rounded-full[^>]*>([^<]*)<\/span>/)?.[1] ?? "-";
  return { zaehler, eintraege };
};
const MWST_TITEL = t.mwst.titel!;
const DATUM = (tag: string, zeit: string) => `${tag}, ${zeit}`;
const zeilenText = (html: string) => tabellenZeilen(html).map((z) => z.join(" ; "));

async function main() {
  // ---- 1. Buchhaltung, Live-Daten, Schwelle überschritten, alles da --------------------------------------------------------------
  setze();
  {
    const { html, fehler } = await ansicht();
    pruefe("Buchhaltung: baut ohne Fehler, Warnung und fehlenden Schlüssel auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
    pruefe("Datenladen: alle fünf gemeinsam gestartet, danach nichts nachgeladen", protokoll.join(",") === [...LADER, ...LADER.map((l) => `fertig ${l}`)].join(","), protokoll.join(","));
    pruefe(
      "Gliederung: Radar, Cockpit, MwSt mit Registrieren-Karte, Monitoring, Protokoll, Einwilligungen, Formular, Vorfälle, Formular, Weitergaben, Zwecke",
      gliederung(html) ===
        ["Radar", `§${t.cockpitTitle}`, `§${MWST_TITEL}`, `+${t.mwst.formular.registrieren!.titel}`, `§${t.mwst.horizontalesMonitoring.titel}`, `§${t.audit.titel}`, `§${t.einwilligungen.titel}`, `+${t.formular.einwilligung!.titel}`, `§${t.vorfaelle.titel}`, `+${t.formular.vorfall!.titel}`, `§${t.drittweitergaben.titel}`, `§${t.zwecke.titel}`].join(" | "),
      gliederung(html),
    );
    const r = radar(html);
    pruefe(
      "Radar: überfällige zuerst, älteste vorn; MwSt-Frist, ESUTD, nur überfällige Vorfälle und Weitergaben",
      r?.zaehler === "4 offene Frist(en)" &&
        r.eintraege.join(" ; ") ===
          [
            "!Benachrichtigung über Weitergabe an Empfänger d1 -> /de/dashboard/buero/compliance#drittweitergaben",
            "!Meldung eines Datenschutzvorfalls an die Behörde -> /de/dashboard/buero/compliance#datenschutzvorfaelle",
            "!MwSt-Registrierung nach Schwellenüberschreitung -> /de/dashboard/buero/compliance#mwst-registrierung",
            "ESUTD-Meldung für Aliya -> /de/dashboard/buero/personal",
          ].join(" ; "),
      `${r?.zaehler} / ${r?.eintraege.join(" ; ")}`,
    );
    const cockpit = abschnitt(html, t.cockpitTitle!);
    pruefe("Cockpit: Einleitung und Live-Abzeichen", cockpit.includes(imMarkup(t.cockpitLead!)) && pillen(cockpit)[0] === `success:${quelleText.db}`, pillen(cockpit)[0]);
    pruefe(
      "Cockpit: vier Kennzahlen, überfällige rot nur über null",
      kacheln(cockpit).join(" ; ") ===
        [`${t.stat.einwilligungenAktiv}=2 [success]`, `${t.stat.einwilligungenWiderrufen}=1 [neutral]`, `${t.stat.vorfaelleUeberfaellig}=1 (${t.stat.vorfaelleUeberfaelligHinweis}) [danger]`, `${t.stat.drittweitergabenUeberfaellig}=0 (${t.stat.drittweitergabenUeberfaelligHinweis}) [success]`].join(" ; "),
      kacheln(cockpit).join(" ; "),
    );
    const mwst = abschnitt(html, MWST_TITEL);
    pruefe("MwSt: Sprungziel, Einleitung, Abzeichen der MwSt-Quelle", mwst.startsWith('<section id="mwst-registrierung"') && mwst.includes(imMarkup(t.mwst.lead!)) && pillen(mwst)[0] === `success:${quelleText.db}`);
    pruefe(
      "MwSt: nicht registriert, Satz, Umsatz über der Schwelle rot, letzte Prüfung",
      kacheln(mwst).join(" ; ") ===
        [`${t.mwst.stat.registriert}=Nein [neutral]`, `${t.mwst.stat.satz}=16 % (${t.mwst.stat.satzHinweis}) [neutral]`, `${t.mwst.stat.umsatz}=50.000.000 ₸ (Schwelle: 43.250.000 ₸) [danger]`, `${t.mwst.stat.letztePruefung}=${DATUM("01.09.2026", "10:00")} [neutral]`].join(" ; "),
      kacheln(mwst).join(" ; "),
    );
    pruefe("MwSt: Umsatz als hochzählende Zahl", mwst.includes('<p class="mt-1 text-2xl font-black text-destructive"><span>50.000.000 ₸</span></p>'));
    pruefe("MwSt: Messer bei 100 % gedeckelt", mwst.includes(`<span>${t.mwst.messer.label}</span><span class="font-semibold text-foreground">100<!-- -->%</span>`) && mwst.includes('style="--anteil:100%"'));
    pruefe("MwSt: Hinweis auf die überschrittene Schwelle", mwst.includes(`<span>Die Registrierungsschwelle wurde am ${DATUM("01.09.2026", "10:00")} überschritten.`) && mwst.includes("border-danger/30 bg-danger/[0.06] text-xs leading-5"));
    pruefe("MwSt: Prüfen und Registrieren als Formulare", knoepfe(mwst).join(",") === `${t.mwst.formular.pruefen!.knopf},${t.mwst.formular.registrieren!.knopf}`, knoepfe(mwst).join(","));
    pruefe("MwSt: Quelle des Satzes", mwst.includes(`<p class="text-[11px] leading-4 text-muted-foreground">${t.mwst.quelle}<!-- --> <!-- -->Steuerkodex RK 2026</p>`));
    const monitoring = abschnitt(html, t.mwst.horizontalesMonitoring.titel!);
    pruefe(
      "Monitoring: Bereitschaft, drei Punkte, Vorteil mit Faktoren, Hinweis",
      textVon(monitoring).includes(
        [t.mwst.horizontalesMonitoring.readinessTitel, t.mwst.horizontalesMonitoring.readinessText, t.mwst.horizontalesMonitoring.punktProtokoll, t.mwst.horizontalesMonitoring.punktUnveraenderlich, t.mwst.horizontalesMonitoring.punktKuehlkette].join(" | "),
      ) && monitoring.includes("0,65× statt 1,25×") && monitoring.includes(imMarkup(t.mwst.horizontalesMonitoring.hinweis!)) && monitoring.includes("lucide-shield-check"),
    );
    const audit = abschnitt(html, t.audit.titel!);
    pruefe("Prüfprotokoll: Sprungziel und Spaltenköpfe", audit.startsWith('<section id="pruefprotokoll"') && tabellenKoepfe(audit).join("") === `${t.col.zeitpunkt} | ${t.col.urheber} | ${t.col.aktion} | ${t.col.ressource}`);
    pruefe(
      "Prüfprotokoll: Einträge, ohne Urheber ein Strich",
      zeilenText(audit).join(" / ") === `Zeitpunkt=${DATUM("28.08.2026", "09:40")} ; Urheber=S. Nurlan (buchhaltung) ; Aktion=lohn.freigegeben ; Ressource=lohn / Zeitpunkt=${DATUM("28.08.2026", "07:00")} ; Urheber=- ; Aktion=system.lauf ; Ressource=kpi`,
      zeilenText(audit).join(" / "),
    );
    const einw = abschnitt(html, t.einwilligungen.titel!);
    pruefe("Einwilligungen: Spaltenköpfe", tabellenKoepfe(einw).join("") === [t.col.betroffener, t.col.zweck, t.col.kanal, t.col.erteiltAm, t.col.status].join(" | "));
    pruefe(
      "Einwilligungen: aktiv mit Widerruf-Formular, widerrufen mit Grund",
      zeilenText(einw).join(" / ") === `Betroffener=Person e1 ; Zweck=Personaleinsatz und Lohnabrechnung ; Kanal=Papier ; Erteilt am=${DATUM("20.08.2026", "10:00")} ; Status=Widerrufen / Betroffener=Person e2 ; Zweck=Personaleinsatz und Lohnabrechnung ; Kanal=Web ; Erteilt am=${DATUM("20.08.2026", "10:00")} ; Status=widerrufen | Vertrag beendet`,
      zeilenText(einw).join(" / "),
    );
    pruefe("Einwilligungen: Widerruf trägt die Id, Widerrufen-Pille neutral", versteckt(einw).join(",") === "pfad=,id=e1" && pillen(einw).join(",") === `neutral:${t.status.widerrufen}`, versteckt(einw).join(","));
    const nachEinw = html.slice(html.indexOf(`>${t.formular.einwilligung!.titel}</p>`), html.indexOf('<section id="datenschutzvorfaelle"'));
    pruefe(
      "Einwilligung erfassen: Betroffene aus den Optionen, Zwecke aus dem Cockpit",
      [optionen(nachEinw, "betroffener_pfluecker_id"), optionen(nachEinw, "betroffener_profil_id"), optionen(nachEinw, "betroffener_b2b_kunde_id"), optionen(nachEinw, "zweck_id")].map((o) => o?.join(",")).join(" / ") ===
        ":-,pf1:Aliya / :-,pr1:N. Amanschajewa,pr2:S. Nurlan / :-,b1:Handelskette A / z1:Personaleinsatz,z2:ESUTD-Meldung",
      [optionen(nachEinw, "betroffener_pfluecker_id"), optionen(nachEinw, "zweck_id")].map((o) => o?.join(",")).join(" / "),
    );
    const vorf = abschnitt(html, t.vorfaelle.titel!);
    pruefe("Vorfälle: Sprungziel und Spaltenköpfe", vorf.startsWith('<section id="datenschutzvorfaelle"') && tabellenKoepfe(vorf).join("") === [t.col.festgestelltAm, t.col.art, t.col.beschreibung, t.col.meldefristAm, t.col.verantwortlich, t.col.status].join(" | "));
    pruefe(
      "Vorfälle: Verantwortliche zuweisen, wo keiner steht; melden, solange nicht gemeldet; ohne Frist ein Strich",
      zeilenText(vorf).join(" / ") ===
        [
          `Festgestellt am=${DATUM("25.08.2026", "10:00")} ; Art=Unbefugter Zugriff ; Beschreibung=Vorfall v1 ; Meldefrist=${DATUM("26.08.2026", "10:00")} ; Verantwortlich=Verantwortliche Person wählen | N. Amanschajewa | S. Nurlan | Zuweisen ; Status=Melden`,
          `Festgestellt am=${DATUM("25.08.2026", "10:00")} ; Art=Verlust ; Beschreibung=Vorfall v2 ; Meldefrist=${DATUM("26.08.2026", "10:00")} ; Verantwortlich=N. Amanschajewa ; Status=gemeldet`,
          `Festgestellt am=${DATUM("25.08.2026", "10:00")} ; Art=Offenlegung ; Beschreibung=Vorfall v3 ; Meldefrist=${DATUM("31.12.2099", "09:00")} ; Verantwortlich=N. Amanschajewa ; Status=Melden`,
          `Festgestellt am=${DATUM("25.08.2026", "10:00")} ; Art=Sonstiges ; Beschreibung=Vorfall v4 ; Meldefrist=- ; Verantwortlich=Verantwortliche Person wählen | N. Amanschajewa | S. Nurlan | Zuweisen ; Status=Melden`,
        ].join(" / "),
      zeilenText(vorf).join(" / "),
    );
    pruefe("Vorfälle: Formulare tragen die Id des Vorfalls", versteckt(vorf).filter((v) => v.startsWith("id=")).join(",") === "id=v1,id=v1,id=v3,id=v4,id=v4", versteckt(vorf).join(","));
    const nachVorf = html.slice(html.indexOf(`>${t.formular.vorfall!.titel}</p>`), html.indexOf('<section id="drittweitergaben"'));
    pruefe("Vorfall erfassen: Verantwortliche aus den Profilen", optionen(nachVorf, "verantwortlich_profil_id")?.join(",") === "pr1:N. Amanschajewa,pr2:S. Nurlan", optionen(nachVorf, "verantwortlich_profil_id")?.join(","));
    const weit = abschnitt(html, t.drittweitergaben.titel!);
    pruefe("Weitergaben: Sprungziel und Spaltenköpfe", weit.startsWith('<section id="drittweitergaben"') && tabellenKoepfe(weit).join("") === [t.col.betroffener, t.col.empfaenger, t.col.weitergegebenAm, t.col.benachrichtigungsfristAm, t.col.status].join(" | "));
    pruefe(
      "Weitergaben: benachrichtigt als Pille, sonst Formular; ohne Frist ein Strich",
      zeilenText(weit).map((z) => z.split(" ; ").slice(3).join(" ; ")).join(" / ") ===
        [`Frist Benachrichtigung=${DATUM("19.08.2026", "10:00")} ; Status=${t.formular.drittweitergabe!.knopf}`, `Frist Benachrichtigung=${DATUM("19.08.2026", "10:00")} ; Status=${t.status.benachrichtigt}`, `Frist Benachrichtigung=${DATUM("31.12.2099", "09:00")} ; Status=${t.formular.drittweitergabe!.knopf}`, `Frist Benachrichtigung=- ; Status=${t.formular.drittweitergabe!.knopf}`].join(" / "),
      zeilenText(weit).join(" / "),
    );
    pruefe("Weitergaben: erste Spalten und Id im Formular", zeilenText(weit)[0]!.startsWith(`Betroffener=Person d1 ; Empfänger=Empfänger d1 ; Weitergegeben am=${DATUM("05.08.2026", "10:00")}`) && versteckt(weit).filter((v) => v.startsWith("id=")).join(",") === "id=d1,id=d3,id=d4");
    const zwecke = abschnitt(html, t.zwecke.titel!);
    pruefe("Zwecke: Spaltenköpfe", tabellenKoepfe(zwecke).join("") === [t.col.bezeichnung, t.col.rechtsgrundlage, t.col.aufbewahrung, t.col.automatisiert, t.col.verantwortlich].join(" | "));
    pruefe(
      "Zwecke: Rechtsgrundlage, Monate im Plural, automatisiert gelb, Verantwortliche zuweisen",
      zeilenText(zwecke).join(" / ") ===
        "Zweck=Personaleinsatz ; Rechtsgrundlage=Vertrag ; Aufbewahrung=36 Monate ; Automatisierte Entscheidung=ja ; Verantwortlich=N. Amanschajewa / Zweck=ESUTD-Meldung ; Rechtsgrundlage=Gesetzliche Pflicht ; Aufbewahrung=1 Monat ; Automatisierte Entscheidung=nein ; Verantwortlich=Verantwortliche Person wählen | N. Amanschajewa | S. Nurlan | Zuweisen",
      zeilenText(zwecke).join(" / "),
    );
    pruefe("Zwecke: Töne der Automatik und Id im Formular", pillen(zwecke).join(",") === "warning:ja,neutral:nein" && versteckt(zwecke).join(",") === "pfad=,id=z2", `${pillen(zwecke).join(",")} / ${versteckt(zwecke).join(",")}`);
    pruefe("Hinweis als letzte Karte", html.includes(`<div class="rounded-2xl border border-border p-5 bg-muted/30 text-xs leading-5 text-muted-foreground">${imMarkup(t.note!)}</div></div>`));
  }

  // ---- 2. MwSt je Stand -----------------------------------------------------------------------------------------------------------
  const mwstVon = async (status: MwstStatus | null, teil: Partial<Lage> = {}) => {
    setze({ mwst: { quelle: "db", status }, ...teil });
    const { html, fehler } = await ansicht();
    return { html, fehler, mwst: abschnitt(html, MWST_TITEL), radar: radar(html) };
  };
  {
    const { mwst, radar: r, fehler } = await mwstVon(mwstStatus({ registriert: true, registriertAm: "2026-09-03T08:00:00Z", letzterUmsatzTenge: 5337000, letztePruefungAm: null }));
    pruefe("MwSt registriert: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
    pruefe(
      "MwSt registriert: Ja grün mit Datum, Umsatz unter der Schwelle neutral, nie geprüft",
      kacheln(mwst).join(" ; ") ===
        [`${t.mwst.stat.registriert}=Ja (${t.mwst.stat.seit} ${DATUM("03.09.2026", "10:00")}) [success]`, `${t.mwst.stat.satz}=16 % (${t.mwst.stat.satzHinweis}) [neutral]`, `${t.mwst.stat.umsatz}=5.337.000 ₸ (Schwelle: 43.250.000 ₸) [neutral]`, `${t.mwst.stat.letztePruefung}=${t.mwst.nochNie} [neutral]`].join(" ; "),
      kacheln(mwst).join(" ; "),
    );
    pruefe("MwSt registriert: Messer mit einer Nachkommastelle", mwst.includes('<span class="font-semibold text-foreground">12,3<!-- -->%</span>') && mwst.includes('aria-valuenow="12"'), mwst.match(/--anteil:[^"]*/)?.[0]);
    pruefe("MwSt registriert: kein Schwellenhinweis, nur Prüfen", !mwst.includes("border-danger/30 bg-danger/[0.06]") && knoepfe(mwst).join(",") === t.mwst.formular.pruefen!.knopf, knoepfe(mwst).join(","));
    pruefe("MwSt registriert: keine MwSt-Frist im Radar", r !== null && !r.eintraege.some((e) => e.includes("#mwst-registrierung")) && r.zaehler === "3 offene Frist(en)", r?.eintraege.join(" ; "));
  }
  {
    const { mwst } = await mwstVon(mwstStatus({ letzterUmsatzTenge: null, schwelleUeberschrittenAm: null, meldefristAm: null }));
    pruefe("MwSt ohne Umsatz: Strich, neutral, kein Messer, kein Hinweis, nur Prüfen", kacheln(mwst)[2] === `${t.mwst.stat.umsatz}=– (Schwelle: 43.250.000 ₸) [neutral]` && !mwst.includes("mwst-messer") && !mwst.includes("border-danger/30") && knoepfe(mwst).join(",") === t.mwst.formular.pruefen!.knopf, kacheln(mwst)[2]);
  }
  {
    const { mwst } = await mwstVon(mwstStatus({ letzterUmsatzTenge: SCHWELLE, schwelleUeberschrittenAm: null, meldefristAm: null }));
    pruefe("MwSt genau auf der Schwelle: rot, Messer 100 %, ohne Überschreitungsdatum kein Hinweis und kein Registrieren", kacheln(mwst)[2]?.endsWith("[danger]") === true && mwst.includes(">100<!-- -->%</span>") && !mwst.includes("border-danger/30") && knoepfe(mwst).length === 1, kacheln(mwst)[2]);
  }
  {
    const { mwst, radar: r } = await mwstVon(null);
    pruefe("MwSt ohne Satz: Leerzustand statt Kacheln, keine Formulare, keine Quelle", leerzustaende(mwst).join(",") === t.mwst.keinSatz && kacheln(mwst).length === 0 && knoepfe(mwst).length === 0 && !mwst.includes(`${t.mwst.quelle}<!-- -->`), leerzustaende(mwst).join(","));
    pruefe("MwSt ohne Satz: keine MwSt-Frist im Radar", r !== null && !r.eintraege.some((e) => e.includes("#mwst-registrierung")));
  }
  {
    setze({ mwst: { quelle: "demo", status: mwstStatus() } });
    const { html } = await ansicht();
    const mwst = abschnitt(html, MWST_TITEL);
    pruefe("MwSt-Quelle Demo bei Live-Cockpit: Abzeichen Demo, Formulare bleiben", pillen(mwst)[0] === `warning:${quelleText.demo}` && knoepfe(mwst).length === 2, `${pillen(mwst)[0]} / ${knoepfe(mwst).join(",")}`);
  }

  // ---- 3. Radar, Protokoll und Tabellen leer --------------------------------------------------------------------------------------
  {
    setze({
      cockpit: { ...COCKPIT, zwecke: [], einwilligungen: [], vorfaelle: [], drittweitergaben: [], auditEreignisse: [] },
      mwst: { quelle: "db", status: mwstStatus({ registriert: true }) },
      esutd: [],
    });
    const { html, fehler } = await ansicht();
    pruefe("Leer: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
    const r = radar(html);
    pruefe("Leer: Radar ohne Zähler, mit Entwarnung", r !== null && r.zaehler === "-" && r.eintraege.length === 0 && html.includes(imMarkup(t.risikoRadar.alleErledigt!)));
    pruefe("Leer: Prüfprotokoll mit Leerzustand statt Tabelle", leerzustaende(abschnitt(html, t.audit.titel!)).join(",") === t.audit.leer && !abschnitt(html, t.audit.titel!).includes("<table"));
    pruefe(
      "Leer: die vier übrigen Tabellen stehen ohne Zeilen und ohne Leerzustand",
      [t.einwilligungen.titel, t.vorfaelle.titel, t.drittweitergaben.titel, t.zwecke.titel].every((titel) => {
        const a = abschnitt(html, titel!);
        return a.includes("<table") && tabellenZeilen(a).length === 0 && leerzustaende(a).length === 0;
      }),
    );
    const nachEinw = html.slice(html.indexOf(`>${t.formular.einwilligung!.titel}</p>`));
    pruefe("Leer: Formulare bleiben, Zweckauswahl leer", optionen(nachEinw, "zweck_id")?.length === 0 && knoepfe(html).includes(t.formular.einwilligung!.knopf!) && knoepfe(html).includes(t.formular.vorfall!.knopf!));
  }

  // ---- 4. Rechte je Rolle --------------------------------------------------------------------------------------------------------
  const rechteVon = async (p: SessionProfile | null, teil: Partial<Lage> = {}) => {
    setze({ profil: p, ...teil });
    const { html } = await ansicht();
    return { html, knoepfe: knoepfe(html).join(","), lader: protokoll.filter((z) => !z.startsWith("fertig ")).join(",") };
  };
  const ALLE_KNOEPFE = [
    t.mwst.formular.pruefen!.knopf,
    t.mwst.formular.registrieren!.knopf,
    t.formular.widerruf!.knopf,
    t.formular.einwilligung!.knopf,
    t.formular.verantwortlich!.knopf,
    t.formular.vorfallMelden!.knopf,
    t.formular.vorfallMelden!.knopf,
    t.formular.verantwortlich!.knopf,
    t.formular.vorfallMelden!.knopf,
    t.formular.vorfall!.knopf,
    t.formular.drittweitergabe!.knopf,
    t.formular.drittweitergabe!.knopf,
    t.formular.drittweitergabe!.knopf,
    t.formular.verantwortlich!.knopf,
  ].join(",");
  for (const rolle of ["admin", "ceo", "betriebsleitung", "buchhaltung"] as const) {
    const ergebnis = await rechteVon(profil(rolle));
    pruefe(`Rechte ${rolle}: alle Formulare in Zeilenfolge`, ergebnis.knoepfe === ALLE_KNOEPFE && ergebnis.lader === LADER.join(","), ergebnis.knoepfe);
  }
  const lesend = async (p: SessionProfile | null, name: string) => {
    const { html, knoepfe: k, lader } = await rechteVon(p);
    pruefe(`Rechte ${name}: keine Formulare, dieselben Lader`, k === "" && lader === LADER.join(","), `${k} / ${lader}`);
    pruefe(`Rechte ${name}: Radar bleibt bei Live-Daten`, radar(html)?.eintraege.length === 4);
    return html;
  };
  for (const rolle of ["brigade", "picker", "erzeuger", "kunde"] as const) await lesend(profil(rolle), rolle);
  {
    const html = await lesend(null, "ohne Anmeldung");
    pruefe(
      "Nur lesen: Einwilligung aktiv grün, widerrufen neutral",
      pillen(abschnitt(html, t.einwilligungen.titel!)).join(",") === `success:${t.status.aktiv},neutral:${t.status.widerrufen}`,
      pillen(abschnitt(html, t.einwilligungen.titel!)).join(","),
    );
    const vorf = abschnitt(html, t.vorfaelle.titel!);
    pruefe(
      "Nur lesen: Vorfälle überfällig rot, gemeldet grün, sonst offen gelb; ohne Verantwortlichen ein Strich",
      pillen(vorf).join(",") === `danger:${t.status.ueberfaellig},success:${t.status.gemeldet},warning:${t.status.offen},warning:${t.status.offen}` && zeilenText(vorf).filter((z) => z.includes("Verantwortlich=- ;")).length === 2,
      `${pillen(vorf).join(",")} / ${zeilenText(vorf).join(" / ")}`,
    );
    pruefe(
      "Nur lesen: Weitergaben überfällig rot, benachrichtigt grün, sonst offen gelb",
      pillen(abschnitt(html, t.drittweitergaben.titel!)).join(",") === `danger:${t.status.ueberfaellig},success:${t.status.benachrichtigt},warning:${t.status.offen},warning:${t.status.offen}`,
      pillen(abschnitt(html, t.drittweitergaben.titel!)).join(","),
    );
    pruefe("Nur lesen: Zweck ohne Verantwortlichen ein Strich", zeilenText(abschnitt(html, t.zwecke.titel!))[1]?.endsWith("Verantwortlich=-") === true);
    pruefe(
      "Nur lesen: Gliederung ohne Formularkarten",
      gliederung(html) === ["Radar", `§${t.cockpitTitle}`, `§${MWST_TITEL}`, `§${t.mwst.horizontalesMonitoring.titel}`, `§${t.audit.titel}`, `§${t.einwilligungen.titel}`, `§${t.vorfaelle.titel}`, `§${t.drittweitergaben.titel}`, `§${t.zwecke.titel}`].join(" | "),
      gliederung(html),
    );
  }

  // ---- 5. Demo und Lesefehler des Cockpits: kein Radar, keine Formulare, auch nicht für die MwSt -----------------------------------
  for (const quelle of ["demo", "fehler"] as const) {
    const { html, knoepfe: k } = await rechteVon(profil("buchhaltung"), { cockpit: { ...COCKPIT, quelle } });
    pruefe(
      `Cockpit ${quelle}: Abzeichen, kein Radar, keine Formulare trotz Live-MwSt`,
      radar(html) === null && k === "" && pillen(abschnitt(html, t.cockpitTitle!))[0] === `${quelle === "demo" ? "warning" : "danger"}:${quelleText[quelle]}` && pillen(abschnitt(html, MWST_TITEL))[0] === `success:${quelleText.db}`,
      `${k} / ${pillen(abschnitt(html, t.cockpitTitle!))[0]}`,
    );
  }

  ende();
}

main().catch((e) => {
  console.error("FAIL  Ausnahme", e);
  process.exit(1);
});
