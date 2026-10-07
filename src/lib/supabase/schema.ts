// Datenbankschema der App: public (Production) oder public_preview (Preview-Umgebungen, Kopie von
// public in derselben Datenbank). Quelle ist SUPABASE_DB_SCHEMA; next.config.ts reicht den Wert beim
// Build als NEXT_PUBLIC_DB_SCHEMA an Server, Proxy und Browser weiter. Kein Code nennt ein Schema fest.
//
// Die Regel selbst (erlaubte Werte, Rueckfall auf public, Fehler bei allem anderen) steht nur in
// scripts/datenbank-schema.mjs, das auch die .mjs-Skripte nutzen. Vorher stand sie hier ein zweites
// Mal woertlich (Fund 74, 28.09.2026); die Richtung .mjs -> .ts geht, weil Node-Skripte ohne tsx
// kein .ts laden koennen.
import { DATENBANK_SCHEMA as SCHEMA_AUS_UMGEBUNG } from "../../../scripts/datenbank-schema.mjs";

export type DatenbankSchema = "public" | "public_preview";

export const DATENBANK_SCHEMA = SCHEMA_AUS_UMGEBUNG as DatenbankSchema;

// Fuer die Supabase-Clients. public_preview hat dieselbe Struktur wie public, deshalb gelten die
// generierten Typen von public auch dort.
export const DB_OPTION = { schema: DATENBANK_SCHEMA as "public" };
