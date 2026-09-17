import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
  demoStammdaten,
  type StammdatenGruppe,
  type StammdatenZeile,
} from "@/lib/domain/stammdaten";
import type { Rechtsform } from "@/lib/domain/rechtsform";
import type { Database } from "@/lib/database.types";

// Anforderung E.11: Rechtsform und ИИН/БИН fuer Betrieb, Zulieferer und Kunden.
// Drei Tabellen, eine Liste - die Maske pflegt alle drei gleich.

export interface StammdatenUebersicht {
  quelle: Datenquelle;
  zeilen: StammdatenZeile[];
}

type Roh = {
  id: string;
  name: string;
  rechtsform: Rechtsform | null;
  identifikationsnummer: string | null;
};

const SPALTEN = "id, name, rechtsform, identifikationsnummer";

async function ladeMit(supabase: SupabaseClient<Database>): Promise<StammdatenUebersicht> {
  // Drei Abfragen statt einer Sicht: Die Tabellen tragen unterschiedliche
  // Rechte (betriebe und nachbarbetriebe nur Leitung, b2b_kunden das Buero).
  // Eine gemeinsame Sicht muesste die strengste davon durchsetzen und wuerde
  // dem Buero die Kundenzeilen nehmen, die es pflegen darf.
  const [betrieb, zulieferer, kunden] = await Promise.all([
    supabase.from("betriebe").select(SPALTEN).order("name"),
    supabase.from("nachbarbetriebe").select(SPALTEN).order("name"),
    supabase.from("b2b_kunden").select(SPALTEN).order("name"),
  ]);

  const fehler = betrieb.error ?? zulieferer.error ?? kunden.error;
  if (fehler) {
    console.error("[stammdaten] Laden fehlgeschlagen:", fehler.message);
    return { quelle: "demo", zeilen: demoStammdaten };
  }

  const zu = (rohe: Roh[] | null, gruppe: StammdatenGruppe): StammdatenZeile[] =>
    (rohe ?? []).map((r) => ({
      id: r.id,
      gruppe,
      name: r.name,
      rechtsform: r.rechtsform,
      identifikationsnummer: r.identifikationsnummer,
    }));

  return {
    quelle: "db",
    zeilen: [
      ...zu(betrieb.data as Roh[] | null, "betrieb"),
      ...zu(zulieferer.data as Roh[] | null, "zulieferer"),
      ...zu(kunden.data as Roh[] | null, "kunde"),
    ],
  };
}

export async function ladeStammdaten(): Promise<StammdatenUebersicht> {
  if (!isSupabaseConfigured()) return { quelle: "demo", zeilen: demoStammdaten };
  const supabase = await createClient();
  return ladeMit(supabase);
}
