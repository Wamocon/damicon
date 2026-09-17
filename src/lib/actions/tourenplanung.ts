"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";
import { geokodiereAdresse } from "@/lib/tourenplanung/nominatim-client";
import { berechneOptimierteTour } from "@/lib/tourenplanung/osrm-client";
import { WETTER_BREITENGRAD, WETTER_LAENGENGRAD } from "@/lib/domain/wetter";
import type { Json } from "@/lib/database.types";

// Tourenplanung mit Routenoptimierung (Anforderung 3.5, Teil 1).
// requirePermission() auf "logistik" - dieselbe Ressource wie die uebrige
// Lieferungsplanung, Betriebsleitung/Admin duerfen planen, Brigade nur die
// Uebergabe erfassen (siehe rbac.ts).

function protokolliere(profil: SessionProfile, aktion: string, ressourceId: string | null) {
  return protokolliereBasis(profil, aktion, "logistik", ressourceId);
}

export async function kundeAdresseAktualisieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("logistik", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const adresse = text(formData, "adresse");
  if (!id || !adresse) return fehler("fehler.eingabe");

  const geokodierung = await geokodiereAdresse(adresse);

  const supabase = await createClient();
  const { error } = await supabase
    .from("b2b_kunden")
    .update({
      adresse,
      breitengrad: geokodierung?.breitengrad ?? null,
      laengengrad: geokodierung?.laengengrad ?? null,
      geokodiert_am: geokodierung ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) return dbFehler(error);

  await protokolliere(profil, "kunde.adresse_aktualisiert", id);
  aktualisiere(formData);
  // Eine Adresse, die sich nicht geokodieren liess (Tippfehler, zu ungenau),
  // wird trotzdem gespeichert - aber mit einer eigenen Meldung, damit das
  // Buero nachbessern kann, statt stillschweigend ohne Koordinaten dazustehen.
  return geokodierung ? ok("ok.adresseGeokodiert") : fehler("fehler.geokodierung");
}

export async function tourErstellen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("logistik", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const datum = text(formData, "datum");
  const lieferungIds = formData.getAll("lieferung_id").map(String).filter(Boolean);
  if (!datum || lieferungIds.length === 0) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data: lieferungen, error: ladeFehler } = await supabase
    .from("lieferungen")
    .select("id, b2b_kunden ( breitengrad, laengengrad )")
    .in("id", lieferungIds);

  if (ladeFehler) return dbFehler(ladeFehler);

  // Nur Stopps mit bekannten Koordinaten gehen in die Route ein - eine
  // Lieferung ohne geokodierte Adresse kann OSRM nicht anfahren. Sie bleibt
  // "ohne Tour" sichtbar, statt die ganze Tourerstellung scheitern zu lassen.
  const mitKoordinaten = (lieferungen ?? []).filter((l) => {
    const kunde = Array.isArray(l.b2b_kunden) ? l.b2b_kunden[0] : l.b2b_kunden;
    return kunde?.breitengrad !== null && kunde?.laengengrad !== null && kunde !== undefined;
  });

  if (mitKoordinaten.length === 0) return fehler("fehler.keineKoordinaten");

  const wegpunkte = [
    { breitengrad: WETTER_BREITENGRAD, laengengrad: WETTER_LAENGENGRAD },
    ...mitKoordinaten.map((l) => {
      const kunde = Array.isArray(l.b2b_kunden) ? l.b2b_kunden[0] : l.b2b_kunden;
      return { breitengrad: Number(kunde!.breitengrad), laengengrad: Number(kunde!.laengengrad) };
    }),
  ];

  const trip = await berechneOptimierteTour(wegpunkte);

  const { data: tour, error: tourFehler } = await supabase
    .from("touren")
    .insert({
      datum,
      distanz_km: trip?.distanzKm ?? null,
      dauer_minuten: trip?.dauerMinuten ?? null,
      routen_geometrie: (trip?.geometrie as unknown as Json) ?? null,
      erstellt_von_profil_id: profil.id,
    })
    .select("id")
    .single();

  if (tourFehler) return dbFehler(tourFehler);

  // OSRM-Reihenfolge (Index 0 ist der Betrieb selbst) auf die Lieferungen
  // uebertragen. Ohne Routenantwort (Dienst nicht erreichbar) bleibt die
  // Planungsreihenfolge erhalten statt eines falsch sortierten Ratens.
  const reihenfolgeNachLieferung = new Map<string, number>();
  if (trip) {
    trip.reihenfolge
      .filter((wegpunktIndex) => wegpunktIndex > 0)
      .forEach((wegpunktIndex, position) => {
        reihenfolgeNachLieferung.set(mitKoordinaten[wegpunktIndex - 1].id, position);
      });
  } else {
    mitKoordinaten.forEach((l, position) => reihenfolgeNachLieferung.set(l.id, position));
  }

  for (const lieferung of mitKoordinaten) {
    await supabase
      .from("lieferungen")
      .update({ tour_id: tour.id, tour_reihenfolge: reihenfolgeNachLieferung.get(lieferung.id) ?? null })
      .eq("id", lieferung.id);
  }

  await protokolliere(profil, "tour.erstellt", tour.id);
  aktualisiere(formData);
  return trip ? ok("ok.tourErstellt") : fehler("fehler.routendienst");
}

export async function tourLoeschen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("logistik", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  // lieferungen.tour_id ist "on delete set null" - die betroffenen
  // Lieferungen bleiben erhalten und landen zurueck unter "ohne Tour".
  const { error } = await supabase.from("touren").delete().eq("id", id);
  if (error) return dbFehler(error);

  await protokolliere(profil, "tour.geloescht", id);
  aktualisiere(formData);
  return ok("ok.tourGeloescht");
}
