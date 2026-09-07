"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import {
  dbFehler,
  fehler,
  ok,
  zugriffsFehler,
  type AktionsStatus,
} from "@/lib/actions/status";
import type { Json } from "@/lib/database.types";
import { aufgabenStatus } from "@/lib/domain/pflueckaufgaben";

// Pflueckaufgaben mit Fotobeleg (Meilenstein B). Der Beleg landet im privaten
// Storage-Bucket "belege"; in der Tabelle steht nur der Pfad.

const belegArten = ["schale", "reihenblock", "steige"] as const;
const maxDateigroesse = 8 * 1024 * 1024;

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

function zahl(formData: FormData, feld: string): number | null {
  const roh = text(formData, feld).replace(",", ".");
  if (!roh) return null;
  const wert = Number(roh);
  return Number.isFinite(wert) ? wert : null;
}

function aktualisiere(formData: FormData) {
  const pfad = text(formData, "pfad");
  if (pfad.startsWith("/")) revalidatePath(pfad);
}

async function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  const supabase = await createClient();
  await supabase.from("audit_events").insert({
    actor: `${profil.fullName} (${profil.role})`,
    aktion,
    ressource: "pflueckaufgaben",
    ressource_id: ressourceId,
    metadata,
  });
}

export async function aufgabeAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("pflueckaufgaben", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const blockId = text(formData, "reihenblock_id");
  const zielmenge = zahl(formData, "zielmenge_kg");
  if (!blockId || zielmenge === null) return fehler("fehler.eingabe");

  const supabase = await createClient();

  // Sorte des Blocks uebernehmen, damit die Aufgabe ohne Zusatzeingabe passt.
  const { data: block, error: blockFehler } = await supabase
    .from("reihenbloecke")
    .select("id, code, sorte_id, status")
    .eq("id", blockId)
    .maybeSingle();

  if (blockFehler) return dbFehler(blockFehler);
  if (!block) return fehler("fehler.eingabe");
  if (block.status === "wartezeitgesperrt") return fehler("fehler.gesperrt", block.code);

  const heute = new Date();
  const stempel = `${heute.getFullYear()}${String(heute.getMonth() + 1).padStart(2, "0")}${String(
    heute.getDate(),
  ).padStart(2, "0")}`;
  const code = `PA-${stempel}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const faelligkeit = text(formData, "faelligkeit");

  const { data, error } = await supabase
    .from("pflueckaufgaben")
    .insert({
      code,
      reihenblock_id: block.id,
      sorte_id: block.sorte_id,
      brigade_id: text(formData, "brigade_id") || null,
      zielmenge_kg: zielmenge,
      pfluecker_anzahl: zahl(formData, "pfluecker_anzahl") ?? 0,
      faelligkeit: faelligkeit ? new Date(faelligkeit).toISOString() : null,
      status: "offen",
    })
    .select("id, code")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "aufgabe.angelegt", data.id, {
    code: data.code,
    block: block.code,
  });
  aktualisiere(formData);
  return ok("ok.aufgabe", data.code);
}

export async function aufgabeStatusSetzen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  const neuerStatus = text(formData, "status");
  const abschluss = neuerStatus === "abgeschlossen";

  let profil: SessionProfile;
  try {
    profil = await requirePermission(
      "pflueckaufgaben",
      abschluss ? "approve" : "update",
    );
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id || !(aufgabenStatus as readonly string[]).includes(neuerStatus)) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const qualitaet = zahl(formData, "qualitaetsfaktor");

  const { data, error } = await supabase
    .from("pflueckaufgaben")
    .update({
      status: neuerStatus as (typeof aufgabenStatus)[number],
      ...(abschluss && qualitaet !== null ? { qualitaetsfaktor: qualitaet } : {}),
    })
    .eq("id", id)
    .select("id, code")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.berechtigung");

  await protokolliere(profil, "aufgabe.status", data.id, {
    code: data.code,
    status: neuerStatus,
  });
  aktualisiere(formData);
  return ok("ok.aufgabeStatus", data.code);
}

export async function mengeMelden(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("pflueckaufgaben", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const menge = zahl(formData, "ist_menge_kg");
  const ausschuss = zahl(formData, "ausschuss_kg") ?? 0;
  if (!id || menge === null || menge < 0 || ausschuss < 0) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pflueckaufgaben")
    .update({
      ist_menge_kg: menge,
      ausschuss_kg: ausschuss,
      ...(zahl(formData, "pfluecker_anzahl") !== null
        ? { pfluecker_anzahl: zahl(formData, "pfluecker_anzahl")! }
        : {}),
      status: "beleg_pruefung",
    })
    .eq("id", id)
    .select("id, code")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.berechtigung");

  await protokolliere(profil, "aufgabe.menge", data.id, {
    code: data.code,
    ist_menge_kg: menge,
    ausschuss_kg: ausschuss,
  });
  aktualisiere(formData);
  return ok("ok.menge", data.code);
}

export async function belegHochladen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("pflueckaufgaben", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const aufgabeId = text(formData, "aufgabe_id");
  const art = text(formData, "art");
  const datei = formData.get("datei");

  if (!aufgabeId || !(belegArten as readonly string[]).includes(art)) {
    return fehler("fehler.eingabe");
  }
  if (!(datei instanceof File) || datei.size === 0) return fehler("fehler.keineDatei");
  if (datei.size > maxDateigroesse) return fehler("fehler.zuGross");

  const supabase = await createClient();

  const endung = datei.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const pfad = `${aufgabeId}/${Date.now()}-${art}.${endung}`;

  const { error: uploadFehler } = await supabase.storage
    .from("belege")
    .upload(pfad, datei, { contentType: datei.type, upsert: false });

  if (uploadFehler) {
    console.error("[damicon] Upload fehlgeschlagen:", uploadFehler.message);
    return fehler("fehler.upload");
  }

  const { data, error } = await supabase
    .from("media_belege")
    .insert({
      pflueckaufgabe_id: aufgabeId,
      art: art as (typeof belegArten)[number],
      hinweis: text(formData, "hinweis") || null,
      storage_path: pfad,
    })
    .select("id")
    .single();

  if (error) {
    // Verwaiste Datei wieder entfernen, damit Bucket und Tabelle im Takt bleiben.
    await supabase.storage.from("belege").remove([pfad]);
    return dbFehler(error);
  }

  await protokolliere(profil, "beleg.hochgeladen", aufgabeId, {
    beleg_id: data.id,
    art,
  });
  aktualisiere(formData);
  return ok("ok.beleg");
}
