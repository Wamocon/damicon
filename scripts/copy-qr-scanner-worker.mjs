// Kopiert den Web-Worker von "qr-scanner" (Anforderung 2.7/2.8) nach
// public/, damit er als statisches Asset unter einer festen URL ausgeliefert
// wird - bewusst kein bundler-spezifischer Worker-Import (new URL(...,
// import.meta.url)), der je nach Turbopack-/Webpack-Konfiguration
// unterschiedlich funktioniert. Laeuft als "postinstall", damit die Datei
// sowohl lokal als auch in CI/Vercel nach jedem "npm install" vorhanden ist -
// nicht eingecheckt, sonst veraltet die Kopie bei einem Versions-Update von
// "qr-scanner" stillschweigend.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projektwurzel = dirname(dirname(fileURLToPath(import.meta.url)));
const quelle = join(projektwurzel, "node_modules", "qr-scanner", "qr-scanner-worker.min.js");
const ziel = join(projektwurzel, "public", "qr-scanner-worker.min.js");

if (!existsSync(quelle)) {
  // Kein Abbruch: ein Produktions-Build ohne devDependencies o. Ae. soll
  // nicht an einer fehlenden, fuer den eigentlichen Build unwichtigen Datei
  // scheitern - die Kamera-Scan-Funktion faellt dann lediglich clientseitig
  // auf eine Fehlermeldung zurueck (siehe ausweis-scan.tsx).
  console.warn("[damicon] qr-scanner nicht gefunden, ueberspringe Worker-Kopie.");
  process.exit(0);
}

mkdirSync(dirname(ziel), { recursive: true });
copyFileSync(quelle, ziel);
console.log("[damicon] qr-scanner-worker.min.js nach public/ kopiert.");
