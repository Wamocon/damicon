// Legt EIN Administrationskonto an, zum Beispiel die zweite Person fuer die Freigabe in der Wissensbasis (Vier-Augen-Prinzip).
// Ausfuehren (von Hand, durch die Person, die die Cloud verwaltet):
//   node --env-file=.env.local scripts/admin-konto-anlegen.mjs --email name@firma.kz --name "Vorname Nachname"          (Trockenlauf)
//   node --env-file=.env.local scripts/admin-konto-anlegen.mjs --email name@firma.kz --name "Vorname Nachname" --ja     (anlegen)
// Optional: --passwort "..." (mindestens 12 Zeichen); ohne Angabe wird ein zufaelliges Passwort erzeugt und EINMAL ausgegeben.
//
// Was passiert (wie supabase/seed-auth.mjs): Ein Auth-Konto wird mit bestaetigter E-Mail angelegt, die Rolle steht in app_metadata (nur der
// Dienstschluessel darf sie setzen). Der Profil-Trigger handle_new_auth_user() vergibt beim Anlegen noch die niedrigste Rolle (kunde), weil der
// Auth-Dienst die app_metadata erst danach schreibt. Deshalb setzt das Skript die Rolle admin danach im Profil, in public UND in public_preview
// (die Vorschau liest ihr eigenes Profil; fehlt es dort, wird es angelegt). Zum Schluss liest es beide Profile und meldet, ob die Rolle
// angekommen ist. Es aendert nichts anderes, legt keine Demo-Konten an und gibt nie den Dienstschluessel aus.
// Das Passwort danach bitte beim ersten Anmelden aendern. Zugriff: nur der Dienstschluessel aus .env.local.

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const wert = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const email = (wert("--email") ?? "").trim().toLowerCase();
const name = (wert("--name") ?? "").trim();
const ja = args.includes("--ja");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Umgebung fehlt. Aufruf: node --env-file=.env.local scripts/admin-konto-anlegen.mjs --email ... --name ...");
  process.exit(2);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || name.length < 3) {
  console.error('Bitte --email und --name angeben, zum Beispiel: --email name@firma.kz --name "Vorname Nachname"');
  process.exit(2);
}

const passwort = wert("--passwort") ?? randomBytes(15).toString("base64url");
if (passwort.length < 12) {
  console.error("Das Passwort braucht mindestens 12 Zeichen.");
  process.exit(2);
}

const host = new URL(url).host;
const lokal = /^(127\.0\.0\.1|localhost)(:|$)/.test(host);
console.log(`Ziel: ${host} (${lokal ? "LOKALE Datenbank" : "gehostetes Projekt, gemeinsam fuer Production und Vorschau"})`);
console.log(`Konto: ${email}, Name: ${name}, Rolle: admin`);

const dienst = createClient(url, key, { auth: { persistSession: false } });
const schemaClient = (schema) => createClient(url, key, { auth: { persistSession: false }, db: { schema } });

async function profil(schema) {
  const r = await schemaClient(schema).from("profiles").select("email, role, full_name").ilike("email", email).limit(1);
  return r.error ? { fehler: r.error.message } : ((r.data ?? [])[0] ?? null);
}

// Gibt es das Konto schon?
let vorhanden = null;
for (let seite = 1; seite <= 20 && !vorhanden; seite++) {
  const { data, error } = await dienst.auth.admin.listUsers({ page: seite, perPage: 200 });
  if (error) {
    console.error(`Konten nicht lesbar: ${error.message}`);
    process.exit(1);
  }
  vorhanden = data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
  if (data.users.length < 200) break;
}
if (vorhanden) {
  console.error("Dieses Konto gibt es schon. Es wird nichts geaendert. Aktuelle Profile:");
  console.error("  public:         ", JSON.stringify(await profil("public")));
  console.error("  public_preview: ", JSON.stringify(await profil("public_preview")));
  process.exit(1);
}

if (!ja) {
  console.log("\nTrockenlauf: Es wurde nichts angelegt. Mit --ja anlegen.");
  process.exit(0);
}

const { data, error } = await dienst.auth.admin.createUser({
  email,
  password: passwort,
  email_confirm: true,
  app_metadata: { role: "admin" },
  user_metadata: { full_name: name },
});
if (error) {
  console.error(`Anlegen fehlgeschlagen: ${error.message}`);
  process.exit(1);
}
const benutzerId = data.user?.id;
console.log(`\nKonto angelegt (Kennung ${benutzerId}).`);

// Die Rolle im Profil setzen, je Schema. Der Trigger legt das Profil beim Anlegen des Kontos an, in public und (ueber den Zwilling) in public_preview.
async function setzeRolle(schema) {
  const db = schemaClient(schema);
  for (let i = 0; i < 5; i++) {
    const { data: zeilen, error: fehler } = await db.from("profiles").update({ role: "admin", full_name: name, email }).eq("auth_user_id", benutzerId).select("id");
    if (fehler) return `nicht erreichbar (${fehler.message})`;
    if ((zeilen ?? []).length > 0) return "gesetzt";
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Kein Profil vorhanden (der Zwilling hat es nicht angelegt): anlegen
  const { error: einfuegen } = await db.from("profiles").insert({ auth_user_id: benutzerId, full_name: name, email, role: "admin" });
  return einfuegen ? `nicht angelegt (${einfuegen.message})` : "angelegt";
}
const ergebnisPublic = await setzeRolle("public");
const ergebnisVorschau = await setzeRolle("public_preview");
const oeffentlich = await profil("public");
const vorschau = await profil("public_preview");
console.log(`Profil public (${ergebnisPublic}): ${JSON.stringify(oeffentlich)}`);
console.log(`Profil public_preview (${ergebnisVorschau}): ${JSON.stringify(vorschau)}`);

// Lokal ist public_preview meist nicht freigegeben ("Invalid schema"): das gilt dort nicht als Fehler.
const vorschauOk = vorschau?.role === "admin" || (lokal && /Invalid schema/i.test(vorschau?.fehler ?? ""));
const ok = oeffentlich?.role === "admin" && vorschauOk;
if (!ok) {
  console.error("\nACHTUNG: Mindestens ein Profil hat nicht die Rolle admin. Das Konto bitte nicht verwenden, bis das geklaert ist (Rolle im Profil der Vorschau pruefen).");
}
console.log("\n=== Zugangsdaten (nur jetzt sichtbar) ===");
console.log(`E-Mail:   ${email}`);
console.log(`Passwort: ${passwort}`);
console.log("Das Passwort beim ersten Anmelden aendern (Seite Sicherheit). Ein zweiter Faktor ist freiwillig und kann dort eingerichtet werden.");
process.exit(ok ? 0 : 1);
