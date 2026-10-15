import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { seitenModell } from "@/lib/listen/seiten";
import {
  REKLAMATIONEN_PRO_SEITE,
  demoReklamationen,
  type ReklamationEreignis,
  type ReklamationGrund,
  type ReklamationStatus,
} from "@/lib/domain/reklamationen";
import { einsAus } from "@/lib/data/util";

// Reklamationsmanagement (WMCNL-1455). Liste und Detailansicht laufen wie bei
// pflueckaufgaben getrennt: die Liste bleibt leicht, der Verlauf
// (reklamation_ereignisse) wird erst fuer die ausgewaehlte Reklamation
// nachgeladen. Welche Zeilen ueberhaupt zurueckkommen, entscheidet allein RLS
// (Buero sieht alles, ein Kunde nur die eigene Firma ueber b2b_kunde_id) -
// diese Datei filtert nicht selbst nach Rolle.

export interface ReklamationListenEintrag {
  id: string;
  code: string;
  kunde: string;
  kundeId: string;
  chargeCode: string | null;
  reihenblock: string | null;
  grund: ReklamationGrund;
  betreff: string;
  status: ReklamationStatus;
  betroffeneMengeKg: number | null;
  gemeldetAm: string;
  fristAm: string | null;
  gutschriftTenge: number | null;
}

export interface ReklamationenListe {
  quelle: Datenquelle;
  /** Die Eintraege der angezeigten Seite, neueste zuerst. */
  reklamationen: ReklamationListenEintrag[];
  /** Alle Reklamationen, die die Person sehen darf. */
  gesamt: number;
  seite: number;
  seiten: number;
}

export interface RueckverfolgungPfluecker {
  name: string;
  ausweis: string;
}

export interface RueckverfolgungKuehlmessung {
  id: string;
  minutenSeitPfluecken: number | null;
  ergebnis: string;
  gemessenAm: string;
}

export interface RueckverfolgungNachbarbetrieb {
  name: string;
  ort: string | null;
}

export interface RueckverfolgungTransportmessung {
  id: string;
  temperaturC: number;
  ergebnis: string;
  gemessenAm: string;
}

export interface ReklamationDetail extends ReklamationListenEintrag {
  beschreibung: string | null;
  chargeId: string | null;
  gemeldetVon: string | null;
  erledigtAm: string | null;
  loesung: string | null;
  ereignisse: ReklamationEreignis[];
  // Rueckverfolgung bis Person, Kuehlzeit und liefernder Nachbarbetrieb
  // (Anforderung 3.4 und 6.3). Kommt fuer eine Kunden-Anmeldung immer leer
  // zurueck - nicht durch diese Datei gefiltert, sondern durch RLS auf
  // steigen/kuehlketten_messungen/zukauf_positionen (siehe Migration
  // 20260922000000 sowie die bereits bestehende Buero-Beschraenkung auf
  // zukauf_positionen).
  pflueckerListe: RueckverfolgungPfluecker[];
  kuehlmessungen: RueckverfolgungKuehlmessung[];
  nachbarbetrieb: RueckverfolgungNachbarbetrieb | null;
  // Transportphase-Temperaturlogger (Anforderung 3.2), ueber alle Lieferungen
  // dieser Charge hinweg - schliesst die Kette Pfluecken -> Vorkuehlung ->
  // Transport -> Uebergabe beim Kunden. RLS auf transport_temperatur_
  // messungen (Migration 20260928000000) filtert wie bei kuehlmessungen.
  transportMessungen: RueckverfolgungTransportmessung[];
}

function demoListe(quelle: ReklamationenListe["quelle"] = "demo"): ReklamationenListe {
  return {
    quelle,
    gesamt: demoReklamationen.length,
    seite: 1,
    seiten: 1,
    reklamationen: demoReklamationen.map((r) => ({
      id: r.id,
      code: r.code,
      kunde: r.kunde,
      kundeId: r.id,
      chargeCode: r.chargeCode,
      reihenblock: r.reihenblock,
      grund: r.grund,
      betreff: r.betreff,
      status: r.status,
      betroffeneMengeKg: r.betroffeneMengeKg,
      gemeldetAm: r.gemeldetAm,
      fristAm: r.fristAm,
      gutschriftTenge: r.gutschriftTenge,
    })),
  };
}

/**
 * Eine Seite der Reklamationen, neueste zuerst (WMCNL-2491). Gezaehlt wird zuerst, damit eine Seite jenseits der letzten auf die letzte faellt (PostgREST
 * antwortete sonst mit 416); die Zeilensicherheit gilt fuer die Zaehlung wie fuer die Zeilen.
 */
export async function ladeReklamationen(seite = 1): Promise<ReklamationenListe> {
  if (!isSupabaseConfigured()) return demoListe();

  const supabase = await createClient();
  const zaehlung = await supabase.from("reklamationen").select("id", { count: "exact", head: true });
  if (zaehlung.error || zaehlung.count === null) return demoListe("fehler");
  const modell = seitenModell(zaehlung.count, seite, REKLAMATIONEN_PRO_SEITE);

  const { data, error } = await supabase
    .from("reklamationen")
    .select(
      `id, code, grund, betreff, status, betroffene_menge_kg, gemeldet_am, frist_am, gutschrift_tenge,
       b2b_kunden ( id, name ),
       chargen ( code, reihenbloecke ( code ) )`,
    )
    .order("gemeldet_am", { ascending: false })
    .order("id")
    .range(modell.von, modell.bis);

  if (error || !data) return demoListe("fehler");

  const reklamationen: ReklamationListenEintrag[] = data.map((r) =>
    listenEintragAus(r, einsAus(r.b2b_kunden), einsAus(r.chargen)),
  );

  return { quelle: "db", reklamationen, gesamt: zaehlung.count, seite: modell.seite, seiten: modell.seiten };
}

/** Eine eingebettete Beziehung, wie PostgREST sie liefert: Objekt, Liste oder nichts (siehe einsAus). */
type Eingebettet<T> = T | T[] | null | undefined;

/** Die Spalten von reklamationen, die Liste und Detail gleich lesen. */
interface ReklamationKopfZeile {
  id: string;
  code: string;
  grund: ReklamationGrund;
  betreff: string;
  status: ReklamationStatus;
  betroffene_menge_kg: number | null;
  gemeldet_am: string;
  frist_am: string | null;
  gutschrift_tenge: number | null;
}

// Liste und Detail lesen Kunde, Charge und Reihenblock auf dieselbe Weise. Bis
// Oktober 2026 stand diese Zuordnung zweimal wortgleich im Code, einmal je Lader.
function listenEintragAus(
  r: ReklamationKopfZeile,
  kunde: { id: string; name: string } | null,
  charge: { code: string; reihenbloecke: Eingebettet<{ code: string }> } | null,
): ReklamationListenEintrag {
  const block = charge ? einsAus(charge.reihenbloecke) : null;
  return {
    id: r.id,
    code: r.code,
    kunde: kunde?.name ?? "-",
    kundeId: kunde?.id ?? "",
    chargeCode: charge?.code ?? null,
    reihenblock: block?.code ?? null,
    grund: r.grund,
    betreff: r.betreff,
    status: r.status,
    betroffeneMengeKg: r.betroffene_menge_kg === null ? null : Number(r.betroffene_menge_kg),
    gemeldetAm: r.gemeldet_am,
    fristAm: r.frist_am,
    gutschriftTenge: r.gutschrift_tenge === null ? null : Number(r.gutschrift_tenge),
  };
}

function demoDetail(id: string): ReklamationDetail | null {
  const r = demoReklamationen.find((eintrag) => eintrag.id === id);
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    kunde: r.kunde,
    kundeId: r.id,
    chargeCode: r.chargeCode,
    reihenblock: r.reihenblock,
    grund: r.grund,
    betreff: r.betreff,
    status: r.status,
    betroffeneMengeKg: r.betroffeneMengeKg,
    gemeldetAm: r.gemeldetAm,
    fristAm: r.fristAm,
    gutschriftTenge: r.gutschriftTenge,
    beschreibung: r.beschreibung,
    chargeId: null,
    gemeldetVon: r.kunde,
    erledigtAm: r.erledigtAm,
    loesung: r.loesung,
    ereignisse: r.ereignisse,
    pflueckerListe: [],
    kuehlmessungen: [],
    nachbarbetrieb: null,
    transportMessungen: [],
  };
}

export async function ladeReklamation(id: string): Promise<ReklamationDetail | null> {
  if (!isSupabaseConfigured()) return demoDetail(id);

  const supabase = await createClient();
  const [{ data: rekl, error }, { data: ereignisRohdaten }] = await Promise.all([
    supabase
      .from("reklamationen")
      .select(
        `id, code, grund, betreff, beschreibung, status, betroffene_menge_kg, gemeldet_am,
         frist_am, erledigt_am, loesung, gutschrift_tenge, charge_id, gemeldet_von,
         b2b_kunden ( id, name ),
         chargen (
           code,
           reihenbloecke ( code ),
           steigen ( pfluecker_id, pfluecker ( name, ausweis ) ),
           kuehlketten_messungen ( id, minuten_seit_pfluecken, ergebnis, gemessen_am ),
           zukauf_positionen ( nachbarbetriebe ( name, ort ) ),
           lieferungen ( transport_temperatur_messungen ( id, temperatur_c, ergebnis, gemessen_am ) )
         ),
         profiles ( full_name )`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("reklamation_ereignisse")
      .select("id, neuer_status, text, sichtbar_fuer_kunde, created_at, profiles ( full_name, role )")
      .eq("reklamation_id", id)
      .order("created_at"),
  ]);

  if (error || !rekl) return null;

  const charge = einsAus(rekl.chargen);
  return {
    ...listenEintragAus(rekl, einsAus(rekl.b2b_kunden), charge),
    beschreibung: rekl.beschreibung,
    chargeId: rekl.charge_id,
    gemeldetVon: einsAus(rekl.profiles)?.full_name ?? null,
    erledigtAm: rekl.erledigt_am,
    loesung: rekl.loesung,
    ereignisse: ereignisseAus(ereignisRohdaten ?? []),
    ...rueckverfolgungAus(charge),
  };
}

/** Die Messspalten, die Kühl- und Transportmessung gemeinsam haben. */
interface MessZeile {
  id: string;
  ergebnis: string;
  gemessen_am: string;
}

/** Die Beziehungen einer Charge, aus denen die Rückverfolgung entsteht. */
interface RueckverfolgungsZeile {
  steigen?: { pfluecker_id: string | null; pfluecker: Eingebettet<{ name: string; ausweis: string }> }[] | null;
  kuehlketten_messungen?: (MessZeile & { minuten_seit_pfluecken: number | null })[] | null;
  zukauf_positionen?: Eingebettet<{ nachbarbetriebe: Eingebettet<{ name: string; ort: string | null }> }>;
  lieferungen?: { transport_temperatur_messungen: (MessZeile & { temperatur_c: number })[] | null }[] | null;
}

type Rueckverfolgung = Pick<
  ReklamationDetail,
  "pflueckerListe" | "kuehlmessungen" | "nachbarbetrieb" | "transportMessungen"
>;

function rueckverfolgungAus(charge: RueckverfolgungsZeile | null): Rueckverfolgung {
  return {
    pflueckerListe: pflueckerAus(charge?.steigen ?? []),
    kuehlmessungen: kuehlmessungenAus(charge?.kuehlketten_messungen ?? []),
    nachbarbetrieb: nachbarbetriebAus(charge?.zukauf_positionen),
    transportMessungen: transportMessungenAus(charge?.lieferungen ?? []),
  };
}

const nachMesszeit = (a: { gemessenAm: string }, b: { gemessenAm: string }) =>
  a.gemessenAm.localeCompare(b.gemessenAm);

// Rueckverfolgung bis Person (ueber steigen, mehrere Pfluecker je Charge
// moeglich, ueber pfluecker_id dedupliziert) und Kuehlzeit (Anforderung
// 3.4). Kommt fuer eine Kunden-Anmeldung leer zurueck, weil RLS auf
// steigen/kuehlketten_messungen keine Zeilen liefert (siehe Interface-
// Kommentar), nicht weil hier gefiltert wuerde.
function pflueckerAus(
  steigen: NonNullable<RueckverfolgungsZeile["steigen"]>,
): RueckverfolgungPfluecker[] {
  const pflueckerListe: RueckverfolgungPfluecker[] = [];
  const gesehenePflueckerIds = new Set<string>();
  for (const s of steigen) {
    const p = einsAus(s.pfluecker);
    if (p && s.pfluecker_id && !gesehenePflueckerIds.has(s.pfluecker_id)) {
      gesehenePflueckerIds.add(s.pfluecker_id);
      pflueckerListe.push({ name: p.name, ausweis: p.ausweis });
    }
  }
  return pflueckerListe;
}

function kuehlmessungenAus(
  messungen: NonNullable<RueckverfolgungsZeile["kuehlketten_messungen"]>,
): RueckverfolgungKuehlmessung[] {
  return messungen
    .map((m) => ({
      id: m.id,
      minutenSeitPfluecken: m.minuten_seit_pfluecken,
      ergebnis: m.ergebnis,
      gemessenAm: m.gemessen_am,
    }))
    .sort(nachMesszeit);
}

// Rueckverfolgung bis zum liefernden Nachbarbetrieb bei Zukaufware
// (Anforderung 6.3). Bei eigener Ernte bleibt reihenblock_id gesetzt und es
// gibt keine zukauf_positionen-Zeile zur Charge - nachbarbetrieb bleibt
// dann bewusst null statt einer Fehlinterpretation.
function nachbarbetriebAus(
  zukauf: RueckverfolgungsZeile["zukauf_positionen"],
): RueckverfolgungNachbarbetrieb | null {
  const zukaufPosition = einsAus(zukauf);
  const nachbarbetriebRoh = zukaufPosition ? einsAus(zukaufPosition.nachbarbetriebe) : null;
  return nachbarbetriebRoh ? { name: nachbarbetriebRoh.name, ort: nachbarbetriebRoh.ort } : null;
}

// Transportphase (Anforderung 3.2): eine Charge kann ueber mehrere
// Lieferungen verteilt sein (Teillieferungen) - alle zugehoerigen
// Transportmessungen zusammen, chronologisch, schliessen die Kette bis zum
// Kunden.
function transportMessungenAus(
  lieferungen: NonNullable<RueckverfolgungsZeile["lieferungen"]>,
): RueckverfolgungTransportmessung[] {
  return lieferungen
    .flatMap((l) => l.transport_temperatur_messungen ?? [])
    .map((m) => ({
      id: m.id,
      temperaturC: Number(m.temperatur_c),
      ergebnis: m.ergebnis,
      gemessenAm: m.gemessen_am,
    }))
    .sort(nachMesszeit);
}

function ereignisseAus(
  zeilen: {
    id: string;
    neuer_status: ReklamationStatus | null;
    text: string;
    sichtbar_fuer_kunde: boolean;
    created_at: string;
    profiles: Eingebettet<{ full_name: string; role: string }>;
  }[],
): ReklamationEreignis[] {
  return zeilen.map((e) => {
    const autor = einsAus(e.profiles);
    return {
      id: e.id,
      neuerStatus: e.neuer_status,
      text: e.text,
      sichtbarFuerKunde: e.sichtbar_fuer_kunde,
      autor: autor ? `${autor.full_name} (${autor.role})` : null,
      erstelltAm: e.created_at,
    };
  });
}

export interface AuswahlZeile {
  id: string;
  label: string;
}

// B2B-Kunden fuer das Anlegen-Formular. Nur relevant fuer Buero-Rollen - ein
// Kunde legt ausschliesslich fuer die eigene Firma an (server-seitig erzwungen
// in der Action, nicht ueber diese Auswahl).
export async function ladeB2bKundenOptionen(): Promise<AuswahlZeile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("b2b_kunden").select("id, name").order("name");
  return (data ?? []).map((k) => ({ id: k.id, label: k.name }));
}

// Chargen zur Auswahl beim Anlegen. Fuer einen Kunde auf die eigenen
// Lieferungen eingegrenzt - chargen ist zwar fuer jede Anmeldung lesbar
// (bestehende, hier nicht veraenderte RLS-Regel), aber ohne diese Eingrenzung
// muesste ein Kunde aus der gesamten Erntestrecke suchen statt aus dem, was er
// tatsaechlich erhalten hat.
export async function ladeChargenOptionen(b2bKundeId: string | null): Promise<AuswahlZeile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  if (b2bKundeId) {
    const { data } = await supabase
      .from("lieferungen")
      .select("charge_id, chargen ( id, code )")
      .eq("b2b_kunde_id", b2bKundeId)
      .not("charge_id", "is", null);

    const gesehen = new Set<string>();
    const optionen: AuswahlZeile[] = [];
    for (const zeile of data ?? []) {
      const charge = einsAus(zeile.chargen);
      if (charge && !gesehen.has(charge.id)) {
        gesehen.add(charge.id);
        optionen.push({ id: charge.id, label: charge.code });
      }
    }
    return optionen.sort((a, b) => a.label.localeCompare(b.label));
  }

  const { data } = await supabase
    .from("chargen")
    .select("id, code")
    .order("code", { ascending: false })
    .limit(200);
  return (data ?? []).map((c) => ({ id: c.id, label: c.code }));
}
