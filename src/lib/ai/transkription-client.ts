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
// kalt, danach 7,2 s fuer dieselbe Datei.
//
// Das Zeitlimit stand frueher auf 300 s - ein Wert, den es in Produktion nie
// geben konnte: Vercel beendet die Funktion nach 60 s (dieselbe Grenze, die
// die Routen als maxDuration = 60 setzen). Die Aufnahme lief also in den
// Abbruch der Plattform statt in unseren, ohne verwertbare Meldung. 55 s
// liegen knapp darunter: so kommt die Meldung von uns.
//
// Ein KALTER Caesar passt in kein Zeitlimit dieser Art - 221 s sind auf
// Vercel in einer Anfrage nicht zu holen. Dagegen hilft allein das
// Vorwaermen beim Oeffnen des Moduls (waermeSpracherkennungVor()); laeuft es
// doch einmal in die Grenze, sagt die Meldung genau das und bittet um einen
// zweiten Versuch. Wer selbst hostet und keine 60-s-Grenze hat, hebt das
// Limit ueber KI_TRANSKRIPTION_ZEITLIMIT_MS an.
const STANDARD_ZEITLIMIT_MS = 55_000;

export function transkriptionZeitlimitMs(): number {
  const wert = Number(process.env.KI_TRANSKRIPTION_ZEITLIMIT_MS);
  return Number.isFinite(wert) && wert >= 5_000 && wert <= 900_000 ? wert : STANDARD_ZEITLIMIT_MS;
}

export function transkriptionBasisUrl(): string {
  return process.env.KI_TRANSKRIPTION_URL ?? "http://192.168.178.64:8787/v1/audio/transcriptions";
}

// Cloudflare Access (Service Token) - dieselbe Regel und dieselben Variablen
// wie sprachausgabeZugangsHeader() in sprachausgabe-client.ts: Ein- und
// Ausgabe sind EIN Sprachdienst auf Caesar, hinter demselben Tunnel und
// demselben Token.
//
// In Produktion zeigt KI_TRANSKRIPTION_URL auf den oeffentlichen Hostnamen des
// Tunnels vor Caesar, inklusive Pfad /v1/audio/transcriptions. Beide Werte
// gesetzt: Header mitschicken. Keiner: ohne Header (lokal im Buero-LAN).
// Nur einer: Fehler, es wird gar keine Anfrage gesendet - lieber eine klare
// Meldung als ein Aufruf, der ohne Token an der Anmeldeseite landet.
export function transkriptionZugangsHeader():
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

/** Der Grund aus transkribiereAudio() als Uebersetzungsschluessel unterhalb
 *  von "aktionen" - hier und nicht in der Server Action, damit der Test ihn
 *  ohne Next-Laufzeit pruefen kann ("use server" laesst nur async-Exporte zu).
 *
 *  Der Unterschied ist keine Feinheit: "Spracherkennung nicht moeglich" liest
 *  sich wie ein Vorwurf an die Aufnahme ("zu leise?", "falsch gesprochen?"),
 *  obwohl Mikrofon, Browser und Aufnahme in Ordnung waren und allein der
 *  Dienst dahinter fehlte. Genau so ist die Meldung am 20.09.2026 in
 *  Produktion gelesen worden. Deshalb drei getrennte Faelle:
 *
 *    - Dienst nicht erreichbar / Zugang abgewiesen / 5xx -> es liegt am
 *      Dienst (fehlende KI_TRANSKRIPTION_URL, Tunnel aus, Token falsch),
 *    - Zeitueberschreitung -> der Dienst startet vermutlich gerade
 *      (Caesar kalt: 221 s gemessen), ein zweiter Versuch hilft,
 *    - alles andere -> die Erkennung selbst lieferte nichts Brauchbares. */
export function transkriptionsMeldung(grund: string): string {
  if (grund === "zeitueberschreitung") return "fehler.transkriptionDauer";
  if (/^(dienst-nicht-erreichbar|zugang-|http-5)/.test(grund)) return "fehler.transkriptionDienst";
  return "fehler.transkription";
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
  const zugang = transkriptionZugangsHeader();
  if (!zugang.ok) return zugang;

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
      // Kein content-type setzen: fetch bildet ihn fuer FormData selbst,
      // samt multipart-Grenze.
      headers: zugang.headers,
      body: koerper,
      signal: controller.signal,
      // Eine Abweisung durch Cloudflare Access (Umleitung auf die
      // Anmeldeseite) soll als solche sichtbar bleiben, statt als HTML-Seite
      // im JSON-Parser zu landen.
      redirect: "manual",
    });

    if (!antwort.ok) {
      if ([301, 302, 303, 307, 308, 401, 403].includes(antwort.status)) {
        return {
          ok: false,
          grund: `zugang-abgewiesen (http-${antwort.status}) - Cloudflare Access? KI_TRANSKRIPTION_ACCESS_ID/-SECRET pruefen`,
        };
      }
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
    // Ein geworfener fetch heisst: der Dienst war nicht zu erreichen (kein
    // DNS, kein Netzweg, Verbindung abgewiesen). In Produktion ist das der
    // haeufigste Fall, solange KI_TRANSKRIPTION_URL fehlt und der Aufruf auf
    // die LAN-Adresse faellt, die von aussen niemand erreicht. Der feste
    // Vorsatz macht ihn fuer die Server Action unterscheidbar - die
    // Nutzerin soll lesen, dass der DIENST klemmt, nicht ihre Aufnahme.
    const grund = error instanceof Error ? error.message : String(error);
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : `dienst-nicht-erreichbar: ${grund}` };
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
