import { rechneGewichteZurueck } from "@/lib/wissen/loeschen";
import { pruefeUploadUmgebung, UploadFehler, type WissenSpeicher } from "@/lib/wissen/hochladen";

// Entfernen eines Wissensdokuments aus der Bestandspflege (Administration, nach der Prüfung der Befunde). Anders als das Löschen eines Uploads
// (loeschen.ts, nur Uploads) darf das auch ein Bestandsdokument treffen, das ein Skript oder der Import angelegt hat. Deshalb mit mehr Sicherungen:
//
//   1. Umgebung: Eine Vorschau mit dem Schema public schreibt nie (wie beim Upload).
//   2. Grabstein ZUERST: Die quelle_id kommt in wissen_entfernt, bevor irgendeine Zeile verschwindet. Misslingt das, bleibt alles wie vorher.
//      Der Abgleich von public_preview nach public kopiert nichts, was dort steht (sonst käme das Dokument beim nächsten Merge zurück).
//   3. EINE Löschung je Dokument (in Stapeln, jede Anweisung nur mit dieser quelle_id), danach werden die Wortgewichte zurückgerechnet
//      (loeschen.ts, rechneGewichteZurueck). Schlägt DAS fehl, ist das Dokument schon weg und nur die Gewichte sind etwas zu hoch: harmlos, "gewichte".
//   4. Wiederholbar: ein zweites Entfernen (Doppelklick, zwei Fenster) findet nichts mehr und meldet "schon weg", ohne die Gewichte noch einmal zu verringern.
//
// Welche Dokumente zur Prüfung stehen, entscheidet bestandspflege.ts; entfernt wird hier nur, was die Administration ausdrücklich bestätigt hat.

export type PflegeFehlerCode = "eingabe" | "umgebung" | "grabstein" | "loeschen" | "gewichte";

export class PflegeFehler extends Error {
  constructor(
    readonly code: PflegeFehlerCode,
    readonly wert?: string,
    ursache?: unknown,
  ) {
    super(`Bestandspflege: ${code}${wert ? ` (${wert})` : ""}`, ursache === undefined ? undefined : { cause: ursache });
    this.name = "PflegeFehler";
  }
}

/** Was der Speicher für das Entfernen können muss: die Bausteine des Löschens plus das Löschen JEDES Dokuments und den Grabstein. */
export interface BestandsSpeicher
  extends Pick<WissenSpeicher, "ladeQuellenInfo" | "leseDokumenthaeufigkeit" | "schreibeBegriffe" | "zaehleChunks" | "loescheBegriffe"> {
  /** Löscht alle Zeilen dieser quelle_id (auch Bestand). Liefert die sparsevec-Texte der tatsächlich gelöschten Zeilen. */
  loescheDokument(quelleId: string): Promise<string[]>;
  /** Trägt die quelle_id in wissen_entfernt ein (wiederholbar). */
  merkeEntfernt(e: { quelleId: string; titel: string | null; grund: string; abschnitte: number; von: string | null }): Promise<void>;
}

export interface EntferntErgebnis {
  /** Anzahl der Zeilen (Abschnitte), die dieser Aufruf gelöscht hat. 0 = war schon weg. */
  geloescht: number;
  schonWeg: boolean;
  titel: string | null;
  bereich: string | null;
  /** Das Dokument stammte aus einem Upload (quelle_id "upload:..."). */
  upload: boolean;
  /** Die Wortgewichte ließen sich nicht zurückrechnen (das Dokument ist trotzdem weg). */
  gewichteOffen: boolean;
}

export const MAX_GRUND = 300;

/** Eine quelle_id ist kein Freitext: nicht leer, nicht zu lang, keine Steuerzeichen. Skript-Quellen heißen zum Beispiel "legal/Legal/x/y.md". */
export function istQuelleId(wert: unknown): wert is string {
  return typeof wert === "string" && wert.length > 0 && wert.length <= 400 && !/[\u0000-\u001f\u007f]/.test(wert);
}

export async function entferneDokument(
  quelleId: string,
  grund: string,
  von: string | null,
  d: { speicher: BestandsSpeicher; umgebung?: Record<string, string | undefined>; schema?: string },
): Promise<EntferntErgebnis> {
  if (!istQuelleId(quelleId)) throw new PflegeFehler("eingabe");
  const grundText = grund.trim();
  if (grundText.length === 0 || grundText.length > MAX_GRUND) throw new PflegeFehler("eingabe");
  try {
    pruefeUploadUmgebung(d.umgebung ?? process.env, d.schema);
  } catch (u) {
    if (u instanceof UploadFehler) throw new PflegeFehler("umgebung", undefined, u);
    throw u;
  }

  const upload = quelleId.startsWith("upload:");
  const info = await d.speicher.ladeQuellenInfo(quelleId).catch((u) => {
    throw new PflegeFehler("loeschen", undefined, u);
  });
  if (info.anzahl === 0) return { geloescht: 0, schonWeg: true, titel: null, bereich: null, upload, gewichteOffen: false };

  try {
    await d.speicher.merkeEntfernt({ quelleId, titel: info.titel, grund: grundText, abschnitte: info.anzahl, von });
  } catch (u) {
    throw new PflegeFehler("grabstein", undefined, u);
  }

  let sparseTexte: string[];
  try {
    sparseTexte = await d.speicher.loescheDokument(quelleId);
  } catch (u) {
    throw new PflegeFehler("loeschen", undefined, u);
  }
  if (sparseTexte.length === 0) return { geloescht: 0, schonWeg: true, titel: info.titel, bereich: info.bereich, upload, gewichteOffen: false };

  let gewichteOffen = false;
  try {
    await rechneGewichteZurueck(sparseTexte, d.speicher);
  } catch (u) {
    // Das Dokument ist weg; nur die Gewichte der betroffenen Wörter sind etwas zu hoch. Der nächste Import gleicht es aus.
    console.error("[damicon] Wortgewichte nach dem Entfernen nicht zurückgerechnet:", u);
    gewichteOffen = true;
  }
  return { geloescht: sparseTexte.length, schonWeg: false, titel: info.titel, bereich: info.bereich, upload, gewichteOffen };
}
