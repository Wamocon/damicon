// Datenbankschema fuer die .mjs-Skripte, gleiche Regel wie src/lib/supabase/schema.ts:
// SUPABASE_DB_SCHEMA (oder NEXT_PUBLIC_DB_SCHEMA), sonst public.
const ERLAUBT = ["public", "public_preview"];

export const DATENBANK_SCHEMA = process.env.NEXT_PUBLIC_DB_SCHEMA || process.env.SUPABASE_DB_SCHEMA || "public";

if (!ERLAUBT.includes(DATENBANK_SCHEMA)) {
  throw new Error(`SUPABASE_DB_SCHEMA "${DATENBANK_SCHEMA}" ist ungueltig, erlaubt: ${ERLAUBT.join(", ")}.`);
}
