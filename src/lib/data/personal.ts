import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";
import {
  demoBedarf,
  demoBrigaden,
  demoEinsatzplan,
  demoOffeneTermine,
  demoPfluecker,
  type BedarfZeile,
  type BrigadeOption,
  type BrigadeZeile,
  type EinsatzZeile,
  type OffenerTerminZeile,
  type PfleuckerZeile,
} from "@/lib/domain/personal";

// Brigadenplanung (Anforderung 2.11): Schicht-Konzept (brigade_einsatzplan),
// Reserveliste (pfluecker ohne Brigade) und Bedarfsrechnung
// (brigadenplanung_bedarf) - beide Views aus Migration 20260927000000.
// Lesezugriff ist fuer alle angemeldeten Rollen offen (dieselbe "intern"-
// Policy wie bei reihenbloecke/pflueckaufgaben, reine Betriebsdaten ohne
// Kundenbezug), Schreiben bleibt admin/betriebsleitung vorbehalten.

export interface PersonalUebersicht {
  quelle: Datenquelle;
  brigaden: BrigadeZeile[];
  pfluecker: PfleuckerZeile[];
  reserveliste: PfleuckerZeile[];
  einsatzplan: EinsatzZeile[];
  bedarf: BedarfZeile[];
  offeneTermine: OffenerTerminZeile[];
}

function demoUebersicht(quelle: PersonalUebersicht["quelle"] = "demo"): PersonalUebersicht {
  return {
    quelle,
    brigaden: demoBrigaden,
    pfluecker: demoPfluecker,
    reserveliste: demoPfluecker.filter((p) => p.brigadeId === null),
    einsatzplan: demoEinsatzplan,
    bedarf: demoBedarf,
    offeneTermine: demoOffeneTermine,
  };
}

export async function ladePersonalUebersicht(): Promise<PersonalUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();
  const heute = new Date().toISOString().slice(0, 10);

  const [
    { data: brigadenRows, error: brigadenFehler },
    { data: pflueckerRows, error: pflueckerFehler },
    { data: lohnRows },
    { data: einsatzRows, error: einsatzFehler },
    { data: bedarfRows, error: bedarfFehler },
    { data: offeneRows, error: offeneFehler },
  ] = await Promise.all([
    supabase.from("brigaden").select("id, name, vorarbeiter, staerke, plantagen ( name )").order("name"),
    supabase
      .from("pfluecker")
      .select("id, name, ausweis, esutd, brigade_id, brigaden ( name )")
      .order("name"),
    supabase
      .from("lohn_abrechnungen")
      .select("pfluecker_id, menge_kg, qualitaetsfaktor, periode_ende")
      .order("periode_ende", { ascending: false })
      .limit(500),
    supabase.from("brigade_einsatzplan").select("*").gte("geplant_fuer", heute),
    supabase.from("brigadenplanung_bedarf").select("*").gte("geplant_fuer", heute),
    supabase
      .from("rotationsplan_eintraege")
      .select("id, geplant_fuer, reihenbloecke ( code )")
      .is("brigade_id", null)
      .eq("status", "geplant")
      .gte("geplant_fuer", heute)
      .order("geplant_fuer"),
  ]);

  if (brigadenFehler || pflueckerFehler || einsatzFehler || bedarfFehler || offeneFehler) {
    return demoUebersicht("fehler");
  }

  // Juengste Abrechnung je Pfluecker - lohnRows ist bereits nach
  // periode_ende absteigend sortiert, der erste Treffer je pfluecker_id
  // gewinnt.
  const letzteAbrechnung = new Map<string, { mengeKg: number; qualitaetsfaktor: number }>();
  for (const row of lohnRows ?? []) {
    if (!letzteAbrechnung.has(row.pfluecker_id)) {
      letzteAbrechnung.set(row.pfluecker_id, {
        mengeKg: Number(row.menge_kg),
        qualitaetsfaktor: Number(row.qualitaetsfaktor),
      });
    }
  }

  const pfluecker: PfleuckerZeile[] = (pflueckerRows ?? []).map((p) => {
    const brigade = einsAus(p.brigaden);
    const abrechnung = letzteAbrechnung.get(p.id);
    return {
      id: p.id,
      name: p.name,
      ausweis: p.ausweis,
      brigadeId: p.brigade_id,
      brigadeName: brigade?.name ?? null,
      esutd: p.esutd,
      letzteMengeKg: abrechnung?.mengeKg ?? null,
      letzterQualitaetsfaktor: abrechnung?.qualitaetsfaktor ?? null,
    };
  });

  return {
    quelle: "db",
    brigaden: (brigadenRows ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      vorarbeiter: b.vorarbeiter,
      staerke: b.staerke,
      plantage: einsAus(b.plantagen)?.name ?? null,
    })),
    pfluecker,
    reserveliste: pfluecker.filter((p) => p.brigadeId === null),
    einsatzplan: (einsatzRows ?? [])
      .filter((e) => e.brigade_id !== null && e.brigade_name !== null)
      .map((e) => ({
        geplantFuer: e.geplant_fuer as string,
        brigadeId: e.brigade_id as string,
        brigadeName: e.brigade_name as string,
        staerke: Number(e.staerke),
        bloeckeZugewiesen: Number(e.bloecke_zugewiesen),
      })),
    bedarf: (bedarfRows ?? [])
      .filter((b) => b.geplant_fuer !== null)
      .map((b) => ({
        geplantFuer: b.geplant_fuer as string,
        bloeckeGesamt: Number(b.bloecke_gesamt),
        bloeckeZugewiesen: Number(b.bloecke_zugewiesen),
        bloeckeOffen: Number(b.bloecke_offen),
      })),
    offeneTermine: (offeneRows ?? []).map((t) => ({
      id: t.id,
      geplantFuer: t.geplant_fuer,
      reihenblockCode: einsAus(t.reihenbloecke)?.code ?? "-",
    })),
  };
}

export async function ladeBrigadeOptionen(): Promise<BrigadeOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("brigaden").select("id, name").order("name");
  return (data ?? []).map((b) => ({ id: b.id, name: b.name }));
}
