// Liste der Wissensdokumente fuer die Verwaltung (Administration, Seite Wissensbasis): Textstellen (wissen_chunks) werden zu
// Dokumenten zusammengefasst. Hochgeladene und per Skript eingelesene Dokumente erscheinen gemeinsam;
// die Skript-Dokumente gruppieren nach quelle_id (wie sie das Einlese-Skript vergibt), notfalls nach Pfad.
// Reine Funktion, ohne Datenbank, damit sie testbar bleibt.

import { istPruefstatus, nutzungFuer, type Nutzung, type Pruefstatus } from "@/lib/wissen/quellenart";
import { istUploadZeile, UPLOAD_QUELLE } from "@/lib/wissen/upload-quelle";

/** Die Spalten, die die Liste liest (PostgREST-Schreibweise, Aliase fuer extra->>...). Eine Stelle fuer Action und Test. */
export const LISTE_SPALTEN =
  "id, quelle_id, pfad, titel, bereich, rollen, eingelesen_am, autoritaetsstufe, quellenart, pruefstatus, pruefen_bis, url, " +
  "upload_quelle:extra->>quelle, hochgeladen_von:extra->>hochgeladen_von_name, hochgeladen_von_id:extra->>hochgeladen_von";

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
  // Typisierung und Pruefung (Migration 20261124000000); fehlen bei Zeilen aus aelteren Quellen.
  autoritaetsstufe?: number | null;
  quellenart?: string | null;
  pruefstatus?: string | null;
  pruefen_bis?: string | null;
  url?: string | null;
  /** extra->>hochgeladen_von: profiles.id der hochladenden Person. */
  hochgeladen_von_id?: string | null;
}

export interface WissenDokumentZeile {
  schluessel: string;
  titel: string;
  bereich: string;
  rollen: string[];
  /** ISO-Datum oder -Zeitpunkt aus eingelesen_am; null, wenn die Quelle keines nennt. */
  datum: string | null;
  hochgeladenVon: string | null;
  hochgeladenVonId: string | null;
  chunks: number;
  herkunft: "upload" | "skript";
  /** Nur ein Dokument, dessen Zeilen ALLE aus dem Upload stammen (extra.quelle = "upload" und quelle_id "upload:..."),
   *  zeigt einen Loeschen-Knopf. Skript-Dokumente nie. Der Server prueft dasselbe noch einmal selbst. */
  loeschbar: boolean;
  quellenart: string | null;
  stufe: number | null;
  /** Wofuer die Quelle in ihrem Bereich taugt (quellenart.ts). */
  nutzung: Nutzung;
  pruefstatus: Pruefstatus;
  /** Wiedervorlage (JJJJ-MM-TT) oder null. */
  pruefenBis: string | null;
  /** Freigegeben, aber die Wiedervorlage ist erreicht: wird nicht mehr gefunden, bis eine zweite Person verlaengert. */
  abgelaufen: boolean;
  url: string | null;
}

const RANG: Record<Pruefstatus, number> = { ungeprueft: 0, abgelehnt: 1, freigegeben: 2 };

/** `heute` (JJJJ-MM-TT) ist ein Parameter, damit Tests ohne Uhr auskommen. */
export function gruppiereWissenDokumente(zeilen: readonly WissenListeZeile[], heute = new Date().toISOString().slice(0, 10)): WissenDokumentZeile[] {
  const gruppen = new Map<string, WissenDokumentZeile>();
  for (const z of zeilen) {
    const schluessel = z.quelle_id ?? z.pfad ?? z.id;
    const status: Pruefstatus = istPruefstatus(z.pruefstatus) ? z.pruefstatus : "freigegeben";
    const vorhanden = gruppen.get(schluessel);
    if (!vorhanden) {
      gruppen.set(schluessel, {
        schluessel,
        titel: z.titel ?? z.pfad ?? schluessel,
        bereich: z.bereich ?? "",
        rollen: [...(z.rollen ?? [])],
        datum: z.eingelesen_am,
        hochgeladenVon: z.hochgeladen_von,
        hochgeladenVonId: z.hochgeladen_von_id ?? null,
        chunks: 1,
        herkunft: z.upload_quelle === UPLOAD_QUELLE ? "upload" : "skript",
        loeschbar: istUploadZeile(z),
        quellenart: z.quellenart ?? null,
        stufe: z.autoritaetsstufe ?? null,
        nutzung: nutzungFuer(z.bereich ?? "", z.quellenart),
        pruefstatus: status,
        pruefenBis: z.pruefen_bis ?? null,
        abgelaufen: false,
        url: z.url ?? null,
      });
      continue;
    }
    vorhanden.chunks += 1;
    vorhanden.loeschbar &&= istUploadZeile(z);
    for (const r of z.rollen ?? []) if (!vorhanden.rollen.includes(r)) vorhanden.rollen.push(r);
    if (z.eingelesen_am && (!vorhanden.datum || z.eingelesen_am > vorhanden.datum)) vorhanden.datum = z.eingelesen_am;
    if (!vorhanden.hochgeladenVon && z.hochgeladen_von) vorhanden.hochgeladenVon = z.hochgeladen_von;
    if (!vorhanden.hochgeladenVonId && z.hochgeladen_von_id) vorhanden.hochgeladenVonId = z.hochgeladen_von_id;
    // Ein Dokument gilt so streng wie seine strengste Zeile (ungeprueft vor abgelehnt vor freigegeben).
    if (RANG[status] < RANG[vorhanden.pruefstatus]) vorhanden.pruefstatus = status;
    if (z.pruefen_bis && (!vorhanden.pruefenBis || z.pruefen_bis < vorhanden.pruefenBis)) vorhanden.pruefenBis = z.pruefen_bis;
  }
  const liste = [...gruppen.values()];
  for (const d of liste) d.abgelaufen = d.pruefstatus === "freigegeben" && d.pruefenBis !== null && d.pruefenBis < heute;
  // Was auf eine Entscheidung wartet, steht oben. Danach neueste zuerst; ohne Datum ans Ende, dort nach Bereich und Titel.
  return liste.sort((a, b) => {
    const wartetA = a.pruefstatus === "ungeprueft" || a.abgelaufen;
    const wartetB = b.pruefstatus === "ungeprueft" || b.abgelaufen;
    if (wartetA !== wartetB) return wartetA ? -1 : 1;
    if (a.datum && b.datum && a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;
    if (!a.datum !== !b.datum) return a.datum ? -1 : 1;
    return a.bereich.localeCompare(b.bereich) || a.titel.localeCompare(b.titel);
  });
}
