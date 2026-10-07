import { DATENBANK_SCHEMA } from "@/lib/supabase/schema";

// Preview (Schema public_preview) hat eigene Storage-Buckets, damit eine Preview-Umgebung
// keine Production-Belege liest oder loescht. Die Preview-Buckets legt
// scripts/preview-migrationen.mjs aus den Migrationen an (Id mit Endung -preview).
export type EigenerBucket = "belege" | "dokumente";

export function bucket(name: EigenerBucket): string {
  return DATENBANK_SCHEMA === "public" ? name : `${name}-preview`;
}
