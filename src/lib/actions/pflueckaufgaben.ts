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
import type { KernErgebnis } from "@/lib/actions/nachweiskette";
import type { Json } from "@/lib/database.types";
import { aufgabenStatus, type AufgabenStatus } from "@/lib/domain/pflueckaufgaben";

// Vorstufe zu Anforderung 2.5 (Offline-first): aufgabeStatusSetzen() und
// mengeMelden() aktualisierten bisher blind per .eq("id", id), ohne den
// Ist-Zustand zu pruefen - ein verzoegert synchronisierter, veralteter
// Schreibvorgang haette den Status stillschweigend zuruecksetzen koennen
// (mengeMelden erzwang "beleg_pruefung" sogar unabhaengig vom Ist-Zustand,
// auch auf einer bereits abgeschlossenen Aufgabe). Die Kette ist strikt
// linear (siehe aufgabenStatus), der erwartete Vorzustand steht deshalb hier
// fest und wird NICHT vom Aufrufer uebernommen - sonst liesse sich die
// Pruefung durch eine manipulierte Anfrage selbst aushebeln.
const erwarteterVorzustand: Partial<Record<AufgabenStatus, AufgabenStatus>> = {
  angenommen: "offen",
  in_arbeit: "angenommen",
  abgeschlossen: "beleg_pruefung",
};

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

// ---------------------------------------------------------------------------
// Kernfunktionen (Anforderung 2.5, Phase 4): "Aufgabe annehmen" (offen ->
// angenommen) und "Arbeit starten" (angenommen -> in_arbeit) sind die beiden
// im Feld offline ausgeloesten Statusuebergaenge - anders als bei den reinen
// INSERTs aus Phase 2/3 macht hier eine client-generierte Zeilen-id den
// Schreibvorgang nicht von selbst idempotent (die Zielzeile existiert schon).
// Die eigentliche Idempotenz- und Konfliktlogik steckt deshalb in den
// SECURITY-INVOKER-RPCs sync_aufgabe_status_setzen()/sync_menge_melden()
// (Migration 20260914000000) - RLS greift dabei exakt wie bei einem
// direkten Update, keine Rechteausweitung. Diese Kernfunktionen sind der
// duenne, gemeinsame TS-Wrapper, den sowohl der Online-Teil von
// aufgabeStatusSetzen() als auch der Sync-Endpunkt aufrufen.
//
// "abgeschlossen" (Buero/Leitung, eigene "approve"-Berechtigung, schreibt
// den Qualitaetsfaktor) bleibt bewusst aussen vor - kein Feld-Workflow, dafuer
// braucht es keine Offline-Idempotenz.
// ---------------------------------------------------------------------------

export interface AufgabeStatusParams {
  aufgabeId: string;
  neuerStatus: "angenommen" | "in_arbeit";
  arbeitsbeginnGeraetZeitpunkt: string | null;
  /** Nur beim Sync-Aufruf gesetzt - macht den Aufruf idempotent (siehe
   * sync_protokoll: ein Retry nach einer nie angekommenen Antwort wird als
   * "das war schon ich" erkannt, kein echter Konflikt). */
  aktionId?: string;
}

export async function aufgabeStatusKern(
  params: AufgabeStatusParams,
): Promise<KernErgebnis<{ code: string }>> {
  try {
    await requirePermission("pflueckaufgaben", "update");
  } catch (error) {
    return { erledigt: false, status: zugriffsFehler(error) };
  }

  const { aufgabeId, neuerStatus, arbeitsbeginnGeraetZeitpunkt, aktionId } = params;
  const vorzustand = erwarteterVorzustand[neuerStatus];
  if (!aufgabeId || !vorzustand) return { erledigt: false, status: fehler("fehler.eingabe") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("sync_aufgabe_status_setzen", {
      p_aktion_id: aktionId ?? crypto.randomUUID(),
      p_aufgabe_id: aufgabeId,
      p_neuer_status: neuerStatus,
      p_vorzustand: vorzustand,
      p_arbeitsbeginn_geraet_zeitpunkt: arbeitsbeginnGeraetZeitpunkt ?? undefined,
    })
    .single();

  if (error) return { erledigt: false, status: dbFehler(error) };
  if (data.ergebnis === "konflikt" || !data.code) {
    // Jemand/etwas anderes hat den Status zwischenzeitlich veraendert (z. B.
    // ein zweites Geraet, oder die Aufgabe wurde storniert) - kein
    // technischer Fehler, sondern ein echter Konflikt.
    return { erledigt: false, status: fehler("fehler.zustand") };
  }

  return { erledigt: true, status: ok("ok.aufgabeStatus", data.code), daten: { code: data.code } };
}

export interface MengeMeldenParams {
  aufgabeId: string;
  istMengeKg: number | null;
  ausschussKg: number | null;
  pflueckerAnzahl: number | null;
  aktionId?: string;
}

export async function mengeMeldenKern(
  params: MengeMeldenParams,
): Promise<KernErgebnis<{ code: string }>> {
  try {
    await requirePermission("pflueckaufgaben", "update");
  } catch (error) {
    return { erledigt: false, status: zugriffsFehler(error) };
  }

  const { aufgabeId, istMengeKg, ausschussKg, pflueckerAnzahl, aktionId } = params;
  if (!aufgabeId || istMengeKg === null || istMengeKg < 0 || (ausschussKg ?? 0) < 0) {
    return { erledigt: false, status: fehler("fehler.eingabe") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("sync_menge_melden", {
      p_aktion_id: aktionId ?? crypto.randomUUID(),
      p_aufgabe_id: aufgabeId,
      p_ist_menge_kg: istMengeKg,
      p_ausschuss_kg: ausschussKg ?? 0,
      p_pfluecker_anzahl: pflueckerAnzahl ?? undefined,
    })
    .single();

  if (error) return { erledigt: false, status: dbFehler(error) };
  if (data.ergebnis === "konflikt" || !data.code) {
    return { erledigt: false, status: fehler("fehler.zustand") };
  }

  return { erledigt: true, status: ok("ok.menge", data.code), daten: { code: data.code } };
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

export async function aufgabeStatusSetzen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  const neuerStatus = text(formData, "status");
  const id = text(formData, "id");
  if (!id || !(aufgabenStatus as readonly string[]).includes(neuerStatus)) {
    return fehler("fehler.eingabe");
  }

  // Abschluss ist ein Buero/Leitung-Vorgang (eigene "approve"-Berechtigung,
  // schreibt zusaetzlich den Qualitaetsfaktor) - kein Feld-Workflow, bleibt
  // deshalb ausserhalb der Kernfunktion/RPC, die nur die beiden
  // offline-relevanten Uebergaenge kennt.
  if (neuerStatus === "abgeschlossen") {
    let profil: SessionProfile;
    try {
      profil = await requirePermission("pflueckaufgaben", "approve");
    } catch (error) {
      return zugriffsFehler(error);
    }

    const supabase = await createClient();
    const qualitaet = zahl(formData, "qualitaetsfaktor");
    const { data, error } = await supabase
      .from("pflueckaufgaben")
      .update({
        status: "abgeschlossen",
        ...(qualitaet !== null ? { qualitaetsfaktor: qualitaet } : {}),
      })
      .eq("id", id)
      .eq("status", "beleg_pruefung")
      .select("id, code")
      .maybeSingle();

    if (error) return dbFehler(error);
    if (!data) return fehler("fehler.zustand");

    await protokolliere(profil, "aufgabe.status", data.id, { code: data.code, status: neuerStatus });
    aktualisiere(formData);
    return ok("ok.aufgabeStatus", data.code);
  }

  if (neuerStatus !== "angenommen" && neuerStatus !== "in_arbeit") {
    return fehler("fehler.eingabe");
  }

  // Anforderung 2.6: beim Start der Arbeit liefert das Formular die lokale
  // Geraetezeit mit (gesetzt im Moment des Tippens) - nicht die Serverzeit
  // beim Eintreffen der Anfrage. Der Trigger aufgabe_fortschreiben() startet
  // die Kuehlkettenuhr damit am tatsaechlichen Arbeitsbeginn, auch wenn die
  // Synchronisierung sich verzoegert hat.
  const { status } = await aufgabeStatusKern({
    aufgabeId: id,
    neuerStatus,
    arbeitsbeginnGeraetZeitpunkt: text(formData, "arbeitsbeginn_geraet_zeitpunkt") || null,
  });
  aktualisiere(formData);
  return status;
}

export async function mengeMelden(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  const { status } = await mengeMeldenKern({
    aufgabeId: text(formData, "id"),
    istMengeKg: zahl(formData, "ist_menge_kg"),
    ausschussKg: zahl(formData, "ausschuss_kg"),
    pflueckerAnzahl: zahl(formData, "pfluecker_anzahl"),
  });
  aktualisiere(formData);
  return status;
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

  // Anforderung 2.6 (Vorstufe 2.5): geraet_zeitpunkt kommt vom Client (Moment
  // der Aufnahme), der Trigger beleg_zeitpunkt_stempeln() (Migration
  // 20260913000000) setzt aufgenommen_am daraus, wenn plausibel.
  const geraetZeitpunkt = text(formData, "geraet_zeitpunkt") || null;

  const { data, error } = await supabase
    .from("media_belege")
    .insert({
      pflueckaufgabe_id: aufgabeId,
      art: art as (typeof belegArten)[number],
      hinweis: text(formData, "hinweis") || null,
      storage_path: pfad,
      geraet_zeitpunkt: geraetZeitpunkt,
      // aufgenommen_am hat seit dieser Migration keinen Spalten-Default mehr
      // (siehe Kommentar dort) - der Trigger berechnet ihn. Der generierte
      // Insert-Typ kennt trigger-gesetzte Spalten nicht und haelt sie
      // faelschlich fuer erforderlich; eingefuegt wird nie tatsaechlich NULL.
      aufgenommen_am: null as unknown as string,
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
