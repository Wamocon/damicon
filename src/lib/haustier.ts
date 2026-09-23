// Reine Logik fuer Himbi, den Begleiter (components/haustier). Ohne React, damit sie
// testbar bleibt: welchen Zustand hat die Himbeere, wenn der Agent gerade dies oder
// das tut, welchem Modul gehoert ein Pfad, wie sieht die Tour aus.

export type AgentPhase = "ruhe" | "arbeitet" | "freigabe" | "fehler";

export type HaustierZustand = "ruhe" | "denkt" | "freigabe" | "fertig" | "fehler" | "schlaeft" | "spricht" | "traurig";

/** Wie die letzte Antwort geklungen hat. Steuert nur das Gesicht, nie die Phase: was der
 *  Agent TUT, steht in HaustierZustand, wie es AUSGING, hier. */
export type Stimmung = "neutral" | "gut" | "warnung" | "frage";

// Wortstaemme in den fuenf Sprachen der Oberflaeche (de, en, ru, kk, tr). Bewusst nur
// eindeutig gefaerbte Woerter: "nicht" und "kein" stehen in fast jeder deutschen Antwort
// und wuerden alles als Warnung faerben. Verglichen wird am Wortanfang, damit Beugungen
// mitlaufen (gefunden/gefundene, сохранено/сохранён, hata/hatası).
const WARNUNG_STAEMME = [
  "fehler", "fehlgeschlag", "problem", "leider", "achtung", "warnung", "abgelehnt",
  "error", "failed", "failure", "sorry", "unable", "warning", "denied",
  "ошибк", "проблем", "внимание", "отказ", "сбой",
  "қате", "мәселе", "назар", "сәтсіз",
  "hata", "sorun", "dikkat", "reddedildi", "başarısız",
];
const GUT_STAEMME = [
  "fertig", "erledigt", "gespeichert", "erfolgreich", "angelegt", "aktualisiert", "gefunden",
  "done", "saved", "success", "created", "updated", "found",
  "готов", "сохран", "успешн", "создан", "обновл", "найден",
  "дайын", "сақталды", "сәтті", "жаңарт", "табылды",
  "hazır", "kaydedildi", "başarıyla", "oluşturuldu", "güncellendi", "bulundu",
];
const WARNUNG_ZEICHEN = ["⚠", "❌"];
const GUT_ZEICHEN = ["✅", "✔"];

/** Die Stimmung einer Antwort, ohne zweiten Modellaufruf und ohne zu wissen, in welcher
 *  Sprache sie verfasst ist. Rangfolge: eine Warnung gewinnt vor einer Rueckfrage, eine
 *  Rueckfrage vor Erfolg. Wer meldet, dass etwas schiefging, und dann noch nachfragt,
 *  soll nicht zufrieden dreinschauen. */
export function stimmungAusAntwort(antwort: string): Stimmung {
  const text = antwort.trim();
  if (!text) return "neutral";
  if (WARNUNG_ZEICHEN.some((z) => text.includes(z))) return "warnung";

  const woerter = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const hat = (staemme: string[]) => woerter.some((w) => staemme.some((s) => w.startsWith(s)));
  if (hat(WARNUNG_STAEMME)) return "warnung";

  // Ein Fragezeichen am Ende der letzten Zeile heisst in allen fuenf Sprachen dasselbe.
  // Die letzte Zeile statt des ganzen Textes, weil Antworten oft mit einer Liste enden.
  const letzteZeile = text.split("\n").map((z) => z.trim()).filter(Boolean).at(-1) ?? "";
  if (/[?？]$/.test(letzteZeile)) return "frage";

  if (GUT_ZEICHEN.some((z) => text.includes(z)) || hat(GUT_STAEMME)) return "gut";
  return "neutral";
}

/** Die Zustaende in der Reihenfolge, in der sie in der Vorschau stehen: erst der
 *  Alltag, dann die Ausnahmen. "traurig" fehlt - den sieht man nur beim Wegschicken,
 *  und dort erklaert er sich von selbst. */
export const VORSCHAU_ZUSTAENDE = ["ruhe", "denkt", "spricht", "freigabe", "fertig", "fehler", "schlaeft"] as const;

const BEWEGUNG_SCHLUESSEL = "damicon-haustier-bewegung";

/** Bewegung der Figur: an, solange nichts anderes gespeichert ist. Das Betriebssystem
 *  kann sie ueber prefers-reduced-motion ohnehin abbestellen - dieser Schalter ist fuer
 *  alle, die die Figur moegen, aber nicht das Zappeln, und die dafuer nicht die
 *  Einstellung ihres ganzen Rechners aendern wollen. */
export function leseBewegung(): boolean {
  try {
    return window.localStorage.getItem(BEWEGUNG_SCHLUESSEL) !== "aus";
  } catch {
    return true;
  }
}

export function schreibeBewegung(an: boolean): void {
  try {
    window.localStorage.setItem(BEWEGUNG_SCHLUESSEL, an ? "an" : "aus");
  } catch {
    // Speicher gesperrt: gilt dann nur fuer diese Sitzung
  }
  document.documentElement.toggleAttribute("data-hb-still", !an);
}

export interface Inventar {
  /** Welche der drei Trachten (himbi.tsx, TRACHTEN) Chapan, Aermel, Kappe und Stiefel tragen. */
  tracht: 0 | 1 | 2;
  /** Die gelbe Spassbrille. */
  brille: boolean;
}

const INVENTAR_SCHLUESSEL = "damicon-haustier-inventar";
const INVENTAR_STANDARD: Inventar = { tracht: 0, brille: true };

/** Liest die gespeicherte Tracht. Alles Unbekannte (leer, kaputt, alter Wert) heisst: die
 *  Standardtracht - dieselbe, mit der Himbi schon immer auftrat. */
export function leseInventar(): Inventar {
  try {
    const roh = window.localStorage.getItem(INVENTAR_SCHLUESSEL);
    if (!roh) return INVENTAR_STANDARD;
    const wert = JSON.parse(roh) as Partial<Inventar>;
    const tracht = wert.tracht === 1 || wert.tracht === 2 ? wert.tracht : 0;
    const brille = typeof wert.brille === "boolean" ? wert.brille : true;
    return { tracht, brille };
  } catch {
    return INVENTAR_STANDARD;
  }
}

export function schreibeInventar(inventar: Inventar): void {
  try {
    window.localStorage.setItem(INVENTAR_SCHLUESSEL, JSON.stringify(inventar));
  } catch {
    // gesperrter Speicher: die Wahl gilt nur fuer diese Sitzung
  }
}

/** an = Himbi ist da. weg = weggeschickt, nur die Blattspitze schaut am Rand heraus (ein Klick holt sie
 *  zurueck). aus = in den Einstellungen ganz abgeschaltet, auch die Spitze bleibt weg. */
export type Sichtbarkeit = "an" | "weg" | "aus";

/** Liest den gespeicherten Wert. Alles Unbekannte (leer, kaputt, alter Wert) heisst: da. */
export function leseSichtbarkeit(roh: string | null | undefined): Sichtbarkeit {
  return roh === "weg" || roh === "aus" ? roh : "an";
}

/** Was der Chat gerade tut, in einer Zahl von Faellen. Eine offene Freigabe gewinnt vor allem
 *  anderen: der Agent wartet auf den Menschen, alles andere kann warten. */
export function agentPhase(a: { beschaeftigt: boolean; freigabeOffen: boolean; fehler: boolean }): AgentPhase {
  if (a.freigabeOffen) return "freigabe";
  if (a.beschaeftigt) return "arbeitet";
  if (a.fehler) return "fehler";
  return "ruhe";
}

/** Der Zustand der Figur. Rangfolge: was Aufmerksamkeit braucht, steht vorn. */
export function haustierZustand(a: {
  phase: AgentPhase;
  /** Antwort kam an, waehrend das Panel zu war, und wurde noch nicht angesehen. */
  fertigUngelesen: boolean;
  schlaeft: boolean;
  spricht?: boolean;
}): HaustierZustand {
  if (a.phase === "freigabe") return "freigabe";
  if (a.phase === "fehler") return "fehler";
  if (a.phase === "arbeitet") return "denkt";
  if (a.spricht) return "spricht";
  if (a.fertigUngelesen) return "fertig";
  if (a.schlaeft) return "schlaeft";
  return "ruhe";
}

/** Das Modul zu einem Pfad wie "/dashboard/buero/lohn" (ohne Sprachpraefix). */
export function modulAusPfad<M extends { zone: string; slug: string }>(pfad: string, module: readonly M[]): M | null {
  const teile = pfad.split("?")[0]!.split("/").filter(Boolean);
  if (teile[0] !== "dashboard" || teile.length < 3) return null;
  return module.find((m) => m.zone === teile[1] && m.slug === teile[2]) ?? null;
}

/** Die Stationen der Tour auf der oeffentlichen Startseite. anker = id des Abschnitts. */
export const TOUR_SCHRITTE = [
  { schluessel: "himbeere", anker: "himbeere" },
  { schluessel: "sechzig", anker: "sechzig-minuten" },
  { schluessel: "beleg", anker: "belegbarkeit" },
  { schluessel: "zonen", anker: "zonen" },
  { schluessel: "kpis", anker: "kpis" },
  { schluessel: "compliance", anker: "compliance" },
  { schluessel: "fragen", anker: "fragen" },
] as const;

export type TourSchluessel = (typeof TOUR_SCHRITTE)[number]["schluessel"];

/** Wie lange eine Tourstation im Autopilot stehen bleibt: grob die Lesezeit des Textes, mindestens
 *  gut lesbar, hoechstens nicht zaeh. */
export function tourDauer(text: string): number {
  return Math.min(9500, Math.max(5500, 3800 + text.length * 48));
}

const FOKUS_KLASSE = "haustier-fokus";

/** Scrollt weich zu einem Abschnitt und hebt ihn kurz farbig hervor (Klasse haustier-fokus,
 *  siehe haustier.css) - fuer jede Fuehrung, die auf einen Teil der Seite zeigt (Compliance-Tour,
 *  Live-Lauf-Hinweis). Die Bedingung kommt von aussen (lib/bewegung.ts), damit diese Datei ohne
 *  React bleibt (siehe Kopfkommentar).
 *
 *  scrollIntoView statt eigener scrollTo-Rechnung: findet den tatsaechlichen Scroll-Container
 *  selbst (nicht zwingend das Fenster) und haelt sich an scroll-margin-top, das die Ziele selbst
 *  tragen ([id^="compliance-"] in pruefung.css) - damit bleibt der Abstand zur festen Kopfzeile
 *  an EINER Stelle gepflegt, nicht als Zahl hier UND als CSS-Wert dort. Kein Sprunglink wie auf
 *  der oeffentlichen Startseite (haustier-tour.tsx): dort muss der Weg ueber Lenis (weiches-
 *  scrollen.tsx) laufen, um nicht mit dessen eigenem Scrollen zu kaempfen - das Dashboard nutzt
 *  kein Lenis, direktes scrollIntoView ist hier das einfachere und verlaesslichere Mittel. */
export function springeZuAnker(anker: string, bedingungen: { bewegungReduziert: boolean }): void {
  const ziel = document.getElementById(anker);
  if (!ziel) return;
  ziel.scrollIntoView({ behavior: bedingungen.bewegungReduziert ? "auto" : "smooth", block: "start" });
  ziel.classList.remove(FOKUS_KLASSE);
  void ziel.offsetWidth;
  window.setTimeout(() => ziel.classList.add(FOKUS_KLASSE), 500);
  window.setTimeout(() => ziel.classList.remove(FOKUS_KLASSE), 3300);
}
