import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { kpis as demoKpis, type Kpi } from "@/lib/domain/kpis";

// Die 14 Baseline-Kennzahlen werden am 01.10.2026 mit dem Kunden
// unterschrieben. Acht davon rechnet die Datenbank inzwischen aus echten
// Daten (public.kpi_aktuell()), die uebrigen sechs bleiben Platzhalter aus
// kpi_baseline - dort fehlt nicht die Abfrage, sondern die Funktion, die den
// Wert ueberhaupt erzeugt.

export interface KpiListe {
  quelle: Datenquelle;
  kpis: Kpi[];
  /** Wie viele Kennzahlen tatsaechlich aus Daten gerechnet wurden. */
  gerechnet: number;
}

// React.cache buendelt die Aufrufe innerhalb einer Anfrage. Seit die vier
// Bereichsseiten dieselbe Liste laden, riefe sonst jede Seite kpi_aktuell()
// erneut auf - und die Funktion rechnet ueber den gesamten Datenbestand,
// nicht ueber den Ausschnitt einer Zone.
export const ladeKpis = cache(ladeKpisRoh);

async function ladeKpisRoh(): Promise<KpiListe> {
  if (!isSupabaseConfigured()) {
    return { quelle: "demo", kpis: demoKpis, gerechnet: 0 };
  }

  const supabase = await createClient();

  const [{ data: baseline, error }, { data: gerechnetRoh }] = await Promise.all([
    supabase.from("kpi_baseline").select("key, zone, baseline_wert, ziel, gut_richtung"),
    supabase.rpc("kpi_aktuell"),
  ]);

  if (error || !baseline || baseline.length === 0) {
    return { quelle: "fehler", kpis: demoKpis, gerechnet: 0 };
  }

  const ausDb = new Map(baseline.map((zeile) => [zeile.key, zeile]));
  const ausRechnung = new Map(
    (gerechnetRoh ?? []).map((zeile) => [zeile.schluessel, zeile]),
  );

  // Reihenfolge und Fachdefinition kommen aus src/lib/domain/kpis.ts,
  // Zielwerte aus der Baseline-Tabelle, Istwerte aus der Berechnung.
  const kpis = demoKpis.map((kpi) => {
    const zeile = ausDb.get(kpi.key);
    const rechnung = ausRechnung.get(kpi.key);

    return {
      ...kpi,
      zone: (zeile?.zone as Kpi["zone"]) ?? kpi.zone,
      wert: zeile?.baseline_wert ?? kpi.wert,
      ziel: zeile?.ziel ?? kpi.ziel,
      gutRichtung: (zeile?.gut_richtung as Kpi["gutRichtung"]) ?? kpi.gutRichtung,
      gerechnet:
        rechnung && rechnung.wert !== null
          ? {
              zahl: Number(rechnung.wert),
              einheit: rechnung.einheit ?? "",
              basis: rechnung.basis ?? "",
              datensaetze: rechnung.datensaetze ?? 0,
            }
          : null,
    };
  });

  return {
    quelle: "db",
    kpis,
    gerechnet: kpis.filter((kpi) => kpi.gerechnet).length,
  };
}
