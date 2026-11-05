// Tests für das Drehbuch der Vorführung (src/lib/demo/drehbuch.ts) und seine Anbindung.
// Ohne Datenbank, ohne Browser, ohne Netz: läuft in wenigen Sekunden.
//
// Was hier festgehalten wird:
//   - jedes Ziel gibt es im System und ist für Geschäftsführung und Administration sichtbar,
//   - jede Stelle, auf die Himbi zeigt, hat in allen Oberflächensprachen einen Text,
//   - die Texte sind vollständig je Sprache, ohne Gedankenstriche und ohne Ersatzschreibung,
//   - die Länge hält das Zeitbudget (6 Minuten ohne, höchstens 7 mit CEO-Teil),
//   - die genannte Amortisation stimmt mit der Rechnung im System überein,
//   - die Stimme liest nur Text aus dem Drehbuch, nie frei übergebenen Text.
//
// Aufruf: npm run test:demo-drehbuch

import { readFileSync } from "node:fs";
import {
  darfDemo,
  DEMO_SPRACHEN,
  DREHBUCH,
  lesedauerMs,
  MAX_SCHRITT_ZEICHEN,
  modulZu,
  schrittMitId,
  schritteFuer,
  sprechtext,
  textIn,
  verfuegbareSprachen,
  woerterJeBereich,
} from "../../src/lib/demo/drehbuch";
import { waehleBlase } from "../../src/components/haustier/haustier-dashboard-blasen";
import { amortisationMonate } from "../../src/lib/domain/wirtschaftlichkeit";
import { hasPermission } from "../../src/lib/rbac";

let bestanden = 0;
let fehlgeschlagen = 0;
function pruefe(name: string, ok: boolean, detail = ""): void {
  if (ok) bestanden++;
  else fehlgeschlagen++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const SPRACHDATEIEN = ["de", "en", "ru", "kk"] as const;
const nachrichten = Object.fromEntries(
  SPRACHDATEIEN.map((s) => [s, JSON.parse(readFileSync(`src/messages/${s}.json`, "utf8")) as Record<string, unknown>]),
);
function nachricht(sprache: (typeof SPRACHDATEIEN)[number], pfad: string): unknown {
  return pfad.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), nachrichten[sprache]);
}

// ---- Aufbau ------------------------------------------------------------------------------------

const ids = DREHBUCH.map((s) => s.id);
pruefe("Schrittkennungen sind eindeutig", new Set(ids).size === ids.length);
pruefe("jede Kennung ist für die Adresse der Stimme geeignet", ids.every((id) => /^[a-z0-9-]+$/.test(id)));
pruefe("schrittMitId findet jeden Schritt und weist Unbekanntes ab", ids.every((id) => schrittMitId(id)?.id === id) && schrittMitId("frei-erfunden") === null && schrittMitId("") === null);

const ohneCeo = schritteFuer(false).map((s) => s.id);
const mitCeo = schritteFuer(true).map((s) => s.id);
pruefe("ohne CEO-Teil: kurzer Schluss, kein Schritt des CEO-Teils", ohneCeo.includes("abschluss-ohne") && !ohneCeo.includes("abschluss") && !ohneCeo.some((i) => i.startsWith("ceo-")));
pruefe("mit CEO-Teil: drei CEO-Schritte und der lange Schluss, nicht der kurze", mitCeo.includes("abschluss") && !mitCeo.includes("abschluss-ohne") && mitCeo.filter((i) => i.startsWith("ceo-")).length === 3);
pruefe("der Schluss steht in beiden Fassungen zuletzt", ohneCeo.at(-1) === "abschluss-ohne" && mitCeo.at(-1) === "abschluss");
pruefe("die Reihenfolge der gemeinsamen Schritte ist in beiden Fassungen gleich", ohneCeo.filter((i) => mitCeo.includes(i)).join() === mitCeo.filter((i) => ohneCeo.includes(i)).join());

// ---- Ziele -------------------------------------------------------------------------------------

for (const s of DREHBUCH) {
  if (s.ziel.art === "modul") {
    const modul = modulZu(s.ziel);
    pruefe(`Schritt ${s.id}: Modul ${s.ziel.modul} gibt es`, modul !== null);
    if (modul) {
      pruefe(`Schritt ${s.id}: Geschäftsführung und Administration dürfen das Modul sehen`, hasPermission("ceo", modul.resource, "view") && hasPermission("admin", modul.resource, "view"));
      pruefe(`Schritt ${s.id}: Titel des Moduls in allen Sprachen`, SPRACHDATEIEN.every((l) => typeof nachricht(l, `modules.${modul.key}.title`) === "string"));
    }
  } else {
    pruefe(`Schritt ${s.id}: feste Seite liegt im Dashboard`, s.ziel.pfad === "/dashboard" || s.ziel.pfad.startsWith("/dashboard/"));
  }
  if (s.zeigeAuf) {
    pruefe(`Schritt ${s.id}: Überschrift ${s.zeigeAuf} in allen Sprachen`, SPRACHDATEIEN.every((l) => typeof nachricht(l, s.zeigeAuf as string) === "string"));
  }
}

// ---- Texte -------------------------------------------------------------------------------------

pruefe("Deutsch ist immer verfügbar", verfuegbareSprachen().includes("de"));
for (const sprache of DEMO_SPRACHEN) {
  const vorhanden = DREHBUCH.filter((s) => textIn(s, sprache) !== null).length;
  // Eine Sprache ist entweder ganz da oder gar nicht: halb übersetzt klänge mitten im Lauf wie ein Fehler.
  pruefe(`Sprache ${sprache}: ganz oder gar nicht (${vorhanden} von ${DREHBUCH.length} Schritten)`, vorhanden === 0 || vorhanden === DREHBUCH.length);
  pruefe(`Sprache ${sprache}: Anzeige in der Auswahl folgt der Vollständigkeit`, verfuegbareSprachen().includes(sprache) === (vorhanden === DREHBUCH.length));
}

const GEDANKENSTRICH = /[–—]|\s-\s/;
// Ersatzschreibungen, die in einem deutschen Text nichts zu suchen haben (die Stimme würde "Pru-efung" lesen).
const ERSATZ = /\b(fuer|ueber|Pruefung|Pruef\w*|koennen|moechte|waehrend|Gedaechtnis|Loesung|Buero|Vorfuehrung|Uebergabe|Geschaeftsfuehrung)\b/;
for (const s of DREHBUCH) {
  for (const sprache of DEMO_SPRACHEN) {
    const text = textIn(s, sprache);
    if (text === null) continue;
    pruefe(`Schritt ${s.id} (${sprache}): kein Gedankenstrich`, !GEDANKENSTRICH.test(text));
    pruefe(`Schritt ${s.id} (${sprache}): höchstens ${MAX_SCHRITT_ZEICHEN} Zeichen`, text.length <= MAX_SCHRITT_ZEICHEN, `${text.length}`);
    if (sprache === "de") pruefe(`Schritt ${s.id} (de): echte Umlaute statt Ersatzschreibung`, !ERSATZ.test(text));
    if (sprache === "ru") pruefe(`Schritt ${s.id} (ru): kyrillischer Text`, /[Ѐ-ӿ]/.test(text));
  }
}

// ---- Stimme ------------------------------------------------------------------------------------

const esutd = schrittMitId("integrationen");
const sprechDe = esutd ? sprechtext(esutd, "de") : null;
pruefe("deutsche Stimme: Kürzel in Buchstaben, keine kyrillischen Zeichen mehr", sprechDe !== null && !/[Ѐ-ӿ]/.test(sprechDe) && sprechDe.includes("E S U T D"));
pruefe(
  "russische Stimme: kein lateinischer Buchstabe mehr, die Untertitel behalten Damicon",
  DREHBUCH.every((s) => {
    const gesprochen = sprechtext(s, "ru");
    return gesprochen !== null && !/[A-Za-z]/.test(gesprochen);
  }) && DREHBUCH.some((s) => (textIn(s, "ru") ?? "").includes("Damicon")),
);
pruefe("Russisch ist in der Auswahl, sobald alle Schritte übersetzt sind", verfuegbareSprachen().includes("ru"));
pruefe("Anzeige behält das Kürzel der Behörde", esutd !== null && (textIn(esutd, "de") ?? "").includes("ЕСУТД"));
pruefe("sprechtext liefert null, wo es keinen Text gibt", DREHBUCH.every((s) => sprechtext(s, "ru") === null || textIn(s, "ru") !== null));
pruefe("Lesedauer: nie unter dreieinhalb Sekunden", lesedauerMs("Ja.") === 3500 && lesedauerMs("") === 3500);

// ---- Kürze: Nutzen statt Ablauf ----------------------------------------------------------------

// Rückmeldung vom 05.11.2026: das Drehbuch war zu lang und nannte zu viel. Jeder Schritt bleibt bei
// höchstens drei Sätzen und 35 Wörtern, in jeder Sprache.
for (const s of DREHBUCH) {
  for (const sprache of DEMO_SPRACHEN) {
    const text = textIn(s, sprache);
    if (text === null) continue;
    const saetze = (text.match(/[.!?](\s|$)/g) ?? []).length;
    const woerter = text.split(/\s+/).filter(Boolean).length;
    pruefe(`Schritt ${s.id} (${sprache}): höchstens drei Sätze und 35 Wörter`, saetze <= 3 && woerter <= 35, `${saetze} Sätze, ${woerter} Wörter`);
  }
}

// ---- Gewichtung: Feld und Hof, dann Büro, Markt ganz kurz --------------------------------------

// Vorgabe vom 05.11.2026: die Priorität zeigt sich an der Länge. Gemessen werden die Wörter der
// Modulschritte je Bereich (Zone des Moduls) ohne CEO-Teil.
for (const sprache of DEMO_SPRACHEN) {
  if (!verfuegbareSprachen().includes(sprache)) continue;
  const w = woerterJeBereich(sprache);
  const gesamt = w.feld + w.hof + w.buero + w.markt;
  const feldHof = w.feld + w.hof;
  const anteil = (n: number) => `${Math.round((n / gesamt) * 100)} %`;
  const bild = `Feld ${w.feld}, Hof ${w.hof}, Büro ${w.buero}, Markt ${w.markt} Wörter (Feld und Hof ${anteil(feldHof)})`;
  pruefe(`Gewichtung (${sprache}): Feld und Hof haben den größten Teil, mindestens 60 Prozent`, feldHof / gesamt >= 0.6, bild);
  pruefe(`Gewichtung (${sprache}): Feld und Hof zusammen länger als Büro, Büro länger als Markt`, feldHof > w.buero && w.buero > w.markt, bild);
  pruefe(`Gewichtung (${sprache}): der Markt ist ganz kurz, höchstens 10 Prozent`, w.markt / gesamt <= 0.1, bild);
  pruefe(`Gewichtung (${sprache}): Feld und Hof haben je mindestens zwei Schritte`, w.feld > 0 && w.hof > 0, bild);
}
const jeZone = (zone: string) => schritteFuer(false).filter((s) => modulZu(s.ziel)?.zone === zone).length;
pruefe(
  "Reihenfolge: Feld, dann Hof, dann Büro, dann Markt",
  (() => {
    const zonen = schritteFuer(false).map((s) => modulZu(s.ziel)?.zone).filter((z): z is NonNullable<typeof z> => !!z);
    const rang = { feld: 0, hof: 1, buero: 2, markt: 3 } as Record<string, number>;
    return zonen.every((z, i) => i === 0 || rang[z] >= rang[zonen[i - 1]]);
  })(),
);
pruefe("Schritte je Bereich: Feld mindestens 3, Hof mindestens 2, Markt genau 1", jeZone("feld") >= 3 && jeZone("hof") >= 2 && jeZone("markt") === 1);

// ---- Zeigen: Abschnitte der Seite --------------------------------------------------------------

for (const s of DREHBUCH) {
  if (s.abschnitte) {
    pruefe(`Schritt ${s.id}: Abschnitte gehören zu einer Modulseite`, s.ziel.art === "modul");
    pruefe(
      `Schritt ${s.id}: Abschnitte sind ganze Zahlen von 0 bis 8, ohne Wiederholung`,
      s.abschnitte.every((n) => Number.isInteger(n) && n >= 0 && n <= 8) && new Set(s.abschnitte).size === s.abschnitte.length,
    );
  }
  if (s.zeigeAuf) pruefe(`Schritt ${s.id}: eine Überschrift nur auf einer festen Seite`, s.ziel.art === "pfad" && !s.abschnitte);
}
pruefe(
  "Fünf der Modulschritte zeigen auf mehr als eine Stelle (die Markierung wandert)",
  DREHBUCH.filter((s) => (s.abschnitte?.length ?? 0) > 1).length >= 5,
);

// ---- Zeit --------------------------------------------------------------------------------------

function minuten(schritte: ReturnType<typeof schritteFuer>): number {
  const woerter = schritte.reduce((summe, s) => summe + (textIn(s, "de") ?? "").split(/\s+/).filter(Boolean).length, 0);
  return woerter / 130; // ruhiges Sprechtempo der Stimme, Wörter pro Minute
}
const ohne = minuten(schritteFuer(false));
const mit = minuten(schritteFuer(true));
pruefe("Sprechzeit ohne CEO-Teil zwischen 1,5 und 3,5 Minuten", ohne >= 1.5 && ohne <= 3.5, `${ohne.toFixed(1)} min`);
pruefe("Sprechzeit mit CEO-Teil höchstens 4 Minuten", mit <= 4, `${mit.toFixed(1)} min`);

// ---- Zahlen ------------------------------------------------------------------------------------

const wirtschaft = schrittMitId("ceo-wirtschaftlichkeit");
pruefe(
  "genannte Amortisation stimmt mit der Rechnung im System überein",
  wirtschaft !== null && (textIn(wirtschaft, "de") ?? "").includes(`${Math.round(amortisationMonate() ?? Number.NaN)} Monaten`),
  `${amortisationMonate()?.toFixed(2)} Monate`,
);
pruefe("die Wartezeit-Regel nennt 60 Minuten wie die Kühlketten-Uhr", (textIn(schrittMitId("kuehlkette")!, "de") ?? "").includes("60 Minuten"));

// ---- Rechte ------------------------------------------------------------------------------------

pruefe("nur Geschäftsführung und Administration dürfen die Vorführung", darfDemo("ceo") && darfDemo("admin") && !["betriebsleitung", "buchhaltung", "brigade", "picker", "erzeuger", "kunde"].some((r) => darfDemo(r as never)) && !darfDemo(null) && !darfDemo(undefined));

// ---- Anbindung (Quelltext) ---------------------------------------------------------------------

const route = readFileSync("src/app/api/demo-sprachausgabe/route.ts", "utf8");
pruefe("Stimme: Text kommt aus dem Drehbuch (sprechtext)", route.includes("sprechtext(schritt, sprache)"));
pruefe("Stimme: kein frei übergebener Text", !/searchParams\.get\(["'](text|inhalt|satz)["']\)/.test(route) && !/req\.json\(\)/.test(route));
pruefe("Stimme: echte Profilrolle wird geprüft", route.includes("darfDemo(profil.role)"));
pruefe("Stimme: ohne Anmeldung 401", route.includes('fehler(401, "nicht-angemeldet")'));

const layout = readFileSync("src/app/[locale]/dashboard/layout.tsx", "utf8");
pruefe("Layout: Provider der Vorführung eingebunden und geschlossen", layout.includes("<DemoProvider>") && layout.includes("</DemoProvider>"));
const kontext = readFileSync("src/components/dashboard/compliance-tour-kontext.tsx", "utf8");
pruefe("Himbis Figur bekommt die Anzeige der Vorführung", /vorfuehrung \?\? tour/.test(kontext));
const einstellung = readFileSync("src/components/haustier/haustier-einstellung.tsx", "utf8");
pruefe("Start liegt in Himbis Einstellungen", einstellung.includes("<DemoStart />"));
const player = readFileSync("src/components/demo/demo-kontext.tsx", "utf8");
pruefe("Player klickt nichts und füllt nichts aus", !/\.click\(\)|fuelleFeld|\.submit\(|requestSubmit|\.value\s*=/.test(player));
// Rückmeldung vom 05.11.2026: die Pausen zwischen den Schritten waren mal lang, mal kurz, weil nur der
// nächste Schritt vorab geholt wurde und die Stimme langsamer sein kann als ein Schritt lang ist.
const vorab = /const VORAB = (\d+);/.exec(player);
pruefe("Player holt den Ton mehrere Schritte im Voraus", vorab !== null && Number(vorab[1]) >= 3);
pruefe("Player hält den Ton als Datei im Speicher (ein Abruf je Schritt)", player.includes("tonSpeicher") && player.includes("URL.createObjectURL"));
const nachlauf = /const NACHLAUF_MS = (\d+);/.exec(player);
pruefe("Pause nach dem letzten Wort ist fest und kurz (höchstens 800 ms)", nachlauf !== null && Number(nachlauf[1]) <= 800);

// ---- Vorrang vor dem Live-Hinweis --------------------------------------------------------------

// Befund aus der Browserprobe: lief nach dem Login die automatische Compliance-Prüfung, stand deren
// Live-Hinweis in Himbis Blase statt der ersten Sätze der Vorführung.
const blasenLage = {
  willkommen: false,
  phase: "ruhe" as const,
  fertigBlase: false,
  offen: false,
  liveHinweisAktiv: true,
  ruhigGenug: false,
  sprachmodus: false,
  tagesbeginnAn: false,
  tagesGruss: null,
  befindenLage: { befindenFrage: false, befinden: null, befindenBlase: false },
  anstupser: null,
  tipp: null,
  verfuegbar: true,
  handy: false,
  an: true,
  weg: false,
  seiteSichtbar: true,
};
const mitVorfuehrung = waehleBlase({ ...blasenLage, tour: { aktiv: true, frageBereit: false, vorrang: true } });
const mitTour = waehleBlase({ ...blasenLage, tour: { aktiv: true, frageBereit: false } });
pruefe("Vorführung läuft: der Live-Hinweis tritt zurück, die Führung ist zu sehen", !mitVorfuehrung.liveHinweisSichtbar && mitVorfuehrung.tourAktivSichtbar);
pruefe("Compliance-Tour wie bisher: der Live-Hinweis hat Vorrang vor ihr", mitTour.liveHinweisSichtbar && !mitTour.tourAktivSichtbar);

// ---- Oberflächentexte --------------------------------------------------------------------------

const SCHLUESSEL = ["titel", "text", "start", "startMitCeo", "sprache", "nichtMoeglich", "schritt", "fortsetzen", "keinTon", "ende", "nochmal"];
for (const l of SPRACHDATEIEN) {
  const fehlend = SCHLUESSEL.filter((k) => typeof nachricht(l, `haustier.demo.${k}`) !== "string" || !(nachricht(l, `haustier.demo.${k}`) as string).trim());
  pruefe(`Oberflächentexte der Vorführung (${l}) vollständig`, fehlend.length === 0, fehlend.join(", "));
  const schritt = nachricht(l, "haustier.demo.schritt") as string;
  pruefe(`Oberflächentexte (${l}): Platzhalter n und m im Schrittzähler`, schritt.includes("{n}") && schritt.includes("{m}"));
}
pruefe("russische und kasachische Texte sind kyrillisch", (["ru", "kk"] as const).every((l) => /[Ѐ-ӿ]/.test(nachricht(l, "haustier.demo.titel") as string)));
pruefe("englische Texte ohne Umlaute und ohne Kyrillisch", !/[äöüßЀ-ӿ]/i.test(nachricht("en", "haustier.demo.text") as string));
pruefe("deutsche Texte ohne Gedankenstrich", SCHLUESSEL.every((k) => !GEDANKENSTRICH.test(nachricht("de", `haustier.demo.${k}`) as string)));
pruefe("Knöpfe der Tour, die die Blase mitbenutzt, gibt es in allen Sprachen", SPRACHDATEIEN.every((l) => ["weiter", "zurueck", "beenden", "pausiert", "pause", "fertigKnopf"].every((k) => typeof nachricht(l, `haustier.tour.${k}`) === "string")));

console.log(`\n${bestanden} bestanden, ${fehlgeschlagen} fehlgeschlagen`);
process.exit(fehlgeschlagen === 0 ? 0 : 1);
