import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Json } from "@/lib/database.types";
import {
  ANNAHME_SCHLUESSEL,
  istNutzenKategorie,
  istPostenArt,
  istWaehrung,
  liesSnapshot,
  modellAnnahmen,
  modellPosten,
  type Annahmen,
  type IstEintrag,
  type MengeAbgeleitet,
  type Posten,
  type PostenHerkunft,
  type StandSnapshot,
} from "@/lib/domain/wirtschaftlichkeit-erfassung";
import { heuteIso } from "@/lib/data/util";

// Erfassung der Investitionsrechnung (WMCNL-2470). Lesen duerfen Administration, Geschaeftsfuehrung, Betriebsleitung und
// Buchhaltung (Zeilensicherheit der vier Tabellen, Migration 20261207090000). Ohne Datenbank rechnet die Seite mit den
// Modellwerten der Kennzahlenliste und erlaubt keine Erfassung: ein Formular ohne Speicher waere Irrefuehrung.

export interface StandKopf {
  id: string;
  bezeichnung: string;
  standAm: string;
}

export interface WirtschaftlichkeitDaten {
  /** "modell": keine Datenbank, die Zahlen sind die Modellwerte. */
  quelle: "datenbank" | "modell";
  annahmen: Annahmen;
  posten: Posten[];
  ist: IstEintrag[];
  staende: StandKopf[];
  menge: MengeAbgeleitet | null;
  /** Mindestens eine Abfrage ist fehlgeschlagen: die Zahlen sind unvollstaendig (fehlende Annahmen ersetzt das Modell). Dann haelt niemand einen Stand fest. */
  lesefehler: boolean;
}

const herkunftVon = (wert: unknown): PostenHerkunft | undefined => (wert === "belegt" || wert === "geschaetzt" ? wert : undefined);

/** Liest die jsonb-Spalte der Annahmen defensiv: unbekannte Schluessel und Fremdwerte fallen weg. */
function liesHerkunft(wert: Json | null): Annahmen["herkunft"] {
  const aus: Annahmen["herkunft"] = {};
  if (typeof wert !== "object" || wert === null || Array.isArray(wert)) return aus;
  for (const schluessel of ANNAHME_SCHLUESSEL) {
    const h = herkunftVon(wert[schluessel]);
    if (h) aus[schluessel] = h;
  }
  return aus;
}

const zahlOderNull = (wert: number | string | null): number | null => (wert === null ? null : Number(wert));

/** Modellwerte ohne Datenbank. Die Bezeichnungen sind hier nie zu sehen (ohne Erfassung keine Tabelle). */
function modell(): WirtschaftlichkeitDaten {
  const bezeichnung = { bezeichnung: "-", kategorie: "-" };
  return {
    quelle: "modell",
    annahmen: modellAnnahmen(),
    posten: modellPosten({ investition: bezeichnung, betrieb: bezeichnung, nutzen: bezeichnung }, heuteIso()),
    ist: [],
    staende: [],
    menge: null,
    lesefehler: false,
  };
}

export async function ladeWirtschaftlichkeit(): Promise<WirtschaftlichkeitDaten> {
  if (!isSupabaseConfigured()) return modell();

  const supabase = await createClient();
  const [annahmen, posten, ist, staende, menge] = await Promise.all([
    supabase.from("wirtschaftlichkeit_annahmen").select("*").eq("id", 1).maybeSingle(),
    supabase.from("wirtschaftlichkeit_posten").select("id, art, kategorie, bezeichnung, betrag, waehrung, datum, herkunft, notiz").order("datum", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("wirtschaftlichkeit_ist").select("id, monat, kategorie, betrag, waehrung, notiz").order("monat", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("wirtschaftlichkeit_staende").select("id, bezeichnung, stand_am").order("stand_am", { ascending: false }),
    supabase.from("v_vermarktete_menge").select("menge_kg_12_monate, erste_lieferung, tage_abdeckung, belastbar").maybeSingle(),
  ]);
  const lesefehler = annahmen.error ?? posten.error ?? ist.error ?? staende.error ?? menge.error;
  if (lesefehler) console.error("[damicon] Wirtschaftlichkeit lesen fehlgeschlagen:", lesefehler.message);

  const a = annahmen.data;
  const standardAnnahmen = modellAnnahmen();
  return {
    quelle: "datenbank",
    lesefehler: lesefehler !== null,
    annahmen: a
      ? {
          kalkulationszins: Number(a.kalkulationszins),
          kurse: { eurTenge: Number(a.kurs_eur_tenge), rubTenge: Number(a.kurs_rub_tenge) },
          kursStichtag: a.kurs_stichtag,
          kursQuelle: a.kurs_quelle,
          vollkostenVorherTenge: zahlOderNull(a.vollkosten_vorher_tenge),
          vermarkteteMengeKg: zahlOderNull(a.vermarktete_menge_kg),
          nutzenbeginnWochen:
            a.nutzenbeginn_wochen_von !== null && a.nutzenbeginn_wochen_bis !== null ? { von: a.nutzenbeginn_wochen_von, bis: a.nutzenbeginn_wochen_bis } : null,
          echtbetriebBeginn: a.echtbetrieb_beginn,
          herkunft: liesHerkunft(a.herkunft),
        }
      : // Die Zeile gehoert zur Migration. Fehlt sie oder ist sie nicht lesbar, rechnet die Seite mit den Modellannahmen, statt zu brechen.
        { ...standardAnnahmen, vermarkteteMengeKg: null, herkunft: {} },
    posten: (posten.data ?? [])
      .filter((p) => istPostenArt(p.art) && istWaehrung(p.waehrung))
      .map((p) => ({
        id: p.id,
        art: p.art as Posten["art"],
        kategorie: p.kategorie,
        bezeichnung: p.bezeichnung,
        betrag: Number(p.betrag),
        waehrung: p.waehrung as Posten["waehrung"],
        datum: p.datum,
        herkunft: herkunftVon(p.herkunft) ?? "geschaetzt",
        notiz: p.notiz,
      })),
    ist: (ist.data ?? [])
      .filter((e) => istNutzenKategorie(e.kategorie) && istWaehrung(e.waehrung))
      .map((e) => ({
        id: e.id,
        monat: e.monat,
        kategorie: e.kategorie as IstEintrag["kategorie"],
        betrag: Number(e.betrag),
        waehrung: e.waehrung as IstEintrag["waehrung"],
        notiz: e.notiz,
      })),
    staende: (staende.data ?? []).map((s) => ({ id: s.id, bezeichnung: s.bezeichnung, standAm: s.stand_am })),
    menge: menge.data
      ? {
          mengeKg12Monate: Number(menge.data.menge_kg_12_monate ?? 0),
          erste: menge.data.erste_lieferung,
          tageAbdeckung: Number(menge.data.tage_abdeckung ?? 0),
          belastbar: menge.data.belastbar === true,
        }
      : null,
  };
}

/** Ein festgehaltener Stand mit seinem Standbild. null, wenn es ihn nicht gibt, er nicht sichtbar oder nicht lesbar ist. */
export async function ladeStand(id: string): Promise<{ kopf: StandKopf; snapshot: StandSnapshot } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("wirtschaftlichkeit_staende").select("id, bezeichnung, stand_am, snapshot").eq("id", id).maybeSingle();
  if (error) console.error("[damicon] Stand lesen fehlgeschlagen:", error.message);
  if (!data) return null;
  const snapshot = liesSnapshot(data.snapshot);
  if (!snapshot) return null;
  return { kopf: { id: data.id, bezeichnung: data.bezeichnung, standAm: data.stand_am }, snapshot };
}
