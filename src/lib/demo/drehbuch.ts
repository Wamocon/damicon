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
  /** Nachrichtenschlüssel (next-intl, voller Pfad) der Überschrift, auf die Himbi zeigt. Ohne Angabe:
   *  bei einem Modul dessen Titel, sonst die Überschrift der Seite. Wird die Stelle nicht gefunden,
   *  zeigt Himbi auf die Überschrift der Seite, der Schritt bleibt nie hängen. */
  zeigeAuf?: string;
  /** Gehört zum CEO-Teil: läuft nur, wenn er gewählt ist. */
  ceoTeil?: boolean;
  /** Nur ohne CEO-Teil (zwei Fassungen des Schlusses). */
  nurOhneCeoTeil?: boolean;
  /** Text je Sprache. Deutsch ist die Vorlage, jede weitere Sprache kommt nach der Freigabe dazu. */
  text: { de: string } & Partial<Record<Exclude<DemoSprache, "de">, string>>;
}

// Die Schritte folgen dem Drehbuch (Stand: Entwurf zur Prüfung). Himbi spricht von sich in der
// ersten Person, wo er vorkommt.
export const DREHBUCH: readonly DemoSchritt[] = [
  {
    id: "einstieg",
    ziel: { art: "pfad", pfad: "/dashboard" },
    text: {
      de: "Guten Morgen. Ich bin Himbi. In wenigen Minuten zeige ich Ihnen drei Dinge: das Problem, die Lösung und den Nutzen für Sie.",
      ru: "Доброе утро. Я Химби. За несколько минут я покажу вам три вещи: проблему, решение и пользу для вас.",
    },
  },
  {
    id: "problem",
    ziel: { art: "pfad", pfad: "/dashboard" },
    text: {
      de: "Das Hauptproblem: Alles steht auf Papier oder im Kopf einer einzigen Person. Dabei vergisst man leicht etwas. Welcher Block muss sich noch erholen? Wann war die letzte Behandlung? Wer hat wie viel gepflückt und wie hoch war der Ertrag? Was wurde an wen verkauft, und wie viel ist noch übrig? Und was bleibt nach allen Kosten als Gewinn?",
      ru: "Главная проблема: всё записано на бумаге или хранится в голове одного человека. Очень легко что-нибудь забыть. Какой блок ещё отдыхает? Когда была последняя обработка? Кто сколько собрал и каков был урожай? Что и кому продано, и сколько осталось? И сколько остаётся прибыли после всех затрат?",
    },
  },
  {
    id: "loesung",
    ziel: { art: "pfad", pfad: "/dashboard" },
    text: {
      de: "Die Lösung heißt Damicon. Damicon ist das digitale Gedächtnis Ihres Betriebs. Alles wird einmal erfasst. Danach liefert es jede Zahl auf Anfrage, auf dem Bildschirm oder über mich. Die Beispiele zeige ich Ihnen jetzt selbst.",
      ru: "Решение называется Damicon. Damicon это цифровая память вашего хозяйства. Всё записывается один раз. Дальше он выдаёт любую цифру по запросу: на экране или через меня. Примеры я покажу вам сам.",
    },
  },
  {
    id: "reihenbloecke",
    ziel: { art: "modul", modul: "reihenbloecke" },
    text: {
      de: "Was bringt das? Fünf Beispiele. Erstens, das Feld. Jeder Reihenblock hat einen Status. Hier sehen Sie, welcher Block reif ist, ruht oder wegen einer Wartezeit gesperrt ist.",
      ru: "Что это даёт? Пять примеров. Первый: поле. У каждого рядного блока есть статус. Здесь видно, какой блок созрел, какой отдыхает, а какой закрыт из-за срока ожидания.",
    },
  },
  {
    id: "rotationsplan",
    ziel: { art: "modul", modul: "rotationsplan" },
    text: {
      de: "Der Rotationsplan zeigt, welcher Block heute dran ist, und markiert einen ausgelassenen Durchgang. Ergebnis: keine verpasste Pflückrunde, und die Menge je Block ist erfasst.",
      ru: "План ротации показывает, какой блок сегодня в очереди, и отмечает пропущенный обход. Итог: ни одного пропущенного сбора, а количество с каждого блока записано.",
    },
  },
  {
    id: "pflanzenschutz",
    ziel: { art: "modul", modul: "pflanzenschutz" },
    text: {
      de: "Zweitens, die Behandlungen. Jede Behandlung wird je Block erfasst, mit Mittel und Datum. Damicon sperrt den Block automatisch bis zum Ende der Wartezeit. Ergebnis: Es wird nie während der Wartezeit gepflückt, und der Nachweis für den Handel kommt auf Knopfdruck.",
      ru: "Второй: обработки. Каждая обработка записывается по блоку: средство и дата. Damicon сам закрывает блок до конца срока ожидания. Итог: во время срока ожидания сбора не будет, а подтверждение для торговых сетей готово по нажатию кнопки.",
    },
  },
  {
    id: "personal",
    ziel: { art: "modul", modul: "personal" },
    text: {
      de: "Drittens, das Büro. Ein Scan je Steige erfasst Person, Menge, Block und Uhrzeit. Sie sehen die Leistung jeder Person und die Streuung im Team.",
      ru: "Третий: офис. Один скан ящика записывает человека, количество, блок и время. Вы видите выработку каждого и разброс в бригаде.",
    },
  },
  {
    id: "lohn",
    ziel: { art: "modul", modul: "lohn" },
    text: {
      de: "Der Lohn richtet sich nach der echten Menge und nach der Qualität.",
      ru: "Оплата зависит от реального количества и от качества.",
    },
  },
  {
    id: "integrationen",
    ziel: { art: "modul", modul: "integrationen" },
    text: {
      de: "Die Saisonverträge melden wir im staatlichen Register für Arbeitsverträge, kurz ЕСУТД. Dazu im Büro: Schichtplan, Dokumente mit Ablaufdatum und Fördermittel mit Fristen.",
      ru: "Сезонные договоры мы ведём в системе и передаём в Единую систему учёта трудовых договоров, сокращённо ЕСУТД. Кроме того, в офисе есть график смен, документы со сроком действия и субсидии со сроками.",
    },
  },
  {
    id: "b2b-portal",
    ziel: { art: "modul", modul: "b2b_portal" },
    text: {
      de: "Viertens, der Markt. Jede Steige gehört zu genau einer Charge. Die Charge läuft bis zur Rechnung und bis zur ЭСФ. Kunden bestellen vor und verfolgen ihre Lieferung im Portal.",
      ru: "Четвёртый: рынок. Каждый ящик относится ровно к одной партии. Партия идёт до счёта и до ЭСФ. Клиенты заказывают заранее и следят за поставкой в портале.",
    },
  },
  {
    id: "reklamationen",
    ziel: { art: "modul", modul: "reklamationen" },
    text: {
      de: "Reklamationen führen zurück zur Charge. Dazu kommen Preislisten je Kunde, Zukauf von Nachbarbetrieben und Anfragen von der Website. Ergebnis: Sie sehen, wer was zu welchem Preis gekauft hat.",
      ru: "Рекламации ведут обратно к партии. Кроме того, есть прайс-листы для каждого клиента, закупки у соседних хозяйств и заявки с сайта. Итог: вы видите, кто что купил и по какой цене.",
    },
  },
  {
    id: "finanzen",
    ziel: { art: "modul", modul: "finanzen" },
    text: {
      de: "Fünftens, die Finanzen. Das Büro rechnet den Deckungsbeitrag, also Erlös minus direkte Kosten, je Reihenblock, Sorte und Erntetag und je Kilogramm. Gebuchtes lässt sich nicht mehr ändern. Dazu kommt die Wirtschaftlichkeit des Betriebs über drei bis fünf Jahre. Ergebnis: Sie entscheiden nach Zahlen statt nach Gefühl.",
      ru: "Пятый: финансы. Офис считает маржинальный доход, то есть выручку минус прямые затраты, по рядному блоку, сорту и дню сбора и на килограмм. Проведённое нельзя изменить. Кроме того, есть экономическая эффективность хозяйства за период от трёх до пяти лет. Итог: вы решаете по цифрам, а не по ощущению.",
    },
  },
  {
    id: "pflueckaufgaben",
    ziel: { art: "modul", modul: "pflueckaufgaben" },
    text: {
      de: "Der wichtigste Nutzen liegt auf dem Feld und im Hof. Dort geben Sie Arbeit ab, ohne die Kontrolle zu verlieren. Auf dem Feld geben Sie eine Pflückaufgabe an eine Brigade. Die Brigade nimmt sie an, pflückt und meldet Menge und Fotos zurück. Sie sehen den Stand: offen, angenommen, in Arbeit, abgeschlossen.",
      ru: "Главная польза на поле и во дворе. Там вы передаёте работу, не теряя контроля. На поле вы даёте бригаде задание на сбор. Бригада принимает его, собирает и сообщает количество и фото. Вы видите статус: открыто, принято, в работе, закрыто.",
    },
  },
  {
    id: "kuehlkette",
    ziel: { art: "modul", modul: "kuehlkette" },
    text: {
      de: "Im Hof läuft die Kühlketten-Uhr ab dem Pflücken. Ist die Ware nach 60 Minuten nicht gekühlt, ist sie am nächsten Tag nur noch Industrieware. Das System meldet jede Abweichung sofort, ohne dass jemand danebensteht.",
      ru: "Во дворе с момента сбора идёт таймер холодовой цепи. Если через 60 минут ягоды не охлаждены, на следующий день это уже только продукция для промышленной переработки. Система сразу сообщает о любом отклонении, и никому не нужно стоять рядом.",
    },
  },
  {
    id: "logistik",
    ziel: { art: "modul", modul: "logistik" },
    text: {
      de: "Die Übergabe an den Kunden quittiert die Brigade digital. Ergebnis: Sie fragen nicht mehr nach. Sie sehen es.",
      ru: "Передачу клиенту бригада подтверждает в цифровом виде. Итог: вы больше не переспрашиваете. Вы это видите.",
    },
  },
  {
    id: "himbi",
    ziel: { art: "pfad", pfad: "/dashboard" },
    text: {
      de: "Ich bin Himbi, der Assistent. Ich beantworte Fragen zu Ihren Daten und zeige die richtige Seite, so wie eben. Ich handle nur nach Ihrer Bestätigung. Sie können auch mit mir sprechen.",
      ru: "Я Химби, помощник. Я отвечаю на вопросы по вашим данным и показываю нужную страницу, как только что. Я действую только с вашего подтверждения. Со мной можно и говорить.",
    },
  },
  {
    id: "ceo-pruefung",
    ziel: { art: "pfad", pfad: "/dashboard" },
    zeigeAuf: "ceoUebersicht.titel",
    ceoTeil: true,
    text: {
      de: "Jetzt Ihr Morgen. Oben sehen Sie die vier Prüfbereiche: Audit, Steuern, Recht und Risiko. Jeder hat Punkte und offene Maßnahmen. Überfälliges steht ganz oben.",
      ru: "Теперь ваше утро. Вверху вы видите четыре области проверки: аудит, налоги, право и риски. В каждой есть баллы и открытые меры. Просроченное стоит первым.",
    },
  },
  {
    id: "ceo-wirtschaftlichkeit",
    ziel: { art: "modul", modul: "wirtschaftlichkeit" },
    ceoTeil: true,
    text: {
      de: "Dann die Wirtschaftlichkeit: Die Rechnung des Systems zeigt eine Amortisation von 11 Monaten. Die Annahmen dahinter bitte ich Sie zu bestätigen.",
      ru: "Дальше экономическая эффективность: расчёт системы показывает срок окупаемости 11 месяцев. Допущения этого расчёта прошу вас подтвердить.",
    },
  },
  {
    id: "ceo-bereiche",
    ziel: { art: "pfad", pfad: "/dashboard" },
    zeigeAuf: "dashboard.bereiche.titel",
    ceoTeil: true,
    text: {
      de: "Unten sehen Sie die vier Bereiche des Betriebs: Feld, Hof, Büro und Markt.",
      ru: "Внизу четыре области хозяйства: поле, двор, офис и рынок.",
    },
  },
  {
    id: "abschluss",
    ziel: { art: "pfad", pfad: "/dashboard" },
    ceoTeil: true,
    text: {
      de: "Zusammengefasst: Das Problem ist Papier und der Kopf einer Person. Die Lösung ist das digitale Gedächtnis des Betriebs. Der Nutzen: Auf dem Feld und im Hof geben Sie Arbeit ab und sehen das Ergebnis sofort. Ich habe eine Bitte: Bestätigen Sie die Annahmen der Wirtschaftlichkeit.",
      ru: "Итог: проблема в бумаге и в голове одного человека, решение в цифровой памяти хозяйства, польза в том, что на поле и во дворе вы передаёте работу и сразу видите результат. У меня одна просьба: подтвердите допущения экономической эффективности.",
    },
  },
  {
    id: "abschluss-ohne",
    ziel: { art: "pfad", pfad: "/dashboard" },
    nurOhneCeoTeil: true,
    text: {
      de: "Zusammengefasst: Das Problem ist Papier und der Kopf einer Person. Die Lösung ist das digitale Gedächtnis des Betriebs. Der Nutzen: Auf dem Feld und im Hof geben Sie Arbeit ab und sehen das Ergebnis sofort. Die Wirtschaftlichkeit zeige ich Ihnen gern in einem eigenen Termin.",
      ru: "Итог: проблема в бумаге и в голове одного человека, решение в цифровой памяти хозяйства, польза в том, что на поле и во дворе вы передаёте работу и сразу видите результат. Экономическую эффективность я охотно покажу вам на отдельной встрече.",
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
  return Math.max(4000, Math.round(woerter * 430));
}

/** Das Modul zu einem Schritt, falls das Ziel ein Modul ist. */
export function modulZu(ziel: DemoZiel) {
  return ziel.art === "modul" ? (modules.find((m) => m.key === ziel.modul) ?? null) : null;
}

/** Die Obergrenze eines Textes für die Stimme (Zeichen). Die Route weist längere ab. */
export const MAX_SCHRITT_ZEICHEN = 700;
