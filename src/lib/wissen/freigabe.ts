import { pruefeUploadUmgebung, UploadFehler, type FreigabeInfo, type WissenSpeicher } from "@/lib/wissen/hochladen";
import { istQuellenart, pruefenBis, type Quellenart } from "@/lib/wissen/quellenart";
import { istUploadQuelleId } from "@/lib/wissen/upload-quelle";

// Vier-Augen-Prinzip fuer hochgeladene Wissensdokumente. Ein Upload ist ungeprueft und fuer niemanden durchsuchbar (auch
// nicht fuer den Admin: die Zeilensicherheit der Datenbank zeigt nur Freigegebenes). Freigeben, ablehnen und verlaengern
// duerfen die, die ki_assistent:manage haben, aber die Freigabe und die Verlaengerung NICHT die Person, die hochgeladen hat.
//
// Zwei Schichten, die sich nicht aufeinander verlassen:
//   1. Hier: Vorschau-Schutz, Form der quelle_id, nur Upload-Zeilen, nur im richtigen Status, nicht die eigene Person.
//   2. Datenbank: ein Waechter (Trigger wissen_pruefung_wache, Migration 20261124000000) lehnt dieselben Faelle ab, auch
//      wenn hier ein Fehler stuende. Die UPDATE-Anweisung filtert ausserdem selbst auf Marker und Status.
// Ist die Freigabe einmal erteilt, bleibt sie: freigegeben und abgelehnt aendern sich nicht mehr (Trigger).

export type FreigabeAktion = "freigeben" | "ablehnen" | "verlaengern";

export interface FreigabeErgebnis {
  titel: string | null;
  bereich: string | null;
  quellenart: string | null;
  /** Zahl der Zeilen (Abschnitte), die dieser Aufruf geaendert hat. */
  abschnitte: number;
  /** Neue Wiedervorlage (JJJJ-MM-TT) oder null, wenn die Art nie ablaeuft. */
  pruefenBis: string | null;
}

export interface FreigabeAbhaengigkeiten {
  speicher: WissenSpeicher;
  /** profiles.id der entscheidenden Person. */
  pruefer: { id: string };
  jetzt?: () => Date;
  umgebung?: Record<string, string | undefined>;
  schema?: string;
}

const heute = (jetzt: Date) => jetzt.toISOString().slice(0, 10);

export async function entscheideUeberUpload(aktion: FreigabeAktion, quelleId: string, d: FreigabeAbhaengigkeiten): Promise<FreigabeErgebnis> {
  pruefeUploadUmgebung(d.umgebung ?? process.env, d.schema);
  // Skript-Quellen haben Pfade als quelle_id: hier endet es, ohne dass die Datenbank gefragt wird.
  if (!istUploadQuelleId(quelleId)) throw new UploadFehler("nichtFreigebbar");

  const info: FreigabeInfo = await d.speicher.ladeFreigabeInfo(quelleId).catch((u) => {
    throw new UploadFehler("freigeben", undefined, u);
  });
  if (info.anzahl === 0) throw new UploadFehler("nichtGefunden");
  if (info.fremd > 0) throw new UploadFehler("nichtFreigebbar");

  const jetzt = d.jetzt?.() ?? new Date();
  const zeitpunkt = jetzt.toISOString();
  const art = istQuellenart(info.quellenart) ? (info.quellenart as Quellenart) : null;

  if (aktion === "verlaengern") {
    // Nur ein freigegebenes Dokument, dessen Wiedervorlage erreicht ist, und nur durch eine zweite Person.
    if (info.pruefstatus !== "freigegeben" || !info.pruefenBis || info.pruefenBis >= heute(jetzt)) throw new UploadFehler("nichtPruefbar");
    sicherheitsPruefung(info, d.pruefer.id);
    const neu = art ? pruefenBis(art, jetzt) : null;
    if (!neu) throw new UploadFehler("nichtPruefbar");
    const n = await d.speicher.verlaengere(quelleId, { pruefer: d.pruefer.id, zeitpunkt, pruefenBis: neu }).catch((u) => {
      throw new UploadFehler("freigeben", info.titel ?? undefined, u);
    });
    if (n !== info.anzahl) throw new UploadFehler("nichtPruefbar");
    return { titel: info.titel, bereich: info.bereich, quellenart: info.quellenart, abschnitte: n, pruefenBis: neu };
  }

  // Freigeben und Ablehnen: nur, solange das Dokument wartet.
  if (info.pruefstatus !== "ungeprueft") throw new UploadFehler("nichtPruefbar");
  // Freigeben braucht die zweite Person. Ablehnen darf auch, wer hochgeladen hat: Das ist ein Zurueckziehen, keine Freigabe.
  if (aktion === "freigeben") sicherheitsPruefung(info, d.pruefer.id);
  const neu = aktion === "freigeben" && art ? pruefenBis(art, jetzt) : null;
  const n = await d.speicher
    .entscheide(quelleId, { status: aktion === "freigeben" ? "freigegeben" : "abgelehnt", pruefer: d.pruefer.id, zeitpunkt, pruefenBis: neu })
    .catch((u) => {
      throw new UploadFehler("freigeben", info.titel ?? undefined, u);
    });
  // Eine Anweisung, alles oder nichts: weniger Zeilen heisst, jemand anderes war schneller.
  if (n !== info.anzahl) throw new UploadFehler("nichtPruefbar");
  return { titel: info.titel, bereich: info.bereich, quellenart: info.quellenart, abschnitte: n, pruefenBis: neu };
}

/** Das Vier-Augen-Prinzip: Wer hochgeladen hat, gibt nicht frei. Ist der Hochladende unbekannt, wird nicht freigegeben. */
function sicherheitsPruefung(info: FreigabeInfo, pruefer: string): void {
  if (!info.hochgeladenVon) throw new UploadFehler("nichtFreigebbar");
  if (info.hochgeladenVon === pruefer) throw new UploadFehler("selbstFreigabe");
}
