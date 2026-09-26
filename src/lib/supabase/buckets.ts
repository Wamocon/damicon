// Preview (Schema public_preview) hat eigene Storage-Buckets, damit eine Preview-Umgebung
// keine Production-Belege liest oder loescht. Die Preview-Buckets legt
// scripts/preview-migrationen.mjs aus den Migrationen an (Id mit Endung -preview).
export type EigenerBucket = "belege" | "dokumente";

export function bucket(name: EigenerBucket): string {
  return process.env.SUPABASE_DB_SCHEMA === "public_preview" ? `${name}-preview` : name;
}
