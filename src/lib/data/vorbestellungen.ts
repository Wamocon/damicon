import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";
import {
  demoKontingente,
  demoPreislisten,
  demoVorbestellungen,
  type AuswahlZeile,
  type KontingentZeile,
  type PreislisteZeile,
  type VorbestellungStatus,
  type VorbestellungZeile,
} from "@/lib/domain/vorbestellungen";

// B2B-Portal: Preisliste und Vorbestellung (Anforderung 5.1, Teil 2 von 2).
// RLS (vorbestellungen_insert_kunde_buero/-update_buero/-update_kunde_storno,
// Migration 20260929000000) entscheidet, welche Zeilen lesbar/schreibbar
// sind - Buero sieht alle, eine Kunden-Anmeldung ausschliesslich die eigene
// Firma (vorbestellungen_select_kunde_buero, Migration 20260926000000).

export interface VorbestellungenUebersicht {
  quelle: Datenquelle;
  vorbestellungen: VorbestellungZeile[];
}

function demoUebersicht(quelle: VorbestellungenUebersicht["quelle"] = "demo"): VorbestellungenUebersicht {
  return { quelle, vorbestellungen: demoVorbestellungen };
}

export async function ladeVorbestellungen(): Promise<VorbestellungenUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vorbestellungen")
    .select(
      `id, menge_kg, liefertermin, status, created_at,
       b2b_kunden ( id, name ),
       sorten ( name )`,
    )
    .order("created_at", { ascending: false });

  if (error || !data) return demoUebersicht("fehler");

  const vorbestellungen: VorbestellungZeile[] = data.map((v) => {
    const kunde = einsAus(v.b2b_kunden);
    const sorte = einsAus(v.sorten);
    return {
      id: v.id,
      kunde: kunde?.name ?? "-",
      kundeId: kunde?.id ?? "",
      sorte: sorte?.name ?? "-",
      mengeKg: Number(v.menge_kg),
      liefertermin: v.liefertermin,
      status: v.status as VorbestellungStatus,
      erstelltAm: v.created_at,
    };
  });

  return { quelle: "db", vorbestellungen };
}

export interface KontingenteUebersicht {
  quelle: Datenquelle;
  kontingente: KontingentZeile[];
}

function demoKontingenteUebersicht(quelle: KontingenteUebersicht["quelle"] = "demo"): KontingenteUebersicht {
  return { quelle, kontingente: demoKontingente };
}

// Anforderung 5.1: der Kontingent-Stand selbst, nicht nur die daraus
// abgeleiteten Vorbestellungen. RLS (kontingente_select_kunde_buero,
// Migration 20260929000000) filtert bereits auf die eigene Firma - eine
// Kunden-Anmeldung sieht ohne weiteres Zutun nur die eigenen Zeilen.
export async function ladeKontingente(): Promise<KontingenteUebersicht> {
  if (!isSupabaseConfigured()) return demoKontingenteUebersicht();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kontingente")
    .select("id, menge_kg, reserviert_kg, saison, b2b_kunden ( id, name ), sorten ( name )")
    .order("saison", { ascending: false });

  if (error || !data) return demoKontingenteUebersicht("fehler");

  const kontingente: KontingentZeile[] = data.map((k) => {
    const kunde = einsAus(k.b2b_kunden);
    const sorte = einsAus(k.sorten);
    return {
      id: k.id,
      kunde: kunde?.name ?? "-",
      kundeId: kunde?.id ?? "",
      sorte: sorte?.name ?? "-",
      saison: k.saison,
      mengeKg: Number(k.menge_kg),
      reserviertKg: Number(k.reserviert_kg),
    };
  });

  return { quelle: "db", kontingente };
}

function demoPreislistenUebersicht(): PreislisteZeile[] {
  return demoPreislisten;
}

// Nur aktive, derzeit gueltige Preislisten. Anforderung 5.1/5.2
// (Preisstaffelung je Kundengruppe, Migration 20261011000000): ohne
// kundeId (Buero-Sicht im B2B-Portal) alle Gruppen unveraendert wie bisher;
// mit kundeId (eine Kunden-Anmeldung im eigenen Portal) nur die gruppenlose
// Standardliste plus die zur eigenen Kundengruppe passende Liste - eine
// Kunden-Anmeldung soll nicht die fuer andere Gruppen verhandelten Preise
// sehen.
export async function ladePreislisten(kundeId?: string): Promise<PreislisteZeile[]> {
  if (!isSupabaseConfigured()) return demoPreislistenUebersicht();

  const supabase = await createClient();
  const heute = new Date().toISOString().slice(0, 10);

  let eigeneKundengruppe: string | null = null;
  if (kundeId) {
    const { data: kunde } = await supabase
      .from("b2b_kunden")
      .select("kundengruppe")
      .eq("id", kundeId)
      .maybeSingle();
    eigeneKundengruppe = kunde?.kundengruppe ?? null;
  }

  let query = supabase
    .from("preislisten")
    .select(
      `id, name, gueltig_ab, gueltig_bis, aktiv, kundengruppe,
       preislisten_positionen ( id, preis_tenge_kg, min_menge_kg, sorten ( name ) )`,
    )
    .eq("aktiv", true)
    .lte("gueltig_ab", heute)
    .order("gueltig_ab", { ascending: false });

  if (kundeId) {
    query = eigeneKundengruppe
      ? query.or(`kundengruppe.is.null,kundengruppe.eq.${eigeneKundengruppe}`)
      : query.is("kundengruppe", null);
  }

  const { data, error } = await query;

  if (error || !data) return demoPreislistenUebersicht();

  return data
    .filter((p) => !p.gueltig_bis || p.gueltig_bis >= heute)
    .map((p) => ({
      id: p.id,
      name: p.name,
      gueltigAb: p.gueltig_ab,
      gueltigBis: p.gueltig_bis,
      aktiv: p.aktiv,
      kundengruppe: p.kundengruppe,
      positionen: (p.preislisten_positionen ?? []).map((pos) => {
        const sorte = einsAus(pos.sorten);
        return {
          id: pos.id,
          sorte: sorte?.name ?? "-",
          preisTengeKg: Number(pos.preis_tenge_kg),
          minMengeKg: Number(pos.min_menge_kg),
        };
      }),
    }));
}

// Referenzlisten fuer das Anlegen-Formular - eigene, kleine Kopie statt eines
// Cross-Imports zwischen Fachdomaenen (wie ladeB2bKundeOptionenFuerLieferung()
// in lib/data/lieferungen.ts).
export async function ladeSortenOptionenFuerVorbestellung(): Promise<AuswahlZeile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("sorten").select("id, name").order("name");
  return (data ?? []).map((s) => ({ id: s.id, label: s.name }));
}

export async function ladeB2bKundeOptionenFuerVorbestellung(): Promise<AuswahlZeile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("b2b_kunden").select("id, name").order("name");
  return (data ?? []).map((k) => ({ id: k.id, label: k.name }));
}
