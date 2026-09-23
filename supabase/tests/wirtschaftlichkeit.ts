// Tests fuer die Investitionsrechnung (lib/domain/wirtschaftlichkeit.ts):
// die sechs Kennzahlen, die drei Diagrammreihen, die Waehrungsumrechnung und
// die Pruefung des Adresszeilen-Parameters.
//
// Reine Funktionen, kein Netzwerk, keine Datenbank. Aufruf:
// npm run test:wirtschaftlichkeit
//
// Warum eigene Tests: Die Zahlen gehen auf eine Folie fuer die
// Geschaeftsfuehrung. Ein Vorzeichenfehler im Kapitalwert oder ein
// Jahreszins, der durch zwoelf statt ueber die zwoelfte Wurzel geteilt wird,
// faellt an der Kachel nicht auf - die Zahl sieht plausibel aus und ist
// falsch. Der erste Block prueft deshalb gegen die Vorgabewerte der
// Geschaeftsfuehrung zurueck: stimmen die nicht mehr, ist eine Annahme
// verschoben worden, ohne dass jemand die Herleitung angepasst hat.

import { readFileSync } from "node:fs";
import {
  CAPEX_EUR,
  HORIZONT_MONATE,
  JAHRESNUTZEN_EUR,
  KURS_EUR_TENGE,
  KURS_RUB_TENGE,
  OPEX_EUR_PRO_JAHR,
  VERMARKTETE_MENGE_KG,
  VOLLKOSTEN_JE_KG_VORHER_TENGE,
  amortisationMonate,
  barwertReihe,
  ersparnisJeKilogramm,
  euroInRubel,
  euroInTenge,
  herkunftStufen,
  kapitalwert,
  kennzahlHerkunft,
  kostenJeKilogramm,
  kostenJeKilogrammNachher,
  monatszins,
  roi,
  roiReihe,
  tco,
  tcoBausteine,
  tengeInRubel,
} from "@/lib/domain/wirtschaftlichkeit";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ist: unknown, soll: unknown) {
  gesamt++;
  const a = JSON.stringify(ist);
  const b = JSON.stringify(soll);
  const ok = a === b;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  - war ${a}, erwartet ${b}`}`);
}

/** Auf n Nachkommastellen runden, damit Gleitkommareste nicht stoeren. */
const rund = (wert: number, stellen = 2) => Math.round(wert * 10 ** stellen) / 10 ** stellen;

// --- 1. Rueckrechnung auf die Vorgabewerte der Geschaeftsfuehrung -----------
// Kennzahlenliste vom 23.09.2026: 11 Monate, 12 %, 160 %, 229.000 EUR.

pruefe("Amortisationsdauer rundet auf die vorgegebenen 11 Monate", Math.round(amortisationMonate()!), 11);
pruefe("ROI Jahr 1 rundet auf die vorgegebenen 12 Prozent", Math.round(roi(1)! * 100), 12);
pruefe("ROI ueber 3 Jahre rundet auf die vorgegebenen 160 Prozent", Math.round((roi(3)! * 100) / 10) * 10, 160);
pruefe("TCO ueber 3 Jahre trifft die vorgegebenen 229.000 EUR", tco(3), 229_000);
pruefe("TCO ist CAPEX plus n mal OPEX", tco(3), CAPEX_EUR + 3 * OPEX_EUR_PRO_JAHR);

// --- 2. Randfaelle der Kennzahlen ------------------------------------------

pruefe("Amortisation ohne Nutzen gibt null statt Unendlich", amortisationMonate(CAPEX_EUR, OPEX_EUR_PRO_JAHR, 0), null);
pruefe("Amortisation bei negativem Nutzen gibt null", amortisationMonate(CAPEX_EUR, OPEX_EUR_PRO_JAHR, -5000), null);
pruefe("ROI ohne Einsatz gibt null statt Division durch null", roi(0, 0, 0), null);
pruefe("ROI im Jahr 0 ist minus eins - alles eingesetzt, nichts zurueck", roi(0), -1);
pruefe("ROI wird negativ, wenn der Nutzen den Einsatz nicht deckt", roi(1, CAPEX_EUR, OPEX_EUR_PRO_JAHR, 50_000)! < 0, true);
pruefe("TCO ueber 0 Jahre ist der reine CAPEX", tco(0), CAPEX_EUR);

// --- 3. Kapitalwert ---------------------------------------------------------
// Der Zins wird ueber die zwoelfte Wurzel auf den Monat gebracht, nicht durch
// zwoelf geteilt: zwoelf Monatszinsen muessen wieder den Jahreszins ergeben.

pruefe("Monatszins hoch zwoelf ergibt wieder den Jahreszins", rund((1 + monatszins(0.12)) ** 12 - 1, 10), 0.12);
pruefe("Monatszins liegt unter Jahreszins durch zwoelf", monatszins(0.12) < 0.12 / 12, true);
pruefe("Kapitalwert ist bei diesen Annahmen positiv", kapitalwert() > 0, true);
pruefe("Kapitalwert nach 0 Monaten ist genau der negative CAPEX", rund(kapitalwert(0), 6), -CAPEX_EUR);
pruefe(
  "Kapitalwert wird negativ, wenn der Nutzen unter dem OPEX liegt",
  kapitalwert(HORIZONT_MONATE, CAPEX_EUR, OPEX_EUR_PRO_JAHR, 10_000) < 0,
  true,
);
pruefe(
  "hoeherer Zins drueckt den Kapitalwert",
  kapitalwert(HORIZONT_MONATE, CAPEX_EUR, OPEX_EUR_PRO_JAHR, JAHRESNUTZEN_EUR, 0.2) <
    kapitalwert(HORIZONT_MONATE, CAPEX_EUR, OPEX_EUR_PRO_JAHR, JAHRESNUTZEN_EUR, 0.05),
  true,
);

// --- 4. Kosten je Kilogramm -------------------------------------------------
// Der Nachher-Wert ist aus dem Jahresnutzen abgeleitet, nicht frei gesetzt.
// Waeren es zwei unabhaengige Schaetzungen, koennten sie dem Jahresnutzen
// widersprechen, ohne dass es auffaellt. Diese Kopplung ist der Kern der
// Kachel und wird hier festgehalten.

pruefe("Kosten je Kilogramm ohne Vollkosten bleibt leer", kostenJeKilogramm(null, 12_000), null);
pruefe("Kosten je Kilogramm ohne Menge bleibt leer", kostenJeKilogramm(4_800_000, null), null);
pruefe("Kosten je Kilogramm bei Menge null bleibt leer", kostenJeKilogramm(4_800_000, 0), null);
pruefe("Kosten je Kilogramm rechnet Vollkosten durch Menge", kostenJeKilogramm(4_800_000, 12_000), 400);

pruefe(
  "Ersparnis je Kilogramm ist der Jahresnutzen in Tenge durch die Menge",
  rund(ersparnisJeKilogramm()!, 4),
  rund(euroInTenge(JAHRESNUTZEN_EUR) / VERMARKTETE_MENGE_KG, 4),
);
pruefe("Ersparnis je Kilogramm ohne Menge bleibt leer", ersparnisJeKilogramm(JAHRESNUTZEN_EUR, 0), null);
pruefe(
  "Nachher-Wert ist der Vorher-Wert minus der Ersparnis",
  rund(kostenJeKilogrammNachher()!, 4),
  rund(VOLLKOSTEN_JE_KG_VORHER_TENGE - ersparnisJeKilogramm()!, 4),
);
pruefe("Nachher-Wert liegt unter dem Vorher-Wert", kostenJeKilogrammNachher()! < VOLLKOSTEN_JE_KG_VORHER_TENGE, true);
pruefe("Nachher-Wert bleibt positiv - sonst waere der Jahresnutzen unmoeglich hoch", kostenJeKilogrammNachher()! > 0, true);
pruefe(
  "doppelte Menge halbiert die Ersparnis je Kilogramm",
  rund(ersparnisJeKilogramm(JAHRESNUTZEN_EUR, 2 * VERMARKTETE_MENGE_KG)! * 2, 4),
  rund(ersparnisJeKilogramm()!, 4),
);

// --- 5. Diagrammreihen ------------------------------------------------------
// Jede Reihe muss an ihren Stuetzstellen dieselbe Zahl liefern wie die
// Kachel darueber. Laeuft das auseinander, zeigt die Seite zwei Wahrheiten.

const roiPunkte = roiReihe();
pruefe("roiReihe trifft im Monat 12 den ROI des ersten Jahres", rund(roiPunkte[12].wert, 10), rund(roi(1)!, 10));
pruefe("roiReihe trifft im Monat 36 den ROI ueber drei Jahre", rund(roiPunkte[36].wert, 10), rund(roi(3)!, 10));
pruefe("roiReihe beginnt bei minus eins", roiPunkte[0].wert, -1);

const barwerte = barwertReihe();
pruefe("barwertReihe hat einen Punkt je Monat plus Monat null", barwerte.length, HORIZONT_MONATE + 1);
pruefe("barwertReihe endet auf dem Kapitalwert der Kachel", rund(barwerte[36].wert, 6), rund(kapitalwert(), 6));
pruefe("barwertReihe beginnt beim negativen CAPEX", barwerte[0].wert, -CAPEX_EUR);
pruefe("barwertReihe waechst streng monoton", barwerte.every((p, i) => i === 0 || p.wert > barwerte[i - 1].wert), true);
// Der Nulldurchgang der abgezinsten Reihe liegt spaeter als die Kennzahl
// Amortisationsdauer (11 Monate). Genau diesen Abstand kostet die Abzinsung.
pruefe(
  "abgezinster Nulldurchgang liegt nach der ungezinsten Amortisationsdauer",
  barwerte.findIndex((p) => p.wert >= 0) > Math.round(amortisationMonate()!),
  true,
);

const bausteine = tcoBausteine();
pruefe("tcoBausteine summieren sich auf den TCO", bausteine.reduce((s, b) => s + b.wert, 0), tco(3));
pruefe("tcoBausteine fuehren CAPEX einmal und OPEX je Jahr", bausteine.map((b) => b.name), ["capex", "opex", "opex", "opex"]);

// --- 6. Waehrung ------------------------------------------------------------
// Tenge und Rubel muessen aus demselben Euro-Wert und demselben Stichtagskurs
// entstehen, sonst stimmt das Verhaeltnis der beiden Betraege nicht.

pruefe("Euro in Tenge rechnet ueber den Stichtagskurs", euroInTenge(1000), Math.round(1000 * KURS_EUR_TENGE));
pruefe("Euro in Rubel geht ueber denselben Tengekurs", euroInRubel(1000), Math.round((1000 * KURS_EUR_TENGE) / KURS_RUB_TENGE));
pruefe(
  "Tenge- und Rubelbetrag stehen im Verhaeltnis der beiden Kurse",
  Math.round(euroInTenge(100_000) / euroInRubel(100_000)),
  Math.round(KURS_RUB_TENGE),
);
// --- 6b. Herkunft je Kennzahl ----------------------------------------------
// kennzahlHerkunft ist die einzige Quelle fuer die Markierung auf der Seite.
// Stuenden die Stufen zusaetzlich an den Kacheln, waere spaetestens beim
// ersten Austausch einer Annahme eine der beiden Stellen falsch.

pruefe("jede der zehn Kennzahlen hat eine Herkunft", Object.keys(kennzahlHerkunft).length, 10);
pruefe(
  "keine Herkunft ausserhalb der drei Stufen",
  Object.values(kennzahlHerkunft).every((h) => (herkunftStufen as readonly string[]).includes(h)),
  true,
);
// Was aus dem Jahresnutzen, dem Zins oder der Menge folgt, ist nicht belegt.
// Amortisation und beide Renditen haengen zwar rechnerisch am Jahresnutzen,
// standen aber als Ergebnis in der Vorgabe - der Jahresnutzen ist die
// Rueckrechnung dazu, nicht umgekehrt.
pruefe(
  "die drei abgeleiteten Kennzahlen sind als geschaetzt markiert",
  ["vermiedeneKosten", "kapitalwert", "kostenJeKilogramm"].map((k) => kennzahlHerkunft[k as keyof typeof kennzahlHerkunft]),
  ["geschaetzt", "geschaetzt", "geschaetzt"],
);
pruefe(
  "die vorgegebenen Kennzahlen sind als belegt markiert",
  ["amortisation", "roiJahr1", "roiDreiJahre", "capex", "opex", "tco", "nutzenbeginn"].map(
    (k) => kennzahlHerkunft[k as keyof typeof kennzahlHerkunft],
  ),
  ["belegt", "belegt", "belegt", "belegt", "belegt", "belegt", "belegt"],
);

// --- 6c. Uebersetzungsschluessel -------------------------------------------
// Ein fehlender Schluessel wirft erst zur Laufzeit, auf der fertigen Seite,
// und nur in der Sprache, in der er fehlt. Genau so steckt seit Laengerem ein
// MISSING_MESSAGE fuer dashboard.home.dataLive im Bestand. test:agent prueft
// die Modul-Schluessel, aber keinen der uebrigen Pfade.

const NAMENSRAUM = "wirtschaftlichkeitAnsicht";
const quellen = [
  "src/components/db/wirtschaftlichkeit-ansicht.tsx",
  "src/components/db/wirtschaftlichkeit-modell.tsx",
].map((p) => readFileSync(p, "utf8"));

// t("a.b.c") und t(`a.b.c`), beides mit einfachen oder doppelten Anfuehrungszeichen.
const verwendet = new Set<string>();
for (const quelle of quellen) {
  for (const treffer of quelle.matchAll(/\bt\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g)) {
    verwendet.add(treffer[1]);
  }
}

const holen = (objekt: unknown, pfad: string): unknown =>
  pfad.split(".").reduce<unknown>((o, teil) => (o as Record<string, unknown>)?.[teil], objekt);

const fehlend: string[] = [];
for (const sprache of ["de", "en", "kk", "ru"]) {
  const katalog = JSON.parse(readFileSync(`src/messages/${sprache}.json`, "utf8"));
  for (const pfad of verwendet) {
    if (typeof holen(katalog[NAMENSRAUM], pfad) !== "string") fehlend.push(`${sprache}:${pfad}`);
  }
}

pruefe("mindestens ein Schluessel wurde im Quelltext gefunden", verwendet.size > 10, true);
pruefe(
  `jeder verwendete Schluessel steht in allen vier Sprachen (${verwendet.size} Stueck)`,
  fehlend.slice(0, 8),
  [],
);

pruefe("null Euro bleiben null Tenge", euroInTenge(0), 0);
pruefe("beide Umrechnungen liefern ganze Zahlen", Number.isInteger(euroInTenge(154_000)) && Number.isInteger(euroInRubel(154_000)), true);
pruefe("Tenge in Rubel geht ueber den Rubelkurs", tengeInRubel(5310), 1000);
pruefe(
  "Tenge in Rubel und Euro in Rubel stimmen ueberein",
  tengeInRubel(euroInTenge(100_000)),
  euroInRubel(100_000),
);

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
if (fehler > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
