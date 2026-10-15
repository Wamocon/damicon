import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { LAUF_BUDGET_MS, liefereAus, type AuslieferungSpeicher, type AuslieferungsErgebnis, type Sender } from "@/lib/integration/auslieferung";
import { sendeWebhook } from "@/lib/integration/webhook-adapter";
import type { Fortschritt } from "@/lib/domain/integration-auslieferung";
import { einsAus } from "@/lib/data/util";

// Die Warteschlange in der Datenbank (WMCNL-1627) und der Sender, der je Adapter den richtigen Weg waehlt. Die Auslieferung laeuft
// mit dem Dienstschluessel des Servers: sie gehoert zu keiner Person, und die Zeilensicherheit der Warteschlange erlaubt einer
// Person nur das Wiederholen.

export function supabaseSpeicher(supabase: SupabaseClient<Database>): AuslieferungSpeicher {
  return {
    async faellige(jetzt, limit) {
      const { data, error } = await supabase
        .from("integration_outbox")
        .select("id, ereignis, idempotenz_schluessel, payload, versuche, created_at, naechster_versuch_am, integrationen!inner ( id, key, adapter, ziel_url, geheimnis_name, auth_art, zugang_name, vorlage, bestaetigung_erwartet, aktiv )")
        .eq("status", "pending")
        .lte("naechster_versuch_am", jetzt.toISOString())
        .eq("integrationen.aktiv", true)
        .eq("integrationen.adapter", "webhook")
        .order("naechster_versuch_am", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`Warteschlange lesen: ${error.message}`);
      return (data ?? []).flatMap((z) => {
        const i = einsAus(z.integrationen);
        return i
          ? [
              {
                eintrag: { id: z.id, ereignis: z.ereignis, idempotenzSchluessel: z.idempotenz_schluessel, payload: z.payload, versuche: z.versuche, erstelltAm: z.created_at, naechsterVersuchAm: z.naechster_versuch_am },
                integration: { id: i.id, key: i.key, adapter: i.adapter, zielUrl: i.ziel_url, geheimnisName: i.geheimnis_name, authArt: i.auth_art, zugangName: i.zugang_name, vorlage: i.vorlage, bestaetigungErwartet: i.bestaetigung_erwartet },
              },
            ]
          : [];
      });
    },

    async beanspruche(id, erwartet, bis) {
      const { data, error } = await supabase
        .from("integration_outbox")
        .update({ naechster_versuch_am: bis.toISOString() })
        .eq("id", id)
        .eq("status", "pending")
        .eq("naechster_versuch_am", erwartet)
        .select("id");
      if (error) throw new Error(`Eintrag sperren: ${error.message}`);
      return (data ?? []).length === 1;
    },

    async speichere(id, f: Fortschritt, jetzt) {
      const { error } = await supabase
        .from("integration_outbox")
        .update({
          status: f.status,
          versuche: f.versuche,
          letzter_fehler: f.letzterFehler,
          antwort_status: f.antwortStatus,
          // Ein endgueltiger Eintrag wird nicht wieder faellig; ein wartender bekommt den Zeitpunkt der Wiederholung.
          naechster_versuch_am: (f.naechsterVersuchAm ?? jetzt).toISOString(),
          verarbeitet_am: f.status === "pending" ? null : jetzt.toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(`Ergebnis speichern: ${error.message}`);
    },
  };
}

/** Waehlt den Adapter der Integration. Ohne Webhook-Konfiguration gibt es keinen Weg hinaus. */
export const adapterSender: Sender = async (integration, umschlag) => {
  if (integration.adapter === "webhook" && integration.zielUrl && integration.geheimnisName) {
    return sendeWebhook(
      {
        zielUrl: integration.zielUrl,
        geheimnisName: integration.geheimnisName,
        authArt: integration.authArt === "basic" ? "basic" : "hmac",
        zugangName: integration.zugangName ?? null,
        vorlage: integration.vorlage ?? null,
      },
      umschlag,
    );
  }
  return { art: "abgelehnt", grund: "Kein Adapter eingerichtet", status: 0 };
};

/** Ein Lauf mit dem Dienstschluessel: fuer die Route des Cron-Dienstes und fuer den Knopf der Administration. */
export async function liefereFaelligeAus(limit = 20): Promise<AuslieferungsErgebnis> {
  const supabase = createServiceRoleClient();
  return liefereAus(supabaseSpeicher(supabase), adapterSender, new Date(), limit, await ladeBudgetMs(supabase));
}

/**
 * Das Zeitbudget eines Laufs aus der Einstellung auslieferung.zeitbudget_sekunden (Standard 40, hoechstens 55: die Funktion der Plattform laeuft 60 Sekunden). Nicht
 * gesetzt oder nicht lesbar heisst hier: der Standard, nicht "ohne Grenze", denn ein Lauf ohne Grenze laeuft in das Zeitlimit der Funktion.
 */
export async function ladeBudgetMs(supabase: SupabaseClient<Database>): Promise<number> {
  const { data } = await supabase.from("betriebs_einstellungen").select("wert").eq("schluessel", "auslieferung.zeitbudget_sekunden").maybeSingle();
  const sekunden = data?.wert === null || data?.wert === undefined ? null : Number(data.wert);
  return sekunden !== null && Number.isFinite(sekunden) && sekunden >= 5 && sekunden <= 55 ? sekunden * 1000 : LAUF_BUDGET_MS;
}
