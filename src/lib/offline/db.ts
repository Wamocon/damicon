import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// Anforderung 2.5, Phase 1: lokale Datenhaltung fuer Offline-Erfassung im
// Feld. Eine IndexedDB-Datenbank je Browser - ueberlebt Reload und
// Tab-Schliessen, nicht aber "Website-Daten loeschen" o. Ae. Das ist fuer ein
// Feldgeraet hinnehmbar: die Warteschlange ist eine Bruecke bis zum naechsten
// Netzkontakt, kein Datenarchiv - die Datenbank selbst bleibt die einzige
// Quelle der Wahrheit.

export type AktionTyp =
  | "aufgabe_annehmen"
  | "aufgabe_arbeit_starten"
  | "menge_melden"
  | "steige_erfassen"
  | "kuehlmessung_erfassen"
  | "arbeitszeit_erfassen"
  | "beleg_hochladen";

export type WarteschlangenStatus =
  | "wartend"
  | "wird_gesendet"
  | "gesendet"
  | "fehler"
  | "konflikt";

export interface WarteschlangenEintrag {
  /** Client-generierte UUID - zugleich der Idempotenzschluessel beim Sync. */
  aktionId: string;
  aktionTyp: AktionTyp;
  nutzlast: Record<string, unknown>;
  /** Nur bei aktionTyp "beleg_hochladen" - das Foto selbst, nativ als Blob. */
  datei?: Blob;
  /** Moment der Bestaetigung im Feld (analog mitGeraetZeitstempel). */
  geraetZeitpunkt: string;
  status: WarteschlangenStatus;
  versuche: number;
  letzterFehler: string | null;
  verarbeitetAm: string | null;
  naechsterVersuchAb: string | null;
  erstelltAm: string;
}

// Referenzdaten-Cache: genau auf das zugeschnitten, was die Feld-Formulare
// zum Rendern brauchen, wenn kein Netz da ist - keine allgemeine
// Offline-Kopie der Datenbank.
export interface ReferenzAufgabe {
  id: string;
  code: string;
  reihenblock: string;
  reihenblockId: string;
  sorte: string;
  status: string;
  zielmengeKg: number;
  istMengeKg: number;
  ausschussKg: number;
  pflueckerAnzahl: number;
  zwischengespeichertAm: string;
}

export interface ReferenzPfluecker {
  id: string;
  name: string;
  ausweis: string;
  zwischengespeichertAm: string;
}

// Ohne diesen Eintrag rendern die drei Nachweiskette-Formulare (Steige,
// Arbeitszeit, Kuehlmessung) gar nicht erst - sie sind ueber "kette.charge"
// gategated.
export interface ReferenzKette {
  aufgabeId: string;
  chargeId: string;
  chargeCode: string;
  zwischengespeichertAm: string;
}

interface DamiconOfflineDB extends DBSchema {
  warteschlange: {
    key: string;
    value: WarteschlangenEintrag;
    indexes: { "by-status": WarteschlangenStatus };
  };
  referenz_aufgaben: { key: string; value: ReferenzAufgabe };
  referenz_pfluecker: { key: string; value: ReferenzPfluecker };
  referenz_ketten: { key: string; value: ReferenzKette };
}

const DB_NAME = "damicon-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DamiconOfflineDB>> | null = null;

// Ein einziges openDB() je Tab reicht - IndexedDB ist ohnehin origin-weiter
// Speicher, ein zweiter Aufruf wuerde nur dieselbe Datenbank noch einmal
// oeffnen. Das Promise selbst wird gecacht, nicht die Verbindung, damit
// parallele fruehe Aufrufe (z. B. mehrere Komponenten beim ersten Rendern)
// nicht mehrfach openDB() ausloesen.
export function offlineDb(): Promise<IDBPDatabase<DamiconOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DamiconOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const warteschlange = db.createObjectStore("warteschlange", {
          keyPath: "aktionId",
        });
        warteschlange.createIndex("by-status", "status");
        db.createObjectStore("referenz_aufgaben", { keyPath: "id" });
        db.createObjectStore("referenz_pfluecker", { keyPath: "id" });
        db.createObjectStore("referenz_ketten", { keyPath: "aufgabeId" });
      },
    });
  }
  return dbPromise;
}
