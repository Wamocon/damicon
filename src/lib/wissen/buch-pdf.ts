"use client";

// Text aus einer PDF-Datei im BROWSER (PDF.js), Seite fuer Seite, mit Fortschrittsmeldung. Nur fuer den Buch-Upload
// (buch-text.ts erklaert, warum nicht auf dem Server). Eine PDF aus einem OCR-Lauf hat eine Textebene; ein reiner Bild-Scan
// hat keine: dann kommt (fast) nichts heraus, und der Aufrufer meldet "kein Text" (textguete.ts: kaumText).

import { bereinigeSeitentext } from "@/lib/wissen/buch-text";

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

export async function pdfTextAusDatei(datei: File, beiSeite?: (f: PdfFortschritt) => void, abbruch?: AbortSignal): Promise<string> {
  const pdfjs = await ladePdfJs();
  const daten = new Uint8Array(await datei.arrayBuffer());
  const dokument = await pdfjs.getDocument({ data: daten }).promise;
  try {
    const seiten: string[] = [];
    for (let nr = 1; nr <= dokument.numPages; nr++) {
      if (abbruch?.aborted) throw new DOMException("abgebrochen", "AbortError");
      const seite = await dokument.getPage(nr);
      const inhalt = await seite.getTextContent();
      let text = "";
      for (const eintrag of inhalt.items) {
        if (!("str" in eintrag)) continue;
        text += eintrag.str + (eintrag.hasEOL ? "\n" : " ");
      }
      seiten.push(text);
      seite.cleanup();
      beiSeite?.({ seite: nr, seiten: dokument.numPages });
    }
    return bereinigeSeitentext(seiten);
  } finally {
    await dokument.destroy().catch(() => undefined);
  }
}
