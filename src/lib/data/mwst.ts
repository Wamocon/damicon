import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { demoMwstStatus, type MwstStatus } from "@/lib/domain/mwst";

// MwSt-Registrierungsstatus (Migration 20261025000000). Liest nur den
// zuletzt bekannten Stand ueber die View betriebe_mwst_status - eine echte
// Neuberechnung ist ein bewusster Knopfdruck (mwstSchwellePruefen(),
// actions/mwst.ts), kein Nebeneffekt des Lesens. Gleiches Prinzip wie
// ladeLohnUebersicht() fuer lohn_periode_berechnen(). Die Meldefrist selbst
// kommt fertig berechnet aus der View (public.werktage_addieren) - kein
// zweiter, TS-seitiger Nachbau derselben Kalenderregel.

export interface MwstUebersicht {
  quelle: Datenquelle;
  status: MwstStatus | null;
}

function demoUebersicht(quelle: MwstUebersicht["quelle"] = "demo"): MwstUebersicht {
  return { quelle, status: demoMwstStatus };
}

export async function ladeMwstStatus(): Promise<MwstUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();

  const [{ data: satzRows, error: satzFehler }, { data: betriebRows, error: betriebFehler }] =
    await Promise.all([
      supabase.from("mwst_saetze").select("*").order("gueltig_ab", { ascending: false }).limit(1),
      supabase.from("betriebe_mwst_status").select("*").limit(1),
    ]);

  if (satzFehler || betriebFehler || !satzRows?.[0] || !betriebRows?.[0]) {
    return demoUebersicht("fehler");
  }

  const satz = satzRows[0];
  const betrieb = betriebRows[0];

  const status: MwstStatus = {
    standardProzent: Number(satz.standard_prozent),
    schwelleTenge: Number(satz.schwelle_tenge),
    quelle: satz.quelle,
    // mwst_registriert ist in der Basistabelle not null default false - die
    // View markiert Spalten grundsaetzlich als nullable im generierten Typ.
    registriert: betrieb.mwst_registriert ?? false,
    registriertAm: betrieb.mwst_registriert_am,
    schwelleUeberschrittenAm: betrieb.mwst_schwelle_ueberschritten_am,
    meldefristAm: betrieb.meldefrist_am,
    letzterUmsatzTenge:
      betrieb.mwst_letzter_umsatz_tenge === null ? null : Number(betrieb.mwst_letzter_umsatz_tenge),
    letztePruefungAm: betrieb.mwst_letzte_pruefung_am,
  };

  return { quelle: "db", status };
}
