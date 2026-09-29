// Vergleicht die Struktur von public und public_preview. Beide Schemas muessen nach jeder
// Migration gleich sein; nur der Schemaname und die Preview-Namen gemeinsamer Objekte
// (Bucket-Ids, Cron-Jobs mit Endung -preview) duerfen sich unterscheiden.
//
// Aufruf: node scripts/preview-abgleich.mjs --linked | --local | --db-url <url> [--nur-bei-gleichem-stand]
//   --nur-bei-gleichem-stand: nur vergleichen, wenn public und public_preview dieselben Migrationen
//   angewendet haben. Preview laeuft public voraus (Migrationen offener Pull Requests); dann werden
//   nur die Unterschiede im Verlauf gemeldet, in der CI als ::warning::. Den strengen Vergleich ohne
//   diese Ausnahme macht die PR-Pipeline gegen die lokale Datenbank.
// CLI wie in preview-migrationen.mjs (SUPABASE_CLI oder "supabase" aus dem PATH).

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { abfrage, cli, zielAus } from "./preview-cli.mjs";
import { HUELLE, PREVIEW_ENDUNG, PREVIEW_SCHEMA } from "./preview-umschreiben.mjs";

const KOPF = /^-- Name: (.+); Type: (.+); Schema: (.*?); Owner: (.*)$/;
// 'belege-preview' -> 'belege', 'kpi-verlauf-taeglich-preview' -> 'kpi-verlauf-taeglich'
const PREVIEW_NAME = new RegExp(String.raw`([A-Za-z0-9_.]+(?:-[A-Za-z0-9_.]+)*)${PREVIEW_ENDUNG}'`, "g");

export function objekte(dump) {
  const karte = new Map();
  let schluessel = null;
  // auf beiden Seiten, denn public.rls_auto_enable nennt public_preview ausdruecklich
  const angleichen = (t) => t.replaceAll(PREVIEW_SCHEMA, "public").replace(PREVIEW_NAME, "$1'");
  for (const zeile of dump.split("\n")) {
    const kopf = KOPF.exec(zeile);
    if (kopf) {
      const [, name, typ] = kopf;
      const ohne = typ === "SCHEMA" || typ === "DEFAULT ACL" || ((typ === "COMMENT" || typ === "ACL") && name.startsWith("SCHEMA "));
      schluessel = ohne ? null : `${typ} ${angleichen(name)}`;
      if (schluessel && !karte.has(schluessel)) karte.set(schluessel, []);
      continue;
    }
    if (!schluessel || !zeile.trim() || zeile.startsWith("--") || /^(SET |SELECT pg_catalog\.set_config)/.test(zeile)) continue;
    // Fehlerhuelle der Preview-Triggerfunktionen (preview-umschreiben.mjs) gehoert nicht zum Vergleich
    if (zeile.trimEnd().endsWith(HUELLE)) continue;
    karte.get(schluessel).push(angleichen(zeile.trimEnd()));
  }
  return new Map([...karte].map(([k, v]) => [k, v.join("\n")]));
}

export function unterschiede(quelle, kopie) {
  const liste = [];
  for (const [k, v] of quelle) {
    if (!kopie.has(k)) liste.push({ art: "fehlt in public_preview", objekt: k });
    else if (kopie.get(k) !== v) {
      const a = v.split("\n");
      const b = kopie.get(k).split("\n");
      const i = a.findIndex((z, n) => z !== b[n]);
      liste.push({ art: "weicht ab", objekt: k, public: a[i] ?? "(Ende)", public_preview: b[i] ?? "(Ende)" });
    }
  }
  for (const k of kopie.keys()) if (!quelle.has(k)) liste.push({ art: "nur in public_preview", objekt: k });
  return liste;
}

/** Versionen, die nur in einem der beiden Verlaeufe stehen. */
export function verlaufsUnterschied(publicVersionen, previewVersionen) {
  const p = new Set(publicVersionen);
  const v = new Set(previewVersionen);
  return {
    nurPreview: [...v].filter((x) => !p.has(x)).sort(),
    nurPublic: [...p].filter((x) => !v.has(x)).sort(),
  };
}

/**
 * Fuer --nur-bei-gleichem-stand: vergleichen oder ueberspringen. Ein Dump laesst sich nicht auf die
 * gemeinsamen Versionen beschraenken, deshalb bleibt es beim Ueberspringen. Das war aber nur im Log
 * zu sehen und traf praktisch jeden Lauf, dauerhaft, sobald ein geschlossener Pull Request eine
 * Migration in public_preview hinterlassen hatte (Fund 67, 28.09.2026). Jetzt als Warnung.
 * @returns {{ vergleichen: boolean, zeilen: string[] }} zeilen: fertige Ausgabe
 */
export function abgleichEntscheiden(publicVersionen, previewVersionen, { imCi = false } = {}) {
  const d = verlaufsUnterschied(publicVersionen, previewVersionen);
  if (d.nurPreview.length === 0 && d.nurPublic.length === 0) return { vergleichen: true, zeilen: [] };
  const zeilen = [
    `${imCi ? "::warning::" : "WARNUNG: "}Strukturabgleich uebersprungen: public und ${PREVIEW_SCHEMA} haben einen anderen Migrationsstand ` +
      `(nur ${PREVIEW_SCHEMA}: ${d.nurPreview.join(", ") || "-"}; nur public: ${d.nurPublic.join(", ") || "-"}).`,
  ];
  if (d.nurPreview.length > 0) {
    zeilen.push(`  nur in ${PREVIEW_SCHEMA} (offene oder geschlossene Pull Requests): ${d.nurPreview.join(", ")}`);
    zeilen.push("  Bleibt das nach dem Merge oder Schliessen aller Pull Requests so: node scripts/preview-migrationen.mjs neu-aufbauen --linked");
  }
  if (d.nurPublic.length > 0) zeilen.push(`  nur in public (Preview holt beim naechsten Lauf nach): ${d.nurPublic.join(", ")}`);
  return { vergleichen: false, zeilen };
}

function main() {
  const args = process.argv.slice(2);
  const ziel = zielAus(args);
  if (!ziel) {
    console.error("Aufruf: node scripts/preview-abgleich.mjs --linked|--local|--db-url <url> [--nur-bei-gleichem-stand]");
    process.exit(2);
  }
  const ordner = mkdtempSync(join(tmpdir(), "preview-abgleich-"));
  try {
    if (args.includes("--nur-bei-gleichem-stand")) {
      const versionen = (tabelle) => abfrage(ziel, `select version from ${tabelle}`).map((z) => z.version);
      const entscheidung = abgleichEntscheiden(
        versionen("supabase_migrations.schema_migrations"),
        versionen("supabase_migrations.preview_schema_migrations"),
        { imCi: Boolean(process.env.GITHUB_ACTIONS) },
      );
      for (const zeile of entscheidung.zeilen) console.log(zeile);
      if (!entscheidung.vergleichen) return;
    }
    const lade = (schema) => {
      const datei = join(ordner, `${schema}.sql`);
      cli(["db", "dump", ...ziel, "-s", schema, "--keep-comments", "-f", datei]);
      return objekte(readFileSync(datei, "utf8"));
    };
    const quelle = lade("public");
    const kopie = lade(PREVIEW_SCHEMA);
    const liste = unterschiede(quelle, kopie);
    if (liste.length === 0) {
      console.log(`Strukturabgleich: public und ${PREVIEW_SCHEMA} sind gleich (${quelle.size} Objekte).`);
      return;
    }
    console.error(`Strukturabgleich: ${liste.length} Unterschied(e) zwischen public und ${PREVIEW_SCHEMA}`);
    for (const u of liste.slice(0, 40)) {
      console.error(`  - ${u.art}: ${u.objekt}`);
      if (u.art === "weicht ab") console.error(`      public:         ${u.public}\n      public_preview: ${u.public_preview}`);
    }
    if (liste.length > 40) console.error(`  ... und ${liste.length - 40} weitere`);
    process.exitCode = 1;
  } catch (e) {
    console.error(`FEHLER: ${e.message}`);
    process.exitCode = 1;
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
