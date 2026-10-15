"use server";

import { createClient } from "@/lib/supabase/server";
import type { SessionProfile } from "@/lib/auth";
import type { Action } from "@/lib/rbac";
import { dbFehler, fehler, ok, type AktionsStatus } from "@/lib/actions/status";
import { mitRecht } from "@/lib/actions/zugriff";
import { text, zahl, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { geokodiereAdresse } from "@/lib/tourenplanung/nominatim-client";
import { berechneOptimierteTour, minutenAbErstemStopp, stoppPositionen } from "@/lib/tourenplanung/osrm-client";
import { WETTER_BREITENGRAD, WETTER_LAENGENGRAD } from "@/lib/domain/wetter";
import { abholungFehler, ankuenfteNachMinuten, fensterFehler, pflueckbeginnAus, rundeFehler } from "@/lib/domain/abholrunden";
import { ortszeitAlsInstant } from "@/lib/domain/tageszeit";
import { einstellungWert } from "@/lib/data/einstellungen";
import type { Json } from "@/lib/database.types";
import { istUuid } from "@/lib/utils";

// Abholrunden bei Nachbarbetrieben (WMCNL-1577). requirePermission("logistik", ...) ist die erste Verteidigungslinie: das Buero
// plant (create), das Buero und die Brigade erfassen den Ablauf (update). Die zweite stehen in der Datenbank
// (Zeilensicherheit, Trigger abholrunde_pruefen und abholstopp_pruefen, Migration 20261207100000): der Ablauf, die Plausibilitaet
// der Zeiten und die Unveraenderlichkeit nach dem Abschluss.

function zugriff(aktion: Action) {
  return mitRecht("logistik", aktion);
}

const protokoll = (profil: SessionProfile, aktion: string, id: string | null, metadata: Record<string, Json> = {}) =>
  protokolliere(profil, aktion, "logistik", id, metadata);

/** Die Uhr des Geraets, mit der der Fahrer den Moment festhaelt; die Datenbank prueft sie auf Plausibilitaet. */
const geraetZeitpunkt = (formData: FormData): string | null => {
  const wert = text(formData, "geraet_zeitpunkt");
  return wert !== "" && !Number.isNaN(Date.parse(wert)) ? new Date(wert).toISOString() : null;
};

// --- Planen ----------------------------------------------------------------------------------------------------------------------

export async function nachbarAdresseSetzen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  // "create" statt "update" (Pruefung PR #156, 15.10.2026): Die Anschrift geht an einen Dienst ausserhalb, bevor die Zeilensicherheit sie prueft. Die Brigade
  // hat "update" auf der Logistik, aber kein "create", und darf Adressen nicht an den Dienst schicken.
  const z = await zugriff("create");
  if ("status" in z) return z.status;

  const id = text(formData, "id");
  const adresse = text(formData, "adresse");
  if (!istUuid(id) || adresse === "" || adresse.length > 300) return fehler("fehler.eingabe");

  const supabase = await createClient();
  // Grenze je Person und Stunde (Einstellung sicherheit.adresssuche_je_stunde), bevor die Anschrift den Dienst erreicht.
  const { data: erlaubt, error: grenzeFehler } = await supabase.rpc("adresssuche_zulassen");
  if (grenzeFehler) return dbFehler(grenzeFehler);
  if (!erlaubt) return fehler("fehler.adresssucheGrenze");
  const geokodierung = await geokodiereAdresse(adresse);
  const { data, error } = await supabase
    .from("nachbarbetriebe")
    .update({
      adresse,
      breitengrad: geokodierung?.breitengrad ?? null,
      laengengrad: geokodierung?.laengengrad ?? null,
      geokodiert_am: geokodierung ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return dbFehler(error);
  // Die Zeilensicherheit laesst nur die Leitung schreiben; ein Treffer von null Zeilen heisst: nicht gefunden oder nicht erlaubt.
  if (!data) return fehler("fehler.berechtigung");

  await protokoll(z.profil, "nachbarbetrieb.adresse_aktualisiert", id);
  aktualisiere(formData);
  // Eine Adresse, die sich nicht geokodieren laesst, wird trotzdem gespeichert, mit eigener Meldung: das Buero kann nachbessern.
  return geokodierung ? ok("ok.adresseGeokodiert") : fehler("fehler.geokodierung");
}

export async function abholrundeErstellen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("create");
  if ("status" in z) return z.status;

  const betriebIds = formData.getAll("betrieb_id").map(String).filter(istUuid);
  const stopps = betriebIds.map((id) => ({ nachbarbetriebId: id, mengeKg: zahl(formData, `menge_${id}`) }));
  // Kapazitaet des Fahrzeugs (leer = keine Pruefung) und Abfahrt am Betrieb (leer = keine Schaetzung der Ankunft).
  const kapazitaetRoh = text(formData, "kapazitaet_kg");
  const kapazitaetKg = kapazitaetRoh === "" ? null : zahl(formData, "kapazitaet_kg");
  const startZeit = text(formData, "start_zeit");
  const eingabe = {
    datum: text(formData, "datum"),
    fahrzeug: text(formData, "fahrzeug"),
    notiz: text(formData, "notiz"),
    kapazitaetKg: kapazitaetRoh !== "" && kapazitaetKg === null ? Number.NaN : kapazitaetKg,
    startZeit,
    stopps,
  };
  const abgelehnt = rundeFehler(eingabe);
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const supabase = await createClient();
  const { data: betriebe, error: ladeFehler } = await supabase.from("nachbarbetriebe").select("id, breitengrad, laengengrad").in("id", betriebIds);
  if (ladeFehler) return dbFehler(ladeFehler);
  const koordinaten = new Map((betriebe ?? []).map((b) => [b.id, b.breitengrad === null || b.laengengrad === null ? null : { breitengrad: Number(b.breitengrad), laengengrad: Number(b.laengengrad) }]));
  if (koordinaten.size !== betriebIds.length) return fehler("fehler.arBetriebFehlt");

  // Stopps mit bekannten Koordinaten gehen in die Routenberechnung, der Betrieb ist der Start und das Ziel (das Kuehlhaus liegt
  // beim Betrieb). Die anderen bleiben in der Runde, hinten, in der gewaehlten Reihenfolge: eine Abholung ohne Adresse ist trotzdem
  // eine Abholung, nur ohne Reihenfolge nach der Strecke.
  const mitOrt = stopps.filter((s) => koordinaten.get(s.nachbarbetriebId) !== null);
  const ohneOrt = stopps.filter((s) => koordinaten.get(s.nachbarbetriebId) === null);
  const trip = mitOrt.length > 0
    ? await berechneOptimierteTour([{ breitengrad: WETTER_BREITENGRAD, laengengrad: WETTER_LAENGENGRAD }, ...mitOrt.map((s) => koordinaten.get(s.nachbarbetriebId)!)])
    : null;
  const positionen = trip ? stoppPositionen(trip.reihenfolge) : [];
  const geordnet = trip
    ? [...mitOrt.map((s, i) => ({ s, position: positionen[i] })).sort((a, b) => a.position - b.position).map((x) => x.s), ...ohneOrt]
    : [...mitOrt, ...ohneOrt];

  // Geschaetzte Ankunft je Stopp mit Koordinaten: Abfahrt plus Fahrzeit der Teilstrecken plus Zeit je Stopp (Einstellung abholung.aufenthalt_minuten).
  // Ohne Abfahrt oder Route gibt es keine Schaetzung, die Stopps ohne Koordinaten bekommen keine.
  const aufenthalt = (await einstellungWert("abholung.aufenthalt_minuten")) ?? 0;
  const nachMinuten = trip && startZeit !== "" ? ankuenfteNachMinuten(trip.teilstreckenSekunden, mitOrt.length, aufenthalt) : null;
  const abfahrt = startZeit !== "" ? ortszeitAlsInstant(eingabe.datum, startZeit) : null;
  const ankunft = (position: number): string | null =>
    nachMinuten && abfahrt && position < nachMinuten.length ? new Date(abfahrt.getTime() + nachMinuten[position] * 60_000).toISOString() : null;

  // Runde und Stopps in einer Transaktion (Funktion abholrunde_anlegen): scheitert ein Stopp, gibt es auch die Runde nicht, und es bleibt kein Rest,
  // den eine zweite Anweisung wieder aufraeumen muesste (die konnte selbst scheitern).
  const { data: rundeId, error: rundeFehlerDb } = await supabase.rpc("abholrunde_anlegen", {
    p_datum: eingabe.datum,
    p_fahrzeug: eingabe.fahrzeug,
    p_notiz: eingabe.notiz,
    p_kapazitaet: eingabe.kapazitaetKg,
    p_start_zeit: startZeit === "" ? null : startZeit,
    p_distanz_km: trip?.distanzKm ?? null,
    p_dauer_min: trip?.dauerMinuten ?? null,
    p_ab_erstem: trip ? minutenAbErstemStopp(trip) : null,
    p_geometrie: (trip?.geometrie as unknown as Json) ?? null,
    p_stopps: geordnet.map((s, position) => ({ nachbarbetrieb_id: s.nachbarbetriebId, reihenfolge: position, menge_geplant_kg: s.mengeKg as number, ankunft_geplant: ankunft(position) })),
  });
  if (rundeFehlerDb || !rundeId) return rundeFehlerDb ? dbFehler(rundeFehlerDb) : fehler("fehler.unbekannt");
  const runde = { id: rundeId };

  await protokoll(z.profil, "abholrunde.erstellt", runde.id, { datum: eingabe.datum, stopps: geordnet.length, optimiert: trip !== null });
  aktualisiere(formData);
  return ok(trip && ohneOrt.length === 0 ? "ok.abholrundeErstellt" : "ok.abholrundeOhneRoute");
}

/** Abholfenster eines Nachbarbetriebs (Ortszeit Almaty): beides oder nichts. Wie die Adresse nur von der Leitung (Zeilensicherheit von nachbarbetriebe). */
export async function nachbarZeitfensterSetzen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("create");
  if ("status" in z) return z.status;

  const id = text(formData, "id");
  const von = text(formData, "abhol_von");
  const bis = text(formData, "abhol_bis");
  if (!istUuid(id)) return fehler("fehler.eingabe");
  const abgelehnt = fensterFehler(von, bis);
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nachbarbetriebe")
    .update({ abhol_von: von === "" ? null : von, abhol_bis: bis === "" ? null : bis })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return dbFehler(error);
  // Die Zeilensicherheit laesst nur die Leitung schreiben; null Zeilen heisst: nicht gefunden oder nicht erlaubt.
  if (!data) return fehler("fehler.berechtigung");

  await protokoll(z.profil, "nachbarbetrieb.abholfenster", id, { von: von === "" ? null : von, bis: bis === "" ? null : bis });
  aktualisiere(formData);
  return ok("ok.zeitfensterGespeichert");
}

/** Verwirft eine noch geplante Runde. Wer planen darf (create), darf sie auch wieder verwerfen. */
export async function abholrundeVerwerfen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("create");
  if ("status" in z) return z.status;
  const id = text(formData, "id");
  if (!istUuid(id)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase.from("abholrunden").delete().eq("id", id).eq("status", "geplant").select("id").maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.abholrundeAbgeschlossen");
  await protokoll(z.profil, "abholrunde.verworfen", id);
  aktualisiere(formData);
  return ok("ok.abholrundeVerworfen");
}

// --- Ablauf ----------------------------------------------------------------------------------------------------------------------

export async function abholrundeStarten(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("update");
  if ("status" in z) return z.status;
  const id = text(formData, "id");
  if (!istUuid(id)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase.from("abholrunden").update({ status: "unterwegs" }).eq("id", id).eq("status", "geplant").select("id").maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.abholrundeAbgeschlossen");
  await protokoll(z.profil, "abholrunde.gestartet", id);
  aktualisiere(formData);
  return ok("ok.abholrundeGestartet");
}

/** Erfasst eine Abholung: die tatsaechliche Menge und seit wann der Nachbarbetrieb pflueckt (Minuten vor der Abholung, leer fuer unbekannt). */
export async function abholungErfassen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("update");
  if ("status" in z) return z.status;
  const stoppId = text(formData, "stopp_id");
  if (!istUuid(stoppId)) return fehler("fehler.eingabe");

  const vorRoh = text(formData, "pflueck_vor_minuten");
  const vorMinuten = vorRoh === "" ? null : zahl(formData, "pflueck_vor_minuten");
  const eingabe = { mengeKg: zahl(formData, "menge_ist_kg"), vorMinuten: vorRoh !== "" && vorMinuten === null ? Number.NaN : vorMinuten, bemerkung: text(formData, "bemerkung") };
  const abgelehnt = abholungFehler(eingabe);
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const geraet = geraetZeitpunkt(formData);
  // Ohne Geraetezeit kennt nur der Server die Zeit, aber der Pflueckbeginn braucht einen Bezugspunkt: dann bleibt er unbekannt.
  const pflueckbeginn = vorMinuten !== null && geraet !== null ? pflueckbeginnAus(geraet, vorMinuten) : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("abholstopps")
    .update({
      status: "abgeholt",
      menge_ist_kg: eingabe.mengeKg as number,
      pflueckbeginn,
      geraet_zeitpunkt: geraet,
      bemerkung: eingabe.bemerkung === "" ? null : eingabe.bemerkung,
    })
    .eq("id", stoppId)
    .eq("status", "geplant")
    .select("id, runde_id")
    .maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.abholrundeAbgeschlossen");
  await protokoll(z.profil, "abholrunde.abholung_erfasst", data.runde_id, { stopp: stoppId, mengeKg: eingabe.mengeKg, pflueckVorMinuten: vorMinuten });
  aktualisiere(formData);
  return ok("ok.abholungErfasst");
}

export async function stoppEntfaellt(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("update");
  if ("status" in z) return z.status;
  const stoppId = text(formData, "stopp_id");
  if (!istUuid(stoppId)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase.from("abholstopps").update({ status: "entfallen" }).eq("id", stoppId).eq("status", "geplant").select("id, runde_id").maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.abholrundeAbgeschlossen");
  await protokoll(z.profil, "abholrunde.stopp_entfallen", data.runde_id, { stopp: stoppId });
  aktualisiere(formData);
  return ok("ok.stoppEntfallen");
}

/** Meldet die Ankunft im Kuehlhaus und schliesst die Runde ab. Erst, wenn kein Stopp mehr offen ist (Datenbank: DA016). */
export async function abholrundeAbschliessen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("update");
  if ("status" in z) return z.status;
  const id = text(formData, "id");
  if (!istUuid(id)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("abholrunden")
    .update({ status: "abgeschlossen", ankunft_geraet_zeitpunkt: geraetZeitpunkt(formData) })
    .eq("id", id)
    .eq("status", "unterwegs")
    .select("id")
    .maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.abholrundeAbgeschlossen");
  await protokoll(z.profil, "abholrunde.abgeschlossen", id);
  aktualisiere(formData);
  return ok("ok.abholrundeAbgeschlossen");
}
