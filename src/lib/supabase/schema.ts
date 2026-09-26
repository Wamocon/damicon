// Datenbankschema der App: public (Production) oder public_preview (Preview-Umgebungen, Kopie von
// public in derselben Datenbank). Quelle ist SUPABASE_DB_SCHEMA; next.config.ts reicht den Wert beim
// Build als NEXT_PUBLIC_DB_SCHEMA an Server, Proxy und Browser weiter. Node-Skripte (tsx) lesen
// SUPABASE_DB_SCHEMA direkt; die .mjs-Skripte nutzen scripts/datenbank-schema.mjs mit derselben Regel.
// Kein Code nennt ein Schema fest.
const ERLAUBT = ["public", "public_preview"] as const;
export type DatenbankSchema = (typeof ERLAUBT)[number];

const wert = process.env.NEXT_PUBLIC_DB_SCHEMA || process.env.SUPABASE_DB_SCHEMA || "public";
if (!(ERLAUBT as readonly string[]).includes(wert)) {
  throw new Error(`NEXT_PUBLIC_DB_SCHEMA/SUPABASE_DB_SCHEMA "${wert}" ist ungueltig, erlaubt: ${ERLAUBT.join(", ")}.`);
}

export const DATENBANK_SCHEMA = wert as DatenbankSchema;

// Fuer die Supabase-Clients. public_preview hat dieselbe Struktur wie public, deshalb gelten die
// generierten Typen von public auch dort.
export const DB_OPTION = { schema: DATENBANK_SCHEMA as "public" };
