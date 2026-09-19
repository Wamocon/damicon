import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { dokumente as demoDokumente } from "@/lib/domain/betrieb-data";
import { einsAus } from "@/lib/data/util";
import { signiereDokumentPfade } from "@/lib/data/signierte-urls";

// Dokumentenverwaltung (Meilenstein B): Spritzprotokolle, ESUTD-Nachweise,
// Vertraege, Foerderdossiers und Zertifikate - jeweils mit Bezug auf
// Reihenblock oder Charge, damit der Rueckstandsnachweis je Charge auf
// Knopfdruck bereitsteht.

export type DokumentKategorie =
  | "spritzmittelprotokoll"
  | "esutd_nachweis"
  | "liefervertrag"
  | "foerderdossier"
  | "zertifikat"
  | "sonstiges";

export type DokumentStatus = "gueltig" | "prueflauf" | "abgelaufen";

export interface DokumentZeile {
  id: string;
  name: string;
  kategorie: DokumentKategorie;
  /** Anzeigewert: der gespeicherte Bezug, sonst der Code des Blocks oder der Charge. */
  bezug: string;
  /** Der tatsaechlich gespeicherte Bezug. Nur dieser gehoert in ein Bearbeiten-Formular,
   *  sonst wuerde der Anzeige-Fallback beim Speichern als Text in die Spalte geschrieben. */
  bezugRoh: string | null;
  stand: string | null;
  status: DokumentStatus;
  /** Signierte URL, falls eine Datei hinterlegt ist und der Link erzeugt werden konnte. */
  dateiUrl: string | null;
  /** Es gibt eine Datei im Speicher, unabhaengig davon, ob ein Link erzeugt werden konnte. */
  hatDatei: boolean;
}

export interface DokumentListe {
  quelle: Datenquelle;
  dokumente: DokumentZeile[];
}

// Die Beispieldaten fuehren die Kategorie als freien Text - fuer die
// Demo-Ansicht auf den Enum-Wert abbilden.
const kategorieAusText: Record<string, DokumentKategorie> = {
  Spritzmittelprotokoll: "spritzmittelprotokoll",
  "ESUTD-Nachweis": "esutd_nachweis",
  Liefervertrag: "liefervertrag",
  Foerderdossier: "foerderdossier",
  Zertifikat: "zertifikat",
};

function demoListe(quelle: DokumentListe["quelle"] = "demo"): DokumentListe {
  return {
    quelle,
    dokumente: demoDokumente.map((doc) => ({
      id: doc.id,
      name: doc.name,
      kategorie: kategorieAusText[doc.kategorie] ?? "sonstiges",
      bezug: doc.bezug,
      bezugRoh: doc.bezug,
      stand: doc.stand,
      status: doc.status,
      dateiUrl: null,
      hatDatei: false,
    })),
  };
}

export async function ladeDokumente(): Promise<DokumentListe> {
  if (!isSupabaseConfigured()) return demoListe();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dokumente")
    .select(
      `id, name, kategorie, bezug, stand, status, storage_path,
       reihenbloecke ( code ),
       chargen ( code )`,
    )
    .order("stand", { ascending: false, nullsFirst: false })
    .order("name");

  if (error || !data) return demoListe("fehler");

  const pfade = data
    .map((doc) => doc.storage_path)
    .filter((pfad): pfad is string => Boolean(pfad));

  const signiert = await signiereDokumentPfade(supabase, pfade);

  return {
    quelle: "db",
    dokumente: data.map((doc) => {
      const block = einsAus(doc.reihenbloecke);
      const charge = einsAus(doc.chargen);
      return {
        id: doc.id,
        name: doc.name,
        kategorie: doc.kategorie,
        bezug: doc.bezug ?? block?.code ?? charge?.code ?? "",
        bezugRoh: doc.bezug,
        stand: doc.stand,
        status: doc.status,
        dateiUrl: doc.storage_path ? (signiert.get(doc.storage_path) ?? null) : null,
        hatDatei: Boolean(doc.storage_path),
      };
    }),
  };
}
