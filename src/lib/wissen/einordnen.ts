import type { SupabaseClient } from "@supabase/supabase-js";
import type { SchluesselSpalte } from "@/lib/wissen/dokumente-liste";
import { clusterPasst, istCluster, istQuellenart, standardStufe, type Cluster, type Quellenart } from "@/lib/wissen/quellenart";

// Bestand einordnen: setzt bei Dokumenten, die vor der Typisierung eingelesen wurden (Quellenart leer), Quellenart, Cluster und
// Stufe gemeinsam. Nur die Administration ruft das auf (Server Action wissenBestandEinordnen), und nur mit ihrer Bestaetigung,
// nachdem sie die Wirkung gesehen hat (einordnung-wirkung.ts).
//
// Regeln:
//   * Nur Zeilen mit leerer Quellenart werden geaendert. Eine schon eingeordnete Quelle ueberschreibt dieser Weg nie, auch nicht,
//     wenn jemand eine fremde Kennung sendet: die Bedingung steht in der Abfrage, nicht nur in der Oberflaeche.
//   * Die Stufe folgt der Quellenart (standardStufe), wie bei einem Upload. Die bisherige Stufe bleibt im Protokoll.
//   * Pruefstatus, Wiedervorlage und Rollen bleiben unberuehrt. Bestand bekommt KEINE Wiedervorlage: Er laesst sich ueber die
//     Verwaltung nicht freigeben oder verlaengern, ein Ablaufdatum liesse ihn endgueltig verschwinden.
//   * Der Einlese-Lauf (scripts/wissen-nach-supabase.ts) schreibt weder Quellenart noch Cluster: eine Einordnung ueberlebt ihn.

export const MAX_ZUORDNUNGEN = 400;
const SPALTEN: readonly SchluesselSpalte[] = ["quelle_id", "pfad", "id"];
const MAX_SCHLUESSEL = 500;
const PARALLEL = 8;

export interface EinordnenZuordnung {
  schluessel: string;
  schluesselSpalte: SchluesselSpalte;
  quellenart: Quellenart;
  cluster: Cluster;
}

/** Prueft die Rohdaten aus dem Formular. Was nicht passt, wird gezaehlt und nie angewendet. */
export function pruefeZuordnungen(roh: unknown): { gueltig: EinordnenZuordnung[]; ungueltig: number } {
  if (!Array.isArray(roh)) return { gueltig: [], ungueltig: 1 };
  const gueltig: EinordnenZuordnung[] = [];
  const gesehen = new Set<string>();
  let ungueltig = 0;
  for (const eintrag of roh.slice(0, MAX_ZUORDNUNGEN)) {
    const e = (eintrag ?? {}) as Record<string, unknown>;
    const spalte = e.schluesselSpalte;
    const ok =
      typeof e.schluessel === "string" &&
      e.schluessel.length > 0 &&
      e.schluessel.length <= MAX_SCHLUESSEL &&
      SPALTEN.includes(spalte as SchluesselSpalte) &&
      istQuellenart(e.quellenart) &&
      istCluster(e.cluster) &&
      clusterPasst(e.quellenart, e.cluster) &&
      !gesehen.has(`${spalte}:${e.schluessel}`);
    if (!ok) {
      ungueltig++;
      continue;
    }
    gesehen.add(`${spalte}:${e.schluessel}`);
    gueltig.push({
      schluessel: e.schluessel as string,
      schluesselSpalte: spalte as SchluesselSpalte,
      quellenart: e.quellenart as Quellenart,
      cluster: e.cluster as Cluster,
    });
  }
  if (roh.length > MAX_ZUORDNUNGEN) ungueltig += roh.length - MAX_ZUORDNUNGEN;
  return { gueltig, ungueltig };
}

export interface EinordnenErgebnis {
  /** Dokumente, bei denen mindestens eine Zeile geaendert wurde. */
  dokumente: number;
  abschnitte: number;
  /** Dokumente, die schon eingeordnet waren oder nicht gefunden wurden (nichts geaendert). */
  uebersprungen: number;
  /** Fuer das Protokoll: je Dokument die Art, der Cluster und die Stufe vorher und nachher. */
  protokoll: { schluessel: string; quellenart: string; cluster: string; stufe_vorher: number | null; stufe_neu: number; abschnitte: number }[];
}

export async function ordneBestandEin(db: SupabaseClient, zuordnungen: readonly EinordnenZuordnung[]): Promise<EinordnenErgebnis> {
  const ergebnis: EinordnenErgebnis = { dokumente: 0, abschnitte: 0, uebersprungen: 0, protokoll: [] };
  for (let i = 0; i < zuordnungen.length; i += PARALLEL) {
    const stapel = zuordnungen.slice(i, i + PARALLEL);
    const antworten = await Promise.all(
      stapel.map(async (z) => {
        // Die bisherige Stufe fuers Protokoll (einen Wert je Dokument; bei gemischten Zeilen der kleinste).
        const { data: vorher, error: leseFehler } = await db
          .from("wissen_chunks")
          .select("autoritaetsstufe")
          .eq(z.schluesselSpalte, z.schluessel)
          .is("quellenart", null);
        if (leseFehler) throw new Error(leseFehler.message);
        if (!vorher || vorher.length === 0) return { z, abschnitte: 0, stufeVorher: null as number | null };
        const stufen = vorher.map((r: { autoritaetsstufe: number | null }) => r.autoritaetsstufe).filter((s): s is number => typeof s === "number");
        const { data, error } = await db
          .from("wissen_chunks")
          .update({ quellenart: z.quellenart, cluster: z.cluster, autoritaetsstufe: standardStufe(z.quellenart) })
          .eq(z.schluesselSpalte, z.schluessel)
          .is("quellenart", null)
          .select("id");
        if (error) throw new Error(error.message);
        return { z, abschnitte: data?.length ?? 0, stufeVorher: stufen.length ? Math.min(...stufen) : null };
      }),
    );
    for (const a of antworten) {
      if (a.abschnitte === 0) {
        ergebnis.uebersprungen++;
        continue;
      }
      ergebnis.dokumente++;
      ergebnis.abschnitte += a.abschnitte;
      ergebnis.protokoll.push({
        schluessel: a.z.schluessel,
        quellenart: a.z.quellenart,
        cluster: a.z.cluster,
        stufe_vorher: a.stufeVorher,
        stufe_neu: standardStufe(a.z.quellenart),
        abschnitte: a.abschnitte,
      });
    }
  }
  return ergebnis;
}
