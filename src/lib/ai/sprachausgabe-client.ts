// Sprachausgabe (Text-to-Speech) ueber Caesar: speaches mit Piper-Stimmen,
// OpenAI-kompatibler /v1/audio/speech-Endpunkt (Container damicon-tts,
// Host-Port 8789). Gegenstueck zu transkription-client.ts (Spracheingabe) auf
// derselben Maschine - bewusst ebenfalls selbst gehostet statt Cloud.
//
// Wie transkribiereAudio() wirft diese Funktion NIE: jeder Fehlerpfad endet
// in { ok: false }.
import type { Stimme } from "@/lib/domain/sprachausgabe";

export type SprachausgabeAntwort = { ok: true; audio: ArrayBuffer; typ: string } | { ok: false; grund: string };

// Piper antwortet fuer eine Antwort ueblicher Laenge in unter einer Sekunde
// (gemessen auf Caesar, 19.09.2026); 30 s lassen Luft fuer die laengsten
// Antworten (MAX_SPRACHAUSGABE_ZEICHEN) und bleiben unter Cloudflares 100 s.
const STANDARD_ZEITLIMIT_MS = 30_000;

export function sprachausgabeZeitlimitMs(): number {
  const wert = Number(process.env.KI_SPRACHAUSGABE_ZEITLIMIT_MS);
  return Number.isFinite(wert) && wert >= 2_000 && wert <= 90_000 ? wert : STANDARD_ZEITLIMIT_MS;
}

export function sprachausgabeUrl(): string {
  return process.env.KI_SPRACHAUSGABE_URL ?? "http://192.168.178.64:8789/v1/audio/speech";
}

// Cloudflare Access: Ein- und Ausgabe sind EIN Sprachdienst auf Caesar, hinter
// demselben Tunnel und demselben Service Token - deshalb dieselben Variablen
// wie die Transkription (KI_TRANSKRIPTION_ACCESS_*), kein zweites Paar.
// Regel wie dort: beide gesetzt -> Header; keiner -> ohne (lokal im
// Buero-LAN); nur einer -> Fehler, keine Anfrage.
export function sprachausgabeZugangsHeader():
  | { ok: true; headers: Record<string, string> }
  | { ok: false; grund: string } {
  const id = process.env.KI_TRANSKRIPTION_ACCESS_ID?.trim();
  const geheimnis = process.env.KI_TRANSKRIPTION_ACCESS_SECRET?.trim();
  if (!id && !geheimnis) return { ok: true, headers: {} };
  if (!id || !geheimnis) {
    return {
      ok: false,
      grund: "zugang-unvollstaendig: KI_TRANSKRIPTION_ACCESS_ID und KI_TRANSKRIPTION_ACCESS_SECRET nur zusammen setzen",
    };
  }
  return { ok: true, headers: { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": geheimnis } };
}

export function baueSprachausgabeAnfrage(text: string, stimme: Stimme) {
  return JSON.stringify({ model: stimme.modell, voice: stimme.stimme, input: text, response_format: "mp3" });
}

export async function erzeugeSprachausgabe(text: string, stimme: Stimme): Promise<SprachausgabeAntwort> {
  const zugang = sprachausgabeZugangsHeader();
  if (!zugang.ok) return zugang;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sprachausgabeZeitlimitMs());
  try {
    const antwort = await fetch(sprachausgabeUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", ...zugang.headers },
      body: baueSprachausgabeAnfrage(text, stimme),
      signal: controller.signal,
      redirect: "manual",
    });
    if (!antwort.ok) {
      if ([301, 302, 303, 307, 308, 401, 403].includes(antwort.status)) {
        return { ok: false, grund: `zugang-abgewiesen (http-${antwort.status}) - Cloudflare Access? KI_TRANSKRIPTION_ACCESS_ID/-SECRET pruefen` };
      }
      const auszug = await antwort.text().catch(() => "");
      return { ok: false, grund: `http-${antwort.status}: ${auszug.slice(0, 200)}` };
    }
    const typ = antwort.headers.get("content-type") ?? "";
    if (!typ.startsWith("audio/")) return { ok: false, grund: `antwort-unerwartete-form (${typ || "ohne content-type"})` };
    const audio = await antwort.arrayBuffer();
    if (audio.byteLength === 0) return { ok: false, grund: "antwort-leer" };
    return { ok: true, audio, typ };
  } catch (error) {
    const grund = error instanceof Error ? error.message : String(error);
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : grund };
  } finally {
    clearTimeout(timeout);
  }
}
