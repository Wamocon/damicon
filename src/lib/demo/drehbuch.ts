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
    },
  },
  {
    id: "problem",
    ziel: { art: "pfad", pfad: "/dashboard" },
    text: {
      de: "Das Hauptproblem: Alles steht auf Papier oder im Kopf einer einzigen Person. Dabei vergisst man leicht etwas. Welcher Block muss sich noch erholen? Wann war die letzte Behandlung? Wer hat wie viel gepflückt und wie hoch war der Ertrag? Was wurde an wen verkauft, und wie viel ist noch übrig? Und was bleibt nach allen Kosten als Gewinn?",
    },
  },
  {
    id: "loesung",
    ziel: { art: "pfad", pfad: "/dashboard" },
    text: {
      de: "Die Lösung heißt Damicon. Damicon ist das digitale Gedächtnis Ihres Betriebs. Alles wird einmal erfasst. Danach liefert es jede Zahl auf Anfrage, auf dem Bildschirm oder über mich. Die Beispiele zeige ich Ihnen jetzt selbst.",
    },
  },
  {
    id: "reihenbloecke",
    ziel: { art: "modul", modul: "reihenbloecke" },
    text: {
      de: "Was bringt das? Fünf Beispiele. Erstens, das Feld. Jeder Reihenblock hat einen Status. Hier sehen Sie, welcher Block reif ist, ruht oder wegen einer Wartezeit gesperrt ist.",
    },
  },
  {
    id: "rotationsplan",
    ziel: { art: "modul", modul: "rotationsplan" },
    text: {
      de: "Der Rotationsplan zeigt, welcher Block heute dran ist, und markiert einen ausgelassenen Durchgang. Ergebnis: keine verpasste Pflückrunde, und die Menge je Block ist erfasst.",
    },
  },
  {
    id: "pflanzenschutz",
    ziel: { art: "modul", modul: "pflanzenschutz" },
    text: {
      de: "Zweitens, die Behandlungen. Jede Behandlung wird je Block erfasst, mit Mittel und Datum. Damicon sperrt den Block automatisch bis zum Ende der Wartezeit. Ergebnis: Es wird nie während der Wartezeit gepflückt, und der Nachweis für den Handel kommt auf Knopfdruck.",
    },
  },
  {
    id: "personal",
    ziel: { art: "modul", modul: "personal" },
    text: {
      de: "Drittens, das Büro. Ein Scan je Steige erfasst Person, Menge, Block und Uhrzeit. Sie sehen die Leistung jeder Person und die Streuung im Team.",
    },
  },
  {
    id: "lohn",
    ziel: { art: "modul", modul: "lohn" },
    text: {
      de: "Der Lohn richtet sich nach der echten Menge und nach der Qualität.",
    },
  },
  {
    id: "integrationen",
    ziel: { art: "modul", modul: "integrationen" },
    text: {
      de: "Die Saisonverträge melden wir im staatlichen Register für Arbeitsverträge, kurz ЕСУТД. Dazu im Büro: Schichtplan, Dokumente mit Ablaufdatum und Fördermittel mit Fristen.",
    },
  },
  {
    id: "b2b-portal",
    ziel: { art: "modul", modul: "b2b_portal" },
    text: {
      de: "Viertens, der Markt. Jede Steige gehört zu genau einer Charge. Die Charge läuft bis zur Rechnung und bis zur ЭСФ. Kunden bestellen vor und verfolgen ihre Lieferung im Portal.",
    },
  },
  {
    id: "reklamationen",
    ziel: { art: "modul", modul: "reklamationen" },
    text: {
      de: "Reklamationen führen zurück zur Charge. Dazu kommen Preislisten je Kunde, Zukauf von Nachbarbetrieben und Anfragen von der Website. Ergebnis: Sie sehen, wer was zu welchem Preis gekauft hat.",
    },
  },
  {
    id: "finanzen",
    ziel: { art: "modul", modul: "finanzen" },
    text: {
      de: "Fünftens, die Finanzen. Das Büro rechnet den Deckungsbeitrag, also Erlös minus direkte Kosten, je Reihenblock, Sorte und Erntetag und je Kilogramm. Gebuchtes lässt sich nicht mehr ändern. Dazu kommt die Wirtschaftlichkeit des Betriebs über drei bis fünf Jahre. Ergebnis: Sie entscheiden nach Zahlen statt nach Gefühl.",
    },
  },
  {
    id: "pflueckaufgaben",
    ziel: { art: "modul", modul: "pflueckaufgaben" },
    text: {
      de: "Der wichtigste Nutzen liegt auf dem Feld und im Hof. Dort geben Sie Arbeit ab, ohne die Kontrolle zu verlieren. Auf dem Feld geben Sie eine Pflückaufgabe an eine Brigade. Die Brigade nimmt sie an, pflückt und meldet Menge und Fotos zurück. Sie sehen den Stand: offen, angenommen, in Arbeit, abgeschlossen.",
    },
  },
  {
    id: "kuehlkette",
    ziel: { art: "modul", modul: "kuehlkette" },
    text: {
      de: "Im Hof läuft die Kühlketten-Uhr ab dem Pflücken. Ist die Ware nach 60 Minuten nicht gekühlt, ist sie am nächsten Tag nur noch Industrieware. Das System meldet jede Abweichung sofort, ohne dass jemand danebensteht.",
    },
  },
  {
    id: "logistik",
    ziel: { art: "modul", modul: "logistik" },
    text: {
      de: "Die Übergabe an den Kunden quittiert die Brigade digital. Ergebnis: Sie fragen nicht mehr nach. Sie sehen es.",
    },
  },
  {
    id: "himbi",
    ziel: { art: "pfad", pfad: "/dashboard" },
    text: {
      de: "Ich bin Himbi, der Assistent. Ich beantworte Fragen zu Ihren Daten und zeige die richtige Seite, so wie eben. Ich handle nur nach Ihrer Bestätigung. Sie können auch mit mir sprechen.",
    },
  },
  {
    id: "ceo-pruefung",
    ziel: { art: "pfad", pfad: "/dashboard" },
    zeigeAuf: "ceoUebersicht.titel",
    ceoTeil: true,
    text: {
      de: "Jetzt Ihr Morgen. Oben sehen Sie die vier Prüfbereiche: Audit, Steuern, Recht und Risiko. Jeder hat Punkte und offene Maßnahmen. Überfälliges steht ganz oben.",
    },
  },
  {
    id: "ceo-wirtschaftlichkeit",
    ziel: { art: "modul", modul: "wirtschaftlichkeit" },
    ceoTeil: true,
    text: {
      de: "Dann die Wirtschaftlichkeit: Die Rechnung des Systems zeigt eine Amortisation von 11 Monaten. Die Annahmen dahinter bitte ich Sie zu bestätigen.",
    },
  },
  {
    id: "ceo-bereiche",
    ziel: { art: "pfad", pfad: "/dashboard" },
    zeigeAuf: "dashboard.bereiche.titel",
    ceoTeil: true,
    text: {
      de: "Unten sehen Sie die vier Bereiche des Betriebs: Feld, Hof, Büro und Markt.",
    },
  },
  {
    id: "abschluss",
    ziel: { art: "pfad", pfad: "/dashboard" },
    ceoTeil: true,
    text: {
      de: "Zusammengefasst: Das Problem ist Papier und der Kopf einer Person. Die Lösung ist das digitale Gedächtnis des Betriebs. Der Nutzen: Auf dem Feld und im Hof geben Sie Arbeit ab und sehen das Ergebnis sofort. Ich habe eine Bitte: Bestätigen Sie die Annahmen der Wirtschaftlichkeit.",
    },
  },
  {
    id: "abschluss-ohne",
    ziel: { art: "pfad", pfad: "/dashboard" },
    nurOhneCeoTeil: true,
    text: {
      de: "Zusammengefasst: Das Problem ist Papier und der Kopf einer Person. Die Lösung ist das digitale Gedächtnis des Betriebs. Der Nutzen: Auf dem Feld und im Hof geben Sie Arbeit ab und sehen das Ergebnis sofort. Die Wirtschaftlichkeit zeige ich Ihnen gern in einem eigenen Termin.",
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

/** Der Text, wie ihn die Stimme bekommt. */
export function sprechtext(schritt: DemoSchritt, sprache: DemoSprache): string | null {
  const text = textIn(schritt, sprache);
  if (text === null) return null;
  if (sprache !== "de") return text;
  return SPRECHWEISE_DE.reduce((t, [kuerzel, gesprochen]) => t.split(kuerzel).join(gesprochen), text);
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
