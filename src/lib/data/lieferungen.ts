import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";
import {
  demoLieferungen,
  type AuswahlZeile,
  type LieferungStatus,
  type LieferungZeile,
} from "@/lib/domain/lieferungen";

// Lieferungen: Uebergabequittung und Lieferstatus (Anforderung 3.5 Teil 2,
// 5.2 Teil 2a). RLS (lieferungen_select_kunde_buero, Migration 20260926000000)
// entscheidet, welche Zeilen zurueckkommen - Buero und Brigade sehen alle,
// eine Kunden-Anmeldung ausschliesslich die eigene Firma. Diese Datei
// filtert nicht zusaetzlich selbst nach Rolle.

export interface LieferungenUebersicht {
  quelle: Datenquelle;
  lieferungen: LieferungZeile[];
}

function demoUebersicht(quelle: LieferungenUebersicht["quelle"] = "demo"): LieferungenUebersicht {
  return { quelle, lieferungen: demoLieferungen };
}

export async function ladeLieferungen(): Promise<LieferungenUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lieferungen")
    .select(
      `id, menge_kg, status, geliefert_am, empfaenger_name, beleg_storage_path,
       b2b_kunden ( id, name ),
       chargen ( code, kuehlketten_messungen ( temperatur_c, minuten_seit_pfluecken, ergebnis, gemessen_am ) ),
       vorbestellungen ( menge_kg ),
       transport_temperatur_messungen ( id, temperatur_c, ergebnis, gemessen_am )`,
    )
    .order("created_at", { ascending: false });

  if (error || !data) return demoUebersicht("fehler");

  const lieferungen: LieferungZeile[] = data.map((l) => {
    const kunde = einsAus(l.b2b_kunden);
    const charge = einsAus(l.chargen);
    const vorbestellung = einsAus(l.vorbestellungen);
    const messungen = charge?.kuehlketten_messungen ?? [];
    const letzteMessung = [...messungen].sort((a, b) =>
      b.gemessen_am.localeCompare(a.gemessen_am),
    )[0];

    return {
      id: l.id,
      kunde: kunde?.name ?? "-",
      kundeId: kunde?.id ?? "",
      chargeCode: charge?.code ?? null,
      bestellteMengeKg: vorbestellung ? Number(vorbestellung.menge_kg) : null,
      mengeKg: Number(l.menge_kg),
      status: l.status as LieferungStatus,
      geliefertAm: l.geliefert_am,
      empfaengerName: l.empfaenger_name,
      belegStoragePath: l.beleg_storage_path,
      letzteKuehlmessung: letzteMessung
        ? {
            temperaturC: Number(letzteMessung.temperatur_c),
            minutenSeitPfluecken:
              letzteMessung.minuten_seit_pfluecken === null
                ? null
                : Number(letzteMessung.minuten_seit_pfluecken),
            ergebnis: letzteMessung.ergebnis,
          }
        : null,
      transportMessungen: (l.transport_temperatur_messungen ?? [])
        .map((m) => ({
          id: m.id,
          temperaturC: Number(m.temperatur_c),
          ergebnis: m.ergebnis,
          gemessenAm: m.gemessen_am,
        }))
        .sort((a, b) => a.gemessenAm.localeCompare(b.gemessenAm)),
    };
  });

  return { quelle: "db", lieferungen };
}

// Referenzlisten fuer das Anlegen-Formular - wie ladeB2bKundeOptionen() in
// lib/data/finanzen.ts, hier bewusst eine eigene, kleine Kopie statt eines
// Cross-Imports zwischen Fachdomaenen.
export async function ladeB2bKundeOptionenFuerLieferung(): Promise<AuswahlZeile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("b2b_kunden").select("id, name").order("name");
  return (data ?? []).map((k) => ({ id: k.id, label: k.name }));
}

export async function ladeChargeOptionenFuerLieferung(): Promise<AuswahlZeile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("chargen")
    .select("id, code")
    .order("code", { ascending: false })
    .limit(200);
  return (data ?? []).map((c) => ({ id: c.id, label: c.code }));
}
