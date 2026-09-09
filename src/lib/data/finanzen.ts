import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
  demoB2bKundeOptionen,
  demoDeckungsbeitrag,
  demoKostentraegerOptionen,
  demoLedgerEintraege,
  demoReihenblockOptionen,
  demoSorteOptionen,
  type B2bKundeOption,
  type DeckungsbeitragZeile,
  type KostentraegerOption,
  type LedgerEintrag,
  type ReihenblockOption,
  type SorteOption,
} from "@/lib/domain/finanzen";
import { einsAus } from "@/lib/data/util";

// Finanzen/Kostentraeger (Anforderung 4.2, P0). Wie bei ladeLohnUebersicht():
// die Deckungsbeitrag-Rechnung steht in der Datenbank (View
// public.deckungsbeitrag_je_kostentraeger, Migration 20260909000000), diese
// Datei liest nur das Ergebnis. RLS entscheidet, was sichtbar ist - siehe
// dieselbe Migration fuer die Schreibrechte.

export interface FinanzenUebersicht {
  quelle: Datenquelle;
  deckungsbeitrag: DeckungsbeitragZeile[];
  ledger: LedgerEintrag[];
}

function demoUebersicht(quelle: FinanzenUebersicht["quelle"] = "demo"): FinanzenUebersicht {
  return { quelle, deckungsbeitrag: demoDeckungsbeitrag, ledger: demoLedgerEintraege };
}

export async function ladeFinanzenUebersicht(): Promise<FinanzenUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();

  const [
    { data: dbRows, error: dbFehler },
    { data: ledgerRows, error: ledgerFehler },
  ] = await Promise.all([
    supabase
      .from("deckungsbeitrag_je_kostentraeger")
      .select("*")
      .order("erntetag", { ascending: false, nullsFirst: false }),
    supabase
      .from("finance_ledger_entries")
      .select("id, typ, kategorie, betrag_tenge, buchungsdatum, beschreibung, kostentraeger ( bezeichnung )")
      .order("buchungsdatum", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (dbFehler || ledgerFehler) return demoUebersicht("fehler");

  // Der View-Typgenerator kann kostentraeger_id/bezeichnung nicht als NOT NULL
  // erkennen, obwohl sie es in der Basistabelle sind - die GROUP-BY-
  // Konstruktion der View kann keine Zeile ohne Kostentraeger liefern. Der
  // Fallback ist reine Typsicherheit, kein erwarteter Fall.
  const deckungsbeitrag: DeckungsbeitragZeile[] = (dbRows ?? [])
    .filter((r) => r.kostentraeger_id !== null && r.bezeichnung !== null)
    .map((r) => ({
      kostentraegerId: r.kostentraeger_id as string,
      bezeichnung: r.bezeichnung as string,
      erntetag: r.erntetag,
      reihenblockCode: r.reihenblock_code,
      sorteName: r.sorte_name,
      b2bKundeName: r.b2b_kunde_name,
      erloesTenge: Number(r.erloes_tenge),
      kostenTenge: Number(r.kosten_tenge),
      deckungsbeitragTenge: Number(r.deckungsbeitrag_tenge),
      buchungen: Number(r.buchungen),
      mengeKg: r.menge_kg === null ? null : Number(r.menge_kg),
      deckungsbeitragJeKgTenge:
        r.deckungsbeitrag_je_kg_tenge === null ? null : Number(r.deckungsbeitrag_je_kg_tenge),
    }));

  const ledger: LedgerEintrag[] = (ledgerRows ?? []).map((l) => ({
    id: l.id,
    kostentraegerBezeichnung: einsAus(l.kostentraeger)?.bezeichnung ?? "-",
    typ: l.typ,
    kategorie: l.kategorie,
    betragTenge: Number(l.betrag_tenge),
    buchungsdatum: l.buchungsdatum,
    beschreibung: l.beschreibung,
  }));

  return { quelle: "db", deckungsbeitrag, ledger };
}

// Referenzlisten fuer die Schreibformulare - wie ladeNachbarbetriebe() in
// lib/data/zukauf.ts: im Demo-Modus die Beispielwerte, weil die Formulare dort
// ohnehin nicht angezeigt werden (keine Anmeldung, kein Schreibpfad).

export async function ladeKostentraegerOptionen(): Promise<KostentraegerOption[]> {
  if (!isSupabaseConfigured()) return demoKostentraegerOptionen;
  const supabase = await createClient();
  const { data } = await supabase
    .from("kostentraeger")
    .select("id, bezeichnung")
    .order("erntetag", { ascending: false, nullsFirst: false });
  return (data ?? []).map((k) => ({ id: k.id, bezeichnung: k.bezeichnung }));
}

export async function ladeReihenblockOptionen(): Promise<ReihenblockOption[]> {
  if (!isSupabaseConfigured()) return demoReihenblockOptionen;
  const supabase = await createClient();
  const { data } = await supabase.from("reihenbloecke").select("id, code").order("code");
  return (data ?? []).map((r) => ({ id: r.id, code: r.code }));
}

export async function ladeSorteOptionen(): Promise<SorteOption[]> {
  if (!isSupabaseConfigured()) return demoSorteOptionen;
  const supabase = await createClient();
  const { data } = await supabase.from("sorten").select("id, name").order("name");
  return (data ?? []).map((s) => ({ id: s.id, name: s.name }));
}

export async function ladeB2bKundeOptionen(): Promise<B2bKundeOption[]> {
  if (!isSupabaseConfigured()) return demoB2bKundeOptionen;
  const supabase = await createClient();
  const { data } = await supabase.from("b2b_kunden").select("id, name").order("name");
  return (data ?? []).map((k) => ({ id: k.id, name: k.name }));
}
