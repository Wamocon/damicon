import type { Role } from "@/lib/rbac";
import { BUERO_ROLLEN } from "@/lib/wissen/rollen";

// Konstanten des Wissens-Uploads, ohne Node-Abhaengigkeit: die Oberflaeche (Client) und der Server
// (lib/wissen/hochladen.ts) lesen dieselben Werte.

/** Die fuenf Bereiche, die der Upload anbietet. `bereich` hat in der Datenbank weder CHECK noch Enum
 *  (geprueft in allen Migrationen), "risiko" braucht daher keine Migration. */
export const UPLOAD_BEREICHE = ["recht", "steuer", "compliance", "audit", "risiko"] as const;
export type UploadBereich = (typeof UPLOAD_BEREICHE)[number];

/** Welcher Wert in `wissen_chunks.bereich` landet. Die Oberflaeche behaelt ihre Bezeichnungen, aber "recht" schreibt
 *  "legal": so heisst der Bereich im vorhandenen Korpus (Ordner des Einlese-Skripts), und Uploads zum Recht stehen in
 *  derselben Gruppe. steuer, compliance, audit und risiko gibt es im Korpus bisher nicht bzw. gleich lautend (audit);
 *  sie werden unveraendert geschrieben. Die uebrigen Korpuswerte (amtlich, fachquellen, kernwissen, nk-214-viii)
 *  kommen nur vom Skript und sind im Upload nicht waehlbar. */
export const BEREICH_WERT: Record<UploadBereich, string> = {
  recht: "legal",
  steuer: "steuer",
  compliance: "compliance",
  audit: "audit",
  risiko: "risiko",
};

/** Umkehrung fuer die Anzeige: gespeichertes "legal" zeigt die Bezeichnung "Recht". Andere Werte bleiben, wie sie sind. */
export function bereichSchluessel(gespeichert: string): string {
  const treffer = UPLOAD_BEREICHE.find((b) => BEREICH_WERT[b] === gespeichert);
  return treffer ?? gespeichert;
}

/** Rollen, die der Upload anbietet: genau die Bueroeinheit der Wissensbasis. Die Wissenssuche ist ohnehin nur
 *  fuer sie freigeschaltet (darfWissenNutzen), weitere Rollen waeren wirkungslos. */
export const UPLOAD_ROLLEN: readonly Role[] = BUERO_ROLLEN;

export const UPLOAD_ENDUNGEN = ["pdf", "md", "txt"] as const;
export type UploadDateityp = (typeof UPLOAD_ENDUNGEN)[number];

export const MAX_DATEI_BYTES = 8 * 1024 * 1024; // gleich dem bodySizeLimit der Server Actions (next.config.ts)
export const MAX_TITEL = 200;
