"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import {
  dbFehler,
  fehler,
  ok,
  zugriffsFehler,
  type AktionsStatus,
} from "@/lib/actions/status";
import type { Json } from "@/lib/database.types";
import { ledgerTyp, type LedgerTyp } from "@/lib/domain/finanzen";
import { text, zahl, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// Kostentraeger/Ledger (Anforderung 4.2, P0). Wie bei actions/lohn.ts:
// requirePermission() ist die erste Verteidigungslinie, RLS
// (kostentraeger_insert_buero / finance_ledger_entries_insert_buero, Migration
// 20260909000000) die zweite. Der Ledger-Eintrag selbst bleibt append-only -
// eine Korrektur ist nur eine Gegenbuchung mit umgekehrtem Typ, kein Update.

function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  return protokolliereBasis(profil, aktion, "finanzen", ressourceId, metadata);
}

// Neuer Kostentraeger. reihenblock_id, sorte_id und b2b_kunde_id sind einzeln
// optional (die Kostenstelle kann ein Reihenblock, ein Kunde oder beides
// sein) - mindestens ein fachlicher Bezug ist trotzdem Pflicht, sonst waere
// der Kostentraeger im Deckungsbeitrag nicht zuordenbar.
export async function kostentraegerAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("finanzen", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const reihenblockId = text(formData, "reihenblock_id") || null;
  const sorteId = text(formData, "sorte_id") || null;
  const b2bKundeId = text(formData, "b2b_kunde_id") || null;
  const erntetag = text(formData, "erntetag") || null;
  const bezeichnung = text(formData, "bezeichnung");

  if (!bezeichnung || (!reihenblockId && !sorteId && !b2bKundeId)) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kostentraeger")
    .insert({
      reihenblock_id: reihenblockId,
      sorte_id: sorteId,
      b2b_kunde_id: b2bKundeId,
      erntetag,
      bezeichnung,
    })
    .select("id, bezeichnung")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "finanzen.kostentraeger_angelegt", data.id, {
    bezeichnung: data.bezeichnung,
  });
  aktualisiere(formData);
  return ok("ok.kostentraeger", data.bezeichnung);
}

// Ledger-Buchung. Kein Update-Pfad: finance_ledger_entries ist seit dem
// initialen Schema append-only (trg_ledger_no_update/-delete) - eine falsche
// Buchung wird durch eine zweite, gegenlaeufige Buchung korrigiert, nicht
// durch das Aendern der ersten (Anforderung 4.1).
export async function ledgerBuchungErfassen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("finanzen", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const kostentraegerId = text(formData, "kostentraeger_id");
  // Anforderung 3.3: optionaler direkter Chargenbezug fuer die
  // Rueckverfolgung bis zur einzelnen Charge statt nur zum groeberen
  // Kostentraeger. Bewusst optional, nicht jede Buchung (z. B. allgemeine
  // Betriebskosten) laesst sich einer einzelnen Charge zuordnen.
  const chargeId = text(formData, "charge_id") || null;
  const typ = text(formData, "typ");
  const kategorie = text(formData, "kategorie");
  const betrag = zahl(formData, "betrag_tenge");
  const buchungsdatum = text(formData, "buchungsdatum");
  const beschreibung = text(formData, "beschreibung") || null;

  if (
    !kostentraegerId ||
    !(ledgerTyp as readonly string[]).includes(typ) ||
    !kategorie ||
    betrag === null || betrag <= 0 ||
    !buchungsdatum
  ) {
    return fehler("fehler.eingabe");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finance_ledger_entries")
    .insert({
      kostentraeger_id: kostentraegerId,
      charge_id: chargeId,
      typ: typ as LedgerTyp,
      kategorie,
      betrag_tenge: betrag,
      buchungsdatum,
      beschreibung,
    })
    .select("id, betrag_tenge")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "finanzen.buchung_erfasst", data.id, {
    typ,
    betrag_tenge: data.betrag_tenge,
  });
  aktualisiere(formData);
  return ok("ok.buchung", kategorie);
}
