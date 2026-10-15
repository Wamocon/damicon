"use server";

import { createClient } from "@/lib/supabase/server";
import type { SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, type AktionsStatus } from "@/lib/actions/status";
import { mitRecht } from "@/lib/actions/zugriff";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { ladeEntwurfEingabe } from "@/lib/data/esf";
import { baueEsfEntwurf, esfAngabenFehler, istEsfStatus, wechselErlaubt, type EsfStatus } from "@/lib/domain/esf";
import { tagInZone } from "@/lib/domain/tageszeit";
import type { Json } from "@/lib/database.types";
import { istUuid } from "@/lib/utils";

// Belegregister der elektronischen Rechnung (WMCNL-1440, Stufe 1). requirePermission("integrationen",
// "update") ist die erste Verteidigungslinie, RLS und Trigger von esf_belege (Migration 20261207070000)
// die zweite: dort stehen die Statuswechsel und die Pflichtangaben ein zweites Mal.

function zugriff() {
  return mitRecht("integrationen", "update");
}

function protokoll(profil: SessionProfile, aktion: string, belegId: string | null, metadata: Record<string, string | number | boolean | null>) {
  return protokolliere(profil, aktion, "integrationen", belegId, metadata);
}

/**
 * Legt den Entwurf einer zugestellten Lieferung an oder rechnet ihn neu. Aus einem abgelehnten Beleg
 * beginnt dieselbe Zeile wieder bei "entwurf". Alles andere (ausgestellt, bestaetigt, Papier) bleibt unberuehrt.
 */
export async function esfEntwurfErstellen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;

  const lieferungId = text(formData, "lieferung_id");
  if (!istUuid(lieferungId)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const eingabe = await ladeEntwurfEingabe(supabase, lieferungId);
  if (!eingabe.ok) {
    if (eingabe.grund === "datenbank") return dbFehler(eingabe.fehler);
    return fehler(eingabe.grund === "nichtZugestellt" ? "fehler.esfLieferungOffen" : "fehler.esfBelegFehlt");
  }
  const entwurf = baueEsfEntwurf(eingabe.eingabe) as unknown as Json;

  const { data: vorhanden, error: leseFehler } = await supabase.from("esf_belege").select("id, status").eq("lieferung_id", lieferungId).maybeSingle();
  if (leseFehler) return dbFehler(leseFehler);

  if (!vorhanden) {
    const { data, error } = await supabase.from("esf_belege").insert({ lieferung_id: lieferungId, entwurf }).select("id").single();
    if (error) return dbFehler(error);
    await protokoll(z.profil, "esf.entwurf_erstellt", data.id, { lieferung: lieferungId });
    aktualisiere(formData);
    return ok("ok.esfEntwurf");
  }

  if (vorhanden.status !== "entwurf" && vorhanden.status !== "abgelehnt") return fehler("fehler.esfSchonAusgestellt");

  const neuBegonnen = vorhanden.status === "abgelehnt";
  const { data, error } = await supabase
    .from("esf_belege")
    .update(neuBegonnen ? { status: "entwurf", entwurf, esf_nummer: null, ausgestellt_am: null, bestaetigt_am: null, bemerkung: null } : { entwurf })
    .eq("id", vorhanden.id)
    .eq("status", vorhanden.status)
    .select("id")
    .maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.esfStatuswechsel");

  await protokoll(z.profil, neuBegonnen ? "esf.neu_begonnen" : "esf.entwurf_neu_berechnet", data.id, { lieferung: lieferungId });
  aktualisiere(formData);
  return ok(neuBegonnen ? "ok.esfNeuBegonnen" : "ok.esfEntwurf");
}

const OK_SCHLUESSEL: Record<Exclude<EsfStatus, "entwurf">, string> = {
  ausgestellt: "ok.esfAusgestellt",
  bestaetigt: "ok.esfBestaetigt",
  abgelehnt: "ok.esfAbgelehnt",
  papier: "ok.esfPapier",
};

/** Haelt den naechsten Schritt eines Belegs fest: ausgestellt, bestaetigt, abgelehnt oder auf Papier gefuehrt. */
export async function esfStatusSetzen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;

  const belegId = text(formData, "beleg_id");
  const nach = text(formData, "nach");
  if (!istUuid(belegId) || !istEsfStatus(nach) || nach === "entwurf") return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data: beleg, error: leseFehler } = await supabase.from("esf_belege").select("id, status, ausgestellt_am").eq("id", belegId).maybeSingle();
  if (leseFehler) return dbFehler(leseFehler);
  if (!beleg || !istEsfStatus(beleg.status)) return fehler("fehler.esfBelegFehlt");
  const von = beleg.status;
  if (!wechselErlaubt(von, nach)) return fehler("fehler.esfStatuswechsel");

  const angaben = {
    nummer: text(formData, "esf_nummer"),
    ausgestelltAm: text(formData, "ausgestellt_am"),
    bestaetigtAm: text(formData, "bestaetigt_am"),
    bemerkung: text(formData, "bemerkung"),
    bisherAusgestelltAm: beleg.ausgestellt_am,
  };
  const abgelehnt = esfAngabenFehler(nach, angaben, tagInZone(new Date()));
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const aenderung =
    nach === "ausgestellt"
      ? { status: nach, esf_nummer: angaben.nummer, ausgestellt_am: angaben.ausgestelltAm, bemerkung: null }
      : nach === "bestaetigt"
        ? { status: nach, bestaetigt_am: angaben.bestaetigtAm }
        : nach === "abgelehnt"
          ? { status: nach, bemerkung: angaben.bemerkung }
          : { status: nach, bemerkung: angaben.bemerkung, esf_nummer: null, ausgestellt_am: null };

  const { data, error } = await supabase.from("esf_belege").update(aenderung).eq("id", belegId).eq("status", von).select("id").maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.esfStatuswechsel");

  await protokoll(z.profil, `esf.${nach}`, belegId, { von, nach, nummer: nach === "ausgestellt" ? angaben.nummer : null });
  aktualisiere(formData);
  return ok(OK_SCHLUESSEL[nach]);
}

/** Verwirft einen Entwurf. Ein Beleg ab "ausgestellt" laesst sich nicht loeschen (Zeilensicherheit der Datenbank). */
export async function esfEntwurfVerwerfen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;

  const belegId = text(formData, "beleg_id");
  if (!istUuid(belegId)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase.from("esf_belege").delete().eq("id", belegId).eq("status", "entwurf").select("id, lieferung_id").maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.esfBelegFehlt");

  await protokoll(z.profil, "esf.entwurf_verworfen", belegId, { lieferung: data.lieferung_id });
  aktualisiere(formData);
  return ok("ok.esfEntwurfVerworfen");
}
