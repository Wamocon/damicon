"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { protokolliere } from "@/lib/actions/formular-helfer";
import { bereiteOriginalVor, bestaetigeOriginal, entferneOriginal, originalAdresse, OriginalFehler, pruefeOriginalPlatz, type OriginalFehlerCode, type PlatzPruefung } from "@/lib/wissen/original";

// Original-PDF eines wartenden Buchs (Administration, Seite Wissensbasis): ablegen beim Hochladen oder nachträglich, öffnen beim Prüfen.
// Dieselbe Berechtigung wie die übrige Verwaltung (ki_assistent:manage, laut rbac.ts nur admin). Die Datei geht vom Browser direkt in den Speicher
// (wiederaufnehmbarer Upload mit der Sitzung, keine Datei durch die Server Action); hier laufen nur die Rechte, die Prüfung, die Obergrenze und der
// Verweis. Die Datei bleibt bis zur Freigabe (siehe src/lib/wissen/original.ts).

type Antwort<T> = ({ ok: true } & T) | { ok: false; code: OriginalFehlerCode | "zugriff" | "unbekannt" };

async function adminProfil(): Promise<SessionProfile | null> {
  try {
    return await requirePermission("ki_assistent", "manage");
  } catch {
    return null;
  }
}

const dienst = () => createServiceRoleClient() as unknown as SupabaseClient;

function alsFehler(error: unknown, was: string): { ok: false; code: OriginalFehlerCode | "unbekannt" } {
  if (error instanceof OriginalFehler) return { ok: false, code: error.code };
  console.error(`[damicon] Original (${was}) fehlgeschlagen:`, error);
  return { ok: false, code: "unbekannt" };
}

/** Vor dem Start eines Uploads: Passen die neuen PDFs (zusammen `neuBytes`) zu den wartenden Originalen unter die Obergrenze? */
export async function wissenOriginalPlatz(neuBytes: number): Promise<Antwort<PlatzPruefung>> {
  if (!(await adminProfil())) return { ok: false, code: "zugriff" };
  if (typeof neuBytes !== "number" || !Number.isFinite(neuBytes) || neuBytes < 0) return { ok: false, code: "ungueltig" };
  try {
    return { ok: true, ...(await pruefeOriginalPlatz(dienst(), neuBytes)) };
  } catch (error) {
    return alsFehler(error, "platz");
  }
}

/** Schritt 1: den Upload vorbereiten (Rechte, Dokument, Größe, Platz). `quelleId` ist die Kennung des wartenden Dokuments (upload:…). */
export async function wissenOriginalVorbereiten(quelleId: string, dateiname: string, groesse: number): Promise<Antwort<{ pfad: string; bucket: string }>> {
  if (!(await adminProfil())) return { ok: false, code: "zugriff" };
  if (typeof quelleId !== "string" || typeof dateiname !== "string" || typeof groesse !== "number") return { ok: false, code: "ungueltig" };
  try {
    return { ok: true, ...(await bereiteOriginalVor(dienst(), quelleId, dateiname, groesse)) };
  } catch (error) {
    return alsFehler(error, "vorbereiten");
  }
}

/** Schritt 2: nach dem Hochladen den Verweis ablegen. */
export async function wissenOriginalBestaetigen(quelleId: string, dateiname: string): Promise<Antwort<{ groesse: number }>> {
  const profil = await adminProfil();
  if (!profil) return { ok: false, code: "zugriff" };
  if (typeof quelleId !== "string" || typeof dateiname !== "string") return { ok: false, code: "ungueltig" };
  try {
    const erg = await bestaetigeOriginal(dienst(), quelleId, dateiname, profil.id);
    await protokolliere(profil, "wissen.original_abgelegt", "wissen_chunks", null, { quelle_id: quelleId, groesse: erg.groesse });
    return { ok: true, ...erg };
  } catch (error) {
    return alsFehler(error, "bestaetigen");
  }
}

/** Eine kurzlebige Adresse zum Öffnen des Originals (zehn Minuten). */
export async function wissenOriginalOeffnen(quelleId: string): Promise<Antwort<{ url: string; dateiname: string; groesse: number }>> {
  const profil = await adminProfil();
  if (!profil) return { ok: false, code: "zugriff" };
  if (typeof quelleId !== "string") return { ok: false, code: "ungueltig" };
  try {
    const erg = await originalAdresse(dienst(), quelleId);
    await protokolliere(profil, "wissen.original_geoeffnet", "wissen_chunks", null, { quelle_id: quelleId });
    return { ok: true, ...erg };
  } catch (error) {
    return alsFehler(error, "oeffnen");
  }
}

/** Das Original eines wartenden Dokuments verwerfen, ohne das Dokument zu berühren. */
export async function wissenOriginalVerwerfen(quelleId: string): Promise<{ ok: boolean }> {
  if (!(await adminProfil())) return { ok: false };
  if (typeof quelleId !== "string") return { ok: false };
  await entferneOriginal(dienst(), quelleId);
  return { ok: true };
}
