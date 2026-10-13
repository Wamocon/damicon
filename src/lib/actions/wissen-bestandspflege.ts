"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { protokolliere } from "@/lib/actions/formular-helfer";
import { wissenDokumenteLaden } from "@/lib/actions/wissen";
import type { DokumentNaehe } from "@/lib/wissen/bestandspflege";
import { entferneDokument, istQuelleId, MAX_GRUND, PflegeFehler, type PflegeFehlerCode } from "@/lib/wissen/bestandspflege-entfernen";
import { bestandsSpeicher, ladeNaehe } from "@/lib/wissen/speicher-bestandspflege";
import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";

// Bestandspflege (Administration, Seite Wissensbasis): Analysen und Entfernen nach der Prüfung. Dieselbe Berechtigung wie die übrige
// Verwaltung der Wissensbasis (requirePermission("ki_assistent", "manage"), laut rbac.ts nur admin). Alles auf dem Dienst-Client, nach der Rechteprüfung.
//
// Die Analyse ist in kleine Aufrufe geteilt (je höchstens NAEHE_JE_AUFRUF Dokumente), die die Oberfläche nacheinander stellt und dabei einen Fortschritt zeigt:
// Der Vektorvergleich je Dokument braucht Zeit, und eine Server Action hat auf Vercel höchstens 60 Sekunden (dashboard/layout.tsx, maxDuration).
// Die Analyse verändert nichts. Entfernt wird nur in wissenBestandEntfernen, mit ausdrücklicher Bestätigung und mit Protokolleintrag je Dokument.

const NAEHE_JE_AUFRUF = 5;
const PROBEN = 6;
const MAX_ENTFERNEN = 50;
const VERGLEICH_ZEICHEN = 1200;

export interface PflegeStart {
  dokumente: WissenDokumentZeile[];
  /** Heutiges Datum (JJJJ-MM-TT) auf dem Server: für Wiedervorlage und Jahr im Titel. */
  heute: string;
  /** Die Kennungen, deren inhaltliche Nähe die Oberfläche in Schritten abfragt (alle Dokumente mit quelle_id). */
  fuerNaehe: string[];
  fehler: boolean;
}

async function adminProfil(): Promise<SessionProfile | null> {
  try {
    return await requirePermission("ki_assistent", "manage");
  } catch {
    return null;
  }
}

/** Schritt 1: die Dokumentliste. Die Heuristiken (Arbeitsdokument, veraltet, Herkunft, Wiedervorlage) rechnet die Oberfläche daraus selbst. */
export async function wissenBestandspflegeStart(): Promise<PflegeStart> {
  if (!(await adminProfil())) return { dokumente: [], heute: "", fuerNaehe: [], fehler: true };
  const liste = await wissenDokumenteLaden();
  if (liste.fehler) return { dokumente: [], heute: "", fuerNaehe: [], fehler: true };
  const dokumente = liste.dokumente.filter((d) => d.chunks > 0);
  return {
    dokumente,
    heute: new Date().toISOString().slice(0, 10),
    fuerNaehe: dokumente.filter((d) => d.schluesselSpalte === "quelle_id").map((d) => d.schluessel),
    fehler: false,
  };
}

/** Schritt 2 (wiederholt): die inhaltliche Nähe einiger Dokumente zu allen anderen. */
export async function wissenBestandspflegeNaehe(quelleIds: string[]): Promise<{ naehe: DokumentNaehe[]; fehler: boolean }> {
  if (!(await adminProfil())) return { naehe: [], fehler: true };
  if (!Array.isArray(quelleIds) || quelleIds.length === 0 || quelleIds.length > NAEHE_JE_AUFRUF || !quelleIds.every(istQuelleId)) return { naehe: [], fehler: true };
  try {
    const db = createServiceRoleClient() as unknown as SupabaseClient;
    const naehe: DokumentNaehe[] = [];
    for (const id of quelleIds) naehe.push((await ladeNaehe(db, id, PROBEN)).naehe);
    return { naehe, fehler: false };
  } catch (error) {
    console.error("[damicon] Bestandspflege (Nähe) fehlgeschlagen:", error);
    return { naehe: [], fehler: true };
  }
}

export interface VergleichPaar {
  aehnlichkeit: number;
  bestand: string;
  gegenueber: string;
}

/** Die Vergleichsansicht: bis zu zwei Abschnitte des Dokuments mit dem ähnlichsten Abschnitt des anderen Dokuments, im Wortlaut. */
export async function wissenBestandspflegeVergleich(quelleId: string, andere: string): Promise<{ paare: VergleichPaar[]; titel: string | null; fehler: boolean }> {
  if (!(await adminProfil())) return { paare: [], titel: null, fehler: true };
  if (!istQuelleId(quelleId) || !istQuelleId(andere)) return { paare: [], titel: null, fehler: true };
  try {
    const db = createServiceRoleClient() as unknown as SupabaseClient;
    const { zeilen } = await ladeNaehe(db, quelleId, PROBEN);
    const beste = zeilen
      .filter((z) => z.naechste_quelle_id === andere)
      .sort((a, b) => Number(b.aehnlichkeit) - Number(a.aehnlichkeit))
      .slice(0, 2);
    if (beste.length === 0) return { paare: [], titel: null, fehler: false };
    const ids = beste.flatMap((z) => [z.probe, z.naechster_abschnitt]);
    const { data, error } = await db.from("wissen_chunks").select("id, text").in("id", ids);
    if (error) throw new Error(error.message);
    const text = new Map(((data ?? []) as unknown as { id: string; text: string }[]).map((r) => [r.id, r.text]));
    const kurz = (t: string | undefined) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, VERGLEICH_ZEICHEN);
    return {
      paare: beste.map((z) => ({ aehnlichkeit: Number(z.aehnlichkeit), bestand: kurz(text.get(z.probe)), gegenueber: kurz(text.get(z.naechster_abschnitt)) })),
      titel: beste[0]?.naechster_titel ?? null,
      fehler: false,
    };
  } catch (error) {
    console.error("[damicon] Bestandspflege (Vergleich) fehlgeschlagen:", error);
    return { paare: [], titel: null, fehler: true };
  }
}

export interface EntferntStatus {
  quelleId: string;
  titel: string | null;
  status: "entfernt" | "schonWeg" | "fehler";
  abschnitte: number;
  code?: PflegeFehlerCode | "unbekannt";
  /** Die Wortgewichte ließen sich nicht zurückrechnen: das Dokument ist weg, die Suche bleibt brauchbar. */
  gewichteOffen?: boolean;
}

export interface EntfernenAntwort {
  zugriff: boolean;
  /** Die Bestätigung stimmte nicht (sie muss die Zahl der Dokumente nennen). */
  bestaetigungFalsch?: boolean;
  ergebnisse: EntferntStatus[];
}

/**
 * Entfernt Dokumente nach der Prüfung. `bestaetigung` muss die Zahl der Dokumente sein (die Oberfläche lässt sie eintippen): Ein falscher Aufruf
 * ohne Bestätigung löscht nichts. Je Dokument ein Protokolleintrag (wer, was, warum, wie viele Abschnitte). Ein Fehler bei einem Dokument hält die übrigen nicht an.
 */
export async function wissenBestandEntfernen(quelleIds: string[], grund: string, bestaetigung: string): Promise<EntfernenAntwort> {
  const profil = await adminProfil();
  if (!profil) return { zugriff: false, ergebnisse: [] };
  const ids = Array.isArray(quelleIds) ? [...new Set(quelleIds)] : [];
  if (ids.length === 0 || ids.length > MAX_ENTFERNEN || !ids.every(istQuelleId) || typeof grund !== "string" || grund.trim().length === 0 || grund.length > MAX_GRUND) {
    return { zugriff: true, ergebnisse: [{ quelleId: "", titel: null, status: "fehler", abschnitte: 0, code: "eingabe" }] };
  }
  if (String(bestaetigung).trim() !== String(ids.length)) return { zugriff: true, bestaetigungFalsch: true, ergebnisse: [] };

  const speicher = bestandsSpeicher(createServiceRoleClient() as unknown as SupabaseClient);
  const ergebnisse: EntferntStatus[] = [];
  for (const id of ids) {
    try {
      const e = await entferneDokument(id, grund, profil.id, { speicher });
      ergebnisse.push({ quelleId: id, titel: e.titel, status: e.schonWeg ? "schonWeg" : "entfernt", abschnitte: e.geloescht, gewichteOffen: e.gewichteOffen || undefined });
      if (!e.schonWeg) {
        await protokolliere(profil, "wissen.entfernt", "wissen_chunks", null, {
          titel: e.titel,
          bereich: e.bereich,
          quelle_id: id,
          abschnitte: e.geloescht,
          grund: grund.trim(),
          upload: e.upload,
          wortgewichte_aktualisiert: !e.gewichteOffen,
        });
      }
    } catch (error) {
      const code = error instanceof PflegeFehler ? error.code : "unbekannt";
      console.error(`[damicon] Entfernen von "${id}" fehlgeschlagen (${code}):`, error);
      ergebnisse.push({ quelleId: id, titel: null, status: "fehler", abschnitte: 0, code });
    }
  }
  return { zugriff: true, ergebnisse };
}
