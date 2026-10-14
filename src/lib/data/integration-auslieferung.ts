import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";
import { OUTBOX_STATUS, istOutboxStatus, type OutboxStatus } from "@/lib/domain/integration-auslieferung";

// Konfiguration und Warteschlange der Integrationen (WMCNL-1627) fuer die Ansicht. Lesen darf das Buero (Zeilensicherheit von
// integrationen und integration_outbox). Die Adresse des Ziels geht nur als Host an die Oberflaeche: ein Pfad kann Zugangsteile tragen.

export interface IntegrationZeile {
  id: string;
  key: string;
  name: string;
  system: string;
  adapter: string;
  zielUrl: string | null;
  /** Nur der Host der Adresse, nie der ganze Pfad. */
  zielHost: string | null;
  geheimnisName: string | null;
  /** Ist die Umgebungsvariable auf dem Server gesetzt? Der Wert verlaesst den Server nie. */
  geheimnisGesetzt: boolean;
  aktiv: boolean;
}

export interface OutboxZeile {
  id: string;
  integrationKey: string | null;
  zielSystem: string;
  ereignis: string | null;
  status: OutboxStatus;
  versuche: number;
  letzterFehler: string | null;
  naechsterVersuchAm: string;
  antwortStatus: number | null;
  erstelltAm: string;
  verarbeitetAm: string | null;
}

export interface AuslieferungUebersicht {
  integrationen: IntegrationZeile[];
  eintraege: OutboxZeile[];
  zaehlung: Record<OutboxStatus, number>;
}

/** So viele Eintraege der Warteschlange zeigt die Seite, die juengsten zuerst. */
export const EINTRAEGE_MAX = 30;

const hostVon = (url: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

export async function ladeAuslieferung(): Promise<AuslieferungUebersicht | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const [integrationen, eintraege, ...zaehlungen] = await Promise.all([
    supabase.from("integrationen").select("id, key, name, system, adapter, ziel_url, geheimnis_name, aktiv").order("name"),
    supabase
      .from("integration_outbox")
      .select("id, ziel_system, ereignis, status, versuche, letzter_fehler, naechster_versuch_am, antwort_status, created_at, verarbeitet_am, integrationen ( key )")
      .order("created_at", { ascending: false })
      .limit(EINTRAEGE_MAX),
    ...OUTBOX_STATUS.map((s) => supabase.from("integration_outbox").select("id", { count: "exact", head: true }).eq("status", s)),
  ]);
  const lesefehler = integrationen.error ?? eintraege.error;
  if (lesefehler) console.error("[damicon] Integrationen lesen fehlgeschlagen:", lesefehler.message);

  const zaehlung = { pending: 0, sent: 0, acked: 0, failed: 0 } as Record<OutboxStatus, number>;
  OUTBOX_STATUS.forEach((s, i) => {
    zaehlung[s] = zaehlungen[i].count ?? 0;
  });

  return {
    integrationen: (integrationen.data ?? []).map((i) => ({
      id: i.id,
      key: i.key,
      name: i.name,
      system: i.system,
      adapter: i.adapter,
      zielUrl: i.ziel_url,
      zielHost: hostVon(i.ziel_url),
      geheimnisName: i.geheimnis_name,
      geheimnisGesetzt: i.geheimnis_name !== null && Boolean(process.env[i.geheimnis_name]),
      aktiv: i.aktiv,
    })),
    eintraege: (eintraege.data ?? [])
      .filter((e) => istOutboxStatus(e.status))
      .map((e) => ({
        id: e.id,
        integrationKey: einsAus(e.integrationen)?.key ?? null,
        zielSystem: e.ziel_system,
        ereignis: e.ereignis,
        status: e.status as OutboxStatus,
        versuche: e.versuche,
        letzterFehler: e.letzter_fehler,
        naechsterVersuchAm: e.naechster_versuch_am,
        antwortStatus: e.antwort_status,
        erstelltAm: e.created_at,
        verarbeitetAm: e.verarbeitet_am,
      })),
    zaehlung,
  };
}
