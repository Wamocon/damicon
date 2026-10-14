import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";
import { clusterPasst, istCluster, istQuellenart, nutzungFuer, QUELLENART_INFO, standardStufe, type Quellenart } from "@/lib/wissen/quellenart";
import { bereichSchluessel, UPLOAD_BEREICHE } from "@/lib/wissen/upload-konstanten";

// Bewertung der Wahl im Fenster "Einordnung ändern" (wissen-umordnen.tsx). Reine Funktionen ohne React, damit die Komponentendatei nur
// Komponenten exportiert (Fast Refresh) und die Regeln ohne Browser prüfbar sind.

/** Die Wahl im Fenster; beim Oeffnen die Angaben des Dokuments. */
export interface UmordnenWert {
  cluster: string;
  bereich: string;
  quellenart: string;
  textgrundlage: string;
}

/** Aendert die Wahl eine wirksame Angabe (Bereich, Quellenart, Textgrundlage)? Der Cluster allein zaehlt nicht. */
const aendertWirksames = (dokument: WissenDokumentZeile, wert: UmordnenWert): boolean =>
  wert.bereich !== bereichSchluessel(dokument.bereich) || wert.quellenart !== (dokument.quellenart ?? "") || wert.textgrundlage !== (dokument.textgrundlage ?? "original");

/** Monate bis zur neuen Wiedervorlage, wenn ein freigegebener Upload eine andere Art bekommt; null, wenn sie sich nicht aendert oder die Art keine hat. */
const neueWiedervorlage = (dokument: WissenDokumentZeile, art: Quellenart, freigegebenerUpload: boolean): number | null =>
  freigegebenerUpload && art !== dokument.quellenart ? QUELLENART_INFO[art].pruefMonate : null;

/** Was die Wahl bewirkt (Stufe, Nutzung, Wiedervorlage) und ob sie sich speichern laesst. Die Regeln prueft der Server noch einmal. */
export function bewerteUmordnung(dokument: WissenDokumentZeile, wert: UmordnenWert, ichId: string | null) {
  const art = istQuellenart(wert.quellenart) ? wert.quellenart : null;
  // Ein Korpusbereich des Bestands (amtlich, fachquellen ...) steht nur, solange er der eigene ist.
  const bereichSteht = (UPLOAD_BEREICHE as readonly string[]).includes(wert.bereich) || wert.bereich === bereichSchluessel(dokument.bereich);
  const nutzung = art && bereichSteht ? nutzungFuer(wert.bereich, art) : "ja";
  const freigegebenerUpload = dokument.herkunft === "upload" && dokument.pruefstatus === "freigegeben";
  const eigener = !!ichId && dokument.hochgeladenVonId === ichId;
  const urlFehlt = !!art && QUELLENART_INFO[art].urlPflicht && !/^https?:\/\//i.test(dokument.url ?? "");
  return {
    art,
    bereichSteht,
    nutzung,
    stufe: art ? standardStufe(art) : dokument.stufe,
    wiedervorlage: art ? neueWiedervorlage(dokument, art, freigegebenerUpload) : null,
    gesperrtDurchVierAugen: freigegebenerUpload && eigener && aendertWirksames(dokument, wert),
    urlFehlt,
    gueltig: !!art && istCluster(wert.cluster) && clusterPasst(art, wert.cluster) && nutzung !== "nein" && !urlFehlt && bereichSteht,
  };
}
