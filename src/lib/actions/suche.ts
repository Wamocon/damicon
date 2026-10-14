"use server";

import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  DATEN_AB,
  darfTypSehen,
  datenBegriff,
  trefferAusZeile,
  type DatenTreffer,
} from "@/lib/suche/daten";

// Datensuche der Kopfzeile (WMCNL-1467). Die Seitensuche laeuft im Browser,
// diese Suche braucht die Datenbank und laeuft deshalb auf dem Server, mit der
// Sitzung der angemeldeten Person: public.search_everything() ist security
// invoker, die Zeilensicherheit der Tabellen entscheidet also, was sie findet.
// Danach sortiert die Anwendung die Typen aus, deren Modul die Rolle nicht
// sehen darf.

export type DatenSuche =
  | { ok: true; begriff: string; treffer: DatenTreffer[] }
  | { ok: false; grund: "zuKurz" | "anmeldung" | "nichtVerfuegbar" | "fehler" };

/** So viele Treffer zeigt das Suchfenster, nachdem die nicht erlaubten Typen entfernt sind. */
const ANZEIGE_HOECHSTENS = 20;
/**
 * So viele Zeilen holt die Funktion. Mehr als angezeigt wird, weil die Typen
 * einer Rolle erst danach ausgesiebt werden: bei 20 geholten und 15 nicht
 * erlaubten Zeilen bliebe sonst fast nichts uebrig.
 */
const ABRUF_HOECHSTENS = 50;

export async function datenSuchen(roh: string): Promise<DatenSuche> {
  const begriff = typeof roh === "string" ? datenBegriff(roh) : "";
  const profil = await getSessionProfile();
  if (!profil) return { ok: false, grund: isSupabaseConfigured() ? "anmeldung" : "nichtVerfuegbar" };
  if (begriff.length < DATEN_AB) return { ok: false, grund: "zuKurz" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_everything", {
    q: begriff,
    max_rows: ABRUF_HOECHSTENS,
  });
  if (error || !data) return { ok: false, grund: "fehler" };

  const treffer = data
    .map(trefferAusZeile)
    .filter((t): t is DatenTreffer => t !== null && darfTypSehen(t.typ, profil.role))
    .slice(0, ANZEIGE_HOECHSTENS);
  return { ok: true, begriff, treffer };
}
