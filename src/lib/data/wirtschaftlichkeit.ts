import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Json } from "@/lib/database.types";
import {
  ANNAHME_SCHLUESSEL,
  herleiteSchwundNutzen,
  prozentAusText,
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
  type SchwundEingabe,
  type SchwundErgebnis,
  type StandSnapshot,
} from "@/lib/domain/wirtschaftlichkeit-erfassung";
import { heuteIso } from "@/lib/data/util";
import { BETRIEB_ANNAHME_SCHLUESSEL, type BetriebIst, type BetriebsAnnahmen } from "@/lib/domain/betriebsrechnung";
import { liesI18n, type I18nSpalte } from "@/lib/i18n-daten";

// Erfassung der Investitionsrechnung (WMCNL-2470). Lesen duerfen Administration, Geschaeftsfuehrung, Betriebsleitung und
// Buchhaltung (Zeilensicherheit der vier Tabellen, Migration 20261207090000). Ohne Datenbank rechnet die Seite mit den
// Modellwerten der Kennzahlenliste und erlaubt keine Erfassung: ein Formular ohne Speicher waere Irrefuehrung.

export interface StandKopf {
  id: string;
  bezeichnung: string;
  standAm: string;
  /** Übersetzungen von bezeichnung (Spalte i18n). */
  i18n?: I18nSpalte;
}

export interface WirtschaftlichkeitDaten {
  /** "modell": keine Datenbank, die Zahlen sind die Modellwerte. */
  quelle: "datenbank" | "modell";
  annahmen: Annahmen;
  posten: Posten[];
  ist: IstEintrag[];
  staende: StandKopf[];
  menge: MengeAbgeleitet | null;
  /** Planung des Betriebs (Betriebsrechnung); ohne Datenbank und ohne gesetzte Werte alles offen. */
  betrieb: BetriebsAnnahmen;
  /** Die letzten zwoelf Monate aus dem Finanzjournal als Vergleichswert; null, wenn die Abfrage fehlschlug. */
  betriebIst: BetriebIst | null;
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

/** Die Herkunft der Planung des Betriebs aus derselben jsonb-Spalte; unbekannte Schluessel fallen weg. */
function liesBetriebHerkunft(wert: Json | null): BetriebsAnnahmen["herkunft"] {
  const aus: BetriebsAnnahmen["herkunft"] = {};
  if (typeof wert !== "object" || wert === null || Array.isArray(wert)) return aus;
  for (const schluessel of [...BETRIEB_ANNAHME_SCHLUESSEL, "menge"] as const) {
    const h = herkunftVon(wert[schluessel]);
    if (h) aus[schluessel] = h;
  }
  return aus;
}

const leereBetriebsAnnahmen = (): BetriebsAnnahmen => ({
  mengeKg: null,
  preisTengeKg: null,
  variableKostenTengeKg: null,
  mengeEntwicklung: null,
  preisEntwicklung: null,
  kostenEntwicklung: null,
  fixkostenEntwicklung: null,
  abschreibungJahre: null,
  herkunft: {},
});

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
    betrieb: leereBetriebsAnnahmen(),
    betriebIst: null,
    lesefehler: false,
  };
}

function zeileZuIst(z: { erloes_tenge: number; kosten_tenge: number; menge_kg: number; buchungen: number; von: string; bis: string }): BetriebIst {
  return { erloesTenge: Number(z.erloes_tenge), kostenTenge: Number(z.kosten_tenge), mengeKg: Number(z.menge_kg), buchungen: Number(z.buchungen), von: z.von, bis: z.bis };
}

export async function ladeWirtschaftlichkeit(): Promise<WirtschaftlichkeitDaten> {
  if (!isSupabaseConfigured()) return modell();

  const supabase = await createClient();
  const [annahmen, posten, ist, staende, menge, betriebIst] = await Promise.all([
    supabase.from("wirtschaftlichkeit_annahmen").select("*").eq("id", 1).maybeSingle(),
    supabase.from("wirtschaftlichkeit_posten").select("id, art, kategorie, bezeichnung, betrag, waehrung, datum, herkunft, notiz, i18n").order("datum", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("wirtschaftlichkeit_ist").select("id, monat, kategorie, betrag, waehrung, notiz, i18n").order("monat", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("wirtschaftlichkeit_staende").select("id, bezeichnung, stand_am, i18n").order("stand_am", { ascending: false }),
    supabase.from("v_vermarktete_menge").select("menge_kg_12_monate, erste_lieferung, tage_abdeckung, belastbar").maybeSingle(),
    supabase.rpc("betrieb_ist_zwoelf_monate"),
  ]);
  // Der Vergleichswert gehoert nicht zur Rechnung: schlaegt er fehl, fehlt nur der Hinweis neben den Annahmen, nicht die Seite.
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
        i18n: liesI18n(p.i18n),
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
        i18n: liesI18n(e.i18n),
      })),
    betrieb: a
      ? {
          mengeKg: zahlOderNull(a.vermarktete_menge_kg),
          preisTengeKg: zahlOderNull(a.plan_preis_tenge_kg),
          variableKostenTengeKg: zahlOderNull(a.plan_variable_kosten_tenge_kg),
          mengeEntwicklung: zahlOderNull(a.plan_menge_entwicklung),
          preisEntwicklung: zahlOderNull(a.plan_preis_entwicklung),
          kostenEntwicklung: zahlOderNull(a.plan_kosten_entwicklung),
          fixkostenEntwicklung: zahlOderNull(a.plan_fixkosten_entwicklung),
          abschreibungJahre: a.plan_abschreibung_jahre,
          herkunft: liesBetriebHerkunft(a.herkunft),
        }
      : leereBetriebsAnnahmen(),
    betriebIst: betriebIst.error || !betriebIst.data?.[0] ? null : zeileZuIst(betriebIst.data[0]),
    staende: (staende.data ?? []).map((s) => ({ id: s.id, bezeichnung: s.bezeichnung, standAm: s.stand_am, i18n: liesI18n(s.i18n) })),
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
  const { data, error } = await supabase.from("wirtschaftlichkeit_staende").select("id, bezeichnung, stand_am, i18n, snapshot").eq("id", id).maybeSingle();
  if (error) console.error("[damicon] Stand lesen fehlgeschlagen:", error.message);
  if (!data) return null;
  const snapshot = liesSnapshot(data.snapshot);
  if (!snapshot) return null;
  return { kopf: { id: data.id, bezeichnung: data.bezeichnung, standAm: data.stand_am, i18n: liesI18n(data.i18n) }, snapshot: await mitUebersetzungen(snapshot) };
}

/**
 * Ein Stand haelt Posten und Ist-Werte so fest, wie sie damals waren. Die Uebersetzungen kamen erst spaeter dazu, ein aelterer Stand traegt sie nicht. Fuer Zeilen
 * ohne eigene Uebersetzung holt diese Funktion sie von der heutigen Zeile mit derselben Id: der Text der Zeile aendert sich nicht (der Trigger nimmt die
 * Uebersetzung zurueck, wenn das Original sich aendert), also passt sie zum festgehaltenen Original. Ohne Treffer bleibt das Original.
 */
async function mitUebersetzungen(snapshot: StandSnapshot): Promise<StandSnapshot> {
  const fehlenPosten = snapshot.posten.filter((p) => p.i18n === undefined).map((p) => p.id);
  const fehlenIst = snapshot.ist.filter((e) => e.i18n === undefined).map((e) => e.id);
  if (fehlenPosten.length === 0 && fehlenIst.length === 0) return snapshot;
  const supabase = await createClient();
  const [posten, ist] = await Promise.all([
    fehlenPosten.length > 0 ? supabase.from("wirtschaftlichkeit_posten").select("id, i18n").in("id", fehlenPosten).limit(500) : Promise.resolve({ data: [] as { id: string; i18n: Json }[] }),
    fehlenIst.length > 0 ? supabase.from("wirtschaftlichkeit_ist").select("id, i18n").in("id", fehlenIst).limit(500) : Promise.resolve({ data: [] as { id: string; i18n: Json }[] }),
  ]);
  const jeId = (zeilen: { id: string; i18n: Json }[] | null) => new Map((zeilen ?? []).map((z) => [z.id, liesI18n(z.i18n)]));
  const postenI18n = jeId(posten.data);
  const istI18n = jeId(ist.data);
  return {
    ...snapshot,
    posten: snapshot.posten.map((p) => (p.i18n === undefined && postenI18n.has(p.id) ? { ...p, i18n: postenI18n.get(p.id) } : p)),
    ist: snapshot.ist.map((e) => (e.i18n === undefined && istI18n.has(e.id) ? { ...e, i18n: istI18n.get(e.id) } : e)),
  };
}

export interface SchwundHerleitung {
  eingabe: SchwundEingabe;
  ergebnis: SchwundErgebnis;
  /** Zeitraum der Chargen, auf denen die heutige Quote beruht. */
  von: string | null;
  bis: string | null;
}

/**
 * Die Herleitung des Schwund-Nutzens aus der Baseline und den Chargen (Migration 20261208140000). Null ohne Datenbank oder wenn das Lesen scheitert: eine
 * Herleitung aus erfundenen Zahlen waere schlimmer als keine.
 */
export async function ladeSchwundHerleitung(annahmen: Pick<Annahmen, "vollkostenVorherTenge" | "kurse">): Promise<SchwundHerleitung | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const [baseline, betrieb] = await Promise.all([
    supabase.from("kpi_baseline").select("baseline_wert").eq("key", "verlustquote").maybeSingle(),
    supabase.rpc("schwund_herleitung"),
  ]);
  if (baseline.error || betrieb.error) {
    console.error("[damicon] Schwund-Herleitung lesen fehlgeschlagen:", (baseline.error ?? betrieb.error)?.message);
    return null;
  }
  const zeile = betrieb.data?.[0] ?? null;
  const eingabe: SchwundEingabe = {
    verlustVorherProzent: prozentAusText(baseline.data?.baseline_wert ?? null),
    verlustJetztProzent: zeile ? Number(zeile.verlust_prozent) : null,
    gesamtMengeKg: zeile ? Number(zeile.gesamt_kg) : null,
    chargen: zeile ? Number(zeile.chargen) : 0,
    kostenJeKgTenge: annahmen.vollkostenVorherTenge,
    kursEurTenge: annahmen.kurse.eurTenge,
  };
  return { eingabe, ergebnis: herleiteSchwundNutzen(eingabe), von: zeile?.von ?? null, bis: zeile?.bis ?? null };
}
