// Spracherkennung ueber Caesar, den Transkriptionsdienst im Buero-LAN
// (OpenAI-kompatibler /v1/audio/transcriptions-Endpunkt, FastAPI). Getrennt
// von anbieter-client.ts, weil es ein anderer Dienst mit anderem
// Anfrageformat ist: multipart statt JSON, Datei statt Nachrichtenverlauf.
// Gemeinsam ist beiden die Regel - der Browser spricht nie selbst mit dem
// Dienst, der Aufruf laeuft ueber eine Server Action.
//
// Wie sendeChatAnfrage() wirft diese Funktion NIE: jeder Fehlerpfad endet in
// { ok: false }, der Aufrufer zeigt eine Meldung statt eines Fehlerbildschirms.

export type TranskriptionAntwort = { ok: true; text: string } | { ok: false; grund: string };

// Caesar laedt sein Modell beim ersten Aufruf: am 18.09.2026 gemessen 221 s
// kalt, danach 7,2 s fuer dieselbe Datei. Deshalb ein eigenes, grosszuegiges
// Zeitlimit - nicht das der Chat-Anfrage, das einen anderen Dienst meint.
// Die Oberflaeche waermt Caesar beim Oeffnen des Moduls vor, damit dieser
// Fall im Alltag gar nicht erst eintritt.
const STANDARD_ZEITLIMIT_MS = 300_000;

export function transkriptionZeitlimitMs(): number {
  const wert = Number(process.env.KI_TRANSKRIPTION_ZEITLIMIT_MS);
  return Number.isFinite(wert) && wert >= 5_000 && wert <= 900_000 ? wert : STANDARD_ZEITLIMIT_MS;
}

export function transkriptionBasisUrl(): string {
  return process.env.KI_TRANSKRIPTION_URL ?? "http://192.168.178.64:8787/v1/audio/transcriptions";
}

// "whisper-1" ist der Wert, den der Dienst erwartet - am 18.09.2026 gegen
// Caesar geprueft: mit whisper-1 kommt HTTP 200, das Feld ist laut
// /openapi.json optional (string | null), ein unbekannter Wert quittiert
// allerdings mit HTTP 500 statt einer Feldpruefung. Deshalb steht er hier
// fest und ist nicht frei konfigurierbar.
const MODELL = "whisper-1";

/** Sprache bewusst nicht gesetzt: die Kundschaft schreibt deutsch und
 *  russisch, Whisper erkennt das selbst zuverlaessiger als eine feste
 *  Vorgabe. Ueber KI_TRANSKRIPTION_SPRACHE laesst sich das erzwingen. */
function sprache(): string | null {
  const wert = process.env.KI_TRANSKRIPTION_SPRACHE?.trim();
  return wert ? wert : null;
}

export async function transkribiereAudio(datei: Blob, dateiname: string): Promise<TranskriptionAntwort> {
  const koerper = new FormData();
  koerper.append("file", datei, dateiname);
  koerper.append("model", MODELL);
  const gewaehlteSprache = sprache();
  if (gewaehlteSprache) koerper.append("language", gewaehlteSprache);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), transkriptionZeitlimitMs());

  try {
    const antwort = await fetch(transkriptionBasisUrl(), {
      method: "POST",
      body: koerper,
      signal: controller.signal,
    });

    if (!antwort.ok) {
      // Caesar antwortet bei einem unbekannten Modell mit einem nackten
      // "Internal Server Error" ohne JSON - deshalb hier kein .json().
      const auszug = await antwort.text().catch(() => "");
      return { ok: false, grund: `http-${antwort.status}: ${auszug.slice(0, 200)}` };
    }

    const json = (await antwort.json().catch(() => null)) as { text?: unknown } | null;
    const text = typeof json?.text === "string" ? json.text.trim() : "";
    if (!text) return { ok: false, grund: "antwort-unerwartete-form" };
    return { ok: true, text };
  } catch (error) {
    const grund = error instanceof Error ? error.message : String(error);
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : grund };
  } finally {
    clearTimeout(timeout);
  }
}

/** Kurzer Anstoss, damit Caesar sein Modell laedt, bevor jemand aufnimmt.
 *  Eine Sekunde Stille genuegt - das Ergebnis interessiert nicht, nur der
 *  Nebeneffekt. Fehler bleiben still: ein missglueckter Aufwaermversuch darf
 *  das Oeffnen des Moduls nicht stoeren. */
export async function waermeTranskriptionVor(): Promise<boolean> {
  const stille = stilleWav();
  const antwort = await transkribiereAudio(new Blob([stille], { type: "audio/wav" }), "aufwaermen.wav");
  return antwort.ok;
}

/** Eine Sekunde Stille als WAV, ohne Datei auf der Platte. */
function stilleWav(): ArrayBuffer {
  const rate = 16_000;
  const daten = new Uint8Array(rate * 2);
  const kopf = new Uint8Array(44);
  const sicht = new DataView(kopf.buffer);
  const schreibe = (pos: number, text: string) => {
    for (let i = 0; i < text.length; i++) kopf[pos + i] = text.charCodeAt(i);
  };
  schreibe(0, "RIFF");
  sicht.setUint32(4, 36 + daten.length, true);
  schreibe(8, "WAVE");
  schreibe(12, "fmt ");
  sicht.setUint32(16, 16, true);
  sicht.setUint16(20, 1, true);
  sicht.setUint16(22, 1, true);
  sicht.setUint32(24, rate, true);
  sicht.setUint32(28, rate * 2, true);
  sicht.setUint16(32, 2, true);
  sicht.setUint16(34, 16, true);
  schreibe(36, "data");
  sicht.setUint32(40, daten.length, true);

  const alles = new Uint8Array(new ArrayBuffer(kopf.length + daten.length));
  alles.set(kopf, 0);
  alles.set(daten, kopf.length);
  return alles.buffer as ArrayBuffer;
}
