"use client";

// Text aus einer PDF-Datei im BROWSER (PDF.js), Seite fuer Seite, mit Fortschrittsmeldung. Nur fuer den Buch-Upload
// (buch-text.ts erklaert, warum nicht auf dem Server). Eine PDF aus einem OCR-Lauf hat eine Textebene; ein reiner Bild-Scan
// hat keine: dann kommt (fast) nichts heraus, und der Aufrufer meldet "kein Text" (textguete.ts: kaumText).

import { bereinigeSeitentext } from "@/lib/wissen/buch-text";
import { randAusStuecken, type SeitenRand, type TextStueck } from "@/lib/wissen/seitenverlauf";

export interface PdfFortschritt {
  seite: number;
  seiten: number;
}

/** Laedt PDF.js erst beim ersten Gebrauch: Die Bibliothek ist gross und wird nur fuer PDF gebraucht. */
async function ladePdfJs() {
  const pdfjs = await import("pdfjs-dist");
  // Der Worker liegt neben der Bibliothek; der Bundler legt die Datei ab und liefert ihre Adresse.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs;
}

export interface PdfLesung {
  /** Der bereinigte Text des ganzen Buchs. */
  text: string;
  /** Kopf- und Fusszeilen je Seite, fuer die Pruefung des Seitenverlaufs (seitenverlauf.ts). */
  raender: SeitenRand[];
}

/** Liest die PDF Seite fuer Seite: Text und, aus den Positionen der Textstuecke, den Rand jeder Seite (dort steht die gedruckte Seitenzahl). */
export async function pdfLesenAusDatei(datei: File, beiSeite?: (f: PdfFortschritt) => void, abbruch?: AbortSignal): Promise<PdfLesung> {
  const pdfjs = await ladePdfJs();
  const daten = new Uint8Array(await datei.arrayBuffer());
  const dokument = await pdfjs.getDocument({ data: daten }).promise;
  try {
    const seiten: string[] = [];
    const raender: SeitenRand[] = [];
    for (let nr = 1; nr <= dokument.numPages; nr++) {
      if (abbruch?.aborted) throw new DOMException("abgebrochen", "AbortError");
      const seite = await dokument.getPage(nr);
      const viewport = seite.getViewport({ scale: 1 });
      const inhalt = await seite.getTextContent();
      let text = "";
      const stuecke: TextStueck[] = [];
      for (const eintrag of inhalt.items) {
        if (!("str" in eintrag)) continue;
        text += eintrag.str + (eintrag.hasEOL ? "\n" : " ");
        // Position im Viewport (y von oben nach unten), damit auch eine gedrehte Seite stimmt
        const m = pdfjs.Util.transform(viewport.transform, eintrag.transform as number[]);
        stuecke.push({ str: eintrag.str, x: m[4]!, y: m[5]! });
      }
      seiten.push(text);
      raender.push(randAusStuecken(stuecke, viewport.height, text.trim().length));
      seite.cleanup();
      beiSeite?.({ seite: nr, seiten: dokument.numPages });
    }
    return { text: bereinigeSeitentext(seiten), raender };
  } finally {
    await dokument.destroy().catch(() => undefined);
  }
}
