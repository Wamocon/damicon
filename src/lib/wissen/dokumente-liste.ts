// Liste der Wissensdokumente fuer die Verwaltung im KI-Panel: Textstellen (wissen_chunks) werden zu
// Dokumenten zusammengefasst. Hochgeladene und per Skript eingelesene Dokumente erscheinen gemeinsam;
// die Skript-Dokumente gruppieren nach quelle_id (wie sie das Einlese-Skript vergibt), notfalls nach Pfad.
// Reine Funktion, ohne Datenbank, damit sie testbar bleibt.

import { istUploadZeile, UPLOAD_QUELLE } from "@/lib/wissen/upload-quelle";

/** Die Spalten, die die Liste liest (PostgREST-Schreibweise, Aliase fuer extra->>...). Eine Stelle fuer Action und Test. */
export const LISTE_SPALTEN =
  "id, quelle_id, pfad, titel, bereich, rollen, eingelesen_am, upload_quelle:extra->>quelle, hochgeladen_von:extra->>hochgeladen_von_name";

/** Nur die leichten Spalten: Text und Vektoren werden fuer die Liste nie gelesen. */
export interface WissenListeZeile {
  id: string;
  quelle_id: string | null;
  pfad: string | null;
  titel: string | null;
  bereich: string | null;
  rollen: string[] | null;
  eingelesen_am: string | null;
  /** extra->>quelle: "upload" bei hochgeladenen Zeilen. */
  upload_quelle: string | null;
  /** extra->>hochgeladen_von_name */
  hochgeladen_von: string | null;
}

export interface WissenDokumentZeile {
  schluessel: string;
  titel: string;
  bereich: string;
  rollen: string[];
  /** ISO-Datum oder -Zeitpunkt aus eingelesen_am; null, wenn die Quelle keines nennt. */
  datum: string | null;
  hochgeladenVon: string | null;
  chunks: number;
  herkunft: "upload" | "skript";
  /** Nur ein Dokument, dessen Zeilen ALLE aus dem Upload stammen (extra.quelle = "upload" und quelle_id "upload:..."),
   *  zeigt einen Loeschen-Knopf. Skript-Dokumente nie. Der Server prueft dasselbe noch einmal selbst. */
  loeschbar: boolean;
}


export function gruppiereWissenDokumente(zeilen: readonly WissenListeZeile[]): WissenDokumentZeile[] {
  const gruppen = new Map<string, WissenDokumentZeile>();
  for (const z of zeilen) {
    const schluessel = z.quelle_id ?? z.pfad ?? z.id;
    const vorhanden = gruppen.get(schluessel);
    if (!vorhanden) {
      gruppen.set(schluessel, {
        schluessel,
        titel: z.titel ?? z.pfad ?? schluessel,
        bereich: z.bereich ?? "",
        rollen: [...(z.rollen ?? [])],
        datum: z.eingelesen_am,
        hochgeladenVon: z.hochgeladen_von,
        chunks: 1,
        herkunft: z.upload_quelle === UPLOAD_QUELLE ? "upload" : "skript",
        loeschbar: istUploadZeile(z),
      });
      continue;
    }
    vorhanden.chunks += 1;
    vorhanden.loeschbar &&= istUploadZeile(z);
    for (const r of z.rollen ?? []) if (!vorhanden.rollen.includes(r)) vorhanden.rollen.push(r);
    if (z.eingelesen_am && (!vorhanden.datum || z.eingelesen_am > vorhanden.datum)) vorhanden.datum = z.eingelesen_am;
    if (!vorhanden.hochgeladenVon && z.hochgeladen_von) vorhanden.hochgeladenVon = z.hochgeladen_von;
  }
  // Neueste zuerst; Dokumente ohne Datum ans Ende, dort nach Bereich und Titel.
  return [...gruppen.values()].sort((a, b) => {
    if (a.datum && b.datum && a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;
    if (!a.datum !== !b.datum) return a.datum ? -1 : 1;
    return a.bereich.localeCompare(b.bereich) || a.titel.localeCompare(b.titel);
  });
}
