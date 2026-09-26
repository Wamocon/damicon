// =============================================================================
// Damicon - Bereitschaftspruefung fuer den manuellen Test des Kundenzugangs
// =============================================================================
// Ausfuehren:  npm run test:bereit
//
// Prueft in einem Lauf, ob der Einladungsweg (Anforderung E.20) gegen die
// verbundene Datenbank benutzbar ist: Tabelle, Funktion, Rechte, Testdaten.
// Aendert nichts - reines Lesen.
//
// Sinn: Nach `npx supabase db push` soll eine einzige Ausgabe sagen, ob der
// manuelle Test starten kann oder was noch fehlt, statt dass man es an einer
// unverstaendlichen Fehlermeldung in der Oberflaeche merkt.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { DATENBANK_SCHEMA } from "./datenbank-schema.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Fehlende Env-Variablen. Aufruf: npm run test:bereit");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: DATENBANK_SCHEMA } });

let fehlt = 0;
function pruefe(name, ok, hinweis = "") {
  console.log(`${ok ? "OK    " : "FEHLT "} ${name}${hinweis ? `  - ${hinweis}` : ""}`);
  if (!ok) fehlt += 1;
}

console.log(`Datenbank: ${url}\n`);

// --- 1. Tabelle -------------------------------------------------------------
const tabelle = await admin.from("kundeneinladungen").select("id").limit(1);
pruefe(
  "Tabelle public.kundeneinladungen",
  !tabelle.error,
  tabelle.error ? tabelle.error.message : `${tabelle.data?.length ?? 0} Zeile(n) gelesen`,
);

// --- 2. Transaktionsfunktion ------------------------------------------------
// Aufruf mit einem Digest, den es garantiert nicht gibt: die Funktion muss
// null liefern, nicht scheitern. Das beweist, dass sie existiert und laeuft,
// ohne irgendetwas zu veraendern.
const rpc = await admin.rpc("einladung_abschliessen", {
  p_code_digest: "0".repeat(64),
  p_email: "bereitschaftspruefung@damicon.invalid",
  p_auth_user_id: "00000000-0000-0000-0000-000000000000",
});
pruefe(
  "Funktion public.einladung_abschliessen",
  !rpc.error && rpc.data === null,
  rpc.error ? rpc.error.message : "liefert null fuer einen unbekannten Code (richtig)",
);

// --- 3. B2B-Kunden fuer die Auswahl ----------------------------------------
const { data: kunden, error: kundenFehler } = await admin
  .from("b2b_kunden")
  .select("id, name")
  .order("name");
pruefe(
  "B2B-Kunden fuer das Auswahlfeld",
  !kundenFehler && (kunden?.length ?? 0) > 0,
  kundenFehler ? kundenFehler.message : `${kunden?.length} vorhanden`,
);
for (const kunde of kunden ?? []) console.log(`         - ${kunde.name}`);

// --- 4. Belegte Adressen ----------------------------------------------------
// Die Vorabpruefung in einladungErstellen() weist eine Adresse ab, zu der
// bereits ein Profil existiert. Wer das nicht weiss, haelt die Meldung fuer
// einen Fehler.
const { data: profile } = await admin.from("profiles").select("email").order("email");
console.log("\nBereits vergebene Adressen (fuer eine Einladung NICHT verwendbar):");
for (const p of profile ?? []) console.log(`         - ${p.email}`);

// --- 5. Offene Einladungen aus frueheren Laeufen ----------------------------
if (!tabelle.error) {
  const { data: offen } = await admin
    .from("kundeneinladungen")
    .select("email, status, gueltig_bis")
    .eq("status", "offen");
  if ((offen?.length ?? 0) > 0) {
    console.log("\nOffene Einladungen aus frueheren Laeufen:");
    for (const e of offen ?? []) {
      console.log(`         - ${e.email}  gueltig bis ${e.gueltig_bis}`);
    }
  }
}

// --- 6. Demo-Zugangsliste ---------------------------------------------------
pruefe(
  "NEXT_PUBLIC_DEMO_LOGINS zeigt die Zugangsliste an der Anmeldung",
  process.env.NEXT_PUBLIC_DEMO_LOGINS === "true" || process.env.NODE_ENV !== "production",
  process.env.NEXT_PUBLIC_DEMO_LOGINS ?? "nicht gesetzt (lokal trotzdem sichtbar)",
);

console.log("");
if (fehlt > 0) {
  console.error(
    `${fehlt} Voraussetzung(en) fehlen. Wahrscheinlich ist die Migration noch nicht eingespielt:\n` +
      `  npx supabase db push\n`,
  );
  process.exit(1);
}
console.log("Alles bereit. Der manuelle Test kann starten:");
console.log("  1. http://localhost:3000/de/dashboard/buero/rollen   (als leitung@damicon.demo)");
console.log("  2. Einladung ausstellen, Code notieren");
console.log("  3. Abmelden, dann http://localhost:3000/de/einladung");
