import { createClient } from "@/lib/supabase/server";
import { einsAus } from "@/lib/data/util";
import { tagInZone } from "@/lib/domain/tageszeit";
import type { LieferplanQuelle } from "@/lib/domain/lieferplan";

// Daten fuer den Lieferplan als Kalenderdatei (WMCNL-1472). Mit der Sitzung der
// abrufenden Person: die Zeilensicherheit von vorbestellungen und lieferungen
// entscheidet, was in der Datei steht (der Kunde sieht nur seine eigenen, das
// Buero alle). Der Abruf ist ein Download an die Sitzung gebunden, kein
// dauerhafter Abo-Link: eine Adresse, die ohne Anmeldung funktionierte, haette
// ein Geheimnis in der URL.

export async function ladeLieferplanQuelle(): Promise<{ quelle: LieferplanQuelle; heute: string } | null> {
  const supabase = await createClient();
  const heute = tagInZone(new Date());

  const [vorbestellungen, lieferungen] = await Promise.all([
    supabase
      .from("vorbestellungen")
      .select("id, status, menge_kg, liefertermin, sorten ( name ), b2b_kunden ( name )")
      .in("status", ["angefragt", "bestaetigt"])
      .gte("liefertermin", heute),
    supabase
      .from("lieferungen")
      .select("id, vorbestellung_id, status, menge_kg, touren ( datum ), b2b_kunden ( name )")
      .eq("status", "geplant")
      .not("tour_id", "is", null),
  ]);
  if (vorbestellungen.error || !vorbestellungen.data || lieferungen.error || !lieferungen.data) return null;

  return {
    heute,
    quelle: {
      vorbestellungen: vorbestellungen.data.map((v) => ({
        id: v.id,
        status: v.status,
        mengeKg: Number(v.menge_kg),
        liefertermin: v.liefertermin,
        sorte: einsAus(v.sorten)?.name ?? null,
        kunde: einsAus(v.b2b_kunden)?.name ?? null,
      })),
      lieferungen: lieferungen.data.map((l) => ({
        id: l.id,
        vorbestellungId: l.vorbestellung_id,
        status: l.status,
        mengeKg: Number(l.menge_kg),
        tourDatum: einsAus(l.touren)?.datum ?? null,
        kunde: einsAus(l.b2b_kunden)?.name ?? null,
      })),
    },
  };
}
