// Das Drehbuch der Vorführung: Himbi führt durch Damicon, öffnet die passenden Seiten und spricht
// dazu. Reine Daten und Rechenregeln, ohne React und ohne Netz, damit der Server (Stimme) und der
// Browser (Untertitel, Ablauf) dieselbe Quelle benutzen und supabase/tests/demo-drehbuch.ts sie
// prüfen kann.
//
// Warum ein festes Drehbuch und kein Modell: bei einer Vorführung vor der Geschäftsführung zählen
// derselbe Ablauf und dieselben Zeiten bei jedem Lauf. Die Stimme ist trotzdem die von Himbi
// (Sprachausgabe), und gezeigt wird nur: der Ablauf klickt nichts, was etwas ändert.
//
// Warum der Text hier auch für die Stimme gilt: die Route /api/demo-sprachausgabe nimmt nur eine
// Schrittkennung und eine Sprache entgegen und liest den Text aus dieser Datei. So bleibt sie kein
// offener Sprachgenerator (gleiche Überlegung wie bei /api/ki-sprachausgabe).
//
// Die Texte sagen kurz, was es bringt: Nutzen zuerst, höchstens zwei Sätze je Schritt, kein Ablauf
// und keine Aufzählung von Funktionen.

import { modules } from "@/lib/modules";
import type { Role } from "@/lib/rbac";

/** Sprachen, in denen ein Drehbuchtext vorliegen kann. Welche davon ein Lauf wirklich anbietet,
 *  entscheidet verfuegbareSprachen(): nur eine Sprache, in der JEDER Schritt einen Text hat. */
export const DEMO_SPRACHEN = ["de", "ru"] as const;
export type DemoSprache = (typeof DEMO_SPRACHEN)[number];

export function istDemoSprache(wert: unknown): wert is DemoSprache {
  return typeof wert === "string" && (DEMO_SPRACHEN as readonly string[]).includes(wert);
}

/** Wer die Vorführung starten und hören darf (echte Profilrolle, nicht die Vorschau-Rolle). */
export const DEMO_ROLLEN: readonly Role[] = ["ceo", "admin"];

export function darfDemo(rolle: Role | null | undefined): boolean {
  return rolle ? DEMO_ROLLEN.includes(rolle) : false;
}

export type DemoZiel =
  /** Ein Modul aus modules.ts (Schlüssel, zum Beispiel "pflanzenschutz"). */
  | { art: "modul"; modul: string }
  /** Eine feste Seite, zum Beispiel die Startübersicht. */
  | { art: "pfad"; pfad: string };

export interface DemoSchritt {
  id: string;
  ziel: DemoZiel;
  /** Die Stellen einer Modulseite, auf die Himbi nacheinander zeigt, solange er spricht: 0 ist der
   *  Seitenkopf (die Karte mit der Überschrift), 1 der erste Abschnitt mit Zwischenüberschrift, 2 der
   *  zweite und so weiter, in der Reihenfolge der Seite. Gezählt wird nach Position, nicht nach Wort,
   *  deshalb gilt dieselbe Angabe in jeder Sprache. Die Markierung wandert gleichmäßig über die
   *  Sprechzeit. Fehlt ein Abschnitt (zum Beispiel weil die Seite leer ist), entfällt er still. Ohne
   *  Angabe zeigt Himbi bei einem Modul auf den Seitenkopf. */
  abschnitte?: readonly number[];
  /** Nachrichtenschlüssel (next-intl, voller Pfad) einer Überschrift auf einer festen Seite, auf die Himbi
   *  zeigt. Ohne Angabe zeigt er dort nirgends hin. */
  zeigeAuf?: string;
  /** Gehört zum CEO-Teil: läuft nur, wenn er gewählt ist. */
  ceoTeil?: boolean;
  /** Nur ohne CEO-Teil (zwei Fassungen des Schlusses). */
  nurOhneCeoTeil?: boolean;
  /** Text je Sprache. Deutsch ist die Vorlage. */
  text: { de: string } & Partial<Record<Exclude<DemoSprache, "de">, string>>;
}

export const DREHBUCH: readonly DemoSchritt[] = [
  {
    id: "einstieg",
    ziel: { art: "pfad", pfad: "/dashboard" },
    text: {
      de: "Guten Morgen. Ich bin Himbi und zeige Ihnen in wenigen Minuten, was Damicon Ihnen bringt.",
      ru: "Доброе утро. Я Химби и за несколько минут покажу, что даёт вам Damicon.",
    },
  },
  {
    id: "problem",
    ziel: { art: "pfad", pfad: "/dashboard" },
    text: {
      de: "Heute steht vieles auf Papier oder im Kopf einer Person. Dabei geht leicht etwas verloren: Behandlungen, Mengen, Verkäufe, Gewinn.",
      ru: "Сейчас многое записано на бумаге или хранится в голове одного человека. Легко потерять обработки, количества, продажи и прибыль.",
    },
  },
  {
    id: "loesung",
    ziel: { art: "pfad", pfad: "/dashboard" },
    text: {
      de: "Damicon ist das digitale Gedächtnis Ihres Betriebs. Alles wird einmal erfasst, und Sie bekommen jede Zahl auf Anfrage, auf dem Bildschirm oder von mir.",
      ru: "Damicon это цифровая память вашего хозяйства. Всё записывается один раз, и вы получаете любую цифру по запросу: на экране или от меня.",
    },
  },
  {
    id: "reihenbloecke",
    ziel: { art: "modul", modul: "reihenbloecke" },
    abschnitte: [1, 2],
    text: {
      de: "Erstens, das Feld: Sie sehen für jeden Reihenblock den Status, reif, ruhend oder gesperrt.",
      ru: "Первое, поле: по каждому рядному блоку виден статус: созрел, отдыхает или закрыт.",
    },
  },
  {
    id: "rotationsplan",
    ziel: { art: "modul", modul: "rotationsplan" },
    abschnitte: [1, 2],
    text: {
      de: "Der Rotationsplan zeigt, welcher Block heute dran ist. So wird keine Pflückrunde verpasst.",
      ru: "План ротации показывает, какой блок сегодня в очереди. Ни один сбор не пропущен.",
    },
  },
  {
    id: "pflanzenschutz",
    ziel: { art: "modul", modul: "pflanzenschutz" },
    abschnitte: [0, 1],
    text: {
      de: "Zweitens, die Behandlungen: Mittel und Datum je Block, und der Block bleibt bis zum Ende der Wartezeit gesperrt. Den Nachweis für den Handel gibt es auf Knopfdruck.",
      ru: "Второе, обработки: средство и дата по каждому блоку, и блок закрыт до конца срока ожидания. Подтверждение для торговых сетей по нажатию кнопки.",
    },
  },
  {
    id: "personal",
    ziel: { art: "modul", modul: "personal" },
    abschnitte: [1, 4],
    text: {
      de: "Drittens, das Büro: Sie sehen die Leistung jeder Person und die Streuung im Team.",
      ru: "Третье, офис: вы видите выработку каждого человека и разброс в бригаде.",
    },
  },
  {
    id: "lohn",
    ziel: { art: "modul", modul: "lohn" },
    abschnitte: [1],
    text: {
      de: "Der Lohn richtet sich nach Menge und Qualität.",
      ru: "Оплата зависит от количества и качества.",
    },
  },
  {
    id: "integrationen",
    ziel: { art: "modul", modul: "integrationen" },
    abschnitte: [1, 2],
    text: {
      de: "Saisonverträge führt das System mit, samt Meldung und Frist für das staatliche Register ЕСУТД.",
      ru: "Сезонные договоры система ведёт вместе со сроками и сообщением в государственную систему ЕСУТД.",
    },
  },
  {
    id: "b2b-portal",
    ziel: { art: "modul", modul: "b2b_portal" },
    abschnitte: [1, 5, 2],
    text: {
      de: "Viertens, der Markt: Kunden verfolgen ihre Lieferung im Portal und bestellen selbst vor. Jede Charge läuft bis zur Rechnung.",
      ru: "Четвёртое, рынок: клиенты сами следят за поставкой в портале и заказывают заранее. Каждая партия идёт до счёта.",
    },
  },
  {
    id: "reklamationen",
    ziel: { art: "modul", modul: "reklamationen" },
    abschnitte: [1],
    text: {
      de: "Jede Reklamation führt zurück zur Charge. Sie sehen, wer was zu welchem Preis gekauft hat.",
      ru: "Каждая рекламация ведёт обратно к партии. Вы видите, кто что купил и по какой цене.",
    },
  },
  {
    id: "finanzen",
    ziel: { art: "modul", modul: "finanzen" },
    abschnitte: [1, 2],
    text: {
      de: "Fünftens, die Finanzen: Der Deckungsbeitrag je Reihenblock, Sorte und Erntetag zeigt, was bleibt. Sie entscheiden nach Zahlen.",
      ru: "Пятое, финансы: маржинальный доход по рядному блоку, сорту и дню сбора показывает, что остаётся. Вы решаете по цифрам.",
    },
  },
  {
    id: "pflueckaufgaben",
    ziel: { art: "modul", modul: "pflueckaufgaben" },
    abschnitte: [0, 1],
    text: {
      de: "Der wichtigste Nutzen liegt auf Feld und Hof: Sie geben Arbeit ab und sehen den Stand. Die Brigade nimmt die Pflückaufgabe an und meldet Menge und Fotos zurück.",
      ru: "Главная польза на поле и во дворе: вы передаёте работу и видите статус. Бригада принимает задание на сбор и сообщает количество и фото.",
    },
  },
  {
    id: "kuehlkette",
    ziel: { art: "modul", modul: "kuehlkette" },
    abschnitte: [1, 2],
    text: {
      de: "Im Hof läuft ab dem Pflücken die Kühlketten-Uhr. Ist die Ware nach 60 Minuten nicht gekühlt, ist sie am nächsten Tag nur noch Industrieware. Jede Abweichung sehen Sie sofort.",
      ru: "Во дворе с момента сбора идёт таймер холодовой цепи. Если через 60 минут ягоды не охлаждены, на следующий день они годятся только для переработки. Любое отклонение вы видите сразу.",
    },
  },
  {
    id: "logistik",
    ziel: { art: "modul", modul: "logistik" },
    abschnitte: [1],
    text: {
      de: "Die Brigade quittiert die Übergabe an den Kunden digital. Sie fragen nicht nach, Sie sehen es.",
      ru: "Бригада подтверждает передачу клиенту в цифровом виде. Вы не переспрашиваете, вы видите.",
    },
  },
  {
    id: "himbi",
    ziel: { art: "pfad", pfad: "/dashboard" },
    text: {
      de: "Ich beantworte Fragen zu Ihren Daten und zeige die richtige Seite. Gehandelt wird nur nach Ihrer Bestätigung.",
      ru: "Я отвечаю на вопросы по вашим данным и показываю нужную страницу. Действую только с вашего подтверждения.",
    },
  },
  {
    id: "ceo-pruefung",
    ziel: { art: "pfad", pfad: "/dashboard" },
    zeigeAuf: "ceoUebersicht.titel",
    ceoTeil: true,
    text: {
      de: "Ihr Morgen: Audit, Steuern, Recht und Risiko sind schon geprüft. Überfälliges steht oben.",
      ru: "Ваше утро: аудит, налоги, право и риски уже проверены. Просроченное стоит первым.",
    },
  },
  {
    id: "ceo-wirtschaftlichkeit",
    ziel: { art: "modul", modul: "wirtschaftlichkeit" },
    abschnitte: [3, 4],
    ceoTeil: true,
    text: {
      de: "Die Rechnung des Systems zeigt eine Amortisation von 11 Monaten. Die Annahmen bitte ich Sie zu bestätigen.",
      ru: "Расчёт системы показывает срок окупаемости 11 месяцев. Допущения прошу вас подтвердить.",
    },
  },
  {
    id: "ceo-bereiche",
    ziel: { art: "pfad", pfad: "/dashboard" },
    zeigeAuf: "dashboard.bereiche.titel",
    ceoTeil: true,
    text: {
      de: "Darunter sehen Sie Feld, Hof, Büro und Markt auf einen Blick.",
      ru: "Ниже вы видите поле, двор, офис и рынок одним взглядом.",
    },
  },
  {
    id: "abschluss",
    ziel: { art: "pfad", pfad: "/dashboard" },
    ceoTeil: true,
    text: {
      de: "Zusammengefasst: Sie geben Arbeit ab und sehen das Ergebnis sofort. Bitte bestätigen Sie die Annahmen der Wirtschaftlichkeit.",
      ru: "Итог: вы передаёте работу и сразу видите результат. Прошу подтвердить допущения экономической эффективности.",
    },
  },
  {
    id: "abschluss-ohne",
    ziel: { art: "pfad", pfad: "/dashboard" },
    nurOhneCeoTeil: true,
    text: {
      de: "Zusammengefasst: Sie geben Arbeit ab und sehen das Ergebnis sofort. Die Wirtschaftlichkeit zeige ich Ihnen gern in einem eigenen Termin.",
      ru: "Итог: вы передаёте работу и сразу видите результат. Экономическую эффективность я охотно покажу отдельно.",
    },
  },
];

/** Die Schritte eines Laufs, in der Reihenfolge des Drehbuchs. Der Schluss ist je nach CEO-Teil eine
 *  von zwei Fassungen ("abschluss" mit, "abschluss-ohne" ohne), der Rest des CEO-Teils entfällt. */
export function schritteFuer(mitCeoTeil: boolean): DemoSchritt[] {
  return DREHBUCH.filter((s) => {
    if (s.nurOhneCeoTeil) return !mitCeoTeil;
    if (s.ceoTeil) return mitCeoTeil;
    return true;
  });
}

export function schrittMitId(id: string): DemoSchritt | null {
  return DREHBUCH.find((s) => s.id === id) ?? null;
}

/** Sprachen, in denen JEDER Schritt einen Text hat. Deutsch ist immer dabei. */
export function verfuegbareSprachen(): DemoSprache[] {
  return DEMO_SPRACHEN.filter((sprache) => DREHBUCH.every((s) => textIn(s, sprache) !== null));
}

export function textIn(schritt: DemoSchritt, sprache: DemoSprache): string | null {
  const text = (schritt.text as Partial<Record<DemoSprache, string>>)[sprache];
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

// Wie die Stimme ein Kürzel spricht. Die Anzeige behält die Schreibweise der Behörde, die deutsche
// Stimme bekommt Buchstaben, denn kyrillische Kürzel kann sie nicht lesen. Die russische Stimme
// liest sie selbst richtig.
const SPRECHWEISE_DE: ReadonlyArray<readonly [string, string]> = [
  ["ЕСУТД", "E S U T D"],
  ["ЭСФ", "E S F"],
];

// Die russische Stimme buchstabiert oder liest einen lateinischen Namen englisch: der Markenname
// bekommt seine russische Lautung, die Untertitel behalten die Schreibweise.
const SPRECHWEISE_RU: ReadonlyArray<readonly [string, string]> = [["Damicon", "Дамикон"]];

/** Der Text, wie ihn die Stimme bekommt. */
export function sprechtext(schritt: DemoSchritt, sprache: DemoSprache): string | null {
  const text = textIn(schritt, sprache);
  if (text === null) return null;
  const ersetzungen = sprache === "de" ? SPRECHWEISE_DE : SPRECHWEISE_RU;
  return ersetzungen.reduce((t, [kuerzel, gesprochen]) => t.split(kuerzel).join(gesprochen), text);
}

/** Wie lange ein Schritt ohne Ton steht: grob die Lesezeit, mindestens gut lesbar. */
export function lesedauerMs(text: string): number {
  const woerter = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(3500, Math.round(woerter * 430));
}

/** Das Modul zu einem Schritt, falls das Ziel ein Modul ist. */
export function modulZu(ziel: DemoZiel) {
  return ziel.art === "modul" ? (modules.find((m) => m.key === ziel.modul) ?? null) : null;
}

/** Die Obergrenze eines Textes für die Stimme (Zeichen). Die Route weist längere ab. */
export const MAX_SCHRITT_ZEICHEN = 700;
