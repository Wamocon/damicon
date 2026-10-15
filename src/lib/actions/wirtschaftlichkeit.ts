"use server";

import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { SessionProfile } from "@/lib/auth";
import type { Action } from "@/lib/rbac";
import { dbFehler, fehler, ok, type AktionsStatus } from "@/lib/actions/status";
import { mitRecht } from "@/lib/actions/zugriff";
import { text, zahl, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { ladeSchwundHerleitung, ladeWirtschaftlichkeit } from "@/lib/data/wirtschaftlichkeit";
import { tagInZone } from "@/lib/domain/tageszeit";
import {
  ANNAHME_SCHLUESSEL,
  BEZEICHNUNG_MAX_ZEICHEN,
  MODELL_POSTEN,
  annahmenFehler,
  baueSnapshot,
  istFehler,
  modellPosten,
  monatAusEingabe,
  postenFehler,
} from "@/lib/domain/wirtschaftlichkeit-erfassung";
import { VERMARKTETE_MENGE_KG } from "@/lib/domain/wirtschaftlichkeit";
import type { Json } from "@/lib/database.types";
import { istUuid } from "@/lib/utils";

// Erfassung der Investitionsrechnung (WMCNL-2470). requirePermission("wirtschaftlichkeit", ...) ist die erste
// Verteidigungslinie, die Zeilensicherheit der vier Tabellen (Migration 20261207090000) die zweite: dort stehen die
// Rechte (admin, ceo ueber admin, buchhaltung), die Wertebereiche und die Unveraenderlichkeit der Staende ein zweites Mal.

function zugriff(aktion: Action) {
  return mitRecht("wirtschaftlichkeit", aktion);
}

const protokoll = (profil: SessionProfile, aktion: string, id: string | null, metadata: Record<string, Json> = {}) =>
  protokolliere(profil, aktion, "wirtschaftlichkeit", id, metadata);

/** Eine optionale Zahl: leer ist null, ein Text, der keine Zahl ist, ist ungueltig (undefined). */
function optionaleZahl(formData: FormData, feld: string): number | null | undefined {
  if (text(formData, feld) === "") return null;
  const wert = zahl(formData, feld);
  return wert === null ? undefined : wert;
}

// --- Posten ------------------------------------------------------------------------------------------------------------------

function postenEingabe(formData: FormData) {
  return {
    art: text(formData, "art"),
    kategorie: text(formData, "kategorie"),
    bezeichnung: text(formData, "bezeichnung"),
    betrag: zahl(formData, "betrag"),
    waehrung: text(formData, "waehrung"),
    datum: text(formData, "datum"),
    notiz: text(formData, "notiz"),
    herkunft: text(formData, "herkunft") === "belegt" ? ("belegt" as const) : ("geschaetzt" as const),
  };
}

/** Legt einen Posten an (ohne "id") oder aendert ihn (mit "id"). */
export async function postenSpeichern(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const id = text(formData, "id");
  const z = await zugriff(id ? "update" : "create");
  if ("status" in z) return z.status;
  if (id && !istUuid(id)) return fehler("fehler.eingabe");

  const e = postenEingabe(formData);
  const abgelehnt = postenFehler(e);
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const zeile = {
    art: e.art,
    kategorie: e.kategorie,
    bezeichnung: e.bezeichnung,
    betrag: e.betrag as number,
    waehrung: e.waehrung,
    datum: e.datum,
    herkunft: e.herkunft,
    notiz: e.notiz === "" ? null : e.notiz,
  };
  const supabase = await createClient();

  if (id) {
    const { data, error } = await supabase.from("wirtschaftlichkeit_posten").update(zeile).eq("id", id).select("id").maybeSingle();
    if (error) return dbFehler(error);
    if (!data) return fehler("fehler.wiNichtGefunden");
    await protokoll(z.profil, "wirtschaftlichkeit.posten_geaendert", id, { art: e.art, betrag: e.betrag, waehrung: e.waehrung });
    aktualisiere(formData);
    return ok("ok.wiPostenGespeichert");
  }

  const { data, error } = await supabase
    .from("wirtschaftlichkeit_posten")
    .insert({ ...zeile, erfasst_von_profil_id: z.profil.id })
    .select("id")
    .single();
  if (error) return dbFehler(error);
  await protokoll(z.profil, "wirtschaftlichkeit.posten_angelegt", data.id, { art: e.art, betrag: e.betrag, waehrung: e.waehrung });
  aktualisiere(formData);
  return ok("ok.wiPostenGespeichert");
}

export async function postenEntfernen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("delete");
  if ("status" in z) return z.status;
  const id = text(formData, "id");
  if (!istUuid(id)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase.from("wirtschaftlichkeit_posten").delete().eq("id", id).select("id, art, betrag").maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.wiNichtGefunden");
  await protokoll(z.profil, "wirtschaftlichkeit.posten_entfernt", id, { art: data.art, betrag: Number(data.betrag) });
  aktualisiere(formData);
  return ok("ok.wiPostenEntfernt");
}

// --- Ist-Werte -----------------------------------------------------------------------------------------------------------------

export async function istErfassen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("create");
  if ("status" in z) return z.status;

  const e = {
    monat: text(formData, "monat"),
    kategorie: text(formData, "kategorie"),
    betrag: zahl(formData, "betrag"),
    waehrung: text(formData, "waehrung"),
    notiz: text(formData, "notiz"),
  };
  const abgelehnt = istFehler(e);
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wirtschaftlichkeit_ist")
    .insert({
      monat: monatAusEingabe(e.monat) as string,
      kategorie: e.kategorie,
      betrag: e.betrag as number,
      waehrung: e.waehrung,
      notiz: e.notiz === "" ? null : e.notiz,
      erfasst_von_profil_id: z.profil.id,
    })
    .select("id")
    .single();
  // Ein Wert je Monat, Kategorie und Waehrung (Unique-Index): ein zweiter Klick oder ein zweiter Eintrag trifft ihn.
  if (error?.code === "23505") return fehler("fehler.wiIstSchonDa");
  if (error) return dbFehler(error);
  await protokoll(z.profil, "wirtschaftlichkeit.ist_erfasst", data.id, { monat: e.monat, kategorie: e.kategorie, betrag: e.betrag, waehrung: e.waehrung });
  aktualisiere(formData);
  return ok("ok.wiIstErfasst");
}

export async function istEntfernen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("delete");
  if ("status" in z) return z.status;
  const id = text(formData, "id");
  if (!istUuid(id)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase.from("wirtschaftlichkeit_ist").delete().eq("id", id).select("id, monat, kategorie").maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.wiNichtGefunden");
  await protokoll(z.profil, "wirtschaftlichkeit.ist_entfernt", id, { monat: data.monat, kategorie: data.kategorie });
  aktualisiere(formData);
  return ok("ok.wiIstEntfernt");
}

// --- Annahmen ------------------------------------------------------------------------------------------------------------------

export async function annahmenSetzen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("update");
  if ("status" in z) return z.status;

  const vollkosten = optionaleZahl(formData, "vollkosten");
  const menge = optionaleZahl(formData, "menge");
  const von = optionaleZahl(formData, "wochen_von");
  const bis = optionaleZahl(formData, "wochen_bis");
  if (vollkosten === undefined || menge === undefined || von === undefined || bis === undefined) return fehler("fehler.wiAnnahme");

  const e = {
    kalkulationszinsProzent: zahl(formData, "zins"),
    kurseurTenge: zahl(formData, "kurs_eur"),
    kursRubTenge: zahl(formData, "kurs_rub"),
    kursStichtag: text(formData, "kurs_stichtag"),
    vollkostenVorherTenge: vollkosten,
    vermarkteteMengeKg: menge,
    wochenVon: von,
    wochenBis: bis,
    echtbetriebMonat: text(formData, "echtbetrieb"),
  };
  const abgelehnt = annahmenFehler(e);
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const herkunft: Record<string, string> = {};
  for (const schluessel of ANNAHME_SCHLUESSEL) herkunft[schluessel] = text(formData, `herkunft_${schluessel}`) === "belegt" ? "belegt" : "geschaetzt";
  const quelle = text(formData, "kurs_quelle");
  if (quelle.length > 200) return fehler("fehler.wiAnnahme");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wirtschaftlichkeit_annahmen")
    .update({
      kalkulationszins: (e.kalkulationszinsProzent as number) / 100,
      kurs_eur_tenge: e.kurseurTenge as number,
      kurs_rub_tenge: e.kursRubTenge as number,
      kurs_stichtag: e.kursStichtag,
      kurs_quelle: quelle === "" ? null : quelle,
      vollkosten_vorher_tenge: vollkosten,
      vermarktete_menge_kg: menge,
      nutzenbeginn_wochen_von: von,
      nutzenbeginn_wochen_bis: bis,
      echtbetrieb_beginn: e.echtbetriebMonat === "" ? null : monatAusEingabe(e.echtbetriebMonat),
      herkunft,
    })
    .eq("id", 1)
    .select("id")
    .maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.wiNichtGefunden");
  await protokoll(z.profil, "wirtschaftlichkeit.annahmen_geaendert", null, { zinsProzent: e.kalkulationszinsProzent, kursEurTenge: e.kurseurTenge, kursStichtag: e.kursStichtag });
  aktualisiere(formData);
  return ok("ok.wiAnnahmenGespeichert");
}

// --- Staende -------------------------------------------------------------------------------------------------------------------

/**
 * Haelt den heutigen Stand fest: Posten, Ist-Werte, Annahmen (mit Kurs und Stichtag) und Ergebnis als Standbild. Das
 * Standbild baut der Server aus den Daten der Datenbank, nicht aus dem Formular: ein Stand zeigt, was gerechnet wurde.
 */
export async function standFesthalten(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("create");
  if ("status" in z) return z.status;

  const name = text(formData, "stand_name");
  if (name.length < 1 || name.length > BEZEICHNUNG_MAX_ZEICHEN) return fehler("fehler.wiStandName");

  const daten = await ladeWirtschaftlichkeit();
  // Ein Stand ist unveraenderlich (nur select und insert). Fehlte beim Lesen eine Abfrage, rechnete die Seite mit Modellwerten und der Stand hielte falsche
  // Kurse und Posten fuer immer fest (Pruefung PR #156, 15.10.2026). Dann lieber nichts festhalten.
  if (daten.quelle === "datenbank" && daten.lesefehler) return fehler("fehler.wiStandLesefehler");
  if (daten.quelle !== "datenbank" || daten.posten.length === 0) return fehler("fehler.wiStandLeer");

  const snapshot = baueSnapshot(new Date().toISOString(), daten.posten, daten.ist, daten.annahmen, daten.menge);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wirtschaftlichkeit_staende")
    .insert({ bezeichnung: name, snapshot: snapshot as unknown as Json, erstellt_von_profil_id: z.profil.id })
    .select("id")
    .single();
  if (error) return dbFehler(error);
  await protokoll(z.profil, "wirtschaftlichkeit.stand_festgehalten", data.id, { bezeichnung: name, posten: daten.posten.length });
  aktualisiere(formData);
  return ok("ok.wiStandFestgehalten");
}

// --- Modellwerte als Startpunkt -------------------------------------------------------------------------------------------------

/**
 * Uebernimmt die Werte der Kennzahlenliste vom 23.09.2026 als erste Posten, damit die Seite nicht leer beginnt: CAPEX und
 * OPEX als belegt, der rueckgerechnete Jahresnutzen als geschaetzt. Nur auf einer leeren Posten-Liste: wer schon erfasst
 * hat, soll nichts doppelt bekommen. Die geschaetzte Jahresmenge der bisherigen Rechnung kommt mit, solange keine gesetzt ist.
 */
export async function modellwerteUebernehmen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("create");
  if ("status" in z) return z.status;

  const supabase = await createClient();
  const t = await getTranslations("wirtschaftlichkeitErfassung.modell");
  const posten = modellPosten(
    {
      investition: { bezeichnung: t("investition.bezeichnung"), kategorie: t("investition.kategorie") },
      betrieb: { bezeichnung: t("betrieb.bezeichnung"), kategorie: t("betrieb.kategorie") },
      nutzen: { bezeichnung: t("nutzen.bezeichnung"), kategorie: "sonstiges" },
    },
    tagInZone(new Date()),
  );
  // Zaehlen und Einfuegen in einer Funktion unter einer Sperre: ein Doppelklick fuegt die Modellwerte nicht zweimal ein (0 = es gab schon Posten).
  const { data: eingefuegt, error } = await supabase.rpc("wirtschaftlichkeit_posten_uebernehmen", {
    p_posten: posten.map((p) => ({
      art: p.art,
      kategorie: p.kategorie,
      bezeichnung: p.bezeichnung,
      betrag: p.betrag,
      waehrung: p.waehrung,
      datum: p.datum,
      herkunft: p.herkunft,
      notiz: t("notiz"),
    })),
    p_profil: z.profil.id,
  });
  if (error) return dbFehler(error);
  if (!eingefuegt) return fehler("fehler.wiModellNichtLeer");

  // Die Menge der bisherigen Rechnung, nur wo noch keine gesetzt ist; "menge" bleibt geschaetzt.
  await supabase.from("wirtschaftlichkeit_annahmen").update({ vermarktete_menge_kg: VERMARKTETE_MENGE_KG }).eq("id", 1).is("vermarktete_menge_kg", null);

  await protokoll(z.profil, "wirtschaftlichkeit.modellwerte_uebernommen", null, { posten: MODELL_POSTEN.length });
  aktualisiere(formData);
  return ok("ok.wiModellUebernommen");
}

/**
 * Den aus den Betriebsdaten hergeleiteten Schwund-Nutzen als Posten uebernehmen (Migration 20261208140000). Der Server rechnet selbst, aus der Baseline, den
 * Chargen und den Annahmen; eine Zahl aus dem Formular gibt es nicht. Ein Posten dieser Herleitung wird fortgeschrieben (gleiche Bezeichnung), nicht verdoppelt.
 */
export async function schwundNutzenUebernehmen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  const z = await zugriff("create");
  if ("status" in z) return z.status;

  const daten = await ladeWirtschaftlichkeit();
  if (daten.quelle !== "datenbank" || daten.lesefehler) return fehler("fehler.wiSchwundOffen");
  const herleitung = await ladeSchwundHerleitung(daten.annahmen);
  if (!herleitung || herleitung.ergebnis.stand !== "ok") return fehler("fehler.wiSchwundOffen");
  const { nutzenEurJahr, vermiedeneKg } = herleitung.ergebnis;
  const e = herleitung.eingabe;

  const t = await getTranslations("wirtschaftlichkeitErfassung.schwund");
  const bezeichnung = t("bezeichnung");
  const notiz = t("notiz", {
    vorher: e.verlustVorherProzent ?? 0,
    jetzt: e.verlustJetztProzent ?? 0,
    menge: Math.round(e.gesamtMengeKg ?? 0),
    kosten: e.kostenJeKgTenge ?? 0,
    kg: vermiedeneKg,
  });
  const zeile = { art: "nutzen", kategorie: "schwund", bezeichnung, betrag: nutzenEurJahr, waehrung: "EUR", datum: tagInZone(new Date()), herkunft: "geschaetzt", notiz };

  const supabase = await createClient();
  const { data: vorhanden, error: leseFehler } = await supabase
    .from("wirtschaftlichkeit_posten")
    .select("id")
    .eq("art", "nutzen")
    .eq("kategorie", "schwund")
    .eq("bezeichnung", bezeichnung)
    .limit(1)
    .maybeSingle();
  if (leseFehler) return dbFehler(leseFehler);

  const { data, error } = vorhanden
    ? await supabase.from("wirtschaftlichkeit_posten").update(zeile).eq("id", vorhanden.id).select("id").single()
    : await supabase.from("wirtschaftlichkeit_posten").insert({ ...zeile, erfasst_von_profil_id: z.profil.id }).select("id").single();
  if (error) return dbFehler(error);

  await protokoll(z.profil, "wirtschaftlichkeit.schwund_uebernommen", data.id, { betrag: nutzenEurJahr, vermiedene_kg: vermiedeneKg, ersetzt: Boolean(vorhanden) });
  aktualisiere(formData);
  return ok("ok.wiSchwundUebernommen");
}
