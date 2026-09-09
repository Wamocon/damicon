import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { heuteIso } from "@/lib/data/util";
import {
  demoDossiers,
  type FoerderdossierStatus,
  type FoerderdossierZeile,
} from "@/lib/domain/foerdermittel";

// Foerdermitteldossier (Anforderung 4.12). foerderdossiers ist ein
// Container-Datenmodell aus 1Cati - eine echte Antragsvorlage fuer
// gosagro.kz/qoldau.kz gehoert nicht dazu (fachliche Festlegung, die eine
// Erfindung waere, siehe Migrationskopf 20260925000000). Umgesetzt ist der
// buchfuehrungsnahe Teil: Status/Frist pflegen, angehaengte
// Nachweisdokumente sehen.

export interface FoerdermittelUebersicht {
  quelle: Datenquelle;
  dossiers: FoerderdossierZeile[];
}

function demoUebersicht(quelle: FoerdermittelUebersicht["quelle"] = "demo"): FoerdermittelUebersicht {
  return { quelle, dossiers: demoDossiers };
}

export async function ladeFoerdermittel(): Promise<FoerdermittelUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("foerderdossiers")
    .select(
      "id, portal, antragsnummer, titel, status, eingereicht_am, frist_am, notizen, dokumente ( id, name, storage_path )",
    )
    .order("frist_am", { ascending: true, nullsFirst: false })
    .order("eingereicht_am", { ascending: false, nullsFirst: false });

  if (error || !data) return demoUebersicht("fehler");

  return {
    quelle: "db",
    dossiers: data.map((d) => ({
      id: d.id,
      portal: d.portal,
      antragsnummer: d.antragsnummer,
      titel: d.titel,
      status: d.status as FoerderdossierStatus,
      eingereichtAm: d.eingereicht_am,
      fristAm: d.frist_am,
      notizen: d.notizen,
      dokumente: (Array.isArray(d.dokumente) ? d.dokumente : []).map((doc) => ({
        id: doc.id,
        name: doc.name,
        storagePath: doc.storage_path,
      })),
    })),
  };
}

/** Ueberfaellig: Frist verstrichen, ohne dass der Vorgang bereits abgeschlossen ist. */
export function istFristUeberfaellig(dossier: Pick<FoerderdossierZeile, "fristAm" | "status">): boolean {
  if (!dossier.fristAm) return false;
  const abgeschlossen: FoerderdossierStatus[] = ["bewilligt", "abgelehnt", "ausgezahlt"];
  if (abgeschlossen.includes(dossier.status)) return false;
  return dossier.fristAm < heuteIso();
}
