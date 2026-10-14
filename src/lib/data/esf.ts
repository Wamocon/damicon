import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Database } from "@/lib/database.types";
import { einsAus } from "@/lib/data/util";
import { istEsfStatus, liesEntwurf, type EsfEntwurf, type EsfEntwurfEingabe, type EsfStatus } from "@/lib/domain/esf";
import { tagInZone } from "@/lib/domain/tageszeit";

// Belegregister der elektronischen Rechnung (WMCNL-1440, Stufe 1). Lesen darf nur das Buero
// (Zeilensicherheit von esf_belege und v_esf_offen). Ohne Datenbank gibt es kein Register: ein
// erfundenes waere Irrefuehrung.

export interface EsfOffeneLieferung {
  lieferungId: string;
  kunde: string;
  geliefertAm: string;
  mengeKg: number;
  tageSeitLieferung: number;
  belegId: string | null;
  belegStatus: EsfStatus | null;
}

export interface EsfBelegZeile {
  id: string;
  lieferungId: string;
  kunde: string;
  geliefertAm: string | null;
  mengeKg: number | null;
  status: EsfStatus;
  esfNummer: string | null;
  ausgestelltAm: string | null;
  bestaetigtAm: string | null;
  bemerkung: string | null;
  /** null, wenn das gespeicherte Standbild nicht lesbar ist. */
  entwurf: EsfEntwurf | null;
}

export interface EsfUebersicht {
  offen: EsfOffeneLieferung[];
  belege: EsfBelegZeile[];
}

export async function ladeEsfUebersicht(): Promise<EsfUebersicht> {
  if (!isSupabaseConfigured()) return { offen: [], belege: [] };

  const supabase = await createClient();
  const [{ data: offen }, { data: belege }] = await Promise.all([
    supabase.from("v_esf_offen").select("*").order("geliefert_am", { ascending: true }),
    supabase
      .from("esf_belege")
      .select("id, lieferung_id, status, esf_nummer, ausgestellt_am, bestaetigt_am, bemerkung, entwurf")
      .order("updated_at", { ascending: false }),
  ]);

  const lieferungIds = (belege ?? []).map((b) => b.lieferung_id);
  const { data: lieferungen } = lieferungIds.length
    ? await supabase.from("lieferungen").select("id, geliefert_am, menge_kg, b2b_kunden ( name )").in("id", lieferungIds)
    : { data: [] };
  const zuLieferung = new Map((lieferungen ?? []).map((l) => [l.id, l]));

  return {
    offen: (offen ?? [])
      .filter((z): z is typeof z & { lieferung_id: string; geliefert_am: string } => z.lieferung_id !== null && z.geliefert_am !== null)
      .map((z) => ({
        lieferungId: z.lieferung_id,
        kunde: z.kunde ?? "-",
        geliefertAm: z.geliefert_am,
        mengeKg: Number(z.menge_kg ?? 0),
        tageSeitLieferung: Number(z.tage_seit_lieferung ?? 0),
        belegId: z.beleg_id,
        belegStatus: z.beleg_status !== null && istEsfStatus(z.beleg_status) ? z.beleg_status : null,
      })),
    belege: (belege ?? [])
      .filter((b) => istEsfStatus(b.status))
      .map((b) => {
        const l = zuLieferung.get(b.lieferung_id);
        return {
          id: b.id,
          lieferungId: b.lieferung_id,
          kunde: einsAus(l?.b2b_kunden)?.name ?? "-",
          geliefertAm: l?.geliefert_am ?? null,
          mengeKg: l ? Number(l.menge_kg) : null,
          status: b.status as EsfStatus,
          esfNummer: b.esf_nummer,
          ausgestelltAm: b.ausgestellt_am,
          bestaetigtAm: b.bestaetigt_am,
          bemerkung: b.bemerkung,
          entwurf: liesEntwurf(b.entwurf),
        };
      }),
  };
}

// --- Eingabe fuer den Entwurf -----------------------------------------------------------------------------------

export type EntwurfEingabeErgebnis =
  | { ok: true; eingabe: EsfEntwurfEingabe }
  | { ok: false; grund: "nichtGefunden" | "nichtZugestellt" }
  | { ok: false; grund: "datenbank"; fehler: PostgrestError };

/**
 * Sammelt, was der Entwurf einer Lieferung braucht: Kunde, Sorte, Menge, Preislisten und den MwSt-Stand.
 * Alles kommt aus der Datenbank, nichts aus dem Formular: der Entwurf ist ein Standbild vertrauenswuerdiger Daten.
 */
export async function ladeEntwurfEingabe(supabase: SupabaseClient<Database>, lieferungId: string): Promise<EntwurfEingabeErgebnis> {
  const { data: l, error } = await supabase
    .from("lieferungen")
    .select("id, status, geliefert_am, menge_kg, b2b_kunden ( name, identifikationsnummer, rechtsform, kundengruppe ), chargen ( code, sorte_id ), vorbestellungen ( sorte_id )")
    .eq("id", lieferungId)
    .maybeSingle();
  if (error) return { ok: false, grund: "datenbank", fehler: error };
  if (!l) return { ok: false, grund: "nichtGefunden" };
  if (l.status !== "zugestellt" || l.geliefert_am === null) return { ok: false, grund: "nichtZugestellt" };

  const kunde = einsAus(l.b2b_kunden);
  if (!kunde) return { ok: false, grund: "nichtGefunden" };
  const charge = einsAus(l.chargen);
  const sorteId = charge?.sorte_id ?? einsAus(l.vorbestellungen)?.sorte_id ?? null;

  const [sorte, preislisten, saetze, mwst] = await Promise.all([
    sorteId ? supabase.from("sorten").select("name").eq("id", sorteId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("preislisten").select("gueltig_ab, gueltig_bis, kundengruppe, preislisten_positionen ( sorte_id, preis_tenge_kg )"),
    supabase.from("mwst_saetze").select("gueltig_ab, gueltig_bis, standard_prozent"),
    supabase.from("betriebe_mwst_status").select("mwst_registriert, mwst_registriert_am").limit(1),
  ]);
  const fehler = sorte.error ?? preislisten.error ?? saetze.error ?? mwst.error;
  if (fehler) return { ok: false, grund: "datenbank", fehler };

  return {
    ok: true,
    eingabe: {
      stichtag: tagInZone(new Date(l.geliefert_am)),
      kunde: { name: kunde.name, identifikationsnummer: kunde.identifikationsnummer, rechtsform: kunde.rechtsform, kundengruppe: kunde.kundengruppe },
      sorteId,
      sorteName: sorte.data?.name ?? null,
      chargeCode: charge?.code ?? null,
      mengeKg: Number(l.menge_kg),
      preislisten: (preislisten.data ?? []).map((p) => ({
        gueltigAb: p.gueltig_ab,
        gueltigBis: p.gueltig_bis,
        kundengruppe: p.kundengruppe,
        positionen: (p.preislisten_positionen ?? []).map((pos) => ({ sorteId: pos.sorte_id, preisTengeKg: Number(pos.preis_tenge_kg) })),
      })),
      mwstSaetze: (saetze.data ?? []).map((s) => ({ gueltigAb: s.gueltig_ab, gueltigBis: s.gueltig_bis, prozent: Number(s.standard_prozent) })),
      mwstRegistriert: mwst.data?.[0]?.mwst_registriert ?? false,
      mwstRegistriertAm: mwst.data?.[0]?.mwst_registriert_am ?? null,
    },
  };
}
