import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";
import {
  demoLieferungenOhneTour,
  demoTouren,
  type LieferungOhneTour,
  type TourStatus,
  type TourZeile,
} from "@/lib/domain/tourenplanung";

// Tourenplanung (Anforderung 3.5, Teil 1). RLS (touren_select_buero) grenzt
// bereits auf has_office_access() ein - eine Kunden-Anmeldung soll weder die
// eigene noch fremde Stopps einer Tour sehen, das ist reine Betriebslogistik.

export interface TourenUebersicht {
  quelle: Datenquelle;
  touren: TourZeile[];
}

function demoTourenUebersicht(quelle: TourenUebersicht["quelle"] = "demo"): TourenUebersicht {
  return { quelle, touren: demoTouren };
}

export async function ladeTouren(): Promise<TourenUebersicht> {
  if (!isSupabaseConfigured()) return demoTourenUebersicht();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("touren")
    .select(
      `id, datum, status, distanz_km, dauer_minuten, routen_geometrie,
       lieferungen ( id, menge_kg, tour_reihenfolge, b2b_kunden ( name, adresse, breitengrad, laengengrad ) )`,
    )
    .order("datum", { ascending: false });

  if (error || !data) return demoTourenUebersicht("fehler");

  return {
    quelle: "db",
    touren: data.map((t) => ({
      id: t.id,
      datum: t.datum,
      status: t.status as TourStatus,
      distanzKm: t.distanz_km === null ? null : Number(t.distanz_km),
      dauerMinuten: t.dauer_minuten,
      geometrie: (t.routen_geometrie as GeoJSON.LineString | null) ?? null,
      stopps: (t.lieferungen ?? [])
        .map((l) => {
          const kunde = einsAus(l.b2b_kunden);
          return {
            lieferungId: l.id,
            kunde: kunde?.name ?? "-",
            adresse: kunde?.adresse ?? null,
            breitengrad: kunde?.breitengrad === undefined || kunde?.breitengrad === null ? null : Number(kunde.breitengrad),
            laengengrad: kunde?.laengengrad === undefined || kunde?.laengengrad === null ? null : Number(kunde.laengengrad),
            mengeKg: Number(l.menge_kg),
            reihenfolge: l.tour_reihenfolge,
          };
        })
        .sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0)),
    })),
  };
}

export interface LieferungenOhneTourUebersicht {
  quelle: Datenquelle;
  lieferungen: LieferungOhneTour[];
}

function demoOhneTourUebersicht(
  quelle: LieferungenOhneTourUebersicht["quelle"] = "demo",
): LieferungenOhneTourUebersicht {
  return { quelle, lieferungen: demoLieferungenOhneTour };
}

// Kandidaten fuer eine neue Tour: geplante, noch nicht zugestellte
// Lieferungen ohne Tourzuordnung. Eine Lieferung ohne geokodierte Kunden-
// Adresse taucht hier trotzdem auf (sonst waere sie nirgends sichtbar), zaehlt
// aber beim Erstellen einer Tour nicht mit - siehe actions/tourenplanung.ts.
export async function ladeLieferungenOhneTour(): Promise<LieferungenOhneTourUebersicht> {
  if (!isSupabaseConfigured()) return demoOhneTourUebersicht();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lieferungen")
    .select(
      `id, menge_kg, vorbestellungen ( liefertermin ), b2b_kunden ( id, name, adresse, breitengrad, laengengrad )`,
    )
    .eq("status", "geplant")
    .is("tour_id", null)
    .order("created_at", { ascending: true });

  if (error || !data) return demoOhneTourUebersicht("fehler");

  return {
    quelle: "db",
    lieferungen: data.map((l) => {
      const kunde = einsAus(l.b2b_kunden);
      const vorbestellung = einsAus(l.vorbestellungen);
      return {
        id: l.id,
        kundeId: kunde?.id ?? "",
        kunde: kunde?.name ?? "-",
        adresse: kunde?.adresse ?? null,
        breitengrad: kunde?.breitengrad === undefined || kunde?.breitengrad === null ? null : Number(kunde.breitengrad),
        laengengrad: kunde?.laengengrad === undefined || kunde?.laengengrad === null ? null : Number(kunde.laengengrad),
        mengeKg: Number(l.menge_kg),
        liefertermin: vorbestellung?.liefertermin ?? null,
      };
    }),
  };
}
