// Wer darf sich etwas vorlesen lassen - und was?
//
// Die Live-Sprachausgabe schickt Abschnitte einer laufenden Antwort an den
// Server, damit er sie in Stimme verwandelt. Ohne Schutz waere das ein
// offenes Vorlese-Werkzeug: jeder Angemeldete koennte beliebigen Text
// hineingeben und auf unsere Rechnung erzeugen lassen.
//
// Deshalb wird jeder Abschnitt beim Entstehen signiert und beim Vorlesen
// geprueft. Die Signatur bindet fuenf Dinge zusammen:
//
//   nutzerId | zug | nr | sha256(text) | ablauf
//
// - nutzerId: die Signatur eines anderen nuetzt niemandem.
// - zug und nr: ein Abschnitt laesst sich nicht an eine andere Stelle
//   schieben, und die Reihenfolge bleibt nachvollziehbar.
// - sha256(text): schon ein geaendertes Zeichen macht sie ungueltig. Der
//   Text selbst geht nicht in die Signatur - er kann lang sein.
// - ablauf: nach zehn Minuten ist Schluss. Ein mitgeschnittener Abschnitt
//   ist dann wertlos.
//
// Der Text bleibt trotzdem beliebig - die Signatur sagt nur "das kam von
// uns". Das reicht: erzeugt wird sie ausschliesslich aus dem, was das Modell
// gerade geschrieben hat.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Zehn Minuten. Lang genug fuer eine Antwort samt Vorlesen, kurz genug,
 *  dass ein abgefangener Abschnitt nichts mehr wert ist. */
export const ABSCHNITT_GUELTIG_MS = 10 * 60 * 1000;

export type SignaturAngaben = {
  nutzerId: string;
  zug: string;
  nr: number;
  text: string;
  /** Zeitpunkt in Millisekunden, ab dem die Signatur nicht mehr gilt. */
  ablauf: number;
};

/** Fehlt das Geheimnis, gibt es keine Live-Sprachausgabe - nicht etwa eine
 *  ungeschuetzte. */
export function sprachausgabeGeheimnis(): string | null {
  const wert = process.env.KI_SPRACHAUSGABE_SIGNATUR?.trim();
  return wert && wert.length >= 16 ? wert : null;
}

function nachricht(a: SignaturAngaben): string {
  const abdruck = createHash("sha256").update(a.text, "utf8").digest("hex");
  return [a.nutzerId, a.zug, String(a.nr), abdruck, String(a.ablauf)].join("|");
}

export function signiereAbschnitt(a: SignaturAngaben, geheimnis: string): string {
  return createHmac("sha256", geheimnis).update(nachricht(a), "utf8").digest("hex");
}

export type Pruefung = { ok: true } | { ok: false; grund: string };

/**
 * Prueft einen Abschnitt. Gibt bei jedem Fehlschlag einen Grund zurueck, der
 * ins Protokoll darf - nie den Text und nie die Signatur.
 *
 * @param jetzt Nur fuer den Test; sonst die Uhr.
 */
export function pruefeAbschnitt(
  a: SignaturAngaben & { sig: string },
  geheimnis: string,
  jetzt = Date.now(),
): Pruefung {
  if (!a.sig || typeof a.sig !== "string") return { ok: false, grund: "ohne-signatur" };
  if (!Number.isFinite(a.ablauf)) return { ok: false, grund: "ohne-ablauf" };
  if (a.ablauf <= jetzt) return { ok: false, grund: "abgelaufen" };
  // Eine Signatur, die weiter in der Zukunft liegt als das Fenster, hat sich
  // jemand selbst ausgedacht - oder unsere Uhr geht falsch. Beides ist ein
  // Grund, nicht vorzulesen.
  if (a.ablauf > jetzt + ABSCHNITT_GUELTIG_MS + 60_000) return { ok: false, grund: "ablauf-zu-weit" };

  const erwartet = signiereAbschnitt(a, geheimnis);
  const links = Buffer.from(erwartet, "hex");
  const rechts = Buffer.from(a.sig, "hex");
  // Erst die Laenge, dann zeitgleich vergleichen: sonst verraet die Dauer des
  // Vergleichs, wie viele Zeichen schon stimmen.
  if (links.length !== rechts.length || !timingSafeEqual(links, rechts)) {
    return { ok: false, grund: "signatur-falsch" };
  }
  return { ok: true };
}
