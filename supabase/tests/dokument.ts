// Dokumente im Damicon-Layout: der Rahmen (Deckblatt, Kopf- und Fusszeile, Abschnitte, Siegel), die Vorlagen fuer
// Meldelisten, Belege, Checklisten, Lieferungen, Nachweise und den Lieferplan, die Pruefsumme und die Rechte je Art.
// Kein Netzwerk, keine Datenbank: die Vorlagen sind reine Funktionen, der Test fuettert sie mit Beispieldaten und
// echten Texten aus den Sprachdateien (de, en, kk, ru). Die Route selbst prueft e2e/rollen-zugriff.spec.ts.
//
// Aufruf: npm run test:dokument

import { createTranslator } from "next-intl";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import kk from "@/messages/kk.json";
import ru from "@/messages/ru.json";
import { dokumentAlsHtml, esc, tabelle } from "@/lib/dokument/damicon-dokument";
import { dateinameFuer, kennungFuer, pruefsumme, rahmenTexte, type DokumentKontext, type Uebersetzer } from "@/lib/dokument/kontext";
import { lieferplanEintraege, lieferplanTermine } from "@/lib/domain/lieferplan";
import { baueEsutdDokument } from "@/lib/dokument/esutd";
import { baueEsfBelegDokument, baueEsfRegisterDokument } from "@/lib/dokument/esf";
import { baueFoerderDokument } from "@/lib/dokument/foerderung";
import { baueLieferungDokument } from "@/lib/dokument/lieferung";
import { baueNachweiseDokument, type NachweisZeile } from "@/lib/dokument/nachweise";
import { baueLieferplanDokument, lieferplanZeilen } from "@/lib/dokument/lieferplan";
import { baueWirtschaftlichkeitDokument } from "@/lib/dokument/wirtschaftlichkeit";
import { baueAbholauftragDokument } from "@/lib/dokument/abholauftrag";
import { DOKUMENT_ARTEN } from "@/lib/dokument/arten";
import { roles, type Role } from "@/lib/rbac";
import type { EsutdMeldung } from "@/lib/domain/esutd";
import type { EsfBelegZeile, EsfUebersicht } from "@/lib/data/esf";
import type { LieferungZeile } from "@/lib/domain/lieferungen";
import { modellAnnahmen, modellPosten, type IstEintrag } from "@/lib/domain/wirtschaftlichkeit-erfassung";
import type { AbholRundeZeile, AbholStoppZeile } from "@/lib/domain/abholrunden";

let fehler = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const KATALOGE = { de, en, kk, ru } as const;
type Sprache = keyof typeof KATALOGE;
const SPRACHEN: Sprache[] = ["de", "en", "kk", "ru"];
const JETZT = new Date("2026-10-14T09:00:00Z");
const HEUTE = "2026-10-14";

/** Ein Kontext mit echten Texten; fehlende Schluessel landen in `fehlt`. */
function kontext(sprache: Sprache, fehlt: string[] = []): DokumentKontext {
  return {
    sprache,
    jetzt: JETZT,
    ersteller: { name: "Test Person", rolle: "Administration" },
    t: (namensraum) =>
      createTranslator({
        locale: sprache,
        messages: KATALOGE[sprache],
        namespace: namensraum as never,
        onError: (e) => fehlt.push(`${sprache}:${namensraum}: ${e.message}`),
        getMessageFallback: ({ namespace, key }) => `!!${namespace}.${key}!!`,
      }) as unknown as Uebersetzer,
  };
}

// --- Beispieldaten ---------------------------------------------------------------------------------------------------------------
const meldung = (id: string, extra: Partial<EsutdMeldung> = {}): EsutdMeldung => ({
  quelle: "vertrag", id, pfluecker: `Person ${id}`, ausweis: "MAL-1", art: "abschluss", ereignisAm: "2026-10-01", beschreibung: null, vertragsnummer: "SV-1",
  status: "offen", erfasstAm: null, bestaetigung: null, belegDokumentId: null, meldefristAm: "2026-10-08", ...extra,
});
const MELDUNGEN: EsutdMeldung[] = [
  meldung("a"),
  meldung("b", { art: "aenderung", quelle: "ereignis", meldefristAm: null, beschreibung: "Lohn erhöht <b>fett</b>" }),
  meldung("c", { status: "erfasst", erfasstAm: "2026-10-05", bestaetigung: "B-77", belegDokumentId: "dok-1", meldefristAm: null }),
];

const ENTWURF = {
  version: 1 as const, stichtag: "2026-10-11",
  kunde: { name: "Almaty Fresh Market", identifikationsnummer: null, rechtsform: null },
  ware: { sorte: "Polka", chargeCode: "CH-1", mengeKg: 80, preisTengeKg: 2100, betragTenge: 168000 },
  mwst: { registriert: true, prozent: 16, betragTenge: 26880, gesamtTenge: 194880, annahme: "netto" as const },
  luecken: ["identifikationsnummer" as const],
};
const BELEG = (status: EsfBelegZeile["status"] = "entwurf"): EsfBelegZeile => ({
  id: "beleg-1", lieferungId: "l-1", kunde: "Almaty Fresh Market", geliefertAm: "2026-10-11T12:00:00Z", mengeKg: 80, status,
  esfNummer: status === "entwurf" ? null : "ЭСФ-1", ausgestelltAm: status === "entwurf" ? null : "2026-10-12", bestaetigtAm: null, bemerkung: null, entwurf: ENTWURF,
});
const ESF: EsfUebersicht = {
  offen: [{ lieferungId: "l-2", kunde: "Gastro", geliefertAm: "2026-10-13T08:00:00Z", mengeKg: 120, tageSeitLieferung: 1, belegId: null, belegStatus: null }],
  belege: [BELEG("ausgestellt")],
};

const LIEFERUNG: LieferungZeile = {
  id: "l-1", kunde: "Almaty Fresh Market", kundeId: "k-1", chargeCode: "CH-1", bestellteMengeKg: 80, mengeKg: 80, status: "zugestellt", geliefertAm: "2026-10-11T12:00:00Z",
  empfaengerName: "A. Seitkali", belegStoragePath: null, letzteKuehlmessung: { temperaturC: 3.2, minutenSeitPfluecken: 25, ergebnis: "ok" },
  transportMessungen: [
    { id: "m1", temperaturC: 3.5, ergebnis: "ok", gemessenAm: "2026-10-11T09:00:00Z", quelle: "logger", loggerKennung: "TL-4711" },
    { id: "m2", temperaturC: 4.6, ergebnis: "warnung", gemessenAm: "2026-10-11T10:00:00Z", quelle: "manuell", loggerKennung: null },
  ],
};

const NACHWEISE: NachweisZeile[] = [
  { id: "n1", name: "GlobalG.A.P.", kategorie: "zertifikat", bezug: "Betrieb", gueltigVon: "2026-01-01", gueltigBis: "2026-10-01", unbefristet: false, nachweisStatus: "abgelaufen", tageBisAblauf: -13, verantwortlich: "Leitung", rechtsgrundlage: "Auflage <Handel>", partner: null },
  { id: "n2", name: "Vertrag", kategorie: "liefervertrag", bezug: "", gueltigVon: null, gueltigBis: null, unbefristet: false, nachweisStatus: "offen", tageBisAblauf: null, verantwortlich: null, rechtsgrundlage: null, partner: null },
  { id: "n3", name: "Sachkunde", kategorie: "zertifikat", bezug: "", gueltigVon: "2026-01-01", gueltigBis: null, unbefristet: true, nachweisStatus: "gueltig", tageBisAblauf: null, verantwortlich: "Leitung", rechtsgrundlage: null, partner: null },
];

const PLAN = {
  lieferungen: [{ id: "p1", vorbestellungId: "v1", status: "geplant", mengeKg: 40, tourDatum: "2026-10-15", kunde: "Gastro" }],
  vorbestellungen: [
    { id: "v1", status: "bestaetigt", mengeKg: 40, liefertermin: "2026-10-14", sorte: "Polka", kunde: "Gastro" },
    { id: "v2", status: "angefragt", mengeKg: 25, liefertermin: "2026-10-20", sorte: null, kunde: "Markt" },
    { id: "v3", status: "angefragt", mengeKg: 99, liefertermin: "2026-10-01", sorte: "Polka", kunde: "Alt" },
  ],
};

const WIRT_POSTEN = modellPosten(
  { investition: { bezeichnung: "Einführung <Damicon>", kategorie: "Einführung" }, betrieb: { bezeichnung: "Hosting", kategorie: "Betrieb" }, nutzen: { bezeichnung: "Vermiedene Kosten", kategorie: "egal" } },
  "2026-09-23",
);
const WIRT_IST: IstEintrag[] = [{ id: "i1", monat: "2026-11-01", kategorie: "schwund", betrag: 12000, waehrung: "EUR", notiz: null }];
const WIRT_ANNAHMEN = { ...modellAnnahmen(), echtbetriebBeginn: "2026-11-01" };
const WIRT = { posten: WIRT_POSTEN, ist: WIRT_IST, annahmen: WIRT_ANNAHMEN, menge: null, quelle: "erfasst" as const, heute: HEUTE };

const ABHOL_STOPP = (id: string, extra: Partial<AbholStoppZeile>): AbholStoppZeile => ({
  id, nachbarbetriebId: `n-${id}`, nachbarbetrieb: `Nachbar <${id}>`, ort: "Talgar", adresse: "Abay 5, Talgar", kontakt: "+7 700 000 00 00", breitengrad: null, laengengrad: null,
  reihenfolge: 0, mengeGeplantKg: 120, sorte: null, status: "geplant", mengeIstKg: null, pflueckbeginn: null, abgeholtAm: null, bemerkung: null,
  minutenBisKuehlung: null, ergebnis: null, ...extra,
});
const ABHOL_RUNDE = (status: AbholRundeZeile["status"], stopps: AbholStoppZeile[]): AbholRundeZeile => ({
  id: "r1", datum: "2026-10-14", status, fahrzeug: "Kuehlwagen 1", notiz: null, distanzKm: 38.4, dauerMinuten: 62, abErstemStoppMinuten: 40, geometrie: null,
  gestartetAm: status === "geplant" ? null : "2026-10-14T06:00:00Z", kuehlhausAn: status === "abgeschlossen" ? "2026-10-14T08:30:00Z" : null, stopps,
});
const ABHOL_OFFEN = ABHOL_RUNDE("geplant", [ABHOL_STOPP("a", {}), ABHOL_STOPP("b", { reihenfolge: 1, mengeGeplantKg: 80 })]);
const ABHOL_FERTIG = ABHOL_RUNDE("abgeschlossen", [
  ABHOL_STOPP("a", { status: "abgeholt", mengeIstKg: 110, pflueckbeginn: "2026-10-14T07:50:00Z", abgeholtAm: "2026-10-14T07:20:00Z", minutenBisKuehlung: 40, ergebnis: "ok", reihenfolge: 0 }),
  ABHOL_STOPP("b", { status: "abgeholt", mengeIstKg: 70, pflueckbeginn: "2026-10-14T07:00:00Z", abgeholtAm: "2026-10-14T07:50:00Z", minutenBisKuehlung: 90, ergebnis: "verstoss", reihenfolge: 1 }),
  ABHOL_STOPP("c", { status: "entfallen", reihenfolge: 2 }),
]);

// --- 1. Rahmen -------------------------------------------------------------------------------------------------------------------
{
  const x = kontext("de");
  const e = baueEsutdDokument({ meldungen: MELDUNGEN, nurOffene: false, heute: HEUTE, belegNamen: new Map([["dok-1", "Sammelnachweis"]]) }, x);
  const html = dokumentAlsHtml(e, rahmenTexte(x));
  check("Rahmen: Deckblatt mit Marke, Name, Vertraulich-Stempel und Eckdaten", html.includes('class="deck"') && html.includes("<svg") && html.includes("DAMICON") && html.includes("Vertraulich") && html.includes("Dokumentnummer"));
  check("Rahmen: laufende Kopf- und Fusszeile mit Logo, Nummer und Seite x von y", html.includes("@top-left") && html.includes("data:image/svg+xml;base64,") && html.includes("@bottom-right") && html.includes("counter(page)") && html.includes("counter(pages)") && html.includes("@page :first"));
  const abschnitte = (html.match(/<h2>/g) ?? []).length;
  const verzeichnis = (html.split('class="deck__inhaltsliste"')[1]?.split("</ol>")[0]?.match(/<li>/g) ?? []).length;
  check("Rahmen: das Inhaltsverzeichnis nennt genau die Abschnitte des Dokuments", abschnitte === verzeichnis && abschnitte >= 4, `${abschnitte} Abschnitte, ${verzeichnis} im Verzeichnis`);
  check("Rahmen: Siegel auf dem Deckblatt und am Ende, Druckknopf nur am Bildschirm", html.split(e.siegel).length >= 3 && html.includes("window.print()") && html.includes("@media print { .werkzeugleiste { display: none; } }"));
  check("Rahmen: Text von aussen wird maskiert (kein HTML aus Namen und Beschreibungen)", html.includes("Lohn erhöht &lt;b&gt;fett&lt;/b&gt;") && !html.includes("<b>fett</b>"));
  check("Rahmen: esc und tabelle maskieren Anfuehrungszeichen und Spitzklammern", esc('<a href="x">&</a>') === "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;" && tabelle(["<A>"], [["<b>"]]).includes("&lt;A&gt;") && tabelle(["A"], [["<b>"]]).includes("&lt;b&gt;"));
  check("Rahmen: Titel als Dateiname im <title>", html.includes(`<title>${esc(e.dateiname)}</title>`) && e.dateiname.endsWith("2026-10-14"));
}

// --- 2. Pruefsumme -------------------------------------------------------------------------------------------------------------------
{
  const x = kontext("de");
  const daten = { meldungen: MELDUNGEN, nurOffene: false, heute: HEUTE, belegNamen: new Map<string, string>() };
  const a = baueEsutdDokument(daten, x);
  const spaeter = baueEsutdDokument(daten, { ...x, jetzt: new Date("2026-10-14T18:00:00Z"), ersteller: { name: "Jemand anderes", rolle: "Betriebsleitung" } });
  check("Siegel: dieselben Daten ergeben dieselbe Pruefsumme, egal wann und von wem abgerufen", a.siegel === spaeter.siegel && /^[0-9a-f]{64}$/.test(a.siegel));
  const anders = baueEsutdDokument({ ...daten, meldungen: [...MELDUNGEN, meldung("d")] }, x);
  check("Siegel: andere Daten ergeben eine andere Pruefsumme", anders.siegel !== a.siegel);
  check("Siegel: die Reihenfolge der Schluessel spielt keine Rolle", pruefsumme({ a: 1, b: { c: 2, d: 3 } }) === pruefsumme({ b: { d: 3, c: 2 }, a: 1 }) && pruefsumme({ a: 1 }) !== pruefsumme({ a: 2 }));
}

// --- 3. Vorlagen in vier Sprachen ---------------------------------------------------------------------------------------------------
type Fall = { name: string; baue: (x: DokumentKontext) => ReturnType<typeof baueEsutdDokument>; inhalt: RegExp[] };
const FAELLE: Fall[] = [
  { name: "ЕСУТД-Meldeliste", baue: (x) => baueEsutdDokument({ meldungen: MELDUNGEN, nurOffene: false, heute: HEUTE, belegNamen: new Map([["dok-1", "Sammelnachweis"]]) }, x), inhalt: [/SV-1/, /MAL-1/, /B-77/, /Sammelnachweis/] },
  { name: "ЕСУТД-Meldeliste, nur offene", baue: (x) => baueEsutdDokument({ meldungen: MELDUNGEN, nurOffene: true, heute: HEUTE, belegNamen: new Map() }, x), inhalt: [/SV-1/] },
  { name: "ЭСФ-Register", baue: (x) => baueEsfRegisterDokument(ESF, x), inhalt: [/Gastro/, /Almaty Fresh Market/, /ЭСФ-1/] },
  { name: "ЭСФ-Beleg", baue: (x) => baueEsfBelegDokument(BELEG(), x), inhalt: [/168[\s.,  ]?000/, /Polka/, /class="kasten"/] },
  { name: "Foerder-Checkliste", baue: (x) => baueFoerderDokument({ dossier: { id: "d1", portal: "gosagro.kz", antragsnummer: "2026-114", titel: "Kühlhaus", status: "eingereicht", eingereichtAm: "2026-08-30", fristAm: "2026-12-01", notizen: null, dokumente: [] }, punkte: [{ id: "p1", dossierId: "d1", vorlageKey: "antragsformular", bezeichnung: null, pflicht: true, fristAm: "2026-10-10", erledigtAm: null, reihenfolge: 0 }, { id: "p2", dossierId: "d1", vorlageKey: null, bezeichnung: "Angebot einholen", pflicht: false, fristAm: null, erledigtAm: "2026-10-12", reihenfolge: 1 }], heute: HEUTE }, x), inhalt: [/2026-114/, /Angebot einholen/] },
  { name: "Lieferung", baue: (x) => baueLieferungDokument(LIEFERUNG, x), inhalt: [/TL-4711/, /CH-1/, /A\. Seitkali/] },
  { name: "Lieferung ohne Messungen", baue: (x) => baueLieferungDokument({ ...LIEFERUNG, status: "geplant", letzteKuehlmessung: null, transportMessungen: [], geliefertAm: null }, x), inhalt: [/Almaty Fresh Market/] },
  { name: "Nachweisregister", baue: (x) => baueNachweiseDokument(NACHWEISE, HEUTE, x), inhalt: [/GlobalG\.A\.P\./, /Auflage &lt;Handel&gt;/] },
  { name: "Wirtschaftlichkeit, erfasst", baue: (x) => baueWirtschaftlichkeitDokument(WIRT, x), inhalt: [/Hosting/, /Einführung &lt;Damicon&gt;/, /513/] },
  { name: "Wirtschaftlichkeit, ohne Posten", baue: (x) => baueWirtschaftlichkeitDokument({ ...WIRT, posten: [], ist: [] }, x), inhalt: [/<table/] },
  { name: "Wirtschaftlichkeit, Modellrechnung", baue: (x) => baueWirtschaftlichkeitDokument({ ...WIRT, quelle: "modell", ist: [] }, x), inhalt: [/Hosting/] },
  { name: "Wirtschaftlichkeit, Stand", baue: (x) => baueWirtschaftlichkeitDokument({ ...WIRT, quelle: "stand", stand: { name: "Stand <Januar>", standAm: "2027-01-15T08:00:00Z" }, standId: "s1" }, x), inhalt: [/Stand &lt;Januar&gt;/] },
  { name: "Abholauftrag, geplant", baue: (x) => baueAbholauftragDokument(ABHOL_OFFEN, x), inhalt: [/Nachbar &lt;a&gt;/, /Talgar/] },
  { name: "Abholauftrag, abgeschlossen", baue: (x) => baueAbholauftragDokument(ABHOL_FERTIG, x), inhalt: [/Nachbar &lt;b&gt;/, /class="kasten"/] },
  { name: "Lieferplan, Buero", baue: (x) => baueLieferplanDokument(PLAN, HEUTE, true, x), inhalt: [/Gastro/, /Markt/] },
  { name: "Lieferplan, Kunde", baue: (x) => baueLieferplanDokument(PLAN, HEUTE, false, x), inhalt: [/kg/] },
];
for (const fall of FAELLE) {
  for (const sprache of SPRACHEN) {
    const fehlt: string[] = [];
    const x = kontext(sprache, fehlt);
    const e = fall.baue(x);
    const html = dokumentAlsHtml(e, rahmenTexte(x));
    const ok = fehlt.length === 0 && !html.includes("!!") && fall.inhalt.every((r) => r.test(html)) && e.abschnitte.length >= 1 && e.titel.length > 0;
    check(`${fall.name} (${sprache}): vollstaendig, ohne fehlenden Text`, ok, ok ? "" : `${fehlt.slice(0, 3).join(" | ")} ${fall.inhalt.filter((r) => !r.test(html)).map(String).join(",")}`);
  }
}

// --- 4. Inhalt der Vorlagen -------------------------------------------------------------------------------------------------------
{
  const x = kontext("de");
  const esutd = baueEsutdDokument({ meldungen: MELDUNGEN, nurOffene: false, heute: HEUTE, belegNamen: new Map() }, x);
  check("ЕСУТД: Kennzahlen offen 2, Frist ueberschritten 1, gemeldet 1", esutd.kennzahlen?.map((k) => k.wert).join(",") === "2,1,1", esutd.kennzahlen?.map((k) => k.wert).join(","));
  const offen = baueEsutdDokument({ meldungen: MELDUNGEN, nurOffene: true, heute: HEUTE, belegNamen: new Map() }, x);
  check("ЕСУТД: nur offene zeigt zwei Zeilen, alle drei", (offen.abschnitte[0].html.match(/<tr>/g) ?? []).length === 3 && (esutd.abschnitte[0].html.match(/<tr>/g) ?? []).length === 4);
  const leer = baueEsutdDokument({ meldungen: [], nurOffene: true, heute: HEUTE, belegNamen: new Map() }, x);
  check("ЕСУТД: ohne Meldung steht ein Hinweis statt einer leeren Tabelle", !leer.abschnitte[0].html.includes("<table") && leer.abschnitte[0].html.includes("keine Meldung"));
  check("ЕСУТД: Freigabe durch Betriebsleitung und Geschaeftsfuehrung", esutd.freigabe?.length === 2);

  const lieferung = baueLieferungDokument(LIEFERUNG, x);
  check("Lieferung: Gesamturteil ist die ungünstigste Messung (Warnung bei 4,6 Grad)", lieferung.kennzahlen?.[1].wert.includes("4,6") === true && lieferung.zusammenfassung?.includes("Warnung") === true);
  check("Lieferung: Herkunft Logger und Handmessung je Zeile", lieferung.abschnitte[2].html.includes("Logger") && lieferung.abschnitte[2].html.includes("Handmessung") && lieferung.kennzahlen?.[3].wert === "1");
  const geplant = baueLieferungDokument({ ...LIEFERUNG, status: "geplant", transportMessungen: [], letzteKuehlmessung: null }, x);
  check("Lieferung: ohne Messung kein Urteil, noch nicht uebergeben", geplant.zusammenfassung?.includes("noch keine Temperaturmessung") === true && geplant.abschnitte[1].html.includes("noch nicht übergeben"));

  const beleg = baueEsfBelegDokument(BELEG(), x);
  check("ЭСФ-Beleg: Angaben, Luecke und MwSt-Annahme", beleg.abschnitte[0].html.includes("Almaty Fresh Market") && beleg.abschnitte[0].html.includes("Identifikationsnummer des Kunden fehlt") && (beleg.hinweise ?? []).some((h) => h.includes("Nettopreise")));
  const register = baueEsfRegisterDokument(ESF, x);
  check("ЭСФ-Register: eine offene Lieferung, ein Beleg, Kennzahl ohne Beleg 1", register.kennzahlen?.[0].wert === "1" && register.abschnitte[0].html.includes("Gastro") && register.abschnitte[1].html.includes("ЭСФ-1"));

  const nachweise = baueNachweiseDokument(NACHWEISE, HEUTE, x);
  check("Nachweisregister: abgelaufen vor gueltig, Zaehlung in der Reihenfolge der Status", nachweise.abschnitte[0].html.indexOf("GlobalG.A.P.") < nachweise.abschnitte[0].html.indexOf("Sachkunde") && nachweise.kennzahlen?.map((k) => k.wert).join(",") === "1,0,1,1");

  const wirt = baueWirtschaftlichkeitDokument(WIRT, x);
  check("Wirtschaftlichkeit: Amortisation 11 Monate, Rendite 3 Jahre rund 160 Prozent, Kapitalwert vorhanden", wirt.kennzahlen?.[0].wert.includes("11") === true && /1[56]\d\s?%/.test(wirt.kennzahlen?.[1].wert ?? "") && (wirt.kennzahlen?.[2].wert ?? "").includes("₸"), wirt.kennzahlen?.map((k) => k.wert).join(" | "));
  check("Wirtschaftlichkeit: der geschaetzte Nutzen macht seine Kennzahlen als geschaetzt kenntlich", wirt.kennzahlen?.[0].ton === "warnung" && wirt.abschnitte[0].html.includes("geschätzt") && (wirt.abschnitte.at(-1)?.html ?? "").includes("class=\"kasten\""));
  const ohnePosten = baueWirtschaftlichkeitDokument({ ...WIRT, posten: [], ist: [] }, x);
  check("Wirtschaftlichkeit: ohne Posten sind die Kennzahlen offen und das Dokument sagt es", ohnePosten.kennzahlen?.every((k) => k.wert === "offen") === true && ohnePosten.abschnitte[1].html.includes("Keine Posten erfasst") && (ohnePosten.zusammenfassung ?? "").includes("keine Posten"));
  check("Wirtschaftlichkeit: Plan und Ist zeigt den Monat des Echtbetriebs", wirt.abschnitte[3].html.includes("November 2026"), wirt.abschnitte[3].html.slice(0, 200));
  const stand = baueWirtschaftlichkeitDokument({ ...WIRT, quelle: "stand", stand: { name: "Januar", standAm: "2027-01-15T08:00:00Z" }, standId: "s1" }, x);
  check("Wirtschaftlichkeit: ein Stand traegt seinen Namen und hat eine eigene Kennung", (stand.untertitel ?? "").includes("Januar") && stand.kennung !== wirt.kennung);
  const kurs2 = baueWirtschaftlichkeitDokument({ ...WIRT, annahmen: { ...WIRT_ANNAHMEN, kurse: { eurTenge: 480, rubTenge: 5 }, kursStichtag: "2027-01-15" } }, x);
  check("Wirtschaftlichkeit: ein anderer Kurs ergibt ein anderes Siegel", kurs2.siegel !== wirt.siegel && wirt.siegel === baueWirtschaftlichkeitDokument(WIRT, { ...x, jetzt: new Date("2026-10-14T18:00:00Z") }).siegel);

  const abholOffen = baueAbholauftragDokument(ABHOL_OFFEN, x);
  check("Abholauftrag: geplant mit zwei Stopps, 200 kg erwartet, zwei offen, Fahrzeit ab dem ersten Stopp als Hinweis", abholOffen.kennzahlen?.map((k) => k.wert).join(",").startsWith("2,200") === true && abholOffen.kennzahlen?.[2].wert === "2" && abholOffen.abschnitte[1].html.includes("40 Minuten") && abholOffen.titel === "Abholauftrag", abholOffen.kennzahlen?.map((k) => k.wert).join(","));
  const abholFertig = baueAbholauftragDokument(ABHOL_FERTIG, x);
  check("Abholauftrag: abgeschlossen zeigt Ergebnis je Abholung, den Verstoss als Kasten und den Nachweis im Titel", abholFertig.titel === "Nachweis der Abholrunde" && abholFertig.abschnitte.some((a) => a.html.includes("Verstoß")) && abholFertig.abschnitte.at(-1)?.html.includes('class="kasten"') === true && abholFertig.kennzahlen?.[2].ton === "schlecht");
  check("Abholauftrag: Fahrer und Betriebsleitung unterschreiben, jede Aenderung der Runde aendert das Siegel", abholFertig.freigabe?.length === 2 && abholFertig.siegel !== abholOffen.siegel && abholFertig.siegel === baueAbholauftragDokument(ABHOL_FERTIG, { ...x, jetzt: new Date("2026-10-14T18:00:00Z") }).siegel);

  const zeilen = lieferplanZeilen(PLAN, HEUTE);
  check("Lieferplan: Tour vor Wunsch, Doppelung und Vergangenes fehlen", zeilen.length === 2 && zeilen[0].art === "lieferung" && zeilen[0].datum === "2026-10-15" && zeilen[1].art === "vorbestellung" && zeilen[1].datum === "2026-10-20", JSON.stringify(zeilen.map((z) => [z.datum, z.art])));
  const kunde = baueLieferplanDokument(PLAN, HEUTE, false, x);
  check("Lieferplan: der Kunde sieht keine Kundenspalte", !kunde.abschnitte[0].html.includes("<th>Kunde</th>") && baueLieferplanDokument(PLAN, HEUTE, true, x).abschnitte[0].html.includes("<th>Kunde</th>"));
}

// --- Tag in Almaty statt UTC, eine Regel fuer den Lieferplan (Pruefung PR #156, 15.10.2026) --------------------------------------------------
{
  // 02:00 Almaty am 15.10.2026 ist 21:00 UTC am 14.10.2026: Kennung und Dateiname tragen den Tag des Deckblatts (15.10.).
  const nachts = new Date("2026-10-14T21:00:00Z");
  check("Kennung: der Tag ist der Tag in Almaty, nicht der in UTC", kennungFuer("ABHOL", nachts, "x").startsWith("ABHOL-20261015-"), kennungFuer("ABHOL", nachts, "x"));
  check("Dateiname: dasselbe, mit dem Tag in Almaty", dateinameFuer("Abholauftrag", nachts) === "Abholauftrag-2026-10-15", dateinameFuer("Abholauftrag", nachts));
  const mittags = new Date("2026-10-14T09:00:00Z");
  check("Kennung und Dateiname: mittags (UTC und Almaty am selben Tag) wie bisher", kennungFuer("PLAN", mittags, "x").startsWith("PLAN-20261014-") && dateinameFuer("Plan", mittags) === "Plan-2026-10-14");
  check("Kennung: Mitternacht Almaty (19:00 UTC am Vortag) gehoert schon zum neuen Tag", kennungFuer("PLAN", new Date("2026-10-14T19:00:00Z"), "x").startsWith("PLAN-20261015-"));

  const mitStorno = {
    ...PLAN,
    vorbestellungen: [...PLAN.vorbestellungen, { id: "v4", status: "storniert", mengeKg: 77, liefertermin: "2026-10-22", sorte: "Polka", kunde: "Storno" }, { id: "v5", status: "geliefert", mengeKg: 11, liefertermin: "2026-10-23", sorte: "Polka", kunde: "Fertig" }],
  };
  const eintraege = lieferplanEintraege(mitStorno, HEUTE);
  check("Lieferplan: stornierte und gelieferte Vorbestellungen stehen nicht im Plan (eine Regel, das Dokument hatte den Filter nicht)", !eintraege.some((e) => e.id === "v4" || e.id === "v5") && eintraege.length === 2, JSON.stringify(eintraege.map((e) => e.id)));
  const dokZeilen = lieferplanZeilen(mitStorno, HEUTE);
  const ics = lieferplanTermine(mitStorno, HEUTE, () => ({ titel: "t", beschreibung: "b" }));
  check("Lieferplan: Dokument und Kalenderdatei zeigen dieselben Termine", dokZeilen.length === ics.length && dokZeilen.length === eintraege.length);
  check("Lieferplan: die Kalenderdatei behaelt Kennung und Zustand (Lieferung fest, bestaetigt fest, angefragt vorlaeufig)",
    ics.some((t) => t.uid === "lieferung-p1@damicon" && t.zustand === "CONFIRMED") && ics.some((t) => t.uid === "vorbestellung-v2@damicon" && t.zustand === "TENTATIVE") && !ics.some((t) => t.uid === "vorbestellung-v1@damicon"));
}

// --- 5. Rechte je Art --------------------------------------------------------------------------------------------------------------
{
  const erwartet: Record<string, Role[]> = {
    esutd: ["admin", "ceo", "betriebsleitung"],
    esf: ["admin", "ceo", "betriebsleitung", "buchhaltung"],
    foerderung: ["admin", "ceo", "betriebsleitung", "buchhaltung"],
    // Seit dem 15.10.2026 ohne Erzeuger (b2b_portal:view entfallen) und bei den Nachweisen ohne Erzeuger und Kunde (dokumente:view entfallen): die
    // Zeilensicherheit liess sie die Quellen nie lesen, das Dokument waere leer gewesen.
    lieferung: ["admin", "ceo", "betriebsleitung", "buchhaltung", "brigade", "kunde"],
    nachweise: ["admin", "ceo", "betriebsleitung", "buchhaltung"],
    lieferplan: ["admin", "ceo", "betriebsleitung", "buchhaltung", "kunde"],
    wirtschaftlichkeit: ["admin", "ceo", "betriebsleitung", "buchhaltung"],
    abholauftrag: ["admin", "ceo", "betriebsleitung", "brigade"],
  };
  for (const [art, rollen] of Object.entries(erwartet)) {
    const ist = roles.filter((r) => DOKUMENT_ARTEN[art].erlaubt(r));
    check(`Rechte: ${art} nur fuer ${rollen.join(", ")}`, JSON.stringify([...ist].sort()) === JSON.stringify([...rollen].sort()), ist.join(", "));
  }
  check("Rechte: genau die Arten, die der Test kennt", Object.keys(DOKUMENT_ARTEN).sort().join(",") === Object.keys(erwartet).sort().join(","));
}

if (fehler > 0) {
  console.log(`\n${fehler} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("\nAlle Dokument-Tests gruen.");
