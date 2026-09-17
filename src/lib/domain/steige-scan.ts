// Kamera-QR-Scan einer Steige am Sammelpunkt (Anforderung 2.7). Reine
// Auswertungslogik ohne Server-/Browser-Import, damit sie sowohl im Client
// (components/db/steige-scan-feld.tsx) als auch eigenstaendig per Node
// getestet werden kann (supabase/tests/abnahme-2-7.mjs) - dieselbe Trennung
// wie bei domain/ausweis-scan.ts.
//
// Der Etiketten-QR traegt die volle Herkunfts-URL mit der Steigenkennung als
// Parameter, zum Beispiel:
//
//   https://damicon.example/de/herkunft/hk_cabf175a9309443f?steige=ST-2026-0417
//
// Ein QR fuer zwei Zwecke: Die Kamera-App eines Kunden navigiert auf die
// oeffentliche Herkunftsseite, die den Parameter ignoriert; der Scan im
// Dashboard liest hier die Kennung heraus. Warum ein Code statt zweier, steht
// in components/db/qr-steigen-ansicht.tsx.

/** Name des Parameters, unter dem die Steigenkennung in der Etiketten-URL steht. */
export const STEIGE_PARAMETER = "steige";

/**
 * Holt die Steigenkennung aus einem gescannten Wert.
 *
 * Nimmt drei Formen an, weil am Sammelpunkt alle drei vorkommen:
 *   1. die volle Etiketten-URL mit ?steige=...
 *   2. eine URL ohne den Parameter - dann ist es ein aelteres Etikett aus der
 *      Zeit vor Anforderung 2.7, und es gibt nichts zu finden (null)
 *   3. die nackte Kennung, von Hand eingetippt oder von einem Etikett, das nur
 *      den Klartext traegt
 *
 * Gibt null zurueck, wenn sich keine Kennung ablesen laesst. Der Aufrufer
 * entscheidet, was das heisst - hier wird nichts geraten.
 */
export function steigenCodeAusScan(wert: string): string | null {
  const roh = wert.trim();
  if (!roh) return null;

  // Form 1 und 2: sieht aus wie eine Adresse.
  if (/^https?:\/\//i.test(roh)) {
    try {
      const code = new URL(roh).searchParams.get(STEIGE_PARAMETER);
      return code ? normalisiereSteigenCode(code) : null;
    } catch {
      // Kaputte URL: kein Grund, daraus eine Kennung zu erfinden.
      return null;
    }
  }

  // Form 3: nackte Kennung. Ein Wert mit Leerzeichen oder Schraegstrichen ist
  // keine - eher ein versehentlich gescannter Fremdcode.
  if (/[\s/?#]/.test(roh)) return null;
  return normalisiereSteigenCode(roh);
}

/**
 * Vereinheitlicht eine Kennung fuer den Vergleich. Gross-/Kleinschreibung und
 * Rand-Leerzeichen sind fuer eine Kamera-Erkennung oder eine haendische
 * Nachbesserung keine inhaltlichen Unterschiede - dieselbe Ueberlegung wie bei
 * normalisiereAusweis() in domain/ausweis-scan.ts.
 */
export function normalisiereSteigenCode(wert: string): string {
  return wert.trim().toUpperCase();
}
