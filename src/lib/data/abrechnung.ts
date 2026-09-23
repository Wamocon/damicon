import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { demoAbrechnung, type AbrechnungZeile } from "@/lib/domain/abrechnung";

// Abrechnung gegenueber Lieferbetrieben (Anforderung 6.4). Der Rollen-Check
// steht in der Datenbankfunktion selbst (siehe Migrationskommentar
// 20261009000000) - ein unberechtigter Aufruf liefert einen Fehler statt
// leerer Daten, hier als "fehler"-Quelle abgefangen.

export interface AbrechnungUebersicht {
  quelle: Datenquelle;
  /** false, wenn abrechnung_je_nachbarbetrieb() die Rolle ausdruecklich
   *  ablehnt (42501 - nur admin/betriebsleitung/buchhaltung, siehe
   *  Migrationskommentar 20261009000000: "eine Abrechnungssumme gehoert
   *  ausschliesslich dem Buero"). Kein Betriebsfehler, deshalb ohne
   *  Demo-Fallback und ohne "Datenbank nicht erreichbar"-Abzeichen
   *  (WMCNL-2309) - der Aufrufer blendet den Abschnitt fuer diesen Fall
   *  einfach aus.
   */
  erlaubt: boolean;
  zeilen: AbrechnungZeile[];
  /** Aktuelle globale Spanne, auch wenn zeilen leer ist (keine Zukaufware bisher). */
  spanneProzent: number;
}

function demoUebersicht(quelle: AbrechnungUebersicht["quelle"] = "demo"): AbrechnungUebersicht {
  return { quelle, erlaubt: true, zeilen: demoAbrechnung, spanneProzent: 8 };
}

export async function ladeAbrechnung(): Promise<AbrechnungUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();
  const [{ data, error }, { data: einstellung }] = await Promise.all([
    supabase.rpc("abrechnung_je_nachbarbetrieb"),
    supabase.from("aggregator_einstellungen").select("spanne_prozent").limit(1).maybeSingle(),
  ]);

  if (error?.code === "42501") {
    return { quelle: "db", erlaubt: false, zeilen: [], spanneProzent: 0 };
  }

  if (error || !data) return demoUebersicht("fehler");

  return {
    quelle: "db",
    erlaubt: true,
    zeilen: data.map((z) => ({
      nachbarbetriebId: z.nachbarbetrieb_id,
      nachbarbetriebName: z.nachbarbetrieb_name,
      mengeKgGesamt: Number(z.menge_kg_gesamt),
      einkaufswertTenge: Number(z.einkaufswert_tenge),
      spanneProzent: Number(z.spanne_prozent),
      auszahlungTenge: Number(z.auszahlung_tenge),
    })),
    spanneProzent: Number(einstellung?.spanne_prozent ?? 0),
  };
}
