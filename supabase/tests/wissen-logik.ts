// Charakterisierung der Wissens-Logik, die beim WMC-Cleanup (Phase 3, Paket "Wissen-Logik") zerlegt wird, ohne Datenbank und ohne Netz:
//   * entscheideUeberUpload (freigabe.ts): Reihenfolge der Prüfungen, jeder Fehlercode mit seinem Wert, Aufrufe des Speichers in Reihenfolge, Rückgabe
//   * gruppiereWissenDokumente mit fuehreZusammen (dokumente-liste.ts): wie mehrere Zeilen eines Dokuments zusammenkommen, Feld für Feld
//   * ladeFreigabeInfo (speicher-supabase.ts) auf einem nachgebauten Client: Abfragen in Reihenfolge und Gleichzeitigkeit, Fehler je Abfrage, Rückgabe
//   * bewerteText (textguete.ts): jede Schwelle genau auf der Grenze und knapp darüber
// Zwei Teile: ausgeschriebene Randfälle mit erwarteten Werten, danach ein Vergleich über viele Zufallseingaben (fester Startwert, siehe
// fixtures/wissen-logik-zufall.ts) mit den Ausgaben des Codes vor dem Zerlegen (fixtures/wissen-logik-golden.json, Stand a44e005b). Ein Unterschied
// meldet den ersten abweichenden Block von 100 Fällen. Die Vergleichswerte neu schreiben nur mit einem Code, dessen Verhalten gewollt ist:
//   npx --yes tsx supabase/tests/wissen-logik.ts --golden-schreiben
// Aufruf: npm run test:wissen-logik (läuft über tsx, damit die @/-Pfade auflösen).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gruppiereWissenDokumente, type WissenDokumentZeile, type WissenListeZeile } from "@/lib/wissen/dokumente-liste";
import { entscheideUeberUpload, type FreigabeAbhaengigkeiten } from "@/lib/wissen/freigabe";
import { UploadFehler, type FreigabeInfo, type WissenSpeicher } from "@/lib/wissen/hochladen";
import { pruefenBis } from "@/lib/wissen/quellenart";
import { supabaseSpeicher } from "@/lib/wissen/speicher-supabase";
import { bewerteText, type Guete } from "@/lib/wissen/textguete";
import {
  antwortFuer,
  nachgebauterClient,
  PRUEFER,
  zufall,
  zufallsEntscheidSzenario,
  zufallsInfoSzenario,
  zufallsText,
  zufallsZeilen,
  type EntscheidSzenario,
  type InfoSzenario,
} from "./fixtures/wissen-logik-zufall";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}
const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function fehlerAbbild(e: unknown) {
  if (e instanceof UploadFehler) return { art: "UploadFehler", code: e.code, wert: e.wert === undefined ? "<undefined>" : e.wert, meldung: e.message };
  if (e instanceof Error) return { art: e.name, meldung: e.message };
  return { art: typeof e, meldung: String(e) };
}

// ---- Läufe, die eine Eingabe in eine vergleichbare Ausgabe verwandeln (gemeinsam für Randfälle und Zufall) ---------------------------

function fallText(e: { text: string; ganzesDokument: boolean }): string {
  return JSON.stringify(bewerteText(e.text, e.ganzesDokument));
}

function fallZeilen(e: { zeilen: WissenListeZeile[]; heute: string }): string {
  return JSON.stringify(gruppiereWissenDokumente(e.zeilen, e.heute));
}

interface InfoLauf {
  ergebnis?: FreigabeInfo;
  fehler?: ReturnType<typeof fehlerAbbild>;
  protokoll: string[];
}

async function laufInfo(s: InfoSzenario): Promise<InfoLauf> {
  const { client, protokoll } = nachgebauterClient((a) => antwortFuer(s, a));
  try {
    return { ergebnis: await supabaseSpeicher(client).ladeFreigabeInfo(s.quelleId), protokoll };
  } catch (e) {
    return { fehler: fehlerAbbild(e), protokoll };
  }
}

interface EntscheidLauf {
  ergebnis?: Awaited<ReturnType<typeof entscheideUeberUpload>>;
  fehler?: ReturnType<typeof fehlerAbbild>;
  aufrufe: unknown[][];
}

async function laufEntscheid(s: EntscheidSzenario): Promise<EntscheidLauf> {
  const aufrufe: unknown[][] = [];
  const kaputt = (was: string) => new Error(`${was} kaputt`);
  const speicher = {
    ladeFreigabeInfo(id: string) {
      aufrufe.push(["ladeFreigabeInfo", id]);
      if (s.ladeFehler === "error") return Promise.reject(kaputt("netz"));
      // Auch ein Text als Ablehnungsgrund (kein Error) muss zu einem UploadFehler werden.
      if (s.ladeFehler === "text") return Promise.reject("netz kaputt");
      return Promise.resolve({ ...s.info });
    },
    async entscheide(id: string, a: unknown) {
      aufrufe.push(["entscheide", id, a]);
      if (s.entscheide === "fehler") throw kaputt("entscheiden");
      return s.entscheide === "alle" ? s.info.anzahl : s.info.anzahl - 1;
    },
    async verlaengere(id: string, a: unknown) {
      aufrufe.push(["verlaengere", id, a]);
      if (s.verlaengere === "fehler") throw kaputt("verlaengern");
      return s.verlaengere === "alle" ? s.info.anzahl : 0;
    },
    ...(s.vermerkAblage === "fehlt"
      ? {}
      : {
          async legeSeitenVermerkAb(id: string, a: unknown) {
            aufrufe.push(["legeSeitenVermerkAb", id, a]);
            if (s.vermerkAblage === "fehler") throw kaputt("vermerk");
          },
        }),
  } as unknown as WissenSpeicher;
  const d: FreigabeAbhaengigkeiten = {
    speicher,
    pruefer: { id: PRUEFER },
    jetzt: () => {
      aufrufe.push(["jetzt"]);
      return new Date(s.jetzt);
    },
    umgebung: s.umgebung,
    schema: s.schema,
  };
  if ("seitenBestaetigt" in s) d.seitenBestaetigt = s.seitenBestaetigt;
  if ("seitenVermerk" in s) d.seitenVermerk = s.seitenVermerk;
  try {
    return { ergebnis: await entscheideUeberUpload(s.aktion, s.quelleId, d), aufrufe };
  } catch (e) {
    return { fehler: fehlerAbbild(e), aufrufe };
  }
}

// =====================================================================================================================================
// Teil 1: Randfälle mit erwarteten Werten
// =====================================================================================================================================

// ---- bewerteText: jede Schwelle auf der Grenze und knapp darüber ------------------------------------------------------------------

const SATZ = "Der Arbeitgeber ist verpflichtet, dem Arbeitnehmer die wesentlichen Vertragsbedingungen schriftlich niederzulegen und auszuhändigen. ";
const woerter = (...gruppen: [number, string][]) => gruppen.flatMap(([n, w]) => Array<string>(n).fill(w)).join(" ");
const zeilenText = (eindeutig: number, kopf: number) =>
  [...Array.from({ length: eindeutig }, (_, i) => `Zeile ${i} mit Inhalt`), ...Array<string>(kopf).fill("Kopfzeile")].join("\n");

/** Die Randfälle der Note: Name, Eingabe, erwartete Hinweise und Note. Sie laufen zusätzlich durch den Vergleich mit dem alten Code. */
const RANDTEXTE: { name: string; text: string; ganzesDokument: boolean; hinweise: string[]; note: Guete["note"] }[] = [
  { name: "leerer Text, ganzes Dokument: kaumText, schlecht", text: "", ganzesDokument: true, hinweise: ["kaumText"], note: "schlecht" },
  { name: "leerer Text, Paket: kein Hinweis, gut", text: "", ganzesDokument: false, hinweise: [], note: "gut" },
  { name: "299 Zeichen, ganzes Dokument: kaumText", text: SATZ.repeat(5).slice(0, 299), ganzesDokument: true, hinweise: ["kaumText"], note: "schlecht" },
  { name: "300 Zeichen, ganzes Dokument: kein kaumText", text: SATZ.repeat(5).slice(0, 300), ganzesDokument: true, hinweise: [], note: "gut" },
  { name: "299 Zeichen als Paket: kein kaumText", text: SATZ.repeat(5).slice(0, 299), ganzesDokument: false, hinweise: [], note: "gut" },
  { name: "Buchstaben genau 0,75 und Ziffern genau 0,25: kein Hinweis", text: "abc1 ".repeat(20), ganzesDokument: false, hinweise: [], note: "gut" },
  { name: "Buchstaben genau 0,6: Sonderzeichen, nicht schlecht; Ziffern 0,4: vieleZiffern", text: "abc11 ".repeat(17), ganzesDokument: false, hinweise: ["vieleSonderzeichen", "vieleZiffern"], note: "pruefen" },
  { name: "Buchstaben 0,5: Sonderzeichen, schlecht", text: "ab## ".repeat(25), ganzesDokument: false, hinweise: ["vieleSonderzeichen"], note: "schlecht" },
  { name: "Zeichensalat mit 99 Zeichen: kein Hinweis", text: "ab## ".repeat(20).slice(0, 99), ganzesDokument: false, hinweise: [], note: "gut" },
  { name: "genau 100 Zeichen, Ziffern 1/3: Sonderzeichen und vieleZiffern", text: "ab1 ".repeat(25), ganzesDokument: false, hinweise: ["vieleSonderzeichen", "vieleZiffern"], note: "pruefen" },
  { name: "Einzelbuchstaben genau 0,08: kein Hinweis", text: woerter([46, "Wort"], [4, "b"]), ganzesDokument: false, hinweise: [], note: "gut" },
  { name: "Einzelbuchstaben 0,1: zerhackt, pruefen", text: woerter([45, "Wort"], [5, "b"]), ganzesDokument: false, hinweise: ["zerhackteWoerter"], note: "pruefen" },
  { name: "Einzelbuchstaben genau 0,2: zerhackt, nicht schlecht", text: woerter([40, "Wort"], [10, "b"]), ganzesDokument: false, hinweise: ["zerhackteWoerter"], note: "pruefen" },
  { name: "Einzelbuchstaben 0,22: zerhackt, schlecht", text: woerter([39, "Wort"], [11, "b"]), ganzesDokument: false, hinweise: ["zerhackteWoerter"], note: "schlecht" },
  { name: "49 Wörter mit vielen Einzelbuchstaben: kein Hinweis", text: woerter([29, "Wort"], [20, "b"]), ganzesDokument: false, hinweise: [], note: "gut" },
  { name: "übliche Ein-Buchstaben-Wörter (a, A, в) zählen nicht", text: woerter([30, "Wort"], [8, "a"], [6, "A"], [6, "в"]), ganzesDokument: false, hinweise: [], note: "gut" },
  { name: "mittlere Wortlänge genau 13: kein Hinweis", text: woerter([50, "Arbeitsrechte"]), ganzesDokument: true, hinweise: [], note: "gut" },
  { name: "mittlere Wortlänge 13,02: ohneLeerzeichen, schlecht", text: woerter([49, "Arbeitsrechte"], [1, "Arbeitsrechten"]), ganzesDokument: true, hinweise: ["ohneLeerzeichen"], note: "schlecht" },
  { name: "29 lange Wörter, viele ohne Vokal: kein Hinweis", text: woerter([19, "Wort"], [10, "strkn"]), ganzesDokument: false, hinweise: [], note: "gut" },
  { name: "30 lange Wörter, Anteil ohne Vokal 0,1: ohneVokale, pruefen", text: woerter([27, "Wort"], [3, "strkn"]), ganzesDokument: false, hinweise: ["ohneVokale"], note: "pruefen" },
  { name: "Anteil ohne Vokal genau 0,08: kein Hinweis", text: woerter([46, "Wort"], [4, "strkn"]), ganzesDokument: false, hinweise: [], note: "gut" },
  { name: "Anteil ohne Vokal genau 0,25: ohneVokale, nicht schlecht", text: woerter([30, "Wort"], [10, "strkn"]), ganzesDokument: false, hinweise: ["ohneVokale"], note: "pruefen" },
  { name: "Anteil ohne Vokal 0,275: ohneVokale, schlecht", text: woerter([29, "Wort"], [11, "strkn"]), ganzesDokument: false, hinweise: ["ohneVokale"], note: "schlecht" },
  { name: "20 Zeilen, Wiederholung genau 0,15: kein Hinweis", text: zeilenText(17, 3), ganzesDokument: false, hinweise: [], note: "gut" },
  { name: "20 Zeilen, Wiederholung 0,2: wiederholteZeilen, trotzdem gut", text: zeilenText(16, 4), ganzesDokument: false, hinweise: ["wiederholteZeilen"], note: "gut" },
  { name: "19 Zeilen mit Wiederholung: kein Hinweis", text: zeilenText(15, 4), ganzesDokument: false, hinweise: [], note: "gut" },
  { name: "nur Ziffern: keine Buchstabenwörter, alle Anteile 0 statt Teilung durch 0", text: "12 34 56", ganzesDokument: false, hinweise: [], note: "gut" },
];

for (const f of RANDTEXTE) {
  const g = bewerteText(f.text, f.ganzesDokument);
  pruefe(`bewerteText: ${f.name}`, gleich(g.hinweise, f.hinweise) && g.note === f.note, JSON.stringify({ hinweise: g.hinweise, note: g.note, k: g.kennzahlen }));
}
{
  const leer = bewerteText("");
  pruefe("bewerteText: ganzesDokument ist ohne Angabe true", leer.hinweise.includes("kaumText"));
  pruefe("bewerteText: leerer Text hat alle Kennzahlen 0 und als schlechter Text 59 Prozent", Object.values(leer.kennzahlen).every((x) => x === 0) && leer.prozent === 59, JSON.stringify(leer));
  pruefe("bewerteText: leerer Text als Paket zählt als 100 Prozent", bewerteText("", false).prozent === 100);
  const ziffern = bewerteText("12 34 56", false).kennzahlen;
  pruefe("bewerteText: ohne Buchstabenwörter sind Einzelbuchstaben, Wortlänge, Vokale und gemischte Wörter 0", ziffern.einzelbuchstaben === 0 && ziffern.mittlereWortlaenge === 0 && ziffern.ohneVokale === 0 && ziffern.gemischteWoerter === 0 && ziffern.woerter === 3);
  pruefe("bewerteText: Zeilen unter vier Zeichen zählen nicht, ohne Zeilen ist die Wiederholung 0", bewerteText("abc\nabc\nabc", false).kennzahlen.wiederholteZeilen === 0);
  const crlf = bewerteText("Wort Wort\r\nWort Wort\rWort", false);
  pruefe("bewerteText: \\r\\n und \\r zählen wie \\n", gleich(crlf, bewerteText("Wort Wort\nWort Wort\nWort", false)));
  const gemischt = bewerteText(woerter([60, "Koдекс"]), false);
  pruefe("bewerteText: Wörter aus kyrillischen und lateinischen Buchstaben zählen als gemischt", gemischt.kennzahlen.gemischteWoerter === 1 && gemischt.prozent < bewerteText(woerter([60, "Kodeks"]), false).prozent);
  pruefe("bewerteText: schlecht hat höchstens 59 Prozent, pruefen höchstens 85", bewerteText(woerter([39, "Wort"], [11, "b"]), false).prozent <= 59 && bewerteText(woerter([45, "Wort"], [5, "b"]), false).prozent <= 85);
}

// ---- gruppiereWissenDokumente: fuehreZusammen Feld für Feld -----------------------------------------------------------------------

const zeile = (felder: Partial<WissenListeZeile>): WissenListeZeile => ({
  id: "z1",
  quelle_id: "upload:aa",
  pfad: null,
  titel: "titel",
  bereich: "recht",
  rollen: ["admin"],
  eingelesen_am: null,
  upload_quelle: "upload",
  hochgeladen_von: null,
  ...felder,
});
const einDokument = (zeilen: Partial<WissenListeZeile>[], heute = "2026-10-14"): WissenDokumentZeile => {
  const liste = gruppiereWissenDokumente(zeilen.map(zeile), heute);
  if (liste.length !== 1) throw new Error(`erwartet ein Dokument, bekommen ${liste.length}`);
  return liste[0]!;
};
const alsZahl = (x: unknown) => x as number;

pruefe("Zusammenführen: Textstellen addieren sich, anzahl fehlt, 0, negativ oder null zählt als 1", einDokument([{}, { anzahl: 3 }, { anzahl: 0 }, { anzahl: -2 }, { anzahl: null }]).chunks === 7);
pruefe("Zusammenführen: die erste Qualität in Prozent bleibt", einDokument([{ guete_prozent: null }, { guete_prozent: 40 }, { guete_prozent: 90 }]).gueteProzent === 40);
pruefe("Zusammenführen: eine Qualität als Text zählt nicht", einDokument([{}, { guete_prozent: "88" as unknown as number }, { guete_prozent: 70 }]).gueteProzent === 70);
{
  const d = einDokument([{ seiten_fehlend: 0 }, { seiten_fehlend: "3", seiten_stellen: "48-49 (47), 120 (118)" }, { seiten_fehlend: 5, seiten_stellen: "1 (1)" }]);
  pruefe("Zusammenführen: die erste Zeile mit fehlenden Seiten bringt Zahl und Stellen", d.seitenFehlend === 3 && d.seitenStellen === "48-49 (47), 120 (118)", JSON.stringify(d));
  const ohneStellen = einDokument([{ seiten_fehlend: "abc" }, { seiten_fehlend: 2 }]);
  pruefe("Zusammenführen: unlesbare Zahl zählt als 0, Stellen fehlen dann als null", ohneStellen.seitenFehlend === 2 && ohneStellen.seitenStellen === null);
  const erste = einDokument([{ seiten_fehlend: 2, seiten_stellen: "48-49 (47)" }, { seiten_fehlend: 3, seiten_stellen: "1 (1)" }]);
  pruefe("Zusammenführen: hat schon die erste Zeile fehlende Seiten, bleibt sie", erste.seitenFehlend === 2 && erste.seitenStellen === "48-49 (47)");
}
pruefe("Zusammenführen: Vermerk kommt aus der ersten Zeile, die einen hat", einDokument([{ seiten_vermerk: null }, { seiten_vermerk: "" }, { seiten_vermerk: "leer" }]).seitenVermerk === "leer");
pruefe("Zusammenführen: ein leerer Vermerk der ersten Zeile bleibt stehen (??= greift nur bei null)", einDokument([{ seiten_vermerk: "" }, { seiten_vermerk: "leer" }]).seitenVermerk === "");
pruefe("Zusammenführen: bestätigte Seiten aus der ersten Zeile, die welche hat", einDokument([{}, { seiten_bestaetigt: "" }, { seiten_bestaetigt: "48-49" }]).seitenBestaetigt === "48-49");
pruefe("Zusammenführen: nachgeladene Seiten aus der ersten Zeile, die welche hat", einDokument([{ seiten_nachgeladen: null }, { seiten_nachgeladen: "48" }]).seitenNachgeladen === "48");
pruefe("Zusammenführen: vermerkt, sobald eine Zeile vermerkt ist", einDokument([{ seiten_vermerkt: false }, { seiten_vermerkt: true }, { seiten_vermerkt: false }]).seitenVermerkt && !einDokument([{ seiten_vermerkt: null }, { seiten_vermerkt: false }]).seitenVermerkt);
pruefe(
  "Zusammenführen: nur true zählt als vermerkt, nicht \"true\" oder 1 (erste und spätere Zeilen)",
  !einDokument([{ seiten_vermerkt: "true" as unknown as boolean }]).seitenVermerkt &&
    !einDokument([{}, { seiten_vermerkt: 1 as unknown as boolean }]).seitenVermerkt &&
    !einDokument([{ seiten_vermerkt: 1 as unknown as boolean }, { seiten_vermerkt: "true" as unknown as boolean }]).seitenVermerkt,
);
pruefe("Zusammenführen: Größe des Originals aus der ersten Zeile mit mehr als 0 Bytes", einDokument([{ original_groesse: null }, { original_groesse: alsZahl("0") }, { original_groesse: alsZahl("x") }, { original_groesse: 500 }, { original_groesse: 700 }]).originalGroesse === 500);
pruefe("Zusammenführen: 0 Bytes in der ersten Zeile bleiben stehen", einDokument([{ original_groesse: 0 }, { original_groesse: 500 }]).originalGroesse === 0);
pruefe("Zusammenführen: Größe als Text in der ersten Zeile wird zur Zahl", einDokument([{ original_groesse: alsZahl("567") }, { original_groesse: 900 }]).originalGroesse === 567);
pruefe("Zusammenführen: löschbar nur, wenn alle Zeilen hochgeladen sind", einDokument([{}, {}]).loeschbar && !einDokument([{}, { upload_quelle: "skript" }, {}]).loeschbar);
pruefe("Zusammenführen: Rollen vereinigt in der Reihenfolge des ersten Auftretens", gleich(einDokument([{ rollen: ["admin"] }, { rollen: ["buero", "admin"] }, { rollen: null }, { rollen: ["lager"] }]).rollen, ["admin", "buero", "lager"]));
pruefe("Zusammenführen: Rechtsstelle aus der ersten Zeile, die eine hat (auch nach leerem Text)", einDokument([{ rechtsstelle: "" }, { rechtsstelle: "art. 5" }, { rechtsstelle: "art. 7" }]).rechtsstelle === "art. 5");
pruefe("Zusammenführen: Zahl der Pakete ist die größte Angabe", einDokument([{ pakete_gesamt: null }, { pakete_gesamt: "3" }, { pakete_gesamt: "2" }]).paketeGesamt === 3 && einDokument([{ pakete_gesamt: "" }, { pakete_gesamt: "2" }]).paketeGesamt === 2);
pruefe("Zusammenführen: Datum ist das neueste", einDokument([{ eingelesen_am: null }, { eingelesen_am: "2026-01-01" }, { eingelesen_am: "2026-05-01" }, { eingelesen_am: "2025-12-31" }]).datum === "2026-05-01");
{
  const d = einDokument([{ hochgeladen_von: "", hochgeladen_von_id: null }, { hochgeladen_von: "anna", hochgeladen_von_id: "u1" }, { hochgeladen_von: "bert", hochgeladen_von_id: "u2" }]);
  pruefe("Zusammenführen: hochladende Person und Kennung aus der ersten Zeile, die sie nennt", d.hochgeladenVon === "anna" && d.hochgeladenVonId === "u1");
}
pruefe("Zusammenführen: Status so streng wie die strengste Zeile (abgelehnt vor freigegeben)", einDokument([{ pruefstatus: "freigegeben" }, { pruefstatus: "abgelehnt" }]).pruefstatus === "abgelehnt");
pruefe("Zusammenführen: ungeprüft vor allem anderen", einDokument([{ pruefstatus: "abgelehnt" }, { pruefstatus: "ungeprueft" }, { pruefstatus: "freigegeben" }]).pruefstatus === "ungeprueft");
pruefe("Zusammenführen: unbekannter oder fehlender Status zählt als freigegeben", einDokument([{ pruefstatus: "unsinn" }, { pruefstatus: null }]).pruefstatus === "freigegeben");
pruefe("Zusammenführen: Wiedervorlage ist die früheste, leerer Text zählt nicht", einDokument([{ pruefen_bis: null }, { pruefen_bis: "2027-06-01" }, { pruefen_bis: "2026-12-31" }, { pruefen_bis: "" }]).pruefenBis === "2026-12-31");
pruefe("Zusammenführen: freigegeben mit erreichter Wiedervorlage ist abgelaufen, ungeprüft nie", einDokument([{ pruefstatus: "freigegeben" }, { pruefen_bis: "2026-01-01" }]).abgelaufen && !einDokument([{ pruefstatus: "ungeprueft" }, { pruefen_bis: "2026-01-01" }]).abgelaufen);
{
  const d = einDokument([{ seiten_fehlend: 2, seiten_stellen: "48-49 (47)" }, { seiten_nachgeladen: "48" }]);
  pruefe("Zusammenführen: offene Seiten rechnen mit den Nachträgen aller Zeilen", d.seitenOffen === 1 && d.seitenOffenStellen === "49 (47)", JSON.stringify(d));
}

// ---- ladeFreigabeInfo auf dem nachgebauten Client ---------------------------------------------------------------------------------

const Q = "upload:0123456789abcdef0123456789abcdef";
const INFO_BASIS: InfoSzenario = {
  quelleId: Q,
  zahlen: { anzahl: 3, upload: 3, ungeprueft: 3, freigegeben: 0, abgelehnt: 0 },
  erste: [{ titel: "buch a", bereich: "recht", quellenart: "fachliteratur", pruefen_bis: null, hochgeladen_von: "u1", seiten_fehlend: "2", seiten_stellen: "48-49 (47)", seiten_orte: "1:500" }],
  nachtraege: [{ seiten: "48" }, { seiten: "50-51" }],
  paketZeilen: [{ paket: "1", gesamt: "3" }, { paket: "2", gesamt: "3" }, { paket: "3", gesamt: "3" }],
  paketeLeer: false,
  fehler: [],
};
const info = (aenderung: Partial<InfoSzenario> = {}, zahlen: Partial<InfoSzenario["zahlen"]> = {}) =>
  laufInfo({ ...INFO_BASIS, ...aenderung, zahlen: { ...INFO_BASIS.zahlen, ...zahlen } });

async function teilLadeFreigabeInfo() {
  {
    const l = await info();
    const zaehl = '[["select",["id",{"count":"exact","head":true}]],["eq",["quelle_id","' + Q + '"]]';
    const erwartet = [
      `0 laufend | wissen_chunks | ${zaehl}]`,
      `1 laufend | wissen_chunks | ${zaehl},["like",["quelle_id","upload:%"]],["eq",["extra->>quelle","upload"]]]`,
      `2 laufend | wissen_chunks | ${zaehl},["eq",["pruefstatus","ungeprueft"]]]`,
      `3 laufend | wissen_chunks | ${zaehl},["eq",["pruefstatus","freigegeben"]]]`,
      `4 laufend | wissen_chunks | ${zaehl},["eq",["pruefstatus","abgelehnt"]]]`,
      `0 laufend | wissen_chunks | [["select",["titel, bereich, quellenart, pruefen_bis, hochgeladen_von:extra->>hochgeladen_von, seiten_fehlend:extra->seiten_pruefung->>fehlend, seiten_stellen:extra->seiten_pruefung->>stellen, seiten_orte:extra->seiten_pruefung->>orte"]],["eq",["quelle_id","${Q}"]],["limit",[1]]]`,
      `0 laufend | wissen_seiten_nachtrag | [["select",["seiten"]],["eq",["quelle_id","${Q}"]],["order",["nr"]]]`,
      `0 laufend | wissen_chunks | [["select",["paket:extra->>paket, gesamt:extra->>pakete_gesamt"]],["eq",["quelle_id","${Q}"]],["order",["id"]],["range",[0,999]]]`,
    ];
    pruefe("Info: fünf Zählungen gleichzeitig, danach erste Zeile, Nachträge und Pakete nacheinander, jede Abfrage genau so gebaut", gleich(l.protokoll, erwartet), l.protokoll.join("\n"));
    const e = l.ergebnis;
    pruefe(
      "Info: Rückgabe mit allen Feldern in fester Reihenfolge",
      gleich(e, {
        anzahl: 3,
        fremd: 0,
        titel: "buch a",
        bereich: "recht",
        quellenart: "fachliteratur",
        pruefstatus: "ungeprueft",
        hochgeladenVon: "u1",
        pruefenBis: null,
        unvollstaendig: false,
        seitenFehlend: 2,
        seitenStellen: "48-49 (47)",
        seitenOrte: "1:500",
        seitenNachgeladen: "48, 50-51",
      }),
      JSON.stringify(e),
    );
  }
  {
    const leer = await info({ erste: [], nachtraege: [] }, { anzahl: 0, upload: 0, ungeprueft: 0 });
    pruefe("Info: kein Dokument: Status null, keine Paketabfrage, alle Felder null", leer.ergebnis?.pruefstatus === null && leer.protokoll.length === 7 && leer.ergebnis.titel === null && leer.ergebnis.seitenFehlend === 0 && leer.ergebnis.seitenNachgeladen === null && !leer.ergebnis.unvollstaendig, JSON.stringify(leer));
    const ohneZahl = await info({}, { anzahl: null, upload: null });
    pruefe("Info: eine Zählung ohne count zählt als 0", ohneZahl.ergebnis?.anzahl === 0 && ohneZahl.ergebnis.fremd === 0 && ohneZahl.ergebnis.pruefstatus === null);
  }
  const status = async (z: Partial<InfoSzenario["zahlen"]>) => (await info({}, z)).ergebnis?.pruefstatus;
  pruefe("Info: alle Zeilen freigegeben ergibt freigegeben", (await status({ ungeprueft: 0, freigegeben: 3 })) === "freigegeben");
  pruefe("Info: alle Zeilen abgelehnt ergibt abgelehnt", (await status({ ungeprueft: 0, abgelehnt: 3 })) === "abgelehnt");
  pruefe("Info: verschiedene Status ergeben gemischt", (await status({ ungeprueft: 2, freigegeben: 1 })) === "gemischt");
  pruefe("Info: passen mehrere Zählungen, gewinnt ungeprüft vor freigegeben vor abgelehnt", (await status({ ungeprueft: 3, freigegeben: 3, abgelehnt: 3 })) === "ungeprueft" && (await status({ ungeprueft: 0, freigegeben: 3, abgelehnt: 3 })) === "freigegeben");
  pruefe("Info: fremde Zeilen sind die ohne Upload-Kennzeichen", (await info({}, { anzahl: 5, upload: 3 })).ergebnis?.fremd === 2);
  {
    const ohneErste = (await info({ erste: null })).ergebnis;
    pruefe("Info: ohne erste Zeile sind Titel, Bereich, Art, Person, Wiedervorlage und Seiten leer", gleich([ohneErste?.titel, ohneErste?.bereich, ohneErste?.quellenart, ohneErste?.hochgeladenVon, ohneErste?.pruefenBis, ohneErste?.seitenFehlend, ohneErste?.seitenStellen, ohneErste?.seitenOrte], [null, null, null, null, null, 0, null, null]));
    const teilweise = (await info({ erste: [{ titel: "nur titel", seiten_fehlend: "abc" }] })).ergebnis;
    pruefe("Info: fehlende Felder der ersten Zeile werden null, unlesbare Seitenzahl 0", teilweise?.titel === "nur titel" && teilweise.bereich === null && teilweise.seitenFehlend === 0);
  }
  pruefe("Info: Nachträge leer oder nur leere Angaben ergeben null", (await info({ nachtraege: [] })).ergebnis?.seitenNachgeladen === null && (await info({ nachtraege: [{ seiten: "" }] })).ergebnis?.seitenNachgeladen === null && (await info({ nachtraege: null })).ergebnis?.seitenNachgeladen === null);
  pruefe("Info: zwei leere Nachträge ergeben das Trennzeichen", (await info({ nachtraege: [{ seiten: "" }, { seiten: "" }] })).ergebnis?.seitenNachgeladen === ", ");
  {
    const p1000 = await info({ paketZeilen: [] }, { anzahl: 1000 });
    const p1001 = await info({ paketZeilen: [] }, { anzahl: 1001 });
    const bereiche = (l: InfoLauf) => l.protokoll.filter((p) => p.includes('"range"')).map((p) => `${p.slice(0, p.indexOf(" "))}:${/"range",\[(\d+),(\d+)\]/.exec(p)?.slice(1).join("-")}`);
    pruefe("Info: Pakete in Seiten zu 1.000 Zeilen, nacheinander", gleich(bereiche(p1000), ["0:0-999"]) && gleich(bereiche(p1001), ["0:0-999", "0:1000-1999"]), JSON.stringify([bereiche(p1000), bereiche(p1001)]));
  }
  const unvollstaendig = async (paketZeilen: Record<string, unknown>[]) => (await info({ paketZeilen })).ergebnis?.unvollstaendig;
  pruefe("Info: fehlt ein Paket, ist das Buch unvollständig", (await unvollstaendig([{ paket: "1", gesamt: "3" }, { paket: "2", gesamt: "3" }])) === true);
  pruefe("Info: alle Pakete da, das Buch ist vollständig", (await unvollstaendig([{ paket: "1", gesamt: "3" }, { paket: "2" }, { paket: "3", gesamt: "" }])) === false);
  pruefe("Info: ohne Gesamtzahl nie unvollständig, auch bei unlesbarer", (await unvollstaendig([{ paket: "1", gesamt: "" }])) === false && (await unvollstaendig([{ paket: "1", gesamt: "abc" }, { gesamt: "3" }])) === false);
  pruefe("Info: Paket als leerer Text zählt als Nummer 0, null zählt nicht", (await unvollstaendig([{ paket: "", gesamt: "2" }, { paket: "1" }])) === false && (await unvollstaendig([{ paket: null, gesamt: "2" }, { paket: "1" }])) === true);
  pruefe("Info: Paketseite ohne Daten zählt als leer", (await info({ paketeLeer: true })).ergebnis?.unvollstaendig === false);
  const meldung = async (fehlerIn: string[], zahlen: Partial<InfoSzenario["zahlen"]> = {}) => {
    const l = await info({ fehler: fehlerIn }, zahlen);
    return { meldung: l.fehler?.meldung, abfragen: l.protokoll.length };
  };
  pruefe("Info: Fehler bei einer Zählung: Freigabe (zaehlen), die anderen Zählungen liefen schon", gleich(await meldung(["freigegeben"]), { meldung: "Freigabe (zaehlen): nicht erreichbar (freigegeben)", abfragen: 5 }));
  pruefe("Info: zwei Zählungen scheitern: die Meldung der ersten", (await meldung(["abgelehnt", "upload"])).meldung === "Freigabe (zaehlen): nicht erreichbar (upload)");
  pruefe("Info: Fehler bei der ersten Zeile: Freigabe (lesen), keine weitere Abfrage", gleich(await meldung(["erste"]), { meldung: "Freigabe (lesen): nicht erreichbar (erste)", abfragen: 6 }));
  pruefe("Info: Fehler bei den Nachträgen: Freigabe (Nachtraege)", gleich(await meldung(["nachtraege"]), { meldung: "Freigabe (Nachtraege): nicht erreichbar (nachtraege)", abfragen: 7 }));
  pruefe("Info: Fehler auf der zweiten Paketseite: Freigabe (Pakete), nach der ersten Seite", gleich(await meldung(["pakete@1000"], { anzahl: 2500 }), { meldung: "Freigabe (Pakete): nicht erreichbar (pakete@1000)", abfragen: 9 }));
}

// ---- entscheideUeberUpload ------------------------------------------------------------------------------------------------------

const ENTSCHEID_BASIS: EntscheidSzenario = {
  aktion: "freigeben",
  quelleId: Q,
  umgebung: {},
  schema: "public",
  info: { anzahl: 3, fremd: 0, titel: "Buch A", bereich: "recht", quellenart: "internetquelle", pruefstatus: "ungeprueft", hochgeladenVon: "hochlader-2", pruefenBis: null, unvollstaendig: false },
  ladeFehler: null,
  jetzt: "2026-10-14T08:00:00.000Z",
  vermerkAblage: "ok",
  entscheide: "alle",
  verlaengere: "alle",
};
const JETZT = new Date(ENTSCHEID_BASIS.jetzt);
const ZEITPUNKT = ENTSCHEID_BASIS.jetzt;
const NEU_12 = pruefenBis("internetquelle", JETZT);

const entscheid = (aenderung: Partial<EntscheidSzenario> = {}, infoAenderung: Partial<FreigabeInfo> = {}) =>
  laufEntscheid({ ...ENTSCHEID_BASIS, ...aenderung, info: { ...ENTSCHEID_BASIS.info, ...infoAenderung } });
const code = async (aenderung: Partial<EntscheidSzenario> = {}, infoAenderung: Partial<FreigabeInfo> = {}) => {
  const l = await entscheid(aenderung, infoAenderung);
  return l.fehler ? `${String(l.fehler.code ?? l.fehler.art)}${"wert" in l.fehler && l.fehler.wert !== "<undefined>" ? `:${l.fehler.wert}` : ""}` : "ok";
};
const namen = (l: EntscheidLauf) => l.aufrufe.map((a) => a[0]).join(">");
const SEITEN = { seitenFehlend: 2, seitenStellen: "48-49 (47)" };

async function teilEntscheide() {
  // Vorbedingungen für alle Aktionen
  pruefe("Entscheiden: Vorschau mit Schema public ohne Freigabe-Schalter: vorschau, kein Aufruf", gleich(await entscheid({ umgebung: { VERCEL_ENV: "preview" } }), { fehler: fehlerAbbild(new UploadFehler("vorschau")), aufrufe: [] }));
  pruefe("Entscheiden: Vorschau mit Schalter oder eigenem Schema geht weiter", (await code({ umgebung: { VERCEL_ENV: "preview", WISSEN_UPLOAD_PREVIEW_OK: "true" } })) === "ok" && (await code({ umgebung: { VERCEL_ENV: "preview" }, schema: "public_preview" })) === "ok");
  {
    const vorher = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "preview";
    const l = await laufEntscheid({ ...ENTSCHEID_BASIS, umgebung: undefined as unknown as Record<string, string> });
    if (vorher === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = vorher;
    pruefe("Entscheiden: ohne eigene Umgebung gilt process.env", l.fehler?.code === "vorschau");
  }
  {
    const l = await entscheid({ quelleId: "recht/a.md" });
    pruefe("Entscheiden: Skript-Quelle endet ohne Frage an die Datenbank", l.fehler?.code === "nichtFreigebbar" && l.aufrufe.length === 0);
  }
  pruefe("Entscheiden: Lesefehler wird zu freigeben ohne Titel, mit der Ursache in der Meldung", gleich((await entscheid({ ladeFehler: "error" })).fehler, { art: "UploadFehler", code: "freigeben", wert: "<undefined>", meldung: "Wissens-Upload: freigeben (netz kaputt)" }));
  pruefe("Entscheiden: auch ein Text als Lesefehler wird zu freigeben", (await entscheid({ ladeFehler: "text" })).fehler?.meldung === "Wissens-Upload: freigeben");
  {
    const l = await entscheid({}, { anzahl: 0 });
    pruefe("Entscheiden: kein Dokument: nichtGefunden, die Uhr wird nicht gefragt", l.fehler?.code === "nichtGefunden" && namen(l) === "ladeFreigabeInfo");
  }
  pruefe("Entscheiden: fremde Zeilen: nichtFreigebbar", (await code({}, { fremd: 1 })) === "nichtFreigebbar");

  // Verlängern
  const verl = (infoAenderung: Partial<FreigabeInfo>, aenderung: Partial<EntscheidSzenario> = {}) =>
    code({ aktion: "verlaengern", ...aenderung }, { pruefstatus: "freigegeben", pruefenBis: "2026-10-13", ...infoAenderung });
  pruefe("Verlängern: nur freigegebene Dokumente", (await verl({ pruefstatus: "ungeprueft" })) === "nichtPruefbar" && (await verl({ pruefstatus: "gemischt" })) === "nichtPruefbar");
  pruefe("Verlängern: ohne Wiedervorlage nicht", (await verl({ pruefenBis: null })) === "nichtPruefbar" && (await verl({ pruefenBis: "" })) === "nichtPruefbar");
  pruefe("Verlängern: Wiedervorlage heute oder später: noch nicht", (await verl({ pruefenBis: "2026-10-14" })) === "nichtPruefbar" && (await verl({ pruefenBis: "2026-10-15" })) === "nichtPruefbar");
  pruefe("Verlängern: hochladende Person unbekannt: nichtFreigebbar, die eigene: selbstFreigabe", (await verl({ hochgeladenVon: null })) === "nichtFreigebbar" && (await verl({ hochgeladenVon: PRUEFER })) === "selbstFreigabe");
  pruefe("Verlängern: unbekannte Art oder Art ohne Wiedervorlage: nichtPruefbar", (await verl({ quellenart: "unsinn" })) === "nichtPruefbar" && (await verl({ quellenart: "fachliteratur" })) === "nichtPruefbar");
  pruefe("Verlängern: Schreibfehler: freigeben mit Titel, ohne Titel ohne Wert", (await verl({}, { verlaengere: "fehler" })) === "freigeben:Buch A" && (await verl({ titel: null }, { verlaengere: "fehler" })) === "freigeben");
  pruefe("Verlängern: weniger Zeilen geändert: nichtPruefbar", (await verl({}, { verlaengere: "keine" })) === "nichtPruefbar");
  {
    const l = await entscheid({ aktion: "verlaengern" }, { pruefstatus: "freigegeben", pruefenBis: "2026-10-13" });
    pruefe(
      "Verlängern: Erfolg mit neuer Wiedervorlage, ohne Seitenangaben",
      gleich(l, {
        ergebnis: { titel: "Buch A", bereich: "recht", quellenart: "internetquelle", abschnitte: 3, pruefenBis: NEU_12, seitenFehlend: 0, seitenBestaetigt: null, seitenVermerk: null },
        aufrufe: [["ladeFreigabeInfo", Q], ["jetzt"], ["verlaengere", Q, { pruefer: PRUEFER, zeitpunkt: ZEITPUNKT, pruefenBis: NEU_12 }]],
      }),
      JSON.stringify(l),
    );
  }

  // Freigeben
  pruefe("Freigeben: nur ungeprüfte Dokumente", (await code({}, { pruefstatus: "freigegeben" })) === "nichtPruefbar" && (await code({}, { pruefstatus: null })) === "nichtPruefbar");
  pruefe("Freigeben: unvollständiges Buch, noch vor dem Vier-Augen-Prinzip", (await code({}, { unvollstaendig: true, hochgeladenVon: PRUEFER })) === "unvollstaendig");
  pruefe("Freigeben: hochladende Person leer: nichtFreigebbar, die eigene: selbstFreigabe", (await code({}, { hochgeladenVon: "" })) === "nichtFreigebbar" && (await code({}, { hochgeladenVon: PRUEFER })) === "selbstFreigabe");
  {
    const l = await entscheid();
    pruefe(
      "Freigeben: ohne fehlende Seiten direkt entscheiden, mit neuer Wiedervorlage",
      gleich(l, {
        ergebnis: { titel: "Buch A", bereich: "recht", quellenart: "internetquelle", abschnitte: 3, pruefenBis: NEU_12, seitenFehlend: 0, seitenBestaetigt: null, seitenVermerk: null },
        aufrufe: [["ladeFreigabeInfo", Q], ["jetzt"], ["entscheide", Q, { status: "freigegeben", pruefer: PRUEFER, zeitpunkt: ZEITPUNKT, pruefenBis: NEU_12 }]],
      }),
      JSON.stringify(l),
    );
    pruefe("Freigeben: Art ohne Wiedervorlage ergibt null", (await entscheid({}, { quellenart: "fachliteratur" })).ergebnis?.pruefenBis === null && (await entscheid({}, { quellenart: null })).ergebnis?.pruefenBis === null);
  }
  pruefe("Freigeben: mehr Lücken als bekannt: nicht bestätigbar, mit den bekannten Stellen", (await code({ seitenBestaetigt: "48-49" }, { seitenFehlend: 5, seitenStellen: "48-49 (47)" })) === "seitenNichtAbgedeckt:48-49 (47)");
  pruefe("Freigeben: Lücken ohne lesbare Stellen: nicht bestätigbar, Wert -", (await code({ seitenBestaetigt: "48-49" }, { seitenFehlend: 2, seitenStellen: "kaputt" })) === "seitenNichtAbgedeckt:-");
  pruefe("Freigeben: offene Lücken ohne Angabe: seitenNichtBestaetigt mit Titel", (await code({}, SEITEN)) === "seitenNichtBestaetigt:Buch A" && (await code({ seitenBestaetigt: "" }, SEITEN)) === "seitenNichtBestaetigt:Buch A");
  pruefe("Freigeben: unlesbare Angabe: seitenNichtBestaetigt", (await code({ seitenBestaetigt: "abc" }, SEITEN)) === "seitenNichtBestaetigt:Buch A" && (await code({ seitenBestaetigt: "49-48" }, SEITEN)) === "seitenNichtBestaetigt:Buch A");
  pruefe("Freigeben: Angabe deckt nicht alle Lücken: seitenNichtAbgedeckt mit dem Rest", (await code({ seitenBestaetigt: "48" }, SEITEN)) === "seitenNichtAbgedeckt:49 (47)");
  pruefe("Freigeben: Speicher ohne Ablage für die Bestätigung: freigeben", (await code({ seitenBestaetigt: "48-49", vermerkAblage: "fehlt" }, SEITEN)) === "freigeben:Buch A");
  {
    const l = await entscheid({ seitenBestaetigt: "48-49", vermerkAblage: "fehler" }, SEITEN);
    pruefe("Freigeben: Ablage scheitert: freigeben, es wird nicht entschieden", l.fehler?.code === "freigeben" && namen(l) === "ladeFreigabeInfo>jetzt>legeSeitenVermerkAb");
  }
  {
    const l = await entscheid({ seitenBestaetigt: "48-49, 300", seitenVermerk: "  Leere\u0007 Seiten  " }, { ...SEITEN, seitenOrte: "1:500" });
    pruefe(
      "Freigeben: Bestätigung wird VOR der Entscheidung abgelegt, nur die benutzten Seiten, Vermerk gesäubert",
      gleich(l, {
        ergebnis: { titel: "Buch A", bereich: "recht", quellenart: "internetquelle", abschnitte: 3, pruefenBis: NEU_12, seitenFehlend: 2, seitenBestaetigt: "48-49", seitenVermerk: "Leere Seiten" },
        aufrufe: [
          ["ladeFreigabeInfo", Q],
          ["jetzt"],
          ["legeSeitenVermerkAb", Q, { vermerk: "Leere Seiten", bestaetigt: "48-49", stellen: "48-49 (47)", von: PRUEFER, zeitpunkt: ZEITPUNKT }],
          ["entscheide", Q, { status: "freigegeben", pruefer: PRUEFER, zeitpunkt: ZEITPUNKT, pruefenBis: NEU_12 }],
        ],
      }),
      JSON.stringify(l),
    );
    const kurz = await entscheid({ seitenBestaetigt: "48-49", seitenVermerk: "ab" }, SEITEN);
    pruefe("Freigeben: zu kurzer Vermerk wird null", kurz.ergebnis?.seitenVermerk === null && gleich((kurz.aufrufe[2]?.[2] as { vermerk: unknown }).vermerk, null));
    const ohneStellen = await entscheid({ seitenBestaetigt: "48-49" }, { seitenFehlend: 2, seitenStellen: undefined, seitenNachgeladen: undefined });
    pruefe("Freigeben: fehlende Stellen bei Zahl ohne Stellen: nicht bestätigbar", ohneStellen.fehler?.code === "seitenNichtAbgedeckt");
  }
  {
    const l = await entscheid({}, { ...SEITEN, seitenNachgeladen: "48-49" });
    pruefe("Freigeben: nachgeladene Seiten schließen die Lücke, keine Bestätigung nötig", l.ergebnis?.seitenFehlend === 0 && namen(l) === "ladeFreigabeInfo>jetzt>entscheide");
  }
  pruefe("Freigeben: Schreibfehler beim Entscheiden: freigeben mit Titel", (await code({ entscheide: "fehler" })) === "freigeben:Buch A");
  pruefe("Freigeben: weniger Zeilen geändert: nichtPruefbar", (await code({ entscheide: "weniger" })) === "nichtPruefbar");

  // Ablehnen
  {
    const l = await entscheid({ aktion: "ablehnen" }, { ...SEITEN, unvollstaendig: true, hochgeladenVon: PRUEFER });
    pruefe(
      "Ablehnen: auch durch die hochladende Person, auch unvollständig, ohne Bestätigung der Seiten, ohne Wiedervorlage",
      gleich(l, {
        ergebnis: { titel: "Buch A", bereich: "recht", quellenart: "internetquelle", abschnitte: 3, pruefenBis: null, seitenFehlend: 2, seitenBestaetigt: null, seitenVermerk: null },
        aufrufe: [["ladeFreigabeInfo", Q], ["jetzt"], ["entscheide", Q, { status: "abgelehnt", pruefer: PRUEFER, zeitpunkt: ZEITPUNKT, pruefenBis: null }]],
      }),
      JSON.stringify(l),
    );
  }
  pruefe("Ablehnen: nur ungeprüfte Dokumente", (await code({ aktion: "ablehnen" }, { pruefstatus: "abgelehnt" })) === "nichtPruefbar");
  {
    const vorher = Date.now();
    const zeitpunkte: string[] = [];
    const speicher = {
      ladeFreigabeInfo: async () => ({ ...ENTSCHEID_BASIS.info }),
      entscheide: async (_id: string, a: { zeitpunkt: string }) => {
        zeitpunkte.push(a.zeitpunkt);
        return 3;
      },
    } as unknown as WissenSpeicher;
    await entscheideUeberUpload("ablehnen", Q, { speicher, pruefer: { id: PRUEFER }, umgebung: {}, schema: "public" });
    const zeitpunkt = Date.parse(String(zeitpunkte[0]));
    pruefe("Entscheiden: ohne eigene Uhr gilt die aktuelle Zeit", zeitpunkt >= vorher && zeitpunkt <= Date.now(), String(zeitpunkte[0]));
  }
  {
    // Der Titel im Speicherfehler wird erst beim Scheitern gelesen (Befund des Kritikers, wie vor dem Zerlegen).
    const info = { ...ENTSCHEID_BASIS.info };
    const spaeterGeaendert = async () => {
      await Promise.resolve();
      info.titel = "SPAETER GEAENDERT";
      throw new Error("kaputt");
    };
    const speicher = { ladeFreigabeInfo: async () => info, entscheide: spaeterGeaendert } as unknown as WissenSpeicher;
    const fehler = await entscheideUeberUpload("ablehnen", Q, { speicher, pruefer: { id: PRUEFER }, umgebung: {}, schema: "public" }).then(
      () => null,
      (e: unknown) => fehlerAbbild(e),
    );
    pruefe("Entscheiden: Speicherfehler trägt den Titel zum Zeitpunkt des Scheiterns", fehler !== null && "wert" in fehler && fehler.wert === "SPAETER GEAENDERT", JSON.stringify(fehler));
  }
}

// =====================================================================================================================================
// Teil 2: Vergleich über viele Zufallseingaben mit dem Code vor dem Zerlegen
// =====================================================================================================================================

interface Abdruck {
  faelle: number;
  sha: string;
  /** sha256 (16 Zeichen) je Block von 100 Fällen: zeigt, wo eine Abweichung beginnt. */
  bloecke: string[];
}

function abdruck(ausgaben: readonly string[]): Abdruck {
  const sha = (texte: readonly string[]) => createHash("sha256").update(texte.join("\n")).digest("hex");
  const bloecke: string[] = [];
  for (let i = 0; i < ausgaben.length; i += 100) bloecke.push(sha(ausgaben.slice(i, i + 100)).slice(0, 16));
  return { faelle: ausgaben.length, sha: sha(ausgaben), bloecke };
}

const ANZAHL = { bewerteText: 5000, gruppiere: 5000, ladeFreigabeInfo: 3000, entscheide: 20000 };

/** Die Zufallsläufe; nebenbei zählt `abdeckung`, welche Ausgänge vorkamen, damit sichtbar ist, dass der Zufall jede Verzweigung erreicht. */
async function zufallsLaeufe(abdeckung: Map<string, number>) {
  const zaehle = (schluessel: string) => abdeckung.set(schluessel, (abdeckung.get(schluessel) ?? 0) + 1);
  const texte = RANDTEXTE.map(fallText);
  const rt = zufall(20261014);
  for (let i = 0; i < ANZAHL.bewerteText; i++) {
    const e = zufallsText(rt);
    const g = bewerteText(e.text, e.ganzesDokument);
    for (const h of g.hinweise) zaehle(`text:${h}`);
    zaehle(`text:note:${g.note}`);
    texte.push(fallText(e));
  }
  const listen: string[] = [];
  const rz = zufall(4711);
  for (let i = 0; i < ANZAHL.gruppiere; i++) {
    const e = zufallsZeilen(rz);
    const liste = gruppiereWissenDokumente(e.zeilen, e.heute);
    for (const d of liste) {
      zaehle(`liste:status:${d.pruefstatus}`);
      if (d.chunks > 1) zaehle("liste:zusammengefuehrt");
      if (d.abgelaufen) zaehle("liste:abgelaufen");
      if (d.unvollstaendig) zaehle("liste:unvollstaendig");
      if (d.seitenOffen > 0) zaehle("liste:seitenOffen");
      if (d.loeschbar) zaehle("liste:loeschbar");
    }
    listen.push(fallZeilen(e));
  }
  const infos: string[] = [];
  const ri = zufall(1000);
  for (let i = 0; i < ANZAHL.ladeFreigabeInfo; i++) {
    const l = await laufInfo(zufallsInfoSzenario(ri));
    zaehle(l.fehler ? `info:fehler:${l.fehler.meldung.slice(0, l.fehler.meldung.indexOf(":"))}` : `info:status:${l.ergebnis!.pruefstatus}`);
    if (l.ergebnis?.unvollstaendig) zaehle("info:unvollstaendig");
    if (l.protokoll.length > 8) zaehle("info:mehrerePaketseiten");
    infos.push(JSON.stringify(l));
  }
  const entscheidungen: string[] = [];
  const re = zufall(31337);
  for (let i = 0; i < ANZAHL.entscheide; i++) {
    const s = zufallsEntscheidSzenario(re);
    const l = await laufEntscheid(s);
    zaehle(`entscheid:${s.aktion}:${l.fehler ? String(l.fehler.code) : l.ergebnis!.seitenBestaetigt ? "ok mit Bestätigung" : "ok"}`);
    entscheidungen.push(JSON.stringify(l));
  }
  return { bewerteText: abdruck(texte), gruppiere: abdruck(listen), ladeFreigabeInfo: abdruck(infos), entscheide: abdruck(entscheidungen) };
}

/** Diese Ausgänge muss der Zufall mindestens fünfmal treffen, sonst prüft der Vergleich eine Verzweigung nicht. */
const PFLICHT_AUSGAENGE = [
  ...["kaumText", "vieleSonderzeichen", "zerhackteWoerter", "ohneLeerzeichen", "ohneVokale", "vieleZiffern", "wiederholteZeilen"].map((h) => `text:${h}`),
  "text:note:gut",
  "text:note:pruefen",
  "text:note:schlecht",
  ...["ungeprueft", "freigegeben", "abgelehnt"].map((s) => `liste:status:${s}`),
  "liste:zusammengefuehrt",
  "liste:abgelaufen",
  "liste:unvollstaendig",
  "liste:seitenOffen",
  "liste:loeschbar",
  ...["null", "ungeprueft", "freigegeben", "abgelehnt", "gemischt"].map((s) => `info:status:${s}`),
  ...["Freigabe (zaehlen)", "Freigabe (lesen)", "Freigabe (Nachtraege)", "Freigabe (Pakete)"].map((m) => `info:fehler:${m}`),
  "info:unvollstaendig",
  "info:mehrerePaketseiten",
  ...["vorschau", "nichtFreigebbar", "freigeben", "nichtGefunden", "nichtPruefbar", "selbstFreigabe", "ok"].map((c) => `entscheid:verlaengern:${c}`),
  ...["vorschau", "nichtFreigebbar", "freigeben", "nichtGefunden", "nichtPruefbar", "unvollstaendig", "selbstFreigabe", "seitenNichtAbgedeckt", "seitenNichtBestaetigt", "ok", "ok mit Bestätigung"].map((c) => `entscheid:freigeben:${c}`),
  ...["nichtPruefbar", "freigeben", "ok"].map((c) => `entscheid:ablehnen:${c}`),
  "entscheid:unsinn:ok",
];

const GOLDEN = "supabase/tests/fixtures/wissen-logik-golden.json";

async function teilVergleich() {
  const abdeckung = new Map<string, number>();
  const jetzt = await zufallsLaeufe(abdeckung);
  if (process.argv.includes("--golden-schreiben")) {
    writeFileSync(GOLDEN, `${JSON.stringify({ stand: "Code vor dem Zerlegen (a44e005b)", ...jetzt }, null, 2)}\n`);
    console.log(`Vergleichswerte geschrieben: ${GOLDEN}`);
  }
  if (process.argv.includes("--abdeckung")) console.log([...abdeckung].sort(([a], [b]) => (a < b ? -1 : 1)).map(([a, n]) => `${a}=${n}`).join("\n"));
  const zuSelten = PFLICHT_AUSGAENGE.filter((a) => (abdeckung.get(a) ?? 0) < 5);
  pruefe("Zufall: jeder Pflicht-Ausgang kommt mindestens fünfmal vor", zuSelten.length === 0, zuSelten.map((a) => `${a}=${abdeckung.get(a) ?? 0}`).join(", "));
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<keyof typeof ANZAHL, Abdruck>;
  for (const name of Object.keys(ANZAHL) as (keyof typeof ANZAHL)[]) {
    const alt = golden[name];
    const neu = jetzt[name];
    const erster = neu.bloecke.findIndex((b, i) => b !== alt.bloecke[i]);
    pruefe(`Vergleich ${name}: ${neu.faelle} Fälle gleich der Ausgabe des Codes vor dem Zerlegen`, neu.faelle === alt.faelle && neu.sha === alt.sha, erster >= 0 ? `erste Abweichung in Fall ${erster * 100} bis ${erster * 100 + 99}` : "");
  }
}

async function main() {
  await teilLadeFreigabeInfo();
  await teilEntscheide();
  await teilVergleich();
  console.log(`\n${gesamt} Prüfungen, ${fehler} fehlgeschlagen`);
  if (fehler > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
