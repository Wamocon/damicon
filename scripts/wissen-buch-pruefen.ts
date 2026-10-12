// Prueft Buch-PDFs VOR dem Hochladen auf lueckenlosen Seitenverlauf und (bei Gesetzen) auf eine lueckenlose Artikelfolge.
// Dieselbe Pruefung wie im Upload der Wissensbasis (src/lib/wissen/seitenverlauf.ts), aber auf der Kommandozeile und fuer viele Dateien.
//
// Aufruf:  npx tsx scripts/wissen-buch-pruefen.ts <datei.pdf|ordner> [weitere ...] [--json <ausgabe.json>]
// Lesen allein, es wird nichts hochgeladen und nichts veraendert.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { bereinigeSeitentext } from "../src/lib/wissen/buch-text";
import {
  beschreibeArtikelLuecken,
  beschreibeLuecken,
  pruefeArtikelfolge,
  pruefeSeitenverlauf,
  randAusStuecken,
  type ArtikelPruefung,
  type SeitenPruefung,
  type SeitenRand,
  type TextStueck,
} from "../src/lib/wissen/seitenverlauf";

interface Ergebnis {
  datei: string;
  seiten: SeitenPruefung;
  artikel: ArtikelPruefung | null;
  luecken: string;
  artikelLuecken: string;
}

async function pruefeDatei(pfad: string): Promise<Ergebnis> {
  const daten = new Uint8Array(readFileSync(pfad));
  const dok = await pdfjs.getDocument({ data: daten, useSystemFonts: false, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
  try {
    const raender: SeitenRand[] = [];
    const roh: string[] = [];
    for (let nr = 1; nr <= dok.numPages; nr++) {
      const seite = await dok.getPage(nr);
      const viewport = seite.getViewport({ scale: 1 });
      const inhalt = await seite.getTextContent();
      const stuecke: TextStueck[] = [];
      let text = "";
      for (const e of inhalt.items) {
        if (!("str" in e)) continue;
        text += e.str + (e.hasEOL ? "\n" : " ");
        const m = pdfjs.Util.transform(viewport.transform, e.transform as number[]);
        stuecke.push({ str: e.str, x: m[4]!, y: m[5]! });
      }
      raender.push(randAusStuecken(stuecke, viewport.height, text.trim().length));
      roh.push(text);
      seite.cleanup();
    }
    const seiten = pruefeSeitenverlauf(raender);
    const artikel = pruefeArtikelfolge(bereinigeSeitentext(roh));
    return { datei: basename(pfad), seiten, artikel, luecken: beschreibeLuecken(seiten.luecken), artikelLuecken: artikel ? beschreibeArtikelLuecken(artikel.luecken) : "" };
  } finally {
    await dok.destroy().catch(() => undefined);
  }
}

function sammle(args: string[]): string[] {
  const aus: string[] = [];
  for (const a of args) {
    if (statSync(a).isDirectory()) aus.push(...readdirSync(a).filter((f) => /\.pdf$/i.test(f)).sort().map((f) => join(a, f)));
    else aus.push(a);
  }
  return aus;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonAt = args.indexOf("--json");
  const ausJson = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
  const eingaben = sammle(args.filter((a, i) => !a.startsWith("--") && !(jsonAt >= 0 && i === jsonAt + 1)));
  if (eingaben.length === 0) {
    console.error("Aufruf: npx tsx scripts/wissen-buch-pruefen.ts <datei.pdf|ordner> [weitere ...] [--json <ausgabe.json>]");
    process.exit(2);
  }
  const alle: Ergebnis[] = [];
  for (const pfad of eingaben) {
    const e = await pruefeDatei(pfad);
    alle.push(e);
    const s = e.seiten;
    const urteil = !s.geprueft ? "nicht pruefbar" : s.fehlend > 0 ? `LUECKEN: ${s.fehlend} Seiten fehlen` : s.eingeschraenkt ? "keine Luecke, aber nur eingeschraenkt pruefbar" : "lueckenlos";
    console.log(`${e.datei}\n  ${s.seiten} PDF-Seiten, Seitenzahl lesbar auf ${Math.round(s.abdeckung * 100)} %: ${urteil}${e.luecken ? `\n  fehlende gedruckte Seiten (nach PDF-Seite): ${e.luecken}` : ""}${s.ohneText.length ? `\n  Seiten ohne Text mitten im Buch: ${s.ohneText.slice(0, 15).join(", ")}${s.ohneText.length > 15 ? " ..." : ""}` : ""}${s.eingeschoben ? `\n  ${s.eingeschoben}x doppelte oder ungezaehlte Seiten (Hinweis)` : ""}${s.neuzaehlungen ? `\n  ${s.neuzaehlungen}x neue Seitenzaehlung (Hinweis)` : ""}${e.artikel ? `\n  Artikel ${e.artikel.kleinste} bis ${e.artikel.groesste}: ${e.artikel.fehlend === 0 ? "lueckenlos" : `${e.artikel.fehlend} Nummern fehlen: ${e.artikelLuecken}`}` : ""}`);
  }
  if (ausJson) writeFileSync(ausJson, JSON.stringify(alle, null, 1));
}

main().catch((f) => {
  console.error(f);
  process.exit(1);
});
