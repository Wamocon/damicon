// Spracherkennung an der Schrift und an unterscheidenden Woertern - rein, ohne
// Node-Importe, damit sie auch im Browser laeuft.
//
// Bis zum 28.09.2026 stand sie in lib/wissen/chunker.ts, der fuer stabileId()
// node:crypto importiert. Der Vorlese-Knopf im Browser brauchte sie aber, um die
// Stimme an die Sprache des Textes zu binden: bei Oberflaeche Deutsch las die
// deutsche Stimme einen russischen Text "mit viel Akzent" vor (Rueckmeldung vom
// 28.09.2026). chunker.ts reicht die drei alten Funktionen weiter, bestehende
// Importe gelten unveraendert.

export type ErkannteSprache = "ru" | "kk" | "de" | "en";

const KYRILLISCH = /[Ѐ-ӿ]/g;
const LATEINISCH = /[A-Za-zÀ-ÿ]/g;
const KASACHISCH = /[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/g;
// Ohne /g: test() merkt sich sonst die letzte Stelle (lastIndex).
const HAT_KASACHISCH = /[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/;
const KYRILLISCHES_WORT = /[Ѐ-ӿ]+/g;

/** Wie viele kyrillische und lateinische Buchstaben der Text hat. Ziffern,
 *  Satzzeichen und Symbole zaehlen nicht. */
export function zaehleSchrift(text: string): { kyrillisch: number; lateinisch: number } {
  return {
    kyrillisch: (text.match(KYRILLISCH) ?? []).length,
    lateinisch: (text.match(LATEINISCH) ?? []).length,
  };
}

/** So viel Text wird hoechstens angesehen - fuer die Sprache reicht der Anfang,
 *  und ein langes Dokument kostet sonst bei jedem Aufruf die volle Laenge. */
const PROBE_ZEICHEN = 4000;

/** So viele Woerter muessen fuer Kasachisch sprechen (Belegwoerter, siehe unten) ... */
export const KASACHISCH_MINDEST_WOERTER = 2;
/** ... und so viel aller kyrillischen Woerter muessen es sein (ein langer russischer
 *  Text mit zwei kasachischen Woertern bleibt russisch). */
export const KASACHISCH_MINDEST_ANTEIL = 0.1;
/** Bis zu so vielen Woertern reicht EIN Belegwort ohne russischen Gegenbeleg ("Ауа райы
 *  қандай?", "Клиент шағымданды."). */
export const KASACHISCH_KURZ_WOERTER = 4;

// Belegwoerter statt Buchstaben (29.09.2026). Die Regel "Sonderbuchstaben in zwei Woertern und
// 3 Prozent der Buchstaben" beantwortete kurze kasachische Fragen ohne Verlauf russisch: in
// "Бүгін не бар?", "Шағымдар туралы айтшы.", "Не істеу керек?" oder "Рахмет, жарайды." hat
// hoechstens ein Wort Sonderbuchstaben. Die alte 1-%-Regel hatte sie richtig, dafuer einen
// russischen Satz mit Ortsnamen ("... в Қостанай ...") falsch.
//
// Seit der Gegenpruefung vom 29.09.2026 zaehlt auch die Gegenseite: 10 von 36 kurzen kasachischen
// Saetzen ("Ауа райы қандай?", "Машина келе жатыр.") gingen noch russisch hinaus, und russische
// Saetze mit Namen am Satzanfang ("Отчёт готов. Нұрлан проверит. Әсел подпишет.") oder mit "бар"
// als Druckeinheit wurden kasachisch. Jetzt:
//  - Belegwort: ein Wort mit Sonderbuchstaben, das kein Name ist (grossgeschrieben mitten im Satz,
//    oder ein bekannter Ortsname auch mit Endung), oder ein haeufiges kasachisches Wort ohne sie.
//    Jedes Wort zaehlt einmal ("2 бар ... 3 бар" ist ein Beleg, nicht zwei).
//  - Gegenbeleg: ein Wort, das es nur im Russischen gibt (Praepositionen, Fragewoerter,
//    Pronomen), ein Wort mit "ё", "ъ" oder "ь", oder eine russische Endung ("-ться", "-ого").
//  - Kasachisch: mindestens ein KLEINgeschriebenes Belegwort (ein Name am Satzanfang allein
//    beweist nichts), mehr Belege als Gegenbelege, und zwei Belege oder ein kurzer Satz.
const KASACHISCHE_WOERTER = new Set([
  "бар", "керек", "мен", "сен", "осы", "мына", "ма", "ме", "ба", "бе", "па", "пе",
  "келе", "бола", "жаман", "ауа", "райы", "жап",
  // Haeufige Woerter, wie sie ohne kasachische Tastatur getippt werden (қ -> к, ү -> у, і -> и).
  "кайда", "канша", "кашан", "кандай", "жаксы", "бугин", "бугін", "ертен", "корсет", "келди",
]);
/** Kasachische Wortstaemme ohne Sonderbuchstaben, auch mit Endung ("тапсырмаларды"). */
const KASACHISCHE_STAEMME = [
  "тапсырма", "жоспар", "жидек", "тексер", "жаса", "туралы", "рахмет", "жарайды", "бойынша", "айтшы",
  "жатыр", "болады", "болды", "сапа", "жина", "жумыс",
];
/** Kasachische Orts- und Landesnamen (Wortanfang, damit auch "Қостанайда" zaehlt). Nicht
 *  "Есік" und "Іле": "есік" ist auch die Tuer ("Есікті жап."). */
const KASACHISCHE_NAMEN = [
  "қазақстан", "қостанай", "қарағанды", "өскемен", "қызылорда", "ақтөбе", "ақтау", "қарасай", "талдықорған",
  "түркістан", "көкшетау", "жезқазған", "екібастұз", "қаскелең", "талғар", "ұлытау",
];
/** Woerter, die es nur im Russischen gibt. Nicht "не" und "да": beides ist auch kasachisch. */
const RUSSISCHE_WOERTER = new Set([
  "в", "во", "на", "по", "с", "со", "к", "ко", "у", "о", "об", "от", "до", "из", "за", "для", "при", "про", "без", "через",
  "и", "или", "но", "а", "что", "чтобы", "как", "где", "когда", "кто", "почему", "зачем", "сколько", "какой", "какая", "какое", "какие",
  "это", "этот", "эта", "эти", "тот", "та", "те", "уже", "тоже", "ещё", "еще", "очень", "можно", "нужно", "надо", "есть", "нет",
  "я", "ты", "он", "она", "оно", "мы", "вы", "они", "мне", "меня", "нас", "вас", "его", "её", "ее", "их", "ему", "им",
  "сегодня", "вчера", "завтра", "сейчас", "пожалуйста", "спасибо", "был", "была", "было", "были", "будет",
  "позвони", "покажи", "скажи", "открой", "проверь", "создай", "добавь", "напиши", "отправь", "найди", "сделай", "дай", "расскажи",
]);
const RUSSISCHE_BUCHSTABEN = /[ёъь]/i;
const RUSSISCHE_ENDUNG = /(ться|ть|ого|его|ому|ему|ами|ями|ешь|ишь|ется|ится|ются|ятся|ается|яет|ает|ует|ила|или|ил)$/;

function amSatzanfang(text: string, stelle: number): boolean {
  if (stelle === 0) return true;
  // Auch nach einem Aufzaehlungszeichen ("- ", "1. ", "• ").
  return /(^|[.!?…:;]\s*|\n[\s\-–•*\d.)]*)$/.test(text.slice(Math.max(0, stelle - 8), stelle));
}

function istName(wort: string, grossMittenImSatz: boolean): boolean {
  const klein = wort.toLowerCase();
  if (KASACHISCHE_NAMEN.some((name) => klein.startsWith(name))) return true;
  return grossMittenImSatz;
}

function istKasachischesWort(klein: string): boolean {
  return KASACHISCHE_WOERTER.has(klein) || KASACHISCHE_STAEMME.some((stamm) => klein.startsWith(stamm));
}

function istRussischesWort(klein: string): boolean {
  return RUSSISCHE_WOERTER.has(klein) || RUSSISCHE_BUCHSTABEN.test(klein) || (klein.length >= 4 && RUSSISCHE_ENDUNG.test(klein));
}

type KasachischMerkmale = {
  /** Kasachische Sonderbuchstaben insgesamt. */
  buchstaben: number;
  /** Verschiedene Belegwoerter ... */
  belege: number;
  /** ... davon kleingeschrieben (kein Name, kein Satzanfang). */
  kleineBelege: number;
  /** Verschiedene russische Gegenbelege. */
  russisch: number;
  woerter: number;
};

/** Ein lateinisches "i" mitten in kyrillischen Woertern ist ein getipptes kasachisches "і"
 *  ("Бiз келдiк"); sonst zerfaellt das Wort an ihm. */
const LATEINISCHES_I_IM_WORT = /(?<=[Ѐ-ӿ])[iI]|[iI](?=[Ѐ-ӿ])/g;

function kasachischeMerkmale(roh: string): KasachischMerkmale {
  const text = roh.replace(LATEINISCHES_I_IM_WORT, (i) => (i === "i" ? "і" : "І"));
  const belege = new Set<string>();
  const kleineBelege = new Set<string>();
  const russisch = new Set<string>();
  let woerter = 0;
  for (const treffer of text.matchAll(KYRILLISCHES_WORT)) {
    const wort = treffer[0];
    const klein = wort.toLowerCase();
    woerter += 1;
    const gross = /^\p{Lu}/u.test(wort);
    const grossMittenImSatz = gross && !amSatzanfang(text, treffer.index);
    const beleg = HAT_KASACHISCH.test(wort) ? !istName(wort, grossMittenImSatz) : istKasachischesWort(klein) && !grossMittenImSatz;
    if (beleg) {
      belege.add(klein);
      if (!gross) kleineBelege.add(klein);
    } else if (!gross && istRussischesWort(klein)) russisch.add(klein);
  }
  return { buchstaben: (text.match(KASACHISCH) ?? []).length, belege: belege.size, kleineBelege: kleineBelege.size, russisch: russisch.size, woerter };
}

/** Was die Woerter ueber einen kyrillischen Text sagen: "kasachisch" (Nachweis, siehe oben),
 *  "russisch" (keine Belege, oder die russischen Gegenbelege ueberwiegen) oder "offen" (Belege,
 *  aber zu wenige - ein Name am Satzanfang, oder eine sehr kurze Antwort wie "Иә"). */
export type KasachischBefund = "kasachisch" | "russisch" | "offen";

function befundAusMerkmalen({ buchstaben, belege, kleineBelege, russisch, woerter }: KasachischMerkmale): KasachischBefund {
  const genug = belege >= KASACHISCH_MINDEST_WOERTER || woerter <= KASACHISCH_KURZ_WOERTER;
  if (kleineBelege > 0 && belege > russisch && genug && belege / Math.max(1, woerter) >= KASACHISCH_MINDEST_ANTEIL) return "kasachisch";
  if (russisch > 0 && russisch >= belege) return "russisch";
  // Belege ohne Nachweis ("Иә", ein Name am Satzanfang): offen, dann entscheidet der Aufrufer
  // (fuer die Antwortsprache das Gespraech).
  return belege > 0 || buchstaben > 0 ? "offen" : "russisch";
}

function befundAus(text: string, kyrillisch: number): KasachischBefund {
  if (kyrillisch <= 0) return "russisch";
  return befundAusMerkmalen(kasachischeMerkmale(text));
}

/** So viele russische Gegenbelege holen einen kasachischen Zug auch in einem kurzen Satz
 *  zurueck ins Russische (klareAbweichung). */
const WECHSEL_KK_RU_GEGENBELEGE = 2;

/**
 * DIE Kasachisch-Regel - seit 29.09.2026 die einzige (Cleanup-Funde 40/41). Kasachisch
 * und Russisch teilen die Schrift; unterscheiden koennen die Sonderbuchstaben
 * (ә, і, ң, ғ, ү, ұ, қ, ө, һ) und einige kasachische Woerter ohne sie ("бар",
 * "туралы", "керек"). Ein kasachischer Satz hat mindestens zwei solcher Belegwoerter,
 * ein russischer Satz mit Ortsnamen keines (Namen zaehlen nicht, siehe istName).
 *
 * Bis dahin gab es daneben eine 1-%-Regel aus dem Chunker (fuer ganze Dokumente
 * gedacht): in einem Satz unter 100 Buchstaben reichte damit ein einziges "Қ". Die
 * Stimme hielt sich seit dem 28.09.2026 an diese Regel hier, die Antwortsprache
 * nicht - "Поставка прибыла в Қостанай вчера вечером." bekam eine kasachische
 * Antwort, auch mitten in einem russischen Gespraech.
 *
 * "offen" deutet jeder Aufrufer selbst, und zwar ausdruecklich: fuer die Stimme und
 * die Erkenner ist es Russisch (ein Ortsname macht keinen Text kasachisch), fuer
 * die Antwortsprache entscheidet dann das Gespraech (domain/antwortsprache.ts), und
 * eine Antwort unter der Entscheidungsschwelle ("Иә", "Жоқ") ist damit kasachisch.
 */
export function kasachischNachweis(text: string): KasachischBefund {
  const probe = (text ?? "").slice(0, PROBE_ZEICHEN);
  return befundAus(probe, zaehleSchrift(probe).kyrillisch);
}

/** Grobe Spracherkennung fuer Dokumente ohne Frontmatter (Audit-Recherche, Notizen):
 *  kyrillisch oder lateinisch, bei Kyrillisch Kasachisch nur mit robustem Nachweis
 *  (kasachischNachweis).
 *
 *  @param mindestBuchstaben Ab wie vielen Buchstaben ueberhaupt geraten wird.
 *    Fuer Dokumente sind 40 richtig. Eine Chatfrage ist oft kuerzer ("Wie geht
 *    es?" hat 11), und dort ist ein begruendeter Tipp besser als gar keiner:
 *    der Aufrufer entscheidet. */
export function erkenneSprache(text: string, mindestBuchstaben = 40): ErkannteSprache | null {
  const probe = text.slice(0, PROBE_ZEICHEN);
  const { kyrillisch, lateinisch } = zaehleSchrift(probe);
  if (kyrillisch + lateinisch < mindestBuchstaben) return null;
  if (kyrillisch > lateinisch) return befundAus(probe, kyrillisch) === "kasachisch" ? "kk" : "ru";
  // Ohne Anhaltspunkt bleibt es beim bisherigen Verhalten: lateinischer Text
  // ohne Hinweise gilt als Englisch. Wer "eindeutig oder gar nicht" braucht,
  // nimmt erkenneSpracheEindeutig().
  return lateinischeSprache(probe) ?? "en";
}

/** Wie erkenneSprache, aber OHNE den Englisch-Standard und strenger: lateinischer
 *  Text braucht einen klaren Abstand zwischen den Sprachen (lateinischeSpracheEindeutig),
 *  kyrillischer Text gilt nur mit robustem Nachweis als Kasachisch. Fuer alles, was
 *  aufgrund des Ergebnisses etwas VERWIRFT, ablehnt oder umschaltet: ein kurzer
 *  deutscher Satz wie "Lohnabrechnung fristgerecht abgeben" darf dort nie als
 *  Englisch gelten, ein russischer Text mit "Қостанай" nie als Kasachisch. */
export function erkenneSpracheEindeutig(text: string, mindestBuchstaben = 40): ErkannteSprache | null {
  const probe = text.slice(0, PROBE_ZEICHEN);
  const { kyrillisch, lateinisch } = zaehleSchrift(probe);
  if (kyrillisch + lateinisch < mindestBuchstaben) return null;
  if (kyrillisch > lateinisch) return befundAus(probe, kyrillisch) === "kasachisch" ? "kk" : "ru";
  return lateinischeSpracheEindeutig(probe);
}

// Deutsch gegen Englisch. Frueher galt: Umlaute oder eines von zehn Woertern
// -> Deutsch, sonst Englisch. "Wie geht es Ihnen heute?" hat weder Umlaut
// noch eines dieser Woerter und kam deshalb als Englisch heraus.
//
// Beide Seiten zaehlen, und zwar nur Woerter, die es auf der anderen Seite
// nicht gibt. Seit 28.09.2026 mit den haeufigen Funktionswoertern (die, das,
// zu, im, zeig, mach, weiter, zuerst ... / the, to, of, this, show, next ...):
// "Die Lohnabrechnung zuerst" hatte vorher kein einziges Merkwort und galt als
// Englisch. Heraus sind die mehrdeutigen Kurzwoerter: "an" ("Rufen Sie an"),
// "a" ("Klasse A"), "I" (eine Aufzaehlung), "was", "war", "man", "in", "am",
// "so", "also" und "it" (IT-Abteilung) stehen in beiden Sprachen und
// entscheiden nichts. Ein Wort mit Umlaut oder ß zaehlt als ein deutscher
// Treffer, nicht mehr als sofortiges Deutsch.
//
// Gezaehlt wird an ganzen Woertern (\p{L}), nicht mit \b: \b kennt keine
// Umlaute, "über" wurde so nie gefunden und "Böden" zerfiel in "B" und "den".
const DEUTSCHE_WOERTER = new Set(
  (
    "der die das den dem des ein eine einen einem einer eines und oder aber nicht kein keine keinen ist sind " +
    "wird werden wurde wurden hat habe haben hatte kann soll sollte muss darf ich du sie wir ihr ihnen mich mir " +
    "dich dir uns euch es zu zum zur im vom beim mit für auf aus bei nach über unter vor seit bis noch schon auch " +
    "sehr wie wo wann warum wer welche welcher welches bitte danke heute morgen gestern immer wieder jetzt hier " +
    "mein meine dein deine unser unsere diese dieser dieses dann wenn weil dass zeig zeige mach mache machen " +
    "weiter zuerst erst gut gibt geht gehen alle alles nur"
  ).split(" "),
);
const ENGLISCHE_WOERTER = new Set(
  (
    "the and or not is are were been be being to of for with from into about after before between on at by " +
    "this that these those there their they them he she him her his we us our you your me my can could should " +
    "would must may will shall have has had do does did done go goes make show tell give please thanks thank " +
    "today tomorrow yesterday always again next now just then than what where when why who which how first " +
    "let get need want if"
  ).split(" "),
);
const UMLAUT = /[äöüß]/;
const WORT = /\p{L}+/gu;

/** Wie viele Woerter fuer Deutsch und wie viele fuer Englisch sprechen. */
export function lateinischeTreffer(text: string): { deutsch: number; englisch: number } {
  let deutsch = 0;
  let englisch = 0;
  for (const wort of text.toLowerCase().match(WORT) ?? []) {
    if (DEUTSCHE_WOERTER.has(wort) || UMLAUT.test(wort)) deutsch++;
    else if (ENGLISCHE_WOERTER.has(wort)) englisch++;
  }
  return { deutsch, englisch };
}

/** Deutsch oder Englisch - oder null, wenn nichts dafuer spricht. Die mehr
 *  Treffer hat, gewinnt, schon mit einem ("Danke!"). Der Aufrufer entscheidet,
 *  was ein Unentschieden bedeutet: fuer Dokumente "irgendwas", fuer die
 *  Antwortsprache "lieber die Einstellung nehmen". */
export function lateinischeSprache(text: string): "de" | "en" | null {
  const { deutsch, englisch } = lateinischeTreffer(text);
  if (deutsch > englisch) return "de";
  if (englisch > deutsch) return "en";
  return null;
}

/** Ein klarer Abstand: mindestens zwei Treffer, mindestens zwei mehr als die
 *  andere Sprache und mindestens doppelt so viele. */
function mitAbstand(sieger: number, verlierer: number): boolean {
  return sieger >= 2 && sieger - verlierer >= 2 && sieger >= 2 * verlierer;
}

/** Die Entscheidung aus schon gezaehlten Treffern - lateinischeSpracheEindeutig und
 *  klareAbweichung (die die Zahlen zusaetzlich braucht) zaehlen nur einmal. */
function eindeutigAusTreffern({ deutsch, englisch }: { deutsch: number; englisch: number }): "de" | "en" | null {
  if (mitAbstand(deutsch, englisch)) return "de";
  if (mitAbstand(englisch, deutsch)) return "en";
  return null;
}

/** Deutsch oder Englisch nur mit klarem Abstand (seit 28.09.2026) - sonst null.
 *  "Brigade Nord zuerst" (ein Treffer) entscheidet nichts, "Die Lieferung geht
 *  heute an Frische GmbH" (drei deutsche, kein englischer) schon. */
export function lateinischeSpracheEindeutig(text: string): "de" | "en" | null {
  return eindeutigAusTreffern(lateinischeTreffer(text));
}

// --------------------------------------------------------- Sprache je Satz
//
// Eine Antwort ist nicht immer einsprachig: eine deutsche Antwort zitiert den
// russischen Paragrafen aus dem НК РК, eine russische nennt die Sorte "Polka".
// Bis zum 28.09.2026 las eine Stimme die ganze Antwort, und zwar die der Frage.
//
// Die Regel ist BEWUSST ZURUECKHALTEND. Jeder Wechsel ist hoerbar - anderer
// Sprecher, anderes Tempo, im Strom ein neuer Schluessel und eine Pause:
//   - ein Wechsel der SCHRIFT schaltet ab 12 Buchstaben um,
//   - innerhalb der lateinischen Schrift nur ein langer Satz (ab 40 Buchstaben)
//     mit eindeutigem Ergebnis ("Please confirm the delivery ..." in einer
//     deutschen Antwort, die auf Wunsch eine englische Mail enthaelt),
//   - innerhalb der kyrillischen ru -> kk nur mit robustem Nachweis
//     (kasachischNachweis: ein Ortsname wie "Қостанай" reicht nicht), kk -> ru
//     nur ab 60 Buchstaben ganz ohne kasachische Sonderbuchstaben,
//   - Zahlen, Eigennamen und gemischte Saetze ("Polka: 1100 kg, всего 1600 кг")
//     behalten die Sprache, die gerade spricht.
// Bis zum 28.09.2026 galt innerhalb einer Schrift "nie": eine englische Mail
// in einer deutschen Antwort las die deutsche Stimme.

/** Unter so vielen Buchstaben entscheidet ein Satz nichts. */
export const SATZ_MINDEST_BUCHSTABEN = 12;
/** So viel der Buchstaben muss eine Schrift haben, damit sie ueberwiegt. */
export const SATZ_SCHRIFT_ANTEIL = 0.7;
/** Ab so vielen Buchstaben darf ein Satz innerhalb der lateinischen Schrift
 *  die Sprache wechseln (de <-> en). */
export const WECHSEL_LATEINISCH_BUCHSTABEN = 40;
/** Ab so vielen Buchstaben ohne jeden kasachischen Sonderbuchstaben wird aus
 *  einem kasachischen Zug fuer diesen Satz Russisch. */
export const WECHSEL_KK_RU_BUCHSTABEN = 60;
/** Hoechstens so viele Sprachwechsel je Antwort, danach bleibt die Stimme.
 *  Im Strom kostet jeder Wechsel einen Schluessel (12 je Minute, api/
 *  ki-sprachausgabe/schluessel), im Datei-Weg eine Anfrage je Block. Eine
 *  Uebersetzungsliste mit sieben Satzpaaren wechselte vorher 14-mal, und ab
 *  dem 13. Schluessel brach das Vorlesen still ab (Pruefung vom 28.09.2026). */
export const HOECHSTENS_SPRACHWECHSEL = 4;

export type Schrift = "kyrillisch" | "lateinisch";

/** Die Schrift, die im Text klar ueberwiegt - oder null (zu kurz, gemischt,
 *  nur Zahlen). Auch der Zerleger (domain/sprachausgabe.ts) trennt daran. */
export function ueberwiegendeSchrift(
  text: string,
  mindestBuchstaben = SATZ_MINDEST_BUCHSTABEN,
  anteil = SATZ_SCHRIFT_ANTEIL,
): Schrift | null {
  const { kyrillisch, lateinisch } = zaehleSchrift(text);
  const summe = kyrillisch + lateinisch;
  if (summe === 0 || summe < mindestBuchstaben) return null;
  if (kyrillisch / summe >= anteil) return "kyrillisch";
  if (lateinisch / summe >= anteil) return "lateinisch";
  return null;
}

const istKyrillischeSprache = (s: string) => s === "ru" || s === "kk";
const istLateinischeSprache = (s: string) => s === "de" || s === "en";
const schriftVon = (s: string): Schrift | null => (istKyrillischeSprache(s) ? "kyrillisch" : istLateinischeSprache(s) ? "lateinisch" : null);

/**
 * Steht der Text KLAR in einer anderen Sprache als `erwartet`? Dann diese, sonst
 * null. Eine Regel fuer den einzelnen Satz (satzSprache) und fuer die ganze
 * Antwort (vorleseSprache, mit `ganzerText`):
 *   - andere Schrift: ab `mindestBuchstaben`, Kyrillisch robust nach ru/kk,
 *     Lateinisch nur mit eindeutigem Ergebnis,
 *   - lateinisch in lateinisch: ab 40 lateinischen Buchstaben, eindeutig,
 *   - ru -> kk: robuster Nachweis, kk -> ru: ab 60 Buchstaben ohne Sonderbuchstaben.
 * `ganzerText`: zusaetzlich darf fast nichts fuer `erwartet` sprechen (hoechstens
 * ein Viertel der Treffer) - eine deutsche Einleitung vor einer englischen Mail
 * laesst die Antwort deutsch, die Mail wechselt dann satzweise.
 */
export function klareAbweichung(
  text: string,
  erwartet: string,
  { mindestBuchstaben = SATZ_MINDEST_BUCHSTABEN, ganzerText = false }: { mindestBuchstaben?: number; ganzerText?: boolean } = {},
): ErkannteSprache | null {
  const probe = (text ?? "").slice(0, PROBE_ZEICHEN);
  const schrift = ueberwiegendeSchrift(probe, mindestBuchstaben);
  if (!schrift) return null;
  const { kyrillisch, lateinisch } = zaehleSchrift(probe);
  if (schrift === "kyrillisch") {
    const merkmale = kasachischeMerkmale(probe);
    const befund = befundAusMerkmalen(merkmale);
    if (erwartet === "ru") return befund === "kasachisch" ? "kk" : null;
    // Zurueck nach Russisch braucht mehr als hin (gewollte Hysterese, siehe oben): kein
    // kleingeschriebenes Belegwort, und ab 60 Buchstaben oder mit zwei russischen Gegenbelegen.
    // Bis zur Gegenpruefung vom 29.09.2026 nur ab 60 Buchstaben: "Поставка прибыла вчера вечером,
    // всё проверено и подписано." (49) las die kasachische Stimme.
    if (erwartet === "kk") {
      const klarRussisch = befund === "russisch" && merkmale.kleineBelege === 0;
      return klarRussisch && (kyrillisch >= WECHSEL_KK_RU_BUCHSTABEN || merkmale.russisch >= WECHSEL_KK_RU_GEGENBELEGE) ? "ru" : null;
    }
    return befund === "kasachisch" ? "kk" : "ru";
  }
  const treffer = lateinischeTreffer(probe);
  const { deutsch, englisch } = treffer;
  const eindeutig = eindeutigAusTreffern(treffer);
  if (!eindeutig || eindeutig === erwartet) return null;
  if (!istLateinischeSprache(erwartet)) return eindeutig;
  if (lateinisch < WECHSEL_LATEINISCH_BUCHSTABEN) return null;
  if (ganzerText) {
    const [sieger, verlierer] = eindeutig === "de" ? [deutsch, englisch] : [englisch, deutsch];
    if (verlierer * 4 > sieger) return null;
  }
  return eindeutig;
}

/**
 * Die Stimme fuer EINEN Satz. `zugSprache` ist die Sprache der Antwort
 * (domain/antwortsprache.ts); abgewichen wird nur, wenn der Satz klar in einer
 * anderen Sprache steht (klareAbweichung). Gibt immer eine der vier Sprachen
 * zurueck, wenn `zugSprache` eine ist.
 *
 * Fuer eine Folge von Saetzen (eine Antwort) gilt sprachenFuerSaetze: dort
 * behalten Saetze ohne eigene Entscheidung die Sprache, die gerade spricht, und
 * die Zahl der Wechsel ist begrenzt.
 */
export function satzSprache<S extends string>(text: string, zugSprache: S): S | ErkannteSprache {
  const t = text ?? "";
  const sprache = klareAbweichung(t, zugSprache) ?? zugSprache;
  // Kyrillischer Text nie mit einer lateinischen Stimme, auch unter der Mindestlaenge ("Да.").
  return istLateinischeSprache(sprache) && schriftVonText(t) === "kyrillisch" ? kyrillischeStimme(t, zugSprache) : sprache;
}

/** Hat der Satz selbst eine Sprache (true), oder folgt er nur dem Zug (false)?
 *  Ein Satz in der Schrift des Zuges, der dessen Sprache eindeutig bestaetigt,
 *  entscheidet ebenfalls: nach einer englischen Mail kehrt "Soll ich die Mail so
 *  abschicken?" zum Deutschen zurueck. */
function entscheidetSelbst(text: string, zugSprache: string, sprache: string): boolean {
  if (sprache !== zugSprache) return true;
  const schrift = ueberwiegendeSchrift(text);
  if (!schrift || schrift !== schriftVon(zugSprache)) return false;
  if (schrift === "lateinisch") return lateinischeSpracheEindeutig(text) === zugSprache;
  // Kyrillisch: ein Satz mit kasachischen Sonderbuchstaben bestaetigt kk, einer
  // ganz ohne bestaetigt ru.
  const befund = befundAus(text, zaehleSchrift(text).kyrillisch);
  return zugSprache === "kk" ? befund !== "russisch" : befund === "russisch";
}

/** Die Schrift eines kurzen Satzes, wenn er nur eine hat ("OK.", "Да.") - sonst null. */
function reineSchrift(text: string): Schrift | null {
  const { kyrillisch, lateinisch } = zaehleSchrift(text);
  if (kyrillisch > 0 && lateinisch === 0) return "kyrillisch";
  if (lateinisch > 0 && kyrillisch === 0) return "lateinisch";
  return null;
}

/** Die Schrift eines Textes jeder Laenge: die ueberwiegende, bei sehr kurzem Text die einzige. */
export function schriftVonText(text: string): Schrift | null {
  return ueberwiegendeSchrift(text ?? "", 1) ?? reineSchrift(text ?? "");
}

/** Die Stimme fuer kyrillischen Text, dem der Zug keine kyrillische Sprache vorgibt: Kasachisch
 *  mit Nachweis, Russisch mit Gegenbelegen, sonst (offen, "Иә") die kyrillische Sprache des
 *  Zuges oder der Oberflaeche, wenn es eine ist, und sonst Russisch. */
export function kyrillischeStimme(text: string, bevorzugt?: string | null): "ru" | "kk" {
  const befund = kasachischNachweis(text);
  if (befund === "kasachisch") return "kk";
  if (befund === "russisch") return "ru";
  return bevorzugt === "kk" ? "kk" : "ru";
}

export interface SprachFolge<S extends string> {
  /** Die Sprache des naechsten Satzes (oder Abschnitts) dieser Antwort. */
  naechste(text: string): S | ErkannteSprache;
}

/**
 * Vergibt die Sprachen einer Antwort Satz fuer Satz - dieselbe Regel fuer den
 * Server (data-satz, api/ki-assistent) und den Knopf (sprachausgabe-live.ts,
 * Datei-Weg ueber vorlesePlan). Seit 28.09.2026, drei Regeln:
 *
 *   1. Entscheidet ein Satz selbst (satzSprache, entscheidetSelbst), gilt das.
 *   2. Sonst - kurz, nur Zahlen, gemischt, lateinisch ohne Merkmal - bleibt die
 *      Sprache, die gerade spricht, solange der Satz in ihrer Schrift steht
 *      oder gar keine klare hat. "1600 кг." zwischen zwei russischen Saetzen
 *      einer deutschen Antwort wechselt nicht zweimal die Stimme, "Kind
 *      regards." nach einer englischen Mail bleibt englisch.
 *   3. Nach HOECHSTENS_SPRACHWECHSEL Wechseln bleibt die Stimme, wo sie ist.
 *
 * Kein Blick nach vorn: was fuer die ersten n Saetze herauskommt, aendert sich
 * nicht, wenn weitere folgen. Nur so kann der Server Satz fuer Satz senden und
 * trotzdem dasselbe vergeben wie der Knopf fuer die fertige Antwort.
 */
export function erzeugeSprachFolge<S extends string>(zugSprache: S, hoechstensWechsel = HOECHSTENS_SPRACHWECHSEL): SprachFolge<S> {
  let aktuell: S | ErkannteSprache | null = null;
  let wechsel = 0;
  return {
    naechste(text: string): S | ErkannteSprache {
      const t = text ?? "";
      const eigene = satzSprache(t, zugSprache);
      let kandidat: S | ErkannteSprache = eigene;
      if (aktuell !== null && !entscheidetSelbst(t, zugSprache, eigene)) {
        const schrift = ueberwiegendeSchrift(t) ?? reineSchrift(t);
        if (schrift === null || schrift === schriftVon(aktuell)) kandidat = aktuell;
        else if (schrift !== schriftVon(zugSprache)) kandidat = aktuell;
      }
      // Kyrillischer Text nie mit einer lateinischen Stimme, auch ein kurzer nicht ("Да." nach
      // "Ich prüfe das." las bis zur Gegenpruefung vom 29.09.2026 die deutsche Stimme - genau die
      // Rueckmeldung vom 28.09.2026, "mit viel Akzent"). Umgekehrt darf eine kyrillische Stimme ein
      // kurzes "OK." lesen.
      const kyrillischerSatz = (ueberwiegendeSchrift(t) ?? reineSchrift(t)) === "kyrillisch";
      if (kyrillischerSatz && istLateinischeSprache(kandidat)) kandidat = kyrillischeStimme(t, zugSprache);
      if (aktuell !== null && kandidat !== aktuell) {
        // Die Grenze gilt nicht fuer diesen einen Pflichtwechsel ins Kyrillische. Danach steht die
        // Stimme kyrillisch und bleibt dort (hoechstens ein Wechsel mehr als die Grenze).
        const pflicht = kyrillischerSatz && istLateinischeSprache(aktuell);
        if (wechsel >= hoechstensWechsel && !pflicht) kandidat = aktuell;
        else wechsel++;
      }
      aktuell = kandidat;
      return kandidat;
    },
  };
}

/** Die Sprachen fuer alle Saetze einer Antwort (erzeugeSprachFolge auf einmal). */
export function sprachenFuerSaetze<S extends string>(
  saetze: readonly string[],
  zugSprache: S,
  hoechstensWechsel = HOECHSTENS_SPRACHWECHSEL,
): Array<S | ErkannteSprache> {
  const folge = erzeugeSprachFolge(zugSprache, hoechstensWechsel);
  return saetze.map((satz) => folge.naechste(satz));
}
