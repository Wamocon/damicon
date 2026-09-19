// Gemeinsames Anwenden der Migrationen fuer alle PGlite-gestuetzten Tests.
//
// Hintergrund: PGlite ist ein WASM-Build von Postgres und bringt nicht jede
// Erweiterung mit. pgvector fehlt - die Migration
// 20261031000000_ki_wissen_dokumente.sql (Wissensdokumente/RAG) laesst sich
// dort deshalb gar nicht anwenden. Eine solche Migration markiert sich selbst
// mit einer ersten Kommentarzeile "-- PGLITE-TEST: uebersprungen"; diese
// Funktion laesst sie aus, statt den ganzen Testlauf mit einem
// Postgres-Fehler abzubrechen. Fuer die uebersprungenen Migrationen ist
// npm run db:test (echtes Postgres) die massgebliche Pruefung - so steht es
// auch im Kopf der jeweiligen Migration.
//
// Eine Stelle statt acht: dieselbe Schleife stand in pglite-fast.mjs,
// einladungen.mjs und den sechs Abnahmetests. Ohne diese Zusammenfassung
// muesste jede neue Migration mit Erweiterungsbedarf in acht Dateien
// nachgezogen werden - beim ersten Versuch genau der Fehler, der sieben
// Testlaeufe rot gemacht hat.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const PGLITE_UEBERSPRINGEN_MARKER = "-- PGLITE-TEST: uebersprungen";

/**
 * Wendet alle Migrationen der Reihe nach auf die uebergebene PGlite-Instanz
 * an und meldet, wie viele angewendet bzw. uebersprungen wurden.
 */
export async function wendeMigrationenAn(db, migrationenVerzeichnis) {
  const dateien = readdirSync(migrationenVerzeichnis)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let uebersprungen = 0;
  for (const datei of dateien) {
    const sql = readFileSync(join(migrationenVerzeichnis, datei), "utf8");
    if (sql.startsWith(PGLITE_UEBERSPRINGEN_MARKER)) {
      uebersprungen++;
      continue;
    }
    await db.exec(sql);
  }

  return { gesamt: dateien.length, angewendet: dateien.length - uebersprungen, uebersprungen };
}

/** Einheitlicher Meldetext, damit jeder Testlauf gleich darueber berichtet. */
export function migrationenMeldung({ gesamt, angewendet, uebersprungen }) {
  const hinweis = uebersprungen
    ? `, ${uebersprungen} wegen fehlender PGlite-Erweiterung uebersprungen - siehe npm run db:test`
    : "";
  return `Migrationen angewendet (${angewendet} von ${gesamt} Dateien${hinweis})`;
}
