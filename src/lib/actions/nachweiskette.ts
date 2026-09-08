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

// Steige mit Person: der Vorgang, an dem die Kette bis zum Pfluecker reicht.
export async function steigeErfassen(
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
  const pflueckerId = text(formData, "pfluecker_id");
  const gewicht = zahl(formData, "gewicht_kg") ?? 2;
  if (!aufgabeId || !pflueckerId) return fehler("fehler.eingabe");

  const charge = await chargeZurAufgabe(aufgabeId);
  if (!charge) return fehler("fehler.keineCharge");

  const supabase = await createClient();
  const { count } = await supabase
    .from("steigen")
    .select("id", { count: "exact", head: true })
    .eq("pflueckaufgabe_id", aufgabeId);

  const laufnummer = (count ?? 0) + 1;
  const code = `${charge.code}-S${String(laufnummer).padStart(3, "0")}`;

  // Anforderung 2.6: geraet_zeitpunkt kommt vom Client (Moment des Scans),
  // scan_zeitpunkt setzt der Trigger trg_steige_zeitpunkt daraus - geprueft
  // gegen den tatsaechlichen Servereingang, nicht blind uebernommen.
  const geraetZeitpunkt = text(formData, "geraet_zeitpunkt") || null;

  const { error } = await supabase.from("steigen").insert({
    code,
    qr_token: `qr-${charge.code.toLowerCase()}-${laufnummer}`,
    charge_id: charge.id,
    pflueckaufgabe_id: aufgabeId,
    pfluecker_id: pflueckerId,
    gewicht_kg: gewicht,
    geraet_zeitpunkt: geraetZeitpunkt,
  });

  if (error) return dbFehler(error);

  await supabase.from("audit_events").insert({
    aktion: "steige.erfasst",
    ressource: "steigen",
    ressource_id: charge.id,
    metadata: { code, gewicht_kg: gewicht, aktor_rolle: profil.role },
  });

  aktualisiere(formData);
  return ok("ok.steige", code);
}

// Arbeitszeit: der Nenner der Pflueckleistung.
export async function arbeitszeitErfassen(
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
  const pflueckerId = text(formData, "pfluecker_id");
  const minuten = zahl(formData, "minuten");
  if (!aufgabeId || !pflueckerId || minuten === null || minuten <= 0) {
    return fehler("fehler.eingabe");
  }

  const ende = new Date();
  const beginn = new Date(ende.getTime() - minuten * 60_000);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("arbeitszeiten")
    .insert({
      pfluecker_id: pflueckerId,
      pflueckaufgabe_id: aufgabeId,
      beginn: beginn.toISOString(),
      ende: ende.toISOString(),
    })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await supabase.from("audit_events").insert({
    aktion: "arbeitszeit.erfasst",
    ressource: "arbeitszeiten",
    ressource_id: data.id,
    metadata: { pfluecker_id: pflueckerId, minuten, aktor_rolle: profil.role },
  });

  aktualisiere(formData);
  return ok("ok.arbeitszeit", String(minuten));
}

// Kuehlmessung: Minuten und Urteil rechnet die Datenbank, nicht das Formular.
export async function kuehlmessungErfassen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    // Die Messung gehoert zum Ablauf der Pflueckaufgabe, deshalb dasselbe Recht
    // wie die Mengenmeldung. Ein Leserecht ("kuehlkette:view") waere hier die
    // falsche Schranke - geschrieben wird trotzdem.
    profil = await requirePermission("pflueckaufgaben", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const aufgabeId = text(formData, "aufgabe_id");
  const temperatur = zahl(formData, "temperatur_c");
  if (!aufgabeId || temperatur === null) return fehler("fehler.eingabe");

  const charge = await chargeZurAufgabe(aufgabeId);
  if (!charge) return fehler("fehler.keineCharge");

  // Anforderung 2.6: geraet_zeitpunkt kommt vom Client (Moment der Messung),
  // der Trigger kuehlkette_bewerten() setzt gemessen_am daraus - geprueft,
  // sonst waere die 60-Minuten-Kennzahl bei verzoegerter Synchronisierung
  // nicht messbar (siehe Migration 20260911000000).
  const geraetZeitpunkt = text(formData, "geraet_zeitpunkt") || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kuehlketten_messungen")
    .insert({
      charge_id: charge.id,
      geraet_zeitpunkt: geraetZeitpunkt,
      temperatur_c: temperatur,
      // gemessen_am hat seit Migration 20260911000000 keinen Spalten-Default
      // mehr (siehe Kommentar dort) - der Trigger kuehlkette_bewerten()
      // berechnet ihn aus geraet_zeitpunkt. Der generierte Insert-Typ kennt
      // trigger-gesetzte Spalten nicht und haelt sie faelschlich fuer
      // erforderlich; eingefuegt wird nie tatsaechlich NULL.
      gemessen_am: null as unknown as string,
    })
    .select("id, minuten_seit_pfluecken, ergebnis")
    .single();

  if (error) return dbFehler(error);

  await supabase.from("audit_events").insert({
    aktion: "kuehlmessung.erfasst",
    ressource: "kuehlketten_messungen",
    ressource_id: data.id,
    metadata: {
      charge: charge.code,
      temperatur_c: temperatur,
      ergebnis: data.ergebnis,
      aktor_rolle: profil.role,
    },
  });

  aktualisiere(formData);
  return data.ergebnis === "verstoss"
    ? fehler("fehler.kuehlkette", String(data.minuten_seit_pfluecken ?? ""))
    : ok("ok.kuehlmessung", String(data.minuten_seit_pfluecken ?? ""));
}
