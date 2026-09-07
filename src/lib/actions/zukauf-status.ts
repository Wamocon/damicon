import type { PostgrestError } from "@supabase/supabase-js";
import type { ZukaufBefund } from "@/lib/import/zukauf-parser";

// Eigener, zu AktionsStatus paralleler Rueckgabewert nur fuer den
// Zukauf-Import (WMCNL-1453) - bewusst KEINE Erweiterung von
// src/lib/actions/status.ts. AktionsStatus traegt genau eine Meldung und
// wird von rund einem Dutzend bestehender Formulare unveraendert
// weiterverwendet; eine mehrzeilige Befundliste (Zeile/Spalte/Stufe je
// Pruefergebnis) passt in diese Form nicht hinein. Ein zweiter, eigener Typ
// hier haelt jene Aufrufer vollstaendig unangetastet, statt AktionsStatus um
// ein optionales Feld zu erweitern, das nur ein einziger Aufrufer braucht.
export interface ZukaufImportStatus {
  stand: "leer" | "ok" | "fehler";
  /** Alle Befunde der letzten Pruefung (fehler + warnung + hinweis), auch bei
   *  einem erfolgreichen Import - Warnungen/Hinweise bleiben sichtbar. */
  befunde: ZukaufBefund[];
  /** Anzahl tatsaechlich geschriebener Positionen. */
  uebernommen: number;
  /** Uebersetzungsschluessel unterhalb "aktionen", wie bei AktionsStatus. */
  meldung?: string;
  wert?: string;
}

export const leerZukaufImport: ZukaufImportStatus = {
  stand: "leer",
  befunde: [],
  uebernommen: 0,
};

export function zukaufImportOk(
  befunde: ZukaufBefund[],
  uebernommen: number,
  meldung: string,
  wert?: string,
): ZukaufImportStatus {
  return { stand: "ok", befunde, uebernommen, meldung, wert };
}

export function zukaufImportFehler(
  meldung: string,
  befunde: ZukaufBefund[] = [],
  uebernommen = 0,
  wert?: string,
): ZukaufImportStatus {
  return { stand: "fehler", befunde, uebernommen, meldung, wert };
}

// Gespiegelt zu dbFehler() aus status.ts - bewusst dupliziert statt von dort
// importiert, damit diese Datei keine Abhaengigkeit zurueck auf den
// gemeinsamen Typ braucht und beide Dateien unabhaengig aenderbar bleiben.
export function zukaufDbFehler(
  error: PostgrestError | { code?: string; message: string },
  befunde: ZukaufBefund[] = [],
  uebernommen = 0,
): ZukaufImportStatus {
  console.error("[damicon] Zukauf-Import: Schreibvorgang fehlgeschlagen:", error.message);
  switch (error.code) {
    case "42501":
      return zukaufImportFehler("fehler.berechtigung", befunde, uebernommen);
    case "23505":
      return zukaufImportFehler("fehler.doppelt", befunde, uebernommen);
    case "23503":
      return zukaufImportFehler("fehler.bezug", befunde, uebernommen);
    case "23514":
    case "P0001":
      return zukaufImportFehler("fehler.regel", befunde, uebernommen);
    default:
      return zukaufImportFehler("fehler.unbekannt", befunde, uebernommen);
  }
}

export function zukaufZugriffsFehler(error: unknown): ZukaufImportStatus {
  const nachricht = error instanceof Error ? error.message : String(error);
  if (nachricht === "nicht-angemeldet") return zukaufImportFehler("fehler.angemeldet");
  if (nachricht === "keine-berechtigung") return zukaufImportFehler("fehler.berechtigung");
  console.error("[damicon] Zukauf-Import fehlgeschlagen:", nachricht);
  return zukaufImportFehler("fehler.unbekannt");
}
