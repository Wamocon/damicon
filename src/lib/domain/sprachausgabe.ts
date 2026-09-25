// Sprachausgabe der KI-Antworten (Text-to-Speech) - reine Logik ohne
// Netzwerk, damit supabase/tests/ki-assistent.mjs sie direkt pruefen kann.
// Der Aufruf selbst: lib/ai/sprachausgabe-client.ts, die Route:
// app/api/ki-sprachausgabe/route.ts.

// --- Sprechmarken (domain/sprechmarken.ts) --------------------------------------

/** Steht im Text für den Zerleger an der Stelle einer Sprechmarke ("[[a3]]"). Ein
 *  Zeichen aus dem privaten Bereich: kommt in echtem Text nicht vor und lässt sich
 *  nicht teilen. */
export const MARKEN_PLATZHALTER = "\uE000";

/** Ein Ziel: "e12" (Element aus seiteLesen), "a3" (Abschnitt aus seiteLesen oder
 *  der Seitenkarte), "#anker" (id auf der Seite) oder "t:Überschrift" (Text einer
 *  sichtbaren Überschrift, falls das Modell den Titel statt der Referenz schreibt). */
export type SprechZiel = string;

/** Entfernt Marken aus einem fertigen Text (Speichern, Anzeige, Vorlesen), samt
 *  einer abgeschnittenen Marke am Ende ("… [[a1"). Leerraum um die Marke wird
 *  so zusammengefasst, dass weder doppelte Leerzeichen noch ein Leerzeichen vor
 *  einem Satzzeichen stehen bleiben. */
export function ohneSprechmarken(text: string): string {
  if (!text.includes("[[")) return text;
  return text
    .replace(/[ \t]*\[\[[^[\]\n]{1,80}\]\][ \t]*/g, (treffer, stelle: number, ganz: string) => {
      const vor = ganz[stelle - 1];
      const nach = ganz[stelle + treffer.length];
      if (vor === undefined || vor === "\n" || nach === undefined || nach === "\n") return "";
      if (/[.,;:!?…)\]»“"']/.test(nach)) return "";
      return " ";
    })
    .replace(/[ \t]*\[\[[^[\]\n]{0,80}$/, "");
}

export const sprachausgabeSprachen = ["de", "ru", "kk", "en"] as const;
export type SprachausgabeSprache = (typeof sprachausgabeSprachen)[number];

/** Wer spricht. Seit 24.09.2026 zwei Anbieter hinter einem Schalter
 *  (KI_SPRACHAUSGABE_ANBIETER), siehe docs/infra/sprachausgabe-anbieter.md:
 *
 *    - "sokrates": unsere Stimmen auf der Sokrates-API, eine Stimme je
 *      Sprache ("de-female"), vermutlich eine kleine Engine der Piper-/VITS-
 *      Klasse. Voreinstellung und immer der Rueckfall.
 *    - "soniox": Soniox TTS v2 (tts-rt-v2). EINE Stimme fuer alle Sprachen,
 *      die Sprache geht als eigenes Feld mit - die Stimmen dort sind
 *      mehrsprachig. Kann de, en, ru und kk (Modellliste der Soniox-API,
 *      62 Sprachen). */
export type SprachausgabeAnbieter = "sokrates" | "soniox";

export interface Stimme {
  anbieter: SprachausgabeAnbieter;
  /** Name der Stimme beim Anbieter. Sokrates waehlt allein darueber aus
   *  (auch die Sprache), Soniox nimmt die Sprache zusaetzlich. */
  stimme: string;
  sprache: SprachausgabeSprache;
  /** Nur Soniox: Sprechtempo (speed, 0,7 bis 1,3), siehe sprechTempo(). */
  tempo?: number;
  /** Nur Soniox: kuerzere Pausen zwischen Woertern (reduce_silence), siehe
   *  stilleKuerzen(). */
  stilleKuerzen?: boolean;
}

// Eine Stimme je Sprache, benannt nach der Auswahlregel des Dienstes:
// <sprache>-male bzw. <sprache>-female.
//
// Am 20.09.2026 gegen den Dienst geprueft, nicht angenommen: jede
// Kombination aus de/en/ru/kk und male/female liefert HTTP 200 mit echtem
// MP3 (Frame-Kopf und LAME-Kennung, 11-34 kB je Satz, 0,2-0,7 s). Damit hat
// Russisch erstmals eine Stimme - mit den Piper-Stimmen auf Caesar ging das
// nicht, weil dort nur Modelle mit unklarer oder nicht kommerzieller Lizenz
// bereitstanden.
//
// Wichtig fuer die Auswahl: ein unbekannter Stimmname wird vom Dienst NICHT
// abgelehnt, er antwortet mit 200 und irgendeiner Standardstimme (geprueft
// mit "gibt-es-nicht"). Diese Tabelle ist deshalb die einzige Kontrolle
// darueber, was tatsaechlich gesprochen wird - ein Tippfehler hier faellt
// nicht als Fehler auf, sondern als falsch klingende Antwort.
//
// Weiblich ueberall, damit die Anwendung einheitlich klingt; die Umstellung
// je Sprache ist ein Wort in dieser Tabelle.
export const STIMMEN: Record<SprachausgabeSprache, Stimme | null> = {
  de: { anbieter: "sokrates", stimme: "de-female", sprache: "de" },
  en: { anbieter: "sokrates", stimme: "en-female", sprache: "en" },
  kk: { anbieter: "sokrates", stimme: "kk-female", sprache: "kk" },
  ru: { anbieter: "sokrates", stimme: "ru-female", sprache: "ru" },
};

/** Stimme bei Soniox, wenn SONIOX_TTS_STIMME nichts anderes sagt. Weiblich,
 *  wie die bisherigen Stimmen; dieselbe fuer alle vier Sprachen, damit der
 *  Assistent in jeder Sprache wie derselbe klingt. Aus der Stimmenliste der
 *  Soniox-API (GET /v1/tts-models). Anders als Sokrates lehnt Soniox einen
 *  unbekannten Namen ab - ein Tippfehler faellt dann als Rueckfall auf
 *  Sokrates im Protokoll auf, nicht als fremde Stimme. */
export const SONIOX_STIMME_STANDARD = "Maya";

/** Stimme je Sprache, wenn weder SONIOX_TTS_STIMME_<SPRACHE> noch
 *  SONIOX_TTS_STIMME etwas anderes sagen. Aus einer echten Messreihe vom
 *  25.09.2026 (88 Stroeme, alle vier Sprachen, docs/infra/
 *  sprachausgabe-anbieter.md): Deutsch war mit Maya/1,0 genau auf
 *  Tagesschau-Tempo, das die Rueckmeldung als sehr langsam empfand - Lena
 *  erreicht bei 1,2 das uebliche Vorlesetempo mit kaum Pausen. Kasachisch
 *  hatte mit Maya die meisten und laengsten Pausen aller Sprachen - Yana
 *  halbiert sie. Englisch und Russisch bleiben bei Maya, dort war das
 *  gemessene Tempo bereits ausreichend. Klanglich ungeprueft (kein
 *  Hoertest mit Muttersprachlern) - vor einem breiten Einsatz anhoeren. */
export const SONIOX_STIMME_STANDARD_JE_SPRACHE: Record<SprachausgabeSprache, string> = {
  de: "Lena",
  en: SONIOX_STIMME_STANDARD,
  ru: SONIOX_STIMME_STANDARD,
  kk: "Yana",
};

/** Welcher Anbieter spricht. Voreinstellung sokrates: wer den Schalter nicht
 *  setzt, bekommt den Stand von vorher. */
export function sprachausgabeAnbieter(): SprachausgabeAnbieter {
  return process.env.KI_SPRACHAUSGABE_ANBIETER?.trim().toLowerCase() === "soniox" ? "soniox" : "sokrates";
}

/** Vorlesen als Strom (Soniox-WebSocket direkt aus dem Browser, domain/
 *  sprachausgabe-strom.ts)? Immer, wenn Soniox spricht - ausser
 *  KI_SPRACHAUSGABE_STROM steht auf "aus"; dann bleibt es bei einzelnen
 *  Abschnitten ueber api/ki-sprachausgabe. Sokrates hat keinen Strom. */
export function sprachausgabeStromAn(roh: string | undefined = process.env.KI_SPRACHAUSGABE_STROM): boolean {
  const w = roh?.trim().toLowerCase();
  if (w === "aus" || w === "off" || w === "false" || w === "0") return false;
  return sprachausgabeAnbieter() === "soniox";
}

/** Nur, was wie ein Stimmname oder eine Klon-ID aussieht - kein Freitext. */
function gueltigerStimmname(wert: string | undefined): string | null {
  const w = wert?.trim();
  return w && /^[A-Za-z0-9_-]{1,64}$/.test(w) ? w : null;
}

/** Die Soniox-Stimme fuer eine Sprache: SONIOX_TTS_STIMME_DE (_EN, _RU, _KK)
 *  vor SONIOX_TTS_STIMME vor Maya. Soniox beschreibt Maya selbst als
 *  bedaechtig ("measured delivery", GET /v1/tts-models, Stand 24.09.2026) -
 *  je Sprache laesst sich deshalb eine andere Stimme setzen, sobald ein
 *  Hoertest mit Muttersprachlern eine bessere gefunden hat. */
export function sonioxStimmeFuer(sprache: SprachausgabeSprache): string {
  return (
    gueltigerStimmname(process.env[`SONIOX_TTS_STIMME_${sprache.toUpperCase()}`]) ??
    gueltigerStimmname(process.env.SONIOX_TTS_STIMME) ??
    SONIOX_STIMME_STANDARD_JE_SPRACHE[sprache]
  );
}

/** Sprechtempo bei Soniox, wenn KI_SPRACHAUSGABE_TEMPO nichts sagt. Soniox
 *  erlaubt 0,7 bis 1,3 (speed, Standard 1,0). Am 24.09.2026 kam die
 *  Rueckmeldung, das deutsche Vorlesen sei sehr langsam; zusammen mit der
 *  bedaechtigen Standardstimme war 1,1 ein erster, vorsichtiger Schritt.
 *  Soniox raet, speed sparsam zu verwenden, weil es den Rhythmus einer
 *  Stimme glaettet - deshalb bleibt 1,1 die Voreinstellung fuer Sprachen
 *  ohne eigenen Messwert. */
export const SONIOX_TEMPO_STANDARD = 1.1;
export const SONIOX_TEMPO_MIN = 0.7;
export const SONIOX_TEMPO_MAX = 1.3;

/** Tempo je Sprache, wenn KI_SPRACHAUSGABE_TEMPO nichts anderes sagt. Aus
 *  derselben Messreihe vom 25.09.2026 wie SONIOX_STIMME_STANDARD_JE_SPRACHE:
 *  nur Deutsch lag mit 1,1 noch unter dem gemessenen Vorlesetempo, 1,2 (mit
 *  Lena) erreicht es. Englisch, Russisch und Kasachisch liegen bei 1,1
 *  bereits im oder ueber dem ueblichen Bereich der jeweiligen Sprache. */
export const SONIOX_TEMPO_STANDARD_JE_SPRACHE: Record<SprachausgabeSprache, number> = {
  de: 1.2,
  en: SONIOX_TEMPO_STANDARD,
  ru: SONIOX_TEMPO_STANDARD,
  kk: SONIOX_TEMPO_STANDARD,
};

/** Tempo je Sprache aus KI_SPRACHAUSGABE_TEMPO: entweder eine Zahl fuer alle
 *  ("1.1") oder je Sprache ("de:1.15,ru:1.05,en:1"). Sprachen ohne Angabe
 *  und unsinnige Werte bekommen die Voreinstellung dieser Sprache; Werte
 *  ausserhalb von 0,7 bis 1,3 werden begrenzt, weil Soniox sie sonst mit
 *  invalid_request ablehnt. */
export function sprechTempo(sprache: SprachausgabeSprache, roh: string | undefined = process.env.KI_SPRACHAUSGABE_TEMPO): number {
  const begrenzt = (n: number) => Math.round(Math.min(SONIOX_TEMPO_MAX, Math.max(SONIOX_TEMPO_MIN, n)) * 100) / 100;
  const voreinstellung = SONIOX_TEMPO_STANDARD_JE_SPRACHE[sprache];
  const text = roh?.trim();
  if (!text) return voreinstellung;
  const allein = Number(text.replace(",", "."));
  if (/^\d+(?:[.,]\d+)?$/.test(text) && Number.isFinite(allein)) return begrenzt(allein);
  // Getrennt an ";" und Leerraum, am Komma nur vor dem naechsten Sprachkuerzel -
  // "de:1,15;ru:1,05" ist deutsch geschrieben und gemeint.
  const normiert = text.replace(/\s*:\s*/g, ":");
  for (const teil of normiert.split(/[;\s]+|,(?=\s*[a-z]{2}\s*:)/i)) {
    const [schluessel, wert] = teil.split(":");
    if (schluessel?.trim().toLowerCase() !== sprache) continue;
    const n = Number(wert?.trim().replace(",", "."));
    if (Number.isFinite(n) && n > 0) return begrenzt(n);
  }
  return voreinstellung;
}

/** Soniox kuerzt die Pausen zwischen Woertern (reduce_silence), ausser
 *  KI_SPRACHAUSGABE_STILLE_KUERZEN steht auf "aus". Laut Soniox strafft das
 *  den Vortrag, ohne das Tempo der Woerter zu aendern (Standard dort: false). */
export function stilleKuerzen(roh: string | undefined = process.env.KI_SPRACHAUSGABE_STILLE_KUERZEN): boolean {
  const w = roh?.trim().toLowerCase();
  return !(w === "aus" || w === "off" || w === "false" || w === "0");
}

/** Die Stimmen fuer eine Sprache, in der Reihenfolge, in der sie versucht
 *  werden: erst der eingestellte Anbieter, dann Sokrates als Rueckfall.
 *  Leer, wenn es fuer die Sprache keine Stimme gibt. */
export function stimmenFuer(sprache: string): Stimme[] {
  if (!istSprachausgabeSprache(sprache)) return [];
  const rueckfall = STIMMEN[sprache];
  const liste: Stimme[] = [];
  if (sprachausgabeAnbieter() === "soniox") {
    liste.push({ anbieter: "soniox", stimme: sonioxStimmeFuer(sprache), sprache, tempo: sprechTempo(sprache), stilleKuerzen: stilleKuerzen() });
  }
  if (rueckfall) liste.push(rueckfall);
  return liste;
}

/** Stand der Textaufbereitung fuer die Stimme (textFuerSprachausgabe,
 *  sprechfassung). Steckt im Ablagepfad: wird die Aufbereitung besser,
 *  entsteht neues Audio, statt dass der Speicher das alte, schlechtere
 *  weiter ausliefert. Bei jeder Aenderung dort hochzaehlen.
 *
 *  3 (24.09.2026): Ueberschriften mit Doppelpunkt, Tabellen ohne Kopfzeile,
 *  Kennungen und Grossbuchstabenwoerter entschaerft, keine Zeilenumbrueche
 *  mehr an die Stimme, dazu Tempo und kuerzere Pausen bei Soniox. */
export const VORLESETEXT_VERSION = 3;

/** Ablageort des erzeugten Audios im Bucket "ki-sprachausgabe" (Migration
 *  20261101000000). Anbieter, Stimme, Sprache, Tempo und Textstand stecken im
 *  Dateinamen: nach jedem Wechsel entsteht ein neuer Pfad, altes Audio wird
 *  nicht mehr gefunden. Der Text selbst kann sich nicht aendern - eine
 *  Antwort ist unveraenderlich. */
export function sprachausgabePfad(nachrichtId: string, stimme: Stimme): string {
  const kennung = (wert: string) => wert.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const tempo = stimme.tempo !== undefined ? `-t${Math.round(stimme.tempo * 100)}` : "";
  return `${nachrichtId}/${kennung(stimme.anbieter)}-${kennung(stimme.stimme)}-${stimme.sprache}${tempo}-v${VORLESETEXT_VERSION}.mp3`;
}

export function istSprachausgabeSprache(wert: string | null | undefined): wert is SprachausgabeSprache {
  return (sprachausgabeSprachen as readonly string[]).includes(wert ?? "");
}

/** Die Stimme fuer eine Oberflaechensprache - oder null, wenn es fuer sie
 *  keine gibt. Die EINE Stelle, an der das entschieden wird: die Route
 *  (api/ki-sprachausgabe) und der Knopf im Chat fragen beide hier.
 *
 *  Bis zum 21.09.2026 wurde die Sprache stattdessen aus dem Antworttext
 *  erraten. Das fiel um, sobald die Frage diktiert war: ein falscher
 *  Sprachhinweis an die Spracherkennung liess die Antwort selbst in der
 *  falschen Sprache entstehen, und die Erkennung bestaetigte den Fehler
 *  anschliessend. Die Systemsprache ist eine Einstellung, die die Person
 *  selbst setzt - verlaesslicher als jede Erkennung. */
export function stimmeFuerOberflaeche(oberflaeche: string): Stimme | null {
  return stimmenFuer(oberflaeche)[0] ?? null;
}

// Obergrenze fuer eine vorgelesene Antwort. Piper braucht fuer ~200 Zeichen
// unter einer Sekunde (gemessen auf Caesar); die Grenze haelt die Dauer auch
// fuer lange Berichte unter Cloudflares 100-s-Grenze und begrenzt, was eine
// einzelne Anfrage an Rechenzeit ausloesen kann.
export const MAX_SPRACHAUSGABE_ZEICHEN = 3000;

// Pfeile werden zu einer Pause, Haken, Kreuze und Bildzeichen fallen weg -
// eine Stimme liest sonst "weisses schweres Haekchen" oder gar nichts und
// stockt.
const PFEILE = /[ \t]*[←-⇿⟵-⟿][ \t]*/g;
// U+2300-23FF (Uhren, Sanduhren: ⏰⏳⏱) fehlte bis zum 25.09.2026 - "⏰ Frist"
// wurde dadurch als "Neun Frist" gehoert (das Symbol landete beim Rueckhoeren
// als Ziffer neun im Text, gefunden an echten Antworten).
const ZEICHEN = /[☀-➿⬀-⯿\u{2300}-\u{23FF}\u{1F000}-\u{1FAFF}️‍]/gu;

// Deutsche Monatsnamen - "15. März" am Zeilenanfang ist ein Datum, keine
// Aufzaehlung, und "15." davor kein Satzende.
const MONATE = "Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember";

/** Eine Zeile ohne Satzzeichen am Ende (Listenpunkt, Tabellenzeile) bekommt
 *  einen Punkt - sonst liest die Stimme sie ohne Pause in die naechste Zeile
 *  hinein. */
function mitSatzzeichen(zeile: string): string {
  const t = zeile.trimEnd();
  return !t || /[.!?…:;,]$/.test(t) ? t : `${t}.`;
}

/** Trennzeile einer Markdown-Tabelle ("|---|:---:|"). */
const TRENNZEILE = /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/;

/** Beginnt die Zeile mit "|"? Nur dann ist sie fuer sich allein erkennbar eine
 *  Tabellenzeile. Striche im Fliesstext ("Offen | In Arbeit | Erledigt") sind
 *  eine Aufzaehlung (Pruefung vom 24.09.2026: dort wurde der erste Wert zu einer
 *  angekuendigten Ueberschrift). Tabellen ohne fuehrenden Strich erkennt
 *  tabellenZuSaetzen an ihrer Trennzeile. */
function istTabellenzeile(zeile: string): boolean {
  return /^[ \t]*\|/.test(zeile);
}

/** Tabellen als Saetze: die Kopfzeile faellt weg, jede Zeile wird "Erste
 *  Zelle: die anderen, durch Komma". Leere Zellen und reine Striche fallen
 *  weg. Bis zum 24.09.2026 las die Stimme die Kopfzeile als eigenen Satz
 *  ("Bereich, Status, Frist.") und jede Zelle mit Komma dahinter - bei einer
 *  Uebersicht mit zehn Zeilen eine Folge kurzer Saetze mit Pausen. */
function tabellenZuSaetzen(text: string): string {
  const zeilen = text.split("\n");
  // Zeilen eines Blocks mit Trennzeile sind Tabellenzeilen, auch ohne
  // fuehrenden Strich (Markdown erlaubt das): die Zeile davor ist der Kopf, die
  // Zeilen danach mit einem Strich sind Datenzeilen.
  const imBlock = new Set<number>();
  for (let t = 0; t < zeilen.length; t++) {
    if (!TRENNZEILE.test(zeilen[t]!)) continue;
    if (t > 0 && zeilen[t - 1]!.includes("|")) imBlock.add(t - 1);
    for (let d = t + 1; d < zeilen.length && zeilen[d]!.includes("|"); d++) imBlock.add(d);
  }
  const raus: string[] = [];
  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i]!;
    if (TRENNZEILE.test(zeile)) continue;
    if (!istTabellenzeile(zeile) && !imBlock.has(i)) {
      raus.push(zeile);
      continue;
    }
    // Die Zeile direkt vor der Trennzeile ist die Kopfzeile.
    if (i + 1 < zeilen.length && TRENNZEILE.test(zeilen[i + 1]!)) continue;
    const zellen = zeile
      .replace(/^[ \t]*\|/, "")
      .replace(/\|[ \t]*$/, "")
      .split("|")
      .map((z) => z.trim())
      .filter((z) => z && !/^[-–—]+$/.test(z));
    if (zellen.length === 0) continue;
    raus.push(zellen.length === 1 ? zellen[0]! : `${zellen[0]}: ${zellen.slice(1).join(", ")}`);
  }
  return raus.join("\n");
}

/** Abkuerzungen aus Grossbuchstaben, die buchstabiert werden sollen und
 *  deshalb gross bleiben - lateinisch und kyrillisch, so wie sie in dieser
 *  Anwendung vorkommen (ЕСУТД 61-mal, ХАССП 44-mal, ВОСМС 33-mal im Code,
 *  Pruefung vom 24.09.2026). Kuerzere als fuenf Buchstaben (MwSt, ЭСФ, НДС,
 *  GmbH) fasst die Regel ohnehin nicht an, Woerter ohne Vokal (МТСЗН) auch
 *  nicht - die sind immer Abkuerzungen. */
const AKRONYME = new Set(["HACCP", "ESUTD", "DSGVO", "UNECE", "IFRS", "ЕСУТД", "ЭСУТД", "ХАССП", "ВОСМС", "ЕГИСС", "МТСЗН"]);
const VOKAL = /[AEIOUYÄÖÜАЕЁИОУЫЭЮЯӘІӨҰҮ]/u;

/** Kennungen wie "CH-T-N-A-01-2609201616-40A7": mindestens fuenf Gruppen aus
 *  Grossbuchstaben und Ziffern, durch Bindestriche verbunden, mit Ziffern UND
 *  mit mindestens zwei Gruppen nur aus Buchstaben (istKennung). Telefonnummern
 *  (+7-701-234-56-78), Datumsangaben und IBANs haben keine solchen Gruppen und
 *  bleiben - bis zum 24.09.2026 verschluckte die Regel Telefonnummern ganz.
 *  Die Stimme liest sie Zeichen fuer Zeichen - in einer Zusammenfassung vom
 *  24.09.2026 standen drei davon, jede mehrere Sekunden lang. Im Chat
 *  bleiben sie sichtbar, vorgelesen werden sie nicht.
 *
 *  Seit dem 25.09.2026 mindestens fuenf statt vier Gruppen: ein kurzer
 *  Batch-Code wie "T-N-A-01" (vier Gruppen) traf die Regel mit, obwohl er
 *  gesprochen werden soll ("Eine zweite Charge (T-N-A-01) zeigt..." wurde
 *  zu "Eine zweite Charge () zeigt..." - gefunden an echten Antworten). */
const KENNUNG = /(?<![\p{L}\d-])[\p{Lu}\d]{1,10}(?:-[\p{Lu}\d]{1,16}){4,}(?![\p{L}\d-])/gu;
function istKennung(k: string): boolean {
  return /\d/.test(k) && k.split("-").filter((g) => /^\p{Lu}+$/u.test(g)).length >= 2;
}

/** Macht aus der Markdown-Antwort vorlesbaren Text: keine Sternchen,
 *  Rauten, Tabellenstriche, Link-Adressen, Belegmarken oder Bildzeichen, die
 *  sonst mitgesprochen wuerden. Kuerzt an einer Satzgrenze auf
 *  MAX_SPRACHAUSGABE_ZEICHEN.
 *
 *  Seit 24.09.2026 (VORLESETEXT_VERSION 2) zusaetzlich - gemessen an echten
 *  Antworten, die so an die Stimme gingen:
 *    - Belegmarken [S1][S3] fallen weg. Der Prompt setzt sie hinter jede
 *      Rechtsaussage; gesprochen wurden sie als "S eins S drei".
 *    - nackte Adressen fallen weg (sie wurden Zeichen fuer Zeichen gelesen),
 *    - nummerierte Listen verlieren ihre Nummer wie Spiegelstriche,
 *    - Zeilen ohne Satzzeichen bekommen eines (siehe mitSatzzeichen),
 *    - einzelne Sternchen fallen weg: ein Abschnitt kann mitten in einem
 *      Fettdruck beginnen oder enden,
 *    - Unterstriche in Kennungen bleiben ("ki_assistent" wurde "kiassistent").
 *
 *  Seit VORLESETEXT_VERSION 3: Ueberschriften enden mit Doppelpunkt, Tabellen
 *  ohne Kopfzeile (tabellenZuSaetzen), lange Kennungen fallen weg (KENNUNG),
 *  Grossbuchstabenwoerter ab fuenf Buchstaben werden normal geschrieben. */
export function textFuerSprachausgabe(markdown: string): string {
  // Sprechmarken ("[[a3]]", domain/sprechmarken.ts) werden nie gesprochen. Der
  // Zerleger zieht sie schon vorher heraus, hier nur als letzte Absicherung.
  const ohneMarken = ohneSprechmarken(markdown).replaceAll(MARKEN_PLATZHALTER, "");
  let text = tabellenZuSaetzen(ohneMarken.replace(/```[\s\S]*?```/g, " ")) // Codebloecke nicht vorlesen
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // Bilder
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // Links: nur der Text
    .replace(/[ \t]*\[S\d+(?:[ \t]*[,;][ \t]*S?\d+)*\]/g, "") // Belegmarken
    .replace(/https?:\/\/[^\s)\]]*[^\s)\].,;:!?]/g, "") // nackte Adressen (ohne den Satzpunkt dahinter)
    // Ueberschriften enden mit Doppelpunkt statt Punkt: sie leiten ein, was
    // folgt, und ein Punkt machte aus "Wichtigste Punkte" einen eigenen Satz
    // mit voller Satzpause davor und danach. Geprueft wird am KERN ohne
    // Markdown-Betonung ("**Was tun:**"): sonst haengt die Pruefung am
    // schliessenden "**" statt am Wort davor, haelt "können:**" faelschlich
    // fuer unfertig und haengt einen zweiten Doppelpunkt an ("können::",
    // gefunden an echten Antworten vom 25.09.2026).
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*?)[ \t]*$/gm, (_, titel: string) => {
      const kern = titel.replace(/[*_]+$/, "");
      return !kern || /[.!?…:;,]$/.test(kern) ? titel : `${titel}:`;
    })
    .replace(/^\s*>\s?/gm, "") // Zitate
    .replace(/^\s*[-*+]\s+/gm, "") // Aufzaehlungszeichen
    .replace(new RegExp(`^[ \\t]*\\d{1,2}[.)][ \\t]+(?!(?:${MONATE})\\b)(?=\\S)`, "gm"), "") // nummerierte Listen
    .replace(/[ \t]*\|[ \t]*/g, ", ") // ein verirrter Strich im Fliesstext
    .replace(KENNUNG, (kennung: string) => (istKennung(kennung) ? "" : kennung))
    .replace(/\([ \t]*\)/g, "") // leere Klammern, die eine entfernte Kennung hinterliess
    // Woerter ganz in Grossbuchstaben liest die Stimme laut oder buchstabiert
    // sie ("KRITISCH", "СРОЧНО"). Ab fuenf Buchstaben sind das Hervorhebungen,
    // keine Abkuerzungen - ausser denen in AKRONYME.
    .replace(/(?<![\p{L}\d])\p{Lu}{5,}(?![\p{L}\d])/gu, (wort: string) =>
      AKRONYME.has(wort) || !VOKAL.test(wort) ? wort : wort[0] + wort.slice(1).toLowerCase(),
    )
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, "$1") // *kursiv*
    // _kursiv_ nur als ganzes Wort - nie der Unterstrich in einer Kennung.
    .replace(/(^|[\s(])_(\S(?:[^_\n]*\S)?)_(?=[\s).,!?:;]|$)/gm, "$1$2")
    .replace(/\*+/g, "") // verwaiste Sternchen
    .replace(/~~(.*?)~~/g, "$1")
    .replace(PFEILE, ", ")
    .replace(ZEICHEN, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([.,!?;:])/g, "$1") // Leerzeichen, das eine entfernte Marke hinterliess
    .replace(/^[ \t]*,[ \t]*/gm, "") // Zeile, die mit einem Pfeil begann
    .replace(/^[ \t]+/gm, "") // Einrueckung (Tabellenzeilen)
    .replace(/\n{2,}/g, "\n")
    .trim();

  // Jede Zeile ausser der letzten endet mit einem Satzzeichen. Die letzte
  // nicht: im Zerleger ist sie womoeglich nur der Anfang eines Satzes.
  const zeilen = text.split("\n");
  text = zeilen
    .map((zeile, i) => {
      if (i === zeilen.length - 1) return zeile.trimEnd();
      // Eine Ankuendigung, auf die gleich die naechste folgt ("Gesperrte
      // Chargen:" vor "Naechste Schritte:", weil die Kennungen dazwischen
      // wegfielen), kuendigt nichts an: Punkt statt Doppelpunkt.
      const t = zeile.trimEnd();
      if (t.endsWith(":") && zeilen[i + 1]!.trimEnd().endsWith(":")) return `${t.slice(0, -1)}.`;
      return mitSatzzeichen(zeile);
    })
    .filter(Boolean)
    .join("\n");

  if (text.length > MAX_SPRACHAUSGABE_ZEICHEN) {
    const abgeschnitten = text.slice(0, MAX_SPRACHAUSGABE_ZEICHEN);
    const satzende = Math.max(abgeschnitten.lastIndexOf(". "), abgeschnitten.lastIndexOf("! "), abgeschnitten.lastIndexOf("? "), abgeschnitten.lastIndexOf("\n"));
    text = satzende > MAX_SPRACHAUSGABE_ZEICHEN / 2 ? abgeschnitten.slice(0, satzende + 1) : abgeschnitten;
  }
  return text;
}

const TENGE: Record<SprachausgabeSprache, string> = { de: "Tenge", en: "tenge", ru: "тенге", kk: "теңге" };
const ETWA: Record<SprachausgabeSprache, string> = { de: "etwa", en: "about", ru: "около", kk: "шамамен" };

/** Letzter Schritt vor der Stimme, wenn die Sprache feststeht: was keine
 *  Stimme zuverlaessig liest, wird zu Worten.
 *
 *    - ₸ und KZT werden "Tenge"/"тенге"/"теңге" - das Zeichen ist selten
 *      genug, dass Stimmen es auslassen. Beide Woerter sind im Russischen
 *      und Kasachischen unveraenderlich, eine Beugung nach der Zahl braucht
 *      es nicht.
 *    - Tausendertrennung: "1.150.000" (mindestens zwei Punktgruppen, also
 *      eindeutig) und "1 150 000" bzw. mit geschuetztem Leerzeichen werden
 *      zu "1150000". Sonst liest die Stimme "eins Punkt einhundertfuenfzig"
 *      oder drei einzelne Zahlen.
 *    - "≈ 5" und "~5" werden "etwa 5" (je Sprache).
 *    - Zeilenumbrueche werden Leerzeichen: jede Zeile endet hier schon mit
 *      einem Satzzeichen (textFuerSprachausgabe), und ein Umbruch zusaetzlich
 *      kann bei der Stimme eine Absatzpause ausloesen. Erst hier, nicht im
 *      Zerleger - der braucht die Zeilenenden als Grenze.
 *
 *  Zahlen selbst, Prozent und Einheiten bleiben der Stimme ueberlassen: im
 *  Russischen und Kasachischen richtet sich ihre Form nach dem Satz ("два
 *  процента", "пять процентов"), und eine Regel hier machte es schlechter. */
export function sprechfassung(text: string, sprache: SprachausgabeSprache): string {
  return text
    .replace(/(\d)(?:[   ]?)(?:₸|KZT\b)/g, `$1 ${TENGE[sprache]}`)
    .replace(/(?:₸|\bKZT\b)/g, TENGE[sprache])
    .replace(/\b\d{1,3}(?:\.\d{3}){2,}(?![.,]?\d)/g, (zahl) => zahl.replace(/\./g, ""))
    .replace(/(?<!\+[\d \t  ]*)\b\d{1,3}(?:[  ]\d{3})+(?!\d)(?![ \t]\d{2}\b)/g, (zahl) => zahl.replace(/[  ]/g, ""))
    .replace(/(?<!\+[\d \t  ]*)\b\d{1,3}(?: \d{3}){2,}(?!\d)(?! \d{2}\b)/g, (zahl) => zahl.replace(/ /g, ""))
    .replace(/(\d)[ \t]?~[ \t]?(?=\d)/g, "$1-") // "5~10" ist eine Spanne, kein "etwa"
    .replace(/(?<!\d)(?:≈|~)[ \t]?(?=\d)/g, `${ETWA[sprache]} `)
    .replace(/[ \t]*\n+[ \t]*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// --- Live-Sprachausgabe: Abschnitte schon waehrend des Schreibens ----------
//
// Bisher wurde erst vorgelesen, wenn die ganze Antwort dastand. Bei einer
// langen Antwort sind das viele Sekunden Stille, in denen nichts passiert.
//
// Der Zerleger bekommt den Stream stueckweise und gibt zurueck, was fertig
// gesprochen werden kann. Drei Dinge entscheiden, wann ein Abschnitt faellt:
//
//   1. Der ERSTE Abschnitt faellt frueh - beim ersten Komma oder nach rund
//      60 Zeichen. Er ist der teuerste: bis er klingt, ist es still.
//   2. Danach 1-2 Saetze bis rund 250 Zeichen. Laengere Abschnitte klingen
//      besser (die Stimme kennt die Satzmelodie), kuerzere kaemen frueher.
//   3. Was man nicht vorliest - Codebloecke, Tabellen, Links - faellt vorher
//      weg, auch wenn es ueber mehrere Stream-Stuecke verteilt ankommt.

/** Erster Abschnitt: so frueh wie moeglich, damit die Stille kurz bleibt. */
export const ERSTER_ABSCHNITT_ZEICHEN = 60;
/** Der zweite: kurz genug, dass er fertig ist, bevor der erste verklingt. */
export const ZWEITER_ABSCHNITT_ZEICHEN = 120;
/** Danach: so lang, dass die Satzmelodie stimmt. */
export const ABSCHNITT_ZEICHEN = 250;

/** Stil "saetze" (Strom, siehe erzeugeSatzZerleger): ab dem zweiten Abschnitt
 *  jeder Satz, sobald er fertig ist - nur ganz kurze werden zusammengefasst.
 *  Im Strom (Soniox-WebSocket, components/ki/sprachausgabe-strom.ts) gibt es
 *  keine Abschnittsgrenzen, die Stimme spricht durch; lange Abschnitte bringen
 *  dort nichts und halten nur Text zurueck. Und ein Strom, der zu lange
 *  keinen Text bekommt, wird von Soniox nach einigen Sekunden beendet. */
export const SATZ_ZIEL_ZEICHEN = 60;

/** "abschnitte": einzelne Anfragen je Abschnitt (Rueckfall, Sokrates) -
 *  lieber laengere Stuecke mit eigener Satzmelodie. "saetze": ein Strom je
 *  Antwort - jeder Satz sofort. */
export type ZerlegerStil = "abschnitte" | "saetze";

// Kein Satzende, obwohl da ein Punkt steht. Nur, was in diesen Antworten
// wirklich vorkommt - seit 24.09.2026 auch Russisch und Kasachisch: die
// Antworten zu Recht und Steuern zitieren "НК РК ст. 82", und bis dahin
// zerfiel "Итого 5 млн. тг., т. е. больше порога, см. п. 3 ст. 82 НК РК."
// in sieben Abschnitte, darunter "е." und "п." allein.
const ABKUERZUNGEN = [
  // Deutsch
  "z. b.", "z.b.", "d. h.", "d.h.", "u. a.", "u.a.", "o. ä.", "o.ä.", "u. u.", "u.u.",
  "bzw.", "ca.", "evtl.", "usw.", "inkl.", "exkl.", "max.", "min.", "ff.",
  "nr.", "abs.", "art.", "bspw.", "ggf.", "vgl.", "bzgl.", "mio.", "mrd.", "tsd.",
  "jan.", "feb.", "mär.", "apr.", "jun.", "jul.", "aug.", "sep.", "sept.", "okt.", "nov.", "dez.", "mar.", "oct.", "dec.",
  "std.", "st.", "tel.", "str.", "jh.", "gem.", "lt.", "zzgl.", "mwst.",
  // Englisch
  "dr.", "prof.", "hr.", "fr.", "mr.", "mrs.", "ms.", "etc.", "approx.", "e.g.", "i.e.", "vs.", "no.", "u.s.",
  // Russisch
  "т. е.", "т.е.", "т. д.", "т.д.", "т. п.", "т.п.", "т. к.", "т.к.", "т. н.", "т.н.", "и т. д.", "и др.",
  "ст.", "п.", "пп.", "ч.", "г.", "гг.", "млн.", "млрд.", "тыс.", "тг.", "руб.",
  "см.", "им.", "ул.", "д.", "др.", "пр.", "напр.", "прим.", "обл.", "р-н.",
  // Kasachisch
  "ж.", "т.б.", "т. б.", "т.с.с.", "б.з.д.", "бап.", "тарм.",
];

// Monatsnamen nach einer Ordnungszahl: "am 15. März" endet nicht nach "15.".
const MONAT_DANACH = new RegExp(`^(?:${MONATE}|Jan|Feb|Mär|Apr|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\\b`);

/** Steht an dieser Stelle wirklich ein Satzende?
 *
 *  `amEnde`: der Text ist vollstaendig. Waehrend des Streamens weiss man bei
 *  einem Punkt am Pufferende noch nicht, was folgt - "15. " kann ein
 *  Satzende sein oder "15. März". Dann wird auf das naechste Wort gewartet;
 *  das kostet ein Wort Verzoegerung und spart einen Bruch mitten im Satz. */
function istSatzende(text: string, i: number, amEnde = false): boolean {
  const zeichen = text[i];
  if (!".!?…".includes(zeichen)) return false;

  // "3,5" und "3.5": eine Zahl, kein Satz.
  if (zeichen === "." && /\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "")) return false;

  // Listennummer am Zeilenanfang ("2. **Kontaktieren Sie...**"): kein
  // Satzende, gleich was danach folgt. Die Regel weiter unten erkennt nur
  // Kleinschreibung danach als Fortsetzung ("3. und 4." bleibt zusammen) -
  // folgte auf die Nummer stattdessen ein Grossbuchstabe oder Fettschrift,
  // galt der Punkt faelschlich als Satzende, und die Nummer blieb als
  // eigener "Satz" uebrig ("2." wurde "zwei." gesprochen, gefunden an echten
  // Antworten vom 25.09.2026). Die Nummer selbst entfernt erst
  // textFuerSprachausgabe (nummerierte Listen), das braucht die ganze Zeile
  // im selben Abschnitt - hier wird nur verhindert, dass genau davor
  // abgeschnitten wird.
  if (zeichen === "." && /(?:^|\n)[ \t]*\d{1,2}$/.test(text.slice(0, i))) return false;

  // Danach muss Platz sein - mitten im Wort endet kein Satz. Sternchen und
  // Unterstrich zaehlen als Platz: das Fazit jeder Antwort steht in
  // Fettschrift ("**... erreicht.**"), und bis zum 24.09.2026 verdeckte das
  // "**" hinter dem Punkt ausgerechnet das erste Satzende.
  // Eine Sprechmarke (Platzhalter) direkt hinter dem Punkt zaehlt wie Leerraum:
  // "Satz.[[a3]]Naechster" endet am Punkt, die Marke gehoert zum naechsten Satz.
  const danach = text.slice(i + 1);
  if (danach && !/^[\s"'»«“”)\]*_\uE000]/.test(danach)) return false;

  // Was kommt als naechstes Wort? Nichts in Sicht: warten.
  const naechstes = /^[\s"'»«“”)\]*_\uE000]*([^\s\uE000])/u.exec(danach);
  if (!naechstes) return amEnde;
  const rest = danach.slice(naechstes.index + naechstes[0].length - 1);

  // Mehrteilige Abkuerzung: ein einzelner Kleinbuchstabe mit Punkt, dahinter
  // ein Buchstabe mit Punkt ("z. B.", "u. U.", "i. d. R.", "z. T."). Die Liste
  // unten greift erst am LETZTEN Punkt; am ersten galt der Grossbuchstabe
  // danach als Satzanfang, und die Stimme sagte "zet" [neue Anfrage] "Be. mit
  // einem Nachtrag" (Simulation vom 24.09.2026). Steht der Buchstabe noch
  // allein am Pufferende, entscheidet erst der naechste Punkt: warten.
  if (zeichen === "." && /(?:^|[^\p{L}])\p{Ll}$/u.test(text.slice(0, i))) {
    if (/^\s*\p{L}\./u.test(danach)) return false;
    if (/^\s*\p{L}$/u.test(danach)) return amEnde;
  }

  if (zeichen === ".") {
    // Ein Satz beginnt nicht klein. "3. und 4." oder "15. des Monats" sind
    // Ordnungszahlen, "z. b. hier" eine Abkuerzung - in allen vier Sprachen.
    if (/\p{Ll}/u.test(naechstes[1])) return false;
    // "15. März": Ordnungszahl vor einem Monat.
    if (/\d/.test(text[i - 1] ?? "") && MONAT_DANACH.test(rest)) return false;
  }

  // Abkuerzung davor? "z. B." endet nicht, obwohl zweimal ein Punkt steht.
  //
  // Die Abkuerzung muss ein eigenes Wort sein. Ohne diese Pruefung verschluckt
  // ein kurzer Eintrag die halbe Sprache: "s." (fuer "siehe") passt sonst auf
  // JEDES Wort, das auf s endet - "lückenlos." waere dann kein Satzende mehr.
  const davor = text.slice(0, i + 1).toLowerCase();
  const istAbkuerzung = ABKUERZUNGEN.some((a) => {
    if (!davor.endsWith(a)) return false;
    const vorZeichen = davor[davor.length - a.length - 1];
    return vorZeichen === undefined || !/\p{L}/u.test(vorZeichen);
  });
  if (istAbkuerzung) return false;

  // Ein einzelner Buchstabe mit Punkt ist eine Initiale ("A. Serikbaj",
  // "А. Серикбай").
  if (zeichen === "." && /(^|[\s*_(])\p{Lu}$/u.test(text.slice(0, i))) return false;

  return true;
}

/** Ein Zeilenende nach einer nicht leeren Zeile ist eine Grenze wie ein
 *  Satzende: Ueberschriften, Listenpunkte und Tabellenzeilen haben oft kein
 *  Satzzeichen, und textFuerSprachausgabe gibt ihnen eines. */
function istZeilenende(text: string, i: number): boolean {
  if (text[i] !== "\n") return false;
  const zeilenAnfang = text.lastIndexOf("\n", i - 1) + 1;
  const zeile = text.slice(zeilenAnfang, i);
  if (!/[^\s*_#>|-]/.test(zeile) || TRENNZEILE.test(zeile)) return false;
  // Eine Tabellenzeile ist erst eine Grenze, wenn die naechste Zeile ganz da
  // und keine Trennzeile ist: sonst koennte die Kopfzeile allein als Abschnitt
  // hinausgehen, bevor feststeht, dass sie eine ist (tabellenZuSaetzen laesst
  // sie weg - aber nur, wenn sie ihre Trennzeile im selben Stueck sieht).
  if (istTabellenzeile(zeile)) {
    const naechstesEnde = text.indexOf("\n", i + 1);
    const naechste = text.slice(i + 1, naechstesEnde < 0 ? text.length : naechstesEnde);
    // Noch unvollstaendig und koennte eine Trennzeile werden: warten.
    if (naechstesEnde < 0 && !/[^\s|:-]/.test(naechste)) return false;
    if (TRENNZEILE.test(naechste)) return false;
  }
  return true;
}

/** Unsichtbare Marke vor einem Abschnitt, der NICHT an einem Zeilenanfang
 *  beginnt: die Regeln fuer Zeilenanfaenge (Listennummer, Ueberschrift,
 *  Aufzaehlungszeichen, Zitat) greifen dann nicht auf seine erste Zeile. Bis
 *  zum 24.09.2026 verlor "Umsatz war gut. 3. Quartal: stabil." im Strom die "3."
 *  - der Abschnitt "3. Quartal: stabil." sah aus wie ein Listenpunkt. */
const KEIN_ZEILENANFANG = "\u2063";

export interface Abschnitt {
  /** Fortlaufend ab 1, je Zug. Die Reihenfolge haengt daran. */
  nr: number;
  text: string;
  /** Sprechmarken dieses Abschnitts (domain/sprechmarken.ts): die Stelle der
   *  Seite, die gezeigt wird, sobald die Stimme ihn erreicht. */
  ziele?: SprechZiel[];
}

export interface SatzZerleger {
  /** Naechstes Stueck aus dem Stream. Gibt zurueck, was jetzt sprechbar ist.
   *  `ziele`: die Ziele der Marken-Platzhalter in diesem Stueck, der Reihe nach
   *  (erzeugeMarkenFilter in domain/sprechmarken.ts). */
  fuettere(stueck: string, ziele?: readonly SprechZiel[]): Abschnitt[];
  /** Ende eines Textteils (text-end im Stream: danach ruft das Modell ein
   *  Werkzeug oder hoert auf). Der Teil ist vollstaendig, also geht auch sein
   *  Rest hinaus. Bis zum 24.09.2026 wartete der Rest auf die Zielmarke des
   *  naechsten Abschnitts - waehrend der Werkzeuge blieb ein fertiger Satz
   *  stumm liegen, und die Ueberschrift des naechsten Teils hing am vorigen. */
  schrittEnde(): Abschnitt[];
  /** Ende der Antwort: gibt den Rest heraus. */
  abschliessen(): Abschnitt[];
}

/**
 * Zerlegt eine Antwort waehrend des Schreibens in sprechbare Abschnitte.
 *
 * Der Zustand ist absichtlich in einer Closure und nicht in einem Modul:
 * zwei Antworten duerfen sich nicht ins Gehege kommen.
 */
export function erzeugeSatzZerleger(stil: ZerlegerStil = "abschnitte"): SatzZerleger {
  let puffer = "";
  let inCodeblock = false;
  let nr = 0;
  let gesamtZeichen = 0;
  let ersterRaus = false;
  let fertig = false;
  // Beginnt der Puffer an einem Zeilenanfang? (Am Anfang der Antwort ja.)
  let amZeilenanfang = true;
  // Ziele der Platzhalter im Puffer, in ihrer Reihenfolge; und Ziele eines
  // Abschnitts ohne sprechbaren Text, die an den naechsten weitergehen.
  const warteZiele: SprechZiel[] = [];
  let uebertrag: SprechZiel[] = [];

  /** Vom Puffer abschneiden und als Abschnitt herausgeben. `amEnde`: der
   *  Rest der fertigen Antwort. */
  function schneide(bis: number, amEnde = false): Abschnitt | null {
    const mitMarken = puffer.slice(0, bis);
    puffer = puffer.slice(bis);
    const anzahlMarken = mitMarken.split(MARKEN_PLATZHALTER).length - 1;
    const ziele = [...uebertrag, ...warteZiele.splice(0, anzahlMarken)];
    uebertrag = [];
    const roh = anzahlMarken > 0 ? mitMarken.replaceAll(MARKEN_PLATZHALTER, "") : mitMarken;
    const mitZielen = (a: Abschnitt): Abschnitt => (ziele.length > 0 ? { ...a, ziele } : a);
    // Ein neues Stueck, das mit einem Zeilenumbruch beginnt, faengt selbst
    // dann eine Zeile von vorn an, wenn der VORIGE Schnitt (z. B. der Rest vor
    // einem Werkzeugschritt, schrittEnde()) mitten in einer Zeile endete -
    // sonst griffen Ueberschriften-, Listen- und Aufzaehlungsregeln nach
    // einem Werkzeug nicht mehr, obwohl die Antwort dort sichtbar neu beginnt
    // (gefunden an echten Antworten vom 25.09.2026).
    const beginntZeile = amZeilenanfang || /^[ \t]*\n/.test(roh);
    amZeilenanfang = /\n[ \t]*$/.test(roh);
    let text = (beginntZeile ? textFuerSprachausgabe(roh) : textFuerSprachausgabe(KEIN_ZEILENANFANG + roh))
      .replaceAll(KEIN_ZEILENANFANG, "")
      // Rest eines Satzzeichens, das der vorige Schnitt vor sich abgetrennt
      // hat: faellt der Schnitt genau vor einem Punkt, der hinter einem in
      // diesem Stueck verwaisten "**" steht (die Fettschrift wurde im vorigen
      // Abschnitt begonnen), bleibt hier ein bedeutungsloser Punkt allein auf
      // seiner Zeile stehen und wurde als eigener Satz gesprochen (". Wo Sie
      // stehen:", gefunden an echten Antworten vom 25.09.2026). Ein Abschnitt
      // beginnt nie sinnvoll mit blossem Satzzeichen, das kann nur ein
      // solcher Rest sein.
      .replace(/^[.!?…,:;]+[ \t]*/, "")
      .trim();
    if (!text) {
      // Nichts zu sprechen (nur eine Marke, etwa vor einem Werkzeugaufruf): das
      // Ziel gehoert zum naechsten Satz.
      uebertrag = ziele;
      return null;
    }
    // Endet der Abschnitt an einem Zeilenende oder am Ende der Antwort, ist
    // seine letzte Zeile vollstaendig und bekommt ein Satzzeichen wie alle
    // anderen (textFuerSprachausgabe laesst die letzte Zeile offen, weil sie
    // im Stream sonst nur ein Satzanfang sein kann). Ohne Punkt liest die
    // Stimme das letzte Wort wie mitten im Satz und bricht dort ab - bei einem
    // Listenpunkt oder einem Vorab-Satz ohne Punkt klang das abgehackt.
    if (amEnde || /\n[ \t]*$/.test(roh)) text = mitSatzzeichen(text);
    // Am Ende der Antwort kuendigt nichts mehr etwas an ("Quellen:", wenn die
    // Adressen darunter wegfallen): Punkt statt Doppelpunkt.
    if (amEnde && text.endsWith(":")) text = `${text.slice(0, -1)}.`;
    if (gesamtZeichen + text.length > MAX_SPRACHAUSGABE_ZEICHEN) {
      fertig = true;
      const rest = MAX_SPRACHAUSGABE_ZEICHEN - gesamtZeichen;
      if (rest < 20) return null;
      gesamtZeichen = MAX_SPRACHAUSGABE_ZEICHEN;
      // Am letzten ECHTEN Satzende vor der Grenze (istSatzende: nicht an
      // "Abs." oder "п."). Gibt es keins, faellt der Rest weg - der vorige
      // Abschnitt endete an einem Satzende. Bis zum 24.09.2026 endete eine
      // lange Zusammenfassung mitten im Wort ("Letzte Schwelle").
      const teil = text.slice(0, rest);
      for (let i = teil.length - 1; i >= 20; i--) {
        if (teil[i] === "\n" || istSatzende(teil, i, true)) return mitZielen({ nr: ++nr, text: teil.slice(0, i + 1).trim() });
      }
      return null;
    }
    gesamtZeichen += text.length;
    ersterRaus = true;
    return mitZielen({ nr: ++nr, text });
  }

  /** Ein Notschnitt (Komma, Wortende) darf nie mitten in einer Tabellenzeile
   *  liegen: dann am Anfang dieser Zeile schneiden, oder warten. Sonst ging
   *  die Kopfzeile ohne ihre Trennzeile hinaus und wurde als Datenzeile
   *  gelesen, und Betraege in einer Zelle zerrissen ("230" ... "000 Tenge"). */
  function ohneTabellenschnitt(schnitt: number): number {
    const anfang = puffer.lastIndexOf("\n", schnitt - 1) + 1;
    const ende = puffer.indexOf("\n", anfang);
    if (!istTabellenzeile(puffer.slice(anfang, ende < 0 ? puffer.length : ende))) return schnitt;
    return anfang >= 12 ? anfang : -1;
  }

  /** Wie ohneTabellenschnitt, zusaetzlich: nie mitten in einem Markdown-Link
   *  ("[Text](url)") oder einer offenen Fettschrift ("**...") schneiden -
   *  sonst zaehlt die Adresse oder das Sternchenpaar zur Rohlaenge des
   *  Abschnitts, obwohl davon nichts gesprochen wird, und der Notschnitt
   *  faellt viel zu frueh, mitten in den eigentlichen Satz (gefunden an
   *  echten Antworten vom 25.09.2026, vor allem bei Compliance-Verweisen mit
   *  Link). Wie beim Tabellenschnitt: lieber an den Link-/Fettschriftanfang
   *  zurueck oder -1 (warten), als mittendrin abzuschneiden. */
  function ohneNotschnitt(schnitt: number): number {
    const glatt = ohneTabellenschnitt(schnitt);
    if (glatt < 0) return -1;
    const vor = puffer.slice(0, glatt);
    const linkStart = vor.lastIndexOf("[");
    if (linkStart >= 0 && !/^\[[^\]]*\]\([^)]*\)/.test(puffer.slice(linkStart))) {
      return linkStart >= 12 ? linkStart : -1;
    }
    const zeilenAnfang = vor.lastIndexOf("\n") + 1;
    const sterne = (vor.slice(zeilenAnfang).match(/\*\*/g) ?? []).length;
    if (sterne % 2 === 1) {
      const sternStart = vor.lastIndexOf("**");
      return sternStart >= 12 ? sternStart : -1;
    }
    return glatt;
  }

  /** Wo endet der naechste Abschnitt im Puffer - oder -1, wenn noch keiner. */
  function naechsteGrenze(): number {
    const grenzeBei = (i: number) => istSatzende(puffer, i) || istZeilenende(puffer, i);

    // Eine Sprechmarke ist immer eine Satzgrenze: steht vor ihr ein ganzer
    // Satz, geht er jetzt hinaus, auch wenn er kurz ist. Sonst klebte er mit dem
    // markierten Satz zusammen, und der Rahmen wechselte schon einen Satz zu frueh.
    // Jede Marke zaehlt, nicht nur die erste: eine Marke am Pufferanfang
    // gehoert zum laufenden Satz, erst die naechste trennt.
    let letzte = -1;
    for (let i = 0, marke = puffer.indexOf(MARKEN_PLATZHALTER); marke >= 0; marke = puffer.indexOf(MARKEN_PLATZHALTER, marke + 1)) {
      for (; i < marke; i++) if (grenzeBei(i)) letzte = i + 1;
      if (letzte > 0 && puffer.slice(0, letzte).replaceAll(MARKEN_PLATZHALTER, "").trim()) return letzte;
    }

    // Der ERSTE Abschnitt hat eine andere Aufgabe als alle weiteren: er soll
    // so frueh wie moeglich klingen - aber als ganzer Satz. Bis zum
    // 24.09.2026 fiel er am ersten Komma, und genau der erste Eindruck
    // bekam einen Bruch in der Satzmelodie. Ein Komma zaehlt nur noch, wenn
    // der erste Satz lang wird.
    if (!ersterRaus) {
      for (let i = 0; i < puffer.length; i++) {
        if (grenzeBei(i)) return i + 1;
      }
      if (puffer.length > ERSTER_ABSCHNITT_ZEICHEN * 1.5) {
        // Das letzte Komma, das eine Sprechpause ist - nicht das Komma in
        // "3,5". Dort mittendrin zu trennen ergaebe "drei" ... "fünf Grad".
        for (let i = puffer.length - 1; i >= 12; i--) {
          if (puffer[i] !== ",") continue;
          if (/[0-9]/.test(puffer[i - 1] ?? "") && /[0-9]/.test(puffer[i + 1] ?? "")) continue;
          return ohneNotschnitt(i + 1);
        }
        // Weder Komma noch Punkt in Sicht: am letzten Wortende trennen,
        // statt weiter stumm zu warten.
        const platz = puffer.lastIndexOf(" ", Math.floor(ERSTER_ABSCHNITT_ZEICHEN * 1.5));
        if (platz >= 12) return ohneNotschnitt(platz + 1);
      }
      return -1;
    }

    // Danach zaehlt der Klang: ganze Saetze, bis die Zielmarke erreicht ist.
    // Der zweite Abschnitt ist kuerzer, damit er fertig ist, bevor der erste
    // verklungen ist; ab dem dritten reicht der Vorsprung fuer lange.
    //
    // Bis zum 24.09.2026 kam hier jeder Satz einzeln heraus, sobald er fertig
    // war - der Stream liefert Wort fuer Wort, und die Zielmarke wurde nie
    // erreicht. Jeder Satz war eine eigene Anfrage mit eigener Satzmelodie
    // und eigener Pause: abgehackt.
    const ziel = stil === "saetze" ? SATZ_ZIEL_ZEICHEN : nr <= 1 ? ZWEITER_ABSCHNITT_ZEICHEN : ABSCHNITT_ZEICHEN;
    for (let i = 0; i < puffer.length; i++) {
      if (i + 1 >= ziel && grenzeBei(i)) return i + 1;
    }

    // Kein Satzende, aber viel zu lang: am letzten Satzende davor, sonst am
    // letzten Leerzeichen trennen, damit kein Wort zerrissen wird.
    if (puffer.length > ziel * 2) {
      let letztes = -1;
      for (let i = 0; i < ziel * 2; i++) if (grenzeBei(i)) letztes = i + 1;
      if (letztes > 0) return letztes;
      const platz = puffer.lastIndexOf(" ", ziel * 2);
      if (platz > ziel) return ohneNotschnitt(platz + 1);
    }
    return -1;
  }

  function ernte(): Abschnitt[] {
    const raus: Abschnitt[] = [];
    for (;;) {
      if (fertig) return raus;
      const grenze = naechsteGrenze();
      if (grenze <= 0) return raus;
      const a = schneide(grenze);
      if (a) raus.push(a);
    }
  }

  return {
    fuettere(stueck: string, ziele: readonly SprechZiel[] = []): Abschnitt[] {
      if (fertig || !stueck) return [];
      warteZiele.push(...ziele);
      // Codebloecke ueber Stueckgrenzen hinweg: die Zaehlung der ``` muss
      // den ganzen Strom sehen, nicht nur das aktuelle Stueck.
      for (const teil of stueck.split(/(```)/)) {
        if (teil === "```") { inCodeblock = !inCodeblock; continue; }
        if (!inCodeblock) puffer += teil;
        else if (teil.includes(MARKEN_PLATZHALTER)) {
          // Codebloecke werden nicht gesprochen: ihre Marken fallen mit weg,
          // sonst verrutschte jedes spaetere Ziel um einen Satz.
          const imPuffer = puffer.split(MARKEN_PLATZHALTER).length - 1;
          warteZiele.splice(imPuffer, teil.split(MARKEN_PLATZHALTER).length - 1);
        }
      }
      return ernte();
    },
    schrittEnde(): Abschnitt[] {
      if (fertig) return [];
      const raus = ernte();
      if (fertig) return raus;
      // Eine Marke ganz am Ende des Textteils ("Ich oeffne den Bericht. [[a2]]",
      // danach ein Werkzeug) gehoert zum Satz NACH dem Werkzeug, nicht zu diesem.
      const nachlauf = /\uE000[\s\uE000]*$/.exec(puffer);
      if (nachlauf && puffer.slice(0, nachlauf.index).trim()) {
        const vorher = schneide(nachlauf.index, true);
        if (vorher) raus.push(vorher);
      }
      const rest = schneide(puffer.length, true);
      if (rest) raus.push(rest);
      return raus;
    },
    abschliessen(): Abschnitt[] {
      if (fertig) return [];
      const raus = ernte();
      const rest = schneide(puffer.length, true);
      if (rest) raus.push(rest);
      return raus;
    },
  };
}

/** Eine FERTIGE Antwort in Saetze fuer den Strom - fuer den Vorlese-Knopf an
 *  einer Nachricht. Derselbe Zerleger wie waehrend des Schreibens, nur auf
 *  einmal gefuettert: dieselbe Aufbereitung, dieselbe Grenze von
 *  MAX_SPRACHAUSGABE_ZEICHEN, dieselben Satzgrenzen. */
export function saetzeAusAntwort(markdown: string): string[] {
  const zerleger = erzeugeSatzZerleger("saetze");
  return [...zerleger.fuettere(markdown), ...zerleger.abschliessen()].map((a) => a.text);
}
