"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";
import { ladeOpenMeteoAktuell, ladeOpenMeteoArchiv } from "@/lib/wetter/open-meteo-client";
import {
  berechneTemperatursummen,
  saisonStart,
  WETTER_BREITENGRAD,
  WETTER_LAENGENGRAD,
} from "@/lib/domain/wetter";

// Wetteranbindung mit Temperatursummen-Heuristik (Anforderung 2.13).
// requirePermission() teilt sich die Ressource "rotationsplan" mit dem
// gleichnamigen Modul (siehe modules.ts) - dieselben Rollen, die den
// Rotationsplan pflegen duerfen, aktualisieren auch das Wetter.

function protokolliere(profil: SessionProfile, aktion: string, metadata: Record<string, number> = {}) {
  return protokolliereBasis(profil, aktion, "wetter_messungen", null, metadata);
}

export async function wetterAktualisieren(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("rotationsplan", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const heute = new Date();
  const heuteIso = heute.toISOString().slice(0, 10);
  const start = saisonStart(heute.getFullYear());

  const gestern = new Date(heute);
  gestern.setDate(gestern.getDate() - 1);
  const gesternIso = gestern.toISOString().slice(0, 10);

  // Zwei Endpunkte (siehe open-meteo-client.ts): das Archiv traegt die Saison
  // seit dem 1. Januar, die Forecast-API die letzten Tage inklusive heute,
  // fuer die das Archiv typischerweise noch keine Werte hat.
  const [archiv, aktuell] = await Promise.all([
    start <= gesternIso
      ? ladeOpenMeteoArchiv(WETTER_BREITENGRAD, WETTER_LAENGENGRAD, start, gesternIso)
      : Promise.resolve([]),
    ladeOpenMeteoAktuell(WETTER_BREITENGRAD, WETTER_LAENGENGRAD, 3),
  ]);

  if (archiv.length === 0 && aktuell.length === 0) {
    return fehler("fehler.wetterdienst");
  }

  // Zusammenfuehren: aktuell ueberschreibt archiv fuer denselben Tag (juengere
  // Messung vom selben Dienst), nicht umgekehrt.
  const nachDatum = new Map<string, (typeof archiv)[number]>();
  for (const tag of archiv) nachDatum.set(tag.datum, tag);
  for (const tag of aktuell) nachDatum.set(tag.datum, tag);

  const tage = [...nachDatum.values()]
    .filter((t) => t.datum >= start && t.datum <= heuteIso)
    .sort((a, b) => a.datum.localeCompare(b.datum));

  const mitSummen = berechneTemperatursummen(tage);

  const supabase = await createClient();

  // Bestand der laufenden Saison ersetzen statt einzelner Upserts - siehe
  // Migrationskommentar (20261007000000), warum eine Unique-Constraint hier
  // nicht als Upsert-Konfliktziel taugt. feldparzelle_id ist immer null: eine
  // einzige, betriebsweite Messreihe (siehe domain/wetter.ts).
  const { error: loeschFehler } = await supabase
    .from("wetter_messungen")
    .delete()
    .is("feldparzelle_id", null)
    .gte("gemessen_am", start)
    .lte("gemessen_am", heuteIso);
  if (loeschFehler) return dbFehler(loeschFehler);

  const { error: insertFehler } = await supabase.from("wetter_messungen").insert(
    mitSummen.map((t) => ({
      gemessen_am: t.datum,
      temp_min_c: t.tempMinC,
      temp_max_c: t.tempMaxC,
      niederschlag_mm: t.niederschlagMm,
      temperatursumme: t.temperatursumme,
    })),
  );
  if (insertFehler) return dbFehler(insertFehler);

  await protokolliere(profil, "wetter.aktualisiert", { tage: mitSummen.length });
  aktualisiere(formData);
  return ok("ok.wetterAktualisiert");
}
