// Spracherkennung ueber Soniox (Datei-Weg, kein Livestream).
//
// Gegenstueck zu transkription-client.ts, das denselben Vertrag erfuellt:
// diese Funktion wirft NIE, jeder Fehlerpfad endet in { ok: false }. Der
// Aufrufer faellt dann auf Whisper zurueck (actions/ki-assistent.ts) - eine
// Stoerung bei Soniox darf niemandem das Diktat nehmen.
//
// Der Ablauf sind vier Aufrufe: Datei hochladen, Auftrag starten, auf das
// Ergebnis warten, Text holen. Danach werden Auftrag UND Datei wieder
// geloescht: Soniox behaelt hochgeladene Dateien sonst 30 Tage, und das sind
// Stimmen von Mitarbeitenden. Das Loeschen laeuft auch dann, wenn zwischendrin
// etwas schiefgegangen ist.
//
// Gemessen am 21.09.2026 gegen unsere eigenen Aufnahmen: 1,4-3,4 s je Datei.

export type SonioxAntwort =
  /** `sprachen` sind die Sprachen der einzelnen Token. Sie gehen weiter an
   *  die Antwortsprache (domain/antwortsprache.ts): wer diktiert, soll eine
   *  Antwort in der Sprache bekommen, in der er gesprochen hat - nach dem,
   *  was der Dienst GEHOERT hat, nicht nach dem, was aus dem erkannten Text
   *  zu erraten waere. Genau daran ist Kasachisch gescheitert. */
  | { ok: true; text: string; sprachen: string[] }
  | { ok: false; grund: string };

const MODELL = "stt-async-v5";

/** Abstand zwischen zwei Nachfragen, ob der Auftrag fertig ist. */
const ABFRAGE_ABSTAND_MS = 250;

// Zeitbudget (22.09.2026, zweite Fassung): Soniox darf bis 20 s brauchen.
// Das ist kein Warten auf gut Glueck - ab 6 s laeuft Whisper parallel mit
// (spracherkennung.ts), der erste brauchbare Text gewinnt. Vorher standen
// hier 8 s; an echten 10-Sekunden-Aufnahmen lief das reihenweise in die
// Grenze, danach Whisper ebenfalls, und nach 20,3 s stand kein Text da.
export const SONIOX_ZEITLIMIT_STANDARD_MS = 20_000;

/** Welcher Dienst die Spracherkennung macht. Standard ist "whisper" - solange
 *  niemand KI_SPRACHERKENNUNG_ANBIETER=soniox setzt, aendert sich nichts. */
export function spracherkennungAnbieter(): "whisper" | "soniox" {
  return process.env.KI_SPRACHERKENNUNG_ANBIETER?.trim().toLowerCase() === "soniox" ? "soniox" : "whisper";
}

/** Wo verarbeitet wird. Bewusst OHNE Voreinstellung im Code: der Datenstandort
 *  ist eine Entscheidung des Betriebs, keine des Programmierers - und er
 *  wandert (Demo: US, Pilot: EU, beim Kunden: Kasachstan). Fehlt
 *  SONIOX_API_URL, laeuft Soniox gar nicht erst an und Whisper uebernimmt.
 *  Siehe docs/infra/spracherkennung-anbieter.md. */
export function sonioxBasisUrl(): string | null {
  const wert = process.env.SONIOX_API_URL?.trim();
  return wert ? wert.replace(/\/+$/, "") : null;
}

export function sonioxZeitlimitMs(): number {
  const wert = Number(process.env.SONIOX_ZEITLIMIT_MS);
  return Number.isFinite(wert) && wert >= 2_000 && wert <= 20_000 ? wert : SONIOX_ZEITLIMIT_STANDARD_MS;
}

function schluessel(): string | null {
  return process.env.SONIOX_API_KEY?.trim() || null;
}

/** Raeumt hinter uns auf. Fehler hier sind nicht schlimm genug, um das
 *  Ergebnis zu verwerfen - aber sie muessen sichtbar sein, sonst sammeln sich
 *  unbemerkt Aufnahmen beim Dienstleister. */
async function aufraeumen(basis: string, kopf: HeadersInit, auftragId: string | null, dateiId: string | null): Promise<void> {
  for (const [was, pfad] of [
    ["Auftrag", auftragId ? `/v1/transcriptions/${auftragId}` : null],
    ["Datei", dateiId ? `/v1/files/${dateiId}` : null],
  ] as const) {
    if (!pfad) continue;
    try {
      const antwort = await fetch(`${basis}${pfad}`, { method: "DELETE", headers: kopf });
      if (!antwort.ok) console.error(`[damicon] Soniox: ${was} nicht geloescht (http-${antwort.status})`);
    } catch (fehler) {
      console.error(`[damicon] Soniox: ${was} nicht geloescht:`, fehler instanceof Error ? fehler.message : String(fehler));
    }
  }
}

/** Sprachen, fuer die ein Hinweis mitgeht - dieselben vier, die die
 *  Oberflaeche kennt. Alles andere wird still verworfen. */
const HINWEIS_SPRACHEN = ["de", "en", "ru", "kk"];

/** language_hints als Liste von ISO-Codes.
 *
 *  Anders als bei Whisper ist der Hinweis hier ungefaehrlich: Soniox
 *  BESCHRAENKT damit nicht, sondern gewichtet nur - "Language hints do not
 *  restrict recognition to those languages - they only bias the model toward
 *  them" (https://soniox.com/docs/stt/concepts/language-hints). Dieselbe Seite
 *  empfiehlt ihn ausdruecklich, wenn die erwartete Sprache bekannt ist, und
 *  die Oberflaechensprache ist genau das.
 *
 *  Bei kk und ru gehen seit 24.09.2026 BEIDE Sprachen mit: in Kasachstan wird
 *  zwischen ihnen gewechselt, oft im selben Satz, und sie teilen sich die
 *  Schrift. Dieselbe Regel wie sprachHinweise() in domain/diktat-live.ts
 *  (Live-Weg) - hier noch einmal geschrieben, weil diese Datei mit blossem
 *  Node getestet wird und keine Laufzeit-Importe hat; der Test prueft, dass
 *  beide gleich antworten. */
function sprachHinweis(sprache?: string): { language_hints?: string[] } {
  const wert = sprache?.trim().toLowerCase();
  if (!wert || !HINWEIS_SPRACHEN.includes(wert)) return {};
  if (wert === "kk") return { language_hints: ["kk", "ru"] };
  if (wert === "ru") return { language_hints: ["ru", "kk"] };
  return { language_hints: [wert] };
}

/** Zusatzangaben fuer die Erkennung. `kontext` ist das Soniox-Feld context
 *  (general, terms) - Fachwoerter und Thema, siehe diktatKontext() in
 *  domain/diktat-live.ts. Ohne ihn verhoert das Modell Eigennamen wie "Himbi"
 *  oder "ЕСУТД". `imHintergrund` nimmt das Aufraeumen beim Dienstleister aus
 *  dem Weg der Antwort (Next: after()); ohne wird es abgewartet. */
export interface SonioxOptionen {
  kontext?: { general?: Array<{ key: string; value: string }>; terms?: string[] };
  imHintergrund?: (arbeit: Promise<void>) => void;
}

/** Modell stt-async-v5: laut Modelltabelle der aktuelle Async-Stand
 *  (https://soniox.com/docs/stt/models, "Active"; stt-async-v4 zeigt darauf). */
export async function transkribiereMitSoniox(
  datei: Blob,
  dateiname: string,
  sprache?: string,
  /** Von aussen abbrechen - siehe transkribiereAudio(). Aufgeraeumt wird
   *  trotzdem: die Aufnahme darf nicht beim Dienstleister liegen bleiben. */
  abbruch?: AbortSignal,
  optionen: SonioxOptionen = {},
): Promise<SonioxAntwort> {
  const key = schluessel();
  if (!key) return { ok: false, grund: "kein-schluessel" };

  const basis = sonioxBasisUrl();
  if (!basis) return { ok: false, grund: "keine-basis-url" };

  const kopf = { Authorization: `Bearer ${key}` };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sonioxZeitlimitMs());
  const signal = abbruch ? AbortSignal.any([controller.signal, abbruch]) : controller.signal;
  let dateiId: string | null = null;
  let auftragId: string | null = null;

  try {
    const form = new FormData();
    form.append("file", datei, dateiname);
    const hochgeladen = await fetch(`${basis}/v1/files`, { method: "POST", headers: kopf, body: form, signal });
    if (!hochgeladen.ok) return { ok: false, grund: await grundAusAntwort("upload", hochgeladen) };
    dateiId = ((await hochgeladen.json()) as { id?: string }).id ?? null;
    if (!dateiId) return { ok: false, grund: "upload-ohne-id" };

    const gestartet = await fetch(`${basis}/v1/transcriptions`, {
      method: "POST",
      headers: { ...kopf, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELL,
        file_id: dateiId,
        // Ohne dieses Feld traegt kein Token eine Sprache
        // (https://soniox.com/docs/stt/concepts/language-identification).
        enable_language_identification: true,
        ...sprachHinweis(sprache),
        ...(optionen.kontext ? { context: optionen.kontext } : {}),
      }),
      signal,
    });
    if (!gestartet.ok) return { ok: false, grund: await grundAusAntwort("auftrag", gestartet) };
    auftragId = ((await gestartet.json()) as { id?: string }).id ?? null;
    if (!auftragId) return { ok: false, grund: "auftrag-ohne-id" };

    // Warten, bis der Auftrag fertig ist. Im Regelfall beendet das Zeitlimit
    // oben die Schleife ueber das Abbruchsignal; die Rundenzahl ist der Gurt
    // darueber, falls ein fetch das Signal einmal nicht beachtet - ewig
    // drehen darf diese Funktion unter keinen Umstaenden.
    const hoechsteRunden = Math.ceil(sonioxZeitlimitMs() / ABFRAGE_ABSTAND_MS) + 5;
    for (let runde = 0; ; runde++) {
      if (runde > hoechsteRunden) return { ok: false, grund: "zeitueberschreitung" };
      const stand = await fetch(`${basis}/v1/transcriptions/${auftragId}`, { headers: kopf, signal });
      if (!stand.ok) return { ok: false, grund: await grundAusAntwort("status", stand) };
      const j = (await stand.json()) as { status?: string; error_message?: string };
      if (j.status === "completed") break;
      if (j.status === "error") return { ok: false, grund: `auftrag-fehler: ${j.error_message ?? "ohne Angabe"}` };
      await new Promise((r) => setTimeout(r, ABFRAGE_ABSTAND_MS));
    }

    const ergebnis = await fetch(`${basis}/v1/transcriptions/${auftragId}/transcript`, { headers: kopf, signal });
    if (!ergebnis.ok) return { ok: false, grund: await grundAusAntwort("transcript", ergebnis) };
    const j = (await ergebnis.json()) as { text?: unknown; tokens?: unknown };
    if (typeof j.text !== "string") return { ok: false, grund: "antwort-unerwartete-form" };
    const text = j.text.trim();
    // Der Dienst lief und hat NICHTS gehoert (Stille, Raeuspern, Laerm). Das
    // ist ein Ergebnis, kein Ausfall: "leer" laesst spracherkennung.ts nicht
    // auf Whisper zurueckfallen - Whisper erfindet auf Stille gern Saetze
    // ("Untertitel der Amara.org-Gemeinschaft"), und der erfundene Satz
    // gewann bisher, weil der erste Text zaehlt.
    if (!text) return { ok: false, grund: "leer" };
    const sprachen = Array.isArray(j.tokens)
      ? (j.tokens as Array<{ language?: unknown }>)
          .map((t) => t?.language)
          .filter((x): x is string => typeof x === "string")
      : [];
    return { ok: true, text, sprachen };
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    if (abbruch?.aborted) return { ok: false, grund: "abgebrochen" };
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : `dienst-nicht-erreichbar: ${grund}` };
  } finally {
    clearTimeout(timeout);
    // Aufraeumen ohne das Abbruchsignal: es ist an dieser Stelle womoeglich
    // schon ausgeloest, und die Aufnahme soll trotzdem weg. Mit
    // imHintergrund laeuft es nach der Antwort weiter (zwei DELETE weniger
    // Wartezeit je Diktat), geloescht wird trotzdem.
    const arbeit = aufraeumen(basis, kopf, auftragId, dateiId);
    if (optionen.imHintergrund) optionen.imHintergrund(arbeit);
    else await arbeit;
  }
}

/** Fehlertext des Dienstes, gekuerzt - nie der Schluessel, der steht nur im
 *  Kopf der Anfrage und nie im Text der Antwort. */
async function grundAusAntwort(schritt: string, antwort: Response): Promise<string> {
  if (antwort.status === 401 || antwort.status === 403) return `zugang-abgewiesen (http-${antwort.status}) - SONIOX_API_KEY pruefen`;
  const auszug = await antwort.text().catch(() => "");
  return `${schritt}-http-${antwort.status}: ${auszug.slice(0, 160)}`;
}

// --- Kurzzeitschluessel fuer den Browser ---------------------------------------
//
// Live-Diktat und Live-Vorlesen verbinden den Browser DIREKT mit Soniox
// (WebSocket bzw. HTTP-Stream) - eine Vercel-Funktion kann keine offene
// Verbindung halten. Damit der echte Schluessel trotzdem nie den Server
// verlaesst, stellt der Server je Aufnahme einen kurzlebigen aus:
// POST /v1/auth/temporary-api-key (github.com/soniox/soniox-js,
// packages/node/src/async/auth.ts). Er gilt nur fuer einen Zweck, nur einmal
// und nur kurz.

export type SonioxSchluesselZweck = "transcribe_websocket" | "tts_rt";

export type SonioxSchluesselAntwort = { ok: true; schluessel: string; ablauf: string } | { ok: false; grund: string };

/** Wirft nie. `referenz` landet bei Soniox als client_reference_id - nur eine
 *  pseudonyme Kennung, nie ein Name oder eine Adresse. */
export async function holeSonioxSchluessel(
  zweck: SonioxSchluesselZweck,
  { gueltigS, sitzungS, referenz }: { gueltigS: number; sitzungS: number; referenz?: string },
): Promise<SonioxSchluesselAntwort> {
  const key = schluessel();
  if (!key) return { ok: false, grund: "kein-schluessel" };
  const basis = sonioxBasisUrl();
  if (!basis) return { ok: false, grund: "keine-basis-url" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const antwort = await fetch(`${basis}/v1/auth/temporary-api-key`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        usage_type: zweck,
        expires_in_seconds: Math.min(3600, Math.max(1, Math.round(gueltigS))),
        single_use: true,
        max_session_duration_seconds: Math.min(18_000, Math.max(1, Math.round(sitzungS))),
        ...(referenz ? { client_reference_id: referenz.slice(0, 256) } : {}),
      }),
      signal: controller.signal,
    });
    if (!antwort.ok) return { ok: false, grund: await grundAusAntwort("schluessel", antwort) };
    const j = (await antwort.json().catch(() => null)) as { api_key?: unknown; expires_at?: unknown } | null;
    if (typeof j?.api_key !== "string" || !j.api_key) return { ok: false, grund: "schluessel-unerwartete-form" };
    return { ok: true, schluessel: j.api_key, ablauf: typeof j.expires_at === "string" ? j.expires_at : "" };
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : `dienst-nicht-erreichbar: ${grund}` };
  } finally {
    clearTimeout(timeout);
  }
}
