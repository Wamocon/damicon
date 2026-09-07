import "server-only";
import QRCode from "qrcode";

// QR-Codes fuer Steigen-Etiketten, Pfluecker-Ausweise und das Aushang-Poster
// (WMCNL-1439). Rein serverseitig als SVG erzeugt - kein externer Dienst, kein
// PDF-Werkzeug. Bibliothek "qrcode" (MIT-Lizenz). "server-only" erzwingt
// zusaetzlich, dass diese Datei nie ins Client-Bundle gelangt: das Paket wird
// fuer ein Ergebnis, das beim Rendern feststeht, nicht im Browser gebraucht.
//
// Muster uebernommen aus dem Schwesterprojekt Digitalisierung-Himbeerenbetrieb
// (dortige apps/web/lib/qr.ts), 1:1 uebertragbar - lediglich die Zielgroessen
// und die Erzeugung der absoluten URL sind auf malinas eigene Routen und die
// Env-Variable NEXT_PUBLIC_APP_URL (siehe .env.example) zugeschnitten.

export type QrGroesse = "etikett" | "ausweis" | "aushang";

// Kante in Pixel je Einsatzzweck. Ein Etikett wird aus der Hand gescannt
// (kurzer Abstand, kleine Flaeche auf der Steige), ein Ausweis aehnlich groß,
// ein Aushang haengt an der Wand und muss aus groesserem Abstand lesbar
// bleiben.
const KANTE: Record<QrGroesse, number> = {
  etikett: 120,
  ausweis: 160,
  aushang: 320,
};

export async function qrSvg(inhalt: string, groesse: QrGroesse = "etikett"): Promise<string> {
  // width/height bleiben als Attribut im SVG (anders als in der
  // D-H-Referenz, die sie per Regex entfernt): dort wird dasselbe SVG an
  // mehreren Stellen unterschiedlich groß dargestellt, hier erzeugt jeder
  // Aufrufer sein SVG direkt in der gewuenschten Zielgroesse (KANTE) und
  // zeigt es genau dort. Ein SVG ohne width/height hat ohne zusaetzliches
  // CSS keine Eigengroesse und wuerde 0x0 gerendert - das war ein echter
  // Darstellungsfehler in einer frueheren Fassung dieser Datei.
  return QRCode.toString(inhalt, {
    type: "svg",
    // "M" (~15% Fehlerkorrektur): Kompromiss zwischen "L" (7%, auf einem im
    // Kuehlraum eventuell verschmutzten oder geknickten Etikett zu
    // fehleranfaellig) und "H" (30%, unnoetig grobe Module fuer eine reine
    // URL ohne Firmenlogo in der Mitte).
    errorCorrectionLevel: "M",
    width: KANTE[groesse],
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

// Absolute URL fuer den QR-Inhalt: ein Telefon, das den Code scannt, kennt
// weder das aktuelle Origin noch die aktuelle Locale - beides muss im Inhalt
// selbst stehen, sonst weiss die Kamera-App nichts damit anzufangen.
// NEXT_PUBLIC_APP_URL ist bereits die dokumentierte Konvention dieses
// Projekts fuer die eigene Basis-URL (siehe .env.example); der Fallback greift
// nur, wenn die Variable in einer lokalen Umgebung einmal fehlt.
export function absoluteUrl(locale: string, pfad: string): string {
  const basis = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const weg = pfad.startsWith("/") ? pfad : `/${pfad}`;
  return `${basis}/${locale}${weg}`;
}
