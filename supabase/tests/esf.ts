// Belegregister der elektronischen Rechnung (WMCNL-1440, Stufe 1): Entwurf aus Lieferung, Preisliste
// und MwSt-Stand, Statuslauf, Pruefung der Angaben, defensives Lesen des Standbilds und die Texte in
// vier Sprachen. Die Datenbankseite pruefen test:esf-db (inklusive Gleichlauf der Uebergangstabelle).
//
// Aufruf: npm run test:esf

import { readFileSync } from "node:fs";
import {
  ESF_BEMERKUNG_MAX_ZEICHEN,
  ESF_NUMMER_MAX_ZEICHEN,
  ESF_STATUS,
  ESF_UEBERGAENGE,
  baueEsfEntwurf,
  esfAngabenFehler,
  esfFristStand,
  esfTon,
  istAbgeschlossen,
  istEsfStatus,
  liesEntwurf,
  mwstSatzAm,
  warRegistriertAm,
  wechselErlaubt,
  zaehleBelege,
  type EsfAngaben,
  type EsfEntwurfEingabe,
  type EsfLuecke,
} from "@/lib/domain/esf";
import { einstellungStandard } from "@/lib/einstellungen";

let fehler = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

// --- 1. Statuslauf -----------------------------------------------------------------------------------------------
check("Status: fuenf Zustaende", ESF_STATUS.length === 5 && ESF_STATUS.every(istEsfStatus) && !istEsfStatus("storniert"));
check("Uebergang: entwurf nach ausgestellt und papier", wechselErlaubt("entwurf", "ausgestellt") && wechselErlaubt("entwurf", "papier") && !wechselErlaubt("entwurf", "bestaetigt"));
check("Uebergang: ausgestellt nach bestaetigt oder abgelehnt, nicht zurueck", wechselErlaubt("ausgestellt", "bestaetigt") && wechselErlaubt("ausgestellt", "abgelehnt") && !wechselErlaubt("ausgestellt", "entwurf") && !wechselErlaubt("ausgestellt", "papier"));
check("Uebergang: abgelehnt nach entwurf oder papier", wechselErlaubt("abgelehnt", "entwurf") && wechselErlaubt("abgelehnt", "papier") && !wechselErlaubt("abgelehnt", "bestaetigt"));
check("Endzustaende: bestaetigt und papier", istAbgeschlossen("bestaetigt") && istAbgeschlossen("papier") && !istAbgeschlossen("abgelehnt") && !istAbgeschlossen("entwurf"));
check("Uebergang: kein Zustand wechselt in sich selbst", ESF_STATUS.every((s) => !ESF_UEBERGAENGE[s].includes(s)));
check("Farbton: jeder Zustand hat einen", ESF_STATUS.every((s) => typeof esfTon[s] === "string"));

// --- 2. Entwurf ----------------------------------------------------------------------------------------------------
const S1 = "sorte-1";
const eingabe = (extra: Partial<EsfEntwurfEingabe> = {}): EsfEntwurfEingabe => ({
  stichtag: "2026-08-30",
  kunde: { name: "Handelskette A", identifikationsnummer: "123456789012", rechtsform: "too", kundengruppe: null },
  sorteId: S1,
  sorteName: "Tulameen",
  chargeCode: "CH-1",
  mengeKg: 80,
  preislisten: [{ gueltigAb: "2026-01-01", gueltigBis: null, kundengruppe: null, positionen: [{ sorteId: S1, preisTengeKg: 3200 }] }],
  mwstSaetze: [{ gueltigAb: "2026-01-01", gueltigBis: null, prozent: 16 }],
  mwstRegistriert: false,
  mwstRegistriertAm: null,
  ...extra,
});

{
  const e = baueEsfEntwurf(eingabe());
  check("Entwurf: ohne MwSt-Registrierung gilt der Betrag, keine MwSt", e.ware.betragTenge === 256000 && e.mwst.registriert === false && e.mwst.prozent === null && e.mwst.betragTenge === null && e.mwst.gesamtTenge === 256000, JSON.stringify(e.mwst));
  check("Entwurf: vollstaendige Angaben haben keine Luecke", e.luecken.length === 0 && e.version === 1 && e.stichtag === "2026-08-30");
  check("Entwurf: Kunde, Sorte, Charge uebernommen", e.kunde.name === "Handelskette A" && e.ware.sorte === "Tulameen" && e.ware.chargeCode === "CH-1" && e.ware.mengeKg === 80);
}
{
  const e = baueEsfEntwurf(eingabe({ mwstRegistriert: true, mwstRegistriertAm: "2026-01-01" }));
  check("Entwurf: registriert, 16 % auf den Betrag", e.mwst.registriert && e.mwst.prozent === 16 && e.mwst.betragTenge === 40960 && e.mwst.gesamtTenge === 296960, JSON.stringify(e.mwst));
}
{
  const e = baueEsfEntwurf(eingabe({ mwstRegistriert: true, mwstRegistriertAm: "2026-09-01" }));
  check("Entwurf: am Liefertag noch nicht registriert, dann keine MwSt", !e.mwst.registriert && e.mwst.betragTenge === null && e.mwst.gesamtTenge === 256000);
  check("Registrierung: am Tag der Registrierung gilt sie schon", warRegistriertAm(true, "2026-09-01", "2026-09-01") && !warRegistriertAm(true, "2026-09-01", "2026-08-31") && warRegistriertAm(true, null, "2020-01-01") && !warRegistriertAm(false, "2026-01-01", "2026-09-01"));
}
{
  const e = baueEsfEntwurf(eingabe({ mengeKg: 33.33, preislisten: [{ gueltigAb: "2026-01-01", gueltigBis: null, kundengruppe: null, positionen: [{ sorteId: S1, preisTengeKg: 100 }] }], mwstRegistriert: true }));
  check("Entwurf: Betrag und MwSt auf zwei Stellen gerundet", e.ware.betragTenge === 3333 && e.mwst.betragTenge === 533.28 && e.mwst.gesamtTenge === 3866.28, JSON.stringify([e.ware.betragTenge, e.mwst.betragTenge, e.mwst.gesamtTenge]));
}
{
  const e = baueEsfEntwurf(
    eingabe({
      kunde: { name: "Gastro", identifikationsnummer: "123456789012", rechtsform: "too", kundengruppe: "gastro" },
      preislisten: [
        { gueltigAb: "2026-01-01", gueltigBis: null, kundengruppe: null, positionen: [{ sorteId: S1, preisTengeKg: 3200 }] },
        { gueltigAb: "2026-01-01", gueltigBis: null, kundengruppe: "gastro", positionen: [{ sorteId: S1, preisTengeKg: 2900 }] },
      ],
    }),
  );
  check("Entwurf: die Preisliste der Kundengruppe geht der Standardliste vor", e.ware.preisTengeKg === 2900 && e.ware.betragTenge === 232000);
}
{
  const e = baueEsfEntwurf(eingabe({ preislisten: [{ gueltigAb: "2026-09-01", gueltigBis: null, kundengruppe: null, positionen: [{ sorteId: S1, preisTengeKg: 3200 }] }] }));
  check("Entwurf: eine Preisliste ab 01.09. gilt nicht fuer den 30.08.", e.ware.preisTengeKg === null && e.luecken.includes("preis") && e.ware.betragTenge === null && e.mwst.gesamtTenge === null);
}
{
  const e = baueEsfEntwurf(eingabe({ sorteId: null, sorteName: null, kunde: { name: "X", identifikationsnummer: null, rechtsform: null, kundengruppe: null } }));
  const erwartet: EsfLuecke[] = ["sorte", "preis", "identifikationsnummer"];
  check("Entwurf: Luecken werden benannt, ohne Sorte kein Preis", erwartet.every((l) => e.luecken.includes(l)) && e.luecken.length === 3, e.luecken.join(","));
}
{
  const e = baueEsfEntwurf(eingabe({ mwstRegistriert: true, mwstSaetze: [] }));
  check("Entwurf: registriert, aber kein Satz hinterlegt: Luecke und keine Gesamtsumme", e.luecken.includes("mwstSatz") && e.mwst.prozent === null && e.mwst.gesamtTenge === null && e.ware.betragTenge === 256000);
}
{
  const saetze = [
    { gueltigAb: "2026-01-01", gueltigBis: "2027-01-01", prozent: 16 },
    { gueltigAb: "2027-01-01", gueltigBis: null, prozent: 12 },
  ];
  check("MwSt-Satz: das Ende ist ausschliessend, am Wechseltag gilt der neue Satz", mwstSatzAm(saetze, "2026-12-31") === 16 && mwstSatzAm(saetze, "2027-01-01") === 12 && mwstSatzAm(saetze, "2025-12-31") === null);
}

// --- 3. Standbild lesen --------------------------------------------------------------------------------------------------
{
  const e = baueEsfEntwurf(eingabe({ mwstRegistriert: true }));
  const gelesen = liesEntwurf(JSON.parse(JSON.stringify(e)));
  check("Standbild: Hin- und Rueckweg ueber JSON ist verlustfrei", JSON.stringify(gelesen) === JSON.stringify(e));
  check("Standbild: Muell wird nicht zum Entwurf", [null, undefined, "x", 3, [], {}, { version: 2 }, { version: 1, stichtag: "2026-01-01" }].every((w) => liesEntwurf(w) === null));
  const kaputt = JSON.parse(JSON.stringify(e));
  kaputt.luecken = ["preis", "erfunden", 7];
  check("Standbild: unbekannte Luecken fallen heraus", JSON.stringify(liesEntwurf(kaputt)?.luecken) === JSON.stringify(["preis"]));
}

// --- 4. Angaben beim Statuswechsel ------------------------------------------------------------------------------------------
const HEUTE = "2026-10-14";
const angaben = (extra: Partial<EsfAngaben> = {}): EsfAngaben => ({ nummer: "", ausgestelltAm: "", bestaetigtAm: "", bemerkung: "", bisherAusgestelltAm: null, ...extra });
check("Ausgestellt: Nummer und Datum noetig", esfAngabenFehler("ausgestellt", angaben(), HEUTE) === "esfNummer" && esfAngabenFehler("ausgestellt", angaben({ nummer: "ЭСФ-1" }), HEUTE) === "esfDatum" && esfAngabenFehler("ausgestellt", angaben({ nummer: "ЭСФ-1", ausgestelltAm: HEUTE }), HEUTE) === null);
check("Ausgestellt: Nummer nur bis zur Grenze, Leerraum zaehlt nicht", esfAngabenFehler("ausgestellt", angaben({ nummer: "   " , ausgestelltAm: HEUTE }), HEUTE) === "esfNummer" && esfAngabenFehler("ausgestellt", angaben({ nummer: "x".repeat(ESF_NUMMER_MAX_ZEICHEN), ausgestelltAm: HEUTE }), HEUTE) === null && esfAngabenFehler("ausgestellt", angaben({ nummer: "x".repeat(ESF_NUMMER_MAX_ZEICHEN + 1), ausgestelltAm: HEUTE }), HEUTE) === "esfNummer");
check("Ausgestellt: kein Datum in der Zukunft, kein unmoegliches Datum", esfAngabenFehler("ausgestellt", angaben({ nummer: "1", ausgestelltAm: "2026-10-15" }), HEUTE) === "esfDatum" && esfAngabenFehler("ausgestellt", angaben({ nummer: "1", ausgestelltAm: "2026-02-30" }), HEUTE) === "esfDatum" && esfAngabenFehler("ausgestellt", angaben({ nummer: "1", ausgestelltAm: "14.10.2026" }), HEUTE) === "esfDatum");
check("Bestaetigt: nicht vor dem Ausstellen, nicht in der Zukunft", esfAngabenFehler("bestaetigt", angaben({ bestaetigtAm: "2026-10-01", bisherAusgestelltAm: "2026-10-05" }), HEUTE) === "esfDatum" && esfAngabenFehler("bestaetigt", angaben({ bestaetigtAm: "2026-10-05", bisherAusgestelltAm: "2026-10-05" }), HEUTE) === null && esfAngabenFehler("bestaetigt", angaben({ bestaetigtAm: "2026-11-01", bisherAusgestelltAm: "2026-10-05" }), HEUTE) === "esfDatum");
check("Abgelehnt und Papier: eine Begruendung von 3 bis 500 Zeichen", (["abgelehnt", "papier"] as const).every((s) => esfAngabenFehler(s, angaben(), HEUTE) === "esfBemerkung" && esfAngabenFehler(s, angaben({ bemerkung: "ab" }), HEUTE) === "esfBemerkung" && esfAngabenFehler(s, angaben({ bemerkung: "abc" }), HEUTE) === null && esfAngabenFehler(s, angaben({ bemerkung: "x".repeat(ESF_BEMERKUNG_MAX_ZEICHEN) }), HEUTE) === null && esfAngabenFehler(s, angaben({ bemerkung: "x".repeat(ESF_BEMERKUNG_MAX_ZEICHEN + 1) }), HEUTE) === "esfBemerkung"));
check("Entwurf: braucht keine Angaben", esfAngabenFehler("entwurf", angaben(), HEUTE) === null);

// --- 5. Zaehlung -------------------------------------------------------------------------------------------------------------
{
  const z = zaehleBelege(4, ["entwurf", "entwurf", "ausgestellt", "papier"]);
  check("Zaehlung: offene Lieferungen und Belege je Zustand", z.offen === 4 && z.entwurf === 2 && z.ausgestellt === 1 && z.papier === 1 && z.bestaetigt === 0 && z.abgelehnt === 0, JSON.stringify(z));
}

// --- 6. Texte in vier Sprachen ------------------------------------------------------------------------------------------
type Baum = { [k: string]: Baum | string };
const wert = (baum: Baum, pfad: string): unknown => pfad.split(".").reduce<unknown>((b, k) => (typeof b === "object" && b !== null ? (b as Baum)[k] : undefined), baum);
const quelle = `${readFileSync("src/lib/actions/esf.ts", "utf8")}\n${readFileSync("src/lib/actions/status.ts", "utf8")}`;
const schluesselAusCode = [...quelle.matchAll(/"(ok|fehler)\.(esf\w+)"/g)].map((m) => `aktionen.${m[1]}.${m[2]}`);
const zusaetzlich = ["esfNummer", "esfDatum", "esfBemerkung"].map((k) => `aktionen.fehler.${k}`); // aus esfAngabenFehler, ueber fehler.${...} gebildet
// --- Netto oder brutto (15.10.2026) -----------------------------------------------------------------------------------------------------------
{
  const brutto = (extra: Partial<EsfEntwurfEingabe> = {}) =>
    eingabe({ preislisten: [{ gueltigAb: "2026-01-01", gueltigBis: null, kundengruppe: null, inklMwst: true, positionen: [{ sorteId: S1, preisTengeKg: 3200 }] }], ...extra });
  const netto = baueEsfEntwurf(eingabe({ mwstRegistriert: true, mwstRegistriertAm: "2026-01-01" }));
  check("Netto: die Vorgabe bleibt, 80 kg zu 3200 ergeben 256000 ohne MwSt, 40960 MwSt, 296960 gesamt, Annahme netto", netto.ware.betragTenge === 256000 && netto.mwst.betragTenge === 40960 && netto.mwst.gesamtTenge === 296960 && netto.mwst.annahme === "netto");
  const b = baueEsfEntwurf(brutto({ mwstRegistriert: true, mwstRegistriertAm: "2026-01-01" }));
  // 80 kg zu 3200 brutto = 256000 gesamt; ohne MwSt 256000 / 1,16 = 220689,66; MwSt = 35310,34.
  check("Brutto: registriert, der Gesamtbetrag ist Preis mal Menge, der Betrag ohne MwSt ist Gesamt geteilt durch 1,16", b.mwst.gesamtTenge === 256000 && b.ware.betragTenge === 220689.66 && b.mwst.betragTenge === 35310.34 && b.mwst.annahme === "brutto", JSON.stringify([b.ware.betragTenge, b.mwst]));
  check("Brutto: Betrag und MwSt ergeben genau den Gesamtbetrag", Math.round(((b.ware.betragTenge ?? 0) + (b.mwst.betragTenge ?? 0)) * 100) === 25600000);
  const unreg = baueEsfEntwurf(brutto());
  check("Brutto: ohne MwSt-Registrierung ist der Preis der Endpreis, keine MwSt, kein Abzug", unreg.ware.betragTenge === 256000 && unreg.mwst.betragTenge === null && unreg.mwst.gesamtTenge === 256000);
  const ohneSatz = baueEsfEntwurf(brutto({ mwstRegistriert: true, mwstRegistriertAm: "2026-01-01", mwstSaetze: [] }));
  check("Brutto: ohne Satz laesst sich nichts trennen, die Luecke meldet es und Betrag und MwSt bleiben leer", ohneSatz.ware.betragTenge === null && ohneSatz.mwst.betragTenge === null && ohneSatz.luecken.includes("mwstSatz"));
  check("Brutto: das Standbild kehrt gelesen mit der Annahme zurueck, ein alter Entwurf ohne Angabe gilt als netto", liesEntwurf(JSON.parse(JSON.stringify(b)))?.mwst.annahme === "brutto" && liesEntwurf(JSON.parse(JSON.stringify({ ...netto, mwst: { ...netto.mwst, annahme: undefined } })))?.mwst.annahme === "netto");
  check("Brutto: eine gruppengenaue Liste traegt ihre eigene Angabe", baueEsfEntwurf(eingabe({ kunde: { name: "X", identifikationsnummer: "1", rechtsform: null, kundengruppe: "handel" }, mwstRegistriert: true, mwstRegistriertAm: "2026-01-01", preislisten: [
    { gueltigAb: "2026-01-01", gueltigBis: null, kundengruppe: null, positionen: [{ sorteId: S1, preisTengeKg: 3200 }] },
    { gueltigAb: "2026-01-01", gueltigBis: null, kundengruppe: "handel", inklMwst: true, positionen: [{ sorteId: S1, preisTengeKg: 3200 }] },
  ] })).mwst.annahme === "brutto");
}

// --- Frist (15.10.2026) -------------------------------------------------------------------------------------------------------------------
// Steuerkodex 214-VIII, Art. 493 Abs. 1: spaetestens 15 Kalendertage nach dem Umsatztag. Der letzte Tag zaehlt noch, die Frist kommt aus der Einstellung.
check("Frist: am Liefertag laufen noch alle Tage", JSON.stringify(esfFristStand(0, 15)) === JSON.stringify({ art: "laeuft", verbleibend: 15 }));
check("Frist: am fuenfzehnten Tag ist es der letzte Tag, noch nicht ueberfaellig", JSON.stringify(esfFristStand(15, 15)) === JSON.stringify({ art: "laeuft", verbleibend: 0 }));
check("Frist: am sechzehnten Tag ist es einen Tag ueberfaellig", JSON.stringify(esfFristStand(16, 15)) === JSON.stringify({ art: "ueberfaellig", ueberschritten: 1 }));
check("Frist: eine andere Einstellung gilt (30 Tage)", JSON.stringify(esfFristStand(20, 30)) === JSON.stringify({ art: "laeuft", verbleibend: 10 }));
check("Frist: ohne gesetzte Frist gibt es keine Aussage statt eines erfundenen Werts", JSON.stringify(esfFristStand(400, null)) === JSON.stringify({ art: "keine" }));
check("Frist: der Standard im Code ist 15 Kalendertage", einstellungStandard("esf.frist_tage") === 15);

const noetig = [
  ...new Set([...schluesselAusCode, ...zusaetzlich]),
  "esfAnsicht.entwurf.annahmeBrutto", "preislistenAnsicht.netto", "preislistenAnsicht.brutto", "preislistenAnsicht.formular.erstellen.inklMwst", "preislistenAnsicht.formular.erstellen.inklMwstHinweis",
  "esfAnsicht.zaehlUeberfaellig", "esfAnsicht.offen.leadOhneFrist", "esfAnsicht.offen.ueberfaellig", "esfAnsicht.offen.nochTage", "esfAnsicht.offen.letzterTag",
  "esfAnsicht.titel", "esfAnsicht.lead", "esfAnsicht.stufeHinweis", "esfAnsicht.nurLesen", "esfAnsicht.zaehlOffen",
  "esfAnsicht.offen.titel", "esfAnsicht.offen.lead", "esfAnsicht.offen.leer", "esfAnsicht.offen.heute", "esfAnsicht.offen.tage", "esfAnsicht.offen.keinBeleg",
  "esfAnsicht.offen.col.kunde", "esfAnsicht.offen.col.geliefertAm", "esfAnsicht.offen.col.menge", "esfAnsicht.offen.col.alter", "esfAnsicht.offen.col.beleg",
  "esfAnsicht.belege.titel", "esfAnsicht.belege.lead", "esfAnsicht.belege.leer",
  "esfAnsicht.nummerMit", "esfAnsicht.ausgestelltAm", "esfAnsicht.bestaetigtAm",
  ...ESF_STATUS.map((s) => `esfAnsicht.status.${s}`),
  ...(["preis", "sorte", "identifikationsnummer", "mwstSatz"] as const).map((l) => `esfAnsicht.luecke.${l}`),
  ...["titel", "stichtag", "kaeufer", "identifikationsnummer", "fehlt", "sorte", "charge", "menge", "preis", "betrag", "mwst", "nichtRegistriert", "gesamt", "annahme", "lueckenTitel", "unlesbar"].map((k) => `esfAnsicht.entwurf.${k}`),
  ...["entwurfErstellen", "entwurfNeu", "entwurfVerwerfen", "neuBeginnen"].map((k) => `esfAnsicht.aktion.${k}`),
  ...["ausgestellt", "bestaetigt", "abgelehnt", "papier"].flatMap((s) => ["titel", "knopf"].map((k) => `esfAnsicht.aktion.${s}.${k}`)),
  "esfAnsicht.aktion.ausgestellt.nummer", "esfAnsicht.aktion.ausgestellt.datum", "esfAnsicht.aktion.bestaetigt.datum", "esfAnsicht.aktion.abgelehnt.grund", "esfAnsicht.aktion.papier.grund",
  "modules.esf.description", "modules.esf.summary", "modules.esf.todo",
];
check("Texte: die Aktionen nennen mindestens neun Schluessel", schluesselAusCode.length >= 9, String(schluesselAusCode.length));
for (const sprache of ["de", "en", "kk", "ru"]) {
  const d = JSON.parse(readFileSync(`src/messages/${sprache}.json`, "utf8")) as Baum;
  const fehlt = noetig.filter((p) => typeof wert(d, p) !== "string" || wert(d, p) === "");
  check(`${sprache}: alle ${noetig.length} Texte des Belegregisters vorhanden`, fehlt.length === 0, fehlt.join(", "));
}

if (fehler > 0) {
  console.log(`\n${fehler} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("\nAlle ЭСФ-Tests gruen.");
