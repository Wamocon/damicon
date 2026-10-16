import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";
import {
  kurzeUhrzeit,
  istAbholrundeStatus,
  istStoppStatus,
  type AbholRundeZeile,
  type AbholStoppZeile,
  type KuehlErgebnis,
  type NachbarbetriebOption,
} from "@/lib/domain/abholrunden";

// Abholrunden bei Nachbarbetrieben (WMCNL-1577). Lesen duerfen das Buero und die Brigade (Zeilensicherheit von abholrunden und
// abholstopps, Migration 20261207100000). Ohne Datenbank gibt es keine Runden: ein erfundenes Beispiel waere Irrefuehrung.

export interface AbholrundenUebersicht {
  /** "keine": keine Datenbank, nichts zu zeigen. */
  quelle: "datenbank" | "keine";
  runden: AbholRundeZeile[];
}

/** So viele Runden zeigt die Seite, die juengsten zuerst. */
export const RUNDEN_MAX = 30;

const zahlOderNull = (w: number | string | null | undefined): number | null => (w === null || w === undefined ? null : Number(w));

export async function ladeAbholrunden(): Promise<AbholrundenUebersicht> {
  if (!isSupabaseConfigured()) return { quelle: "keine", runden: [] };
  return { quelle: "datenbank", runden: await leseRunden(null) };
}

/** Eine einzelne Runde (fuer das Dokument), auch eine aeltere als die, die die Seite zeigt. null, wenn es sie nicht gibt oder sie nicht sichtbar ist. */
export async function ladeAbholrunde(id: string): Promise<AbholRundeZeile | null> {
  if (!isSupabaseConfigured()) return null;
  return (await leseRunden(id))[0] ?? null;
}

async function leseRunden(id: string | null): Promise<AbholRundeZeile[]> {
  const supabase = await createClient();
  const anfrage = supabase
      .from("abholrunden")
      .select(
        `id, datum, status, fahrzeug, notiz, distanz_km, dauer_minuten, ab_erstem_stopp_minuten, routen_geometrie, gestartet_am, kuehlhaus_an, kapazitaet_kg, start_zeit,
         abholstopps ( id, nachbarbetrieb_id, reihenfolge, menge_geplant_kg, status, menge_ist_kg, pflueckbeginn, abgeholt_am, bemerkung, ankunft_geplant, sorten ( name ) )`,
      )
      .order("datum", { ascending: false })
      .order("created_at", { ascending: false });
  const runden = await (id === null ? anfrage.limit(RUNDEN_MAX) : anfrage.eq("id", id).limit(1));
  const rundenIds = (runden.data ?? []).map((r) => r.id);
  // Die Bewertung nur zu den gelesenen Runden: Ohne Filter kappt PostgREST bei 1000 Zeilen still, und eine aeltere Runde bekaeme kein Ergebnis
  // (das versiegelte Nachweisdokument zeigte dann "-" und liesse den Verstosskasten weg; Pruefung PR #156, 15.10.2026).
  // Die Nachbarbetriebe kommen aus der schmalen Funktion, nicht aus der Tabelle: Dort liegen ИИН/БИН, die die Brigade nicht lesen darf.
  const [bewertung, betriebe] = await Promise.all([
    rundenIds.length > 0
      ? supabase.from("v_abholstopps_kuehlkette").select("stopp_id, minuten_bis_kuehlung, ergebnis").in("runde_id", rundenIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("abholrunde_nachbarbetriebe"),
  ]);
  const lesefehler = runden.error ?? bewertung.error ?? betriebe.error;
  if (lesefehler) console.error("[damicon] Abholrunden lesen fehlgeschlagen:", lesefehler.message);

  const bewertet = new Map((bewertung.data ?? []).filter((b) => b.stopp_id !== null).map((b) => [b.stopp_id as string, b]));
  const betriebById = new Map((betriebe.data ?? []).map((b) => [b.id, b]));

  return (
    (runden.data ?? [])
      .filter((r) => istAbholrundeStatus(r.status))
      .map((r): AbholRundeZeile => {
        const stopps = (r.abholstopps ?? [])
          .filter((s) => istStoppStatus(s.status))
          .map((s): AbholStoppZeile => {
            const betrieb = betriebById.get(s.nachbarbetrieb_id);
            const b = bewertet.get(s.id);
            return {
              id: s.id,
              nachbarbetriebId: s.nachbarbetrieb_id,
              nachbarbetrieb: betrieb?.name ?? "-",
              ort: betrieb?.ort ?? null,
              adresse: betrieb?.adresse ?? null,
              kontakt: betrieb?.kontakt ?? null,
              breitengrad: zahlOderNull(betrieb?.breitengrad),
              laengengrad: zahlOderNull(betrieb?.laengengrad),
              reihenfolge: s.reihenfolge,
              mengeGeplantKg: Number(s.menge_geplant_kg),
              sorte: einsAus(s.sorten)?.name ?? null,
              status: s.status as AbholStoppZeile["status"],
              mengeIstKg: zahlOderNull(s.menge_ist_kg),
              pflueckbeginn: s.pflueckbeginn,
              abgeholtAm: s.abgeholt_am,
              bemerkung: s.bemerkung,
              minutenBisKuehlung: b?.minuten_bis_kuehlung ?? null,
              // Das Ergebnis kommt aus der Sicht; ohne sie (Lesefehler) bleibt es leer statt geraten.
              ergebnis: (b?.ergebnis ?? null) as KuehlErgebnis | null,
              ankunftGeplant: s.ankunft_geplant,
              abholVon: kurzeUhrzeit(betrieb?.abhol_von),
              abholBis: kurzeUhrzeit(betrieb?.abhol_bis),
            };
          })
          .sort((a, b) => a.reihenfolge - b.reihenfolge);
        return {
          id: r.id,
          datum: r.datum,
          status: r.status as AbholRundeZeile["status"],
          fahrzeug: r.fahrzeug,
          notiz: r.notiz,
          distanzKm: zahlOderNull(r.distanz_km),
          dauerMinuten: r.dauer_minuten,
          abErstemStoppMinuten: r.ab_erstem_stopp_minuten,
          geometrie: (r.routen_geometrie as GeoJSON.LineString | null) ?? null,
          gestartetAm: r.gestartet_am,
          kuehlhausAn: r.kuehlhaus_an,
          kapazitaetKg: zahlOderNull(r.kapazitaet_kg),
          startZeit: kurzeUhrzeit(r.start_zeit),
          stopps,
        };
      })
  );
}

/** Die Nachbarbetriebe als Kandidaten fuer eine neue Runde, nach Namen. */
export async function ladeNachbarbetriebeFuerRunde(): Promise<NachbarbetriebOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("nachbarbetriebe").select("id, name, ort, adresse, breitengrad, laengengrad, abhol_von, abhol_bis").order("name");
  if (error) console.error("[damicon] Nachbarbetriebe lesen fehlgeschlagen:", error.message);
  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    ort: b.ort,
    adresse: b.adresse,
    breitengrad: zahlOderNull(b.breitengrad),
    laengengrad: zahlOderNull(b.laengengrad),
    abholVon: kurzeUhrzeit(b.abhol_von),
    abholBis: kurzeUhrzeit(b.abhol_bis),
  }));
}
