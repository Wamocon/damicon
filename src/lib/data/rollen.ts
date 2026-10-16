import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { roles, type Role } from "@/lib/rbac";

// Konten und ihre Rollen (WMCNL-1441). Welche Zeilen zurueckkommen, entscheidet
// die Zeilensicherheit von profiles: das Buero sieht alle Konten, jede andere
// Rolle nur das eigene. Diese Datei filtert deshalb nicht selbst.

export interface KontoZeile {
  id: string;
  name: string;
  email: string | null;
  rolle: Role;
  /** Gehoert zu einem B2B-Kunden: Zugang laeuft ueber Einladungen, nicht ueber die Rollenzuweisung. */
  kundenkonto: boolean;
  /** Zeitpunkt der Sperre; null = aktiv. */
  gesperrtAm: string | null;
  /** Grund der Sperre (nur fuer die Administration gedacht). */
  gesperrtGrund: string | null;
}

export interface KontenListe {
  quelle: Datenquelle;
  konten: KontoZeile[];
  /** Konten mit der Rolle admin, fuer die Warnung vor dem letzten Administrator. */
  adminAnzahl: number;
}

const istRolle = (wert: string): wert is Role => (roles as readonly string[]).includes(wert);

export async function ladeKonten(): Promise<KontenListe> {
  if (!isSupabaseConfigured()) return { quelle: "demo", konten: [], adminAnzahl: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, b2b_kunde_id, gesperrt_am, gesperrt_grund")
    .order("full_name");
  if (error || !data) return { quelle: "fehler", konten: [], adminAnzahl: 0 };

  const konten = data
    .filter((p) => istRolle(p.role))
    .map((p) => ({
      id: p.id,
      name: p.full_name,
      email: p.email,
      rolle: p.role as Role,
      kundenkonto: p.role === "kunde" || p.b2b_kunde_id !== null,
      gesperrtAm: p.gesperrt_am,
      gesperrtGrund: p.gesperrt_grund,
    }));
  // Nur aktive Administratoren zaehlen: ein gesperrter arbeitet nicht und ersetzt keinen.
  return { quelle: "db", konten, adminAnzahl: konten.filter((k) => k.rolle === "admin" && k.gesperrtAm === null).length };
}
