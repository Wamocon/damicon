"use server";

import { createClient } from "@/lib/supabase/server";
import type { SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, okMitWerten, type AktionsStatus } from "@/lib/actions/status";
import { mitRecht, type Zugriff } from "@/lib/actions/zugriff";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { konfigurationFehler } from "@/lib/domain/integration-auslieferung";
import { pruefeVorlage } from "@/lib/domain/integration-vorlage";
import type { Json } from "@/lib/database.types";
import { liefereFaelligeAus } from "@/lib/integration/speicher";
import { istUuid } from "@/lib/utils";

// Konfiguration und Auslieferung der Integrations-Warteschlange (WMCNL-1627). Wohin Daten das System verlassen, entscheidet die
// Administration: requirePermission("integrationen", "update") ist die erste Pruefung, dazu gilt nur admin und ceo (die Zeilensicherheit
// von integrationen und integration_outbox, Migration 20261207110000, erlaubt Aenderungen ohnehin nur ueber die Rolle admin).

// Nur die Administration und die Geschaeftsfuehrung (die Rolle steht zusaetzlich zum Recht integrationen:update, das auch das Buero hat).
async function zugriff(): Promise<Zugriff> {
  const z = await mitRecht("integrationen", "update");
  if ("status" in z) return z;
  if (z.profil.role !== "admin" && z.profil.role !== "ceo") return { status: fehler("fehler.berechtigung") };
  return z;
}

const protokoll = (profil: SessionProfile, aktion: string, id: string | null, metadata: Record<string, string | number | boolean | null> = {}) =>
  protokolliere(profil, aktion, "integrationen", id, metadata);

export async function integrationKonfigurieren(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;
  const id = text(formData, "id");
  if (!istUuid(id)) return fehler("fehler.eingabe");

  const e = {
    adapter: text(formData, "adapter"),
    zielUrl: text(formData, "ziel_url"),
    geheimnisName: text(formData, "geheimnis_name"),
    authArt: text(formData, "auth_art") || "hmac",
    zugangName: text(formData, "zugang_name"),
    aktiv: formData.get("aktiv") === "on",
  };
  const abgelehnt = konfigurationFehler(e);
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);
  // Das Mapping auf das Zielformat des Partners: JSON mit Platzhaltern oder leer (der Umschlag geht unveraendert hinaus).
  const vorlage = pruefeVorlage(text(formData, "vorlage"));
  if (!vorlage.ok) return fehler(`fehler.integrationVorlage_${vorlage.fehler}`, vorlage.detail);
  const bestaetigungErwartet = formData.get("bestaetigung_erwartet") === "on";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integrationen")
    .update({
      adapter: e.adapter,
      ziel_url: e.zielUrl === "" ? null : e.zielUrl,
      geheimnis_name: e.geheimnisName === "" ? null : e.geheimnisName,
      auth_art: e.authArt,
      zugang_name: e.zugangName === "" ? null : e.zugangName,
      vorlage: vorlage.vorlage as Json | null,
      bestaetigung_erwartet: bestaetigungErwartet,
      aktiv: e.aktiv,
    })
    .eq("id", id)
    .select("key")
    .maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.berechtigung");

  // Die Adresse steht nicht im Protokoll (sie kann Zugangsteile tragen), nur ob und wohin grob: der Adapter und der Zustand.
  await protokoll(z.profil, "integration.konfiguriert", id, { key: data.key, adapter: e.adapter, aktiv: e.aktiv, auth: e.authArt, vorlage: vorlage.vorlage !== null, bestaetigung: bestaetigungErwartet });
  aktualisiere(formData);
  // Ein aktiver Webhook ohne gesetztes Geheimnis liefert nichts aus: das sagt die Meldung gleich dazu.
  const geheimnisFehlt = e.aktiv && ((e.geheimnisName !== "" && !process.env[e.geheimnisName]) || (e.authArt === "basic" && e.zugangName !== "" && !process.env[e.zugangName]));
  return ok(geheimnisFehlt ? "ok.integrationGespeichertOhneGeheimnis" : "ok.integrationGespeichert", e.geheimnisName);
}

/** Setzt einen gescheiterten Eintrag zurueck auf "wartet": die Versuche beginnen von vorn. */
export async function outboxWiederholen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;
  const id = text(formData, "id");
  if (!istUuid(id)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integration_outbox")
    .update({ status: "pending", versuche: 0, letzter_fehler: null, antwort_status: null, verarbeitet_am: null, naechster_versuch_am: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.integrationNichtGescheitert");
  await protokoll(z.profil, "integration.wiederholt", id);
  aktualisiere(formData);
  return ok("ok.integrationWiederholt");
}

/** Liefert jetzt aus, was faellig ist (derselbe Lauf wie der Cron-Dienst). */
export async function integrationAusliefern(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;
  try {
    const e = await liefereFaelligeAus();
    await protokoll(z.profil, "integration.ausgeliefert", null, { versucht: e.versucht, zugestellt: e.zugestellt, wiederholen: e.wiederholen, gescheitert: e.gescheitert });
    aktualisiere(formData);
    return okMitWerten(e.versucht === 0 ? "ok.auslieferungNichts" : "ok.auslieferung", { versucht: e.versucht, zugestellt: e.zugestellt, wiederholen: e.wiederholen, gescheitert: e.gescheitert });
  } catch (error) {
    console.error("[damicon] Auslieferung fehlgeschlagen:", error instanceof Error ? error.message : error);
    return fehler("fehler.auslieferung");
  }
}
