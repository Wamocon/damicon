import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";
import { berechneProforma, type ProformaZeile } from "@/lib/domain/rechnungshistorie";

// Rechnungshistorie (Anforderung 5.2, Teil 2b) - siehe domain/rechnungshistorie.ts
// fuer die fachliche Festlegung "Proforma statt echter Rechnung". RLS
// (lieferungen_select_kunde_buero) filtert bereits auf die eigene Firma bzw.
// alle fuers Buero, wie bei ladeLieferungen().

export interface RechnungZeile extends ProformaZeile {
  kunde: string;
}

export interface RechnungenUebersicht {
  quelle: Datenquelle;
  zeilen: RechnungZeile[];
}

function demoUebersicht(quelle: RechnungenUebersicht["quelle"] = "demo"): RechnungenUebersicht {
  return {
    quelle,
    zeilen: [
      {
        lieferungId: "demo-rechnung-1",
        kunde: "Handelskette A",
        geliefertAm: "2026-08-30T15:40:00.000Z",
        mengeKg: 80,
        preisTengeKg: 3200,
        betragTenge: 256_000,
      },
    ],
  };
}

export async function ladeRechnungshistorie(): Promise<RechnungenUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();
  const [{ data: lieferungen, error: lieferungenFehler }, { data: preislisten, error: preislistenFehler }] =
    await Promise.all([
      supabase
        .from("lieferungen")
        .select(
          "id, geliefert_am, menge_kg, b2b_kunden ( name, kundengruppe ), chargen ( sorte_id )",
        )
        .eq("status", "zugestellt")
        .order("geliefert_am", { ascending: false }),
      supabase
        .from("preislisten")
        .select(
          "gueltig_ab, gueltig_bis, kundengruppe, preislisten_positionen ( sorte_id, preis_tenge_kg )",
        ),
    ]);

  if (lieferungenFehler || preislistenFehler || !lieferungen || !preislisten) return demoUebersicht("fehler");

  const preislistenFuerBerechnung = preislisten.map((p) => ({
    gueltigAb: p.gueltig_ab,
    gueltigBis: p.gueltig_bis,
    kundengruppe: p.kundengruppe,
    positionen: (p.preislisten_positionen ?? []).map((pos) => ({
      sorteId: pos.sorte_id,
      preisTengeKg: Number(pos.preis_tenge_kg),
    })),
  }));

  const gueltig = lieferungen.filter((l) => l.geliefert_am !== null);
  const proforma = berechneProforma(
    gueltig.map((l) => ({
      id: l.id,
      geliefertAm: l.geliefert_am as string,
      mengeKg: Number(l.menge_kg),
      sorteId: einsAus(l.chargen)?.sorte_id ?? null,
      kundengruppe: einsAus(l.b2b_kunden)?.kundengruppe ?? null,
    })),
    preislistenFuerBerechnung,
  );

  const kundeNachId = new Map(gueltig.map((l) => [l.id, einsAus(l.b2b_kunden)?.name ?? "-"]));

  return {
    quelle: "db",
    zeilen: proforma.map((p) => ({ ...p, kunde: kundeNachId.get(p.lieferungId) ?? "-" })),
  };
}
