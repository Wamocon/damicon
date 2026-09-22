import { kennzahlen, sortiereBefunde } from "@/lib/pruefung/befund";
import { PRUEFBEREICHE, type Pruefbereich } from "@/lib/pruefung/rollen";
import type {
  BefundAenderung,
  BefundStatus,
  Bericht,
  Frist,
  Kennzahlen,
  Schwere,
} from "@/lib/pruefung/typen";

// Leitet aus einem gespeicherten Pruefbericht ab, was auf der Uebersichtsseite steht:
// "Das Wichtigste heute" und die vier Bereichskacheln. Rein und ohne React, Datenbank
// oder Uebersetzungen - dasselbe Muster wie domain/risikoradar.ts, damit die Auswahl
// ohne Modell und ohne Supabase pruefbar ist (supabase/tests/tagesbericht.ts).
//
// KEIN neuer Modellaufruf. bericht.zusammenfassung (max. 500 Zeichen) und
// bericht.prioritaeten (max. 3) erzeugt der Pruefllauf bereits, mit deterministischem
// Rueckfall bei Modellausfall (lib/pruefung/agenten.ts). Hier wird ausgewaehlt und
// gereiht, nicht formuliert.
//
// Robustheit: lib/data/compliance-ceo.ts nimmt die jsonb-Spalte ungeprueft mit
// "as Bericht" entgegen. Eine aeltere oder beschnittene Zeile darf die Startseite
// nicht kippen, deshalb greift hier alles defensiv zu.

/** Ein Punkt in "Das Wichtigste heute". Der Text kommt unveraendert aus dem Bericht. */
export interface TagesPunkt {
  art: "prioritaet" | "befund" | "massnahme";
  text: string;
  schwere?: Schwere;
  status?: BefundStatus;
  bereich?: Pruefbereich;
  frist?: Frist;
  /** Zum Nachschlagen im vollen Bericht; bei art "prioritaet" nicht gesetzt. */
  befundId?: string;
}

export interface Tagesbericht {
  vorhanden: boolean;
  erstelltAm: string | null;
  /** Aelter als 24 Stunden - ein Stand von gestern soll nicht wie der von heute Morgen aussehen. */
  veraltet: boolean;
  reife: number;
  stufe: Kennzahlen["stufe"];
  /** Leer, wenn der Bericht keine traegt. Die Ansicht setzt dann einen Satz aus zahlen ein. */
  zusammenfassung: string;
  /** Hoechstens drei, dringendstes zuerst. */
  punkte: TagesPunkt[];
  zahlen: {
    verstoesse: number;
    luecken: number;
    sofort: number;
    ohneDaten: number;
    aenderungen: number;
  };
  /** Hoechstens drei, schwerste zuerst. */
  aenderungen: BefundAenderung[];
  weitereAenderungen: number;
}

export interface Bereichskachel {
  bereich: Pruefbereich;
  /** false: der Bericht fuehrt diesen Bereich nicht - die Kachel zeigt "nicht geprueft", keine Reife. */
  geprueft: boolean;
  anzahl: number;
  kz: Kennzahlen | null;
  /** Fuer jeden Pruefpunkt dieses Bereichs fehlten die Betriebsdaten. Eine Reife von 100 waere hier gelogen. */
  ohneDaten: boolean;
}

const HOECHSTENS_PUNKTE = 3;
const HOECHSTENS_AENDERUNGEN = 3;
const ALTER_STUNDEN = 24;

const RANG_SCHWERE: Record<Schwere, number> = { kritisch: 0, hoch: 1, mittel: 2, niedrig: 3, keine: 4 };

/** Zieht Leerraum zusammen, damit eine Prioritaet, die einen Befundtitel wiederholt, nicht zweimal dasteht. */
function schluessel(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

const leer: Tagesbericht = {
  vorhanden: false,
  erstelltAm: null,
  veraltet: false,
  reife: 0,
  stufe: "nicht-bereit",
  zusammenfassung: "",
  punkte: [],
  zahlen: { verstoesse: 0, luecken: 0, sofort: 0, ohneDaten: 0, aenderungen: 0 },
  aenderungen: [],
  weitereAenderungen: 0,
};

/**
 * Die drei Punkte werden in dieser Reihenfolge aufgefuellt und danach nicht mehr umsortiert:
 *
 *   1. bericht.prioritaeten, in gespeicherter Reihenfolge. Das Modell hat sie bereits gereiht,
 *      und das Feld heisst genau danach.
 *   2. Reicht das nicht: die schwersten offenen Befunde (verstoss vor luecke, darin nach Schwere).
 *   3. Reicht das immer noch nicht: Massnahmen mit Frist "sofort".
 */
function punkteWaehlen(bericht: Bericht): TagesPunkt[] {
  const punkte: TagesPunkt[] = [];
  const gesehen = new Set<string>();

  const aufnehmen = (p: TagesPunkt) => {
    if (punkte.length >= HOECHSTENS_PUNKTE) return;
    const k = schluessel(p.text);
    if (k === "" || gesehen.has(k)) return;
    gesehen.add(k);
    punkte.push(p);
  };

  for (const text of bericht.prioritaeten ?? []) {
    if (typeof text === "string") aufnehmen({ art: "prioritaet", text });
  }

  const offene = (bericht.befunde ?? []).filter((b) => b.status === "verstoss" || b.status === "luecke");
  // sortiereBefunde() reiht nach Status und Schwere, laesst aber gleichwertige Befunde in der
  // Reihenfolge stehen, in der das Modell sie geliefert hat. Der zweite Vergleich macht die
  // Ausgabe stabil: zwei Laeufe mit demselben Inhalt sollen dasselbe zeigen.
  for (const b of sortiereBefunde(offene).sort((x, y) => {
    const s = RANG_SCHWERE[x.schwere] - RANG_SCHWERE[y.schwere];
    if (s !== 0) return s;
    const r = PRUEFBEREICHE.indexOf(x.bereich) - PRUEFBEREICHE.indexOf(y.bereich);
    return r !== 0 ? r : x.id.localeCompare(y.id);
  })) {
    aufnehmen({ art: "befund", text: b.titel, schwere: b.schwere, status: b.status, bereich: b.bereich, befundId: b.id });
  }

  // bericht.massnahmen ist bereits nach Frist und Schwere sortiert (massnahmenplan()).
  for (const m of bericht.massnahmen ?? []) {
    if (m.frist === "sofort") {
      aufnehmen({ art: "massnahme", text: m.schritt, schwere: m.schwere, frist: m.frist, befundId: m.befundId });
    }
  }

  return punkte;
}

export function tagesbericht(
  bericht: Bericht | null,
  aenderungen: readonly BefundAenderung[],
  jetzt: Date = new Date(),
): Tagesbericht {
  // Eine beschnittene Altzeile zaehlt wie "kein Bericht" - lieber der ehrliche Leerzustand
  // als eine Karte mit Nullen, die wie ein Ergebnis aussieht.
  if (!bericht || !Array.isArray(bericht.befunde)) return leer;

  const kz = kennzahlen(bericht.befunde);
  const sortierte = [...aenderungen].sort((a, b) => RANG_SCHWERE[a.schwere] - RANG_SCHWERE[b.schwere]);
  const erstelltAm = typeof bericht.erstelltAm === "string" ? bericht.erstelltAm : null;
  const alter = erstelltAm ? jetzt.getTime() - new Date(erstelltAm).getTime() : 0;

  return {
    vorhanden: true,
    erstelltAm,
    veraltet: erstelltAm !== null && Number.isFinite(alter) && alter > ALTER_STUNDEN * 3_600_000,
    reife: kz.reife,
    stufe: kz.stufe,
    zusammenfassung: typeof bericht.zusammenfassung === "string" ? bericht.zusammenfassung.trim() : "",
    punkte: punkteWaehlen(bericht),
    zahlen: {
      verstoesse: kz.nachStatus.verstoss,
      luecken: kz.nachStatus.luecke,
      sofort: (bericht.massnahmen ?? []).filter((m) => m.frist === "sofort").length,
      ohneDaten: kz.ohneDaten,
      aenderungen: aenderungen.length,
    },
    aenderungen: sortierte.slice(0, HOECHSTENS_AENDERUNGEN),
    weitereAenderungen: Math.max(0, aenderungen.length - HOECHSTENS_AENDERUNGEN),
  };
}

/**
 * Eine Kachel je Pruefbereich, immer alle vier und immer in derselben Reihenfolge. Eine Kachel,
 * die taeglich die Position wechselt, macht die Seite unlesbar - deshalb wird hier bewusst NICHT
 * nach Schwere sortiert.
 */
export function bereichskacheln(bericht: Bericht | null): Bereichskachel[] {
  return PRUEFBEREICHE.map((bereich) => {
    const gefuehrt = Array.isArray(bericht?.bereiche) && bericht.bereiche.includes(bereich);
    if (!bericht || !gefuehrt || !Array.isArray(bericht.befunde)) {
      return { bereich, geprueft: false, anzahl: 0, kz: null, ohneDaten: false };
    }
    const befunde = bericht.befunde.filter((b) => b.bereich === bereich);
    return {
      bereich,
      geprueft: true,
      anzahl: befunde.length,
      kz: kennzahlen(befunde),
      // Nur wenn JEDER Punkt ohne Betriebsdaten blieb. Ein einzelner reicht nicht:
      // die Reife der uebrigen ist dann echt.
      ohneDaten: befunde.length > 0 && befunde.every((b) => b.ohneDaten === true),
    };
  });
}
