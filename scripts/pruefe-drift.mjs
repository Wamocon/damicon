// Drift-Check: stimmen die Migrationsdateien auf main, der Verlauf von public und der Verlauf von
// public_preview miteinander ueberein? Nur lesend, es wird nichts geaendert.
//
// Warum: Beide Migrations-Workflows (datenbank-migration.yml, datenbank-migration-preview.yml) springen
// nur an, wenn eine Datei unter supabase/migrations/ im Repository landet. Eine Migration, die ohne
// Datei angewendet wurde (Dashboard, SQL-Editor, MCP "apply_migration"), sehen sie nie. Ebenso
// bleibt eine Datei unbemerkt, die auf main steht, aber in einem der beiden Schemas fehlt, etwa weil ein
// Lauf scheiterte. Dieser Check laeuft taeglich (datenbank-drift.yml) und meldet jede Abweichung.
//
// Befunde (alle Fehler, ausser wo "Hinweis" steht):
//   1. Version in public angewendet, aber keine Datei dazu auf main      (Migration ohne Datei)
//   2. Datei auf main, aber in public nicht angewendet                   (uebersprungen oder Lauf gescheitert)
//   3. Datei auf main, aber in public_preview nicht angewendet            (Nachholen ist nicht gelaufen)
//   4. Datei nach dem Anwenden in public_preview geaendert                (Pruefsumme weicht ab)
//   Hinweis: Versionen in public_preview ohne Datei auf main sind offene Pull Requests, kein Fehler.
//
// Bekannte Altlasten stehen mit Begruendung in supabase/drift-bekannt.txt (eine Version je Zeile,
// danach "# Grund") und werden nicht gemeldet.
//
// Aufruf: node scripts/pruefe-drift.mjs --linked | --local | --db-url <url>

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { abfrage, zielAus } from "./preview-cli.mjs";
import { pruefsumme } from "./preview-migrationen.mjs";

const ORDNER = "supabase/migrations";
const BEKANNT = "supabase/drift-bekannt.txt";
const NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;
const imCi = Boolean(process.env.GITHUB_ACTIONS);

/** Liest die bekannten Altlasten: "<14 Ziffern>  # Grund", Leerzeilen und Kommentarzeilen werden ignoriert. */
export function bekannteLesen(text) {
  return text
    .split(/\r?\n/)
    .map((z) => z.replace(/#.*$/, "").trim())
    .filter((z) => /^\d{14}$/.test(z));
}

/**
 * @param {{
 *   dateien: { version: string, datei: string, pruefsumme: string }[],
 *   public: string[],
 *   preview: { version: string, pruefsumme: string | null }[] | null,
 *   bekannt?: string[],
 * }} stand preview = null, wenn public_preview keinen Verlauf hat
 * @returns {{ fehler: string[], hinweise: string[] }}
 */
export function driftBefunde({ dateien, public: angewendet, preview, bekannt = [] }) {
  const fehler = [];
  const hinweise = [];
  const ausgenommen = new Set(bekannt);
  const dateiVersionen = new Set(dateien.map((d) => d.version));
  const inPublic = new Set(angewendet);

  for (const v of [...inPublic].sort()) {
    if (!dateiVersionen.has(v) && !ausgenommen.has(v)) {
      fehler.push(
        `Migration ${v} ist in public angewendet, aber es gibt keine Datei dazu auf main. Sie wurde ohne Migrationsdatei ` +
          `ausgefuehrt (Dashboard, SQL-Editor oder MCP). Datei nachreichen: supabase/migrations/${v}_<name>.sql mit dem ausgefuehrten SQL.`,
      );
    }
  }
  for (const d of dateien) {
    if (ausgenommen.has(d.version)) continue;
    if (!inPublic.has(d.version)) {
      fehler.push(
        `${d.datei} steht auf main, ist aber in public nicht angewendet (uebersprungen oder Lauf von "Datenbank-Migration" gescheitert). ` +
          `Kurz nach einem Merge kann das ein laufender Lauf sein: dann den Check wiederholen.`,
      );
    }
  }

  if (preview === null) {
    fehler.push("public_preview hat keinen Migrationsverlauf (supabase_migrations.preview_schema_migrations fehlt).");
  } else {
    const inPreview = new Map(preview.map((p) => [p.version, p.pruefsumme]));
    for (const d of dateien) {
      if (ausgenommen.has(d.version)) continue;
      if (!inPreview.has(d.version)) {
        fehler.push(`${d.datei} steht auf main, ist aber in public_preview nicht angewendet (Nachholen ist nicht gelaufen).`);
      } else if (inPreview.get(d.version) && inPreview.get(d.version) !== d.pruefsumme) {
        fehler.push(
          `${d.datei} wurde nach dem Anwenden in public_preview geaendert (Pruefsumme weicht ab). Die Aenderung gehoert in eine neue Migration.`,
        );
      }
    }
    const offene = [...inPreview.keys()].filter((v) => !dateiVersionen.has(v) && !ausgenommen.has(v)).sort();
    if (offene.length > 0) {
      hinweise.push(`public_preview enthaelt ${offene.length} Migration(en) ohne Datei auf main (offene Pull Requests): ${offene.join(", ")}`);
    }
  }
  return { fehler, hinweise };
}

function dateienLesen() {
  return readdirSync(ORDNER)
    .filter((d) => d.endsWith(".sql"))
    .sort()
    .map((datei) => {
      const m = NAME.exec(datei);
      if (!m) throw new Error(`Ungueltiger Dateiname: ${datei}`);
      return { version: m[1], datei, pruefsumme: pruefsumme(readFileSync(join(ORDNER, datei), "utf8")) };
    });
}

function main() {
  const ziel = zielAus(process.argv.slice(2));
  if (!ziel) {
    console.error("Aufruf: node scripts/pruefe-drift.mjs --linked|--local|--db-url <url>");
    process.exit(2);
  }
  try {
    const dateien = dateienLesen();
    let bekannt = [];
    try {
      bekannt = bekannteLesen(readFileSync(BEKANNT, "utf8"));
    } catch {
      // Datei ist optional
    }
    const angewendet = abfrage(ziel, "select version from supabase_migrations.schema_migrations order by version").map((z) => z.version);
    const vorhanden = abfrage(ziel, "select to_regclass('supabase_migrations.preview_schema_migrations') is not null as da")[0]?.da;
    const preview = vorhanden
      ? abfrage(ziel, "select version, to_jsonb(v) ->> 'pruefsumme' as pruefsumme from supabase_migrations.preview_schema_migrations v")
      : null;

    const { fehler, hinweise } = driftBefunde({ dateien, public: angewendet, preview, bekannt });
    for (const h of hinweise) console.log(`Hinweis: ${h}`);
    if (fehler.length === 0) {
      console.log(`Drift-Check: ${dateien.length} Migrationsdateien, public (${angewendet.length}) und public_preview stimmen ueberein.`);
      return;
    }
    console.error(`Drift-Check: ${fehler.length} Abweichung(en)`);
    for (const f of fehler) console.error(imCi ? `::error::${f}` : `  - ${f}`);
    process.exitCode = 1;
  } catch (e) {
    console.error(imCi ? `::error::${e.message.split("\n")[0]}\n${e.message}` : `FEHLER: ${e.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
