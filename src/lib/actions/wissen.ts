"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { aktualisiere, protokolliere, text } from "@/lib/actions/formular-helfer";
import { wissenEinbettung } from "@/lib/wissen/embed";
import { MAX_DATEI_BYTES, supabaseSpeicher, UploadFehler, verarbeiteUpload } from "@/lib/wissen/hochladen";
import { gruppiereWissenDokumente, type WissenDokumentZeile, type WissenListeZeile } from "@/lib/wissen/dokumente-liste";

// Admin-Upload in die Wissensbasis (Recht, Steuer, Compliance, Audit, Risiko). Dieselbe Berechtigung wie die
// Anbieter- und Ratenlimit-Verwaltung: requirePermission("ki_assistent", "manage") - laut rbac.ts nur admin.
//
// Alles geschieht hier auf dem Server. Der Upload schreibt AUSDRUECKLICH nach Supabase (service_role), egal was
// wissenBackend() fuer die Suche waehlt: wissen_chunks ist der Ort, an dem Dokumente landen. Der Schluessel der
// Einbettung (WISSEN_EMBED_KEY / KI_SOKRATES_API_SCHLUESSEL) bleibt in der Serverumgebung.
//
// Die Einbettung laeuft synchron in dieser Action (ein Aufruf je acht Abschnitte). Das Zeitbudget stellt
// dashboard/layout.tsx (maxDuration = 60); MAX_CHUNKS in lib/wissen/hochladen.ts begrenzt die Laenge so, dass
// ein Dokument in diesen Rahmen passt.

const FEHLER_SCHLUESSEL: Record<UploadFehler["code"], string> = {
  eingabe: "fehler.eingabe",
  dateityp: "fehler.wissenDateityp",
  zuGross: "fehler.zuGross",
  lesen: "fehler.wissenLesen",
  leer: "fehler.wissenLeer",
  zuLang: "fehler.wissenZuLang",
  doppelt: "fehler.wissenDoppelt",
  einbettung: "fehler.wissenEinbettung",
  speichern: "fehler.wissenSpeichern",
};

export async function wissenDokumentHochladen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const datei = formData.get("datei");
  if (!(datei instanceof File) || datei.size === 0) return fehler("fehler.eingabe");
  // Die Groesse steht vor dem Einlesen der Datei in den Speicher fest.
  if (datei.size > MAX_DATEI_BYTES) return fehler("fehler.zuGross");

  try {
    const ergebnis = await verarbeiteUpload(
      {
        titel: text(formData, "titel"),
        bereich: text(formData, "bereich"),
        rollen: formData.getAll("rollen").map(String),
        dateiname: datei.name,
        bytes: new Uint8Array(await datei.arrayBuffer()),
        hochgeladenVon: { id: profil.id, name: profil.fullName ?? null },
      },
      {
        speicher: supabaseSpeicher(createServiceRoleClient() as unknown as SupabaseClient),
        einbettung: wissenEinbettung(),
      },
    );
    await protokolliere(profil, "wissen.hochgeladen", "wissen_chunks", null, {
      titel: text(formData, "titel"),
      bereich: text(formData, "bereich"),
      quelle_id: ergebnis.quelleId,
      abschnitte: ergebnis.chunks,
    });
    aktualisiere(formData);
    return ok("ok.wissenHochgeladen", text(formData, "titel"));
  } catch (error) {
    if (error instanceof UploadFehler) {
      console.error("[damicon]", error.message);
      return fehler(FEHLER_SCHLUESSEL[error.code], error.wert);
    }
    console.error("[damicon] Wissens-Upload unerwartet fehlgeschlagen:", error);
    return fehler("fehler.unbekannt");
  }
}

export interface WissenDokumenteAntwort {
  dokumente: WissenDokumentZeile[];
  fehler: boolean;
}

const SEITE = 1000;
const MAX_SEITEN = 50; // 50.000 Textstellen; der Korpus hat rund 5.700

/** Liste aller Wissensdokumente (hochgeladen und per Skript eingelesen). Laeuft mit der Sitzung des Admins,
 *  die RLS von wissen_chunks gilt also auch hier. Gelesen werden nur leichte Spalten, nie Text oder Vektoren. */
export async function wissenDokumenteLaden(): Promise<WissenDokumenteAntwort> {
  try {
    await requirePermission("ki_assistent", "manage");
  } catch {
    return { dokumente: [], fehler: true };
  }
  try {
    const db = await createClient();
    const zeilen: WissenListeZeile[] = [];
    for (let seite = 0; seite < MAX_SEITEN; seite++) {
      const { data, error } = await db
        .from("wissen_chunks")
        .select("id, quelle_id, pfad, titel, bereich, rollen, eingelesen_am, upload_quelle:extra->>quelle, hochgeladen_von:extra->>hochgeladen_von_name")
        .order("id")
        .range(seite * SEITE, seite * SEITE + SEITE - 1);
      if (error) throw new Error(error.message);
      zeilen.push(...((data ?? []) as unknown as WissenListeZeile[]));
      if (!data || data.length < SEITE) break;
    }
    return { dokumente: gruppiereWissenDokumente(zeilen), fehler: false };
  } catch (error) {
    console.error("[damicon] Wissensdokumente laden fehlgeschlagen:", error);
    return { dokumente: [], fehler: true };
  }
}
