import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";
import { clusterPasst, istCluster, istQuellenart, nutzungFuer, PRIMAER_MAX_STUFE, standardStufe, type Cluster, type Nutzung, type Quellenart } from "@/lib/wissen/quellenart";

// Was eine Einordnung fuer die Suche bedeutet, BEVOR sie gespeichert wird. Die Administration bestaetigt eine Auswahl erst,
// wenn sie sieht, welche Dokumente danach in ihrem Bereich nicht mehr gefunden werden, nur noch als Hinweis gelten oder ihre
// Stufe aendern. Reine Funktion: dieselbe Regel wie die Suche (nutzungFuer, Stufe aus der Art, reservierte Plaetze fuer Stufe 1 bis 3).
//
// Mit der Einordnung folgt die Stufe der Quellenart (standardStufe), wie bei einem Upload. Ein Bestand, der vorher Stufe 5 trug
// und als Rechtsnorm eingeordnet wird, steigt damit auf Stufe 1, und umgekehrt. Das ist gewollt: eine Quelle hat eine Stufe,
// nicht zwei, die sich widersprechen koennen.

export interface Zuordnung {
  schluessel: string;
  quellenart: Quellenart;
  cluster: Cluster;
}

export interface WirkungZeile {
  schluessel: string;
  titel: string;
  bereich: string;
  chunks: number;
  nutzungNeu: Nutzung;
  stufeAlt: number | null;
  stufeNeu: number;
  /** Hatte vorher einen reservierten Platz fuer Rechtsquellen (Stufe 1 bis 3, tragend) und hat ihn danach nicht mehr. */
  verlaesstPrimaer: boolean;
  /** Bekommt durch die Einordnung Zugang zu den reservierten Plaetzen. */
  kommtInPrimaer: boolean;
}

export interface Wirkung {
  dokumente: number;
  abschnitte: number;
  /** Danach in ihrem Bereich nicht mehr auffindbar (Nutzung nein). */
  gesperrt: WirkungZeile[];
  /** Danach nur noch als Hinweis, nie allein tragend. */
  nurHinweis: WirkungZeile[];
  stufeGeaendert: WirkungZeile[];
  verlassenPrimaer: WirkungZeile[];
  kommenInPrimaer: WirkungZeile[];
  /** Zuordnungen, die nicht angewendet werden koennen (unbekanntes Dokument, schon eingeordnet, Cluster passt nicht zur Art). */
  abgelehnt: string[];
}

export function wirkungVon(dokumente: readonly WissenDokumentZeile[], zuordnungen: readonly Zuordnung[]): Wirkung {
  const nachSchluessel = new Map(dokumente.map((d) => [d.schluessel, d]));
  const zeilen: WirkungZeile[] = [];
  const abgelehnt: string[] = [];
  for (const z of zuordnungen) {
    const d = nachSchluessel.get(z.schluessel);
    if (!d || d.quellenart !== null || !istQuellenart(z.quellenart) || !istCluster(z.cluster) || !clusterPasst(z.quellenart, z.cluster)) {
      abgelehnt.push(z.schluessel);
      continue;
    }
    const stufeNeu = standardStufe(z.quellenart);
    const nutzungNeu = nutzungFuer(d.bereich, z.quellenart);
    // Bestand ohne Art gilt vorher uneingeschraenkt (nutzungFuer ohne Art ist "ja"), die Stufe haengt an seinem bisherigen Wert.
    const primaerVorher = d.stufe !== null && d.stufe <= PRIMAER_MAX_STUFE;
    const primaerNachher = stufeNeu <= PRIMAER_MAX_STUFE && nutzungNeu === "ja";
    zeilen.push({
      schluessel: d.schluessel,
      titel: d.titel,
      bereich: d.bereich,
      chunks: d.chunks,
      nutzungNeu,
      stufeAlt: d.stufe,
      stufeNeu,
      verlaesstPrimaer: primaerVorher && !primaerNachher,
      kommtInPrimaer: !primaerVorher && primaerNachher,
    });
  }
  return {
    dokumente: zeilen.length,
    abschnitte: zeilen.reduce((summe, z) => summe + z.chunks, 0),
    gesperrt: zeilen.filter((z) => z.nutzungNeu === "nein"),
    nurHinweis: zeilen.filter((z) => z.nutzungNeu === "hinweis"),
    stufeGeaendert: zeilen.filter((z) => z.stufeAlt !== z.stufeNeu),
    verlassenPrimaer: zeilen.filter((z) => z.verlaesstPrimaer),
    kommenInPrimaer: zeilen.filter((z) => z.kommtInPrimaer),
    abgelehnt,
  };
}
