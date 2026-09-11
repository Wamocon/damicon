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

// Feldvorgaenge, die die Nachweiskette fuellen: Steige mit Person erfassen,
// Arbeitszeit melden, Kuehlmessung aufnehmen. Erst diese drei Vorgaenge machen
// aus der Struktur eine Kette.

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

async function chargeZurAufgabe(aufgabeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chargen")
    .select("id, code")
    .eq("pflueckaufgabe_id", aufgabeId)
    .maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// Kernfunktionen (Anforderung 2.5): die eigentliche Schreiblogik, getrennt
// von der FormData-Entgegennahme. Sowohl die Server Action (Formular, immer
// online) als auch der Sync-Endpunkt (src/app/api/sync/route.ts, fuer die
// Offline-Warteschlange) rufen dieselbe Funktion auf - inklusive derselben
// requirePermission()-Pruefung. So kann keiner der beiden Aufrufer in der
// Berechtigung vom anderen abweichen.
//
// `erledigt` ist absichtlich von `status.stand` getrennt: eine Kuehlmessung,
// die einen Kuehlketten-Verstoss ergibt, WURDE geschrieben (erledigt: true),
// obwohl status.stand "fehler" ist - das ist ein fachlicher Alarm fuer die
// Oberflaeche, kein technischer Fehlschlag. Der Sync-Endpunkt entfernt den
// Warteschlangen-Eintrag anhand von `erledigt`, nicht anhand von
// `status.stand` - sonst wuerde ein Verstoss endlos erneut gesendet, ohne
// beim erneuten Versuch etwas Neues zu schreiben (die Zeile existiert ja
// schon, der idempotente Upsert wuerde sie beim Retry nur uebergehen).
// ---------------------------------------------------------------------------

export interface KernErgebnis<T = undefined> {
  erledigt: boolean;
  status: AktionsStatus;
  daten?: T;
}

export interface KuehlmessungParams {
  aufgabeId: string;
  temperaturC: number | null;
  geraetZeitpunkt: string | null;
  /** Nur beim Sync-Aufruf gesetzt: macht den Insert idempotent (siehe
   * Warteschlangen-Eintrag - ein Retry nach unklarer Antwort dupliziert die
   * Messung nicht, weil dieselbe Zeilen-id erneut verwendet wird). */
  aktionId?: string;
}

export async function kuehlmessungKern(
  params: KuehlmessungParams,
): Promise<KernErgebnis<{ minutenSeitPfluecken: number | null; ergebnis: string }>> {
  let profil: SessionProfile;
  try {
    // Die Messung gehoert zum Ablauf der Pflueckaufgabe, deshalb dasselbe Recht
    // wie die Mengenmeldung. Ein Leserecht ("kuehlkette:view") waere hier die
    // falsche Schranke - geschrieben wird trotzdem.
    profil = await requirePermission("pflueckaufgaben", "update");
  } catch (error) {
    return { erledigt: false, status: zugriffsFehler(error) };
  }

  const { aufgabeId, temperaturC, geraetZeitpunkt, aktionId } = params;
  if (!aufgabeId || temperaturC === null) {
    return { erledigt: false, status: fehler("fehler.eingabe") };
  }

  const charge = await chargeZurAufgabe(aufgabeId);
  if (!charge) return { erledigt: false, status: fehler("fehler.keineCharge") };

  const supabase = await createClient();

  // Anforderung 2.6: geraet_zeitpunkt kommt vom Client (Moment der Messung),
  // der Trigger kuehlkette_bewerten() setzt gemessen_am daraus - geprueft,
  // sonst waere die 60-Minuten-Kennzahl bei verzoegerter Synchronisierung
  // nicht messbar (siehe Migration 20260911000000).
  const zeile = {
    charge_id: charge.id,
    geraet_zeitpunkt: geraetZeitpunkt,
    temperatur_c: temperaturC,
    // gemessen_am hat seit Migration 20260911000000 keinen Spalten-Default
    // mehr (siehe Kommentar dort) - der Trigger berechnet ihn aus
    // geraet_zeitpunkt. Der generierte Insert-/Upsert-Typ kennt
    // trigger-gesetzte Spalten nicht und haelt sie faelschlich fuer
    // erforderlich; eingefuegt wird nie tatsaechlich NULL.
    gemessen_am: null as unknown as string,
  };

  // Sync-Aufruf: Client-generierte id macht den Schreibvorgang idempotent -
  // ein erneut gesendeter Warteschlangen-Eintrag (z. B. nach einer
  // Zeitueberschreitung, deren Antwort nie ankam) legt keine zweite Messung
  // an, sondern wird per ON CONFLICT DO NOTHING uebergangen. Der normale
  // Formular-Weg (kein aktionId) braucht das nicht - eine einzelne
  // Online-Anfrage hat kein Retry-Risiko dieser Art.
  const { data, error } = aktionId
    ? await supabase
        .from("kuehlketten_messungen")
        .upsert({ id: aktionId, ...zeile }, { onConflict: "id", ignoreDuplicates: true })
        .select("id, minuten_seit_pfluecken, ergebnis")
        .maybeSingle()
    : await supabase
        .from("kuehlketten_messungen")
        .insert(zeile)
        .select("id, minuten_seit_pfluecken, ergebnis")
        .single();

  if (error) return { erledigt: false, status: dbFehler(error) };
  if (!data) {
    // Nur erreichbar mit aktionId: der Konflikt hat gegriffen, diese Messung
    // wurde bei einem frueheren Versuch bereits erfolgreich geschrieben.
    return { erledigt: true, status: ok("ok.kuehlmessung", "") };
  }

  await supabase.from("audit_events").insert({
    // Vibecode-Cleanup-Fund: actor fehlte hier (anders als bei jeder anderen
    // Protokollierung im Projekt), nur die Rolle stand in metadata - der
    // Audit-Log verlor damit ausgerechnet fuer die Feldvorgaenge den
    // lesbaren Namen der handelnden Person.
    actor: `${profil.fullName} (${profil.role})`,
    aktion: "kuehlmessung.erfasst",
    ressource: "kuehlketten_messungen",
    ressource_id: data.id,
    metadata: {
      charge: charge.code,
      temperatur_c: temperaturC,
      ergebnis: data.ergebnis,
      aktor_rolle: profil.role,
    },
  });

  const status =
    data.ergebnis === "verstoss"
      ? fehler("fehler.kuehlkette", String(data.minuten_seit_pfluecken ?? ""))
      : ok("ok.kuehlmessung", String(data.minuten_seit_pfluecken ?? ""));

  return {
    erledigt: true,
    status,
    daten: { minutenSeitPfluecken: data.minuten_seit_pfluecken, ergebnis: data.ergebnis },
  };
}

export interface SteigeParams {
  aufgabeId: string;
  pflueckerId: string;
  gewichtKg: number | null;
  geraetZeitpunkt: string | null;
  /** Nur beim Sync-Aufruf gesetzt - macht den Insert idempotent. Die
   * Laufnummer/den Code berechnet in jedem Fall der Trigger
   * steige_nummer_vergeben() (Migration 20260915000000) atomar aus
   * pflueckaufgaben.steigen_zaehler, nie der Client - das ist der Punkt: ein
   * Retry mit derselben aktionId legt dank ON CONFLICT keine zweite Zeile an,
   * verbraucht also auch keine zweite Nummer. */
  aktionId?: string;
}

export async function steigeKern(
  params: SteigeParams,
): Promise<KernErgebnis<{ code: string }>> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("pflueckaufgaben", "create");
  } catch (error) {
    return { erledigt: false, status: zugriffsFehler(error) };
  }

  const { aufgabeId, pflueckerId, gewichtKg, geraetZeitpunkt, aktionId } = params;
  if (!aufgabeId || !pflueckerId) return { erledigt: false, status: fehler("fehler.eingabe") };

  const charge = await chargeZurAufgabe(aufgabeId);
  if (!charge) return { erledigt: false, status: fehler("fehler.keineCharge") };

  const supabase = await createClient();

  // Anforderung 2.6: geraet_zeitpunkt kommt vom Client (Moment des Scans),
  // scan_zeitpunkt setzt der Trigger trg_steige_zeitpunkt daraus - geprueft
  // gegen den tatsaechlichen Servereingang, nicht blind uebernommen.
  const zeile = {
    charge_id: charge.id,
    pflueckaufgabe_id: aufgabeId,
    pfluecker_id: pflueckerId,
    gewicht_kg: gewichtKg ?? 2,
    geraet_zeitpunkt: geraetZeitpunkt,
    // Leer statt selbst berechnet: steige_nummer_vergeben() (Migration
    // 20260915000000) erkennt einen leeren Code als "bitte automatisch und
    // atomar nummerieren" - nur Seed-Daten liefern hier bewusst einen echten
    // Wert. code/qr_token sind NOT NULL ohne Default, deshalb muss irgendein
    // Wert mitgegeben werden; der Trigger ueberschreibt ihn vor dem Schreiben.
    code: "",
    qr_token: "",
  };

  const { data, error } = aktionId
    ? await supabase
        .from("steigen")
        .upsert({ id: aktionId, ...zeile }, { onConflict: "id", ignoreDuplicates: true })
        .select("id, code")
        .maybeSingle()
    : await supabase.from("steigen").insert(zeile).select("id, code").single();

  if (error) return { erledigt: false, status: dbFehler(error) };
  if (!data) {
    // Nur erreichbar mit aktionId: der Konflikt hat gegriffen, diese Steige
    // wurde bei einem frueheren Versuch bereits erfolgreich geschrieben - der
    // genaue Code ist hier nicht mehr bekannt, war beim ersten Versuch aber
    // schon in der Erfolgsmeldung zu sehen.
    return { erledigt: true, status: ok("ok.steige", "") };
  }

  await supabase.from("audit_events").insert({
    actor: `${profil.fullName} (${profil.role})`,
    aktion: "steige.erfasst",
    ressource: "steigen",
    ressource_id: data.id,
    metadata: { code: data.code, gewicht_kg: gewichtKg ?? 2, aktor_rolle: profil.role },
  });

  return { erledigt: true, status: ok("ok.steige", data.code), daten: { code: data.code } };
}

export interface ArbeitszeitParams {
  aufgabeId: string;
  pflueckerId: string;
  minuten: number | null;
  geraetZeitpunkt: string | null;
  aktionId?: string;
}

export async function arbeitszeitKern(params: ArbeitszeitParams): Promise<KernErgebnis> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("pflueckaufgaben", "create");
  } catch (error) {
    return { erledigt: false, status: zugriffsFehler(error) };
  }

  const { aufgabeId, pflueckerId, minuten, geraetZeitpunkt, aktionId } = params;
  if (!aufgabeId || !pflueckerId || minuten === null || minuten <= 0) {
    return { erledigt: false, status: fehler("fehler.eingabe") };
  }

  // Anforderung 2.6 (Vorstufe 2.5): ende kommt vom Client (Moment der
  // Meldung), nicht mehr von der Serverzeit - eine verzoegert synchronisierte
  // Meldung wuerde sonst die Sync-Zeit statt der tatsaechlichen Arbeitszeit
  // aufzeichnen. beginn/minuten bleiben rein rechnerisch aus ende abgeleitet.
  const ende = geraetZeitpunkt ? new Date(geraetZeitpunkt) : new Date();
  const beginn = new Date(ende.getTime() - minuten * 60_000);

  const supabase = await createClient();

  const zeile = {
    pfluecker_id: pflueckerId,
    pflueckaufgabe_id: aufgabeId,
    beginn: beginn.toISOString(),
    ende: ende.toISOString(),
    geraet_zeitpunkt: geraetZeitpunkt,
  };

  const { data, error } = aktionId
    ? await supabase
        .from("arbeitszeiten")
        .upsert({ id: aktionId, ...zeile }, { onConflict: "id", ignoreDuplicates: true })
        .select("id")
        .maybeSingle()
    : await supabase.from("arbeitszeiten").insert(zeile).select("id").single();

  if (error) return { erledigt: false, status: dbFehler(error) };
  if (!data) return { erledigt: true, status: ok("ok.arbeitszeit", String(minuten)) };

  await supabase.from("audit_events").insert({
    actor: `${profil.fullName} (${profil.role})`,
    aktion: "arbeitszeit.erfasst",
    ressource: "arbeitszeiten",
    ressource_id: data.id,
    metadata: { pfluecker_id: pflueckerId, minuten, aktor_rolle: profil.role },
  });

  return { erledigt: true, status: ok("ok.arbeitszeit", String(minuten)) };
}

// ---------------------------------------------------------------------------
// Server Actions: duenne FormData-Wrapper um die Kernfunktionen. Verhalten
// unveraendert gegenueber vor der Extraktion.
// ---------------------------------------------------------------------------

// Steige mit Person: der Vorgang, an dem die Kette bis zum Pfluecker reicht.
export async function steigeErfassen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  const { status } = await steigeKern({
    aufgabeId: text(formData, "aufgabe_id"),
    pflueckerId: text(formData, "pfluecker_id"),
    gewichtKg: zahl(formData, "gewicht_kg"),
    geraetZeitpunkt: text(formData, "geraet_zeitpunkt") || null,
  });
  aktualisiere(formData);
  return status;
}

// Arbeitszeit: der Nenner der Pflueckleistung.
export async function arbeitszeitErfassen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  const { status } = await arbeitszeitKern({
    aufgabeId: text(formData, "aufgabe_id"),
    pflueckerId: text(formData, "pfluecker_id"),
    minuten: zahl(formData, "minuten"),
    geraetZeitpunkt: text(formData, "geraet_zeitpunkt") || null,
  });
  aktualisiere(formData);
  return status;
}

// Kuehlmessung: Minuten und Urteil rechnet die Datenbank, nicht das Formular.
export async function kuehlmessungErfassen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  const { status } = await kuehlmessungKern({
    aufgabeId: text(formData, "aufgabe_id"),
    temperaturC: zahl(formData, "temperatur_c"),
    geraetZeitpunkt: text(formData, "geraet_zeitpunkt") || null,
  });
  aktualisiere(formData);
  return status;
}

// Anforderung 2.10: Stichprobenkontrolle je einzelner Steige, unabhaengig vom
// Abschluss der gesamten Pflueckaufgabe. Dieselbe Berechtigungsstufe wie der
// Aufgabenabschluss (pflueckaufgaben:approve, siehe aufgabeStatusSetzen in
// lib/actions/pflueckaufgaben.ts) - eine Stichprobenkontrolle ist fachlich
// dieselbe Belegpruefung, nur auf Steigen-Ebene statt Aufgaben-Ebene.
export async function steigeKontrollieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("pflueckaufgaben", "approve");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("steigen")
    .update({
      kontrolliert_am: new Date().toISOString(),
      kontrolliert_von_profil_id: profil.id,
    })
    .eq("id", id)
    .is("kontrolliert_am", null)
    .select("id, code")
    .maybeSingle();

  if (error) return dbFehler(error);
  // Kein Treffer trotz fehlerfreiem Update: entweder keine Berechtigung
  // (RLS hat die Zeile ausgefiltert) oder bereits kontrolliert.
  if (!data) return fehler("fehler.zustand");

  aktualisiere(formData);
  return ok("ok.steigeKontrolliert", data.code);
}
