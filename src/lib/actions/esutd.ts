"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { esutdEreignisFehler, esutdErfassenFehler, esutdVertragFehler } from "@/lib/domain/esutd";
import { tagInZone } from "@/lib/domain/tageszeit";
import { istUuid } from "@/lib/utils";

// Meldeprozess fuer das Einheitssystem ЕСУТД (WMCNL-1447, Stufe 1). requirePermission("personal",
// "update") ist die erste Verteidigungslinie, RLS und Trigger (Migration 20261207080000) die zweite.
// Das Protokoll haelt nur Schluessel fest, keine Namen: wer gemeint ist, steht in der Liste.

async function zugriff(): Promise<{ profil: SessionProfile } | { status: AktionsStatus }> {
  try {
    return { profil: await requirePermission("personal", "update") };
  } catch (error) {
    return { status: zugriffsFehler(error) };
  }
}

function protokoll(profil: SessionProfile, aktion: string, id: string | null, metadata: Record<string, string | number | boolean | null>) {
  return protokolliere(profil, aktion, "esutd", id, metadata);
}

/** Der Abschluss eines Saisonvertrags, offen bis er gemeldet ist. */
export async function esutdVertragAnlegen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;

  const pflueckerId = text(formData, "pfluecker_id");
  const beginn = text(formData, "vertrag_beginn_am");
  const vertragsnummer = text(formData, "vertragsnummer");
  if (!istUuid(pflueckerId)) return fehler("fehler.eingabe");
  const abgelehnt = esutdVertragFehler({ beginn, vertragsnummer });
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("esutd_vertraege")
    .insert({ pfluecker_id: pflueckerId, vertrag_beginn_am: beginn, vertragsnummer: vertragsnummer || null })
    .select("id")
    .single();
  if (error) return dbFehler(error);

  await protokoll(z.profil, "esutd.abschluss_angelegt", data.id, {});
  aktualisiere(formData);
  return ok("ok.esutdVertrag");
}

/** Aenderung oder Beendigung eines bestehenden Vertrags. */
export async function esutdEreignisAnlegen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;

  const vertragId = text(formData, "vertrag_id");
  const art = text(formData, "art");
  const ereignisAm = text(formData, "ereignis_am");
  const beschreibung = text(formData, "beschreibung");
  if (!istUuid(vertragId) || (art !== "aenderung" && art !== "beendigung")) return fehler("fehler.eingabe");
  const abgelehnt = esutdEreignisFehler({ art, ereignisAm, beschreibung });
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("esutd_ereignisse")
    .insert({ vertrag_id: vertragId, art, ereignis_am: ereignisAm, beschreibung: beschreibung || null })
    .select("id")
    .single();
  if (error) return dbFehler(error);

  await protokoll(z.profil, `esutd.${art}_angelegt`, data.id, { vertrag: vertragId });
  aktualisiere(formData);
  return ok("ok.esutdEreignis");
}

type Quelle = "vertrag" | "ereignis";
const istQuelle = (wert: string): wert is Quelle => wert === "vertrag" || wert === "ereignis";

/** Haelt fest, dass die Meldung im staatlichen System erfolgt ist, mit Datum, optional Bestaetigungsnummer und Beleg. */
export async function esutdMeldungErfassen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;

  const quelle = text(formData, "quelle");
  const id = text(formData, "id");
  const erfasstAm = text(formData, "erfasst_am");
  const bestaetigung = text(formData, "bestaetigung");
  const beleg = text(formData, "beleg_dokument_id");
  if (!istQuelle(quelle) || !istUuid(id) || (beleg !== "" && !istUuid(beleg))) return fehler("fehler.eingabe");
  const abgelehnt = esutdErfassenFehler({ erfasstAm, bestaetigung }, tagInZone(new Date()));
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const felder = { status: "erfasst" as const, erfasst_am: erfasstAm, bestaetigung: bestaetigung || null, beleg_dokument_id: beleg || null };
  const supabase = await createClient();
  const { data, error } =
    quelle === "vertrag"
      ? await supabase.from("esutd_vertraege").update(felder).eq("id", id).eq("status", "offen").select("id").maybeSingle()
      : await supabase.from("esutd_ereignisse").update(felder).eq("id", id).eq("status", "offen").select("id").maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.esutdMeldungFehlt");

  await protokoll(z.profil, "esutd.erfasst", id, { quelle, mitBeleg: beleg !== "" });
  aktualisiere(formData);
  return ok("ok.esutdErfasst");
}

/** Nimmt eine Erledigung zurueck (Korrektur): die Datenbank leert Datum, Bestaetigung und Beleg. */
export async function esutdMeldungOeffnen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;

  const quelle = text(formData, "quelle");
  const id = text(formData, "id");
  if (!istQuelle(quelle) || !istUuid(id)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } =
    quelle === "vertrag"
      ? await supabase.from("esutd_vertraege").update({ status: "offen" }).eq("id", id).eq("status", "erfasst").select("id").maybeSingle()
      : await supabase.from("esutd_ereignisse").update({ status: "offen" }).eq("id", id).eq("status", "erfasst").select("id").maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.esutdMeldungFehlt");

  await protokoll(z.profil, "esutd.geoeffnet", id, { quelle });
  aktualisiere(formData);
  return ok("ok.esutdGeoeffnet");
}

/** Entfernt eine Meldung, die noch offen ist (zum Beispiel falsch angelegt). Eine erledigte bleibt. */
export async function esutdMeldungEntfernen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff();
  if ("status" in z) return z.status;

  const quelle = text(formData, "quelle");
  const id = text(formData, "id");
  if (!istQuelle(quelle) || !istUuid(id)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } =
    quelle === "vertrag"
      ? await supabase.from("esutd_vertraege").delete().eq("id", id).eq("status", "offen").select("id").maybeSingle()
      : await supabase.from("esutd_ereignisse").delete().eq("id", id).eq("status", "offen").select("id").maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.esutdMeldungFehlt");

  await protokoll(z.profil, "esutd.entfernt", id, { quelle });
  aktualisiere(formData);
  return ok("ok.esutdEntfernt");
}
