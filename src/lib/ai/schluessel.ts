import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Verschluesselung der KI-Anbieter-API-Keys (Anforderung 5.4/5.5). Bewusst
// nicht in der Datenbank (pgp_sym_encrypt) - siehe Migrationskommentar in
// 20260930000000_ki_assistent.sql. AES-256-GCM mit Node-crypto, Schluessel aus
// der Umgebungsvariable KI_ANBIETER_SCHLUESSEL (ein beliebig langer, geheimer
// Text, nie im Repository, nie an den Client). Faellt fail-fast wie
// createClient() in supabase/server.ts - aber erst beim tatsaechlichen
// Ver-/Entschluesseln, nicht beim Import, damit Seiten ohne KI-Assistent-
// Nutzung nicht an einer fehlenden Variable scheitern.
//
// Bewusst ohne "server-only"-Import (anders als qr.ts): dieses Modul wird
// ausschliesslich aus 'use server'-Dateien heraus aufgerufen
// (actions/ki-anbieter.ts, actions/ki-assistent.ts), die Next.js ohnehin nie
// in ein Client-Bundle aufnimmt - dasselbe Vertrauen wie bei
// supabase/server.ts (Service-Role-Key) und auth.ts, die aus demselben Grund
// ebenfalls ohne das Marker-Paket auskommen. Ohne den Marker bleibt die
// Ver-/Entschluesselung mit echtem node:crypto per Node direkt testbar (siehe
// supabase/tests/ki-assistent.mjs) - mit "server-only" wirft schon der reine
// Import ausserhalb einer Server-Component-Bundlerumgebung.

const ALGORITHMUS = "aes-256-gcm";
const IV_LAENGE = 12;

function ableitenSchluessel(): Buffer {
  const geheimnis = process.env.KI_ANBIETER_SCHLUESSEL;
  if (!geheimnis) {
    throw new Error("KI_ANBIETER_SCHLUESSEL fehlt in der Umgebung.");
  }
  // sha256 statt den Rohtext direkt zu verwenden: garantiert die von
  // AES-256 verlangten 32 Byte, unabhaengig von der Laenge des gewaehlten
  // Geheimnisses.
  return createHash("sha256").update(geheimnis).digest();
}

/** Chiffrat als Base64: IV (12 Byte) + Ciphertext + AuthTag (16 Byte). */
export function verschluessleApiKey(klartext: string): string {
  const schluessel = ableitenSchluessel();
  const iv = randomBytes(IV_LAENGE);
  const cipher = createCipheriv(ALGORITHMUS, schluessel, iv);
  const ciphertext = Buffer.concat([cipher.update(klartext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

/** Wirft bei falschem Schluessel oder manipuliertem/beschaedigtem Chiffrat
 *  (AES-GCM prueft die Unversehrtheit selbst) - der Aufrufer faengt das als
 *  Teil des ohnehin vorhandenen Fallback-Pfads ab, siehe
 *  actions/ki-assistent.ts. */
export function entschluessleApiKey(chiffratBase64: string): string {
  const schluessel = ableitenSchluessel();
  const roh = Buffer.from(chiffratBase64, "base64");
  const AUTH_TAG_LAENGE = 16;
  if (roh.length <= IV_LAENGE + AUTH_TAG_LAENGE) {
    throw new Error("Chiffrat zu kurz.");
  }
  const iv = roh.subarray(0, IV_LAENGE);
  const authTag = roh.subarray(roh.length - AUTH_TAG_LAENGE);
  const ciphertext = roh.subarray(IV_LAENGE, roh.length - AUTH_TAG_LAENGE);

  const decipher = createDecipheriv(ALGORITHMUS, schluessel, iv);
  decipher.setAuthTag(authTag);
  const klartext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return klartext.toString("utf8");
}
