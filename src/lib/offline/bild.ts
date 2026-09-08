"use client";

// Anforderung 2.5, Phase 6: Fotobelege werden vor dem Zwischenspeichern in
// der Offline-Warteschlange verkleinert. Zwei Gruende:
//
// 1. IndexedDB-Speicherplatz auf einem Feldgeraet ist begrenzt, mehrere
//    unkomprimierte Handyfotos (oft 5-15 MB je Bild) fuellen ihn schnell.
// 2. Der Sync-Endpunkt ist ein Next.js Route Handler - Vercels
//    Serverless-Payload-Grenze (~4,5 MB) gilt dort, anders als bei Server
//    Actions (eigene, in next.config.ts hochgesetzte Grenze). Ein
//    Original-Kamerafoto koennte den Sync-Request allein schon sprengen.
//
// Nur der Offline-Pfad verkleinert - der Online-Pfad (BelegUploadFormular
// direkt online) bleibt unveraendert (Server Actions haben ihre eigene,
// grosszuegigere Grenze, siehe next.config.ts).

const MAX_KANTENLAENGE_PX = 1600;
const JPEG_QUALITAET = 0.8;

export async function bildFuerWarteschlangeVerkleinern(datei: File): Promise<Blob> {
  // Kein Canvas/createImageBitmap verfuegbar (z. B. sehr alter Browser) -
  // lieber das Original puffern als den Upload ganz zu verhindern.
  if (typeof createImageBitmap === "undefined" || typeof document === "undefined") {
    return datei;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(datei);
  } catch {
    // Kein gueltiges Bildformat fuer den Browser (z. B. HEIC ohne
    // Decoder-Unterstuetzung) - Original puffern, der Server entscheidet beim
    // Sync ueber Groesse/Format.
    return datei;
  }

  const skala = Math.min(1, MAX_KANTENLAENGE_PX / Math.max(bitmap.width, bitmap.height));
  const breite = Math.max(1, Math.round(bitmap.width * skala));
  const hoehe = Math.max(1, Math.round(bitmap.height * skala));

  const canvas = document.createElement("canvas");
  canvas.width = breite;
  canvas.height = hoehe;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return datei;
  }
  ctx.drawImage(bitmap, 0, 0, breite, hoehe);
  bitmap.close();

  const verkleinert = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITAET),
  );

  // Bei sehr kleinen/einfachen Bildern kann die JPEG-Neukodierung groesser
  // ausfallen als das Original (z. B. ein bereits stark komprimiertes Foto) -
  // dann lieber das Original behalten.
  if (!verkleinert || verkleinert.size >= datei.size) return datei;
  return verkleinert;
}
