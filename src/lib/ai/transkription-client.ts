// Spracherkennung ueber die Sokrates-API (OpenAI-kompatibler
// /audio/transcriptions-Endpunkt, multipart). Getrennt
// von anbieter-client.ts, weil es ein anderer Dienst mit anderem
// Anfrageformat ist: multipart statt JSON, Datei statt Nachrichtenverlauf.
//
// Vorher lief das ueber Caesar im Buero-LAN. Daran scheiterte es in
// Produktion: eine Vercel-Funktion erreicht keine LAN-Adresse, und ein
// Cloudflare-Tunnel davor kam nicht zustande (kein Dashboard-Zugang).
// KI_TRANSKRIPTION_URL biegt den Aufruf weiterhin auf Caesar zurueck, wer im
// LAN sitzt.
// Gemeinsam ist beiden die Regel - der Browser spricht nie selbst mit dem
// Dienst, der Aufruf laeuft ueber eine Server Action.
//
// Wie sendeChatAnfrage() wirft diese Funktion NIE: jeder Fehlerpfad endet in
// { ok: false }, der Aufrufer zeigt eine Meldung statt eines Fehlerbildschirms.

export type TranskriptionAntwort = { ok: true; text: string } | { ok: false; grund: string };

/** Basis der Sokrates-API - dieselbe wie in sprachausgabe-client.ts, dort
 *  bewusst noch einmal geschrieben statt importiert: diese beiden Dateien
 *  pruefen die Tests mit blossem Node, und der @/-Alias loest sich dabei nur
 *  fuer Typ-Importe auf, die der Compiler ohnehin entfernt. */
const SOKRATES_BASIS = "https://sokrates.test-qualitaetsmanagement.com/api/v1";

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
  return process.env.KI_TRANSKRIPTION_URL ?? `${SOKRATES_BASIS}/audio/transcriptions`;
}

// Zugang zum Sprachdienst - dieselbe Regel und dieselben Variablen wie
// sprachausgabeZugangsHeader() in sprachausgabe-client.ts, denn Ein- und
// Ausgabe sind EIN Dienst hinter EINEM Zugang:
//
//   1. Sokrates (Regelfall): Bearer-Token aus KI_SOKRATES_API_SCHLUESSEL.
//   2. Cloudflare Access (Caesar im LAN, falls der Tunnel doch noch kommt):
//      das Paar KI_TRANSKRIPTION_ACCESS_*. Der Bearer-Schluessel hat Vorrang.
//   3. Keins von beidem: ohne Kopfzeilen (Caesar direkt im LAN).
//
// Beim Access-Paar weiterhin: nur einer der beiden Werte -> Fehler, es wird
// gar keine Anfrage gesendet - lieber eine klare Meldung als ein Aufruf, der
// ohne Token an der Anmeldeseite landet.
export function transkriptionZugangsHeader():
  | { ok: true; headers: Record<string, string> }
  | { ok: false; grund: string } {
  const schluessel = process.env.KI_SOKRATES_API_SCHLUESSEL?.trim();
  if (schluessel) return { ok: true, headers: { Authorization: `Bearer ${schluessel}` } };

  const id = process.env.KI_TRANSKRIPTION_ACCESS_ID?.trim();
  const geheimnis = process.env.KI_TRANSKRIPTION_ACCESS_SECRET?.trim();
  if (!id && !geheimnis) return { ok: true, headers: {} };
  if (!id || !geheimnis) {
    return {
      ok: false,
      grund: "zugang-unvollständig: KI_TRANSKRIPTION_ACCESS_ID und KI_TRANSKRIPTION_ACCESS_SECRET nur zusammen setzen",
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

// "whisper-1" ist der Wert, den Caesar erwartet (18.09.2026 geprueft: ein
// unbekannter Wert quittiert dort mit HTTP 500). Sokrates braucht das Feld
// nicht, nimmt es aber widerspruchslos entgegen - am 20.09.2026 mit und ohne
// Feld geprueft, beide Male dasselbe Ergebnis. Es bleibt deshalb stehen: so
// funktioniert derselbe Code gegen beide Dienste.
const MODELL = "whisper-1";

/** Sprachen, fuer die der Dienst Spracherkennung anbietet - dieselben vier,
 *  die die Anwendung ueberhaupt kennt. Ohne Angabe erkennt der Dienst die
 *  Sprache selbst; ein unbekannter Wert wird still verworfen. */
export const transkriptionSprachen = ["de", "en", "ru", "kk"] as const;

/** Sprache der Aufnahme, in dieser Reihenfolge:
 *   1. was die Oberflaeche mitgibt (die Sprache, in der die Person gerade
 *      arbeitet) - hilft vor allem bei Kasachisch, das sich die Schrift mit
 *      Russisch teilt und sonst leicht als Russisch durchgeht,
 *   2. KI_TRANSKRIPTION_SPRACHE, falls jemand es erzwingen will,
 *   3. gar nichts: der Dienst erkennt die Sprache selbst.
 *  Unbekannte Werte werden still verworfen statt mitgeschickt. */
function sprache(vorgabe?: string): string | null {
  const erlaubt = (wert: string | undefined) =>
    wert && (transkriptionSprachen as readonly string[]).includes(wert) ? wert : null;
  return erlaubt(vorgabe?.trim()) ?? erlaubt(process.env.KI_TRANSKRIPTION_SPRACHE?.trim());
}

export async function transkribiereAudio(
  datei: Blob,
  dateiname: string,
  sprachVorgabe?: string,
): Promise<TranskriptionAntwort> {
  const zugang = transkriptionZugangsHeader();
  if (!zugang.ok) return zugang;

  const koerper = new FormData();
  koerper.append("file", datei, dateiname);
  koerper.append("model", MODELL);
  const gewaehlteSprache = sprache(sprachVorgabe);
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
          grund: `zugang-abgewiesen (http-${antwort.status}) - KI_SOKRATES_API_SCHLUESSEL bzw. KI_TRANSKRIPTION_ACCESS_ID/-SECRET prüfen`,
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
