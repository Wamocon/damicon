import type { Role } from "@/lib/rbac";
import { BUERO_ROLLEN } from "@/lib/wissen/rollen";

// Konstanten des Wissens-Uploads, ohne Node-Abhaengigkeit: die Oberflaeche (Client) und der Server
// (lib/wissen/hochladen.ts) lesen dieselben Werte.

/** Die fuenf Bereiche, die der Upload anbietet. `bereich` hat in der Datenbank weder CHECK noch Enum
 *  (geprueft in allen Migrationen), "risiko" braucht daher keine Migration. */
export const UPLOAD_BEREICHE = ["recht", "steuer", "compliance", "audit", "risiko"] as const;
export type UploadBereich = (typeof UPLOAD_BEREICHE)[number];

/** Rollen, die der Upload anbietet: genau die Bueroeinheit der Wissensbasis. Die Wissenssuche ist ohnehin nur
 *  fuer sie freigeschaltet (darfWissenNutzen), weitere Rollen waeren wirkungslos. */
export const UPLOAD_ROLLEN: readonly Role[] = BUERO_ROLLEN;

export const UPLOAD_ENDUNGEN = ["pdf", "md", "txt"] as const;
export type UploadDateityp = (typeof UPLOAD_ENDUNGEN)[number];

export const MAX_DATEI_BYTES = 8 * 1024 * 1024; // gleich dem bodySizeLimit der Server Actions (next.config.ts)
export const MAX_TITEL = 200;
