"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { darfRollenVergeben, pruefeRollenwechsel } from "@/lib/domain/rollen-zuweisung";
import { istUuid } from "@/lib/utils";
import type { Role } from "@/lib/rbac";

// Rollenzuweisung (WMCNL-1441). requirePermission("rollen", "assign") ist die
// erste Verteidigungslinie, darfRollenVergeben() die zweite (nur die
// Administration, wie in der Datenbank), die Trigger profil_rolle_schuetzen und
// profil_letzter_admin_schuetzen die dritte.

export async function rolleZuweisen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("rollen", "assign");
  } catch (error) {
    return zugriffsFehler(error);
  }
  if (!darfRollenVergeben(profil.role)) return fehler("fehler.berechtigung");

  const zielId = text(formData, "profil_id");
  const neueRolle = text(formData, "rolle");
  if (!istUuid(zielId)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data: ziel, error: zielFehler } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", zielId)
    .maybeSingle();
  if (zielFehler) return dbFehler(zielFehler);
  if (!ziel) return fehler("fehler.berechtigung");

  const { count: adminAnzahl, error: zaehlFehler } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (zaehlFehler) return dbFehler(zaehlFehler);

  const abgelehnt = pruefeRollenwechsel({
    akteurProfilId: profil.id,
    zielProfilId: ziel.id,
    alteRolle: ziel.role as Role,
    neueRolle,
    adminAnzahl: adminAnzahl ?? 0,
  });
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const { data, error } = await supabase
    .from("profiles")
    .update({ role: neueRolle as Role })
    .eq("id", ziel.id)
    .select("id, full_name")
    .maybeSingle();
  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.berechtigung");

  await protokolliere(profil, "rolle.geaendert", "rollen", data.id, {
    konto: data.full_name,
    von: ziel.role,
    nach: neueRolle,
  });

  aktualisiere(formData);
  return ok("ok.rolleGeaendert", data.full_name);
}
