import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { demoZukaufPositionen } from "@/lib/domain/zukauf";
import { einsAus } from "@/lib/data/util";
import type { ZukaufReferenzListe } from "@/lib/import/zukauf-parser";

// Aggregator / Zukauf von Nachbarbetrieben (WMCNL-1453). Wie bei
// ladeStandortBaum()/ladeLohnUebersicht(): ohne Supabase-Umgebung liefern die
// Funktionen hier die Beispieldaten aus src/lib/domain/zukauf.ts, damit der
// Prototyp ohne Datenbank startbar bleibt.

export interface ZukaufPositionEintrag {
  id: string;
  nachbarbetrieb: string;
  nachbarbetriebId: string;
  sorte: string | null;
  chargeCode: string | null;
  mengeKg: number;
  preisTengeKg: number | null;
  rechnungsdatum: string | null;
  erntedatum: string | null;
  erfasstAm: string;
}

export interface ZukaufListe {
  quelle: Datenquelle;
  positionen: ZukaufPositionEintrag[];
  stats: {
    positionen: number;
    summeMengeKg: number;
    nachbarbetriebe: number;
    offenePreise: number;
  };
}

function statsAus(positionen: ZukaufPositionEintrag[]): ZukaufListe["stats"] {
  return {
    positionen: positionen.length,
    summeMengeKg: positionen.reduce((s, p) => s + p.mengeKg, 0),
    nachbarbetriebe: new Set(positionen.map((p) => p.nachbarbetriebId)).size,
    offenePreise: positionen.filter((p) => p.preisTengeKg === null).length,
  };
}

function demoListe(quelle: ZukaufListe["quelle"] = "demo"): ZukaufListe {
  const positionen: ZukaufPositionEintrag[] = demoZukaufPositionen.map((p) => ({ ...p }));
  return { quelle, positionen, stats: statsAus(positionen) };
}

export async function ladeZukaufPositionen(): Promise<ZukaufListe> {
  if (!isSupabaseConfigured()) return demoListe();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zukauf_positionen")
    .select(
      `id, menge_kg, preis_tenge_kg, rechnungsdatum, created_at,
       nachbarbetriebe ( id, name ),
       sorten ( name ),
       chargen ( code, ernte_datum )`,
    )
    .order("created_at", { ascending: false });

  // Bei einem Lesefehler lieber die Beispieldaten zeigen als eine leere
  // Seite - aber ausdruecklich als Fehler gekennzeichnet, nicht als Demo
  // (gleiches Muster wie ladeStandortBaum).
  if (error || !data) return demoListe("fehler");

  const positionen: ZukaufPositionEintrag[] = data.map((p) => {
    const nachbarbetrieb = einsAus(p.nachbarbetriebe);
    const sorte = einsAus(p.sorten);
    const charge = einsAus(p.chargen);
    return {
      id: p.id,
      nachbarbetrieb: nachbarbetrieb?.name ?? "-",
      nachbarbetriebId: nachbarbetrieb?.id ?? "",
      sorte: sorte?.name ?? null,
      chargeCode: charge?.code ?? null,
      mengeKg: Number(p.menge_kg),
      preisTengeKg: p.preis_tenge_kg === null ? null : Number(p.preis_tenge_kg),
      rechnungsdatum: p.rechnungsdatum,
      erntedatum: charge?.ernte_datum ?? null,
      erfasstAm: p.created_at,
    };
  });

  return { quelle: "db", positionen, stats: statsAus(positionen) };
}

// Referenzliste fuer den Import-Parser (Namen -> id) und fuer den Hinweis im
// Formular, welche Nachbarbetriebe bereits angebunden sind. Wie ladeSorten()
// in src/lib/data/standort.ts: im Demo-Modus leer, weil sie ausschliesslich
// vom (dort nicht sichtbaren) Import-Formular gebraucht wird.
export async function ladeNachbarbetriebe(): Promise<ZukaufReferenzListe[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("nachbarbetriebe").select("id, name").order("name");
  return data ?? [];
}
