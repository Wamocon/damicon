"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { anonymisierungFehler, nachrichtFehler } from "@/lib/domain/nachrichten";
import { istUuid } from "@/lib/utils";

// Nachricht zu einer Vorbestellung (WMCNL-1472). requirePermission() ist die
// erste Verteidigungslinie; RLS (vorbestellung_nachrichten_insert) die zweite:
// nur der Kunde zu seinen eigenen Vorbestellungen und das Buero. Autor und
// Zeitpunkt setzt die Datenbank, sie werden nicht mitgeschickt.

export async function nachrichtSenden(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("b2b_portal", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const vorbestellungId = text(formData, "vorbestellung_id");
  const inhalt = text(formData, "text");
  if (!istUuid(vorbestellungId)) return fehler("fehler.eingabe");
  const abgelehnt = nachrichtFehler(inhalt);
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vorbestellung_nachrichten")
    .insert({ vorbestellung_id: vorbestellungId, text: inhalt })
    .select("id")
    .single();
  if (error) return dbFehler(error);

  // Der Wortlaut steht im Verlauf selbst. Das Protokoll haelt nur fest, dass geschrieben wurde,
  // damit der Inhalt nicht an zwei Stellen liegt.
  await protokolliere(profil, "vorbestellung.nachricht", "b2b_portal", vorbestellungId, { nachricht: data.id });

  aktualisiere(formData);
  return ok("ok.nachricht");
}

// Datenschutz (15.10.2026): Nachrichten sind unveraenderlich und tragen Klarnamen. Auf Anweisung ersetzt die Administration Text und Namen
// durch einen Vermerk, der Verlauf (Rolle, Zeitpunkt) bleibt. Recht: compliance:manage (Administration und Geschaeftsfuehrung). Die Funktion
// vorbestellung_nachricht_anonymisieren() prueft dieselbe Rolle noch einmal und haelt Zeitpunkt, Person und Grund an der Zeile fest.
export async function nachrichtAnonymisieren(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("compliance", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "nachricht_id");
  const grund = text(formData, "grund");
  if (!istUuid(id)) return fehler("fehler.eingabe");
  const abgelehnt = anonymisierungFehler(grund);
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("vorbestellung_nachricht_anonymisieren", { p_id: id, p_grund: grund });
  if (error) return dbFehler(error);

  // Das Protokoll nennt die Nachricht, nicht den Grund: der steht an der Zeile.
  await protokolliere(profil, "vorbestellung.nachricht_anonymisiert", "compliance", id, {});

  aktualisiere(formData);
  return ok("ok.nachrichtAnonymisiert");
}
