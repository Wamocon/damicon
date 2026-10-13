import { bereinigeEineSeite, normalisiereText } from "@/lib/wissen/buch-text";
import { MAX_LUECKEN_STELLEN, type SeitenLuecke } from "@/lib/wissen/seitenverlauf";

// Wo im Text des Buchs liegt eine Lücke? Der Browser kennt den Text jeder PDF-Seite und die Pakete, in denen das Buch zum Server geht
// (buch-text.ts: teileInPakete). Er bestimmt für jede Lücke das Paket und die Stelle darin in Promille (0 = Anfang, 1000 = Ende des Pakets). Ein
// Nachtrag (nachtrag.ts) reiht die nachgeladenen Seiten dann dort ein, wo sie im Buch fehlen, auf einen Abschnitt genau (rund eine Seite).

export interface LueckenOrt {
  paket: number;
  promille: number;
}

/**
 * Bestimmt den Ort jeder Lücke (höchstens MAX_LUECKEN_STELLEN, in der Reihenfolge der Lücken). `rohSeiten` ist der Text der PDF-Seiten wie aus
 * dem Leser, `pakete` die Pakete wie sie gesendet werden. Die Lücke liegt hinter dem Text der PDF-Seite `nachPdfSeite`.
 */
export function ermittleOrte(rohSeiten: readonly string[], pakete: readonly string[], luecken: readonly SeitenLuecke[]): LueckenOrt[] {
  const bereinigt = rohSeiten.map(bereinigeEineSeite);
  // Ende des Textes der PDF-Seite n im zusammengesetzten Text (bereinigeSeitentext verbindet die nicht leeren Seiten mit einem Absatz)
  const ende: number[] = [0];
  let laenge = 0;
  let vorhanden = false;
  for (const s of bereinigt) {
    if (s.length > 0) {
      laenge += (vorhanden ? 2 : 0) + s.length;
      vorhanden = true;
    }
    ende.push(laenge);
  }
  const gesamt = laenge;
  // Beginn jedes Pakets im Gesamttext: Die Pakete sind zusammenhängende Stücke des Textes in Reihenfolge.
  const volltext = normalisiereText(bereinigt.filter((s) => s.length > 0).join("\n\n"));
  const beginn: number[] = [];
  let lauf = 0;
  for (const p of pakete) {
    const i = volltext.indexOf(p.slice(0, 60), lauf);
    const start = i >= 0 ? i : lauf;
    beginn.push(start);
    lauf = start + p.length;
  }
  return luecken.slice(0, MAX_LUECKEN_STELLEN).map((l) => {
    const roh = ende[Math.min(Math.max(l.nachPdfSeite, 0), ende.length - 1)] ?? gesamt;
    // Die Vereinheitlichung kann den Text um wenige Zeichen kuerzen: die Stelle wird im Verhaeltnis umgerechnet.
    const stelle = gesamt > 0 ? Math.round((roh * volltext.length) / gesamt) : 0;
    let k = 0;
    for (let i = 0; i < beginn.length; i++) if (beginn[i]! <= stelle) k = i;
    const laengePaket = Math.max(1, pakete[k]?.length ?? 1);
    const promille = Math.min(1000, Math.max(0, Math.round(((stelle - (beginn[k] ?? 0)) / laengePaket) * 1000)));
    return { paket: k + 1, promille };
  });
}
