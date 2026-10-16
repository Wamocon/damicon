"use server";

import { randomInt } from "node:crypto";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { darfRollenVergeben, kontoAnlageFehler, pruefeRollenwechsel, sperrFehler } from "@/lib/domain/rollen-zuweisung";
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

  // Nur aktive Administratoren zaehlen: ein gesperrter arbeitet nicht und ersetzt keinen (Migration 20261208090000).
  const { count: adminAnzahl, error: zaehlFehler } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .is("gesperrt_am", null);
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

// --- Konten anlegen und sperren (15.10.2026) ----------------------------------------------------------------------------------------------------
// Mitarbeitende bekommen ihr Konto von der Administration (Kunden ueber Einladungen). Das Konto entsteht ueber den Dienstschluessel des Servers im Auth-Dienst,
// mit der Rolle in app_metadata (nur der Dienstschluessel darf sie setzen). Das vorlaeufige Passwort sieht nur die Administration, nur in der Antwort dieser
// Aktion, und es steht in keinem Protokoll. Die Person aendert es bei der ersten Anmeldung (Seite Sicherheit, ein Hinweis erinnert daran).

/** 16 Zeichen in Vierergruppen, ohne verwechselbare Zeichen (kein 0/O, 1/l/I). */
function temporaeresPasswort(): string {
  const zeichen = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const gruppe = () => Array.from({ length: 4 }, () => zeichen[randomInt(zeichen.length)]).join("");
  return [gruppe(), gruppe(), gruppe(), gruppe()].join("-");
}

export async function kontoAnlegen(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("rollen", "assign");
  } catch (error) {
    return zugriffsFehler(error);
  }
  if (!darfRollenVergeben(profil.role)) return fehler("fehler.berechtigung");

  const e = { name: text(formData, "name"), email: text(formData, "email").toLowerCase(), rolle: text(formData, "rolle") };
  const abgelehnt = kontoAnlageFehler(e);
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const admin = createServiceRoleClient();
  // Ein Profil ohne Konto uebernaehme handle_new_auth_user() fuer dieselbe Adresse: lieber abbrechen, als einer fremden Profilzeile ein Konto zu geben.
  const { data: vorhanden, error: leseFehler } = await admin.from("profiles").select("id").eq("email", e.email).limit(1);
  if (leseFehler) return dbFehler(leseFehler);
  if (vorhanden && vorhanden.length > 0) return fehler("fehler.kontoVorhanden");

  const passwort = temporaeresPasswort();
  const { data: angelegt, error: authFehler } = await admin.auth.admin.createUser({
    email: e.email,
    password: passwort,
    email_confirm: true,
    app_metadata: { role: e.rolle },
    user_metadata: { full_name: e.name, passwort_vorlaeufig: true },
  });
  if (authFehler || !angelegt?.user) {
    console.error("[damicon] Konto anlegen fehlgeschlagen:", authFehler?.message);
    return fehler("fehler.kontoAnlegen");
  }

  await protokolliere(profil, "konto.angelegt", "rollen", angelegt.user.id, { konto: e.name, rolle: e.rolle });
  aktualisiere(formData);
  return ok("ok.kontoAngelegt", passwort);
}

/** Sperrt oder entsperrt ein Konto. Der Zustand gilt in der Datenbank sofort (keine Rolle mehr), dazu sperrt der Server die Anmeldung im Auth-Dienst. */
export async function kontoSperren(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("rollen", "assign");
  } catch (error) {
    return zugriffsFehler(error);
  }
  if (!darfRollenVergeben(profil.role)) return fehler("fehler.berechtigung");

  const zielId = text(formData, "profil_id");
  const sperren = text(formData, "aktion") === "sperren";
  const grund = text(formData, "grund");
  if (!istUuid(zielId)) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data: ziel, error: zielFehler } = await supabase.from("profiles").select("id, full_name, role, gesperrt_am").eq("id", zielId).maybeSingle();
  if (zielFehler) return dbFehler(zielFehler);
  if (!ziel) return fehler("fehler.berechtigung");
  const { count: aktiveAdmins, error: zaehlFehler } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").is("gesperrt_am", null);
  if (zaehlFehler) return dbFehler(zaehlFehler);

  const abgelehnt = sperrFehler({
    akteurProfilId: profil.id,
    zielProfilId: ziel.id,
    zielRolle: ziel.role as Role,
    zielGesperrt: ziel.gesperrt_am !== null,
    sperren,
    grund,
    aktiveAdmins: aktiveAdmins ?? 0,
  });
  if (abgelehnt) return fehler(`fehler.${abgelehnt}`);

  const { data: authUserId, error } = await supabase.rpc("konto_sperren", { p_profil: ziel.id, p_sperren: sperren, p_grund: sperren ? grund : null });
  if (error) return dbFehler(error);

  // Auth-Dienst: ein gesperrtes Konto bekommt kein neues Token mehr. Die Datenbank hat das Konto schon ohne Rolle gestellt; scheitert dieser Schritt,
  // bleibt die Sperre wirksam, und ein zweites Sperren holt ihn nach.
  const { error: banFehler } = await createServiceRoleClient().auth.admin.updateUserById(authUserId as string, { ban_duration: sperren ? "876000h" : "none" });
  await protokolliere(profil, sperren ? "konto.gesperrt" : "konto.entsperrt", "rollen", ziel.id, { konto: ziel.full_name, rolle: ziel.role, auth: banFehler ? "fehlgeschlagen" : "ok" });
  aktualisiere(formData);
  if (banFehler) {
    console.error("[damicon] Anmeldung im Auth-Dienst umstellen fehlgeschlagen:", banFehler.message);
    return fehler("fehler.kontoSperreAuth", ziel.full_name);
  }
  return ok(sperren ? "ok.kontoGesperrt" : "ok.kontoEntsperrt", ziel.full_name);
}
