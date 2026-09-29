// Reine Logik fuer Himbi, den Begleiter (components/haustier). Ohne React, damit sie
// testbar bleibt: welchen Zustand hat die Himbeere, wenn der Agent gerade dies oder
// das tut, welchem Modul gehoert ein Pfad, wie sieht die Tour aus.

import { bewegungReduziert } from "@/lib/bewegung";
import { browserAblage, type Ablage } from "@/lib/browser-ablage";
import { TAGESBEGINN_SCHALTER, TAGESBEGINN_STANDARD } from "@/lib/himbi-tagesbeginn";

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

/** Soll Himbi still stehen? Die Systemeinstellung (prefers-reduced-motion) oder der eigene
 *  Schalter "Bewegung" (data-hb-still am Dokument, gesetzt von schreibeBewegung und beim
 *  Start in haustier-kontext.tsx). Das Attribut ist der aktuelle Stand, der Speicher nur
 *  seine Herkunft. Nur im Browser aufrufen. */
export function himbiStill(): boolean {
  return bewegungReduziert() || document.documentElement.hasAttribute("data-hb-still");
}

/** Wie weit die Pupillen hoechstens wandern (SVG-Einheiten; Auge rx 8,4, Pupille r 5,2). */
export const AUGEN_MAX = 3.4;

/** Blick beim Nachdenken: nach oben links. Gilt in der Ecke wie im Sprachmodus. */
export const BLICK_DENKT = { x: -2.6, y: -2.8 } as const;

/** Blickrichtung zu einem Punkt, der dx/dy Pixel von den Augen entfernt liegt: die
 *  Pupillen wandern bis AUGEN_MAX in seine Richtung, bei nahen Punkten (unter nahPx)
 *  entsprechend weniger, sonst schielte Himbi auf alles direkt neben sich. */
export function blickRichtung(dx: number, dy: number, max = AUGEN_MAX, nahPx = 140): { x: number; y: number } {
  const d = Math.hypot(dx, dy) || 1;
  const staerke = Math.min(1, d / nahPx);
  return { x: (dx / d) * max * staerke, y: (dy / d) * max * staerke };
}

/** Schreibt den Bewegungsschalter und setzt ihn sofort am Dokument (data-hb-still). */
export function schreibeBewegung(an: boolean): void {
  bewegungSpeicher.schreibe(an);
  document.documentElement.toggleAttribute("data-hb-still", !an);
}

const TOUR_SCHLUESSEL = "damicon-haustier-tour";

// Automatischer Start von Tour UND Zusammenfassung nach einer Pruefung (und das einmalige
// Angebot dazu). Aus heisst: nichts startet von selbst - die Knoepfe in der Uebersicht
// ("Tour erneut starten", "Zusammenfassung im Chat") bleiben. Voreinstellung AUS (seit
// 25.09.2026, Rueckmeldung: "per Default aus, wenn der User es braucht, schaltet er sie ein"):
// nur ein ausdruecklich gespeichertes "an" startet von selbst.
const AUTO_SCHLUESSEL = "damicon-haustier-auto";

export interface Inventar {
  /** Welche der drei Trachten (himbi.tsx, TRACHTEN) Chapan, Aermel, Kappe und Stiefel tragen. */
  tracht: 0 | 1 | 2;
  /** Die gelbe Spassbrille. */
  brille: boolean;
}

const INVENTAR_SCHLUESSEL = "damicon-haustier-inventar";
/** Die Standardtracht - dieselbe, mit der Himbi schon immer auftrat. */
const INVENTAR_STANDARD: Inventar = { tracht: 0, brille: true };

/** an = Himbi ist da. weg = weggeschickt, nur die Blattspitze schaut am Rand heraus (ein Klick holt sie
 *  zurueck). aus = in den Einstellungen ganz abgeschaltet, auch die Spitze bleibt weg. */
export type Sichtbarkeit = "an" | "weg" | "aus";

const SICHTBARKEIT_STANDARD: Sichtbarkeit = "an";

/** Liest den gespeicherten Wert. Alles Unbekannte (leer, kaputt, alter Wert) heisst: da. */
export function leseSichtbarkeit(roh: string | null | undefined): Sichtbarkeit {
  return roh === "weg" || roh === "aus" ? roh : SICHTBARKEIT_STANDARD;
}

// ---- Einstellungen im Browser-Speicher -------------------------------------------------

/**
 * Ein Wert im Browser-Speicher, angebunden an useSyncExternalStore (haustier-kontext.tsx,
 * haustier-einstellung.tsx): lese ist der Stand, serverWert der Wert beim Hydrieren (React nimmt
 * erst ihn, dann den echten), abonniere meldet eigene Schreibvorgaenge und Aenderungen aus
 * anderen Tabs (storage-Ereignis).
 */
export interface BrowserSpeicher<T> {
  lese: () => T;
  schreibe: (neu: T) => void;
  abonniere: (melde: () => void) => () => void;
  serverWert: () => T;
}

/**
 * Baut einen solchen Speicher. Seit dem 28.09.2026 eine Fabrik statt sechs fast gleicher Kopien
 * in haustier-kontext.tsx, haustier-einstellung.tsx und hier (Fund 57): die Voreinstellung steht
 * genau einmal, als `standard`, und gilt fuer leeren, unbekannten oder gesperrten Speicher und
 * als Serverwert. Der Zugang laeuft ueber browserAblage() wie beim Tagesmerker (Fund 66).
 *
 * Fuer denselben gespeicherten Text liefert lese dieselbe Referenz: useSyncExternalStore haelt
 * ein neues Objekt bei jedem Aufruf sonst fuer eine Endlosschleife (die Tracht ist ein Objekt).
 */
export function erzeugeBrowserSpeicher<T>(
  schluessel: string,
  standard: T,
  format: { lies: (roh: string) => T | null; schreib: (wert: T) => string },
): BrowserSpeicher<T> {
  const beobachter = new Set<() => void>();
  // Nur, wenn der Speicher das Schreiben ablehnt (privates Fenster, voll): dann gilt der Wert
  // fuer diese Sitzung. Bis zum 29.09.2026 wurde er bei JEDEM Schreiben gesetzt und danach
  // vorrangig gelesen; eine Aenderung aus einem anderen Tab kam nach dem ersten eigenen Schreiben
  // nicht mehr an, obwohl das storage-Ereignis neu lesen liess (Fund 58 der Pruefung vom 28.09.2026).
  let nurSitzung: { wert: T } | null = null;
  let zuletzt: { roh: string | null; wert: T } | null = null;
  return {
    lese() {
      if (nurSitzung) return nurSitzung.wert;
      let roh: string | null = null;
      try {
        roh = browserAblage()?.getItem(schluessel) ?? null;
      } catch {
        // Lesen gesperrt: wie leer, also die Voreinstellung
      }
      if (zuletzt && zuletzt.roh === roh) return zuletzt.wert;
      const wert = roh === null ? standard : (format.lies(roh) ?? standard);
      zuletzt = { roh, wert };
      return wert;
    },
    schreibe(neu) {
      try {
        const ablage = browserAblage();
        if (!ablage) throw new Error("kein Speicher");
        ablage.setItem(schluessel, format.schreib(neu));
        nurSitzung = null;
      } catch {
        nurSitzung = { wert: neu };
      }
      beobachter.forEach((b) => b());
    },
    abonniere(melde) {
      beobachter.add(melde);
      window.addEventListener("storage", melde);
      return () => {
        beobachter.delete(melde);
        window.removeEventListener("storage", melde);
      };
    },
    serverWert: () => standard,
  };
}

/** Ein Schalter: gespeichert als "an" oder "aus", alles andere heisst `standard`. */
export function erzeugeSchalterSpeicher(schluessel: string, standard: boolean): BrowserSpeicher<boolean> {
  return erzeugeBrowserSpeicher(schluessel, standard, {
    lies: (roh) => (roh === "an" ? true : roh === "aus" ? false : null),
    schreib: (an) => (an ? "an" : "aus"),
  });
}

/** Ob Himbi da, weggeschickt oder ganz aus ist. */
export const sichtbarkeitSpeicher = erzeugeBrowserSpeicher<Sichtbarkeit>("damicon-haustier", SICHTBARKEIT_STANDARD, {
  lies: leseSichtbarkeit,
  schreib: (wert) => wert,
});

/** Bewegung der Figur: an, solange nichts anderes gespeichert ist. Das Betriebssystem kann sie
 *  ueber prefers-reduced-motion ohnehin abbestellen - dieser Schalter ist fuer alle, die die Figur
 *  moegen, aber nicht das Zappeln, und die dafuer nicht die Einstellung ihres ganzen Rechners
 *  aendern wollen. Geschrieben wird ueber schreibeBewegung (setzt auch data-hb-still). */
export const bewegungSpeicher = erzeugeSchalterSpeicher("damicon-haustier-bewegung", true);

/** Die gefuehrte Compliance-Tour (use-compliance-tour.tsx): an, solange nichts anderes
 *  gespeichert ist. Wer sie abstellt, bekommt trotzdem weiter die automatische Zusammenfassung
 *  im Chat - nur das Herumspringen und Hervorheben auf der Seite entfaellt, systemweit. */
export const tourSpeicher = erzeugeSchalterSpeicher(TOUR_SCHLUESSEL, true);

/** Automatischer Start nach einer Pruefung, Voreinstellung aus (siehe AUTO_SCHLUESSEL oben). */
export const autoStartSpeicher = erzeugeSchalterSpeicher(AUTO_SCHLUESSEL, false);

/** "Himbi beginnt den Tag mit mir" (lib/himbi-tagesbeginn.ts): einmal am Tag fragt Himbi von sich
 *  aus nach der Tageslage, im Gespraech und als Sprechblase. Voreinstellung AN (Rueckmeldung vom
 *  28.09.2026), anders als der automatische Start. */
export const tagesbeginnSpeicher = erzeugeSchalterSpeicher(TAGESBEGINN_SCHALTER, TAGESBEGINN_STANDARD);

/** Die gespeicherte Tracht. Kaputtes oder Unbekanntes heisst die Standardtracht, ein fehlendes
 *  Feld dessen Standard. */
export const inventarSpeicher = erzeugeBrowserSpeicher<Inventar>(INVENTAR_SCHLUESSEL, INVENTAR_STANDARD, {
  lies: (roh) => {
    let wert: unknown;
    try {
      wert = JSON.parse(roh);
    } catch {
      return null;
    }
    if (typeof wert !== "object" || wert === null) return null;
    const { tracht, brille } = wert as Partial<Inventar>;
    return {
      tracht: tracht === 1 || tracht === 2 ? tracht : INVENTAR_STANDARD.tracht,
      brille: typeof brille === "boolean" ? brille : INVENTAR_STANDARD.brille,
    };
  },
  schreib: (inventar) => JSON.stringify(inventar),
});

// ---- Tipp-Merker ------------------------------------------------------------------------

/**
 * Der Sitzungsmerker "Tipp fuer dieses Modul gezeigt" (haustier-dashboard.tsx). Bis zum
 * 28.09.2026 stand der Schluessel dort zweimal als eigenes Literal, einmal beim Lesen und
 * einmal beim Schreiben (Fund 65): aenderte jemand nur eines, kam der Tipp in jeder Sitzung
 * wieder, ohne dass etwas auffiel.
 */
export function tippMerker(modulKey: string): string {
  return `damicon-haustier-tipp:${modulKey}`;
}

/** Wurde der Tipp dieses Moduls in dieser Sitzung schon gezeigt? Ohne Speicher nein (dann kommt er
 *  bei jedem Besuch, das ist verkraftbar). */
export function tippSchonGezeigt(ablage: Ablage | null, modulKey: string): boolean {
  if (!ablage) return false;
  try {
    return Boolean(ablage.getItem(tippMerker(modulKey)));
  } catch {
    return false;
  }
}

export function merkeTippGezeigt(ablage: Ablage | null, modulKey: string): void {
  if (!ablage) return;
  try {
    ablage.setItem(tippMerker(modulKey), "1");
  } catch {
    // gesperrter Speicher: siehe tippSchonGezeigt
  }
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

/**
 * Alle Sprechblasen im Dashboard (haustier-dashboard.tsx), dringendste zuerst. Diese Liste ist
 * die EINZIGE Stelle fuer die Rangfolge (Fund 53 vom 28.09.2026): vorher trugen Befinden,
 * Tour-Frage, Tipp und Anstupser eigene Ausschluesse (!tipp, !befindenSichtbar ...), und die
 * wirksame Reihenfolge wich von der Liste ab. Liegen Tour-Frage, Tagesgruss und Tipp zugleich
 * bereit, kam der Tagesgruss vor der Tour-Frage, sonst nicht. Heute:
 *   - Meldungen des Agenten und die laufende Fuehrung vor allem, was Himbi von sich aus sagt,
 *   - der Tagesgruss vor dem Modultipp (er ist der Anfang des Tages),
 *   - die Antwort auf das Befinden vor dem Tipp (sie folgt direkt auf eine Eingabe),
 *   - der Tipp vor der Befindens-Frage und den Anstupsern (so war es schon vorher gewollt).
 * Die einzige Aenderung im Verhalten: ein wartender Tipp verdraengt die Tour-Frage nicht mehr,
 * sie kommt vor ihm, wie sie auch vor dem Tagesgruss kommt. Warum so und nicht umgekehrt: die
 * Tour-Frage folgt auf eine gerade abgeschlossene Pruefung, der Modultipp ist allgemein und
 * wartet ohnehin, bis er gezeigt wurde (Merker erst dann), er geht also nicht verloren. Der
 * Tipp vor der Tour-Frage haette dagegen den Tagesgruss vor den Tipp und die Tour-Frage vor den
 * Tagesgruss gestellt, ein Kreis ohne feste Reihenfolge.
 */
export const BLASEN_RANGFOLGE = [
  "willkommen",
  "freigabe",
  "arbeitet",
  "fehler",
  "fertig",
  "liveHinweis",
  "tourAktiv",
  "tourFrage",
  "tagesgruss",
  "befindenAntwort",
  "tipp",
  "befinden",
  "anstupser",
] as const;
export type BlasenArt = (typeof BLASEN_RANGFOLGE)[number];

/** Was im Dashboard gerade ansteht (haustier-dashboard.tsx), als reine Daten. */
export interface BlasenLage {
  /** Himbi wurde gerade zurueckgeholt ("Da bin ich wieder"). */
  willkommen: boolean;
  phase: AgentPhase;
  /** Eine Antwort kam bei geschlossenem Panel an und wurde noch nicht angesehen. */
  fertigBlase: boolean;
  /** Live-Lauf-Hinweis und laufende Compliance-Tour, schon mit ihren eigenen Bedingungen: sie
   *  steuern in der Komponente auch Miene und Blick der Figur. */
  liveHinweis: boolean;
  tourAktiv: boolean;
  /** Nichts los: kein Panel offen, keine laufende und keine ungelesene Antwort. */
  ruhigGenug: boolean;
  sprachmodus: boolean;
  /** Die Einstellung "Himbi beginnt den Tag mit mir". */
  tagesbeginnAn: boolean;
  // Was bereitliegt, ohne Ruecksicht auf die anderen Blasen:
  tourFrage: boolean;
  tagesgruss: boolean;
  befindenAntwort: boolean;
  tipp: boolean;
  befinden: boolean;
  anstupser: boolean;
}

/**
 * Die Kandidaten in der Rangfolge. Je Blase steht hier nur, ob SIE etwas zu sagen hat, nie, ob eine
 * andere wichtiger ist: das entscheidet allein BLASEN_RANGFOLGE (Fund 53). Was Himbi von sich aus
 * sagt, kommt nur bei Ruhe; der Tagesgruss zusaetzlich nicht im Sprachmodus (dort beginnt das
 * Gespraech den Tag) und nur mit der Einstellung.
 */
export function blasenKandidaten(lage: BlasenLage): BlasenKandidat<BlasenArt>[] {
  const vonSichAus = (liegtBereit: boolean) => liegtBereit && lage.ruhigGenug;
  const bereit: Record<BlasenArt, boolean> = {
    willkommen: lage.willkommen,
    freigabe: lage.phase === "freigabe",
    arbeitet: lage.phase === "arbeitet",
    fehler: lage.phase === "fehler",
    fertig: lage.fertigBlase,
    liveHinweis: lage.liveHinweis,
    tourAktiv: lage.tourAktiv,
    tourFrage: vonSichAus(lage.tourFrage),
    tagesgruss: vonSichAus(lage.tagesgruss) && !lage.sprachmodus && lage.tagesbeginnAn,
    befindenAntwort: lage.befindenAntwort,
    tipp: vonSichAus(lage.tipp),
    befinden: vonSichAus(lage.befinden),
    anstupser: vonSichAus(lage.anstupser),
  };
  return BLASEN_RANGFOLGE.map((art) => ({ art, sichtbar: bereit[art] }));
}

/** Ein Anwaerter auf Himbis Sprechblase: welche Blase, und ob ihre eigene Bedingung erfuellt ist. */
export interface BlasenKandidat<A extends string> {
  art: A;
  sichtbar: boolean;
}

/**
 * Welche Sprechblase Himbi zeigt. Die Liste ist nach Dringlichkeit geordnet, die erste sichtbare
 * gewinnt; bei offenem Panel gibt es keine Blase.
 *
 * gewaehlt: die Blase, die gezeichnet wird. gezeigt: dieselbe, aber nur, wenn ein Mensch sie
 * auch sehen kann (Figur im Bild, Seite im Vordergrund). Merker ("heute schon begruesst", "Tipp
 * fuer dieses Modul gezeigt") und Anzeigedauer haengen an gezeigt, nicht am Zeitpunkt, zu dem
 * eine Blase bereitliegt (Befund vom 28.09.2026: der Tagesgruss wurde hinter der Tour-Frage und
 * im Hintergrund-Tab als gezeigt gemerkt, der Modultipp lief hinter dem Tagesgruss ab).
 */
export function sichtbareBlase<A extends string>(
  kandidaten: readonly BlasenKandidat<A>[],
  lage: { paneOffen: boolean; figurImBild: boolean; seiteSichtbar: boolean },
): { gewaehlt: A | null; gezeigt: A | null } {
  const gewaehlt = lage.paneOffen ? null : (kandidaten.find((k) => k.sichtbar)?.art ?? null);
  return { gewaehlt, gezeigt: lage.figurImBild && lage.seiteSichtbar ? gewaehlt : null };
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
