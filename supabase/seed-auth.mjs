// =============================================================================
// Malina - Demo-Benutzer anlegen (Meilenstein B)
// =============================================================================
// Ausfuehren:  npm run db:seed-auth
//              (bzw. node --env-file=.env.local supabase/seed-auth.mjs)
//
// Legt je Malina-Rolle genau einen Auth-Benutzer an. Das Profil entsteht ueber
// den Trigger public.handle_new_auth_user() aus der Migration
// 20260905120000_auth_und_schreibrechte.sql - Rolle und Name kommen aus den
// user_metadata.
//
// Idempotent: vorhandene Benutzer werden aktualisiert, nicht dupliziert.
// Reine Demo-Zugaenge fuer die lokale Instanz - kein Produktivgeheimnis.
// =============================================================================

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Fehlende Env-Variablen. Aufruf: node --env-file=.env.local supabase/seed-auth.mjs",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

export const demoPasswort = "MalinaDemo2026!";

const demoBenutzer = [
  { email: "admin@malina.demo", role: "admin", full_name: "Aigerim Serikbaj" },
  { email: "leitung@malina.demo", role: "betriebsleitung", full_name: "Daniyar Omarov" },
  { email: "buchhaltung@malina.demo", role: "buchhaltung", full_name: "Saltanat Nurlan" },
  { email: "brigade@malina.demo", role: "brigade", full_name: "Ruslan Beisenov" },
  // Rolle picker (Anforderung 7.1, neu): sieht ausschliesslich die eigene
  // Leistung. Der Name ist bewusst der des verknuepften Pfluecker-Stammsatzes
  // (siehe unten), nicht frei erfunden - beides muss zusammenpassen.
  { email: "pfluecker@malina.demo", role: "picker", full_name: "D. Sarsenbaj" },
  { email: "erzeuger@malina.demo", role: "erzeuger", full_name: "Rashid Baitulin" },
  { email: "kunde@malina.demo", role: "kunde", full_name: "Almaty Fresh Market" },
];

// Nach `supabase db reset` startet der Auth-Dienst neu und bekommt eine neue
// Container-IP. Das Gateway zeigt dann kurz noch auf die alte und antwortet mit
// 502. Ohne diese Wiederholung scheitert das Anlegen der Demo-Zugaenge still -
// und der Anmeldeversuch schlaegt spaeter unerklaerlich fehl.
async function mitWiederholung(name, aufgabe, versuche = 6) {
  for (let versuch = 1; versuch <= versuche; versuch += 1) {
    try {
      return await aufgabe();
    } catch (error) {
      const erreichbar = !/fetch|502|upstream|ECONNREFUSED/i.test(
        error?.message ?? "",
      );
      if (erreichbar || versuch === versuche) throw error;
      console.log(`  ${name}: Auth-Dienst noch nicht bereit, Versuch ${versuch} von ${versuche} ...`);
      await new Promise((fertig) => setTimeout(fertig, 2000));
    }
  }
  throw new Error(`${name}: Auth-Dienst nicht erreichbar.`);
}

async function findeBenutzer(email) {
  // listUsers paginiert; bei sechs Demo-Konten reicht die erste Seite.
  const { data, error } = await mitWiederholung("Benutzerliste", async () => {
    const antwort = await admin.auth.admin.listUsers({ perPage: 200 });
    if (antwort.error) throw antwort.error;
    return antwort;
  });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
}

async function main() {
  let angelegt = 0;
  let aktualisiert = 0;

  for (const eintrag of demoBenutzer) {
    const vorhanden = await findeBenutzer(eintrag.email);
    let benutzerId = vorhanden?.id;

    if (vorhanden) {
      const { error } = await admin.auth.admin.updateUserById(vorhanden.id, {
        password: demoPasswort,
        email_confirm: true,
        // Die Rolle steht in app_metadata: nur der service_role-Schluessel darf
        // sie setzen. user_metadata waere vom Anmeldenden frei waehlbar.
        app_metadata: { role: eintrag.role },
        user_metadata: { full_name: eintrag.full_name },
      });
      if (error) throw error;
      aktualisiert += 1;
      console.log(`AKTUALISIERT  ${eintrag.email.padEnd(26)} ${eintrag.role}`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: eintrag.email,
        password: demoPasswort,
        email_confirm: true,
        app_metadata: { role: eintrag.role },
        user_metadata: { full_name: eintrag.full_name },
      });
      if (error) throw error;
      benutzerId = data.user.id;
      angelegt += 1;
      console.log(`ANGELEGT      ${eintrag.email.padEnd(26)} ${eintrag.role}`);
    }

    // Der Profil-Trigger vergibt beim INSERT in auth.users die niedrigste Rolle,
    // weil GoTrue die app_metadata erst danach schreibt. Die vorgesehene Rolle
    // wird deshalb hier gesetzt - ueber den service_role-Schluessel, den nur der
    // Server hat.
    const { error: profilFehler } = await admin
      .from("profiles")
      .update({ role: eintrag.role, full_name: eintrag.full_name, email: eintrag.email })
      .eq("auth_user_id", benutzerId);
    if (profilFehler) throw profilFehler;
  }

  // Die Brigade-Rolle bekommt eine echte Brigadenzuordnung, damit die
  // Feld-Ansichten gefiltert werden koennen.
  const { data: brigade } = await admin
    .from("brigaden")
    .select("id")
    .order("name")
    .limit(1)
    .maybeSingle();

  if (brigade) {
    await admin
      .from("profiles")
      .update({ brigade_id: brigade.id })
      .eq("email", "brigade@malina.demo");
  }

  // Die Kunde-Rolle bekommt eine echte B2B-Kunde-Zuordnung (WMCNL-1455) -
  // ohne sie sieht "kunde@malina.demo" keine einzige Reklamation, weil RLS
  // ausschliesslich ueber profiles.b2b_kunde_id filtert. Ueber den
  // service_role-Schluessel gesetzt, weil eine Anmeldung sich diese
  // Zuordnung nicht selbst geben darf (siehe trg_profil_b2b_kunde).
  const { data: b2bKunde } = await admin
    .from("b2b_kunden")
    .select("id")
    .eq("name", "Almaty Fresh Market")
    .maybeSingle();

  if (b2bKunde) {
    await admin
      .from("profiles")
      .update({ b2b_kunde_id: b2bKunde.id })
      .eq("email", "kunde@malina.demo");
  }

  // Die picker-Rolle bekommt eine echte Pfluecker-Zuordnung (Anforderung
  // 7.1) - ohne sie sieht "pfluecker@malina.demo" keine einzige eigene
  // Abrechnung, weil RLS ausschliesslich ueber profiles.pfluecker_id filtert
  // (Migration 20260909010000). Ausweis MAL-0417 traegt bereits eine
  // vorseedete Abrechnung (Status "entwurf", siehe Abschnitt "Lohn" in
  // supabase/seed.sql) - direkt nach db:reset sichtbar, ohne dass die
  // Buchhaltung vorher "Periode berechnen" auslösen muss.
  const { data: pfluecker } = await admin
    .from("pfluecker")
    .select("id")
    .eq("ausweis", "MAL-0417")
    .maybeSingle();

  if (pfluecker) {
    await admin
      .from("profiles")
      .update({ pfluecker_id: pfluecker.id })
      .eq("email", "pfluecker@malina.demo");
  }

  console.log(
    `\n${angelegt} Benutzer angelegt, ${aktualisiert} aktualisiert. Passwort fuer alle: ${demoPasswort}`,
  );
}

main().catch((error) => {
  console.error("Seed fehlgeschlagen:", error.message ?? error);
  process.exit(1);
});
