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

/** Gueltigkeit der signierten Datei-Links, wie in data/dokumente.ts. */
const SIGNATUR_SEKUNDEN = 60 * 60;

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

  // Angehaengte Nachweise als signierte Links ausgeben - dasselbe Muster wie
  // in data/dokumente.ts: ein Pfad allein nuetzt der Oberflaeche nichts, der
  // Bucket ist nicht oeffentlich lesbar.
  const pfade = data
    .flatMap((d) => (Array.isArray(d.dokumente) ? d.dokumente : []))
    .map((doc) => doc.storage_path)
    .filter((pfad): pfad is string => Boolean(pfad));

  const signiert = new Map<string, string>();
  if (pfade.length > 0) {
    const { data: urls } = await supabase.storage
      .from("dokumente")
      .createSignedUrls(pfade, SIGNATUR_SEKUNDEN);
    for (const eintrag of urls ?? []) {
      if (eintrag.path && eintrag.signedUrl) signiert.set(eintrag.path, eintrag.signedUrl);
    }
  }

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
        dateiUrl: doc.storage_path ? (signiert.get(doc.storage_path) ?? null) : null,
      })),
    })),
  };
}

/** Auswahlliste fuer das Dokumentenformular: an welches Dossier haengt der
 *  Nachweis? Leer ohne Datenbank - dann bietet das Formular nur "kein Dossier"
 *  an, so wie jede andere Auswahl im Demo-Modus. */
export async function ladeDossierOptionen(): Promise<{ id: string; bezeichnung: string }[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("foerderdossiers")
    .select("id, antragsnummer, titel, portal")
    .order("frist_am", { ascending: true, nullsFirst: false });

  if (error || !data) return [];

  return data.map((d) => ({
    id: d.id,
    bezeichnung: [d.antragsnummer, d.titel ?? d.portal].filter(Boolean).join(" - "),
  }));
}

/** Ueberfaellig: Frist verstrichen, ohne dass der Vorgang bereits abgeschlossen ist. */
export function istFristUeberfaellig(dossier: Pick<FoerderdossierZeile, "fristAm" | "status">): boolean {
  if (!dossier.fristAm) return false;
  const abgeschlossen: FoerderdossierStatus[] = ["bewilligt", "abgelehnt", "ausgezahlt"];
  if (abgeschlossen.includes(dossier.status)) return false;
  return dossier.fristAm < heuteIso();
}
