import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";

// Jaehrliche Pflichtschulung mit Nachweis und Fristueberwachung (Anforderung
// 4.10). Eine Zeile je Person und Pflichtschulung kommt direkt aus der View
// public.schulungsteilnahmen_status - RLS (profiles_select_self,
// schulungsteilnahmen_select_own/-buero) entscheidet bereits serverseitig,
// ob eine Anmeldung nur die eigene Zeile oder die ganze Belegschaft sieht.
// Diese Datei filtert nicht zusaetzlich selbst nach Rolle.

export type PflichtschulungStatusWert = "nie" | "ueberfaellig" | "bald_faellig" | "aktuell";

export interface PflichtschulungZeile {
  profilId: string;
  vollerName: string;
  rolle: string;
  schulungsvideoId: string;
  titel: string;
  fristMonate: number;
  letzteTeilnahmeAm: string | null;
  faelligAm: string | null;
  status: PflichtschulungStatusWert;
}

export interface PflichtschulungenUebersicht {
  quelle: Datenquelle;
  zeilen: PflichtschulungZeile[];
}

const demoZeilen: PflichtschulungZeile[] = [
  {
    profilId: "demo-profil-1",
    vollerName: "Daniyar Omarov",
    rolle: "betriebsleitung",
    schulungsvideoId: "demo-video-sicherheit",
    titel: "Arbeitssicherheit auf der Plantage",
    fristMonate: 12,
    letzteTeilnahmeAm: "2025-09-15T09:00:00.000Z",
    faelligAm: "2026-09-15T09:00:00.000Z",
    status: "bald_faellig",
  },
  {
    profilId: "demo-profil-2",
    vollerName: "Ruslan Beisenov",
    rolle: "brigade",
    schulungsvideoId: "demo-video-sicherheit",
    titel: "Arbeitssicherheit auf der Plantage",
    fristMonate: 12,
    letzteTeilnahmeAm: null,
    faelligAm: null,
    status: "nie",
  },
];

function demoUebersicht(quelle: PflichtschulungenUebersicht["quelle"] = "demo"): PflichtschulungenUebersicht {
  return { quelle, zeilen: demoZeilen };
}

export async function ladePflichtschulungen(): Promise<PflichtschulungenUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schulungsteilnahmen_status")
    .select(
      "profil_id, full_name, role, schulungsvideo_id, titel, frist_monate, letzte_teilnahme_am, faellig_am, status",
    )
    .order("full_name")
    .order("titel");

  if (error || !data) return demoUebersicht("fehler");

  // Wie bei deckungsbeitrag_je_kostentraeger/-charge: der View-Typgenerator
  // kann die Spalten aus dem CROSS JOIN/GROUP BY nicht als NOT NULL erkennen,
  // obwohl die Konstruktion der View keine Zeile ohne Person/Schulung liefern
  // kann. Der Fallback ist reine Typsicherheit, kein erwarteter Fall.
  const zeilen: PflichtschulungZeile[] = data
    .filter((z) => z.profil_id !== null && z.schulungsvideo_id !== null)
    .map((z) => ({
      profilId: z.profil_id as string,
      vollerName: z.full_name as string,
      rolle: z.role as string,
      schulungsvideoId: z.schulungsvideo_id as string,
      titel: z.titel as string,
      fristMonate: Number(z.frist_monate),
      letzteTeilnahmeAm: z.letzte_teilnahme_am,
      faelligAm: z.faellig_am,
      status: z.status as PflichtschulungStatusWert,
    }));

  return { quelle: "db", zeilen };
}
