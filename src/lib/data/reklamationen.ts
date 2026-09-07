import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
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
  reklamationen: ReklamationListenEintrag[];
}

export interface ReklamationDetail extends ReklamationListenEintrag {
  beschreibung: string | null;
  chargeId: string | null;
  gemeldetVon: string | null;
  erledigtAm: string | null;
  loesung: string | null;
  ereignisse: ReklamationEreignis[];
}

function demoListe(quelle: ReklamationenListe["quelle"] = "demo"): ReklamationenListe {
  return {
    quelle,
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

export async function ladeReklamationen(): Promise<ReklamationenListe> {
  if (!isSupabaseConfigured()) return demoListe();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reklamationen")
    .select(
      `id, code, grund, betreff, status, betroffene_menge_kg, gemeldet_am, frist_am, gutschrift_tenge,
       b2b_kunden ( id, name ),
       chargen ( code, reihenbloecke ( code ) )`,
    )
    .order("gemeldet_am", { ascending: false });

  if (error || !data) return demoListe("fehler");

  const reklamationen: ReklamationListenEintrag[] = data.map((r) => {
    const kunde = einsAus(r.b2b_kunden);
    const charge = einsAus(r.chargen);
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
  });

  return { quelle: "db", reklamationen };
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
         chargen ( code, reihenbloecke ( code ) ),
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

  const kunde = einsAus(rekl.b2b_kunden);
  const charge = einsAus(rekl.chargen);
  const block = charge ? einsAus(charge.reihenbloecke) : null;
  const gemeldetVonProfil = einsAus(rekl.profiles);

  const ereignisse: ReklamationEreignis[] = (ereignisRohdaten ?? []).map((e) => {
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

  return {
    id: rekl.id,
    code: rekl.code,
    kunde: kunde?.name ?? "-",
    kundeId: kunde?.id ?? "",
    chargeCode: charge?.code ?? null,
    reihenblock: block?.code ?? null,
    grund: rekl.grund,
    betreff: rekl.betreff,
    status: rekl.status,
    betroffeneMengeKg: rekl.betroffene_menge_kg === null ? null : Number(rekl.betroffene_menge_kg),
    gemeldetAm: rekl.gemeldet_am,
    fristAm: rekl.frist_am,
    gutschriftTenge: rekl.gutschrift_tenge === null ? null : Number(rekl.gutschrift_tenge),
    beschreibung: rekl.beschreibung,
    chargeId: rekl.charge_id,
    gemeldetVon: gemeldetVonProfil?.full_name ?? null,
    erledigtAm: rekl.erledigt_am,
    loesung: rekl.loesung,
    ereignisse,
  };
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
