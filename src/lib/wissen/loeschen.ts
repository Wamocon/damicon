import { sparsevecIndizes } from "@/lib/wissen/sparse";
import { idf, istUploadQuelleId, pruefeUploadUmgebung, UploadFehler, type WissenSpeicher } from "@/lib/wissen/hochladen";

// Loeschen eines hochgeladenen Wissensdokuments. Geloescht werden darf NUR, was der Admin-Upload angelegt hat:
// Zeilen mit extra.quelle = "upload" UND quelle_id "upload:<32 Hex>". Vom Skript oder ETL geladene Dokumente sind nie
// loeschbar, weder hier noch (ueber dieselben zwei Bedingungen im Filter) in der Datenbankanweisung selbst.
//
// Reihenfolge und Ausfall:
//   1. Umgebung (Vorschau-Schutz), 2. Form der quelle_id, 3. Ist alles unter dieser quelle_id ein Upload?
//   4. EINE Delete-Anweisung (alles oder nichts). Schlaegt sie fehl, steht alles wie vorher.
//   5. Wortgewichte (wissen_begriffe) zurueckrechnen. Schlaegt DAS fehl, ist das Dokument schon weg und nur die
//      Gewichte der betroffenen Woerter sind zu hoch (df, N): harmlos fuer die Suche, der naechste ETL-Lauf gleicht
//      es aus (UploadFehler "gewichte"). Es bleibt nie ein halbes Dokument.
// Idempotent: ein zweites Loeschen (Doppelklick, zwei Fenster) findet nichts mehr und meldet "schon geloescht",
// ohne die Gewichte noch einmal zu verringern: sie werden nur aus den Zeilen berechnet, die DIESER Aufruf geloescht hat.

export interface LoeschErgebnis {
  /** Anzahl der Zeilen (Abschnitte), die dieser Aufruf geloescht hat. 0 = war schon weg. */
  geloescht: number;
  schonWeg: boolean;
  titel: string | null;
  bereich: string | null;
}

export async function loescheHochgeladenesDokument(
  quelleId: string,
  d: { speicher: WissenSpeicher; umgebung?: Record<string, string | undefined> },
): Promise<LoeschErgebnis> {
  pruefeUploadUmgebung(d.umgebung ?? process.env);

  // Skript-Quellen haben Pfade als quelle_id ("recht/nk-rk.md"): hier endet es, ohne dass die Datenbank gefragt wird.
  if (!istUploadQuelleId(quelleId)) throw new UploadFehler("nichtLoeschbar");

  const info = await d.speicher.ladeQuellenInfo(quelleId).catch((u) => {
    throw new UploadFehler("loeschen", undefined, u);
  });
  if (info.anzahl === 0) return { geloescht: 0, schonWeg: true, titel: null, bereich: null };
  if (info.fremd > 0) throw new UploadFehler("nichtLoeschbar");

  let sparseTexte: string[];
  try {
    sparseTexte = await d.speicher.loescheUpload(quelleId);
  } catch (ursache) {
    throw new UploadFehler("loeschen", undefined, ursache);
  }
  if (sparseTexte.length === 0) return { geloescht: 0, schonWeg: true, titel: info.titel, bereich: info.bereich };

  // Gewichte: dieselbe Zaehlung wie beim Upload (ein Wort zaehlt je Textstelle einmal), nur rueckwaerts.
  try {
    const zaehler = new Map<number, number>();
    for (const text of sparseTexte) for (const idx of new Set(sparsevecIndizes(text))) zaehler.set(idx, (zaehler.get(idx) ?? 0) + 1);
    const bisher = await d.speicher.leseDokumenthaeufigkeit([...zaehler.keys()]);
    const n = await d.speicher.zaehleChunks();
    const neu: { hash: number; df: number; idf: number }[] = [];
    const weg: number[] = [];
    for (const [idx, anzahl] of zaehler) {
      const df = Math.min(Math.max((bisher.get(idx) ?? 0) - anzahl, 0), n);
      if (df <= 0) weg.push(idx);
      else neu.push({ hash: idx, df, idf: idf(n, df) });
    }
    await d.speicher.schreibeBegriffe(neu);
    await d.speicher.loescheBegriffe(weg);
  } catch (ursache) {
    throw new UploadFehler("gewichte", info.titel ?? undefined, ursache);
  }
  return { geloescht: sparseTexte.length, schonWeg: false, titel: info.titel, bereich: info.bereich };
}
