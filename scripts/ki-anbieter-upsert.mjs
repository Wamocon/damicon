// Legt den KI-Anbieter (Claude) in der Tabelle ki_anbieter an oder aktualisiert
// ihn idempotent, mit verschluesseltem Schluessel, und setzt ihn als Standard.
//
// Warum ein Skript: die Verwaltung im Panel (Zahnrad) kann nur ANLEGEN (der
// interne Name ist eindeutig, ein zweiter Versuch scheitert) und kennt keinen
// Schluesselwechsel. Fuer dev/prod und fuer einen Schluesselwechsel ist das
// die verlaesslichere, wiederholbare Variante.
//
// Was wo liegt (wichtig fuer den Betrieb):
//   * Der API-Schluessel steht VERSCHLUESSELT (AES-256-GCM) in der Datenbank,
//     Tabelle ki_anbieter, Spalte api_key_chiffrat - je Supabase-Projekt.
//   * Der Schluessel dazu, KI_ANBIETER_SCHLUESSEL, ist eine Umgebungsvariable
//     der Anwendung (Vercel). Das Chiffrat ist an genau diesen Wert gebunden:
//     ein anderer Wert (z. B. lokal vs. Vercel) kann es nicht entschluesseln.
//     Ein lokal erzeugtes Chiffrat gehoert deshalb NIE in die gehostete
//     Datenbank - dieses Skript verschluesselt mit dem Wert aus der Umgebung,
//     die Sie ihm mitgeben.
//
// Aufruf (Werte nur ueber die Umgebung, nie als Argument - Argumente landen im
// Shell-Verlauf):
//   Lokal (Docker):
//     node --env-file=.env.local.docker scripts/ki-anbieter-upsert.mjs
//   Gehostet (Zielprojekt und Vercel-Wert muessen zusammenpassen):
//     NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     KI_ANBIETER_SCHLUESSEL=... ANTHROPIC_API_KEY=... \
//     node scripts/ki-anbieter-upsert.mjs --ja
//
// Optionen: --name (Standard claude-haiku), --anzeige-name, --modell,
// --basis-url. Erfordert Node 22.18 oder neuer (liest schluessel.ts direkt).

import { createClient } from "@supabase/supabase-js";
import { DATENBANK_SCHEMA } from "./datenbank-schema.mjs";
import { verschluessleApiKey } from "../src/lib/ai/schluessel.ts";

function option(name, standard) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : standard;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const dienstSchluessel = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.ANTHROPIC_API_KEY;

const name = option("name", "claude-haiku");
const anzeigeName = option("anzeige-name", "Claude (Haiku 4.5)");
const modell = option("modell", "claude-haiku-4-5");
// Ohne Schluss-Schraegstrich und ohne /v1: die Anwendung haengt /v1 selbst an.
const basisUrl = option("basis-url", "https://api.anthropic.com").replace(/\/+$/, "").replace(/\/v1$/, "");

function abbruch(text) {
  console.error(`Abbruch: ${text}`);
  process.exit(1);
}

if (!url || !dienstSchluessel) abbruch("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein.");
if (!apiKey) abbruch("ANTHROPIC_API_KEY muss in der Umgebung stehen (nicht als Argument).");
if (!process.env.KI_ANBIETER_SCHLUESSEL) abbruch("KI_ANBIETER_SCHLUESSEL fehlt - ohne ihn laesst sich der Schluessel nicht verschluesseln.");

const host = new URL(url).host;
const lokal = /^(127\.0\.0\.1|localhost)(:|$)/.test(host);
console.log(`Ziel: ${host} (${lokal ? "lokal" : "GEHOSTET"})  Anbieter: ${name}  Modell: ${modell}`);
if (!lokal && !process.argv.includes("--ja")) {
  abbruch("Das Ziel ist eine gehostete Datenbank. Zur Bestaetigung mit --ja erneut aufrufen.");
}

const db = createClient(url, dienstSchluessel, { auth: { persistSession: false }, db: { schema: DATENBANK_SCHEMA } });
const chiffrat = verschluessleApiKey(apiKey);

const { data: vorhanden, error: leseFehler } = await db.from("ki_anbieter").select("id").eq("name", name).maybeSingle();
if (leseFehler) abbruch(`Lesen fehlgeschlagen: ${leseFehler.message}`);

// Genau ein Standard ist per Teilindex erzwungen: erst den bisherigen abloesen.
const { error: abloeseFehler } = await db
  .from("ki_anbieter")
  .update({ ist_standard: false })
  .eq("ist_standard", true)
  .neq("name", name);
if (abloeseFehler) abbruch(`Standard ablösen fehlgeschlagen: ${abloeseFehler.message}`);

const werte = {
  anzeige_name: anzeigeName,
  typ: "anthropic",
  basis_url: basisUrl,
  modell,
  api_key_chiffrat: chiffrat,
  aktiv: true,
  ist_standard: true,
  aktualisiert_am: new Date().toISOString(),
};

const { error: schreibFehler } = vorhanden
  ? await db.from("ki_anbieter").update(werte).eq("id", vorhanden.id)
  : await db.from("ki_anbieter").insert({ name, ...werte });
if (schreibFehler) abbruch(`Schreiben fehlgeschlagen: ${schreibFehler.message}`);

console.log(vorhanden ? "Aktualisiert: Schluessel neu verschluesselt, als Standard gesetzt." : "Angelegt und als Standard gesetzt.");
