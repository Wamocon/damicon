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
// Die Texte sagen kurz, was es bringt: Nutzen zuerst, ein bis zwei Sätze je Schritt, kein Ablauf
// und keine Aufzählung von Funktionen. Die Vorführung dauert etwa zwei Minuten (Vorgabe vom 06.11.2026).
//
// Gewichtung (Vorgabe vom 05.11.2026): Feld und Hof haben die höchste Priorität und damit den
// größten Teil der Zeit, das Büro die nächste, der Markt die niedrigste und nur ganz kurz. Die
// Priorität zeigt sich an der Länge: der Test misst die Wörter je Bereich (Zone des Moduls).

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
  /** Himbis eigene Einleitung (Begrüßung, Problem, Lösung). Sie entfällt, wenn die vortragende Person
   *  selbst einleitet und dann an Himbi übergibt ("Ab den Beispielen"). */
  einleitung?: boolean;
  /** Der Anschlusssatz nach der Übergabe, nur "Ab den Beispielen". */
  nurAbBeispielen?: boolean;
  /** Text je Sprache. Deutsch ist die Vorlage. */
  text: { de: string } & Partial<Record<Exclude<DemoSprache, "de">, string>>;
}

export const DREHBUCH: readonly DemoSchritt[] = [
  // ---- Einstieg --------------------------------------------------------------------------------
  {
    id: "einstieg",
    ziel: { art: "pfad", pfad: "/dashboard" },
    einleitung: true,
    text: {
      de: "Guten Morgen. Ich bin Himbi und zeige Ihnen in Ruhe, was Damicon Ihnen auf Feld und Hof bringt.",
      ru: "Доброе утро. Я Химби и спокойно покажу, что Damicon даёт вам на поле и во дворе.",
    },
  },
  {
    id: "nutzen",
    ziel: { art: "pfad", pfad: "/dashboard" },
    einleitung: true,
    text: {
      de: "Das Wichtigste vorweg: Sie sehen jederzeit, was auf den Blöcken passiert, jeden Nachweis gibt es auf Knopfdruck, und Sie entscheiden nach Zahlen.",
      ru: "Главное сразу: вы в любой момент видите, что происходит на блоках, любое подтверждение есть по нажатию кнопки, и вы решаете по цифрам.",
    },
  },
  {
    id: "loesung",
    ziel: { art: "pfad", pfad: "/dashboard" },
    einleitung: true,
    text: {
      de: "Damicon ist das digitale Gedächtnis Ihres Betriebs. Alles wird einmal erfasst, und Sie bekommen jede Zahl auf Anfrage, auf dem Bildschirm oder von mir.",
      ru: "Damicon это цифровая память вашего хозяйства. Всё записывается один раз, и вы получаете любую цифру по запросу: на экране или от меня.",
    },
  },
  {
    id: "himbi-start",
    ziel: { art: "pfad", pfad: "/dashboard" },
    nurAbBeispielen: true,
    text: {
      de: "Sehr gern. Ich bin Himbi und zeige Ihnen, was Damicon auf Feld und Hof bringt.",
      ru: "С удовольствием. Я Химби и покажу, что Damicon даёт на поле и во дворе.",
    },
  },
  // ---- Feld (höchste Priorität) ----------------------------------------------------------------
  {
    id: "reihenbloecke",
    ziel: { art: "modul", modul: "reihenbloecke" },
    abschnitte: [1, 2],
    text: {
      de: "Zuerst das Feld: Jeder Reihenblock zeigt, ob er reif, ruhend oder gesperrt ist.",
      ru: "Сначала поле: каждый рядный блок показывает, созрел он, отдыхает или закрыт.",
    },
  },
  {
    id: "rotationsplan",
    ziel: { art: "modul", modul: "rotationsplan" },
    abschnitte: [1, 2],
    text: {
      de: "Als Nächstes der Rotationsplan: Er zeigt, welcher Block heute dran ist.",
      ru: "Дальше план ротации: он показывает, какой блок сегодня в очереди.",
    },
  },
  {
    id: "pflanzenschutz",
    ziel: { art: "modul", modul: "pflanzenschutz" },
    abschnitte: [0, 1],
    text: {
      de: "Jetzt der Pflanzenschutz: Jede Behandlung ist erfasst, und den Nachweis für den Handel gibt es auf Knopfdruck.",
      ru: "Теперь защита растений: каждая обработка записана, а подтверждение для торговых сетей готово по нажатию кнопки.",
    },
  },
  // ---- Hof (höchste Priorität) -----------------------------------------------------------------
  {
    id: "kuehlkette",
    ziel: { art: "modul", modul: "kuehlkette" },
    abschnitte: [1, 2],
    text: {
      de: "Damit auf den Hof: Ab dem Pflücken läuft die Kühlketten-Uhr, nach 60 Minuten ohne Kühlung ist die Ware nur noch Industrieware.",
      ru: "Теперь во двор: с момента сбора идёт таймер холодовой цепи, через 60 минут без охлаждения ягоды годятся только для переработки.",
    },
  },
  {
    id: "logistik",
    ziel: { art: "modul", modul: "logistik" },
    abschnitte: [1],
    text: {
      de: "Zuletzt die Übergabe: Die Brigade quittiert sie digital.",
      ru: "В конце передача: бригада подтверждает её в цифровом виде.",
    },
  },
  // ---- Büro (nächste Priorität) ----------------------------------------------------------------
  {
    id: "integrationen",
    ziel: { art: "modul", modul: "integrationen" },
    abschnitte: [1, 2],
    text: {
      de: "Wenn wir jetzt ins Büro wechseln: Saisonverträge führt das System samt Meldung an das Register ЕСУТД.",
      ru: "Теперь переходим в офис: сезонные договоры система ведёт вместе с сообщением в систему ЕСУТД.",
    },
  },
  {
    id: "finanzen",
    ziel: { art: "modul", modul: "finanzen" },
    abschnitte: [1, 2],
    text: {
      de: "Zum Schluss die Finanzen: Der Deckungsbeitrag zeigt, was bleibt.",
      ru: "В конце финансы: маржинальный доход показывает, что остаётся.",
    },
  },
  // ---- Markt (niedrigste Priorität, ganz kurz) -------------------------------------------------
  {
    id: "b2b-portal",
    ziel: { art: "modul", modul: "b2b_portal" },
    abschnitte: [1, 5, 2],
    text: {
      de: "Zuletzt der Markt: Kunden bestellen selbst vor.",
      ru: "Напоследок рынок: клиенты сами заказывают заранее.",
    },
  },
  // ---- CEO-Teil (nur auf Wunsch) ---------------------------------------------------------------
  {
    id: "ceo-pruefung",
    ziel: { art: "pfad", pfad: "/dashboard" },
    zeigeAuf: "ceoUebersicht.titel",
    ceoTeil: true,
    text: {
      de: "Nun zu Ihrem Morgen. Audit, Steuern, Recht und Risiko sind schon geprüft, und Überfälliges steht oben.",
      ru: "Теперь о вашем утре. Аудит, налоги, право и риски уже проверены, а просроченное стоит первым.",
    },
  },
  {
    id: "ceo-wirtschaftlichkeit",
    ziel: { art: "modul", modul: "wirtschaftlichkeit" },
    abschnitte: [3, 4],
    ceoTeil: true,
    text: {
      de: "Dann die Wirtschaftlichkeit. Die Rechnung des Systems zeigt eine Amortisation von 11 Monaten. Die Annahmen bitte ich Sie zu bestätigen.",
      ru: "Затем экономическая эффективность. Расчёт системы показывает срок окупаемости 11 месяцев. Допущения прошу вас подтвердить.",
    },
  },
  {
    id: "ceo-bereiche",
    ziel: { art: "pfad", pfad: "/dashboard" },
    zeigeAuf: "dashboard.bereiche.titel",
    ceoTeil: true,
    text: {
      de: "Und zurück auf die Startseite: Darunter sehen Sie Feld, Hof, Büro und Markt auf einen Blick.",
      ru: "И вернёмся на главную: ниже вы видите поле, двор, офис и рынок одним взглядом.",
    },
  },
  // ---- Schluss ---------------------------------------------------------------------------------
  {
    id: "abschluss",
    ziel: { art: "pfad", pfad: "/dashboard" },
    ceoTeil: true,
    text: {
      de: "Zusammengefasst: Auf Feld und Hof geben Sie Arbeit ab und sehen das Ergebnis sofort. Bitte bestätigen Sie die Annahmen der Wirtschaftlichkeit.",
      ru: "Итог: на поле и во дворе вы передаёте работу и сразу видите результат. Прошу подтвердить допущения экономической эффективности.",
    },
  },
  {
    id: "abschluss-ohne",
    ziel: { art: "pfad", pfad: "/dashboard" },
    nurOhneCeoTeil: true,
    text: {
      de: "Zusammengefasst: Auf Feld und Hof geben Sie Arbeit ab und sehen das Ergebnis sofort.",
      ru: "Итог: на поле и во дворе вы передаёте работу и сразу видите результат.",
    },
  },
];

/** Die Schritte eines Laufs, in der Reihenfolge des Drehbuchs. Der Schluss ist je nach CEO-Teil eine
 *  von zwei Fassungen ("abschluss" mit, "abschluss-ohne" ohne), der Rest des CEO-Teils entfällt. */
export function schritteFuer(mitCeoTeil: boolean, mitEinleitung = true): DemoSchritt[] {
  return DREHBUCH.filter((s) => {
    if (s.einleitung) return mitEinleitung;
    if (s.nurAbBeispielen) return !mitEinleitung;
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

/** Wörter je Bereich (Zone des Moduls) in einer Sprache, ohne CEO-Teil: das Maß für die Gewichtung. */
export function woerterJeBereich(sprache: DemoSprache): Record<"feld" | "hof" | "buero" | "markt", number> {
  const summe = { feld: 0, hof: 0, buero: 0, markt: 0 };
  for (const schritt of schritteFuer(false)) {
    const modul = modulZu(schritt.ziel);
    const text = textIn(schritt, sprache);
    if (!modul || !text) continue;
    const zone = modul.zone;
    if (zone === "feld" || zone === "hof" || zone === "buero" || zone === "markt") {
      summe[zone] += text.split(/\s+/).filter(Boolean).length;
    }
  }
  return summe;
}

/** Die Obergrenze eines Textes für die Stimme (Zeichen). Die Route weist längere ab. */
export const MAX_SCHRITT_ZEICHEN = 700;
